import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';
import { isSimulandoActivo, MENSAJE_BLOQUEO_SIMULACION } from '@/lib/roleSimulator';
import { clienteLocal } from '@/api/local/compat';
import { clienteSupabase } from '@/api/clienteSupabase';
import { PERMISOS } from '@/lib/permisos';
import { describir, debeAuditarse } from '@/lib/auditoria';

const { appId, token, functionsVersion, appBaseUrl } = appParams;

// El motor se elige aca y en ningun otro lado. Las ~214 llamadas de la app
// entran por el Proxy de mas abajo, asi que cambiar de motor no toca ninguna
// pantalla — todo lo que sigue (bloqueo de simulacion, solo lectura del
// Monitor, borrado logico) vale igual sea cual sea.
//
//   VITE_MODO=local      -> datos en memoria, sin backend (README-LOCAL.md)
//   VITE_MODO=supabase   -> Supabase + el servidor de Railway
//   sin VITE_MODO        -> Base44, como estaba antes de migrar
export const MODO_LOCAL = import.meta.env.VITE_MODO === 'local';
export const MODO_SUPABASE = import.meta.env.VITE_MODO === 'supabase';

const base44Raw = MODO_LOCAL ? clienteLocal
  : MODO_SUPABASE ? clienteSupabase
  : createClient({
      appId,
      token,
      functionsVersion,
      serverUrl: '',
      requiresAuth: false,
      appBaseUrl
    });

// ── Bloqueo centralizado de escrituras durante "Simular Rol" ────────────────
// Solo Base del Sistema (super_admin) puede activar la simulación (ver
// src/lib/roleSimulator.js, que valida esto antes de guardar el estado).
// Mientras está activa, cualquier create/update/delete/bulk* de entidades, y
// cualquier invoke de función, queda bloqueado — sin tocar cada pantalla.
const METODOS_ESCRITURA = new Set([
  'create', 'update', 'delete', 'bulkCreate', 'bulkUpdate', 'bulkDelete',
]);

// ── Monitor Corporativo: solo lectura ───────────────────────────────────────
// Su diseño de rol dice "no puede editar ni crear", y las policies de
// 03_policies.sql lo cumplen: su unica escritura permitida es comentario_create.
// La interfaz, en cambio, le mostraba botones como "Nuevo Equipo" si llegaba a
// la pantalla por URL — el guardado reventaba recien en la base. Se bloquea
// aqui, en el mismo punto que la simulacion de rol, para que valga en todas
// las pantallas y no haya que acordarse en cada una.
const ENTIDADES_QUE_EL_MONITOR_SI_ESCRIBE = new Set(['Comentario']);
let rolActual = null;
let usuarioActual = null;
export function fijarRolActual(rol) { rolActual = rol; }

// ── Auditoria ───────────────────────────────────────────────────────────────
// Quien esta operando, para poder firmar cada escritura. Lo fija AuthContext
// apenas resuelve la sesion.
export function fijarUsuarioActual(user) {
  usuarioActual = user || null;
  rolActual = user?.role ?? null;
}

// La auditoria nunca puede hacer fallar la operacion que audita: si el insert
// se cae (policy, red, tabla), se anota en consola y la app sigue.
function auditar(entidad, metodo, args, resultado) {
  if (!usuarioActual || !debeAuditarse(entidad)) return;
  try {
    const fila = describir(entidad, metodo, args, resultado);
    base44Raw.entities.Historial.create({
      usuario_email: usuarioActual.email || '',
      usuario_nombre: usuarioActual.full_name || '',
      usuario_rol: usuarioActual.role || '',
      ...fila,
    }).catch((e) => console.warn('No se pudo auditar:', e?.message));
  } catch (e) {
    console.warn('No se pudo auditar:', e?.message);
  }
}

// Deja constancia de un ingreso al sistema (exitoso o no). Una fila por
// sesion del navegador, no una por cada F5.
export async function registrarIngreso({ email, nombre, rol, resultado, notas }) {
  const marca = `ingreso:${email}:${resultado}`;
  try {
    if (sessionStorage.getItem(marca)) return;
    sessionStorage.setItem(marca, '1');
  } catch { /* modo privado: se registra igual */ }
  try {
    await base44Raw.entities.AccesoNoAutorizado.create({
      email: email || '',
      usuario_nombre: nombre || '',
      rol: rol || '',
      resultado: resultado || 'exitoso',
      fecha_intento: new Date().toISOString(),
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      notas: notas || '',
    });
  } catch (e) {
    console.warn('No se pudo registrar el ingreso:', e?.message);
  }
}

// Solo aplica a escrituras de ENTIDADES. Las funciones de backend quedan
// fuera a proposito: cada una valida el rol por su cuenta, y varias son de
// solo lectura o de control de acceso — bloquearlas dejaba al monitor sin
// poder ni verificar su propia sesion.
function monitorNoPuedeEscribir(nombreEntidad) {
  if (!PERMISOS.monitorSoloLectura) return false;   // apagado por defecto
  if (nombreEntidad === undefined) return false;
  return rolActual === 'monitor_corporativo'
    && !ENTIDADES_QUE_EL_MONITOR_SI_ESCRIBE.has(String(nombreEntidad));
}

