// La conversación entre Movilización y el Taller para fijar cuándo entra un
// vehículo. Separado de las pantallas para poder probarlo sin navegador:
// `node src/lib/agendaTaller.js`.
//
// El ida y vuelta
// ---------------
//   1. Movilización pide (o deriva lo que pidió Salud). La orden nace
//      `por_agendar`, con la fecha desde la que Movilización puede soltar el
//      vehículo (`fecha_preferida`).
//   2. El Jefe de Taller propone día y hora de ingreso y una entrega
//      estimada → `propuesta`.
//   3. Movilización confirma (`confirmada`) o pide otra fecha (`reagendar`,
//      con el motivo). Si pide otra, vuelve al paso 2.
//
// La base de datos (migracion/21_agenda_taller.sql) sostiene lo mismo: el
// Encargado de Movilización solo puede tocar su respuesta, no el resto de la
// orden, y solo en órdenes que nacieron en Movilización.

export const CITA = {
  por_agendar: { label: "Esperando fecha del taller", corto: "Por agendar", color: "#b45309", fondo: "#fffbeb", borde: "#fcd34d" },
  propuesta:   { label: "El taller propone fecha",    corto: "Propuesta",   color: "#1d4ed8", fondo: "#eff6ff", borde: "#93c5fd" },
  confirmada:  { label: "Fecha confirmada",           corto: "Confirmada",  color: "#15803d", fondo: "#f0fdf4", borde: "#86efac" },
  reagendar:   { label: "Movilización pide otra fecha", corto: "Reagendar", color: "#b91c1c", fondo: "#fef2f2", borde: "#fca5a5" },
};

const CERRADAS = ["completada", "cancelada"];

export const estaAbierta = (ot) => !!ot && !CERRADAS.includes(ot.estado);

/** En qué punto de la conversación está la orden. Las órdenes derivadas antes
 *  de que existiera la agenda no tienen `cita_estado`: si siguen pendientes,
 *  están esperando fecha igual que una nueva. */
export function estadoCita(ot) {
  if (!ot) return null;
  if (ot.cita_estado && CITA[ot.cita_estado]) return ot.cita_estado;
  if (ot.origen === "movilizacion" && ot.estado === "pendiente") return "por_agendar";
  return null;
}

/** Lo que el Jefe de Taller tiene que agendar: pedido nuevo o fecha rechazada. */
export function necesitaAgenda(ot) {
  const c = estadoCita(ot);
  return estaAbierta(ot) && !ot.fecha_inicio && (c === "por_agendar" || c === "reagendar");
}

/** Lo que Movilización tiene que responder. */
export function esperaRespuesta(ot) {
  return estaAbierta(ot) && !ot.fecha_inicio && estadoCita(ot) === "propuesta";
}

const soloFecha = (v) => (typeof v === "string" ? v.split("T")[0] : "");

/** El tramo que ocupará el vehículo según la cita, o null si no hay cita
 *  vigente o el trabajo ya empezó (desde ahí manda la fecha real). */
export function tramoDeCita(ot) {
  const c = estadoCita(ot);
  if (!estaAbierta(ot) || ot.fecha_inicio) return null;
  if (c !== "propuesta" && c !== "confirmada") return null;
  const desde = soloFecha(ot.cita_fecha);
  if (!desde) return null;
  const entrega = soloFecha(ot.cita_entrega);
  return { desde, hasta: entrega && entrega >= desde ? entrega : desde, porConfirmar: c === "propuesta" };
}

/** Un evento para la línea de tiempo de la orden. */
export function eventoDeAgenda(user, evento, notas = "") {
  return {
    fecha: new Date().toISOString(),
    evento,
    usuario_email: user?.email,
    usuario_nombre: user?.full_name,
    notas,
  };
}

/** "jue 2 oct, 09:00" — la cita se lee en una línea. */
export function textoCita(fecha, conHora = true) {
  if (!fecha) return "";
  const d = new Date(String(fecha).length <= 10 ? `${fecha}T12:00:00` : fecha);
  if (Number.isNaN(d.getTime())) return "";
  const dia = d.toLocaleDateString("es-CL", { weekday: "short", day: "numeric", month: "short" });
  if (!conHora || String(fecha).length <= 10) return dia;
  return `${dia}, ${d.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}`;
}

/**
 * Todo lo que Movilización sigue con el Taller, en una sola lista: las
 * solicitudes de Salud (derivadas o no) y los pedidos que Movilización hizo
 * directo. Cada caso cae en una etapa:
 *   - por_revisar: Salud pidió y todavía nadie decidió.
 *   - con_taller:  hay orden abierta, o terminó y falta cerrar la solicitud.
 *   - cerradas:    lo demás.
 */
export function casosDeMovilizacion({ solicitudes = [], ordenes = [] }) {
  const ordenDeSolicitud = new Map();
  for (const o of ordenes) if (o.solicitud_id && !ordenDeSolicitud.has(o.solicitud_id)) ordenDeSolicitud.set(o.solicitud_id, o);

  const casos = solicitudes.map(s => ({ id: `s:${s.id}`, solicitud: s, ot: ordenDeSolicitud.get(s.id) || null }));
  const idsSolicitud = new Set(solicitudes.map(s => s.id));
  for (const o of ordenes) {
    if (o.origen === "movilizacion" && !(o.solicitud_id && idsSolicitud.has(o.solicitud_id))) {
      casos.push({ id: `o:${o.id}`, solicitud: null, ot: o });
    }
  }

  return casos.map(c => ({ ...c, etapa: etapaDe(c) }));
}

