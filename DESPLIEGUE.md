# Despliegue

Tres piezas: la base en Supabase, las funciones en Railway, el frontend donde
prefieras. En ese orden.

---

## 1. Supabase — la base de datos

Crea el proyecto y abre el **SQL Editor**. Corre los archivos de `migracion/`
en este orden:

| Archivo | Qué hace |
|---|---|
| `01_esquema.sql` | 25 tablas, RLS activado, triggers de `updated_date` |
| `03_policies.sql` | 100 policies + los helpers `mi_rol()`, `mi_centro()`, `centro_del_equipo()` |
| `02_datos.sql` | **908 registros**. Es re-ejecutable (`on conflict do nothing`) |
| `04_webhooks.sql` | 25 triggers que avisan al servidor (requiere `pg_net`) |

Las policies van **antes** que los datos a propósito: así verificas que las
tablas quedaron bien antes de cargar nada.

Después de `04_webhooks.sql`, carga la configuración una sola vez:

```sql
insert into config_webhook (clave, valor) values
  ('url', 'https://TU-SERVICIO.up.railway.app'),
  ('secreto', 'EL MISMO CRON_SECRET del servidor')
on conflict (clave) do update set valor = excluded.valor;
```

Verifica que no se perdió nada:

```bash
python migracion/verificar_migracion.py backup-sistema.json
```

Debe decir `908  908` y *"Sin perdidas"*.

### Crear el bucket de archivos

En Supabase → Storage → New bucket → nombre **`archivos`**, marcado como
público. Ahí van las fotos de equipos, las boletas de compra y los PDF que
suben las pantallas. Sin él, cada subida falla.

### Crear las cuentas de acceso

Después de cargar los datos, una sola vez:

```bash
export SUPABASE_URL=https://xxxx.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=eyJ...

python migracion/crear_usuarios_auth.py --clave salud2026              # ensayo
python migracion/crear_usuarios_auth.py --clave salud2026 --confirmar  # de verdad
```

Crea una cuenta en Supabase Auth por cada fila de `usuario`, escribe su
`auth_id` y deja `force_password_reset = true`, para que la app le exija cambiar
la clave la primera vez. Es re-ejecutable: si una cuenta ya existe, solo la
re-enlaza.

**La clave genérica es una llave maestra mientras dure.** Cualquiera que la sepa
entra como cualquier usuario que todavía no la haya cambiado. Tres cosas que
achican la ventana:

- que no viaje por un grupo de WhatsApp
- crear las cuentas **por tandas**, un CESFAM a la vez, avisando ese mismo día
- revisar a los pocos días quién no ha entrado y desactivarlo

Para ver quién sigue con la clave genérica:

```sql
select email, full_name, role from usuario where force_password_reset;
```

---

## 2. Railway — las funciones

Apunta el servicio a la carpeta `servidor/`. `railway.json` ya define el
healthcheck en `/salud`.

Carga las variables de `servidor/.env.example`. Las obligatorias:

```
SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
CRON_SECRET          # cualquier cadena larga; sin esto las tareas no corren
CORS_ORIGIN          # el dominio del frontend; vacío = abierto a todos
```

Opcionales, según qué quieras encender:

```
RESEND_API_KEY, EMAIL_FROM                                  # correos de alerta
GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN # subida a Drive
RESTRINGIR_INSPECCIONES_POR_CENTRO                          # ver PERMISOS.md
```

Comprobar:

```bash
curl https://TU-SERVICIO.up.railway.app/salud
```

Debe responder `{"ok":true,"funciones":18,"tareas":[...]}`.

---

## 3. Frontend

Necesita tres variables. Créalas como `.env.production` o cárgalas en el panel
de tu hosting:

```
VITE_MODO=supabase
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...          # la anon, NUNCA la service_role
VITE_API_URL=https://TU-SERVICIO.up.railway.app
```

`VITE_MODO` elige el motor del cliente: `supabase` para producción, `local`
para el modo de revisión, y sin valor vuelve a Base44.

**Solo la anon key.** Todo lo que empieza con `VITE_` termina dentro del bundle
que descarga cada usuario. La `service_role` va únicamente en Railway.

```bash
npm install && npm run build
```

Deja el resultado en `dist/`. Súbelo a Railway como sitio estático, o a Vercel
o Netlify — es HTML y JS, no necesita servidor.

**El build de producción no lleva datos reales**: `vite.config.js` reemplaza los
JSON del modo local por uno vacío. Verificado — cero correos y cero equipos en
el bundle.

Falta conectarlo a Supabase: hoy `src/api/base44Client.js` todavía habla el
protocolo de Base44. Ese es el trabajo que queda, junto con la autenticación.

---

## Lo que falta antes de que sirva en producción

1. **Autenticación sobre Supabase Auth.** El control de acceso de Base44 se
   quitó. La tabla `usuario` conserva rol y centro, y tiene una columna
   `auth_id uuid references auth.users(id)` esperando: enlazar es llenarla.
2. **El cliente del frontend**, que aún apunta a Base44.
3. **Google Drive**, si quieres que `subirInspeccionDrive` funcione: el refresh
   token debe ser de la cuenta dueña de la carpeta `BITÁCORA`.
4. **Dominio verificado en Resend**, o los correos de alerta no salen.

---

## Cuidado con el repositorio

`migracion/02_datos.sql`, `src/api/local/datos.json` y `.env.demo` están en el
`.gitignore`: son datos reales de funcionarios y equipamiento de la Corporación.
Van por el zip, **no por git**. Si el repositorio es público, publicarlos sería
una filtración.
