// Modo local: los 908 registros del respaldo, en memoria, con la misma API que
// exponia el SDK de Base44.
//
// Sirve a dos consumidores a la vez:
//  - las 21 funciones portadas (importan '#compat', que Vite apunta aca)
//  - el frontend, via src/api/base44Client.js
//
// ponytail: el respaldo (1,2 MB) vive solo en memoria — no cabe comodo en
// localStorage. Lo que si se guarda es un diario de los cambios: unas pocas
// filas, no el dataset. Asi se puede seguir un flujo entre roles (el mecanico
// solicita, el jefe aprueba, compras compra) sin que cambiar de usuario, que
// recarga la pagina, borre lo hecho.
import datos from './datos.json';
import prueba from './datos-prueba.json';

// ── almacen ─────────────────────────────────────────────────────────────────
const almacen = new Map(Object.entries(structuredClone(datos)));

// Perfiles y datos de prueba para los roles que en produccion no tienen a
// nadie (admin, mecanico, y los dos de compras). Viven aparte del respaldo:
// regenerar datos.json no los pisa, y no entran a la migracion.
function sembrarPrueba() {
  // Fuera del modo local, vite.config.js cambia datos-prueba.json por el
  // vacio ({}) para no llevar datos reales al bundle publico. base44Client.js
  // importa este archivo sin condicion (para el modo local), asi que esta
  // funcion igual se ejecuta al cargar el modulo — sin nada que sembrar.
  if (!prueba.User) return;
  for (const [entidad, filas] of Object.entries(prueba)) {
    if (entidad.startsWith('_')) continue;
    const tabla = tablaDe(entidad);
    for (const fila of structuredClone(filas)) {
      if (!tabla.some((f) => f.id === fila.id)) tabla.push(fila);
    }
  }
  // Sin una OT asignada, el mecanico entra a una pantalla vacia y no hay nada
  // que revisar. Se le dan tres, una en cada estado de su flujo.
  const mecanico = prueba.User.find((u) => u.role === 'mecanico');
  const estados = ['asignada', 'en_proceso', 'pausada'];
  tablaDe('OrdenTrabajo')
    .filter((o) => !o.mecanico_email && !['completada', 'cancelada'].includes(o.estado))
    .slice(0, estados.length)
    .forEach((o, i) => {
      o.mecanico_email = mecanico.email;
      o.mecanico_nombre = mecanico.full_name;
      o.estado = estados[i];
      o.fecha_asignacion = '2026-08-30';
    });
}

export function tablaDe(entidad) {
  return almacen.get(entidad) || almacen.set(entidad, []).get(entidad);
}

export function reiniciar() {
  for (const [k, v] of Object.entries(structuredClone(datos))) almacen.set(k, v);
  sembrarPrueba();
}

// ── diario de cambios ───────────────────────────────────────────────────────
const CLAVE_DIARIO = 'local_diario';
let diario = [];
try { diario = JSON.parse(localStorage.getItem(CLAVE_DIARIO) || '[]'); } catch { diario = []; }

function anotarCambio(entrada) {
  diario.push(entrada);
  try { localStorage.setItem(CLAVE_DIARIO, JSON.stringify(diario)); } catch { /* lleno o modo privado */ }
}

export function borrarDiario() {
  diario = [];
  try { localStorage.removeItem(CLAVE_DIARIO); } catch { /* da igual */ }
  window.location.reload();
}

export const cambiosGuardados = () => diario.length;

// Se reaplica sin volver a anotar, o el diario crecería en cada recarga.
let reaplicando = false;
function reaplicarDiario() {
  reaplicando = true;
  for (const c of diario) {
    const t = tablaDe(c.entidad);
    if (c.op === 'create') { if (!t.some((f) => f.id === c.fila.id)) t.push(c.fila); }
    else if (c.op === 'update') { const f = t.find((x) => x.id === c.id); if (f) Object.assign(f, c.cambios); }
    else if (c.op === 'delete') { const i = t.findIndex((x) => x.id === c.id); if (i >= 0) t.splice(i, 1); }
  }
  reaplicando = false;
}

