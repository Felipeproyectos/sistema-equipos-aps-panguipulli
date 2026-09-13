// Imita la parte del SDK de Base44 que usan las 21 funciones, sobre Supabase.
//
// ponytail: existe para que las funciones portadas no se toquen. La superficie
// real que usan es chica y cerrada (list/filter/get/create/update/bulkCreate,
// auth.me, SendEmail, getConnection, functions.invoke); imitarla cuesta menos
// que reescribir 21 handlers, y deja el diff de cada uno en dos lineas.
import { createClient } from '@supabase/supabase-js';

const { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY } = process.env;

for (const [k, v] of Object.entries({ SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY })) {
  if (!v) throw new Error(`Falta la variable de entorno ${k}`);
}

// Marca de "esto lo dispara el propio servidor, no una persona".
export const CABECERA_TAREA = 'x-tarea-interna';

const opciones = { auth: { persistSession: false, autoRefreshToken: false } };
const servicio = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, opciones);

// Misma regla de nombres que migracion/generar_sql.py. Si cambia alla, cambia aca.
export function tabla(entidad) {
  if (entidad === 'User') return 'usuario'; // palabra reservada en Postgres
  return entidad
    .replace(/(.)([A-Z][a-z]+)/g, '$1_$2')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase();
}

function desempacar({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

// '-created_date' = descendente; 'created_date' = ascendente.
function ordenar(q, sort) {
  if (!sort) return q;
  const desc = sort.startsWith('-');
  return q.order(desc ? sort.slice(1) : sort, { ascending: !desc });
}

function condiciones(q, filtro) {
  for (const [campo, valor] of Object.entries(filtro || {})) {
    if (valor && typeof valor === 'object' && Array.isArray(valor.$in)) q = q.in(campo, valor.$in);
    else if (valor === null) q = q.is(campo, null);
    else q = q.eq(campo, valor);
  }
  return q;
}

function limitar(q, limite) {
  return limite ? q.limit(limite) : q;
}

function entidad(db, nombre) {
  const t = tabla(nombre);
  const sel = () => db.from(t).select('*');
  return {
    list: (sort, limite) => limitar(ordenar(sel(), sort), limite).then(desempacar),
    filter: (filtro, sort, limite) =>
      limitar(ordenar(condiciones(sel(), filtro), sort), limite).then(desempacar),
    get: (id) => db.from(t).select('*').eq('id', id).maybeSingle().then(desempacar),
    create: (obj) => db.from(t).insert(obj).select().single().then(desempacar),
    // id y created_date/updated_date los pone Postgres (ver 01_esquema.sql):
    // default gen_random_uuid()::text y el trigger tocar_updated_date.
    bulkCreate: (arr) => db.from(t).insert(arr).select().then(desempacar),
    update: (id, cambios) =>
      db.from(t).update(cambios).eq('id', id).select().single().then(desempacar),
    delete: (id) => db.from(t).delete().eq('id', id).then(desempacar).then(() => ({})),
  };
}

// Proxy: `entities.LoQueSea` resuelve sin listar las 26 entidades a mano.
function entidades(db) {
  const cache = new Map();
  return new Proxy({}, {
    get(_, nombre) {
      if (typeof nombre !== 'string') return undefined;
      if (!cache.has(nombre)) cache.set(nombre, entidad(db, nombre));
      return cache.get(nombre);
    },
  });
}

// ── integraciones ───────────────────────────────────────────────────────────
async function SendEmail({ to, subject, body, from }) {
  const { RESEND_API_KEY, EMAIL_FROM } = process.env;
  if (!RESEND_API_KEY) throw new Error('Falta RESEND_API_KEY');
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${RESEND_API_KEY}`, 'content-type': 'application/json' },
    // Base44 mandaba `body` como HTML.
    body: JSON.stringify({ from: from || EMAIL_FROM, to: [to], subject, html: body }),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${await r.text()}`);
  return r.json();
}

// ponytail: un refresh token de la cuenta que ya es duena de la carpeta
// BITACORA, no una service account. Asi los documentos siguen apareciendo en
// el mismo Drive de siempre; una service account los dejaria en un Drive
// propio sin cuota, y habria que montar una unidad compartida antes.
let tokenDrive = { valor: null, expira: 0 };
async function getConnection(nombre) {
  if (nombre !== 'googledrive') throw new Error(`Conector no soportado: ${nombre}`);
  if (tokenDrive.valor && Date.now() < tokenDrive.expira) {
    return { accessToken: tokenDrive.valor };
  }
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = process.env;
  if (!GOOGLE_REFRESH_TOKEN) throw new Error('Falta GOOGLE_REFRESH_TOKEN');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: GOOGLE_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  if (!r.ok) throw new Error(`Google OAuth ${r.status}: ${await r.text()}`);
  const j = await r.json();
  // 60 s de colchon para no usar un token que vence en vuelo.
  tokenDrive = { valor: j.access_token, expira: Date.now() + (j.expires_in - 60) * 1000 };
  return { accessToken: j.access_token };
}

// ── cliente ─────────────────────────────────────────────────────────────────
export function createClientFromRequest(req) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');

  // Cliente con el JWT del usuario: las policies de 03_policies.sql aplican.
  const comoUsuario = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    ...opciones,
    global: { headers: token ? { Authorization: `Bearer ${token}` } : {} },
  });

  // Las tareas programadas no tienen un usuario detras, pero las funciones que
  // ejecutan piden auth.me(). Se les da una identidad de sistema. La cabecera
  // solo puede venir de dentro del proceso: index.js la borra de todo request
  // que entre por la red (ver `serve` mas abajo en ese archivo).
  const esTareaInterna = req.headers.get(CABECERA_TAREA) === process.env.CRON_SECRET
    && !!process.env.CRON_SECRET;

  async function me() {
    if (esTareaInterna) {
      return { id: 'sistema', email: 'sistema@local', full_name: 'Tarea programada', role: 'super_admin' };
    }
    if (!token) return null;
    const { data, error } = await comoUsuario.auth.getUser(token);
    if (error || !data?.user?.email) return null;
    // El perfil vive en `usuario` (heredado de Base44): trae role,
    // centro_principal. Se busca por email porque el id de
    // Base44 es un ObjectId y el de auth.users es un uuid.
    const { data: fila } = await servicio
      .from('usuario').select('*').ilike('email', data.user.email).maybeSingle();
    return fila || null;
  }

  // functions.invoke resuelve en proceso, sin dar la vuelta por HTTP.
  // El import es diferido a proposito: funciones/index.js importa este modulo.
  const invoke = async (nombre, payload) => {
    const { handlers } = await import('./funciones/index.js');
    const fn = handlers[nombre];
    if (!fn) throw new Error(`Funcion no encontrada: ${nombre}`);
    const interna = new Request(new URL(req.url), {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) },
      body: JSON.stringify(payload ?? {}),
    });
    const res = await fn(interna);
    return { data: await res.json(), status: res.status };
  };

  const integraciones = { Core: { SendEmail } };

  return {
    auth: { me },
    entities: entidades(comoUsuario),
    integrations: integraciones,
    functions: { invoke },
    asServiceRole: {
      entities: entidades(servicio),
      integrations: integraciones,
      connectors: { getConnection },
      functions: { invoke },
    },
  };
}
