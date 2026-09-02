"""Compara el respaldo de Base44 contra el SQL generado, fila por fila.

No confia en el generador: vuelve a leer 02_datos.sql y cuenta lo que
realmente va a entrar a Postgres, contra lo que trajo el respaldo.

    python migracion/verificar_migracion.py <backup.json>
"""
import json, re, os, sys, glob, io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SALIDA = os.path.join(RAIZ, "migracion")

# Entidades retiradas a proposito. Se listan aca, con el motivo y las filas que
# tenian, para que el chequeo no las marque como perdida — pero tampoco pase por
# alto en silencio que se sacaron.
ENTIDADES_RETIRADAS = {
    "EquipoDEA": "subconjunto estricto de Equipo (sus 7 DEA ya viven ahi con tipo='dea'); 0 filas",
}

def tabla_de(entidad):
    if entidad == "User":
        return "usuario"
    s = re.sub(r"(.)([A-Z][a-z]+)", r"\1_\2", entidad)
    return re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", s).lower()

def filas_por_tabla(sql):
    """Cuenta las tuplas de cada INSERT. Una tupla por linea que abre con '  ('."""
    conteo, tabla = {}, None
    for linea in sql.splitlines():
        m = re.match(r"insert into (\w+) \(", linea)
        if m:
            tabla = m.group(1)
            conteo.setdefault(tabla, 0)
        elif tabla and linea.startswith("  ("):
            conteo[tabla] += 1
        elif linea.startswith("on conflict"):
            tabla = None
    return conteo

def ids_en_sql(sql):
    """Los ids que aparecen como primer valor de cada tupla."""
    return set(re.findall(r"^  \('([^']+)'", sql, flags=re.M))

def main(ruta_backup):
    data = json.load(open(ruta_backup, encoding="utf-8"))["data"]
    sql = open(os.path.join(SALIDA, "02_datos.sql"), encoding="utf-8").read()
    esquema = open(os.path.join(SALIDA, "01_esquema.sql"), encoding="utf-8").read()

    en_sql = filas_por_tabla(sql)
    tablas_creadas = set(re.findall(r"create table if not exists (\w+)", esquema))
    ids_sql = ids_en_sql(sql)

    print(f"{'entidad':26} {'respaldo':>9} {'en el SQL':>10}   estado")
    print("-" * 62)
    total_backup = total_sql = 0
    problemas = []

    for entidad in sorted(data):
        filas = data[entidad]
        if not isinstance(filas, list):
            problemas.append(f"{entidad}: el respaldo no trae una lista ({filas!r})")
            continue
        t = tabla_de(entidad)
        n_sql = en_sql.get(t, 0)
        total_backup += len(filas)
        total_sql += n_sql

        if entidad in ENTIDADES_RETIRADAS:
            estado = "retirada"
            if filas:
                problemas.append(f"{entidad}: retirada pero traia {len(filas)} filas")
        elif t not in tablas_creadas:
            estado = "SIN TABLA"
            problemas.append(f"{entidad}: no existe la tabla {t}")
        elif n_sql == len(filas):
            estado = "ok" if filas else "vacia en origen"
        else:
            estado = f"FALTAN {len(filas) - n_sql}"
            problemas.append(f"{entidad}: respaldo {len(filas)}, SQL {n_sql}")
        print(f"{entidad:26} {len(filas):9} {n_sql:10}   {estado}")

    print("-" * 62)
    print(f"{'TOTAL':26} {total_backup:9} {total_sql:10}")

    # Ningun id del respaldo puede faltar en el SQL.
    ids_backup = {r["id"] for f in data.values() if isinstance(f, list) for r in f if r.get("id")}
    perdidos = ids_backup - ids_sql
    print(f"\nids en el respaldo: {len(ids_backup)}   ids en el SQL: {len(ids_sql)}")
    if perdidos:
        problemas.append(f"{len(perdidos)} ids del respaldo no estan en el SQL")
        print(f"  !! faltan {len(perdidos)}: {list(perdidos)[:5]}")

    print()
    if problemas:
        print("PROBLEMAS:")
        for p in problemas:
            print("  !!", p)
        sys.exit(1)
    print("Sin perdidas: cada fila y cada id del respaldo esta en el SQL.")
    for e, motivo in ENTIDADES_RETIRADAS.items():
        print(f"  (retirada a proposito: {e} — {motivo})")

if __name__ == "__main__":
    main(sys.argv[1])
