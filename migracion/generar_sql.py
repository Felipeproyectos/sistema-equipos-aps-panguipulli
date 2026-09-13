"""Genera el esquema Postgres y los INSERT a partir de los .jsonc de Base44 y del backup.

Se regenera, no se edita a mano: si cambia una entidad en Base44, se vuelve a exportar
el .jsonc y el backup y se corre esto de nuevo.

    python migracion/generar_sql.py <backup.json>
"""
import json, re, sys, glob, os, collections

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SALIDA = os.path.join(RAIZ, "migracion")

# ponytail: los ids de Base44 son ObjectId hex (24 chars) y se referencian entre
# entidades por ese string. Se conservan tal cual como PK text en vez de remapear
# a uuid — remapear obligaria a reescribir cada referencia cruzada. Si algun dia
# molesta, se agrega una columna uuid nueva y se migra por partes.
COLS_SISTEMA = [
    ("id",            "text"),
    ("created_date",  "timestamptz"),
    ("updated_date",  "timestamptz"),
    ("created_by_id", "text"),
    ("created_by",    "text"),
    ("is_sample",     "boolean"),
]
# Los tipos de arriba se usan tambien para formatear los valores, asi que van
# puros. Las restricciones se pegan solo al escribir el DDL.
# ponytail: los ids nuevos los pone Postgres, no la app. Conviven uuid-como-texto
# con los ObjectId heredados de Base44 — ambos son texto opaco y nadie los parsea.
RESTRICCIONES = {
    "id": "primary key default gen_random_uuid()::text",
    "created_date": "default now()",
    "is_sample": "default false",
}

# Un trigger por tabla en vez de tocar updated_date en el shim del servidor Y en
# el frontend: la regla vive en un solo lado y no se puede saltar.
TRIGGER = """create or replace function tocar_updated_date() returns trigger
  language plpgsql as $$ begin new.updated_date = now(); return new; end $$;
"""

# Campos que Base44 agrega solo a User y no estan en su .jsonc.
EXTRA_USER = [
    ("email", "text"), ("full_name", "text"),
    ("is_verified", "boolean"),
    ("force_password_reset", "boolean"), ("app_id", "text"),
    ("is_service", "boolean"), ("collaborator_role", "text"),
    ("_app_role", "text"),
]

# Campos que Base44 traia y en Supabase no los escribe ni los lee nadie. El
# .jsonc de origen se deja intacto (es el respaldo de como era el sistema
# viejo), asi que se filtran aca: sin esto, cada regeneracion los devolveria a
# la tabla y volveria a parecer que hay un control de acceso que no existe.
#
#   estado_acceso / intentos_acceso  el "aprobar ingreso" de Base44. Todas las
#                                    fichas quedaron en 'aprobado' y ninguna
#                                    pantalla ni policy los consulta. Quien
#                                    puede entrar lo decide Supabase Auth, y
#                                    que ve, mi_rol() sobre `role`.
#   disabled / disabled_reason       desactivar una cuenta. Nunca se conecto;
#                                    para dar de baja a alguien se le quita la
#                                    cuenta de Auth.
CAMPOS_MUERTOS = {
    "User": {"estado_acceso", "intentos_acceso", "disabled", "disabled_reason"},
}

# Correcciones de datos que se aplican en cada regeneracion. Van aca y no
# editadas a mano en el JSON: el proximo respaldo de Base44 traeria el error
# de vuelta. "Posta Huitar" es un typo de "Posta Huitag" (confirmado por
# Felipe): aparece en 4 User, 3 InspeccionPendiente y 3 Historial, y rompia
# el filtro por subsede para los usuarios de CESFAM Panguipulli.
CORRECCIONES = {
    "Posta Huitar": "Posta Huitag",
}

def corregir(valor):
    """Aplica CORRECCIONES a strings, y dentro de listas/dicts anidados."""
    if isinstance(valor, str):
        for malo, bueno in CORRECCIONES.items():
            valor = valor.replace(malo, bueno)
        return valor
    if isinstance(valor, list):
        return [corregir(v) for v in valor]
    if isinstance(valor, dict):
        return {k: corregir(v) for k, v in valor.items()}
    return valor

