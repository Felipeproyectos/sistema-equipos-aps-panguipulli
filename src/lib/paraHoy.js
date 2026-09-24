// "Para hoy": lo primero que ve cada rol al entrar, ordenado de lo más urgente
// a lo menos, con un botón que lleva a donde se resuelve. Es lo mismo que el
// Panel de Flota hace para Movilización, ahora para Salud y el Taller.
// `node src/lib/paraHoy.js` corre el autotest.
//
// Cada aviso es { clave, tono, titulo, detalle, accion, pagina, filtro? }.
// `clave` elige el ícono en la pantalla (así este archivo no importa React).
// Los tonos van de lo que se rompe a lo informativo: rojo, ambar, azul, verde.
import { CITA, estadoCita, estaAbierta, necesitaAgenda, textoCita } from "./agendaTaller.js";
import { periodosEnTaller, rangosSeTocan } from "./calendarioFlota.js";
import { esSolicitudDeFlota } from "./panelFlota.js";

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
const DIA_MS = 86400000;
const aISO = (d) => d.toISOString().split("T")[0];
const sumar = (dia, n) => aISO(new Date(new Date(`${dia}T12:00:00`).getTime() + n * DIA_MS));

/** "Hilux · JKLM-11, Sprinter · KXJZ-42 y 2 más". */
export function nombres(lista, rotulo, max = 3) {
  const vistos = lista.slice(0, max).map(rotulo).filter(Boolean);
  const resto = lista.length - vistos.length;
  return vistos.join(", ") + (resto > 0 ? ` y ${resto} más` : "");
}

const rotuloEquipo = (e) => [`${e?.marca || ""} ${e?.modelo || ""}`.trim(), e?.patente || e?.numero_inventario]
  .filter(Boolean).join(" · ");
const rotuloOT = (o) => o.equipo_label || [o.marca_modelo, o.patente].filter(Boolean).join(" · ") || o.numero_ot;

// ── Salud ────────────────────────────────────────────────────────────────
/**
 * Para el Encargado de Salud (y quien ve su Dashboard). `paginas` son las
 * pantallas que ese rol tiene en el menú: un aviso sin dónde resolverlo no se
 * muestra.
 */
