// Copia de src/lib/contadoresMenu.js, generada por migracion/sincronizar_compartido.py.
// No editar a mano: se edita el original y se vuelve a correr el script.

// Los números que aparecen al lado de cada opción del menú: cuántas cosas
// esperan a la persona en esa pantalla. Separado del menú para poder probarlo
// sin navegador: `node src/lib/contadoresMenu.js`.
//
// La regla de cada número es la misma que usa su pantalla para decir "esto te
// toca a ti". Un contador que no coincide con lo que la persona encuentra al
// entrar enseña a ignorarlo.
//
// Se cuenta lo que ESPERA una acción, no todo lo abierto: una orden en
// reparación no es tarea del Jefe de Taller hasta que vuelve a él.
import { esperaRespuesta, estaAbierta, necesitaAgenda } from "./agendaTaller.js";
import { esSolicitudDeFlota } from "./panelFlota.js";
import { alertasDelRol, criticasRecientes } from "./alertas.js";

const R = {
  SUPER_ADMIN: "super_admin",
  ADMIN: "admin",
  ENCARGADO_SALUD: "encargado_salud",
  ENCARGADO_COMPRAS_SALUD: "encargado_compras_salud",
  JEFE_TALLER: "jefe_taller",
  ENCARGADO_COMPRAS_TALLER: "encargado_compras_taller",
  MECANICO: "mecanico",
  ENCARGADO_MOVILIZACION: "encargado_movilizacion",
  MONITOR_CORPORATIVO: "monitor_corporativo",
};

// Qué pantalla tiene contador, para qué roles, y qué datos necesita. El hook
// pide a la base solo lo que usan las pantallas del rol que mira.
export const CONTADORES = {
  Movilizacion: { roles: [R.SUPER_ADMIN, R.ENCARGADO_MOVILIZACION], datos: ["solicitudes", "ordenes", "equipos"],
    etiqueta: "Solicitudes al Taller", frase: "fallas por revisar, fechas del taller por responder o reparaciones por cerrar" },
  Taller: { roles: [R.SUPER_ADMIN, R.JEFE_TALLER], datos: ["ordenes"],
    etiqueta: "Taller", frase: "órdenes sin asignar o con fecha de ingreso por proponer" },
  OrdenesTrabajo: { roles: [R.MECANICO], datos: ["ordenes"],
    etiqueta: "Órdenes de Trabajo", frase: "órdenes asignadas sin empezar" },
  AprobacionRepuestos: { roles: [R.SUPER_ADMIN, R.JEFE_TALLER], datos: ["repuestos"],
    etiqueta: "Aprobación Solicitudes", frase: "repuestos por aprobar" },
  ComprasTablero: { roles: [R.SUPER_ADMIN, R.ENCARGADO_COMPRAS_TALLER], datos: ["repuestos"],
    etiqueta: "Tablero de Compras", frase: "compras aprobadas por hacer" },
  ComprasSaludTablero: { roles: [R.SUPER_ADMIN, R.ENCARGADO_COMPRAS_SALUD], datos: ["repuestosSalud"],
    etiqueta: "Tablero de Compras Salud", frase: "compras aprobadas por hacer" },
  SolicitudesV2: { roles: [R.SUPER_ADMIN, R.ADMIN, R.ENCARGADO_SALUD, R.ENCARGADO_COMPRAS_SALUD], datos: ["solicitudes", "equipos"],
    etiqueta: "Solicitudes", frase: "solicitudes por enviar al Monitor Corporativo o cerrar en el centro, o que el Monitor devolvió" },
  SolicitudesMonitor: { roles: [R.SUPER_ADMIN, R.MONITOR_CORPORATIVO], datos: ["solicitudes", "equipos"],
    etiqueta: "Solicitudes de Centros", frase: "solicitudes de los centros sin tomar" },
  RevisionInspecciones: { roles: [R.SUPER_ADMIN, R.ENCARGADO_SALUD], datos: ["inspecciones", "equipos"],
    etiqueta: "Revisión Bitácora", frase: "pautas con novedades por revisar" },
  // Cada rol cuenta las de su área (src/lib/alertas.js): Calidad las de los
  // equipos médicos, Movilización las de vehículos y licencias. Casi siempre
  // hay alguna activa, así que por sí solas no justifican el resumen diario,
  // salvo cuando acaba de vencer algo (resumenParaCorreo).
  AlertasV2: { roles: [R.SUPER_ADMIN, R.ADMIN, R.ENCARGADO_SALUD, R.ENCARGADO_MOVILIZACION], datos: ["alertas", "equipos"],
    etiqueta: "Alertas", frase: "vencimientos por atender", fueraDelCorreo: true },
};