def snake(nombre):
    # Dos pasadas para no partir siglas: EquipoDEA -> equipo_dea, no equipo_d_e_a
    s = re.sub(r"(.)([A-Z][a-z]+)", r"\1_\2", nombre)
    return re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", s).lower()

def tabla_de(entidad):
    # "user" es palabra reservada en Postgres
    return "usuario" if entidad == "User" else snake(entidad)

def leer_jsonc(ruta):
    return json.loads(re.sub(r"^\s*//.*$", "", open(ruta, encoding="utf-8").read(), flags=re.M))

def tipo_sql(spec):
    t = spec.get("type")
    if t == "boolean":  return "boolean"
    if t == "number":   return "numeric"
    if t == "array":    return "jsonb"
    if t == "object":   return "jsonb"
    f = spec.get("format")
    if f == "date":      return "date"
    if f == "date-time": return "timestamptz"
    return "text"

def esquemas():
    out = {}
    for ruta in sorted(glob.glob(os.path.join(RAIZ, "base44/entities/*.jsonc"))):
        e = leer_jsonc(ruta)
        out[os.path.splitext(os.path.basename(ruta))[0]] = e
    return out

def cols_de(entidad, e):
    muertos = CAMPOS_MUERTOS.get(entidad, set())
    cols = list(COLS_SISTEMA)
    for campo, spec in e.get("properties", {}).items():
        if campo in muertos:
            continue
        cols.append((campo, tipo_sql(spec)))
    if entidad == "User":
        cols += EXTRA_USER
    return cols

# ── SQL literals ────────────────────────────────────────────────────────────
def lit(valor, tipo):
    if valor is None or valor == "":
        # ponytail: Base44 guarda "" donde el campo es date/number vacio.
        # Solo text conserva la cadena vacia; el resto va a NULL.
        if valor == "" and tipo == "text":
            return "''"
        return "NULL"
    if tipo == "jsonb":
        return "'" + json.dumps(valor, ensure_ascii=False).replace("'", "''") + "'::jsonb"
    if tipo == "boolean":
        return "true" if valor else "false"
    if tipo == "numeric":
        return str(valor) if isinstance(valor, (int, float)) else "NULL"
    return "'" + str(valor).replace("'", "''") + "'"

# ── RLS: traduccion de base44/entities/*.jsonc a policies de Postgres ───────
# El vocabulario que usa Base44 es cerrado: $or, $and, user_condition.role, y
# comparaciones de campo contra literales o contra tres plantillas de usuario.
# Cualquier cosa fuera de eso revienta a proposito, en vez de generar una
# policy permisiva por accidente.
PLANTILLAS = {
    "{{user.id}}":                     "mi_id()",
    "{{user.email}}":                  "(auth.jwt() ->> 'email')",
    "{{user.data.centro_principal}}":  "mi_centro()",
}
OPS = {  # base44 -> (accion PG, usa USING, usa WITH CHECK)
    "read":   ("select", True,  False),
    "create": ("insert", False, True),
    "update": ("update", True,  True),
    "delete": ("delete", True,  False),
}

# ── Excepciones a la traduccion literal ─────────────────────────────────────
# Base44 comparaba contra campos que en los datos estan vacios, asi que la
# regla traducida al pie de la letra nunca se cumple. Se corrige aca, con el
# motivo, en vez de editar el SQL generado — que se sobreescribe.
# INTERRUPTOR. Apagado = como estaba en Base44: cualquier encargado_salud lee
# las 259 inspecciones, de todos los centros. Encendido = solo las de su centro
# (145 Coñaripe / 110 Panguipulli / 1 Choshuenco). Ver PERMISOS.md.
# Si se enciende, hay que encender tambien la variable del servidor del mismo
# nombre, o la lectura queda restringida pero la aprobacion no.
RESTRINGIR_INSPECCIONES_POR_CENTRO = False

