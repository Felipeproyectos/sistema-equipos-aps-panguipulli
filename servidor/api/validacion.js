// Validación de los registros que mandan los sistemas externos.
//
// Lo que entra se revisa campo por campo ANTES de tocar la base: tipo, largo,
// rango y catálogo. Un campo que no está en la definición se rechaza en vez de
// ignorarse: un sistema que manda "litro" en vez de "litros" tiene que
// enterarse, no ver su carga guardada sin litros. Después la base aplica sus
// propias reglas (los disparadores de 32_*.sql y 34_*.sql), que son las mismas
// de la pantalla.

const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const ID_EXTERNO = /^[A-Za-z0-9._:\/-]{1,100}$/;
const FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;
const HORA = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/;
const FECHA_HORA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:\d{2})$/;

/** Mayúsculas y solo letras y números: "ab-cd 12" y "ABCD12" son la misma. */
export const patenteSimple = (t) => String(t ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

function fechaValida(texto) {
  const m = FECHA.exec(texto);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

// Dígito verificador del RUT chileno (módulo 11).
export function rutValido(rut) {
  const limpio = String(rut || '').toUpperCase().replace(/[^0-9K]/g, '');
  if (limpio.length < 2 || limpio.length > 9) return false;
  const cuerpo = limpio.slice(0, -1);
  if (!/^\d+$/.test(cuerpo)) return false;
  let suma = 0;
  let factor = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const resto = 11 - (suma % 11);
  const dv = resto === 11 ? '0' : resto === 10 ? 'K' : String(resto);
  return dv === limpio.slice(-1);
}

const formatearRut = (rut) => {
  const limpio = String(rut).toUpperCase().replace(/[^0-9K]/g, '');
  return `${limpio.slice(0, -1)}-${limpio.slice(-1)}`;
};

// Cada validador recibe el valor tal como llegó y devuelve { valor } o
// { error }. `undefined` y `null` llegan solo si el campo no es obligatorio.
const VALIDADORES = {
  id_externo(v) {
    return typeof v === 'string' && ID_EXTERNO.test(v)
      ? { valor: v }
      : { error: 'debe tener entre 1 y 100 caracteres: letras, números y . _ : / -' };
  },
  patente(v) {
    const p = patenteSimple(v);
    return typeof v === 'string' && p.length >= 4 && p.length <= 8
      ? { valor: p }
      : { error: 'no es una patente válida' };
  },
  texto(v, def) {
    if (typeof v !== 'string') return { error: 'debe ser texto' };
    const t = v.trim();
    if (CONTROL.test(t)) return { error: 'tiene caracteres no permitidos' };
    if (t.length > def.max) return { error: `admite hasta ${def.max} caracteres` };
    if (def.min && t.length < def.min) return { error: `necesita al menos ${def.min} caracteres` };
    return { valor: t };
  },
  numero(v, def) {
    if (typeof v !== 'number' || !Number.isFinite(v)) return { error: 'debe ser un número' };
    if (def.mayorQue !== undefined && !(v > def.mayorQue)) return { error: `debe ser mayor que ${def.mayorQue}` };
    if (def.min !== undefined && v < def.min) return { error: `no puede ser menor que ${def.min}` };
    if (def.max !== undefined && v > def.max) return { error: `no puede ser mayor que ${def.max}` };
    return { valor: v };
  },
  booleano(v) {
    return typeof v === 'boolean' ? { valor: v } : { error: 'debe ser true o false' };
  },
  catalogo(v, def) {
    return typeof v === 'string' && def.valores.includes(v)
      ? { valor: v }
      : { error: `debe ser uno de: ${def.valores.join(', ')}` };
  },
  fecha(v) {
    return typeof v === 'string' && fechaValida(v) ? { valor: v } : { error: 'debe ser una fecha AAAA-MM-DD' };
  },
  hora(v) {
    return typeof v === 'string' && HORA.test(v) ? { valor: v.slice(0, 5) } : { error: 'debe ser una hora HH:MM' };
  },
  fecha_hora(v) {
    if (typeof v !== 'string' || !FECHA_HORA.test(v) || !fechaValida(v.slice(0, 10))) {
      return { error: 'debe ser fecha y hora ISO 8601 con zona horaria (ej. 2026-10-30T14:05:00-03:00)' };
    }
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? { error: 'no es una fecha y hora válida' } : { valor: d.toISOString() };
  },
  rut(v) {
    return typeof v === 'string' && rutValido(v) ? { valor: formatearRut(v) } : { error: 'no es un RUT válido' };
  },
  // Solo se guardan los 4 últimos dígitos de la tarjeta: identifican cuál
  // fue, sin dejar el número completo en la base.
  tarjeta(v) {
    if (typeof v !== 'string') return { error: 'debe ser texto' };
    const digitos = v.replace(/\D/g, '');
    if (digitos.length < 4 || digitos.length > 19) return { error: 'debe traer entre 4 y 19 dígitos' };
    return { valor: `**** ${digitos.slice(-4)}` };
  },
};

/**
 * Valida un registro contra la definición de campos de un recurso.
 * Devuelve { fila, errores }: `fila` trae solo los campos presentes y ya
 * normalizados; `errores` son textos listos para mostrarle al integrador.
 */
export function validarRegistro(registro, campos) {
  const errores = [];
  const fila = {};
  if (!registro || typeof registro !== 'object' || Array.isArray(registro)) {
    return { fila, errores: ['el registro debe ser un objeto JSON'] };
  }
  for (const nombre of Object.keys(registro)) {
    if (!Object.hasOwn(campos, nombre)) errores.push(`${nombre}: campo desconocido`);
  }
  for (const [nombre, def] of Object.entries(campos)) {
    const v = registro[nombre];
    if (v === undefined || v === null || v === '') {
      if (def.requerido) errores.push(`${nombre}: es obligatorio`);
      continue;
    }
    const r = VALIDADORES[def.tipo](v, def);
    if (r.error) errores.push(`${nombre}: ${r.error}`);
    else fila[nombre] = r.valor;
  }
  return { fila, errores };
}

/** Hoy en Chile, AAAA-MM-DD: el límite de "no puede estar en el futuro". */
export function hoyEnChile(ahora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(ahora);
}

/** Suma días a una fecha AAAA-MM-DD. */
export function sumarDias(fecha, dias) {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
