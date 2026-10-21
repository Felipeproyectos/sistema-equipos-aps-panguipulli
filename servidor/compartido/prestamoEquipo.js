// Copia de src/lib/prestamoEquipo.js, generada por migracion/sincronizar_compartido.py.
// No editar a mano: se edita el original y se vuelve a correr el script.

// Préstamo de ambulancias entre centros, hecho por Calidad.
//
// Por qué existe
// ──────────────
// Una ambulancia se cede por un tiempo a otro centro. Mientras está allá, ese
// centro la usa y le aplica sus pautas: tiene que verla en su lista de
// equipos, poder llenarle las pautas y revisarlas en Revisión Bitácora. El
// centro dueño la sigue viendo, marcada como prestada, y es quien la presta y
// (con el que la recibió) quien registra que volvió.
//
// El registro es el mismo de los vehículos de Movilización (`prestamo_vehiculo`,
// migracion/16_prestamos.sql): un préstamo vigente por vehículo, que no se
// cierra solo. migracion/29_prestamo_ambulancias.sql deja a Calidad crearlo
// para las ambulancias de su centro y le da al centro que la recibe la ficha
// y su historial mientras dure.
//
// Lo usan Equipos, la ficha, Revisión Bitácora y el servidor (vía la copia de
// servidor/compartido/). `node src/lib/prestamoEquipo.js` corre el autotest.

/** Por ahora Calidad presta solo ambulancias. */
export const esPrestable = (equipo) => equipo?.tipo === "ambulancia";

const ROLES_TODO = ["super_admin", "admin"];
const ROLES_CALIDAD = ["encargado_salud"];

/** Los centros de una persona: el principal y los asignados. */
export function centrosDe(user) {
  return [...new Set([user?.centro_principal, ...(user?.centros_asignados || [])].filter(Boolean))];
}

/** El préstamo vigente de un equipo, o null. */
export function prestamoVigente(prestamos, equipoId) {
  return (prestamos || []).find(p => p.equipo_id === equipoId && (p.estado || "vigente") === "vigente") || null;
}

/** El préstamo que cubría un día (para saber dónde estaba al hacer una pauta). */
export function prestamoEnFecha(prestamos, equipoId, fecha) {
  const dia = String(fecha || "").slice(0, 10);
  if (!dia) return null;
  return (prestamos || []).find(p =>
    p.equipo_id === equipoId && p.estado !== "cancelado"
    && String(p.desde || "") <= dia
    && ((p.estado || "vigente") === "vigente" || (p.devuelto_el && String(p.devuelto_el) >= dia))) || null;
}

/** ¿Puede prestarla? Base del Sistema, Administración o Calidad del centro dueño. */
export function puedePrestar(user, equipo) {
  if (!esPrestable(equipo)) return false;
  if (ROLES_TODO.includes(user?.role)) return true;
  return ROLES_CALIDAD.includes(user?.role) && centrosDe(user).includes(equipo.centro_principal);
}

/** ¿Puede registrar que volvió? Además del dueño, Calidad del centro que la tiene. */
export function puedeDevolver(user, equipo, prestamo) {
  if (!prestamo) return false;
  if (puedePrestar(user, equipo)) return true;
  return ROLES_CALIDAD.includes(user?.role) && centrosDe(user).includes(prestamo.centro_destino);
}

/** La tiene prestada mi centro, y no soy del dueño: veo, aplico pautas, no edito la ficha. */
export function laTengoPrestada(user, equipo, prestamo) {
  if (!prestamo || ROLES_TODO.includes(user?.role)) return false;
  const mios = centrosDe(user);
  return mios.includes(prestamo.centro_destino) && !mios.includes(equipo?.centro_principal);
}

/** Los centros en que un equipo cuenta hoy: el suyo y, si está prestado, el que lo tiene. */
export function centrosDelEquipo(equipo) {
  return [equipo?.centro_principal, equipo?.prestamo?.centro_destino].filter(Boolean);
}

export function _selfCheck() {
  const fallos = [];
  const debe = (c, q) => { if (!c) fallos.push(q); };
  const amb = { id: "a1", tipo: "ambulancia", centro_principal: "CESFAM Panguipulli" };
  const dea = { id: "d1", tipo: "dea", centro_principal: "CESFAM Panguipulli" };
  const calidadDueno = { role: "encargado_salud", centro_principal: "CESFAM Panguipulli" };
  const calidadDestino = { role: "encargado_salud", centro_principal: "CESFAM Coñaripe" };
  const prestamos = [
    { id: "p0", equipo_id: "a1", estado: "devuelto", desde: "2026-09-01", devuelto_el: "2026-09-10", centro_destino: "CESFAM Liquiñe" },
    { id: "p1", equipo_id: "a1", estado: "vigente", desde: "2026-10-15", centro_origen: "CESFAM Panguipulli", centro_destino: "CESFAM Coñaripe" },
  ];
  const p = prestamoVigente(prestamos, "a1");
  debe(p?.id === "p1" && !prestamoVigente(prestamos, "x"), "préstamo vigente");
  debe(prestamoEnFecha(prestamos, "a1", "2026-09-05")?.id === "p0", "en septiembre estaba en Liquiñe");
  debe(!prestamoEnFecha(prestamos, "a1", "2026-09-20"), "entre préstamos estaba en su centro");
  debe(prestamoEnFecha(prestamos, "a1", "2026-10-20")?.id === "p1", "hoy está en Coñaripe");
  debe(puedePrestar(calidadDueno, amb) && !puedePrestar(calidadDestino, amb), "presta Calidad del dueño");
  debe(!puedePrestar(calidadDueno, dea), "un DEA no se presta");
  debe(puedePrestar({ role: "super_admin" }, amb) && !puedePrestar({ role: "user", centro_principal: "CESFAM Panguipulli" }, amb), "roles");
  debe(puedeDevolver(calidadDestino, amb, p) && puedeDevolver(calidadDueno, amb, p), "devuelven los dos");
  debe(!puedeDevolver({ role: "encargado_salud", centro_principal: "CESFAM Liquiñe" }, amb, p), "un tercero no");
  debe(laTengoPrestada(calidadDestino, amb, p) && !laTengoPrestada(calidadDueno, amb, p), "quién la tiene prestada");
  debe(centrosDelEquipo({ ...amb, prestamo: p }).join() === "CESFAM Panguipulli,CESFAM Coñaripe", "centros del equipo");
  if (fallos.length) { console.error("FALLOS:\n  " + fallos.join("\n  ")); return false; }
  console.log("prestamoEquipo: autotest ok");
  return true;
}

if (typeof process !== "undefined" && process.argv?.[1]?.endsWith("prestamoEquipo.js")) _selfCheck();
