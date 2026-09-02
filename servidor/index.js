// Servidor de las funciones migradas desde Base44.
//
// ponytail: Hono en vez de Express porque las 21 funciones portadas ya reciben
// un Request y devuelven un Response (asi las escribio Deno). Con Hono se
// pasan `c.req.raw` y se devuelve el Response tal cual — cero adaptacion. Con
// Express habria que convertir req/res a Request/Response a mano.
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { handlers } from './funciones/index.js';
import { CABECERA_TAREA } from './base44compat.js';
import { programarTareas, ejecutarAhora, nombresDeTareas } from './tareas.js';

const app = new Hono();

const origenes = (process.env.CORS_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
app.use('/*', cors({
  origin: origenes.length ? origenes : '*',
  allowHeaders: ['authorization', 'content-type'],
  allowMethods: ['GET', 'POST', 'OPTIONS'],
}));

// La cabecera de tarea interna otorga identidad de sistema (ver
// base44compat.js). Se borra de TODO lo que entra por la red, asi solo puede
// nacer dentro del proceso y no hay forma de falsificarla desde afuera.
app.use('/*', async (c, next) => {
  c.req.raw.headers.delete(CABECERA_TAREA);
  await next();
});

app.get('/salud', (c) => c.json({
  ok: true,
  funciones: Object.keys(handlers).length,
  tareas: nombresDeTareas(),
}));

// Disparar una tarea a mano, sin esperar al horario. Protegido con el mismo
// secreto del cron para que no la gatille cualquiera.
app.post('/tareas/:nombre', async (c) => {
  const secreto = c.req.header('x-cron-secret');
  if (!process.env.CRON_SECRET || secreto !== process.env.CRON_SECRET) {
    return c.json({ error: 'No autorizado' }, 401);
  }
  const ok = await ejecutarAhora(c.req.param('nombre'));
  return ok ? c.json({ ok: true }) : c.json({ error: 'Tarea no encontrada' }, 404);
});

// Lo que postean los triggers de Postgres (ver migracion/04_webhooks.sql).
// Misma superficie que /functions pero exigiendo el secreto: registrarHistorial
// escribe la bitacora de auditoria con service role y no se puede dejar abierto.
app.post('/webhooks/:nombre', async (c) => {
  if (!process.env.CRON_SECRET || c.req.header('x-cron-secret') !== process.env.CRON_SECRET) {
    return c.json({ error: 'No autorizado' }, 401);
  }
  const fn = handlers[c.req.param('nombre')];
  if (!fn) return c.json({ error: 'Funcion no encontrada' }, 404);
  try {
    return await fn(c.req.raw);
  } catch (error) {
    console.error(`[webhook ${c.req.param('nombre')}]`, error);
    return c.json({ error: error.message }, 500);
  }
});

app.all('/functions/:nombre', async (c) => {
  const nombre = c.req.param('nombre');
  const fn = handlers[nombre];
  if (!fn) return c.json({ error: `Funcion no encontrada: ${nombre}` }, 404);
  try {
    return await fn(c.req.raw);
  } catch (error) {
    // Las funciones ya atrapan lo suyo; esto es la red por si una revienta
    // antes de su try (p. ej. al leer el body).
    console.error(`[${nombre}]`, error);
    return c.json({ error: error.message }, 500);
  }
});

const port = Number(process.env.PORT) || 3000;
serve({ fetch: app.fetch, port }, () => {
  console.log(`Escuchando en :${port} — ${Object.keys(handlers).length} funciones`);
  programarTareas();
});