const MENSAJE_SOLO_LECTURA = 'Monitor Corporativo es un perfil de solo lectura.';

// Entidades con "soft delete" (campo `activo`): en vez de tocar cada pantalla
// que hace .list()/.filter(), se filtra una sola vez aquí — los registros con
// activo === false (eliminados lógicamente) nunca llegan a la UI por defecto.
const ENTIDADES_CON_SOFT_DELETE = new Set(['Equipo', 'Repuesto']);
const METODOS_LECTURA_LISTA = new Set(['list', 'filter']);

function ocultarInactivos(resultado) {
  return Array.isArray(resultado) ? resultado.filter((item) => item?.activo !== false) : resultado;
}

function bloquearSiSimulando(fn, contexto, entidad, metodo) {
  return (...args) => {
    if (monitorNoPuedeEscribir(entidad)) {
      return Promise.reject(new Error(`${MENSAJE_SOLO_LECTURA} (${contexto})`));
    }
    if (isSimulandoActivo()) {
      return Promise.reject(new Error(`${MENSAJE_BLOQUEO_SIMULACION} (${contexto})`));
    }
    const salida = fn(...args);
    // Solo se audita lo que efectivamente se guardo: si la promesa se rechaza,
    // no hubo cambio que registrar.
    if (metodo && entidad !== undefined) {
      return Promise.resolve(salida).then((r) => { auditar(String(entidad), metodo, args, r); return r; });
    }
    return salida;
  };
}

function envolverEntidad(entidad, nombre) {
  return new Proxy(entidad, {
    get(target, prop, receiver) {
      const valor = Reflect.get(target, prop, receiver);
      if (typeof valor === 'function' && METODOS_ESCRITURA.has(prop)) {
        const metodo = ['create', 'update', 'delete'].includes(prop) ? prop : null;
        return bloquearSiSimulando(valor.bind(target), `${String(nombre)}.${String(prop)}`, nombre, metodo);
      }
      if (
        typeof valor === 'function' &&
        METODOS_LECTURA_LISTA.has(prop) &&
        ENTIDADES_CON_SOFT_DELETE.has(String(nombre))
      ) {
        const original = valor.bind(target);
        return (...args) => Promise.resolve(original(...args)).then(ocultarInactivos);
      }
      return typeof valor === 'function' ? valor.bind(target) : valor;
    },
  });
}

// Cache de entidades ya envueltas: evita crear un Proxy nuevo cada vez que se
// accede a base44.entities.X (por ejemplo, en cada render), ya que antes se
// reconstruía en cada acceso a la propiedad.
const entityProxyCache = new Map();
const entitiesProxy = new Proxy(base44Raw.entities || {}, {
  get(target, prop, receiver) {
    if (entityProxyCache.has(prop)) return entityProxyCache.get(prop);
    const entidad = Reflect.get(target, prop, receiver);
    if (entidad && typeof entidad === 'object') {
      const envuelta = envolverEntidad(entidad, prop);
      entityProxyCache.set(prop, envuelta);
      return envuelta;
    }
    return entidad;
  },
});

// Simular Rol bloqueaba TODAS las funciones de backend, y varias pantallas se
// alimentan solo de ellas: el Monitor Corporativo entero sale de getMonitorData,
// y los equipos del Dashboard de getEquiposPorCentro. Simulando, esas llamadas
// se rechazaban y la pantalla mostraba 0 equipos, 0 alertas y 0 ordenes — o sea
// que la simulacion no servia para lo unico que se usa: mirar como ve el sistema
// otro perfil.
//
// El punto de la simulacion es que no se pueda ESCRIBIR, no que no se pueda
// leer. Estas cuatro son de solo lectura (verificado: cero create/update/delete
// en servidor/funciones/) y ademas aplican su propio filtro por rol y centro en
// el servidor, que es justo lo que se quiere ver al simular. Lista explicita a
// proposito: lo que no este aca sigue bloqueado.
const FUNCIONES_DE_SOLO_LECTURA = new Set([
  'getMonitorData',
  'getEquiposPorCentro',
  'getUsuariosPorCentro',
  'getPublicAmbulances',
]);

const functionsProxy = base44Raw.functions
  ? new Proxy(base44Raw.functions, {
      get(target, prop, receiver) {
        const valor = Reflect.get(target, prop, receiver);
        if (prop === 'invoke' && typeof valor === 'function') {
          const invocar = valor.bind(target);
          const bloqueada = bloquearSiSimulando(invocar, 'functions.invoke');
          return (nombre, ...resto) =>
            FUNCIONES_DE_SOLO_LECTURA.has(nombre)
              ? invocar(nombre, ...resto)
              : bloqueada(nombre, ...resto);
        }
        return typeof valor === 'function' ? valor.bind(target) : valor;
      },
    })
  : base44Raw.functions;

export const base44 = new Proxy(base44Raw, {
  get(target, prop, receiver) {
    if (prop === 'entities') return entitiesProxy;
    if (prop === 'functions') return functionsProxy;
    const valor = Reflect.get(target, prop, receiver);
    return typeof valor === 'function' ? valor.bind(target) : valor;
  },
});
