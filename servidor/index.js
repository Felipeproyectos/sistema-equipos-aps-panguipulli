// Servidor de las funciones migradas desde Base44.
//
// ponytail: Hono en vez de Express porque las 21 funciones portadas ya reciben
// un Request y devuelven un Response (asi las escribio Deno). Con Hono se
// pasan `c.req.raw` y se devuelve el Response tal cual — cero adaptacion. Con
// Express habria que convertir req/res a Request/Response a mano.
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { bodyLimit } from 'hono/body-limit';
import { handlers } from './funciones/index.js';
import { CABECERA_TAREA } from './base44compat.js';
import { programarTareas, ejecutarAhora, nombresDeTareas } from './tareas.js';
import { crearTope } from './compartido/pautaPublica.js';

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

// Las que solo disparan los triggers de Postgres. Por /functions no piden el
// secreto: registrarHistorial escribiría en Auditoría lo que cualquiera le
// mandara (con la llave de servicio), y notificarSolicitudRepuesto mandaría
// correos con un texto inventado. Acá no existen: solo por /webhooks.
// notificarSolicitudMonitor, lo mismo: avisa al Monitor y a los centros.
const SOLO_WEBHOOK = new Set(['registrarHistorial', 'notificarSolicitudRepuesto', 'notificarSolicitudMonitor']);

// ── Barreras de lo que entra sin sesión ────────────────────────────────────
// Las pautas se llenan desde un enlace público, sin cuenta. Antes de tocar la
// base, cada dirección de red tiene un tope de envíos (holgado para un centro
// entero que sale por la misma dirección, estrecho para un programa). Lo que
// pasa de acá todavía enfrenta los topes por equipo y el freno general de
// src/lib/pautaPublica.js.
const RECIBEN_SIN_SESION = new Set(['guardarInspeccionPendiente', 'subirPautaCabina']);
const topePorRed = crearTope();

// La dirección de quien llama. Railway pone delante un proxy que la entrega en
// x-real-ip y la agrega al final de x-forwarded-for; lo que venga antes en esa
// cadena lo escribió quien llama y no se cree. Las direcciones internas (las
// de los propios proxies) se saltan. Si no se puede saber, devuelve '' y ese
// envío no cuenta para el tope por red: es preferible eso a que todos los
// centros compartan un mismo contador y se bloqueen entre sí. Igual lo frenan
// los topes por equipo y el freno general.
const ES_INTERNA = /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|::1$|f[cd]|fe80:)/i;
function direccionDeRed(c) {
  const limpia = (d) => String(d || '').trim().replace(/^::ffff:/i, '');
  const candidatas = [
    c.req.header('x-real-ip'),
    ...(c.req.header('x-forwarded-for') || '').split(',').reverse(),
    c.env?.incoming?.socket?.remoteAddress,
  ].map(limpia).filter(Boolean);
  return candidatas.find((d) => !ES_INTERNA.test(d)) || '';
}

// Ningún cuerpo legítimo pasa de esto: lo más pesado es la Pauta de Cabina,
// hasta 20 MB de archivos que en base64 son unos 27.
app.use('/functions/*', bodyLimit({
  maxSize: 30 * 1024 * 1024,
  onError: (c) => c.json({ error: 'El envío es demasiado grande' }, 413),
}));

app.all('/functions/:nombre', async (c) => {
  const nombre = c.req.param('nombre');
  const origen = c.req.method === 'POST' && RECIBEN_SIN_SESION.has(nombre) ? direccionDeRed(c) : '';
  if (origen && !topePorRed.permitir(origen)) {
    console.warn(`[tope] ${nombre}: demasiados envíos desde ${origen}`);
    c.header('Retry-After', '600');
    return c.json({ error: 'Se enviaron demasiadas pautas desde esta conexión. Espera unos minutos y vuelve a intentarlo.' }, 429);
  }
  const fn = SOLO_WEBHOOK.has(nombre) ? null : handlers[nombre];
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
