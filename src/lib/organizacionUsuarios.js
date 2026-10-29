// Cómo se ordena la pantalla de Usuarios: por área de trabajo y, dentro de
// cada área, por rol, con lo que hace cada uno.
//
// Antes había tres pestañas (Salud, Taller, Administración) y la de Taller
// juntaba a mecánicos, choferes, Movilización y la Unidad de Control; además
// el área la decidía un campo que la persona elegía al entrar, así que alguien
// con el rol cambiado quedaba en la pestaña equivocada. Ahora manda el rol
// (que es lo que decide los permisos); el campo `area` solo se mira cuando la
// cuenta todavía no tiene rol.
//
// `node src/lib/organizacionUsuarios.js` corre el autotest.

import { ROLES, roleLabel, esRolSalud } from "./roles.js";

export const AREAS = [
  {
    clave: "direccion", titulo: "Dirección y supervisión", color: "#4f46e5",
    descripcion: "Administran el sistema o supervisan todas las áreas.",
    roles: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.MONITOR_CORPORATIVO],
  },
  {
    clave: "salud", titulo: "Calidad · Salud", color: "#059669",
    descripcion: "Equipos vitales de cada CESFAM: pautas, alertas, solicitudes e insumos.",
    roles: [ROLES.ENCARGADO_SALUD, ROLES.ENCARGADO_COMPRAS_SALUD, ROLES.USER],
  },
  {
    clave: "movilizacion", titulo: "Movilización y flota", color: "#b45309",
    descripcion: "Vehículos, choferes, combustible y pagos.",
    roles: [ROLES.ENCARGADO_MOVILIZACION, ROLES.CHOFER, ROLES.UNIDAD_CONTROL],
  },
  {
    clave: "taller", titulo: "Taller mecánico", color: "#ea580c",
    descripcion: "Reparación de vehículos, repuestos y compras del taller.",
    roles: [ROLES.JEFE_TALLER, ROLES.ENCARGADO_COMPRAS_TALLER, ROLES.MECANICO],
  },
  {
    clave: "sin_rol", titulo: "Sin rol asignado", color: "#64748b",
    descripcion: "Cuentas que todavía no pueden trabajar: falta asignarles un rol.",
    roles: [],
  },
];

/** Qué hace cada rol, en una línea, para quien asigna. */
export const QUE_HACE = {
  [ROLES.SUPER_ADMIN]: "Acceso total. Crea cualquier cuenta y es el único que asigna los roles de Movilización, Taller, Monitor y Unidad de Control.",
  [ROLES.ADMIN]: "Administra el área de Salud: cuentas de Salud, centros y configuración.",
  [ROLES.MONITOR_CORPORATIVO]: "Supervisa las cuatro áreas y resuelve las solicitudes que le envían los centros.",
  [ROLES.ENCARGADO_SALUD]: "Responsable de su CESFAM: revisa las pautas y envía las solicitudes al Monitor.",
  [ROLES.ENCARGADO_COMPRAS_SALUD]: "Compra los insumos médicos aprobados y registra cuándo llegan.",
  [ROLES.USER]: "Funcionario de un centro: ve los equipos de su centro y pide solicitudes a su Encargado.",
  [ROLES.ENCARGADO_MOVILIZACION]: "Administra la flota y los choferes, y deriva las fallas de los vehículos al Taller.",
  [ROLES.CHOFER]: "Toma y entrega el vehículo, hace la pauta de inicio y registra sus salidas.",
  [ROLES.UNIDAD_CONTROL]: "Registra las cargas de combustible y los pagos de cada vehículo.",
  [ROLES.JEFE_TALLER]: "Dirige el taller: asigna órdenes de trabajo y aprueba repuestos.",
  [ROLES.ENCARGADO_COMPRAS_TALLER]: "Compra los repuestos aprobados para el taller.",
  [ROLES.MECANICO]: "Ejecuta las órdenes de trabajo que le asignan.",
};

export function centrosDe(u) {
  const arr = Array.isArray(u?.centros_asignados) ? u.centros_asignados : [];
  return [...new Set([u?.centro_principal, ...arr, u?.centro_asignado].filter(Boolean))];
}

/** El área de una cuenta: la de su rol; sin rol, la que eligió al entrar. */
export function areaDeUsuario(u) {
  const area = AREAS.find(a => a.roles.includes(u?.role));
  if (area) return area.clave;
  return "sin_rol";
}

/** Lo que le falta a una cuenta para trabajar bien. Lista de textos cortos. */
export function pendientesDe(u) {
  const p = [];
  if (!u?.role) p.push("Sin rol");
  if (!String(u?.full_name || "").trim()) p.push("Sin nombre");
  if (u?.role && u.role !== ROLES.ADMIN && esRolSalud(u.role) && !centrosDe(u).length) p.push("Sin centro");
  if (u?.role === ROLES.CHOFER && !u?.licencia_vencimiento) p.push("Sin licencia registrada");
  return p;
}

/**
 * Qué cuentas ve en esta pantalla quien mira, por su rol (el servidor ya
 * filtra en getUsuariosPorCentro; esto ordena lo que llega):
 *   · Base del Sistema: todas, menos la propia.
 *   · Administrador: Dirección y Salud.
 *   · Jefe de Taller: su taller.
 *   · Encargado de Salud: Salud de su centro.
 */