POLICIES_CORREGIDAS = {
    # `centro_origen` esta vacio en las 205 actividades, asi que la condicion
    # original (centro_origen = mi_centro()) nunca es verdadera y el panel
    # "Actividades Recientes" quedaria vacio despues de migrar. Se resuelve el
    # centro por el equipo. Ademas se abre a cualquier usuario de ese centro,
    # no solo al encargado: el diseño de roles dice que el Usuario General
    # "ve historial de actividades e inspecciones" de su centro.
    ("Actividad", "read"): (
        "(mi_rol() = 'super_admin' or mi_rol() = 'admin'"
        " or usuario_email = (auth.jwt() ->> 'email')"
        " or centro_del_equipo(equipo_id) = mi_centro())"
    ),
}

# Esta si es una eleccion, no un arreglo: cambia quien ve que.
if RESTRINGIR_INSPECCIONES_POR_CENTRO:
    POLICIES_CORREGIDAS[("InspeccionPendiente", "read")] = (
        "(mi_rol() = 'super_admin' or mi_rol() = 'admin'"
        " or mi_rol() = 'monitor_corporativo' or mi_rol() = 'jefe_taller'"
        " or mi_rol() = 'mecanico' or created_by_id = mi_id()"
        " or centro_del_equipo(equipo_id) = mi_centro())"
    )

def traducir(cond):
    # Base44 usa `true` para "cualquier usuario logueado". Se traduce literal:
    # el `to authenticated` de la policy es el que pone el limite real.
    if isinstance(cond, bool):
        return "true" if cond else "false"
    # `null` = la op sin regla propia. En Base44 eso es "sin restriccion", no
    # "denegar": Centro.read es null y la app lista centros desde 8 pantallas.
    # Se traduce a true; si se quiere apretar, se aprieta aca a proposito.
    if cond is None:
        return "true"
    if not isinstance(cond, dict) or len(cond) != 1:
        # Un dict con varias claves en Base44 es un AND implicito.
        if isinstance(cond, dict):
            return "(" + " and ".join(traducir({k: v}) for k, v in cond.items()) + ")"
        raise ValueError(f"condicion no reconocida: {cond!r}")
    (clave, valor), = cond.items()
    if clave in ("$or", "$and"):
        unir = " or " if clave == "$or" else " and "
        return "(" + unir.join(traducir(c) for c in valor) + ")"
    if clave == "user_condition":
        if set(valor) != {"role"}:
            raise ValueError(f"user_condition no soportado: {valor!r}")
        return f"mi_rol() = {lit(valor['role'], 'text')}"
    columna = clave[5:] if clave.startswith("data.") else clave
    derecha = PLANTILLAS.get(valor, lit(valor, "text"))
    return f"{columna} = {derecha}"

HELPERS = """-- Generado por migracion/generar_sql.py. No editar a mano.
-- Enlace entre Supabase Auth y la tabla usuario heredada de Base44: por email,
-- porque los id de Base44 son ObjectId y los de auth.users son uuid.
alter table usuario add column if not exists auth_id uuid references auth.users(id);
create unique index if not exists usuario_email_uniq on usuario (lower(email));

-- security definer: estas funciones leen `usuario`, que tiene RLS activo. Sin
-- definer las policies que las llaman se llamarian a si mismas (recursion).
create or replace function mi_rol() returns text
  language sql stable security definer set search_path = public as $$
  select role from usuario where lower(email) = lower(auth.jwt() ->> 'email') limit 1 $$;

create or replace function mi_id() returns text
  language sql stable security definer set search_path = public as $$
  select id from usuario where lower(email) = lower(auth.jwt() ->> 'email') limit 1 $$;

-- El centro de un equipo, para las tablas que solo guardan equipo_id. Es
-- security definer por lo mismo que las de arriba: `equipo` tiene RLS y una
-- policy que lo consulte directo entraria en recursion.
create or replace function centro_del_equipo(id_equipo text) returns text
  language sql stable security definer set search_path = public as $$
  select centro_principal from equipo where id = id_equipo limit 1 $$;

create or replace function mi_centro() returns text
  language sql stable security definer set search_path = public as $$
  select centro_principal from usuario where lower(email) = lower(auth.jwt() ->> 'email') limit 1 $$;

-- usuario no trae rls en su .jsonc: se escribe a mano.
drop policy if exists usuario_lee on usuario;
create policy usuario_lee on usuario for select to authenticated
  using (lower(email) = lower(auth.jwt() ->> 'email') or mi_rol() in ('super_admin','admin','monitor_corporativo'));
drop policy if exists usuario_escribe on usuario;
create policy usuario_escribe on usuario for all to authenticated
  using (mi_rol() in ('super_admin','admin')) with check (mi_rol() in ('super_admin','admin'));
"""

