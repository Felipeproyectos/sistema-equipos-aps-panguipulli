"""Crea en Supabase Auth una cuenta por cada fila de `usuario`, y las enlaza.

Se corre UNA vez, despues de cargar 02_datos.sql. Para cada usuario:
  1. crea la cuenta en Supabase Auth con la clave generica
  2. escribe su auth_id en la tabla `usuario` (la columna que dejo 03_policies)
  3. marca force_password_reset = true, para que la app le exija cambiarla

Es re-ejecutable: si la cuenta ya existe, la busca y solo re-enlaza.

    export SUPABASE_URL=https://xxxx.supabase.co
    export SUPABASE_SERVICE_ROLE_KEY=eyJ...
    python migracion/crear_usuarios_auth.py --clave salud2026

Sin --confirmar solo muestra lo que haria.
"""
import json, os, sys, argparse, urllib.request, urllib.error, urllib.parse, io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
LLAVE = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

def pedir(metodo, ruta, cuerpo=None):
    req = urllib.request.Request(
        f"{URL}{ruta}",
        method=metodo,
        data=json.dumps(cuerpo).encode() if cuerpo is not None else None,
        headers={
            "apikey": LLAVE,
            "Authorization": f"Bearer {LLAVE}",
            "Content-Type": "application/json",
            # Sin esto PostgREST no devuelve la fila actualizada.
            "Prefer": "return=representation",
        },
    )
    try:
        with urllib.request.urlopen(req) as r:
            texto = r.read().decode()
            return r.status, (json.loads(texto) if texto else None)
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode() or "{}")

def usuarios_de_la_base():
    estado, filas = pedir("GET", "/rest/v1/usuario?select=id,email,full_name,role,auth_id&order=email")
    if estado != 200:
        sys.exit(f"No pude leer la tabla usuario ({estado}): {filas}")
    return filas

def buscar_en_auth(email):
    # El Admin API filtra por email exacto.
    estado, r = pedir("GET", f"/auth/v1/admin/users?filter={urllib.parse.quote(email)}")
    if estado != 200:
        return None
    for u in (r or {}).get("users", []):
        if (u.get("email") or "").lower() == email.lower():
            return u
    return None

def crear_en_auth(email, clave, fila):
    return pedir("POST", "/auth/v1/admin/users", {
        "email": email,
        "password": clave,
        # Sin confirmar el correo, Supabase exige verificacion antes del primer
        # login — y estas cuentas ya existian en Base44, no son altas nuevas.
        "email_confirm": True,
        "user_metadata": {"full_name": fila.get("full_name") or "", "role": fila.get("role") or ""},
    })

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--clave", required=True, help="clave generica inicial para todos")
    ap.add_argument("--confirmar", action="store_true", help="sin esto solo muestra lo que haria")
    args = ap.parse_args()

    if not URL or not LLAVE:
        sys.exit("Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY en el entorno.")
    if len(args.clave) < 8:
        sys.exit("La clave generica debe tener al menos 8 caracteres (Supabase lo exige).")

    filas = usuarios_de_la_base()
    print(f"{len(filas)} usuarios en la tabla `usuario`\n")
    if not args.confirmar:
        print("  (ensayo: nada se escribe. Agrega --confirmar para hacerlo de verdad)\n")

    creados = enlazados = ya_estaban = fallidos = 0
    for f in filas:
        email = (f.get("email") or "").strip()
        if not email:
            print(f"  !! {f['id']}: sin correo, se salta")
            fallidos += 1
            continue

        existente = buscar_en_auth(email)
        accion = "ya existe en Auth" if existente else "crear en Auth"
        destino = existente

        if not args.confirmar:
            print(f"  {email:44} {accion}")
            continue

        if not existente:
            estado, r = crear_en_auth(email, args.clave, f)
            if estado not in (200, 201):
                print(f"  !! {email}: no se pudo crear ({estado}) {r}")
                fallidos += 1
                continue
            destino, creados = r, creados + 1
        else:
            ya_estaban += 1

        estado, _ = pedir("PATCH", f"/rest/v1/usuario?id=eq.{f['id']}", {
            "auth_id": destino["id"],
            "force_password_reset": True,
        })
        if estado not in (200, 204):
            print(f"  !! {email}: creado pero no enlazado ({estado})")
            fallidos += 1
            continue
        enlazados += 1
        print(f"  {email:44} {'creado' if not existente else 'ya estaba'} y enlazado")

    if args.confirmar:
        print(f"\ncreados: {creados}   ya estaban: {ya_estaban}   enlazados: {enlazados}   fallidos: {fallidos}")
        print("\nTodos quedan con force_password_reset = true: la app les exigira")
        print("cambiar la clave la primera vez que entren.")
        if fallidos:
            sys.exit(1)

if __name__ == "__main__":
    main()