export function avisosSalud({
  equipos = [], parches = [], alertas = [], inspecciones = [], solicitudes = [], ordenes = [],
  hoy, paginas = new Set(),
}) {
  const dia = hoy || aISO(new Date());
  const porId = new Map(equipos.map(e => [e.id, e]));
  const avisos = [];

  const vencidos = parches.filter(p => p.fecha_vencimiento && p.fecha_vencimiento < dia && p.activo !== false);
  if (vencidos.length) {
    const eqs = [...new Map(vencidos.map(p => [p.equipo_id, porId.get(p.equipo_id)])).values()].filter(Boolean);
    avisos.push({
      clave: "parche", tono: "rojo",
      titulo: `${plural(vencidos.length, "parche vencido", "parches vencidos")}`,
      detalle: eqs.length ? `En ${nombres(eqs, rotuloEquipo)}.` : "Hay que reemplazarlos antes de usar el equipo.",
      accion: "Ver equipos", pagina: "Equipos2",
    });
  }

  const fuera = equipos.filter(e => e.estado === "fuera_de_servicio" && e.activo !== false);
  if (fuera.length) {
    avisos.push({
      clave: "fuera", tono: "rojo",
      titulo: `${plural(fuera.length, "equipo está", "equipos están")} fuera de servicio`,
      detalle: nombres(fuera, rotuloEquipo), accion: "Ver equipos", pagina: "Equipos2",
    });
  }

  // Los vehículos que Salud va a dejar de tener: en el taller hoy, o con
  // ingreso en los próximos tres días. Es lo que hay que prever en los turnos.
  const taller = periodosEnTaller(ordenes);
  const vehiculos = equipos.filter(e => esSolicitudDeFlota({}, e));
  const enTallerHoy = vehiculos.filter(v => taller.some(t => t.equipo_id === v.id && rangosSeTocan(t.desde, t.hasta, dia, dia)));
  const entran = vehiculos
    .filter(v => !enTallerHoy.includes(v))
    .map(v => ({ v, t: taller.find(t => t.equipo_id === v.id && t.cita && rangosSeTocan(t.desde, t.hasta, sumar(dia, 1), sumar(dia, 3))) }))
    .filter(x => x.t);
  if (enTallerHoy.length) {
    avisos.push({
      clave: "taller", tono: "ambar",
      titulo: `${plural(enTallerHoy.length, "vehículo está", "vehículos están")} en el taller hoy`,
      detalle: `${nombres(enTallerHoy, rotuloEquipo)}. No cuentes con ${enTallerHoy.length === 1 ? "él" : "ellos"} para hoy.`,
      accion: "Ver en qué va", pagina: "SolicitudesV2",
    });
  }
  if (entran.length) {
    avisos.push({
      clave: "cita", tono: "azul",
      titulo: `${plural(entran.length, "vehículo entra", "vehículos entran")} al taller en los próximos días`,
      detalle: entran.map(({ v, t }) => `${rotuloEquipo(v)}: ${textoCita(t.desde, false)}${t.porConfirmar ? " (por confirmar)" : ""}`).join(" · "),
      accion: "Ver en qué va", pagina: "SolicitudesV2",
    });
  }

  if (inspecciones.length && paginas.has("RevisionInspecciones")) {
    avisos.push({
      clave: "bitacora", tono: "ambar",
      titulo: `${plural(inspecciones.length, "bitácora espera", "bitácoras esperan")} tu revisión`,
      detalle: "Pautas de inspección enviadas desde el enlace público.",
      accion: "Revisar", pagina: "RevisionInspecciones",
    });
  }

  const pendientes = solicitudes.filter(s => (s.estado || "pendiente") === "pendiente" && !esSolicitudDeFlota(s, porId.get(s.equipo_id)));
  if (pendientes.length && paginas.has("SolicitudesV2")) {
    avisos.push({
      clave: "solicitud", tono: "ambar",
      titulo: `${plural(pendientes.length, "solicitud pendiente", "solicitudes pendientes")}`,
      detalle: "Parches, baterías, mantenciones de equipos médicos.",
      accion: "Gestionar", pagina: "SolicitudesV2",
    });
  }

  if (alertas.length && paginas.has("AlertasV2")) {
    avisos.push({
      clave: "alerta", tono: "gris",
      titulo: `${plural(alertas.length, "alerta activa", "alertas activas")}`,
      detalle: "Vencimientos próximos y avisos automáticos.",
      accion: "Ver alertas", pagina: "AlertasV2",
    });
  }

  // Lo bueno también se avisa: lo que Salud informó y ya volvió del taller.
  const semana = sumar(dia, -7);
  const deSalud = new Set(solicitudes.map(s => s.id));
  const reparados = ordenes.filter(o => o.estado === "completada" && o.solicitud_id && deSalud.has(o.solicitud_id)
    && (o.fecha_fin || "") >= semana);
  if (reparados.length) {
    avisos.push({
      clave: "listo", tono: "verde",
      titulo: `${plural(reparados.length, "vehículo volvió", "vehículos volvieron")} del taller esta semana`,
      detalle: nombres(reparados, rotuloOT),
      accion: "Ver", pagina: "SolicitudesV2",
    });
  }

  return avisos;
}

