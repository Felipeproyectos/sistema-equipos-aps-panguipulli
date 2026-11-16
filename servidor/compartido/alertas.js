// Copia de src/lib/alertas.js, generada por migracion/sincronizar_compartido.py.
// No editar a mano: se edita el original y se vuelve a correr el script.

// Las alertas: avisos automáticos por una fecha que vence.
//
// Qué es una alerta (y qué no)
// ────────────────────────────
// Una alerta NO es un pedido: nadie la «solicita». La crea el sistema cada
// noche mirando las fechas cargadas en las fichas (parches, batería, revisión
// técnica, permiso de circulación, certificación, licencias, préstamos) y
// refleja el estado de esas fechas:
//   · nace cuando la fecha entra en el plazo de aviso;
//   · pasa de «por vencer» a «vencida» sola;
//   · se cierra sola cuando alguien corrige la fecha en la ficha.
// Por eso una alerta automática no tiene botón «Resolver»: marcarla resuelta
// sin corregir la fecha solo la hacía reaparecer al día siguiente.
//
// Las que escribe una persona («Crear alerta») sí se resuelven a mano.
//
// De quién es cada una
// ────────────────────
// Lo del vehículo (revisión técnica, permiso de circulación, licencias,
// préstamos, y cualquier fecha de un vehículo) es de Movilización. Lo demás
// —equipos médicos— es de Calidad. Antes todas llegaban a Calidad, que no
// podía hacer nada con las de vehículos, y Movilización no las veía.
//
// Lo usan Alertas, el número del menú, el resumen por correo y la tarea de
// las 03:00 (servidor/funciones/generarAlertasAutomaticas.js, vía la copia de
// servidor/compartido/). `node src/lib/alertas.js` corre el autotest.

export const ROTULOS = {
  parche_vencido: "Parche vencido",
  parche_por_vencer: "Parche por vencer",
  bateria_vencida: "Batería vencida",
  bateria_por_vencer: "Batería por vencer",
  revision_tecnica_vencida: "Revisión técnica vencida",
  revision_tecnica_por_vencer: "Revisión técnica por vencer",
  permiso_circulacion_vencido: "Permiso de circulación vencido",
  permiso_circulacion_por_vencer: "Permiso de circulación por vencer",
  certificacion_vencida: "Certificación anual vencida",
  certificacion_por_vencer: "Certificación anual por vencer",
  licencia_vencida: "Licencia de conducir vencida",
  licencia_por_vencer: "Licencia de conducir por vencer",
  prestamo_vencido: "Préstamo sin devolver",
  mantenimiento_requerido: "Mantenimiento requerido",
  equipo_fuera_servicio: "Equipo fuera de servicio",
};

/** El nombre de la alerta en palabras; nunca el código interno. */
export const rotuloAlerta = (tipo) => ROTULOS[tipo]
  || String(tipo || "Alerta").replace(/_/g, " ").replace(/^./, c => c.toUpperCase());

// Los que una persona puede elegir en «Crear alerta».
export const TIPOS_MANUALES = ["mantenimiento_requerido", "equipo_fuera_servicio",
  "parche_vencido", "parche_por_vencer", "bateria_vencida", "bateria_por_vencer"];

// Estos solo los produce la tarea nocturna: no existen en «Crear alerta».
const SOLO_AUTOMATICOS = new Set([
  "revision_tecnica_vencida", "revision_tecnica_por_vencer",
  "permiso_circulacion_vencido", "permiso_circulacion_por_vencer",
  "certificacion_vencida", "certificacion_por_vencer",
  "licencia_vencida", "licencia_por_vencer", "prestamo_vencido",
]);

const DE_MOVILIZACION = new Set([
  "revision_tecnica_vencida", "revision_tecnica_por_vencer",
  "permiso_circulacion_vencido", "permiso_circulacion_por_vencer",
  "licencia_vencida", "licencia_por_vencer", "prestamo_vencido",
]);

const TIPOS_VEHICULO = ["ambulancia", "camioneta", "furgon", "camion_3_4"];

export const AREA_SALUD = "salud";
export const AREA_MOVILIZACION = "movilizacion";

/**
 * ¿La creó la tarea nocturna? La columna `automatica` (34_simplificar_flujo.sql)
 * lo dice; las de antes se reconocen por los tipos que solo ella produce.
 */
export function esAutomatica(a) {
  return a?.automatica === true || SOLO_AUTOMATICOS.has(a?.tipo);
}

