// El turno del chofer: quién tiene qué vehículo AHORA y qué hizo en el día.
//
// Cómo funciona desde migracion/25_turno_chofer.sql
// ─────────────────────────────────────────────────
// Movilización ya no asigna. El chofer toma el vehículo al hacer la pauta de
// inicio y lo entrega al terminar; si en el día cambia de vehículo, cada toma
// queda como un tramo (UsoVehiculo). Lo que Movilización programaba quedó
// como RESERVAS (AsignacionChofer): un vehículo apartado para una salida
// puntual, que el chofer ve al ir a tomarlo.
//
// Estas reglas las usan la pantalla del chofer (Mi turno), el Panel de Flota,
// el Calendario, el Monitor y el servidor (servidor/funciones/turnoVehiculo.js,
// vía la copia de servidor/compartido/). Por eso solo importan con rutas
// relativas. `node src/lib/turnoFlota.js` corre el autotest.
import { periodosEnTaller, rangosSeTocan, asignacionDeHoy } from "./calendarioFlota.js";

export const TIPOS_VEHICULO = ["ambulancia", "camioneta", "furgon", "camion_3_4"];

/** La revisión rápida de la pauta de inicio de los vehículos corporativos.
 *  Las ambulancias usan la Pauta Diaria que ya existía. */
export const CHECKLIST_INICIO = [
  { clave: "luces", label: "Luces y señalizadores" },
  { clave: "neumaticos", label: "Neumáticos" },
  { clave: "frenos", label: "Frenos" },
  { clave: "niveles", label: "Niveles (aceite, agua, frenos)" },
  { clave: "documentos", label: "Documentos al día" },
  { clave: "limpieza", label: "Limpieza y orden" },
];

export const COMBUSTIBLE = ["Reserva", "1/4", "1/2", "3/4", "Lleno"];

export const MOTIVOS_CAMBIO = [
  "Falla del vehículo",
  "Cambio de destino o de carga",
  "Lo necesita otro servicio",
  "Relevo / fin de mi tramo",
  "Otro",
];

/** El día en Chile, aunque el servidor o el navegador estén en otra zona. */
export function hoyChile(ahora = new Date()) {
  return ahora.toLocaleDateString("en-CA", { timeZone: "America/Santiago" });
}

/** "08:05" en hora de Chile. */
export function horaChile(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Santiago" });
}

/** El día en Chile de un instante. */
export function diaChile(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : hoyChile(d);
}

export const esVehiculoDeFlota = (e) => !!e && TIPOS_VEHICULO.includes(e.tipo) && e.activo !== false;

export const rotuloVehiculo = (v) =>
  [[v?.marca, v?.modelo].filter(Boolean).join(" "), v?.patente].filter(Boolean).join(" · ") || "Vehículo";

/** Los ítems marcados "mal" en la pauta de inicio. */
export function fallasDePauta(pauta) {
  if (!pauta || typeof pauta !== "object") return [];
  return CHECKLIST_INICIO
    .filter(i => pauta[i.clave]?.estado === "mal")
    .map(i => ({ ...i, obs: String(pauta[i.clave]?.obs || "").trim() }));
}

/** ¿Respondió todos los ítems? */
export const pautaCompleta = (pauta) =>
  CHECKLIST_INICIO.every(i => ["bien", "mal"].includes(pauta?.[i.clave]?.estado));

export function kmRecorridos(uso) {
  const a = Number(uso?.km_inicio), b = Number(uso?.km_fin);
  return Number.isFinite(a) && Number.isFinite(b) && uso.km_fin != null && uso.km_inicio != null && b >= a ? b - a : null;
}

/** El último kilometraje que consta de un vehículo, mirando todo lo que lo
 *  registra: los usos, la bitácora de salidas y el kilometraje de Calidad. */