// Primero la semilla (base limpia), despues el diario encima.
sembrarPrueba();
reaplicarDiario();

// Los ids nuevos los pone Postgres en produccion; aca basta con algo unico.
const nuevoId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 24);

function coincide(fila, filtro) {
  return Object.entries(filtro || {}).every(([campo, valor]) => {
    if (valor && typeof valor === 'object' && Array.isArray(valor.$in)) {
      return valor.$in.includes(fila[campo]);
    }
    return fila[campo] === valor;
  });
}

function ordenar(filas, sort) {
  if (!sort) return filas;
  const desc = sort.startsWith('-');
  const campo = desc ? sort.slice(1) : sort;
  return [...filas].sort((a, b) => {
    const x = a[campo] ?? '', y = b[campo] ?? '';
    return (x < y ? -1 : x > y ? 1 : 0) * (desc ? -1 : 1);
  });
}

function entidad(nombre) {
  const filas = () => tablaDe(nombre);
  const leer = (filtro, sort, limite) => {
    let r = filtro ? filas().filter((f) => coincide(f, filtro)) : filas();
    r = ordenar(r, sort);
    return Promise.resolve(structuredClone(limite ? r.slice(0, limite) : r));
  };
  const crear = (obj) => {
    const ahora = new Date().toISOString();
    const fila = { id: nuevoId(), created_date: ahora, updated_date: ahora, ...obj };
    filas().push(fila);
    if (!reaplicando) anotarCambio({ op: 'create', entidad: nombre, fila: structuredClone(fila) });
    return structuredClone(fila);
  };
  return {
    list: (sort, limite) => leer(null, sort, limite),
    filter: (f, sort, limite) => leer(f, sort, limite),
    get: (id) => Promise.resolve(structuredClone(filas().find((f) => f.id === id) || null)),
    create: (obj) => Promise.resolve(crear(obj)),
    bulkCreate: (arr) => Promise.resolve(arr.map(crear)),
    update: (id, cambios) => {
      const fila = filas().find((f) => f.id === id);
      if (!fila) return Promise.reject(new Error(`${nombre} ${id} no existe`));
      const conFecha = { ...cambios, updated_date: new Date().toISOString() };
      Object.assign(fila, conFecha);
      if (!reaplicando) anotarCambio({ op: 'update', entidad: nombre, id, cambios: structuredClone(conFecha) });
      return Promise.resolve(structuredClone(fila));
    },
    delete: (id) => {
      const i = filas().findIndex((f) => f.id === id);
      if (i >= 0) filas().splice(i, 1);
      if (!reaplicando) anotarCambio({ op: 'delete', entidad: nombre, id });
      return Promise.resolve({});
    },
    bulkUpdate: (items) => Promise.all(items.map((i) => entidad(nombre).update(i.id, i))),
    bulkDelete: (ids) => Promise.all(ids.map((id) => entidad(nombre).delete(id))),
  };
}

const cacheEntidades = new Map();
const entidades = new Proxy({}, {
  get(_, nombre) {
    if (typeof nombre !== 'string') return undefined;
    if (!cacheEntidades.has(nombre)) cacheEntidades.set(nombre, entidad(nombre));
    return cacheEntidades.get(nombre);
  },
});

// ── usuario activo ──────────────────────────────────────────────────────────
const CLAVE_USUARIO = 'local_email_usuario';

export function usuariosDisponibles() {
  return structuredClone(tablaDe('User')).sort((a, b) =>
    (a.full_name || a.email).localeCompare(b.full_name || b.email));
}

// Si no hay nadie elegido, el modo local arranca en la pantalla de bienvenida
// en vez de meterte directo — asi se puede revisar el inicio de sesion.
export function haySesion() {
  try { return !!localStorage.getItem(CLAVE_USUARIO); } catch { return false; }
}

