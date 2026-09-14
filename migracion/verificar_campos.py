"""Comprueba que el codigo solo escriba columnas que existen de verdad.

    python migracion/verificar_campos.py

Por que existe
--------------
Crear una cuenta nueva fallaba con:

    Could not find the 'activo' column of 'usuario' in the schema cache

`gestionarAcceso.js` mandaba un campo `activo` que la tabla `usuario` no
tiene. PostgREST no ignora los campos de mas: rechaza el insert completo, asi
que no se podia dar de alta a nadie. El error solo aparecia en produccion, al
apretar el boton, porque el doble en memoria del modo local acepta cualquier
campo sin chistar.

Este script cierra ese hueco sin necesitar Supabase: saca las columnas reales
de migracion/*.sql y las compara con lo que el codigo escribe. Devuelve 1 si
encuentra alguno de mas, para poder colgarlo de una verificacion automatica.

Que NO hace: no valida tipos, ni valores, ni las columnas que la base tenga de
mas respecto al esquema. Solo lo que ya rompio una vez.
"""
import re, os, sys, glob

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def columnas_por_tabla():
    """Columnas de cada tabla: las del create table, mas las que agregue un
    `alter table ... add column` posterior (asi entra auth_id, que lo pone
    03_policies.sql), menos las que borre un `drop column`."""
    tablas = {}
    for ruta in sorted(glob.glob(os.path.join(RAIZ, "migracion", "*.sql"))):
        sql = open(ruta, encoding="utf-8").read()
        for m in re.finditer(r"create table if not exists (\w+) \((.*?)\n\);", sql, re.S):
            cols = set()
            for linea in m.group(2).split("\n"):
                linea = linea.strip()
                if not linea or linea.startswith("--"):
                    continue
                if linea.split()[0].lower() in ("primary", "unique", "constraint", "foreign", "check"):
                    continue
                cols.add(linea.split()[0])
            tablas.setdefault(m.group(1), set()).update(cols)
        for m in re.finditer(r"alter table (\w+)\s+add column (?:if not exists )?(\w+)", sql, re.I):
            tablas.setdefault(m.group(1), set()).add(m.group(2))
        for m in re.finditer(r"alter table (\w+)\s+drop column (?:if exists )?(\w+)", sql, re.I):
            tablas.get(m.group(1), set()).discard(m.group(2))
    return tablas


# Nombre de entidad en el codigo -> tabla en Postgres.
ENTIDAD_A_TABLA = {
    "User": "usuario", "Equipo": "equipo", "OrdenTrabajo": "orden_trabajo",
    "Alerta": "alerta", "Actividad": "actividad", "Solicitud": "solicitud",
    "Parche": "parche", "Centro": "centro", "Proveedor": "proveedor",
    "Repuesto": "repuesto", "SolicitudRepuesto": "solicitud_repuesto",
    "InspeccionPendiente": "inspeccion_pendiente", "Kilometraje": "kilometraje",
    "Comentario": "comentario", "Historial": "historial",
    "InvitacionPendiente": "invitacion_pendiente", "AppConfig": "app_config",
    "ConfigAlerta": "config_alerta", "OrdenDeCompra": "orden_de_compra",
    "SolicitudStock": "solicitud_stock", "RepuestoCritico": "repuesto_critico",
    "AccesoNoAutorizado": "acceso_no_autorizado",
    "SolicitudRepuestoSalud": "solicitud_repuesto_salud",
}

# Campos que el cliente agrega solo, no el codigo de cada funcion.
DEL_CLIENTE = {"id", "created_date", "updated_date"}


def _cuerpo_objeto(src, i):
    """Devuelve el contenido del objeto literal que empieza en src[i] == '{',
    contando llaves para no cortar en una anidada. None si no cierra."""
    profundidad = 0
    for j in range(i, len(src)):
        c = src[j]
        if c == "{":
            profundidad += 1
        elif c == "}":
            profundidad -= 1
            if profundidad == 0:
                return src[i + 1:j]
    return None


