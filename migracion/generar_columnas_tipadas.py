"""Genera src/api/columnasTipadas.js: que columnas NO son de texto.

    python migracion/generar_columnas_tipadas.py              # escribe el archivo
    python migracion/generar_columnas_tipadas.py --verificar   # solo comprueba

Por que existe
--------------
Un formulario de React arranca sus campos vacios con `""`. Si el campo es una
fecha que nadie lleno, el guardado manda:

    { fecha_vencimiento_bateria: "" }

y Postgres corta con:

    invalid input syntax for type date: ""

PostgREST no lo convierte a NULL: rechaza el insert entero, igual que con una
columna inexistente. Crear un equipo fallaba asi — el formulario tiene tres
fechas que casi nunca se llenan, y dos de ellas ni siquiera se muestran cuando
el equipo no es un vehiculo, con lo que iban vacias SIEMPRE.

La importacion desde Base44 ya sabia de esto: generar_sql.py convierte `""` a
NULL salvo en columnas de texto (ver su funcion `lit`). La aplicacion en vivo
nunca recibio el mismo trato, asi que los datos viejos entraron bien y los
nuevos no se podian crear.

Este script deja esa misma regla al alcance del cliente: la lista de columnas
que NO son text, por tabla. src/api/clienteSupabase.js la usa para mandar NULL
en vez de `""` justo antes de escribir.

La fuente es base44/entities/*.jsonc, la misma que genera 01_esquema.sql, para
que no puedan quedar diciendo cosas distintas.
"""
import os, sys, json

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(RAIZ, "migracion"))

import generar_sql as g  # noqa: E402

DESTINO = os.path.join(RAIZ, "src", "api", "columnasTipadas.js")

CABECERA = """// Generado por migracion/generar_columnas_tipadas.py. No editar a mano.
//
// Columnas que NO son de texto, por tabla. Un `""` en cualquiera de ellas hace
// que Postgres rechace la escritura completa ("invalid input syntax for type
// date"), que es lo que impedia crear un equipo: el formulario manda sus
// fechas vacias como cadena vacia, no como nulo.
//
// clienteSupabase.js las usa para mandar NULL en esos casos. En las columnas
// de texto `""` es un valor valido y se respeta.
"""


def mapa():
    """{ tabla: [columnas que no son text] } — solo las tablas que tienen alguna."""
    out = {}
    for entidad, e in sorted(g.esquemas().items()):
        no_texto = sorted(c for c, t in g.cols_de(entidad, e) if t != "text")
        if no_texto:
            out[g.tabla_de(entidad)] = no_texto
    return out


def render(m):
    lineas = [CABECERA, "export const COLUMNAS_NO_TEXTO = {"]
    for tabla, cols in m.items():
        lineas.append(f"  {tabla}: new Set([{', '.join(json.dumps(c) for c in cols)}]),")
    lineas.append("};")
    lineas.append("")
    return "\n".join(lineas)


def main():
    texto = render(mapa())
    verificar = "--verificar" in sys.argv

    if verificar:
        actual = open(DESTINO, encoding="utf-8").read() if os.path.exists(DESTINO) else ""
        if actual == texto:
            print("src/api/columnasTipadas.js esta al dia.")
            return 0
        print("!! src/api/columnasTipadas.js quedo desfasado de base44/entities/.")
        print("   Volver a generarlo:  python migracion/generar_columnas_tipadas.py")
        return 1

    open(DESTINO, "w", encoding="utf-8").write(texto)
    m = mapa()
    print(f"src/api/columnasTipadas.js: {len(m)} tablas, "
          f"{sum(len(v) for v in m.values())} columnas que no son texto")
    return 0


def demo():
    """Auto-chequeo: si esto falla, la lista miente y vuelve el error de la fecha."""
    m = mapa()
    eq = m["equipo"]
    assert "fecha_vencimiento_bateria" in eq, "falta la fecha que rompia el alta de equipos"
    assert "anio_adquisicion" in eq and "valor" in eq, "faltan las numericas"
    assert "activo" in eq, "falta el booleano del borrado logico"
    assert "marca" not in eq and "modelo" not in eq, "el texto no debe entrar: '' es valido ahi"
    assert "usuario" in m and "email" not in m["usuario"], "el correo es texto"
    print("autotest ok")


if __name__ == "__main__":
    demo()
    sys.exit(main())