export function visiblesPara(usuarios = [], quien = {}, role = quien?.role) {
  return usuarios.filter(u => {
    const area = areaDeUsuario(u);
    if (role === ROLES.SUPER_ADMIN) return u.id !== quien?.id;
    if (role === ROLES.ADMIN) return area === "salud" || area === "direccion" || area === "sin_rol";
    if (role === ROLES.JEFE_TALLER) return area === "taller";
    if (role === ROLES.ENCARGADO_SALUD) return area === "salud" && centrosDe(u).includes(quien?.centro_principal);
    return false;
  });
}

/**
 * Las cuentas de un área agrupadas por rol, en el orden del área, cada grupo
 * ordenado por nombre: [{ role, etiqueta, queHace, usuarios }]. Los grupos sin
 * nadie no aparecen.
 */
export function gruposPorRol(usuarios = [], claveArea) {
  const area = AREAS.find(a => a.clave === claveArea);
  const porNombre = (a, b) => (a.full_name || a.email || "").localeCompare(b.full_name || b.email || "", "es");
  if (!area) return [];
  if (claveArea === "sin_rol") {
    const lista = usuarios.filter(u => areaDeUsuario(u) === "sin_rol").sort(porNombre);
    return lista.length ? [{ role: "", etiqueta: "Sin rol", queHace: area.descripcion, usuarios: lista }] : [];
  }
  return area.roles
    .map(role => ({ role, etiqueta: roleLabel(role), queHace: QUE_HACE[role] || "", usuarios: usuarios.filter(u => u.role === role).sort(porNombre) }))
    .filter(g => g.usuarios.length);
}

/** Búsqueda por nombre, correo, rol o centro. */
export function coincide(u, texto) {
  const q = String(texto || "").trim().toLowerCase();
  if (!q) return true;
  return [u.full_name, u.email, roleLabel(u.role), ...centrosDe(u)].some(v => String(v || "").toLowerCase().includes(q));
}

export function _selfCheck() {
  const fallos = [];
  const debe = (c, q) => { if (!c) fallos.push(q); };
  const usuarios = [
    { id: "1", role: "super_admin", full_name: "Base" },
    { id: "2", role: "monitor_corporativo", full_name: "Oscar" },
    { id: "3", role: "encargado_salud", full_name: "Ana", centro_principal: "CESFAM Coñaripe" },
    { id: "4", role: "user", full_name: "Luis", centro_principal: "CESFAM Panguipulli" },
    { id: "5", role: "encargado_salud", full_name: "Sin Centro" },
    { id: "6", role: "chofer", full_name: "Hugo", area: "salud" },
    { id: "7", role: "unidad_control", full_name: "Rodrigo" },
    { id: "8", role: "mecanico", full_name: "Mario" },
    { id: "9", role: "", email: "nuevo@x.cl", area: "salud" },
    { id: "10", role: "encargado_movilizacion", full_name: "Marta", area: "taller" },
  ];
  debe(areaDeUsuario(usuarios[5]) === "movilizacion", "manda el rol, no el área guardada");
  debe(areaDeUsuario(usuarios[8]) === "sin_rol", "sin rol");
  debe(areaDeUsuario(usuarios[6]) === "movilizacion" && areaDeUsuario(usuarios[7]) === "taller", "flota y taller separados");
  debe(pendientesDe(usuarios[4]).includes("Sin centro") && !pendientesDe(usuarios[2]).length, "Salud sin centro");
  debe(pendientesDe(usuarios[5]).includes("Sin licencia registrada"), "chofer sin licencia");
  debe(pendientesDe(usuarios[8]).join() === "Sin rol,Sin nombre", "sin rol ni nombre");

  const sa = visiblesPara(usuarios, { id: "1", role: "super_admin" });
  debe(sa.length === 9 && !sa.some(u => u.id === "1"), "Base del Sistema ve todo menos a sí mismo");
  debe(visiblesPara(usuarios, { id: "x", role: "admin" }).map(u => u.id).join() === "1,2,3,4,5,9", "Administrador: Dirección, Salud y sin rol");
  debe(visiblesPara(usuarios, { role: "jefe_taller" }).map(u => u.id).join() === "8", "Jefe de Taller: su taller");
  debe(visiblesPara(usuarios, { role: "encargado_salud", centro_principal: "CESFAM Coñaripe" }).map(u => u.id).join() === "3", "Encargado: su centro");

  const g = gruposPorRol(usuarios, "movilizacion");
  debe(g.map(x => x.role).join() === "encargado_movilizacion,chofer,unidad_control", "grupos en el orden del área");
  debe(gruposPorRol(usuarios, "salud").find(x => x.role === "encargado_salud").usuarios.map(u => u.id).join() === "3,5", "ordenados por nombre");
  debe(gruposPorRol(usuarios, "sin_rol")[0].usuarios.length === 1, "grupo sin rol");
  debe(coincide(usuarios[2], "coñaripe") && coincide(usuarios[6], "unidad de control") && !coincide(usuarios[2], "taller"), "búsqueda");
  debe(Object.keys(QUE_HACE).length === 12 && AREAS.slice(0, 4).every(a => a.roles.every(r => QUE_HACE[r])), "cada rol dice qué hace");

  if (fallos.length) { console.error("FALLOS:\n  " + fallos.join("\n  ")); return false; }
  console.log("organizacionUsuarios: autotest ok");
  return true;
}

if (typeof process !== "undefined" && process.argv?.[1]?.endsWith("organizacionUsuarios.js")) _selfCheck();