/** A qué área le toca: lo del vehículo y sus choferes, a Movilización. */
export function areaDeAlerta(a, equipo) {
  if (a?.chofer_id || DE_MOVILIZACION.has(a?.tipo)) return AREA_MOVILIZACION;
  if (equipo && TIPOS_VEHICULO.includes(equipo.tipo)) return AREA_MOVILIZACION;
  return AREA_SALUD;
}

/** Las áreas cuyas alertas ve este rol. */
export function areasDelRol(role) {
  if (role === "super_admin" || role === "monitor_corporativo") return [AREA_SALUD, AREA_MOVILIZACION];
  if (role === "encargado_movilizacion") return [AREA_MOVILIZACION];
  return [AREA_SALUD];
}

/**
 * Las alertas que le corresponden a este rol. `equipos`: lista o Map por id.
 * `centros`: los del Encargado de Salud, que ve las de sus centros igual que
 * en Solicitudes y en Revisión Bitácora. Vacío = todos; la alerta que no dice
 * de qué centro es no se le esconde a nadie.
 */
export function alertasDelRol(role, alertas = [], equipos = [], centros = []) {
  const porId = equipos instanceof Map ? equipos : new Map(equipos.map(e => [e.id, e]));
  const areas = areasDelRol(role);
  const misCentros = role === "encargado_salud" ? centros.filter(Boolean) : [];
  return alertas.filter(a => {
    const equipo = porId.get(a.equipo_id);
    if (!areas.includes(areaDeAlerta(a, equipo))) return false;
    const centro = a.centro || equipo?.centro_principal || "";
    return !misCentros.length || !centro || misCentros.includes(centro);
  });
}

const RESUELVEN = {
  [AREA_SALUD]: ["super_admin", "admin", "encargado_salud", "encargado_compras_salud"],
  [AREA_MOVILIZACION]: ["super_admin", "encargado_movilizacion"],
};

/**
 * ¿Puede este rol marcarla resuelta? Solo las escritas a mano, y solo quien
 * es del área. Las automáticas se cierran al corregir la fecha.
 */
export function puedeResolver(role, alerta, equipo) {
  if (alerta?.estado !== "activa" || esAutomatica(alerta)) return false;
  return RESUELVEN[areaDeAlerta(alerta, equipo)].includes(role);
}

// ── Lo que calcula la tarea nocturna ─────────────────────────────────────
export const DIAS_AVISO = 90;
// La licencia avisa a 60: es el plazo que decidió Movilización, tiempo
// suficiente para pedir hora y renovar sin que la alerta quede meses a la vista.
export const DIAS_AVISO_LICENCIA = 60;

const DIA_MS = 86400000;
const dia = (f) => String(f || "").slice(0, 10);
const aUTC = (iso) => { const [y, m, d] = iso.split("-").map(Number); return Date.UTC(y, m - 1, d); };
const esFecha = (iso) => /^\d{4}-\d{2}-\d{2}$/.test(iso) && !Number.isNaN(aUTC(iso));
const diasHasta = (fecha, hoy) => Math.round((aUTC(dia(fecha)) - aUTC(hoy)) / DIA_MS);
const corta = (f) => { const [y, m, d] = dia(f).split("-"); return `${d}/${m}/${y}`; };

const VENCIMIENTOS = [
  { campo: "fecha_vencimiento_bateria", vencido: "bateria_vencida", porVencer: "bateria_por_vencer", que: "Batería", fem: true },
  { campo: "fecha_vencimiento_revision_tecnica", vencido: "revision_tecnica_vencida", porVencer: "revision_tecnica_por_vencer", que: "Revisión técnica", fem: true },
  { campo: "fecha_vencimiento_permiso_circulacion", vencido: "permiso_circulacion_vencido", porVencer: "permiso_circulacion_por_vencer", que: "Permiso de circulación", fem: false },
  { campo: "proxima_revision_anual", vencido: "certificacion_vencida", porVencer: "certificacion_por_vencer", que: "Certificación anual", fem: true },
];

/** La clave que hace única a una alerta: de quién es y de qué tipo. */
export const claveDeAlerta = (a) => `${a.equipo_id || ""}|${a.chofer_id || ""}|${a.tipo}`;

/**
 * Las alertas que hoy deberían estar activas, según las fechas cargadas.
 * `hoy` es la fecha de Chile (AAAA-MM-DD). Una por equipo y tipo: si un DEA
 * tiene dos parches vencidos, la alerta los nombra a los dos.
 */
