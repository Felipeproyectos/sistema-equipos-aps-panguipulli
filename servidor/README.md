# Servidor de funciones — Gestión de Equipos APS

Las 18 funciones que corrían en Base44 (Deno), ahora en Node sobre Railway.

(Eran 21. Se quitaron `verificarAccesoUsuario`, `aprobarAccesoUsuario` y
`registrarAccesoNoAutorizado` junto con el control de acceso de Base44: la
autenticación se rehace sobre Supabase Auth.)

## Cómo está armado

```
index.js            Hono. POST /functions/:nombre y la API de /api/v1
base44compat.js     Imita el SDK de Base44 sobre Supabase
funciones/*.js      Las 21 funciones — GENERADAS, no editar
funciones/index.js  Registro nombre -> handler — GENERADO
api/                API de integración: otros sistemas entregan información
```

Las funciones **no se editan a mano**. Se generan desde `base44/functions/*/entry.ts`:

```bash
python migracion/portar_funciones.py
```

El portador solo cambia los imports y el envoltorio (`Deno.serve(...)` →
`export default async function (req)`). El cuerpo queda intacto porque
`base44compat.js` expone la misma API que usaban: `auth.me()`,
`entities.X.list/filter/get/create/update/bulkCreate`,
`integrations.Core.SendEmail`, `connectors.getConnection`, `functions.invoke`,
y el par `base44` / `base44.asServiceRole`.

Excepciones, que el portador no toca (listas en `migracion/portar_funciones.py`):
las **nativas**, escritas directo acá (`gestionarAcceso`, `borrarDatosDePrueba`,
`resumenDiarioPendientes`, `subirPautaCabina`, `turnoVehiculo`), y las **corregidas en el
servidor** (`EDITADAS_EN_SERVIDOR`), cuyo `entry.ts` quedó atrás.

`subirPautaCabina` es pública (la Pauta de Cabina se sube sin sesión) y guarda
los archivos con `asServiceRole.integrations.Core.GuardarArchivo`, en el bucket
`archivos` del Storage.

`turnoVehiculo` es la que usa «Mi turno» (migracion/25_turno_chofer.sql): el
chofer toma, cambia y entrega vehículos, y Movilización libera los que quedan
sin entregar. Decide la disponibilidad con `compartido/turnoFlota.js`, la misma
regla que muestra la pantalla.

Si Base44 cambia una función, se re-exporta el `.ts` y se corre el portador.

## API de integración (`api/`)

`/api/v1` deja que otros sistemas **entreguen** cargas de combustible,
lecturas de odómetro del GPS y pagos de vehículos, cada uno con su propia
clave. La guía para quien la consume: [`API.md`](API.md). El contrato:
`GET /api/v1/openapi.json`.

```
api/index.js        Rutas, autenticación, límites, registro de llamadas
api/recursos.js     Qué se puede enviar: tabla, alcance, campos y reglas
api/validacion.js   Validación campo por campo
api/claves.js       Formato y hash (HMAC-SHA256 + API_CLAVES_PEPPER)
api/limite.js       Límite por minuto y por intentos fallidos (en memoria)
api/datos.js        Acceso a Supabase con la llave de servicio
api/openapi.js      El contrato, armado desde recursos.js
```

Los accesos se administran con `gestionarApiClientes` (nativa, solo Base del
Sistema), desde *Configuración → API de integración*. Requiere
`migracion/34_api_integracion.sql` y `API_CLAVES_PEPPER`.

Pruebas, sin Supabase:

```bash
npm test
```

## Equivalencias

| Base44 | Acá |
|---|---|
| `base44.entities.X` | Supabase con el JWT del usuario → aplican las policies de `03_policies.sql` |
| `base44.asServiceRole.entities.X` | Supabase con service role → sin RLS |
| `auth.me()` | Valida el JWT y devuelve la fila de `usuario` (rol, centro) |
| `integrations.Core.SendEmail` | Resend vía `fetch` |
| `connectors.getConnection('googledrive')` | Refresh token de Google → access token |
| `functions.invoke(n, p)` | Llama al handler en proceso, sin vuelta por HTTP |

## Desplegar en Railway

1. Sube este repo (o solo `servidor/`) y apunta el servicio a esta carpeta.
2. Carga las variables de `.env.example` en Railway → Variables.
3. Deploy. `railway.json` ya define el healthcheck en `/salud`.

Verificar:

```bash
curl https://TU-SERVICIO.up.railway.app/salud
```

Debe responder `{"ok":true,"funciones":18}`.

## Local

```bash
npm install && cp .env.example .env && npm run dev
```

## Automatizaciones

Lo que en Base44 disparaba la plataforma, aca corre en este mismo proceso.

**Tareas programadas** (`tareas.js`, zona `America/Santiago`):

| Cuando | Que |
|---|---|
| 03:00 diario | `generarAlertasAutomaticas` — vencimientos de parches y baterias |
| 07:00 diario | `verificarStockRepuestos` — repuestos bajo el minimo |
| 08:00 lunes a viernes | `resumenDiarioPendientes` — a cada persona, lo que la espera (solo si hay algo). Se apaga con `RESUMEN_DIARIO=off` |
| 03:30 diario | `purgarRegistroApi` — borra de `api_registro` lo anterior a `API_REGISTRO_DIAS` (180) |

Necesitan `CRON_SECRET`. Sin esa variable quedan apagadas y el arranque lo avisa.
Las que mandan correo necesitan además `RESEND_API_KEY` y `EMAIL_FROM`. El
enlace del resumen diario usa `APP_URL` (o, si no está, la primera dirección de
`CORS_ORIGIN`).

El resumen diario cuenta con las mismas reglas que el número del menú. Esas
reglas viven en `src/lib/` y se copian a `servidor/compartido/` (Railway solo
despliega esta carpeta):

```bash
python migracion/sincronizar_compartido.py              # copiar
python migracion/sincronizar_compartido.py --verificar  # revisar que esten iguales
```
Para dispararlas a mano sin esperar al horario:

```bash
curl -X POST https://TU-SERVICIO.up.railway.app/tareas/generarAlertasAutomaticas -H "x-cron-secret: EL_SECRETO"
```

**Disparadores de entidad** (`POST /webhooks/:nombre`): los triggers de Postgres
de `migracion/04_webhooks.sql` avisan cada create/update/delete. Alimentan
`registrarHistorial` (bitacora de auditoria) y `notificarSolicitudRepuesto`.
Despues de correr ese SQL hay que cargar la config una sola vez:

```sql
insert into config_webhook (clave, valor) values
  ('url', 'https://TU-SERVICIO.up.railway.app'),
  ('secreto', 'EL MISMO CRON_SECRET')
on conflict (clave) do update set valor = excluded.valor;
```

## Pendiente antes de que sirva de verdad

- **`GOOGLE_REFRESH_TOKEN`** debe ser de la cuenta dueña de la carpeta `BITÁCORA`
  en Drive. Sin eso, `subirInspeccionDrive` y `generarDocumentoPrueba` fallan.
- **Verificar el dominio en Resend** antes de que `enviarAlertasCESFAM` mande algo.
- **`CORS_ORIGIN`** apuntando al dominio real del frontend. Vacío = abierto a todos.