export function ultimoKm(equipoId, { usos = [], bitacora = [], kilometrajes = [] } = {}) {
  let mejor = null;
  const ver = (km, fecha, quien) => {
    const n = Number(km);
    if (km == null || km === "" || !Number.isFinite(n) || n <= 0) return;
    if (!mejor || n > mejor.km) mejor = { km: n, fecha: fecha || null, quien: quien || null };
  };
  for (const u of usos) {
    if (u.equipo_id !== equipoId || u.estado === "rechazado") continue;
    ver(u.km_inicio, u.inicio, u.chofer_nombre);
    ver(u.km_fin, u.fin || u.inicio, u.chofer_nombre);
  }
  for (const b of bitacora) {
    if (b.equipo_id !== equipoId) continue;
    ver(b.km_salida, b.fecha, b.chofer_nombre);
    ver(b.km_regreso, b.fecha, b.chofer_nombre);
  }
  for (const k of kilometrajes) {
    if (k.equipo_id !== equipoId) continue;
    ver(k.valor_km, k.fecha, k.conductor);
    ver(k.km_inicial, k.fecha, k.conductor);
    ver(k.km_final, k.fecha, k.conductor);
  }
  return mejor;
}

/**
 * En qué está cada vehículo ahora.
 *   mio            lo tiene este chofer
 *   en_uso         lo tiene otro chofer
 *   taller         en el taller (orden andando o cita para hoy)
 *   fuera_servicio marcado fuera de servicio
 *   libre          se puede tomar (puede tener una reserva para hoy)
 */
export function estadoDeVehiculos({ vehiculos = [], usos = [], ordenes = [], reservas = [], prestamos = [], choferId = null, hoy } = {}) {
  const dia = hoy || hoyChile();
  const taller = periodosEnTaller(ordenes);
  return vehiculos.filter(esVehiculoDeFlota).map(v => {
    const uso = usos.find(u => u.equipo_id === v.id && u.estado === "en_uso") || null;
    const enTaller = taller.find(t => t.equipo_id === v.id && !t.porConfirmar && rangosSeTocan(t.desde, t.hasta, dia, dia)) || null;
    const reserva = asignacionDeHoy(reservas, v.id, dia);
    const prestamo = prestamos.find(p => p.equipo_id === v.id && p.estado === "vigente") || null;
    let estado = "libre";
    if (uso) estado = choferId && uso.chofer_id === choferId ? "mio" : "en_uso";
    else if (v.estado === "fuera_de_servicio") estado = "fuera_servicio";
    else if (enTaller) estado = "taller";
    return { vehiculo: v, estado, uso, taller: enTaller, reserva, prestamo };
  });
}

/** Los grupos de la pantalla "Tomar vehículo". */
export function gruposParaTomar(estados, choferId) {
  const paraMi = (e) => e.reserva && e.reserva.chofer_id === choferId;
  const libres = estados.filter(e => e.estado === "libre");
  const orden = (a, b) => rotuloVehiculo(a.vehiculo).localeCompare(rotuloVehiculo(b.vehiculo), "es");
  return {
    disponibles: libres.filter(e => !e.reserva || paraMi(e))
      .sort((a, b) => (paraMi(b) ? 1 : 0) - (paraMi(a) ? 1 : 0) || orden(a, b)),
    reservados: libres.filter(e => e.reserva && !paraMi(e)).sort(orden),
    enUso: estados.filter(e => e.estado === "en_uso").sort(orden),
    noDisponibles: estados.filter(e => ["taller", "fuera_servicio"].includes(e.estado)).sort(orden),
  };
}

/** Lo que hizo un chofer en el día, en orden: sus tramos. */
export function tramosDelDia(usos, choferId, hoy) {
  const dia = hoy || hoyChile();
  return usos
    .filter(u => u.chofer_id === choferId && u.estado !== "rechazado"
      && (u.fecha === dia || diaChile(u.inicio) === dia || u.estado === "en_uso"))
    .sort((a, b) => String(a.inicio || "").localeCompare(String(b.inicio || "")));
}

/** Los usos que tocan un día (para el calendario): los que empezaron ese día,
 *  los que seguían abiertos y los que terminaron ese día. */
export function usosDelDia(usos, equipoId, dia, hoy) {
  const h = hoy || hoyChile();
  return usos.filter(u => {
    if (u.equipo_id !== equipoId || u.estado === "rechazado") return false;
    const desde = u.fecha || diaChile(u.inicio);
    const hasta = u.estado === "en_uso" ? h : (diaChile(u.fin) || desde);
    return desde && desde <= dia && dia <= hasta;
  }).sort((a, b) => String(a.inicio || "").localeCompare(String(b.inicio || "")));
}

