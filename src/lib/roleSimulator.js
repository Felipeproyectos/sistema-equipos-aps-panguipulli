// Simulador de roles: permite ÚNICAMENTE a Base del Sistema (super_admin)
// visualizar la app desde la perspectiva de otro rol. Mientras está activo:
//  - La navegación/UI se calcula con el rol simulado (getEffectiveNavRole).
//  - TODAS las escrituras (create/update/delete/invoke) quedan bloqueadas por
//    el cliente base44 (ver src/api/base44Client.js), sin importar la pantalla.
//  - Los datos que se leen siguen siendo los reales del usuario autenticado
//    (Base44 filtra por RLS del usuario real, esto no otorga permisos nuevos).
import { ROLES, roleLabel } from "@/lib/roles";

const KEY = "b44_role_simulator";

export function getSimulatedRole() {
  try { return sessionStorage.getItem(KEY) || null; } catch { return null; }
}

/** Solo puede activarse si quien la pide es realmente super_admin. */
export function setSimulatedRole(role, realRole) {
  if (realRole !== ROLES.SUPER_ADMIN) return false;
  if (role === ROLES.SUPER_ADMIN) return false; // no tiene sentido "simular" Base del Sistema
  try {
    if (role) sessionStorage.setItem(KEY, role);
    else sessionStorage.removeItem(KEY);
    window.dispatchEvent(new CustomEvent("role-simulator-change", { detail: role }));
    return true;
  } catch {
    return false;
  }
}

export function clearSimulatedRole() {
  try {
    sessionStorage.removeItem(KEY);
    window.dispatchEvent(new CustomEvent("role-simulator-change", { detail: null }));
  } catch { /* noop */ }
}

/**
 * Rol efectivo para navegación: si el usuario real es super_admin y hay una
 * simulación guardada, se usa esa. Para cualquier otro rol real, siempre se
 * devuelve el rol real (nadie más puede simular).
 */
export function getEffectiveNavRole(realRole) {
  const sim = getSimulatedRole();
  if (realRole === ROLES.SUPER_ADMIN && sim) return sim;
  return realRole;
}

/** ¿Hay una simulación activa en este momento? (usado para bloquear escrituras) */
export function isSimulandoActivo() {
  return !!getSimulatedRole();
}

export const ALL_ROLES = Object.values(ROLES)
  .filter((r) => r !== ROLES.SUPER_ADMIN)
  .map((r) => ({ value: r, label: roleLabel(r) }));

export const MENSAJE_BLOQUEO_SIMULACION =
  "Estás en modo Simular Rol (solo lectura). Sal del modo simulación para hacer cambios.";