// ── Jefe de Taller ───────────────────────────────────────────────────────
export function avisosJefeTaller({ ordenes = [], repuestos = [], email = "", hoy }) {
  const dia = hoy || aISO(new Date());
  const abiertas = ordenes.filter(estaAbierta);
  const avisos = [];

  // Movilización espera que le devuelvan el vehículo.
  const atrasadas = abiertas.filter(o => o.fecha_inicio && o.cita_entrega && o.cita_entrega < dia);
  if (atrasadas.length) {
    avisos.push({
      clave: "atraso", tono: "rojo",
      titulo: `${plural(atrasadas.length, "reparación pasó", "reparaciones pasaron")} su fecha de entrega`,
      detalle: `${nombres(atrasadas, rotuloOT)}. Movilización cuenta con ${atrasadas.length === 1 ? "ese vehículo" : "esos vehículos"}.`,
      accion: "Ver órdenes", pagina: "Taller", filtro: "en_proceso",
    });
  }

  const porAgendar = abiertas.filter(necesitaAgenda);
  if (porAgendar.length) {
    const reag = porAgendar.filter(o => estadoCita(o) === "reagendar").length;
    avisos.push({
      clave: "agenda", tono: "ambar",
      titulo: `${plural(porAgendar.length, "vehículo espera", "vehículos esperan")} que le propongas fecha de ingreso`,
      detalle: nombres(porAgendar, rotuloOT) + (reag ? ` · ${plural(reag, "con otra fecha pedida", "con otra fecha pedida")}` : ""),
      accion: "Agendar", pagina: "Taller", filtro: "por_agendar",
    });
  }

  const enRevision = abiertas.filter(o => o.estado === "en_revision");
  if (enRevision.length) {
    avisos.push({
      clave: "revision", tono: "ambar",
      titulo: `${plural(enRevision.length, "orden terminada espera", "órdenes terminadas esperan")} que la cierres`,
      detalle: nombres(enRevision, rotuloOT), accion: "Revisar y cerrar", pagina: "Taller", filtro: "en_revision",
    });
  }

  const sinMecanico = abiertas.filter(o => o.estado === "pendiente" && !o.mecanico_email && !necesitaAgenda(o));
  if (sinMecanico.length) {
    avisos.push({
      clave: "mecanico", tono: "ambar",
      titulo: `${plural(sinMecanico.length, "orden sin mecánico", "órdenes sin mecánico")}`,
      detalle: nombres(sinMecanico, rotuloOT), accion: "Asignar", pagina: "Taller", filtro: "pendiente",
    });
  }

  const porAprobar = repuestos.filter(s => s.estado === "pendiente" && s.solicitante_email !== email);
  if (porAprobar.length) {
    avisos.push({
      clave: "repuesto", tono: "ambar",
      titulo: `${plural(porAprobar.length, "repuesto espera", "repuestos esperan")} tu aprobación`,
      detalle: nombres(porAprobar, s => s.repuesto_nombre), accion: "Aprobar", pagina: "AprobacionRepuestos",
    });
  }

  // Lo que entra hoy y mañana, para tener el box y el mecánico listos.
  const ingresos = abiertas
    .filter(o => !o.fecha_inicio && estadoCita(o) === "confirmada" && o.cita_fecha)
    .filter(o => { const d = String(o.cita_fecha).slice(0, 10); return d >= dia && d <= sumar(dia, 1); })
    .sort((a, b) => String(a.cita_fecha).localeCompare(String(b.cita_fecha)));
  if (ingresos.length) {
    avisos.push({
      clave: "ingreso", tono: "azul",
      titulo: `${plural(ingresos.length, "vehículo entra", "vehículos entran")} hoy o mañana`,
      detalle: ingresos.map(o => `${textoCita(o.cita_fecha)} · ${rotuloOT(o)}`).join(" — "),
      accion: "Ver órdenes", pagina: "Taller", filtro: "todas",
    });
  }

  const pausadas = abiertas.filter(o => o.estado === "pausada");
  if (pausadas.length) {
    avisos.push({
      clave: "pausa", tono: "gris",
      titulo: `${plural(pausadas.length, "orden pausada", "órdenes pausadas")}`,
      detalle: nombres(pausadas, rotuloOT), accion: "Ver", pagina: "Taller", filtro: "pausada",
    });
  }

  return avisos;
}

/** Cuántas órdenes abiertas tiene cada mecánico: quién está libre. */
export function cargaDeMecanicos(mecanicos = [], ordenes = []) {
  return mecanicos
    .map(m => ({
      nombre: m.full_name || m.email,
      email: m.email,
      abiertas: ordenes.filter(o => estaAbierta(o) && o.mecanico_email === m.email).length,
    }))
    .sort((a, b) => a.abiertas - b.abiertas || a.nombre.localeCompare(b.nombre));
}

// ── Mecánico ─────────────────────────────────────────────────────────────
const PESO_PRIORIDAD = { alta: 0, media: 1, baja: 2 };

/** Qué hacer ahora: lo que ya empezó; si no, lo asignado, por fecha de
 *  ingreso y prioridad. Devuelve { ahora, despues }. */
export function trabajoDelMecanico(ordenes = [], email = "") {
  const mias = ordenes.filter(o => o.mecanico_email && o.mecanico_email === email);
  const orden = (a, b) =>
    String(a.cita_fecha || "9999").localeCompare(String(b.cita_fecha || "9999"))
    || (PESO_PRIORIDAD[a.prioridad] ?? 1) - (PESO_PRIORIDAD[b.prioridad] ?? 1)
    || String(a.created_date || "").localeCompare(String(b.created_date || ""));
  const enCurso = mias.filter(o => o.estado === "en_proceso").sort(orden);
  const pausadas = mias.filter(o => o.estado === "pausada").sort(orden);
  const asignadas = mias.filter(o => o.estado === "asignada").sort(orden);
  const cola = [...enCurso, ...pausadas, ...asignadas];
  return { ahora: cola[0] || null, despues: cola.slice(1) };
}

export { CITA };

