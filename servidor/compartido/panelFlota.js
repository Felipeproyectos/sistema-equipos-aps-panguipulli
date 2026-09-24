// Copia de src/lib/panelFlota.js, generada por migracion/sincronizar_compartido.py.
// No editar a mano: se edita el original y se vuelve a correr el script.

// Lo que el Panel de Flota necesita saber para decir "esto es lo que hay que
// hacer hoy". Separado de la pantalla para poder probarlo sin navegador:
// `node src/lib/panelFlota.js`.
//
// Las reglas no se inventan acá: se reusan las de calendarioFlota.js (quién
// tiene el vehículo hoy, qué está en el taller) y la de Choferes.jsx (estado
// de la licencia, que se pasa como función para no importar una pantalla).
import { asignacionDeHoy, periodosEnTaller, rangosSeTocan } from "./calendarioFlota.js";
import { esperaRespuesta } from "./agendaTaller.js";

// Los tipos de solicitud que son de la flota aunque no apunten a un vehículo
// cargado (una camioneta municipal puede no estar en el inventario).
export const TIPOS_DE_FLOTA = ["mantenimiento_correctivo", "mantenimiento_preventivo", "revision_tecnica"];

const TIPOS_VEHICULO = ["ambulancia", "camioneta", "furgon", "camion_3_4"];

/** ¿Esta solicitud de Salud le toca a Movilización? Si apunta a un equipo,
 *  decide el equipo; si no, el tipo de lo que se pide. */
export function esSolicitudDeFlota(solicitud, equipo) {
  if (equipo) return TIPOS_VEHICULO.includes(equipo.tipo);
  return TIPOS_DE_FLOTA.includes(solicitud?.tipo);
}

/**
 * El resumen del día.
 *
 * Devuelve listas (no solo números) porque el panel muestra a quién o a qué
 * se refiere cada aviso: "2 vehículos sin chofer" sirve poco si no dice
 * cuáles.
 */
export function resumenDelDia({
  vehiculos = [], choferes = [], asignaciones = [], prestamos = [],
  bitacora = [], solicitudes = [], ordenes = [], equipos = [],
  estadoLicencia, hoy,
}) {
  const dia = hoy || new Date().toISOString().split("T")[0];
  const taller = periodosEnTaller(ordenes);
  const enTallerHoy = (id) => taller.some(t => t.equipo_id === id && rangosSeTocan(t.desde, t.hasta, dia, dia));

  const enTaller = vehiculos.filter(v => enTallerHoy(v.id));
  // Un vehículo en el taller no "necesita chofer": no se puede usar igual.
  const sinChofer = vehiculos.filter(v => !enTallerHoy(v.id) && !asignacionDeHoy(asignaciones, v.id, dia));
  const conChofer = vehiculos.filter(v => asignacionDeHoy(asignaciones, v.id, dia));

  const lic = (c) => (estadoLicencia ? estadoLicencia(c.licencia_vencimiento).clave : "sin_datos");
  const licenciaVencida = choferes.filter(c => lic(c) === "vencida");
  const licenciaPorVencer = choferes.filter(c => lic(c) === "por_vencer");
  const sinLicencia = choferes.filter(c => lic(c) === "sin_datos");
  const habilitados = choferes.filter(c => ["vigente", "por_vencer"].includes(lic(c)));

  // Lo más grave de las licencias: alguien que HOY tiene un vehículo a cargo
  // y no puede manejar.
  const idsConVehiculoHoy = new Set(
    asignaciones.filter(a => a.estado === "activa" && a.desde <= dia && (!a.hasta || a.hasta >= dia))
      .map(a => a.chofer_id));
  const manejandoSinLicencia = licenciaVencida.filter(c => idsConVehiculoHoy.has(c.id));

  const prestamosAtrasados = prestamos.filter(p => p.estado === "vigente" && p.hasta_previsto && p.hasta_previsto < dia);
  const salidasAbiertas = bitacora.filter(r => r.estado === "en_ruta");
  const mes = dia.slice(0, 7);
  const salidasDelMes = bitacora.filter(r => (r.fecha || "").startsWith(mes));

  const porId = new Map(equipos.map(e => [e.id, e]));
  const deFlota = solicitudes.filter(s => esSolicitudDeFlota(s, porId.get(s.equipo_id)));
  const porRevisar = deFlota.filter(s => (s.estado || "pendiente") === "pendiente");
  // Fechas de ingreso que el Taller propuso y Movilización no ha respondido.
  const citasPorResponder = ordenes.filter(o => o.origen === "movilizacion" && esperaRespuesta(o));

  return {
    dia,
    vehiculos, conChofer, sinChofer, enTaller,
    choferes, habilitados, licenciaVencida, licenciaPorVencer, sinLicencia, manejandoSinLicencia,
    prestamosAtrasados, salidasAbiertas, salidasDelMes, porRevisar, citasPorResponder,
  };
}

/**
 * Los pasos de la puesta en marcha, cada uno con si ya está hecho. Es lo que
 * responde "¿por dónde empiezo?": el orden importa, porque sin vehículos no
 * hay qué asignar y sin choferes con licencia no hay a quién.
 */
