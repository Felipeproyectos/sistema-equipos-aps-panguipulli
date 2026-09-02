import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';
import { isSimulandoActivo, MENSAJE_BLOQUEO_SIMULACION } from '@/lib/roleSimulator';
import { clienteLocal } from '@/api/local/compat';
import { PERMISOS } from '@/lib/permisos';

const { appId, token, functionsVersion, appBaseUrl } = appParams;

// Con VITE_MODO=local se corre sin Base44 ni Supabase: los datos salen del
// respaldo, en memoria, y las funciones se ejecutan en el navegador.
// Ver README-LOCAL.md. Todo lo de abajo (bloqueo de simulacion, soft delete)
// aplica igual, porque envuelve al cliente sea cual sea.
export const MODO_LOCAL = import.meta.env.VITE_MODO === 'local';

const base44Raw = MODO_LOCAL ? clienteLocal : createClient({
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
export function fijarRolActual(rol) { rolActual = rol; }

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

function bloquearSiSimulando(fn, contexto, entidad) {
  return (...args) => {
    if (monitorNoPuedeEscribir(entidad)) {
      return Promise.reject(new Error(`${MENSAJE_SOLO_LECTURA} (${contexto})`));
    }
    if (isSimulandoActivo()) {
      return Promise.reject(new Error(`${MENSAJE_BLOQUEO_SIMULACION} (${contexto})`));
    }
    return fn(...args);
  };
}

function envolverEntidad(entidad, nombre) {
  return new Proxy(entidad, {
    get(target, prop, receiver) {
      const valor = Reflect.get(target, prop, receiver);
      if (typeof valor === 'function' && METODOS_ESCRITURA.has(prop)) {
        return bloquearSiSimulando(valor.bind(target), `${String(nombre)}.${String(prop)}`, nombre);
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

const functionsProxy = base44Raw.functions
  ? new Proxy(base44Raw.functions, {
      get(target, prop, receiver) {
        const valor = Reflect.get(target, prop, receiver);
        if (prop === 'invoke' && typeof valor === 'function') {
          return bloquearSiSimulando(valor.bind(target), 'functions.invoke');
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
