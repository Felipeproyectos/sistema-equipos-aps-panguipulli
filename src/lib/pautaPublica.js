// Las reglas con que el servidor recibe una pauta desde el enlace público.
//
// Por qué existe
// ──────────────
// Quien llena una pauta no tiene cuenta: el enlace es público. Y las pautas
// sin novedades ya no esperan a que alguien las apruebe: se registran solas en
// el historial del equipo (src/lib/fallasPauta.js). Las dos cosas juntas son
// una puerta abierta: un programa podría mandar mil pautas «sin novedades» y
// llenar de basura el historial, el kilometraje y la carpeta de Drive.
//
// Estas son las barreras, de la más barata a la más cara:
//   1. Tamaño y forma: el cuerpo tiene tope, el tipo de pauta tiene que
//      existir y calzar con el equipo, la fecha tiene que ser razonable, y de
//      cada bloque se guarda solo lo que una pauta de verdad trae.
//   2. Repetidas: la misma pauta (equipo, tipo, fecha, momento, persona) no
//      entra dos veces en pocos minutos.
//   3. Tope por equipo y día: nadie llena seis pautas semanales del mismo DEA.
//   4. Freno general: el sistema recibe unas pocas pautas al día. Si en una
//      hora llegan muchas más, deja de registrarlas solas —todas quedan para
//      revisión de una persona— y, si siguen llegando, deja de recibirlas.
//   5. Kilometraje creíble: un valor que retrocede o salta no se registra solo.
//
// El tope por dirección de red está aparte, en servidor/index.js: corta antes
// de tocar la base. Nada de esto reemplaza una verificación «no soy un robot»
// (queda documentada en DESPLIEGUE.md): la complementa.
//
// Lo usa servidor/funciones/guardarInspeccionPendiente.js, vía la copia de
// servidor/compartido/. `node src/lib/pautaPublica.js` corre el autotest.

export const TIPOS_FORMULARIO = ["inspeccion_diaria", "inspeccion_semanal", "inspeccion_anual", "turno_chofer"];

const TIPOS_VEHICULO = ["ambulancia", "camioneta", "furgon", "camion_3_4"];

export const LIMITES = {
  // Una pauta completa pesa unos 6 KB. Las fotos de daños viajan como enlace.
  cuerpoBytes: 200000,
  // Pautas del mismo equipo, del mismo tipo, recibidas el mismo día.
  porEquipoDia: { inspeccion_diaria: 6, inspeccion_semanal: 3, inspeccion_anual: 2, turno_chofer: 8 },
  // En todo el sistema, en la última hora. Lo normal son 2 o 3 al día.
  registroAutomaticoHora: 40,
  recepcionHora: 150,
  // La misma pauta otra vez dentro de este plazo es un doble envío.
  repetidaMinutos: 10,
  // Se puede anotar una pauta atrasada, no una de hace meses ni del futuro.
  diasAtras: 31,
  // Entre un registro y el siguiente, un vehículo no anda más que esto.
  saltoKm: 3000,
  itemsPorBloque: 120,
};

// Los bloques de ítems que guarda una pauta (los mismos de fallasPauta.js).
const BLOQUES = ["luces", "motor", "accesorios", "documentos", "exterior", "interior", "equipo_medico",
  "accesorios_diaria", "saneamiento", "documentacion", "checklist", "parches"];

const texto = (v, max) => String(v ?? "").replace(/\u0000/g, "").trim().slice(0, max);
const esObjeto = (v) => !!v && typeof v === "object" && !Array.isArray(v);