export function alertasQueCorresponden({ equipos = [], parches = [], usuarios = [], prestamos = [], hoy }) {
  const out = [];
  const estado = (fecha, aviso = DIAS_AVISO) => {
    if (!esFecha(dia(fecha))) return null;
    const d = diasHasta(fecha, hoy);
    return d < 0 ? "vencido" : d <= aviso ? "por_vencer" : null;
  };

  for (const eq of equipos.filter(e => e.activo !== false)) {
    const base = { equipo_id: eq.id, estado: "activa", centro: eq.centro_principal || "", subsede: eq.subsede || "" };

    const porEstado = { vencido: [], por_vencer: [] };
    for (const p of parches.filter(x => x.equipo_id === eq.id && x.activo !== false)) {
      const e = estado(p.fecha_vencimiento);
      if (e) porEstado[e].push(p);
    }
    for (const [e, lista] of Object.entries(porEstado)) {
      if (!lista.length) continue;
      const detalle = lista
        .sort((a, b) => dia(a.fecha_vencimiento).localeCompare(dia(b.fecha_vencimiento)))
        .map(p => `${p.tipo || "parche"} (${corta(p.fecha_vencimiento)})`).join(", ");
      out.push({
        ...base,
        tipo: e === "vencido" ? "parche_vencido" : "parche_por_vencer",
        nivel: e === "vencido" ? "critica" : "advertencia",
        descripcion: e === "vencido"
          ? `${lista.length === 1 ? "Parche vencido" : "Parches vencidos"}: ${detalle}`
          : `${lista.length === 1 ? "Parche por vencer" : "Parches por vencer"}: ${detalle}`,
      });
    }

    for (const v of VENCIMIENTOS) {
      const e = estado(eq[v.campo]);
      if (!e) continue;
      out.push({
        ...base,
        tipo: e === "vencido" ? v.vencido : v.porVencer,
        nivel: e === "vencido" ? "critica" : "advertencia",
        descripcion: e === "vencido"
          ? `${v.que} ${v.fem ? "vencida" : "vencido"} el ${corta(eq[v.campo])}`
          : `${v.que} vence el ${corta(eq[v.campo])}`,
      });
    }
  }

  for (const u of usuarios) {
    if (u.role !== "chofer") continue;
    const e = estado(u.licencia_vencimiento, DIAS_AVISO_LICENCIA);
    if (!e) continue;
    const quien = u.full_name || u.email;
    out.push({
      chofer_id: u.id,
      tipo: e === "vencido" ? "licencia_vencida" : "licencia_por_vencer",
      nivel: e === "vencido" ? "critica" : "advertencia",
      descripcion: e === "vencido"
        ? `Licencia de ${quien} vencida el ${corta(u.licencia_vencimiento)}`
        : `Licencia de ${quien} vence el ${corta(u.licencia_vencimiento)}`,
      estado: "activa",
      centro: u.centro_principal || "",
    });
  }

  // Un préstamo no se cierra solo: queda vigente hasta que alguien confirme
  // que el vehículo volvió. Mientras tanto el gasto se sigue cargando al
  // centro del préstamo; este aviso es el contrapeso.
  const vistos = new Set();
  for (const p of prestamos) {
    if (p.estado && p.estado !== "vigente") continue;
    if (!esFecha(dia(p.hasta_previsto)) || diasHasta(p.hasta_previsto, hoy) >= 0) continue;
    if (vistos.has(p.equipo_id)) continue;
    vistos.add(p.equipo_id);
    out.push({
      equipo_id: p.equipo_id,
      tipo: "prestamo_vencido",
      nivel: "advertencia",
      descripcion: `${p.equipo_label || "Vehículo"} prestado a ${p.centro_destino}: debía volver el ${corta(p.hasta_previsto)}. `
        + `El gasto se sigue cargando a ${p.centro_costo}.`,
      estado: "activa",
      centro: p.centro_origen || "",
    });
  }
  return out;
}

/**
 * Qué hacer para que las alertas activas reflejen lo que corresponde hoy:
 *   crear      las que faltan
 *   actualizar las automáticas cuyo texto o nivel cambió (otra fecha)
 *   cerrar     las automáticas que ya no corresponden (la fecha se corrigió,
 *              o pasó de «por vencer» a «vencida»), y las repetidas
 * Las escritas a mano no se tocan, pero ocupan su lugar: no se crea una
 * automática igual encima.
 */
export function planDeAlertas(corresponden = [], activas = []) {
  const deseadas = new Map(corresponden.map(a => [claveDeAlerta(a), a]));
  const crear = [];
  const actualizar = [];
  const cerrar = [];
  const ocupadas = new Set();

  for (const a of activas) {
    const clave = claveDeAlerta(a);
    const quiere = deseadas.get(clave);
    if (!esAutomatica(a)) { ocupadas.add(clave); continue; }
    if (!quiere || ocupadas.has(clave)) { cerrar.push(a.id); continue; }
    ocupadas.add(clave);
    if (a.descripcion !== quiere.descripcion || a.nivel !== quiere.nivel) {
      actualizar.push({ id: a.id, cambios: { descripcion: quiere.descripcion, nivel: quiere.nivel } });
    }
  }
  for (const [clave, a] of deseadas) if (!ocupadas.has(clave)) crear.push(a);
  return { crear, actualizar, cerrar };
}