/** Qué conjuntos de datos hay que traer para este rol. */
export function datosParaRol(role) {
  const s = new Set();
  for (const c of Object.values(CONTADORES)) if (c.roles.includes(role)) c.datos.forEach(d => s.add(d));
  return [...s];
}

const pendiente = (s) => (s.estado || "pendiente") === "pendiente";

/** El centro que tenía el equipo al hacer la pauta, y el dueño. */
function centrosDePauta(insp, porId) {
  let datos = {};
  try { datos = insp.datos_json ? JSON.parse(insp.datos_json) : {}; } catch { datos = {}; }
  return [datos.prestamo?.centro_destino, datos.equipo?.centro_principal || porId.get(insp.equipo_id)?.centro_principal].filter(Boolean);
}

/**
 * { pagina: número } para el rol. Solo trae las páginas con algo (> 0).
 * `email` es el de quien mira: el mecánico cuenta sus órdenes, y en la
 * aprobación de repuestos no se cuenta lo que uno mismo pidió.
 * `centros` son los del Encargado de Salud: sus pantallas le muestran lo de
 * sus centros, y el número tiene que contar lo mismo. Vacío = todos.
 */
export function contarPendientes(role, email, d = {}, centros = []) {
  const {
    solicitudes = [], ordenes = [], equipos = [], repuestos = [],
    repuestosSalud = [], inspecciones = [], alertas = [],
  } = d;
  const porId = new Map(equipos.map(e => [e.id, e]));
  const deFlota = (s) => esSolicitudDeFlota(s, porId.get(s.equipo_id));
  const misCentros = role === R.ENCARGADO_SALUD ? centros.filter(Boolean) : [];
  // Igual que Solicitudes: la que no tiene centro no se le esconde a nadie.
  const solicitudMia = (s) => {
    const centro = s.centro || porId.get(s.equipo_id)?.centro_principal || "";
    return !misCentros.length || !centro || misCentros.includes(centro);
  };
  // Igual que Revisión Bitácora: la del centro dueño o la del que la tenía prestada.
  const pautaMia = (i) => !misCentros.length || centrosDePauta(i, porId).some(c => misCentros.includes(c));

  const reglas = {
    // Lo que Salud informó y nadie revisó, las fechas del Taller sin
    // responder, y lo reparado que falta cerrar y avisar a Salud.
    Movilizacion: () => {
      const cerradaSol = new Map(solicitudes.map(s => [s.id, (s.estado || "pendiente") === "finalizada"]));
      const conOrden = new Set(ordenes.filter(o => o.solicitud_id).map(o => o.solicitud_id));
      // Igual que la pestaña "Por revisar": sin orden y sin cerrar.
      const porRevisar = solicitudes.filter(s => deFlota(s) && !conOrden.has(s.id)
        && (s.estado || "pendiente") !== "finalizada").length;
      const deMov = ordenes.filter(o => o.origen === "movilizacion");
      const porResponder = deMov.filter(esperaRespuesta).length;
      const porCerrar = deMov.filter(o => o.estado === "completada" && o.solicitud_id
        && cerradaSol.has(o.solicitud_id) && !cerradaSol.get(o.solicitud_id)).length;
      return porRevisar + porResponder + porCerrar;
    },
    // Órdenes que esperan al Jefe: sin asignar, o con fecha por proponer.
    Taller: () => ordenes.filter(o => o.estado === "pendiente" || necesitaAgenda(o)).length,
    OrdenesTrabajo: () => ordenes.filter(o => o.mecanico_email && o.mecanico_email === email && o.estado === "asignada").length,
    AprobacionRepuestos: () => repuestos.filter(s => s.estado === "pendiente" && s.solicitante_email !== email).length,
    ComprasTablero: () => repuestos.filter(s => s.estado === "aprobada").length,
    ComprasSaludTablero: () => repuestosSalud.filter(s => s.estado === "aprobada").length,
    // Las de vehículos no: esas las resuelve Movilización. Las que el
    // Monitor devolvió vuelven a ser tarea del centro.
    SolicitudesV2: () => solicitudes.filter(s => (pendiente(s) || s.estado === "devuelta") && !deFlota(s) && solicitudMia(s)).length,
    // Lo que los centros enviaron y el Monitor no ha tomado.
    SolicitudesMonitor: () => solicitudes.filter(s => s.estado === "derivada" && !deFlota(s)).length,
    RevisionInspecciones: () => inspecciones.filter(i => (i.estado || "pendiente") === "pendiente" && pautaMia(i)).length,
    AlertasV2: () => alertasDelRol(role, alertas.filter(a => a.estado === "activa"), porId, centros).length,
  };

  const out = {};
  for (const [pagina, c] of Object.entries(CONTADORES)) {
    if (!c.roles.includes(role)) continue;
    const n = reglas[pagina]();
    if (n > 0) out[pagina] = n;
  }
  return out;
}

