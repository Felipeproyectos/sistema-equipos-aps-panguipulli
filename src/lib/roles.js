// ─────────────────────────────────────────────────────────────────────────────
// src/lib/roles.js
// Punto único de verdad para roles, etiquetas, jerarquía de creación de cuentas
// y alcance de visibilidad por centro/subsede. Toda pantalla o RLS que necesite
// saber "¿puede este usuario ver/hacer X?" debe pasar por aquí en vez de repetir
// la lógica de rol/centro en cada componente.
// ─────────────────────────────────────────────────────────────────────────────

export const ROLES = {
  SUPER_ADMIN: "super_admin",
  ADMIN: "admin",
  ENCARGADO_SALUD: "encargado_salud",
  ENCARGADO_COMPRAS_SALUD: "encargado_compras_salud",
  MONITOR_CORPORATIVO: "monitor_corporativo",
  JEFE_TALLER: "jefe_taller",
  ENCARGADO_COMPRAS_TALLER: "encargado_compras_taller",
  MECANICO: "mecanico",
  USER: "user", // Usuario / Chofer
};

// Etiqueta que se muestra en pantalla. "super_admin" se presenta como
// "Base del Sistema" para no exponer explícitamente quién tiene el rol de
// máxima autoridad. La clave técnica del rol NO cambia, solo la etiqueta visual.
export const ROLE_LABELS = {
  [ROLES.SUPER_ADMIN]: "Base del Sistema",
  [ROLES.ADMIN]: "Administrador",
  [ROLES.ENCARGADO_SALUD]: "Encargado Salud",
  [ROLES.ENCARGADO_COMPRAS_SALUD]: "Encargado Compras Salud",
  [ROLES.MONITOR_CORPORATIVO]: "Monitor Corporativo",
  [ROLES.JEFE_TALLER]: "Jefe de Taller",
  [ROLES.ENCARGADO_COMPRAS_TALLER]: "Encargado Compras Taller",
  [ROLES.MECANICO]: "Mecánico",
  [ROLES.USER]: "Usuario",
};

export function roleLabel(role) {
  return ROLE_LABELS[role] || role || "Sin rol";
}

// La plataforma solo acepta "user" o "admin" al invitar (base44.users.inviteUser).
// El rol específico de la app (mecanico, jefe_taller, etc.) se aplica luego mediante
// InvitacionPendiente. Aquí mapeamos el rol de la app a su rol base de plataforma.
export function rolBasePlataforma(role) {
  return role === ROLES.SUPER_ADMIN || role === ROLES.ADMIN ? "admin" : "user";
}

// Roles cuyo ámbito principal es Salud (equipos vitales: DEA, monitores, ambulancias)
export const SALUD_ROLES = [ROLES.ADMIN, ROLES.ENCARGADO_SALUD, ROLES.ENCARGADO_COMPRAS_SALUD, ROLES.USER];

// Roles cuyo ámbito principal es Taller mecánico
export const TALLER_ROLES = [ROLES.JEFE_TALLER, ROLES.ENCARGADO_COMPRAS_TALLER, ROLES.MECANICO];

// Roles que ven ambas áreas (con distintos niveles de acción)
export const TRANSVERSAL_ROLES = [ROLES.SUPER_ADMIN, ROLES.MONITOR_CORPORATIVO];

export function esRolSalud(role) {
  return SALUD_ROLES.includes(role);
}

export function esRolTaller(role) {
  return TALLER_ROLES.includes(role);
}

export function esSuperAdmin(role) {
  return role === ROLES.SUPER_ADMIN;
}

export function esMonitorCorporativo(role) {
  return role === ROLES.MONITOR_CORPORATIVO;
}

// ── Jerarquía de creación de cuentas: quién puede crear a quién ─────────────
export const QUIEN_CREA_A_QUIEN = {
  [ROLES.SUPER_ADMIN]: Object.values(ROLES), // crea cualquier rol, incluido otro super_admin
  [ROLES.ADMIN]: [ROLES.ADMIN, ROLES.ENCARGADO_SALUD, ROLES.ENCARGADO_COMPRAS_SALUD, ROLES.USER],
  [ROLES.ENCARGADO_SALUD]: [ROLES.USER],
  [ROLES.JEFE_TALLER]: [ROLES.MECANICO, ROLES.ENCARGADO_COMPRAS_TALLER],
  [ROLES.ENCARGADO_COMPRAS_SALUD]: [],
  [ROLES.ENCARGADO_COMPRAS_TALLER]: [],
  [ROLES.MONITOR_CORPORATIVO]: [],
  [ROLES.MECANICO]: [],
  [ROLES.USER]: [],
};

// Roles que puede asignar/crear un usuario dado (para poblar selects de invitación)
// "Base del Sistema" (super_admin) NUNCA se asigna por invitación: es el rol de
// máxima autoridad y solo se gestiona fuera del flujo de invitación de la app.
export function rolesQuePuedeCrear(creadorRole) {
  return (QUIEN_CREA_A_QUIEN[creadorRole] || []).filter(r => r !== ROLES.SUPER_ADMIN);
}