/** Para el correo de la mañana: críticas que nacieron en los últimos días. */
export function criticasRecientes(alertas = [], ahora = Date.now(), dias = 3) {
  return alertas.filter(a => a.estado === "activa" && a.nivel === "critica" && a.created_date
    && ahora - new Date(a.created_date).getTime() <= dias * DIA_MS);
}

export function _selfCheck() {
  const fallos = [];
  const debe = (c, q) => { if (!c) fallos.push(q); };
  const hoy = "2026-11-16";

  debe(rotuloAlerta("revision_tecnica_vencida") === "Revisión técnica vencida" && rotuloAlerta("algo_nuevo") === "Algo nuevo", "rótulos en palabras");

  const equipos = [
    { id: "d1", tipo: "dea", centro_principal: "CESFAM A", fecha_vencimiento_bateria: "2026-12-01" },
    { id: "a1", tipo: "ambulancia", centro_principal: "CESFAM A", fecha_vencimiento_revision_tecnica: "2026-10-03", fecha_vencimiento_permiso_circulacion: "2027-03-31", proxima_revision_anual: "" },
    { id: "b1", tipo: "dea", activo: false, fecha_vencimiento_bateria: "2020-01-01" },
  ];
  const parches = [
    { equipo_id: "d1", tipo: "adulto", fecha_vencimiento: "2026-10-01" },
    { equipo_id: "d1", tipo: "pediatrico", fecha_vencimiento: "2026-09-01" },
    { equipo_id: "d1", tipo: "mixto", fecha_vencimiento: "2027-01-10" },
    { equipo_id: "d1", tipo: "viejo", fecha_vencimiento: "2020-01-01", activo: false },
  ];
  const usuarios = [{ id: "u1", role: "chofer", full_name: "Juan", licencia_vencimiento: "2026-12-20" }, { id: "u2", role: "user", licencia_vencimiento: "2020-01-01" }];
  const prestamos = [{ equipo_id: "a1", estado: "vigente", hasta_previsto: "2026-11-10", centro_destino: "B", centro_costo: "B", centro_origen: "CESFAM A" }];
  const c = alertasQueCorresponden({ equipos, parches, usuarios, prestamos, hoy });
  const tipos = c.map(a => a.tipo).sort().join();
  debe(tipos === "bateria_por_vencer,licencia_por_vencer,parche_por_vencer,parche_vencido,prestamo_vencido,revision_tecnica_vencida",
    "corresponden: " + tipos);
  const vencidos = c.find(a => a.tipo === "parche_vencido");
  debe(vencidos.descripcion === "Parches vencidos: pediatrico (01/09/2026), adulto (01/10/2026)" && vencidos.nivel === "critica",
    "un DEA con dos parches vencidos: una alerta que nombra a los dos — " + vencidos.descripcion);
  debe(c.find(a => a.tipo === "revision_tecnica_vencida").descripcion === "Revisión técnica vencida el 03/10/2026", "el texto lleva la fecha, no un conteo de días");
  debe(!c.some(a => a.equipo_id === "b1"), "equipo dado de baja no alerta");

  debe(areaDeAlerta({ tipo: "revision_tecnica_vencida" }, { tipo: "ambulancia" }) === AREA_MOVILIZACION, "revisión técnica → Movilización");
  debe(areaDeAlerta({ tipo: "licencia_vencida", chofer_id: "u1" }) === AREA_MOVILIZACION, "licencia → Movilización");
  debe(areaDeAlerta({ tipo: "bateria_vencida" }, { tipo: "camioneta" }) === AREA_MOVILIZACION, "batería de un vehículo → Movilización");
  debe(areaDeAlerta({ tipo: "parche_vencido" }, { tipo: "dea" }) === AREA_SALUD && areaDeAlerta({ tipo: "mantenimiento_requerido" }) === AREA_SALUD, "equipos médicos → Calidad");
  const todas = [{ id: "1", tipo: "parche_vencido", equipo_id: "d1" }, { id: "2", tipo: "revision_tecnica_vencida", equipo_id: "a1" }];
  debe(alertasDelRol("encargado_salud", todas, equipos).map(a => a.id).join() === "1", "Calidad ve lo suyo");
  debe(alertasDelRol("encargado_movilizacion", todas, equipos).map(a => a.id).join() === "2", "Movilización ve lo suyo");
  debe(alertasDelRol("super_admin", todas, equipos).length === 2 && alertasDelRol("monitor_corporativo", todas, equipos).length === 2, "quien ve todo, ve todo");
  const deDosCentros = [{ id: "1", tipo: "parche_vencido", equipo_id: "d1" }, { id: "3", tipo: "parche_vencido", centro: "CESFAM B" }, { id: "4", tipo: "mantenimiento_requerido" }];
  debe(alertasDelRol("encargado_salud", deDosCentros, equipos, ["CESFAM A"]).map(a => a.id).join() === "1,4", "el Encargado ve las de su centro y las que no dicen centro");
  debe(alertasDelRol("encargado_salud", deDosCentros, equipos).length === 3 && alertasDelRol("admin", deDosCentros, equipos, ["CESFAM A"]).length === 3, "sin centro asignado, o si no es Encargado, las ve todas");

  debe(esAutomatica({ tipo: "revision_tecnica_vencida" }) && esAutomatica({ tipo: "parche_vencido", automatica: true }) && !esAutomatica({ tipo: "parche_vencido" }), "automáticas");
  debe(puedeResolver("encargado_salud", { estado: "activa", tipo: "mantenimiento_requerido" }, { tipo: "dea" }), "el Encargado resuelve la manual de su área");
  debe(!puedeResolver("encargado_salud", { estado: "activa", tipo: "parche_vencido", automatica: true }, { tipo: "dea" }), "la automática no se resuelve a mano");
  debe(!puedeResolver("encargado_salud", { estado: "activa", tipo: "mantenimiento_requerido" }, { tipo: "camioneta" }), "ni la de otra área");
  debe(!puedeResolver("user", { estado: "activa", tipo: "mantenimiento_requerido" }), "el Usuario no resuelve");

  const activas = [
    { id: "x1", equipo_id: "a1", tipo: "revision_tecnica_vencida", descripcion: "Revisión técnica vencida hace 12 días", nivel: "critica" }, // texto viejo
    { id: "x2", equipo_id: "a1", tipo: "revision_tecnica_por_vencer", descripcion: "…", nivel: "advertencia" },                        // ya venció
    { id: "x3", equipo_id: "z9", tipo: "permiso_circulacion_vencido", descripcion: "…", nivel: "critica" },                              // ya se renovó
    { id: "x4", equipo_id: "d1", tipo: "parche_vencido", descripcion: "escrita por una persona", nivel: "critica" },                     // manual
    { id: "x5", equipo_id: "d1", tipo: "bateria_por_vencer", automatica: true, descripcion: "Batería vence el 01/12/2026", nivel: "advertencia" },
    { id: "x6", equipo_id: "a1", tipo: "revision_tecnica_vencida", descripcion: "repetida", nivel: "critica" },
    { id: "x7", equipo_id: "d1", tipo: "bateria_vencida", descripcion: "manual vieja", nivel: "critica" },                               // manual que ya no aplica
  ];
  const plan = planDeAlertas(c, activas);
  debe(plan.cerrar.sort().join() === "x2,x3,x6", "se cierran las que ya no corresponden y las repetidas: " + plan.cerrar);
  debe(plan.actualizar.length === 1 && plan.actualizar[0].id === "x1" && plan.actualizar[0].cambios.descripcion.endsWith("03/10/2026"), "se corrige el texto de la que sigue");
  debe(plan.crear.map(a => a.tipo).sort().join() === "licencia_por_vencer,parche_por_vencer,prestamo_vencido", "se crean las que faltan, sin pisar la manual: " + plan.crear.map(a => a.tipo));
  debe(planDeAlertas(c, []).crear.length === c.length && planDeAlertas([], []).cerrar.length === 0, "desde cero");

  const ahora = new Date("2026-11-16T12:00:00Z").getTime();
  debe(criticasRecientes([
    { estado: "activa", nivel: "critica", created_date: "2026-11-15T06:00:00Z" },
    { estado: "activa", nivel: "critica", created_date: "2026-11-01T06:00:00Z" },
    { estado: "activa", nivel: "advertencia", created_date: "2026-11-16T06:00:00Z" },
  ], ahora).length === 1, "críticas recientes");

  if (fallos.length) { console.error("FALLOS:\n  " + fallos.join("\n  ")); return false; }
  console.log("alertas: autotest ok");
  return true;
}

if (typeof process !== "undefined" && process.argv?.[1]?.endsWith("alertas.js")) _selfCheck();