/**
 * Lo que va en el resumen diario por correo de esa persona: las pantallas con
 * algo pendiente, en el orden del menú. Vacío si no hay nada que la espere.
 *
 * Las alertas solas no lo disparan —siempre hay alguna y el correo se
 * volvería ruido—, salvo los primeros días después de que algo de su área
 * venció: ese es el único aviso por correo que tiene una alerta.
 */
export function resumenParaCorreo(role, email, datos, ahora = Date.now(), centros = []) {
  const cuentas = contarPendientes(role, email, datos, centros);
  const recienVencidas = cuentas.AlertasV2
    ? criticasRecientes(alertasDelRol(role, datos?.alertas || [], datos?.equipos || [], centros), ahora).length
    : 0;
  const lineas = Object.entries(CONTADORES)
    .filter(([pagina]) => cuentas[pagina])
    .map(([pagina, c]) => ({
      pagina, etiqueta: c.etiqueta, frase: c.frase, n: cuentas[pagina],
      soloInfo: !!c.fueraDelCorreo && !(pagina === "AlertasV2" && recienVencidas > 0),
    }));
  return lineas.some(l => !l.soloInfo) ? lineas : [];
}

/** "9+" pasado el nueve: el número exacto está en la pantalla. */
export const rotuloContador = (n) => (n > 9 ? "9+" : String(n));

