"""Porta las funciones Deno de Base44 a modulos ES para el servidor de Railway.

El cuerpo de cada funcion no se toca: solo cambian los imports y el envoltorio
(`Deno.serve(async (req) => {...})` -> `export default async function (req) {...}`).
Todo lo demas lo absorbe servidor/base44compat.js, que imita la API del SDK.

    python migracion/portar_funciones.py
"""
import os, re, glob, sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ORIGEN = os.path.join(RAIZ, "base44", "functions")
DESTINO = os.path.join(RAIZ, "servidor", "funciones")

ENVOLTORIO = "export default async function (req) {"

def portar(codigo):
    # 1. el SDK de Base44 -> el shim local
    # '#compat' es un subpath import: Node lo resuelve con el campo "imports" de
    # servidor/package.json, y Vite con un alias. Asi las mismas 21 funciones
    # corren en Railway sobre Supabase y en local sobre datos en memoria.
    codigo = re.sub(r"from ['\"]npm:@base44/sdk@[\d.]+['\"]", "from '#compat'", codigo)
    # 2. resto de imports npm: de Deno -> imports normales de Node
    codigo = re.sub(r"from ['\"]npm:([^@'\"][^'\"]*?)@[\d.]+['\"]", r"from '\1'", codigo)
    codigo = re.sub(r"from ['\"]npm:(@[^/'\"]+/[^@'\"]+)@[\d.]+['\"]", r"from '\1'", codigo)

    # 3. la unica sintaxis TS del corpus: anotacion de tipo en una declaracion
    #    (`const cambios: Record<string, unknown> = {...}`). Los archivos se
    #    llaman .ts pero por dentro son JS, menos esto. Si algun dia aparece
    #    otra forma de TS, el arranque del servidor falla al parsear — que es
    #    justo lo que queremos: ruidoso, no silencioso.
    codigo = re.sub(r"\b(const|let|var)\s+(\w+)\s*:\s*[^=;\n]+?=", r"\1 \2 =", codigo)

    # 4. envoltorio
    if "Deno.serve" in codigo:
        antes = codigo
        codigo = codigo.replace("Deno.serve(async (req) => {", ENVOLTORIO, 1)
        if codigo == antes:
            raise ValueError("Deno.serve con una forma distinta a la esperada")
        # el `});` final es el que cierra Deno.serve
        i = codigo.rstrip().rfind("});")
        if i == -1 or codigo[i:].strip() != "});":
            raise ValueError("no encontre el `});` que cierra Deno.serve al final")
        codigo = codigo[:i] + "}\n"
    elif "export default" not in codigo:
        raise ValueError("ni Deno.serve ni export default")
    return codigo

# Funciones que nacieron en el servidor y no tienen origen en Base44. Sin esta
# lista el barrido de mas abajo las borraba por "ya no existen en origen":
# gestionarAcceso reemplaza a base44.users.inviteUser, que la migracion dejo sin
# equivalente, asi que nunca va a existir un entry.ts del que salga.
NATIVAS = ["gestionarAcceso"]


def main():
    os.makedirs(DESTINO, exist_ok=True)
    nombres = []
    for ruta in sorted(glob.glob(os.path.join(ORIGEN, "*", "entry.ts"))):
        nombre = os.path.basename(os.path.dirname(ruta))
        try:
            salida = portar(open(ruta, encoding="utf-8").read())
        except ValueError as e:
            print(f"  !! {nombre}: {e}")
            continue
        open(os.path.join(DESTINO, nombre + ".js"), "w", encoding="utf-8").write(salida)
        nombres.append(nombre)
        print(f"  {nombre}")

    # Borrar las que ya no existen en origen. Sin esto, quitar una funcion en
    # Base44 dejaba su copia vieja viviendo en el servidor y siendo llamable.
    vigentes = {n + ".js" for n in nombres} | {"index.js"} | {n + ".js" for n in NATIVAS}
    for archivo in os.listdir(DESTINO):
        if archivo.endswith(".js") and archivo not in vigentes:
            os.remove(os.path.join(DESTINO, archivo))
            print(f"  -- {archivo[:-3]} (ya no existe en origen, borrada)")

    # registro: el servidor resuelve /functions/<nombre> contra este mapa
    presentes = sorted(nombres + [n for n in NATIVAS
                                  if os.path.exists(os.path.join(DESTINO, n + ".js"))])
    reg = ["// Generado por migracion/portar_funciones.py. No editar a mano.", ""]
    for n in presentes:
        reg.append(f"import {n} from './{n}.js';")
    reg.append("")
    reg.append("export const handlers = {")
    reg += [f"  {n}," for n in presentes]
    reg.append("};")
    reg.append("")
    open(os.path.join(DESTINO, "index.js"), "w", encoding="utf-8").write("\n".join(reg))
    print(f"\n  {len(nombres)} funciones portadas -> servidor/funciones/")

def demo():
    """Auto-chequeo del unico paso delicado: reescribir el envoltorio."""
    fuente = (
        "import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';\n"
        "import { parseISO } from 'npm:date-fns@3.6.0';\n"
        "\nDeno.serve(async (req) => {\n"
        "  const x = { a: 1 };\n"
        "  return Response.json(x);\n"
        "});"
    )
    r = portar(fuente)
    assert "from '#compat'" in r
    assert "from 'date-fns'" in r
    assert "npm:" not in r
    assert r.count(ENVOLTORIO) == 1
    assert not r.rstrip().endswith("});"), r[-40:]
    # las llaves deben quedar balanceadas tras quitar el envoltorio
    assert r.count("{") == r.count("}"), (r.count("{"), r.count("}"))
    # un archivo que ya usa export default pasa intacto en su envoltorio
    assert "export default" in portar("export default async function(req) { return 1 }")
    # anotaciones de tipo fuera; objetos literales intactos
    assert portar("export default 1;\nconst c: Record<string, unknown> = { a: 1 };") \
        .endswith("const c = { a: 1 };")
    assert "const x = { a: 1 };" in portar("export default 1;\nconst x = { a: 1 };")
    assert "let n = 0;" in portar("export default 1;\nlet n: number = 0;")
    print("demo() ok")

if __name__ == "__main__":
    demo()
    main()