/** Lo que Movilización ve en el Panel: el estado de la flota ahora y los avisos. */
export function resumenAhora({ vehiculos = [], usos = [], ordenes = [], reservas = [], prestamos = [], hoy } = {}) {
  const dia = hoy || hoyChile();
  const estados = estadoDeVehiculos({ vehiculos, usos, ordenes, reservas, prestamos, hoy: dia });
  const deHoy = (u) => (u.fecha || diaChile(u.inicio)) === dia;
  return {
    dia,
    estados,
    enUso: estados.filter(e => e.estado === "en_uso"),
    libres: estados.filter(e => e.estado === "libre" && !e.reserva),
    reservados: estados.filter(e => e.estado === "libre" && e.reserva),
    enTaller: estados.filter(e => e.estado === "taller"),
    fueraServicio: estados.filter(e => e.estado === "fuera_servicio"),
    prestados: estados.filter(e => e.prestamo),
    sinEntregar: usos.filter(u => u.estado === "en_uso" && (u.fecha || diaChile(u.inicio)) < dia),
    relevosHoy: usos.filter(u => u.cerrado_por === "relevo" && diaChile(u.fin) === dia),
    liberadosHoy: usos.filter(u => u.cerrado_por === "movilizacion" && diaChile(u.fin) === dia),
    rechazosHoy: usos.filter(u => u.estado === "rechazado" && deHoy(u)),
    fallasHoy: usos.filter(u => u.pauta_con_falla && u.estado !== "rechazado" && deHoy(u)),
    usosHoy: usos.filter(u => u.estado !== "rechazado" && deHoy(u)),
  };
}