export function pasosDeLaPuestaEnMarcha(r) {
  return [
    { clave: "vehiculos", hecho: r.vehiculos.length > 0 },
    { clave: "choferes", hecho: r.habilitados.length > 0 },
    { clave: "calendario", hecho: r.conChofer.length > 0 },
    { clave: "bitacora", hecho: r.salidasDelMes.length > 0 },
  ];
}

export function _selfCheck() {
  const fallos = [];
  const debe = (c, q) => { if (!c) fallos.push(q); };
  const hoy = "2026-09-21";
  const estado = (v) => ({ clave: !v ? "sin_datos" : v < hoy ? "vencida" : v < "2026-11-01" ? "por_vencer" : "vigente" });

  const vehiculos = [{ id: "v1", tipo: "camioneta" }, { id: "v2", tipo: "furgon" }, { id: "v3", tipo: "ambulancia" }];
  const choferes = [
    { id: "c1", licencia_vencimiento: "2027-05-01" },
    { id: "c2", licencia_vencimiento: "2026-09-01" },   // vencida, y con vehículo hoy
    { id: "c3", licencia_vencimiento: "2026-10-10" },   // por vencer
    { id: "c4" },                                       // sin licencia
  ];
  const asignaciones = [
    { id: "a1", equipo_id: "v1", chofer_id: "c2", estado: "activa", desde: "2026-09-15", hasta: "2026-09-30" },
    { id: "a2", equipo_id: "v3", chofer_id: "c1", estado: "activa", desde: "2026-09-25", hasta: null }, // futura
  ];
  const ordenes = [{ equipo_id: "v2", estado: "en_proceso", fecha_inicio: "2026-09-20" }];
  const solicitudes = [
    { id: "s1", equipo_id: "v3", tipo: "otros", estado: "pendiente" },
    { id: "s2", equipo_id: "dea1", tipo: "mantenimiento_correctivo", estado: "pendiente" },
    { id: "s3", tipo: "revision_tecnica" },                       // sin equipo: decide el tipo
    { id: "s4", tipo: "cambio_parches", estado: "pendiente" },
    { id: "s5", equipo_id: "v1", tipo: "otros", estado: "en_proceso" },
  ];
  const equipos = [...vehiculos, { id: "dea1", tipo: "dea" }];
  const prestamos = [
    { equipo_id: "v1", estado: "vigente", hasta_previsto: "2026-09-10" },
    { equipo_id: "v3", estado: "vigente", hasta_previsto: "2026-10-10" },
    { equipo_id: "v2", estado: "devuelto", hasta_previsto: "2026-09-01" },
  ];
  const bitacora = [
    { estado: "en_ruta", fecha: "2026-09-21" },
    { estado: "cerrada", fecha: "2026-09-02" },
    { estado: "cerrada", fecha: "2026-08-30" },
  ];

  const r = resumenDelDia({ vehiculos, choferes, asignaciones, prestamos, bitacora, solicitudes, ordenes, equipos, estadoLicencia: estado, hoy });
  debe(r.conChofer.map(v => v.id).join() === "v1", "hoy solo v1 tiene chofer");
  debe(r.enTaller.map(v => v.id).join() === "v2", "v2 esta en el taller");
  debe(r.sinChofer.map(v => v.id).join() === "v3", "v3 sin chofer (la asignacion es futura); v2 no cuenta porque esta en taller");
  debe(r.licenciaVencida.length === 1 && r.licenciaPorVencer.length === 1 && r.sinLicencia.length === 1, "licencias clasificadas");
  debe(r.habilitados.length === 2, "vigente y por vencer pueden manejar");
  debe(r.manejandoSinLicencia.map(c => c.id).join() === "c2", "c2 tiene vehiculo hoy con la licencia vencida");
  debe(r.prestamosAtrasados.length === 1, "solo el vigente pasado de fecha esta atrasado");
  debe(r.salidasAbiertas.length === 1, "una salida sin cerrar");
  debe(r.salidasDelMes.length === 2, "dos salidas en septiembre");
  debe(r.porRevisar.map(s => s.id).join() === "s1,s3", `por revisar: vehiculo y tipo de flota sin equipo, hubo ${r.porRevisar.map(s => s.id)}`);
  debe(!esSolicitudDeFlota({ tipo: "mantenimiento_correctivo" }, { tipo: "dea" }), "el mantenimiento de un DEA no es de flota");

  const p = pasosDeLaPuestaEnMarcha(r);
  debe(p.every(x => x.hecho), "con esto cargado, los cuatro pasos estan hechos");
  const vacio = pasosDeLaPuestaEnMarcha(resumenDelDia({ estadoLicencia: estado, hoy }));
  debe(vacio.every(x => !x.hecho), "sin nada cargado, ningun paso esta hecho");

  if (fallos.length) { console.error("FALLOS:\n  " + fallos.join("\n  ")); return false; }
  console.log("panelFlota: autotest ok");
  return true;
}

if (typeof process !== "undefined" && process.argv?.[1]?.endsWith("panelFlota.js")) _selfCheck();
