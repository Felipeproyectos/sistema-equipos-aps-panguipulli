// Las reglas del calendario de flota, separadas de la pantalla para poder
// probarlas sin navegador — son la clase de cosa que se rompe en silencio.
//
// Espejo de lo que hace el disparador `asignacion_sin_choque` en la base
// (migracion/17_calendario.sql). Acá sirve para avisar antes de guardar; la
// regla de verdad es la de allá, porque una validación que solo está en el
// navegador se salta recargando.

export const TURNOS = [
  { value: "completo", label: "Todo el día" },
  { value: "manana", label: "Mañana" },
  { value: "tarde", label: "Tarde" },
];

/** Una fecha abierta (sin término) llega hasta el fin de los tiempos. */
const SIN_TOPE = "9999-12-31";

/** ¿Dos rangos de fecha se tocan? Los extremos cuentan: una asignación que
 *  termina el mismo día que empieza otra sí se pisa. */
export function rangosSeTocan(desdeA, hastaA, desdeB, hastaB) {
  if (!desdeA || !desdeB) return false;
  return desdeA <= (hastaB || SIN_TOPE) && desdeB <= (hastaA || SIN_TOPE);
}

/** 'completo' choca con todo; los medios días solo entre iguales. */
export function turnosSeTocan(a, b) {
  const t1 = a || "completo";
  const t2 = b || "completo";
  return t1 === "completo" || t2 === "completo" || t1 === t2;
}

/** ¿Estas dos asignaciones se pisan? */
export function seChocan(a, b) {
  return rangosSeTocan(a.desde, a.hasta, b.desde, b.hasta)
    && turnosSeTocan(a.turno, b.turno);
}

/** La asignación vigente HOY de un vehículo. Desde el calendario puede haber
 *  varias activas a la vez (la de esta semana y la de la próxima), así que
 *  "quién lo tiene" ya no es "la primera activa". */
export function asignacionDeHoy(asignaciones, equipoId, hoy) {
  const dia = hoy || new Date().toISOString().split("T")[0];
  return asignaciones.find(a =>
    a.equipo_id === equipoId
    && a.estado === "activa"
    && a.desde <= dia
    && (!a.hasta || a.hasta >= dia)) || null;
}

// ── Los períodos en taller ───────────────────────────────────────────────
// Una orden de trabajo ocupa el vehículo mientras está andando. `pendiente`
// no cuenta: es una orden en la fila, el vehículo todavía circula.
const ESTADOS_EN_TALLER = ["asignada", "en_proceso", "pausada", "en_revision"];

const soloFecha = (v) => (typeof v === "string" ? v.split("T")[0] : "");

/** Convierte las órdenes de trabajo en bandas de "este vehículo está en el
 *  taller entre tal y tal". Sin fecha de término la banda queda abierta:
 *  una reparación sin cerrar sigue ocupando el vehículo. */
export function periodosEnTaller(ordenes) {
  return ordenes
    .filter(o => ESTADOS_EN_TALLER.includes(o.estado))
    .map(o => ({
      equipo_id: o.equipo_id,
      numero_ot: o.numero_ot,
      estado: o.estado,
      desde: soloFecha(o.fecha_inicio) || soloFecha(o.fecha_asignacion) || soloFecha(o.created_date),
      hasta: soloFecha(o.fecha_fin) || null,
    }))
    .filter(p => p.desde && p.equipo_id);
}

/** Las asignaciones que caen encima de un paso por el taller. No impide
 *  nada — solo las marca, para que el Encargado decida. Un vehículo puede
 *  entrar al taller después de que alguien ya tenía su semana programada, y
 *  cancelarle el turno solo sería peor que avisarle. */
export function choquesConTaller(asignaciones, taller) {
  const choques = [];
  for (const a of asignaciones) {
    if (a.estado !== "activa") continue;
    for (const t of taller) {
      if (t.equipo_id !== a.equipo_id) continue;
      if (rangosSeTocan(a.desde, a.hasta, t.desde, t.hasta)) {
        choques.push({ asignacion: a, taller: t });
      }
    }
  }
  return choques;
}

// ── Utilidades de fecha ──────────────────────────────────────────────────

export const aISO = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
};

/** Los días de un mes, como cadenas ISO. */
export function diasDelMes(anio, mes) {
  const dias = [];
  const d = new Date(anio, mes, 1);
  while (d.getMonth() === mes) {
    dias.push(aISO(d));
    d.setDate(d.getDate() + 1);
  }
  return dias;
}

export function esFinDeSemana(iso) {
  const d = new Date(`${iso}T12:00:00`).getDay();
  return d === 0 || d === 6;
}

/** El lunes de la semana en que cae esta fecha. Acá la semana parte el lunes
 *  porque así se arman los turnos, no como en el `getDay()` de JavaScript,
 *  que parte el domingo. */