export function _selfCheck() {
  const fallos = [];
  const debe = (c, q) => { if (!c) fallos.push(q); };
  const hoy = "2026-09-24";

  // Salud
  const equipos = [
    { id: "a1", tipo: "ambulancia", marca: "Mercedes", modelo: "Sprinter", patente: "KXJZ-42" },
    { id: "a2", tipo: "ambulancia", marca: "Toyota", modelo: "Hiace", patente: "HHHH-22" },
    { id: "d1", tipo: "dea", marca: "Zoll", modelo: "AED", estado: "fuera_de_servicio" },
  ];
  const s = avisosSalud({
    equipos, hoy,
    parches: [{ equipo_id: "d1", fecha_vencimiento: "2026-09-01" }, { equipo_id: "d1", fecha_vencimiento: "2027-01-01" }],
    solicitudes: [{ id: "s1", equipo_id: "d1", estado: "pendiente" }, { id: "s2", equipo_id: "a1", estado: "pendiente" }, { id: "s3", equipo_id: "a2", estado: "en_proceso" }],
    ordenes: [
      { id: "o1", equipo_id: "a1", estado: "en_proceso", fecha_inicio: "2026-09-23" },
      { id: "o2", equipo_id: "a2", origen: "movilizacion", estado: "pendiente", cita_estado: "confirmada",
        cita_fecha: "2026-09-26T12:00:00Z", cita_entrega: "2026-09-26", solicitud_id: "s3" },
    ],
    inspecciones: [{}], alertas: [{}],
    paginas: new Set(["SolicitudesV2", "AlertasV2"]),
  });
  const claves = s.map(a => a.clave).join();
  debe(claves === "parche,fuera,taller,cita,solicitud,alerta",
    `Salud: lo que se rompe primero, sin la bitácora que no puede revisar; dio ${claves}`);
  debe(s[0].titulo === "1 parche vencido", "cuenta solo el vencido");
  debe(/Sprinter/.test(s[2].detalle), "la Sprinter está en el taller hoy");
  debe(/Hiace/.test(s[3].detalle), "la Hiace entra en los próximos días");
  debe(s.find(a => a.clave === "solicitud").titulo === "1 solicitud pendiente", "la de vehículo no cuenta para Salud");

  // Jefe de Taller
  const j = avisosJefeTaller({
    hoy, email: "jefe@x",
    ordenes: [
      { id: "1", estado: "en_proceso", fecha_inicio: "2026-09-20", cita_entrega: "2026-09-22", equipo_label: "Hilux" },
      { id: "2", origen: "movilizacion", estado: "pendiente", cita_estado: "por_agendar", equipo_label: "Canter" },
      { id: "3", estado: "en_revision", equipo_label: "Kangoo" },
      { id: "4", estado: "pendiente", equipo_label: "NPR" },
      { id: "5", origen: "movilizacion", estado: "asignada", cita_estado: "confirmada", cita_fecha: "2026-09-25T11:30:00Z", mecanico_email: "m@x", equipo_label: "Navara" },
      { id: "6", estado: "pausada", equipo_label: "Sprinter" },
      { id: "7", estado: "completada", equipo_label: "Vieja" },
    ],
    repuestos: [{ estado: "pendiente", solicitante_email: "m@x", repuesto_nombre: "Filtro" }, { estado: "pendiente", solicitante_email: "jefe@x" }],
  });
  debe(j.map(a => a.clave).join() === "atraso,agenda,revision,mecanico,repuesto,ingreso,pausa",
    `Jefe: orden de urgencia, dio ${j.map(a => a.clave).join()}`);
  debe(j.find(a => a.clave === "mecanico").titulo === "1 orden sin mecánico", "la por agendar no se cuenta dos veces");
  debe(j.find(a => a.clave === "repuesto").titulo === "1 repuesto espera tu aprobación", "no lo que pidió él");

  const carga = cargaDeMecanicos([{ full_name: "Beto", email: "b@x" }, { full_name: "Ana", email: "m@x" }],
    [{ estado: "asignada", mecanico_email: "m@x" }, { estado: "completada", mecanico_email: "b@x" }]);
  debe(carga[0].nombre === "Beto" && carga[0].abiertas === 0, "el libre primero");

  // Mecánico
  const t = trabajoDelMecanico([
    { id: "a", estado: "asignada", mecanico_email: "m@x", prioridad: "baja" },
    { id: "b", estado: "asignada", mecanico_email: "m@x", prioridad: "alta" },
    { id: "c", estado: "pausada", mecanico_email: "m@x" },
    { id: "d", estado: "en_proceso", mecanico_email: "otro@x" },
  ], "m@x");
  debe(t.ahora.id === "c", "lo pausado va antes que lo nuevo");
  debe(t.despues.map(o => o.id).join() === "b,a", "y después por prioridad");
  debe(trabajoDelMecanico([], "m@x").ahora === null, "sin nada asignado");

  if (fallos.length) { console.error("FALLOS:\n  " + fallos.join("\n  ")); return false; }
  console.log("paraHoy: autotest ok");
  return true;
}

if (typeof process !== "undefined" && process.argv?.[1]?.endsWith("paraHoy.js")) _selfCheck();