/** Un enlace de foto solo puede ser http(s): se muestra como imagen al revisar. */
const enlaceSeguro = (v) => (/^https?:\/\/[^\s"'<>]+$/i.test(String(v || "")) ? String(v).slice(0, 600) : "");

/** De un bloque de ítems, lo que una pauta de verdad trae; null si no es un bloque. */
export function limpiarBloque(bloque) {
  if (!esObjeto(bloque)) return null;
  const limpio = {};
  for (const [item, v] of Object.entries(bloque).slice(0, LIMITES.itemsPorBloque)) {
    const nombre = texto(item, 200);
    if (!nombre) continue;
    if (typeof v === "string") { limpio[nombre] = texto(v, 40); continue; }
    if (!esObjeto(v)) continue;
    const campo = {};
    for (const [k, valor] of Object.entries(v).slice(0, 8)) {
      if (typeof valor === "string") campo[texto(k, 40)] = k === "foto_url" ? enlaceSeguro(valor) : texto(valor, 500);
      else if (typeof valor === "boolean" || (typeof valor === "number" && Number.isFinite(valor))) campo[texto(k, 40)] = valor;
    }
    limpio[nombre] = campo;
  }
  return limpio;
}

const numero = (v) => (v === "" || v == null ? null : Number(v));

/**
 * La pauta tal como se va a guardar: textos acotados y bloques limpios.
 * No decide nada; solo quita lo que no corresponde.
 */
export function normalizarPauta(data = {}) {
  const km = numero(data.km_inicial);
  const out = {
    tipo_formulario: texto(data.tipo_formulario, 40),
    equipo_id: texto(data.equipo_id, 80),
    equipo_label: texto(data.equipo_label, 200),
    conductor: texto(data.conductor, 120),
    fecha: texto(data.fecha, 10),
    km_inicial: km != null && Number.isFinite(km) ? km : null,
    combustible: texto(data.combustible, 40),
    observaciones: texto(data.observaciones, 4000),
    momento: ["inicio", "termino"].includes(data.momento) ? data.momento : null,
    problemasDetectados: texto(data.problemasDetectados, 2000),
    accionesTomadas: texto(data.accionesTomadas, 2000),
    descripcion: texto(data.descripcion, 2000),
    danos: limpiarBloque(data.danos),
  };
  for (const b of BLOQUES) out[b] = limpiarBloque(data[b]);
  return out;
}

const sumarDias = (iso, n) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * Por qué no se puede recibir esta pauta, en palabras de quien la llena.
 * "" si está bien. `hoy` es la fecha de Chile (AAAA-MM-DD).
 */
export function motivoDeRechazo(pauta, equipo, hoy) {
  if (!pauta.equipo_id || !pauta.fecha || !pauta.tipo_formulario) return "Faltan campos obligatorios";
  if (!TIPOS_FORMULARIO.includes(pauta.tipo_formulario)) return "Ese tipo de pauta no existe";
  if (!equipo) return "Equipo no encontrado";
  if (equipo.activo === false) return "Ese equipo está dado de baja";
  const esVehiculo = TIPOS_VEHICULO.includes(equipo.tipo);
  if (pauta.tipo_formulario === "turno_chofer" && !esVehiculo) return "El turno de chofer es solo para vehículos";
  if (pauta.tipo_formulario === "inspeccion_diaria" && !esVehiculo) return "La pauta diaria es solo para vehículos";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(pauta.fecha) || Number.isNaN(new Date(`${pauta.fecha}T12:00:00Z`).getTime())) {
    return "La fecha de la pauta no es válida";
  }
  // Un día de holgura hacia adelante: el teléfono puede ir en otra zona horaria.
  if (pauta.fecha > sumarDias(hoy, 1)) return "La fecha de la pauta no puede ser futura";
  if (pauta.fecha < sumarDias(hoy, -LIMITES.diasAtras)) return `La pauta no puede tener más de ${LIMITES.diasAtras} días`;
  if (pauta.km_inicial != null && (pauta.km_inicial < 0 || pauta.km_inicial >= 5000000)) return "El kilometraje no es válido";
  return "";
}

const MIN = 60000;
const HORA = 60 * MIN;

/** ¿Es la misma pauta otra vez? Mismo equipo, tipo, fecha, momento y persona. */
function esRepetida(pauta, fila, ahora) {
  if (fila.equipo_id !== pauta.equipo_id || fila.tipo_formulario !== pauta.tipo_formulario) return false;
  if (String(fila.fecha || "").slice(0, 10) !== pauta.fecha) return false;
  if (ahora - new Date(fila.created_date).getTime() > LIMITES.repetidaMinutos * MIN) return false;
  if (texto(fila.conductor, 120).toLowerCase() !== pauta.conductor.toLowerCase()) return false;
  let momento = null;
  try { momento = JSON.parse(fila.datos_json || "{}").momento || null; } catch { momento = null; }
  return momento === pauta.momento;
}

/**
 * Qué hacer con una pauta que ya pasó la validación, mirando lo que llegó en
 * las últimas 24 horas (`recientes`: filas de inspeccion_pendiente).
 *
 *   { accion: "rechazar", status, motivo }  no se guarda
 *   { accion: "repetida", id }              ya estaba: se responde como recibida
 *   { accion: "manual", motivo }            se guarda y queda para revisión
 *   { accion: "auto" }                      se guarda y, si no trae novedades,
 *                                           se registra sola
 */
export function decidirRecepcion(pauta, recientes = [], ahora = Date.now()) {
  const repetida = recientes.find(f => esRepetida(pauta, f, ahora));
  if (repetida) return { accion: "repetida", id: repetida.id };

  const enLaHora = recientes.filter(f => ahora - new Date(f.created_date).getTime() <= HORA).length;
  if (enLaHora >= LIMITES.recepcionHora) {
    return { accion: "rechazar", status: 429, motivo: "El sistema está recibiendo demasiadas pautas. Intenta de nuevo en unos minutos." };
  }

  const tope = LIMITES.porEquipoDia[pauta.tipo_formulario] || 3;
  const delEquipo = recientes.filter(f => f.equipo_id === pauta.equipo_id && f.tipo_formulario === pauta.tipo_formulario).length;
  if (delEquipo >= tope) {
    return { accion: "rechazar", status: 429, motivo: "Este equipo ya tiene registradas las pautas de hoy. Si necesitas corregir una, avisa a tu Encargado." };
  }

  if (enLaHora >= LIMITES.registroAutomaticoHora) return { accion: "manual", motivo: "volumen inusual de pautas" };
  return { accion: "auto" };
}

/**
 * ¿El kilometraje calza con el último registrado del vehículo? Sin registro
 * anterior no hay con qué comparar y se acepta.
 */
export function kmCreible(km, ultimoKm) {
  if (km == null) return true;
  if (ultimoKm == null || !Number.isFinite(Number(ultimoKm))) return true;
  return km >= Number(ultimoKm) && km <= Number(ultimoKm) + LIMITES.saltoKm;
}

// ── Tope por dirección de red (lo usa servidor/index.js) ─────────────────
// Un centro entero sale a internet por la misma dirección, así que el tope es
// holgado para personas y estrecho para un programa.
export const TOPE_POR_RED = [
  { ventanaMs: 10 * MIN, maximo: 20 },
  { ventanaMs: HORA, maximo: 60 },
];

/**
 * Contador en memoria: `permitir(clave, ahora)` dice si esa dirección puede
 * hacer otro envío y lo anota. Se limpia solo.
 */
export function crearTope(reglas = TOPE_POR_RED, maxClaves = 5000) {
  const marcas = new Map();
  const mayor = Math.max(...reglas.map(r => r.ventanaMs));
  return {
    permitir(clave, ahora = Date.now()) {
      const previas = (marcas.get(clave) || []).filter(t => ahora - t < mayor);
      const pasa = reglas.every(r => previas.filter(t => ahora - t < r.ventanaMs).length < r.maximo);
      if (pasa) previas.push(ahora);
      marcas.delete(clave);
      marcas.set(clave, previas);
      // Tope de memoria: si alguien rota direcciones, se sueltan las más viejas.
      if (marcas.size > maxClaves) marcas.delete(marcas.keys().next().value);
      return pasa;
    },
    tamano: () => marcas.size,
  };
}

export function _selfCheck() {
  const fallos = [];
  const debe = (c, q) => { if (!c) fallos.push(q); };
  const hoy = "2026-11-16";
  const ahora = new Date("2026-11-16T15:00:00Z").getTime();
  const hace = (min) => new Date(ahora - min * MIN).toISOString();

  const cruda = {
    tipo_formulario: "inspeccion_semanal", equipo_id: "d1", fecha: hoy, conductor: "  Ana  Rojas ",
    observaciones: "x".repeat(9000), checklist: { "Autotest": { estado: "ok", obs: "y".repeat(900), raro: { a: 1 } }, "Cables": "ok" },
    danos: { puerta: { marcado: true, descripcion: "rayada", foto_url: "javascript:alert(1)" } },
    luces: "no soy un bloque", inventado: { a: 1 },
  };
  const p = normalizarPauta(cruda);
  debe(p.observaciones.length === 4000 && p.conductor === "Ana  Rojas", "textos acotados");
  debe(p.checklist.Autotest.obs.length === 500 && p.checklist.Autotest.raro === undefined && p.checklist.Cables === "ok", "bloque limpio");
  debe(p.danos.puerta.foto_url === "" && p.danos.puerta.marcado === true, "una foto solo puede ser un enlace http");
  debe(p.luces === null && p.inventado === undefined, "lo que no es un bloque no se guarda");
  debe(normalizarPauta({ danos: { a: { foto_url: "https://x.supabase.co/storage/a.jpg" } } }).danos.a.foto_url.startsWith("https://"), "enlace bueno pasa");

  const dea = { id: "d1", tipo: "dea" };
  const amb = { id: "a1", tipo: "ambulancia" };
  debe(motivoDeRechazo(p, dea, hoy) === "", "pauta buena: " + motivoDeRechazo(p, dea, hoy));
  debe(motivoDeRechazo({ ...p, tipo_formulario: "pauta_cabina" }, amb, hoy) !== "", "la cabina no entra por acá");
  debe(motivoDeRechazo({ ...p, tipo_formulario: "otra" }, dea, hoy) !== "", "tipo inventado");
  debe(motivoDeRechazo(p, null, hoy) === "Equipo no encontrado", "equipo que no existe");
  debe(motivoDeRechazo(p, { ...dea, activo: false }, hoy) !== "", "equipo dado de baja");
  debe(motivoDeRechazo({ ...p, tipo_formulario: "turno_chofer" }, dea, hoy) !== "", "turno de chofer en un DEA");
  debe(motivoDeRechazo({ ...p, tipo_formulario: "inspeccion_diaria" }, amb, hoy) === "", "diaria en ambulancia");
  debe(motivoDeRechazo({ ...p, fecha: "2026-11-17" }, dea, hoy) === "", "un día de holgura");
  debe(motivoDeRechazo({ ...p, fecha: "2026-11-18" }, dea, hoy) !== "", "fecha futura");
  debe(motivoDeRechazo({ ...p, fecha: "2026-10-01" }, dea, hoy) !== "", "fecha muy vieja");
  debe(motivoDeRechazo({ ...p, fecha: "2026-13-40" }, dea, hoy) !== "", "fecha imposible");
  debe(motivoDeRechazo({ ...p, km_inicial: -5 }, amb, hoy) !== "", "kilometraje negativo");

  const fila = (extra) => ({ id: "f", equipo_id: "d1", tipo_formulario: "inspeccion_semanal", fecha: hoy, conductor: "ana  rojas", datos_json: "{}", created_date: hace(3), ...extra });
  debe(decidirRecepcion(p, [], ahora).accion === "auto", "sin nada reciente: automática");
  debe(decidirRecepcion(p, [fila()], ahora).accion === "repetida", "el doble envío no se guarda dos veces");
  debe(decidirRecepcion(p, [fila({ created_date: hace(30) })], ahora).accion === "auto", "media hora después ya es otra");
  debe(decidirRecepcion(p, [fila({ conductor: "Otro" })], ahora).accion === "auto", "otra persona no es repetida");
  debe(decidirRecepcion(p, Array.from({ length: 3 }, (_, i) => fila({ id: `e${i}`, conductor: `P${i}`, created_date: hace(120 + i) })), ahora).accion === "rechazar", "tope del equipo en el día");
  const otros = (n) => Array.from({ length: n }, (_, i) => fila({ id: `o${i}`, equipo_id: `x${i}`, created_date: hace(20) }));
  debe(decidirRecepcion(p, otros(39), ahora).accion === "auto", "bajo el freno");
  debe(decidirRecepcion(p, otros(40), ahora).accion === "manual", "con volumen inusual nada se registra solo");
  debe(decidirRecepcion(p, otros(150), ahora).status === 429, "y más allá no se recibe");
  debe(decidirRecepcion(p, otros(150).map(f => ({ ...f, created_date: hace(90) })), ahora).accion === "auto", "lo de hace más de una hora no frena");

  debe(kmCreible(120500, 120300) && kmCreible(null, 5) && kmCreible(10, null), "kilometraje creíble");
  debe(!kmCreible(120000, 120300) && !kmCreible(190000, 120300), "retrocede o salta: no");

  const tope = crearTope([{ ventanaMs: 1000, maximo: 2 }], 3);
  debe(tope.permitir("a", 0) && tope.permitir("a", 10) && !tope.permitir("a", 20), "tercer envío en la ventana: no");
  debe(tope.permitir("a", 1500), "pasada la ventana vuelve a poder");
  ["b", "c", "d", "e"].forEach(k => tope.permitir(k, 1600));
  debe(tope.tamano() <= 3, "la memoria tiene tope");

  if (fallos.length) { console.error("FALLOS:\n  " + fallos.join("\n  ")); return false; }
  console.log("pautaPublica: autotest ok");
  return true;
}

if (typeof process !== "undefined" && process.argv?.[1]?.endsWith("pautaPublica.js")) _selfCheck();