export function inicioDeSemana(iso) {
  const d = new Date(`${iso}T12:00:00`);
  const dia = d.getDay();            // 0 = domingo
  d.setDate(d.getDate() - ((dia + 6) % 7));
  return aISO(d);
}

/** Los siete días de la semana en que cae esta fecha, de lunes a domingo. */
export function diasDeLaSemana(iso) {
  const lunes = new Date(`${inicioDeSemana(iso)}T12:00:00`);
  const dias = [];
  for (let i = 0; i < 7; i++) {
    dias.push(aISO(lunes));
    lunes.setDate(lunes.getDate() + 1);
  }
  return dias;
}

/** Suma días a una fecha ISO. */
export function sumarDias(iso, n) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return aISO(d);
}

/** Dos fechas en cualquier orden, devueltas de menor a mayor. Es lo que hace
 *  que arrastrar de derecha a izquierda funcione igual que al revés. */
export function rangoEntre(a, b) {
  return a <= b ? { desde: a, hasta: b } : { desde: b, hasta: a };
}

/** Las asignaciones activas de un vehículo que cubren ese día. Pueden ser dos
 *  cuando la jornada está partida entre mañana y tarde. */
export function asignacionesDelDia(asignaciones, equipoId, dia) {
  return asignaciones.filter(a => a.estado === "activa"
    && a.equipo_id === equipoId
    && rangosSeTocan(a.desde, a.hasta, dia, dia));
}

/**
 * Los tramos de un vehículo dentro de un período: cada asignación recortada a
 * lo que efectivamente cae dentro.
 *
 * Es lo que se imprime. En pantalla basta con pintar día por día, pero en un
 * papel hay que poder leer "Carlos Soto, del 14 al 20", y para eso el tramo
 * tiene que venir ya recortado al período — una asignación abierta o que
 * empezó el mes pasado no puede imprimirse con su fecha original, porque
 * diría algo que no es lo que se está mirando.
 */
export function tramosDelPeriodo(asignaciones, equipoId, desde, hasta) {
  return asignaciones
    .filter(a => a.estado === "activa" && a.equipo_id === equipoId
      && rangosSeTocan(a.desde, a.hasta, desde, hasta))
    .map(a => ({
      asignacion: a,
      desde: a.desde > desde ? a.desde : desde,
      hasta: !a.hasta || a.hasta > hasta ? hasta : a.hasta,
      recortado: a.desde < desde || !a.hasta || a.hasta > hasta,
    }))
    .sort((x, y) => (x.desde < y.desde ? -1 : x.desde > y.desde ? 1 : 0));
}

/** Autotest: corre con `node src/lib/calendarioFlota.js`. Las reglas de
 *  choque son fáciles de romper sin darse cuenta, y un error acá se traduce
 *  en dos choferes citados al mismo vehículo el mismo día. */