def generar_policies(ents):
    sql = [HELPERS]
    for entidad in sorted(ents):
        rls = ents[entidad].get("rls")
        if not rls:
            continue
        t = tabla_de(entidad)
        sql.append(f"-- {entidad}")
        for op, cond in rls.items():
            accion, usa_using, usa_check = OPS[op]
            corregida = POLICIES_CORREGIDAS.get((entidad, op))
            expr = corregida if corregida else traducir(cond)
            if corregida:
                sql.append(f"-- corregida a mano (ver POLICIES_CORREGIDAS en generar_sql.py)")
            nombre = f"{t}_{op}"
            partes = [f"create policy {nombre} on {t} for {accion} to authenticated"]
            if usa_using: partes.append(f"  using ({expr})")
            if usa_check: partes.append(f"  with check ({expr})")
            sql.append(f"drop policy if exists {nombre} on {t};")
            sql.append("\n".join(partes) + ";")
        sql.append("")
    return "\n".join(sql)

def main(ruta_backup):
    ents = esquemas()
    data = json.load(open(ruta_backup, encoding="utf-8"))["data"]

    # 01 — esquema
    sql = ["-- Generado por migracion/generar_sql.py. No editar a mano.", "", TRIGGER]
    for entidad in sorted(ents):
        t = tabla_de(entidad)
        cols = cols_de(entidad, ents[entidad])
        sql.append(f"create table if not exists {t} (")
        sql.append(",\n".join(
            f"  {c} {tp}{' ' + RESTRICCIONES[c] if c in RESTRICCIONES else ''}"
            for c, tp in cols))
        sql.append(");")
        # ponytail: RLS activado sin politicas = denegar todo. Las politicas
        # traducidas de base44/entities/*.jsonc van en 03_policies.sql; hasta
        # entonces la anon key no lee nada.
        sql.append(f"alter table {t} enable row level security;")
        sql.append(f"drop trigger if exists {t}_tocar on {t};")
        sql.append(f"create trigger {t}_tocar before update on {t} "
                   f"for each row execute function tocar_updated_date();")
        sql.append("")
    open(os.path.join(SALIDA, "01_esquema.sql"), "w", encoding="utf-8").write("\n".join(sql))

    # 02 — datos
    ins, resumen, huerfanos = ["-- Generado por migracion/generar_sql.py.", "begin;", ""], [], collections.Counter()
    for entidad in sorted(ents):
        filas = data.get(entidad) or []
        if not isinstance(filas, list):
            print(f"  !! {entidad}: el backup trae {filas!r}"); continue
        t = tabla_de(entidad)
        cols = cols_de(entidad, ents[entidad])
        conocidas = {c for c, _ in cols}
        resumen.append((entidad, t, len(filas), len(cols)))
        if not filas: continue
        nombres = [c for c, _ in cols]
        tipos = dict(cols)
        ins.append(f"insert into {t} ({', '.join(nombres)}) values")
        vals = []
        for r in filas:
            for k in r:
                if k not in conocidas: huerfanos[f"{entidad}.{k}"] += 1
            vals.append("  (" + ", ".join(lit(corregir(r.get(c)), tipos[c]) for c in nombres) + ")")
        ins.append(",\n".join(vals) + "\non conflict (id) do nothing;")
        ins.append("")
    ins.append("commit;")
    open(os.path.join(SALIDA, "02_datos.sql"), "w", encoding="utf-8").write("\n".join(ins))

    # 03 — policies
    open(os.path.join(SALIDA, "03_policies.sql"), "w", encoding="utf-8").write(generar_policies(ents))

    # 04 — disparadores de entidad
    open(os.path.join(SALIDA, "04_webhooks.sql"), "w", encoding="utf-8").write(generar_webhooks(ents))

    total = 0
    for entidad, t, n, nc in resumen:
        print(f"  {entidad:24} -> {t:24} {n:5} filas  {nc:3} cols")
        total += n
    print(f"  {'TOTAL':24}    {'':24} {total:5} filas")
    if huerfanos:
        print("\n  !! campos en los datos que no estan en el esquema (se pierden):")
        for k, n in huerfanos.items(): print(f"     {k}  x{n}")
    faltan = set(data) - set(ents)
    if faltan: print(f"\n  !! entidades en el backup sin .jsonc: {faltan}")