export function puedeCrearRol(creadorRole, rolObjetivo) {
  return rolesQuePuedeCrear(creadorRole).includes(rolObjetivo);
}

// ── Simular rol: exclusivo de Base del Sistema (super_admin) ────────────────
export function puedeSimularRol(userRealRole) {
  return userRealRole === ROLES.SUPER_ADMIN;
}

// ── Acceso a módulos (para navegación) ──────────────────────────────────────
// modulo: "salud" | "taller" | "config" | "auditoria"
export function puedeAccederModulo(role, modulo) {
  if (esSuperAdmin(role)) return true;
  if (modulo === "auditoria") return false; // solo Base del Sistema
  if (esMonitorCorporativo(role)) return modulo === "salud" || modulo === "taller"; // solo lectura
  if (modulo === "salud") return esRolSalud(role);
  if (modulo === "taller") return esRolTaller(role);
  if (modulo === "config") return role === ROLES.ADMIN; // config de Salud/app
  return false;
}

// ── Alcance por centro (CESFAM + subsedes asignadas) ────────────────────────
// Roles con visibilidad total sin importar centro:
const SIN_RESTRICCION_DE_CENTRO = [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.MONITOR_CORPORATIVO];

/**
 * ¿El usuario puede ver este registro de Salud (Equipo, Solicitud, Alerta, etc.)
 * según su centro_principal + subsedes_asignadas?
 * @param {object} user - usuario autenticado (con centro_principal, subsedes_asignadas)
 * @param {object} registro - objeto con centro_principal (y opcionalmente subsede)
 */
export function estaEnAlcanceDeCentro(user, registro) {
  if (!user || !registro) return false;
  if (SIN_RESTRICCION_DE_CENTRO.includes(user.role)) return true;

  const centroUsuario = user.centro_principal || user.centro_asignado;
  if (!centroUsuario) return false;
  if (registro.centro_principal && registro.centro_principal !== centroUsuario) return false;

  // Si el registro tiene subsede, el usuario debe tenerla explícitamente asignada.
  if (registro.subsede) {
    const subsedes = user.subsedes_asignadas || [];
    return subsedes.includes(registro.subsede);
  }
  // Sin subsede (registro asociado directamente al CESFAM principal): basta el centro.
  return true;
}

const EQUIPOS_MEDICOS = ["dea", "monitor_desfibrilador", "monitor_multiparametros"];

/**
 * ¿El usuario puede ver este Equipo?
 * - Ambulancias: visibles para Salud (según centro) y también para Taller
 *   (Jefe de Taller / Mecánico / Encargado Compras Taller las necesitan para las OT).
 * - Equipos médicos (DEA, monitores): solo Salud, según alcance de centro. Taller no los ve.
 */
export function puedeVerEquipo(user, equipo) {
  if (!user || !equipo) return false;
  if (esSuperAdmin(user.role) || user.role === ROLES.ADMIN || esMonitorCorporativo(user.role)) return true;

  if (equipo.tipo === "ambulancia") {
    if (esRolTaller(user.role)) return true; // Taller necesita ver ambulancias para las OT
    if (esRolSalud(user.role)) return estaEnAlcanceDeCentro(user, equipo);
    return false;
  }

  // Equipos médicos: exclusivo de Salud
  if (EQUIPOS_MEDICOS.includes(equipo.tipo)) {
    if (!esRolSalud(user.role)) return false;
    return estaEnAlcanceDeCentro(user, equipo);
  }

  return estaEnAlcanceDeCentro(user, equipo);
}

/** Filtra una lista de equipos según lo que el usuario puede ver. */
export function filtrarEquiposVisibles(user, equipos = []) {
  return equipos.filter((eq) => puedeVerEquipo(user, eq));
}

// ── Eliminación: quién puede borrar en cada módulo ──────────────────────────
// Todas las eliminaciones, sin importar el rol, deben quedar auditadas
// (ver Historial.jsx / auditoría de eliminaciones) — este helper solo dice
// si el botón de eliminar debe mostrarse, no reemplaza la RLS del backend.
export const PUEDE_ELIMINAR = {
  equipo: [ROLES.SUPER_ADMIN, ROLES.ADMIN],
  parche: [ROLES.SUPER_ADMIN, ROLES.ADMIN],
  orden_trabajo: [ROLES.SUPER_ADMIN, ROLES.JEFE_TALLER],
  repuesto: [ROLES.SUPER_ADMIN, ROLES.JEFE_TALLER],
  proveedor: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.JEFE_TALLER],
  usuario: [ROLES.SUPER_ADMIN],
};

export function puedeEliminar(role, modulo) {
  return (PUEDE_ELIMINAR[modulo] || []).includes(role);
}