// Claves de la API de integración.
//
// Formato: aps_<prefijo>_<secreto>
//   prefijo  12 caracteres [a-z0-9]. Identifica el acceso: se guarda tal cual,
//            sirve para buscarlo y para reconocerlo en el registro.
//   secreto  32 bytes al azar en base64url (43 caracteres).
// En la base queda solo HMAC-SHA256(clave completa) con API_CLAVES_PEPPER.
//
// ponytail: HMAC y no Argon2id. Argon2id es para contraseñas que eligen
// personas (poca entropía: hay que encarecer cada intento). Estas claves traen
// 256 bits al azar, no hay diccionario que probar, y un hash lento solo
// costaría CPU en cada llamada. El pepper vive en Railway y no en la base: un
// volcado de api_cliente no alcanza ni para verificar una clave.
//
// Solo Web Crypto, nada de 'node:crypto': gestionarApiClientes lo importa y el
// modo local corre esa función en el navegador.

const ABC = 'abcdefghijklmnopqrstuvwxyz0123456789';
const LARGO_PREFIJO = 12;
const FORMATO = /^aps_([a-z0-9]{12})_([A-Za-z0-9_-]{43})$/;
export const LARGO_MINIMO_PEPPER = 32;

function azar(n) {
  const bytes = new Uint8Array(n);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

function base64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Rechazo de muestras: 252 es el mayor múltiplo de 36 que cabe en un byte, así
// ninguna letra sale más seguido que otra.
function prefijoAlAzar() {
  let s = '';
  while (s.length < LARGO_PREFIJO) {
    for (const b of azar(16)) {
      if (b < 252 && s.length < LARGO_PREFIJO) s += ABC[b % ABC.length];
    }
  }
  return s;
}

export function generarClave() {
  const prefijo = prefijoAlAzar();
  return { prefijo, clave: `aps_${prefijo}_${base64url(azar(32))}` };
}

/** { clave, prefijo } si el texto tiene la forma de una clave; si no, null. */
export function leerClave(texto) {
  const m = FORMATO.exec(String(texto || '').trim());
  return m ? { clave: m[0], prefijo: m[1] } : null;
}

export function pepperValido(pepper) {
  return typeof pepper === 'string' && pepper.length >= LARGO_MINIMO_PEPPER;
}

const llaves = new Map();
async function llaveHmac(pepper) {
  if (!llaves.has(pepper)) {
    llaves.set(pepper, globalThis.crypto.subtle.importKey(
      'raw', new TextEncoder().encode(pepper), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    ));
  }
  return llaves.get(pepper);
}

/** HMAC-SHA256 de la clave, en hexadecimal (64 caracteres). */
export async function hashClave(clave, pepper) {
  if (!pepperValido(pepper)) {
    throw new Error(`API_CLAVES_PEPPER no está configurado (mínimo ${LARGO_MINIMO_PEPPER} caracteres)`);
  }
  const firma = await globalThis.crypto.subtle.sign('HMAC', await llaveHmac(pepper), new TextEncoder().encode(clave));
  return Array.from(new Uint8Array(firma), (b) => b.toString(16).padStart(2, '0')).join('');
}

// Compara recorriendo siempre todo el texto: el tiempo de respuesta no dice
// cuántos caracteres del hash acertó quien prueba.
export function igualesEnTiempoConstante(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diferencia = 0;
  for (let i = 0; i < a.length; i++) diferencia |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferencia === 0;
}