def demo():
    """Auto-chequeo de lo unico no trivial aca: nombres de tabla y escapado SQL."""
    assert snake("EquipoDEA") == "equipo_dea"
    assert snake("OrdenDeCompra") == "orden_de_compra"
    assert snake("SolicitudRepuestoSalud") == "solicitud_repuesto_salud"
    assert snake("AppConfig") == "app_config"
    assert tabla_de("User") == "usuario"                    # palabra reservada en PG

    # "" es dato valido en text, pero revienta un date/numeric -> NULL
    assert lit("", "text") == "''"
    assert lit("", "date") == "NULL"
    assert lit("", "numeric") == "NULL"
    assert lit(None, "text") == "NULL"
    # 0 y false son valores, no vacios: no deben caer a NULL
    assert lit(0, "numeric") == "0"
    assert lit(False, "boolean") == "false"
    assert lit(True, "boolean") == "true"
    # comillas simples se duplican (standard_conforming_strings, sin backslash)
    assert lit("O'Higgins", "text") == "'O''Higgins'"
    assert lit(["a'b"], "jsonb") == "'[\"a''b\"]'::jsonb"
    # acentos literales, no escapes \\uXXXX
    assert "Melefquén" in lit({"x": "Melefquén"}, "jsonb")

    # Correcciones de datos: strings sueltos y anidados en listas/dicts
    assert corregir("Posta Huitar") == "Posta Huitag"
    assert corregir(["SAR Panguipulli", "Posta Huitar"]) == ["SAR Panguipulli", "Posta Huitag"]
    assert corregir({"a": {"b": "Posta Huitar"}}) == {"a": {"b": "Posta Huitag"}}
    assert corregir(None) is None and corregir(7) == 7   # no-strings intactos

    # Los tipos deben ir puros (sin "primary key"/"default"), o lit() no los
    # reconoce y un boolean termina serializado como el texto 'False'.
    for _, tp in COLS_SISTEMA + EXTRA_USER:
        assert " " not in tp, tp
    assert lit(False, dict(COLS_SISTEMA)["is_sample"]) == "false"

    # Traduccion RLS
    assert traducir({"user_condition": {"role": "super_admin"}}) == "mi_rol() = 'super_admin'"
    assert traducir({"data.tipo": "ambulancia"}) == "tipo = 'ambulancia'"
    assert traducir({"created_by_id": "{{user.id}}"}) == "created_by_id = mi_id()"
    assert traducir({"data.centro_principal": "{{user.data.centro_principal}}"}) \
        == "centro_principal = mi_centro()"
    assert traducir({"$or": [{"user_condition": {"role": "admin"}}, {"data.estado": "pendiente"}]}) \
        == "(mi_rol() = 'admin' or estado = 'pendiente')"
    assert traducir({"$and": [{"user_condition": {"role": "mecanico"}}, {"data.tipo": "ambulancia"}]}) \
        == "(mi_rol() = 'mecanico' and tipo = 'ambulancia')"
    # lo desconocido revienta, no se convierte en una policy permisiva
    try:
        traducir({"user_condition": {"algo_nuevo": 1}}); raise SystemExit("deberia haber fallado")
    except ValueError:
        pass
    print("demo() ok")

