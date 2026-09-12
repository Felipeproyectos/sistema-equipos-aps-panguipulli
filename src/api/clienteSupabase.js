// El tercer traductor. Expone la misma API que usaba el SDK de Base44, pero
// sobre Supabase — asi las ~214 llamadas repartidas por la app no se tocan.
//
// Los otros dos, para comparar:
//   servidor/base44compat.js  -> Supabase, en Node, con la llave de servicio
//   src/api/local/compat.js   -> datos en memoria, para el modo local
//
// La diferencia de este: usa la SESION DEL USUARIO, no la llave de servicio.
// Eso es a proposito — las policies de migracion/03_policies.sql tienen que
// aplicar. Si usara la service role key, cualquiera veria todo.
import { createClient } from '@supabase/supabase-js';

const URL = import.meta.env.VITE_SUPABASE_URL;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;
// El servidor de Railway, para las 18 funciones de backend.
const API = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

// Perezoso a proposito: si se creara al importar, el modo local reventaria
// solo por tener este archivo en el grafo de modulos, sin usarlo nunca.
let _supabase = null;
export function cliente() {
  if (!_supabase) {
    if (!URL || !ANON) throw new Error('Faltan VITE_SUPABASE_URL y/o VITE_SUPABASE_ANON_KEY');
    _supabase = createClient(URL, ANON, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  return _supabase;
}

// Mismo mapeo de nombres que migracion/generar_sql.py y servidor/base44compat.js.
// Si cambia en uno, cambia en los tres.
export function tabla(entidad) {
  if (entidad === 'User') return 'usuario';   // palabra reservada en Postgres
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

const limitar = (q, n) => (n ? q.limit(n) : q);

function entidad(nombre) {
  const t = tabla(nombre);
  const sel = () => cliente().from(t).select('*');
  return {
    list: (sort, n) => limitar(ordenar(sel(), sort), n).then(desempacar),
    filter: (f, sort, n) => limitar(ordenar(condiciones(sel(), f), sort), n).then(desempacar),
    get: (id) => cliente().from(t).select('*').eq('id', id).maybeSingle().then(desempacar),
    create: (obj) => cliente().from(t).insert(obj).select().single().then(desempacar),
    // id, created_date y updated_date los pone Postgres (ver 01_esquema.sql).
    bulkCreate: (arr) => cliente().from(t).insert(arr).select().then(desempacar),
    update: (id, cambios) =>
      cliente().from(t).update(cambios).eq('id', id).select().single().then(desempacar),
    delete: (id) => cliente().from(t).delete().eq('id', id).then(desempacar).then(() => ({})),
    bulkUpdate: (items) => Promise.all(items.map((i) => entidad(nombre).update(i.id, i))),
    bulkDelete: (ids) => Promise.all(ids.map((id) => entidad(nombre).delete(id))),
  };
}

// Proxy: `entities.LoQueSea` resuelve sin listar las 25 entidades a mano.
const cache = new Map();
const entities = new Proxy({}, {
  get(_, nombre) {
    if (typeof nombre !== 'string') return undefined;
    if (!cache.has(nombre)) cache.set(nombre, entidad(nombre));
    return cache.get(nombre);
  },
});

// ── sesion ──────────────────────────────────────────────────────────────────
async function sesion() {
  const { data } = await cliente().auth.getSession();
  return data?.session || null;
}

// El perfil (rol, centro, subsedes) vive en la tabla `usuario`, heredada de
// Base44. Se busca por correo porque los id de Base44 son ObjectId y los de
// auth.users son uuid; la columna auth_id los enlaza (ver 03_policies.sql).
async function me() {
  const s = await sesion();
  const email = s?.user?.email;
  if (!email) return null;
  const { data } = await cliente().from('usuario').select('*').ilike('email', email).maybeSingle();
  return data || null;
}

const auth = {
  me,
  isAuthenticated: async () => !!(await sesion()),
  logout: async (destino) => {
    await cliente().auth.signOut();
    window.location.href = typeof destino === 'string' ? destino : '/';
  },
  // La app llamaba a esto para mandar al login de Base44. Ahora el login es
  // una pantalla propia: basta con volver a la raiz, donde vive Bienvenida.
  redirectToLogin: () => { window.location.href = '/'; },
  updateMe: async (cambios) => {
    const yo = await me();
    if (!yo) throw new Error('No hay sesion activa');
    return entities.User.update(yo.id, cambios);
  },
  // Extra, para la pantalla de cambio de clave obligatorio.
  cambiarClave: async (nueva) => {
    const { error } = await cliente().auth.updateUser({ password: nueva });
    if (error) throw new Error(error.message);
    const yo = await me();
    if (yo) await entities.User.update(yo.id, { force_password_reset: false });
  },
  // Las cuentas creadas con Google (provider_type = social) NO tienen clave:
  // signInWithPassword siempre responde "Invalid login credentials" con ellas.
  // Sin esto no habia forma de que entraran — la pantalla de ingreso solo
  // ofrecia correo+clave. El destino tiene que estar en la lista de Redirect
  // URLs del proyecto (Authentication -> URL Configuration).
  // El Site URL del proyecto apunta a otra aplicacion (carrera.apscolab.com) y
  // es un valor unico para todo el proyecto: cambiarlo romperia la recuperacion
  // de esa otra app. Se manda `redirectTo` explicito, que gana sobre el Site URL
  // siempre que este en la lista de Redirect URLs.
  // El SMTP por defecto de Supabase manda unos pocos correos por hora y su
  // Site URL apunta a otra aplicacion del mismo proyecto: en la practica el
  // correo no llegaba. El servidor genera el enlace con la llave de servicio y
  // lo despacha por Resend, que es el que ya usa el resto del sistema.
  enviarCorreoRecuperacion: async (email) => {
    await functions.invoke('gestionarAcceso', {
      accion: 'recuperar',
      email,
      origen: window.location.origin,
    });
  },

  // Supabase avisa con PASSWORD_RECOVERY cuando la sesion viene de un enlace de
  // recuperacion. Sin escucharlo, quien entra por ese enlace pasa directo al
  // Dashboard sin fijar clave nueva — y queda dentro sin saber cual es la suya.
  alRecuperarClave: (alDetectar) => {
    const { data } = cliente().auth.onAuthStateChange((evento) => {
      if (evento === 'PASSWORD_RECOVERY') alDetectar();
    });
    return () => data?.subscription?.unsubscribe();
  },

  entrarConGoogle: async () => {
    const { error } = await cliente().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/Dashboard` },
    });
    if (error) throw new Error(error.message);
  },
  entrarConClave: async (email, clave) => {
    const { error } = await cliente().auth.signInWithPassword({ email, password: clave });
    if (error) throw new Error(error.message);
    return me();
  },
};

// ── funciones de backend (Railway) ──────────────────────────────────────────
const functions = {
  invoke: async (nombre, payload) => {
    if (!API) throw new Error('Falta VITE_API_URL (el servidor de Railway)');
    const s = await sesion();
    const res = await fetch(`${API}/functions/${nombre}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(s?.access_token && { authorization: `Bearer ${s.access_token}` }),
      },
      body: JSON.stringify(payload ?? {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const e = new Error(data?.error || `Error ${res.status}`);
      e.status = res.status;
      e.data = data;
      throw e;
    }
    return { data, status: res.status };
  },
};

// ── integraciones ───────────────────────────────────────────────────────────
const BUCKET = 'archivos';

const integrations = {
  Core: {
    UploadFile: async ({ file }) => {
      if (!file) return { file_url: '' };
      const ruta = `${Date.now()}-${file.name.replace(/[^\w.\-]/g, '_')}`;
      const { error } = await cliente().storage.from(BUCKET).upload(ruta, file);
      if (error) throw new Error(error.message);
      const { data } = cliente().storage.from(BUCKET).getPublicUrl(ruta);
      return { file_url: data.publicUrl };
    },
    // El correo sale del servidor, que es quien tiene la llave de Resend.
    SendEmail: (args) => functions.invoke('enviarCorreo', args).then((r) => r.data),
    // ponytail: no se reimplementa. Era la extraccion con IA de Base44, que
    // leia un archivo cualquiera contra un json_schema. La usa una sola
    // pantalla (carga masiva de repuestos) y `repuesto` tiene 0 filas: nunca
    // se completo una carga. Falla con un mensaje claro en vez de raro.
    ExtractDataFromUploadedFile: async () => {
      throw new Error(
        'La carga masiva con IA era una función de Base44 y no se migró. ' +
        'Agrega los repuestos uno a uno, o pídeme una importación desde CSV.',
      );
    },
  },
};

// ── cuentas de acceso ───────────────────────────────────────────────────────
// En Base44 esto lo hacia la plataforma (base44.users.inviteUser). Al migrar no
// quedo nada en su lugar y crear un usuario reventaba con "undefined". Todo
// pasa ahora por la funcion gestionarAcceso, que es la unica que tiene la llave
// de servicio para tocar Supabase Auth.
const users = {
  diagnostico: () => functions.invoke('gestionarAcceso', { accion: 'diagnostico' }).then((r) => r.data),
  crear: (datos) => functions.invoke('gestionarAcceso', { accion: 'crear', ...datos }).then((r) => r.data),
  reparar: () => functions.invoke('gestionarAcceso', { accion: 'reparar' }).then((r) => r.data),
  restablecerClave: (email) =>
    functions.invoke('gestionarAcceso', { accion: 'restablecer', email }).then((r) => r.data),
};

export const clienteSupabase = { entities, auth, functions, integrations, users };