export function _selfCheck() {
  const fallos = [];
  const debe = (cond, que) => { if (!cond) fallos.push(que); };

  debe(turnosSeTocan("completo", "manana"), "completo debe chocar con mañana");
  debe(turnosSeTocan("manana", "completo"), "mañana debe chocar con completo");
  debe(!turnosSeTocan("manana", "tarde"), "mañana y tarde no deben chocar");
  debe(turnosSeTocan("tarde", "tarde"), "tarde choca con tarde");
  debe(turnosSeTocan(null, "tarde"), "sin turno se trata como completo");

  debe(rangosSeTocan("2026-09-01", "2026-09-10", "2026-09-10", "2026-09-20"),
    "los extremos cuentan");
  debe(!rangosSeTocan("2026-09-01", "2026-09-09", "2026-09-10", "2026-09-20"),
    "un dia de diferencia ya no se toca");
  debe(rangosSeTocan("2026-09-01", null, "2026-12-01", "2026-12-05"),
    "una abierta alcanza a todo lo posterior");
  debe(!rangosSeTocan("2026-09-01", null, "2026-08-01", "2026-08-20"),
    "una abierta no alcanza a lo anterior");

  // El caso que motivo todo esto.
  debe(!seChocan(
    { desde: "2026-09-14", hasta: "2026-09-20", turno: "completo" },
    { desde: "2026-09-21", hasta: "2026-09-27", turno: "completo" }),
    "se debe poder programar la semana siguiente");

  const asigs = [
    { id: "1", equipo_id: "e1", estado: "activa", desde: "2026-09-01", hasta: "2026-09-10" },
    { id: "2", equipo_id: "e1", estado: "activa", desde: "2026-09-20", hasta: null },
    { id: "3", equipo_id: "e1", estado: "terminada", desde: "2026-09-25", hasta: null },
  ];
  debe(asignacionDeHoy(asigs, "e1", "2026-09-05")?.id === "1", "la vigente el dia 5 es la 1");
  debe(asignacionDeHoy(asigs, "e1", "2026-09-15") === null, "el dia 15 no hay ninguna");
  debe(asignacionDeHoy(asigs, "e1", "2026-09-25")?.id === "2", "la abierta cubre el dia 25");
  debe(asignacionDeHoy(asigs, "e2", "2026-09-05") === null, "otro vehiculo no hereda");

  const taller = periodosEnTaller([
    { equipo_id: "e1", numero_ot: "OT-1", estado: "en_proceso", fecha_inicio: "2026-09-05T10:00:00", fecha_fin: null },
    { equipo_id: "e1", numero_ot: "OT-2", estado: "pendiente", fecha_inicio: "2026-09-05", fecha_fin: null },
    { equipo_id: "e1", numero_ot: "OT-3", estado: "completada", fecha_inicio: "2026-09-05", fecha_fin: "2026-09-06" },
  ]);
  debe(taller.length === 1, "solo las ordenes en curso ocupan el vehiculo");
  debe(taller[0].desde === "2026-09-05", "la fecha se recorta a solo el dia");

  // Dos, no una: el paso por el taller quedo ABIERTO (sin fecha de cierre),
  // asi que tambien alcanza a la asignacion del dia 20 en adelante. Es
  // correcto — mientras la orden no se cierre, el vehiculo sigue ocupado.
  const choques = choquesConTaller(asigs, taller);
  debe(choques.length === 2, `se esperaban 2 choques con el taller, hubo ${choques.length}`);
  debe(choques.every(c => c.taller.numero_ot === "OT-1"), "los choques son con la orden en curso");
  debe(!choques.some(c => c.asignacion.id === "3"), "una asignacion terminada no choca");

  // Con el taller cerrado, solo choca la que se solapa de verdad.
  const tallerCerrado = periodosEnTaller([
    { equipo_id: "e1", numero_ot: "OT-9", estado: "en_proceso", fecha_inicio: "2026-09-05", fecha_fin: "2026-09-08" },
  ]);
  debe(choquesConTaller(asigs, tallerCerrado).length === 1,
    "con fecha de cierre solo choca la asignacion que lo cruza");

  // ── Semanas, rangos y tramos ───────────────────────────────────────
  // El 2026-09-21 es lunes; el 2026-09-27, domingo.
  debe(inicioDeSemana("2026-09-24") === "2026-09-21", "el lunes de esa semana es el 21");
  debe(inicioDeSemana("2026-09-27") === "2026-09-21", "el domingo todavia es de la semana del 21");
  debe(inicioDeSemana("2026-09-21") === "2026-09-21", "un lunes es su propio inicio");
  const sem = diasDeLaSemana("2026-09-24");
  debe(sem.length === 7 && sem[0] === "2026-09-21" && sem[6] === "2026-09-27", "la semana va de lunes a domingo");
  debe(sumarDias("2026-09-30", 1) === "2026-10-01", "sumar dias cruza el mes");
  debe(sumarDias("2026-01-01", -1) === "2025-12-31", "y restar cruza el anio");

  const r = rangoEntre("2026-09-20", "2026-09-10");
  debe(r.desde === "2026-09-10" && r.hasta === "2026-09-20", "arrastrar al reves se ordena solo");

  debe(asignacionesDelDia(asigs, "e1", "2026-09-05").length === 1, "un dia con una asignacion");
  debe(asignacionesDelDia(asigs, "e1", "2026-09-15").length === 0, "un dia libre");
  debe(asignacionesDelDia(asigs, "e1", "2026-09-25").length === 1, "la terminada no cuenta aunque cubra el dia");

  const tr = tramosDelPeriodo(asigs, "e1", "2026-09-01", "2026-09-30");
  debe(tr.length === 2, `dos tramos en el mes, hubo ${tr.length}`);
  debe(tr[0].desde === "2026-09-01" && tr[0].hasta === "2026-09-10", "el primero va del 1 al 10");
  debe(tr[1].desde === "2026-09-20" && tr[1].hasta === "2026-09-30",
    "la abierta se recorta al fin del periodo, no se imprime sin fecha");
  debe(tr[1].recortado === true, "y queda marcada como recortada");
  debe(tramosDelPeriodo(asigs, "e1", "2026-09-12", "2026-09-18").length === 0,
    "una semana libre no tiene tramos");

  if (fallos.length) { console.error("FALLOS:\n  " + fallos.join("\n  ")); return false; }
  console.log("calendarioFlota: autotest ok");
  return true;
}

if (typeof process !== "undefined" && process.argv?.[1]?.endsWith("calendarioFlota.js")) _selfCheck();