export function cerrarSesion() {
  try { localStorage.removeItem(CLAVE_USUARIO); } catch { /* da igual */ }
  window.location.href = '/';
}

// La pantalla de Bienvenida llama a redirectToLogin; aca eso abre el selector
// de cuenta, que es lo mas parecido a elegir con quien entras.
export function pedirCuenta() {
  window.dispatchEvent(new CustomEvent('local-pedir-cuenta'));
}

export function emailActivo() {
  try { return localStorage.getItem(CLAVE_USUARIO) || null; } catch { return null; }
}

export function cambiarUsuario(email) {
  try { localStorage.setItem(CLAVE_USUARIO, email); } catch { /* modo privado */ }
  window.location.reload();
}

function usuarioActual() {
  const email = emailActivo();
  return structuredClone(tablaDe('User').find((u) => u.email === email) || null);
}

// ── integraciones sin backend ───────────────────────────────────────────────
// Lo que en produccion es Supabase Storage / Resend / Google Drive. Aca se
// registran en `llamadasSinBackend` para que se vea, en la propia pantalla,
// que funcion depende de que servicio externo.
export const llamadasSinBackend = [];

function anotar(servicio, detalle) {
  llamadasSinBackend.push({ servicio, detalle, hora: new Date().toLocaleTimeString('es-CL') });
  window.dispatchEvent(new CustomEvent('local-sin-backend'));
  console.warn(`[modo local] ${servicio}:`, detalle);
}

const integraciones = {
  Core: {
    UploadFile: async ({ file }) => {
      anotar('Storage', `UploadFile: ${file?.name || 'archivo'}`);
      // URL de blob: la imagen/PDF se ve en pantalla, pero muere al recargar.
      return { file_url: file ? URL.createObjectURL(file) : '' };
    },
    SendEmail: async ({ to, subject }) => {
      anotar('Email', `${subject} -> ${to}`);
      return { ok: true, simulado: true };
    },
  },
};

const conectores = {
  getConnection: async (nombre) => {
    anotar('Google Drive', `getConnection('${nombre}')`);
    throw new Error('Google Drive no esta conectado en modo local');
  },
};

// ── invoke: corre las funciones portadas de verdad ──────────────────────────
async function invoke(nombre, payload) {
  const { handlers } = await import('../../../servidor/funciones/index.js');
  const fn = handlers[nombre];
  if (!fn) throw new Error(`Funcion no encontrada: ${nombre}`);
  const req = new Request(`${window.location.origin}/functions/${nombre}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer local' },
    body: JSON.stringify(payload ?? {}),
  });
  const res = await fn(req);
  const data = await res.json();
  if (!res.ok) {
    const e = new Error(data?.error || `Error ${res.status}`);
    e.status = res.status; e.data = data;
    throw e;
  }
  return { data, status: res.status };
}

// ── las dos caras del modulo ────────────────────────────────────────────────
// 1. Para las funciones portadas: misma firma que servidor/base44compat.js.
//    En local no hay RLS, asi que `entities` y `asServiceRole.entities` son
//    lo mismo — ojo con eso al revisar permisos (ver README-LOCAL.md).
export function createClientFromRequest() {
  const comun = {
    entities: entidades,
    integrations: integraciones,
    connectors: conectores,
    functions: { invoke },
  };
  return { auth: { me: async () => usuarioActual() }, ...comun, asServiceRole: comun };
}

// 2. Para el frontend, en lugar del cliente del SDK.
export const clienteLocal = {
  entities: entidades,
  integrations: integraciones,
  connectors: conectores,
  functions: { invoke },
  auth: {
    me: async () => {
      const u = usuarioActual();
      if (!u) throw new Error('No hay usuario activo');
      return u;
    },
    logout: () => cerrarSesion(),
    redirectToLogin: () => pedirCuenta(),
    isAuthenticated: async () => haySesion(),
  },
};