def _claves_de_primer_nivel(cuerpo):
    """Solo las claves del objeto en si: se saltan las de objetos y arreglos
    anidados, que no son columnas (una entrada de linea_tiempo, por ejemplo)."""
    claves, profundidad, i = [], 0, 0
    while i < len(cuerpo):
        c = cuerpo[i]
        if c in "{[(":
            profundidad += 1
        elif c in "}])":
            profundidad -= 1
        elif c in "'\"`":
            fin = i + 1
            while fin < len(cuerpo) and cuerpo[fin] != c:
                fin += 2 if cuerpo[fin] == "\\" else 1
            i = fin
        elif profundidad == 0 and (c.isalpha() or c == "_"):
            fin = i
            while fin < len(cuerpo) and (cuerpo[fin].isalnum() or cuerpo[fin] == "_"):
                fin += 1
            resto = cuerpo[fin:].lstrip()
            anterior = cuerpo[:i].rstrip()
            # `nombre:` y que lo de antes abra el objeto o cierre el campo previo
            if resto.startswith(":") and not resto.startswith("::") and (
                not anterior or anterior[-1] in ",{"
            ):
                claves.append(cuerpo[i:fin])
            i = fin - 1
        i += 1
    return claves


def escrituras(ruta):
    """(entidad, campo, linea) por cada campo de primer nivel que el archivo
    escribe en una entidad, sea el objeto literal o una variable declarada
    antes con `const x = { ... }`."""
    src = open(ruta, encoding="utf-8").read()
    fuera = []

    for m in re.finditer(r"entities\.(\w+)\.(?:create|update)\(", src):
        entidad = m.group(1)
        # primer '{' de nivel superior dentro de los parentesis de la llamada
        i, profundidad = m.end(), 1
        inicio = None
        while i < len(src) and profundidad > 0:
            if src[i] == "(":
                profundidad += 1
            elif src[i] == ")":
                profundidad -= 1
            elif src[i] == "{" and profundidad == 1:
                inicio = i
                break
            i += 1
        if inicio is None:
            # forma `create(variable)`: se busca su declaracion
            arg = re.match(r"\s*(?:[^,()]+,\s*)?(\w+)\s*\)", src[m.end():])
            if not arg:
                continue
            decl = re.search(r"const %s = \{" % re.escape(arg.group(1)), src)
            if not decl:
                continue
            inicio = decl.end() - 1
        cuerpo = _cuerpo_objeto(src, inicio)
        if cuerpo is None:
            continue
        linea = src[:inicio].count("\n") + 1
        for c in _claves_de_primer_nivel(cuerpo):
            fuera.append((entidad, c, linea))
    return fuera


def main():
    tablas = columnas_por_tabla()
    if "usuario" not in tablas:
        print("!! no se pudieron leer las columnas desde migracion/*.sql")
        return 1

    archivos = sorted(glob.glob(os.path.join(RAIZ, "servidor", "funciones", "*.js")))
    problemas = []
    revisados = 0
    for ruta in archivos:
        for entidad, campo, linea in escrituras(ruta):
            tabla = ENTIDAD_A_TABLA.get(entidad)
            if not tabla or tabla not in tablas:
                continue
            revisados += 1
            if campo in DEL_CLIENTE or campo in tablas[tabla]:
                continue
            problemas.append((os.path.relpath(ruta, RAIZ), linea, entidad, tabla, campo))

    print(f"{revisados} escrituras revisadas en {len(archivos)} funciones del servidor")
    if not problemas:
        print("Sin campos inventados.")
        return 0

    print("\n!! Campos que el codigo escribe y la tabla NO tiene:")
    for ruta, linea, entidad, tabla, campo in problemas:
        print(f"   {ruta}:{linea}  {entidad}.{campo}  ->  la tabla `{tabla}` no lo tiene")
    print("\nPostgREST rechaza el insert completo, no ignora el campo de mas.")
    print("O se quita del codigo, o se agrega la columna en migracion/.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
