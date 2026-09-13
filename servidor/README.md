# Servidor de funciones — Gestión de Equipos APS

Las 18 funciones que corrían en Base44 (Deno), ahora en Node sobre Railway.

(Eran 21. Se quitaron `verificarAccesoUsuario`, `aprobarAccesoUsuario` y
`registrarAccesoNoAutorizado` junto con el control de acceso de Base44: la
autenticación se rehace sobre Supabase Auth.)

## Cómo está armado

```
index.js            Hono. Una ruta: POST /functions/:nombre
base44compat.js     Imita el SDK de Base44 sobre Supabase
funciones/*.js      Las 21 funciones — GENERADAS, no editar
funciones/index.js  Registro nombre -> handler — GENERADO
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

Si Base44 cambia una función, se re-exporta el `.ts` y se corre el portador.

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

Necesitan `CRON_SECRET`. Sin esa variable quedan apagadas y el arranque lo avisa.
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