function etapaDe({ solicitud, ot }) {
  const estadoSol = solicitud ? (solicitud.estado || "pendiente") : null;
  if (solicitud && !ot) return estadoSol === "finalizada" ? "cerradas" : "por_revisar";
  if (estaAbierta(ot)) return "con_taller";
  // La orden terminó: si vino de Salud, falta avisarle y cerrar su solicitud.
  if (solicitud && estadoSol !== "finalizada" && ot.estado === "completada") return "con_taller";
  return "cerradas";
}

/** Orden dentro de "Con el taller": primero lo que espera tu respuesta. */
export function pesoDelCaso(c) {
  if (esperaRespuesta(c.ot)) return 0;
  if (c.ot && !estaAbierta(c.ot)) return 1; // terminada, falta cerrar
  if (necesitaAgenda(c.ot)) return 2;
  return 3;
}

export function _selfCheck() {
  const fallos = [];
  const debe = (c, q) => { if (!c) fallos.push(q); };

  debe(estadoCita({ origen: "movilizacion", estado: "pendiente" }) === "por_agendar",
    "una derivada antigua sin cita espera fecha");
  debe(estadoCita({ origen: "solicitud_directa", estado: "pendiente" }) === null,
    "una orden interna del taller no entra en la agenda");
  debe(estadoCita({ origen: "movilizacion", estado: "en_proceso" }) === null,
    "una antigua ya en proceso no pide fecha");

  debe(necesitaAgenda({ origen: "movilizacion", estado: "pendiente", cita_estado: "reagendar" }),
    "una fecha rechazada vuelve al taller");
  debe(!necesitaAgenda({ origen: "movilizacion", estado: "en_proceso", fecha_inicio: "2026-09-01", cita_estado: "reagendar" }),
    "si el trabajo ya empezó, no hay nada que agendar");
  debe(esperaRespuesta({ estado: "asignada", cita_estado: "propuesta" }), "una propuesta espera respuesta");
  debe(!esperaRespuesta({ estado: "cancelada", cita_estado: "propuesta" }), "una cancelada no espera nada");

  const t = tramoDeCita({ estado: "pendiente", cita_estado: "propuesta", cita_fecha: "2026-10-02T12:00:00.000Z", cita_entrega: "2026-10-03" });
  debe(t && t.desde === "2026-10-02" && t.hasta === "2026-10-03" && t.porConfirmar, "la propuesta ocupa del ingreso a la entrega");
  const t2 = tramoDeCita({ estado: "pendiente", cita_estado: "confirmada", cita_fecha: "2026-10-02T12:00:00.000Z", cita_entrega: "2026-09-01" });
  debe(t2 && t2.hasta === "2026-10-02" && !t2.porConfirmar, "una entrega anterior al ingreso se ignora");
  debe(tramoDeCita({ estado: "pendiente", cita_estado: "reagendar", cita_fecha: "2026-10-02" }) === null,
    "una fecha rechazada no ocupa el vehículo");
  debe(tramoDeCita({ estado: "en_proceso", fecha_inicio: "2026-10-01", cita_estado: "confirmada", cita_fecha: "2026-10-02" }) === null,
    "cuando empieza, manda la fecha real");

  const casos = casosDeMovilizacion({
    solicitudes: [
      { id: "s1", estado: "pendiente" },
      { id: "s2", estado: "en_proceso" },
      { id: "s3", estado: "en_proceso" },
      { id: "s4", estado: "finalizada" },
    ],
    ordenes: [
      { id: "o2", solicitud_id: "s2", origen: "movilizacion", estado: "asignada", cita_estado: "propuesta" },
      { id: "o3", solicitud_id: "s3", origen: "movilizacion", estado: "completada" },
      { id: "o5", origen: "movilizacion", estado: "pendiente" },
      { id: "o6", origen: "movilizacion", estado: "completada" },
      { id: "o7", origen: "solicitud_directa", estado: "pendiente" },
    ],
  });
  const etapa = (id) => casos.find(c => c.id === id)?.etapa;
  debe(casos.length === 6, `seis casos (la interna del taller no), hubo ${casos.length}`);
  debe(etapa("s:s1") === "por_revisar", "lo de Salud sin decidir está por revisar");
  debe(etapa("s:s2") === "con_taller", "lo derivado con orden abierta está con el taller");
  debe(etapa("s:s3") === "con_taller", "terminado pero sin cerrar la solicitud sigue a la vista");
  debe(etapa("s:s4") === "cerradas", "lo cerrado queda en cerradas");
  debe(etapa("o:o5") === "con_taller", "un pedido directo abierto está con el taller");
  debe(etapa("o:o6") === "cerradas", "un pedido directo terminado se cierra solo");
  const conTaller = casos.filter(c => c.etapa === "con_taller").sort((a, b) => pesoDelCaso(a) - pesoDelCaso(b));
  debe(conTaller[0].id === "s:s2", "lo que espera tu respuesta va primero");

  if (fallos.length) { console.error("FALLOS:\n  " + fallos.join("\n  ")); return false; }
  console.log("agendaTaller: autotest ok");
  return true;
}

if (typeof process !== "undefined" && process.argv?.[1]?.endsWith("agendaTaller.js")) _selfCheck();