export function _selfCheck() {
  const fallos = [];
  const debe = (c, q) => { if (!c) fallos.push(q); };
  const hoy = "2026-10-08";

  const vehiculos = [
    { id: "v1", tipo: "camioneta", marca: "Toyota", modelo: "Hilux", patente: "AA-11", estado: "operativo" },
    { id: "v2", tipo: "furgon", marca: "Peugeot", modelo: "Partner", patente: "BB-22", estado: "operativo" },
    { id: "v3", tipo: "ambulancia", marca: "Mercedes", modelo: "Sprinter", estado: "operativo" },
    { id: "v4", tipo: "furgon", marca: "Hyundai", modelo: "H-1", estado: "mantenimiento" },
    { id: "v5", tipo: "camioneta", marca: "Ford", modelo: "Ranger", estado: "fuera_de_servicio" },
    { id: "v6", tipo: "camioneta", marca: "Nissan", modelo: "Navara", estado: "operativo" },
    { id: "d1", tipo: "dea" },
    { id: "v7", tipo: "camioneta", activo: false },
  ];
  const usos = [
    { id: "u1", equipo_id: "v2", chofer_id: "daniela", chofer_nombre: "Daniela", estado: "en_uso", fecha: hoy, inicio: "2026-10-08T11:10:00Z", km_inicio: 33000 },
    { id: "u2", equipo_id: "v1", chofer_id: "carlos", chofer_nombre: "Carlos", estado: "entregado", fecha: hoy, inicio: "2026-10-08T11:05:00Z", fin: "2026-10-08T14:40:00Z", km_inicio: 50100, km_fin: 50198, pauta_con_falla: true },
    { id: "u3", equipo_id: "v6", chofer_id: "carlos", chofer_nombre: "Carlos", estado: "en_uso", fecha: hoy, inicio: "2026-10-08T14:50:00Z", km_inicio: 12890 },
    { id: "u4", equipo_id: "v3", chofer_id: "hugo", estado: "rechazado", fecha: hoy, inicio: "2026-10-08T12:00:00Z" },
    { id: "u5", equipo_id: "v1", chofer_id: "jorge", chofer_nombre: "Jorge", estado: "entregado", fecha: "2026-10-07", inicio: "2026-10-07T11:00:00Z", fin: "2026-10-07T20:00:00Z", km_inicio: 49900, km_fin: 50100 },
    { id: "u6", equipo_id: "v9", chofer_id: "luis", estado: "en_uso", fecha: "2026-10-06", inicio: "2026-10-06T11:00:00Z" },
    { id: "u7", equipo_id: "v2", chofer_id: "jorge", estado: "entregado", cerrado_por: "relevo", fecha: hoy, inicio: "2026-10-08T10:00:00Z", fin: "2026-10-08T11:10:00Z" },
  ];
  const ordenes = [
    { equipo_id: "v4", estado: "en_proceso", fecha_inicio: "2026-10-06" },
    { equipo_id: "v6", estado: "pendiente", cita_estado: "propuesta", cita_fecha: "2026-10-08T12:00:00Z", origen: "movilizacion" },
  ];
  const reservas = [
    { id: "r1", equipo_id: "v3", chofer_id: "carlos", chofer_nombre: "Carlos", estado: "activa", desde: hoy, hasta: hoy, hora_salida: "14:00" },
    { id: "r2", equipo_id: "v6", chofer_id: "valeria", estado: "activa", desde: hoy, hasta: "2026-10-10" },
    { id: "r3", equipo_id: "v1", chofer_id: "valeria", estado: "activa", desde: "2026-10-09", hasta: "2026-10-09" },
  ];

  const est = estadoDeVehiculos({ vehiculos, usos, ordenes, reservas, choferId: "carlos", hoy });
  const de = (id) => est.find(e => e.vehiculo.id === id);
  debe(est.length === 6, "solo vehículos activos (sin DEA ni dados de baja)");
  debe(de("v2").estado === "en_uso" && de("v2").uso.chofer_id === "daniela", "la Partner la tiene Daniela");
  debe(de("v6").estado === "mio", "la Navara es de Carlos");
  debe(de("v4").estado === "taller", "la H-1 está en el taller");
  debe(de("v5").estado === "fuera_servicio", "la Ranger está fuera de servicio");
  debe(de("v1").estado === "libre" && !de("v1").reserva, "la Hilux está libre (la reserva es de mañana)");
  debe(de("v3").estado === "libre" && de("v3").reserva?.id === "r1", "la ambulancia está reservada hoy");

  const g = gruposParaTomar(est, "carlos");
  debe(g.disponibles.map(e => e.vehiculo.id).join() === "v3,v1", "primero lo reservado para mí, después lo libre");
  debe(g.enUso.length === 1 && g.noDisponibles.length === 2 && g.reservados.length === 0, "grupos");
  const g2 = gruposParaTomar(est, "jorge");
  debe(g2.reservados.map(e => e.vehiculo.id).join() === "v3", "para otro chofer la ambulancia aparece reservada");

  const t = tramosDelDia(usos, "carlos", hoy);
  debe(t.map(u => u.id).join() === "u2,u3", "los dos tramos de Carlos, en orden");
  debe(kmRecorridos(t[0]) === 98 && kmRecorridos(t[1]) === null, "km del tramo cerrado");

  const km = ultimoKm("v1", { usos, bitacora: [{ equipo_id: "v1", km_regreso: 50150, fecha: hoy }], kilometrajes: [] });
  debe(km.km === 50198, "el último km es el mayor que consta");
  debe(ultimoKm("v99", { usos }) === null, "sin datos no inventa");

  debe(fallasDePauta({ neumaticos: { estado: "mal", obs: " desgaste " }, luces: { estado: "bien" } })
    .map(f => `${f.clave}:${f.obs}`).join() === "neumaticos:desgaste", "fallas de la pauta");
  debe(!pautaCompleta({ luces: { estado: "bien" } }), "pauta incompleta");

  const dia = usosDelDia(usos, "v1", hoy, hoy);
  debe(dia.map(u => u.id).join() === "u2", "la Hilux hoy: solo el tramo de Carlos");
  debe(usosDelDia(usos, "v9", "2026-10-07", hoy).length === 1, "un uso abierto de hace dos días sigue ocupando ayer");

  const r = resumenAhora({ vehiculos, usos, ordenes, reservas, hoy });
  debe(r.enUso.length === 2 && r.sinEntregar.map(u => u.id).join() === "u6", "en uso y sin entregar");
  debe(r.rechazosHoy.length === 1 && r.fallasHoy.length === 1 && r.relevosHoy.length === 1, "avisos del día");
  debe(r.reservados.map(e => e.vehiculo.id).join() === "v3" && r.libres.map(e => e.vehiculo.id).join() === "v1", "libres y reservados");

  debe(hoyChile(new Date("2026-10-09T02:30:00Z")) === "2026-10-08", "a las 23:30 en Chile sigue siendo el 8");
  debe(horaChile("2026-10-08T11:05:00Z") === "08:05", "hora de Chile");

  if (fallos.length) { console.error("FALLOS:\n  " + fallos.join("\n  ")); return false; }
  console.log("turnoFlota: autotest ok");
  return true;
}

if (typeof process !== "undefined" && process.argv?.[1]?.endsWith("turnoFlota.js")) _selfCheck();