export function _selfCheck() {
  const fallos = [];
  const debe = (c, q) => { if (!c) fallos.push(q); };

  const equipos = [{ id: "v1", tipo: "ambulancia" }, { id: "m1", tipo: "monitor" }];
  const solicitudes = [
    { id: "s1", equipo_id: "v1", estado: "pendiente" },                   // Movilización por revisar
    { id: "s2", equipo_id: "m1", estado: "pendiente" },                   // Salud
    { id: "s3", equipo_id: "v1", estado: "en_proceso" },                  // derivada, terminada abajo
    { id: "s4", equipo_id: "v1", estado: "pendiente" },                   // ya tiene orden: no se cuenta
    { id: "s5", equipo_id: "m1", estado: "derivada" },                    // en la bandeja del Monitor
    { id: "s6", equipo_id: "m1", estado: "devuelta" },                    // vuelve al centro
    { id: "s7", equipo_id: "m1", estado: "en_proceso" },                  // la tiene el Monitor
  ];
  const ordenes = [
    { id: "o1", origen: "movilizacion", solicitud_id: "s3", estado: "completada" },
    { id: "o2", origen: "movilizacion", estado: "pendiente", cita_estado: "propuesta" },
    { id: "o3", origen: "movilizacion", estado: "pendiente", cita_estado: "por_agendar" },
    { id: "o4", origen: "solicitud_directa", estado: "pendiente" },
    { id: "o5", origen: "movilizacion", estado: "asignada", cita_estado: "reagendar", mecanico_email: "m@x" },
    { id: "o6", estado: "asignada", mecanico_email: "m@x" },
    { id: "o7", estado: "en_proceso", mecanico_email: "m@x" },
    { id: "o8", origen: "movilizacion", solicitud_id: "s4", estado: "pendiente", cita_estado: "por_agendar" },
  ];

  const mov = contarPendientes("encargado_movilizacion", "", { solicitudes, ordenes, equipos });
  debe(mov.Movilizacion === 3, `Movilización: 1 por revisar + 1 por responder + 1 por cerrar, dio ${mov.Movilizacion}`);
  debe(Object.keys(mov).length === 1, "Movilización solo ve su contador");

  const jefe = contarPendientes("jefe_taller", "jefe@x", {
    ordenes,
    repuestos: [{ estado: "pendiente", solicitante_email: "m@x" }, { estado: "pendiente", solicitante_email: "jefe@x" }, { estado: "aprobada" }],
  });
  debe(jefe.Taller === 5, `Taller: 4 pendientes + 1 por reagendar, dio ${jefe.Taller}`);
  debe(jefe.AprobacionRepuestos === 1, "no se cuenta lo que pidió uno mismo");

  const mec = contarPendientes("mecanico", "m@x", { ordenes });
  debe(mec.OrdenesTrabajo === 2, `el mecánico cuenta sus órdenes asignadas sin empezar, dio ${mec.OrdenesTrabajo}`);

  const salud = contarPendientes("encargado_salud", "", {
    solicitudes, equipos, inspecciones: [{ estado: "pendiente" }, { estado: "aprobado" }],
    alertas: [{ estado: "activa" }, { estado: "resuelta" }],
  });
  debe(salud.SolicitudesV2 === 2, `Salud cuenta su pendiente y la devuelta, no las de vehículos, dio ${salud.SolicitudesV2}`);
  debe(!("SolicitudesMonitor" in salud), "Salud no ve la bandeja del Monitor");
  debe(salud.RevisionInspecciones === 1 && salud.AlertasV2 === 1, "bitácoras y alertas pendientes");
  debe(!("Movilizacion" in salud), "Salud no ve el contador de Movilización");

  const monitor = contarPendientes("monitor_corporativo", "", { solicitudes, ordenes, equipos });
  debe(monitor.SolicitudesMonitor === 1 && Object.keys(monitor).length === 1,
    `el Monitor cuenta solo lo enviado sin tomar, dio ${JSON.stringify(monitor)}`);
  debe(contarPendientes("jefe_taller", "", {}).Taller === undefined, "sin nada pendiente no hay número");
  debe(datosParaRol("mecanico").join() === "ordenes", "el mecánico solo pide órdenes");
  debe(rotuloContador(12) === "9+" && rotuloContador(3) === "3", "rótulo corto");

  const correo = resumenParaCorreo("encargado_salud", "", {
    solicitudes, equipos, inspecciones: [{ estado: "pendiente" }], alertas: [{ estado: "activa" }],
  });
  debe(correo.map(l => l.pagina).join() === "SolicitudesV2,RevisionInspecciones,AlertasV2",
    `el correo lista lo pendiente en orden del menú, dio ${correo.map(l => l.pagina)}`);
  debe(resumenParaCorreo("encargado_salud", "", { alertas: [{ estado: "activa" }] }).length === 0,
    "solo alertas no manda correo");
  debe(resumenParaCorreo("monitor_corporativo", "", { solicitudes, ordenes, equipos }).map(l => l.pagina).join() === "SolicitudesMonitor",
    "el Monitor recibe el resumen de su bandeja");

  // El Encargado cuenta lo de sus centros, como sus pantallas.
  const porCentro = {
    equipos: [{ id: "da", tipo: "dea", centro_principal: "CESFAM A" }, { id: "db", tipo: "dea", centro_principal: "CESFAM B" }],
    solicitudes: [{ id: "1", equipo_id: "da", estado: "pendiente", centro: "CESFAM A" }, { id: "2", equipo_id: "db", estado: "pendiente" }, { id: "3", estado: "pendiente", tipo: "otros" }],
    inspecciones: [
      { estado: "pendiente", equipo_id: "da", datos_json: JSON.stringify({ equipo: { centro_principal: "CESFAM A" } }) },
      { estado: "pendiente", equipo_id: "db" },
      { estado: "pendiente", equipo_id: "db", datos_json: JSON.stringify({ equipo: { centro_principal: "CESFAM B" }, prestamo: { centro_destino: "CESFAM A" } }) },
    ],
  };
  const deA = contarPendientes("encargado_salud", "", porCentro, ["CESFAM A"]);
  debe(deA.SolicitudesV2 === 2, `el Encargado cuenta las solicitudes de su centro y las sin centro, dio ${deA.SolicitudesV2}`);
  debe(deA.RevisionInspecciones === 2, `y las pautas de su centro o prestadas a su centro, dio ${deA.RevisionInspecciones}`);
  debe(contarPendientes("encargado_salud", "", porCentro).SolicitudesV2 === 3, "sin centro asignado ve todo");
  debe(contarPendientes("super_admin", "", porCentro, ["CESFAM A"]).RevisionInspecciones === 3, "los centros solo acotan al Encargado");

  // Cada área cuenta sus alertas, y solo lo recién vencido dispara el correo.
  const ahora = new Date("2026-11-16T12:00:00Z").getTime();
  const conAlertas = { equipos, alertas: [
    { estado: "activa", tipo: "revision_tecnica_vencida", equipo_id: "v1", nivel: "critica", created_date: "2026-11-15T06:00:00Z" },
    { estado: "activa", tipo: "parche_por_vencer", equipo_id: "m1", nivel: "advertencia", created_date: "2026-11-15T06:00:00Z" },
  ] };
  debe(contarPendientes("encargado_salud", "", conAlertas).AlertasV2 === 1, "Calidad cuenta solo las alertas de equipos médicos");
  debe(contarPendientes("encargado_movilizacion", "", conAlertas).AlertasV2 === 1, "Movilización cuenta las de vehículos");
  debe(contarPendientes("super_admin", "", conAlertas).AlertasV2 === 2, "Base del Sistema las cuenta todas");
  debe(resumenParaCorreo("encargado_movilizacion", "", conAlertas, ahora).map(l => l.pagina).join() === "AlertasV2", "algo recién vencido sí manda correo");
  debe(resumenParaCorreo("encargado_salud", "", conAlertas, ahora).length === 0, "una alerta por vencer, sola, no manda correo");
  debe(resumenParaCorreo("encargado_movilizacion", "", conAlertas, ahora + 10 * 86400000).length === 0, "pasados unos días deja de insistir");

  if (fallos.length) { console.error("FALLOS:\n  " + fallos.join("\n  ")); return false; }
  console.log("contadoresMenu: autotest ok");
  return true;
}

if (typeof process !== "undefined" && process.argv?.[1]?.endsWith("contadoresMenu.js")) _selfCheck();
