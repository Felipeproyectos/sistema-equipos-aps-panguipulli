"""Copia al servidor las reglas de src/lib que el servidor también necesita.

    python migracion/sincronizar_compartido.py              # escribe las copias
    python migracion/sincronizar_compartido.py --verificar   # solo comprueba

Por que existe
--------------
El resumen diario por correo (servidor/funciones/resumenDiarioPendientes.js)
tiene que contar lo pendiente EXACTAMENTE igual que el número del menú: si el
correo dice "3 en Solicitudes al Taller" y al entrar hay 2, la gente aprende a
no creerle a ninguno de los dos.

Esas reglas viven en src/lib/. Pero Railway despliega solo la carpeta
servidor/, que no puede importar nada de src/. Mismo problema y misma salida
que columnasTipadas.js: una copia generada, con un --verificar que avisa si
quedaron distintas. Las copias NO se editan a mano.
"""
import os, sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ORIGEN = os.path.join(RAIZ, "src", "lib")
DESTINO = os.path.join(RAIZ, "servidor", "compartido")

# Las que usa contadoresMenu.js, con sus propias dependencias. Todas importan
# con rutas relativas ("./x.js"), así que funcionan igual en la otra carpeta.
ARCHIVOS = ["agendaTaller.js", "calendarioFlota.js", "panelFlota.js", "contadoresMenu.js"]

CABECERA = ("// Copia de src/lib/{nombre}, generada por migracion/sincronizar_compartido.py.\n"
            "// No editar a mano: se edita el original y se vuelve a correr el script.\n\n")


def copia(nombre):
    texto = open(os.path.join(ORIGEN, nombre), encoding="utf-8").read()
    if "@/" in texto:
        raise SystemExit(f"!! {nombre} importa con '@/': en el servidor no existe ese alias.")
    return CABECERA.format(nombre=nombre) + texto


def main():
    verificar = "--verificar" in sys.argv
    desfasados = []
    os.makedirs(DESTINO, exist_ok=True)
    for nombre in ARCHIVOS:
        esperado = copia(nombre)
        ruta = os.path.join(DESTINO, nombre)
        actual = open(ruta, encoding="utf-8").read() if os.path.exists(ruta) else ""
        if actual == esperado:
            continue
        if verificar:
            desfasados.append(nombre)
        else:
            open(ruta, "w", encoding="utf-8").write(esperado)
            print(f"  {nombre} -> servidor/compartido/")
    if verificar:
        if desfasados:
            for n in desfasados:
                print(f"!! servidor/compartido/{n} quedó distinto de src/lib/{n}.")
            print("   Volver a copiar:  python migracion/sincronizar_compartido.py")
            return 1
        print("servidor/compartido/ está al día con src/lib/.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