# ── 04: los disparadores de entidad que hacia Base44 solo ────────────────────
# Base44 llamaba a registrarHistorial y notificarSolicitudRepuesto cada vez que
# cambiaba una entidad. Postgres no hace eso solo: se replica con triggers que
# postean al servidor de Railway via pg_net.
WEBHOOKS_CABECERA = """-- Generado por migracion/generar_sql.py. No editar a mano.
-- Requiere pg_net (Supabase lo trae; hay que habilitarlo una vez).
create extension if not exists pg_net with schema extensions;

-- La URL y el secreto no se escriben en el trigger: viven en una tabla para
-- poder cambiar de entorno sin recrear 24 triggers.
create table if not exists config_webhook (clave text primary key, valor text);
alter table config_webhook enable row level security;   -- nadie la lee por API
-- Cargar una sola vez, reemplazando los valores:
--   insert into config_webhook (clave, valor) values
--     ('url', 'https://TU-SERVICIO.up.railway.app'),
--     ('secreto', 'EL MISMO CRON_SECRET del servidor')
--   on conflict (clave) do update set valor = excluded.valor;

create or replace function avisar_al_servidor() returns trigger
  language plpgsql security definer set search_path = public, extensions as $BODY$
declare
  destino text;
  secreto text;
  fila_nueva jsonb := null;
  fila_vieja jsonb := null;
  accion text;
begin
  select valor into destino from config_webhook where clave = 'url';
  select valor into secreto from config_webhook where clave = 'secreto';
  -- Sin configurar, el trigger no hace nada: no bloquea la escritura.
  if destino is null or secreto is null then return null; end if;

  if TG_OP <> 'DELETE' then fila_nueva := to_jsonb(new); end if;
  if TG_OP <> 'INSERT' then fila_vieja := to_jsonb(old); end if;
  accion := case TG_OP when 'INSERT' then 'create'
                       when 'UPDATE' then 'update'
                       else 'delete' end;

  -- http_post es asincrono: la transaccion no espera la respuesta, asi que un
  -- servidor caido nunca impide guardar el registro.
  perform net.http_post(
    url := destino || '/webhooks/' || TG_ARGV[0],
    body := jsonb_build_object(
      'event', jsonb_build_object(
        'type', accion,
        'entity_name', TG_ARGV[1],
        'entity_id', coalesce(fila_nueva ->> 'id', fila_vieja ->> 'id')),
      'data', fila_nueva,
      'old_data', fila_vieja),
    headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', secreto)
  );
  return null;
end $BODY$;
"""

# `historial` no lleva trigger: registrarHistorial escribe ahi y se llamaria a
# si mismo sin parar.
SIN_HISTORIAL = {"Historial"}

def generar_webhooks(ents):
    sql = [WEBHOOKS_CABECERA]
    sql.append("-- Bitacora de auditoria: un trigger por entidad.")
    for entidad in sorted(ents):
        if entidad in SIN_HISTORIAL:
            continue
        t = tabla_de(entidad)
        sql.append(f"drop trigger if exists {t}_historial on {t};")
        sql.append(f"create trigger {t}_historial after insert or update or delete on {t}"
                   f"\n  for each row execute function avisar_al_servidor('registrarHistorial', '{entidad}');")
    sql.append("")
    sql.append("-- Aviso por correo al crearse una solicitud de repuesto.")
    sql.append("drop trigger if exists solicitud_repuesto_avisa on solicitud_repuesto;")
    sql.append("create trigger solicitud_repuesto_avisa after insert on solicitud_repuesto"
               "\n  for each row execute function avisar_al_servidor('notificarSolicitudRepuesto', 'SolicitudRepuesto');")
    sql.append("")
    return "\n".join(sql)

if __name__ == "__main__":
    demo()
    if len(sys.argv) > 1:
        main(sys.argv[1])
