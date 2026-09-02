import {
  LayoutDashboard, Monitor, Bell, ClipboardList, FileText,
  Settings, Wrench, Building2, Package, ScrollText, BarChart3, Users, ClipboardCheck, ShoppingCart, Heart
} from "lucide-react";
import { ROLES } from "@/lib/roles";

// Matriz de navegación por rol. Roles finales:
// super_admin (Base del Sistema) · admin · encargado_salud ·
// encargado_compras_salud · monitor_corporativo · jefe_taller ·
// encargado_compras_taller · mecanico · user (Usuario/Chofer)
export const NAV_ITEMS = [
  { label: "Dashboard", page: "Dashboard", path: "/", icon: LayoutDashboard,
    roles: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.ENCARGADO_SALUD, ROLES.ENCARGADO_COMPRAS_SALUD, ROLES.USER] },

  { label: "Taller", page: "Taller", path: "/Taller", icon: Wrench,
    roles: [ROLES.SUPER_ADMIN, ROLES.JEFE_TALLER] },

  { label: "Órdenes de Trabajo", page: "OrdenesTrabajo", path: "/OrdenesTrabajo", icon: ClipboardList,
    roles: [ROLES.MECANICO] },

  { label: "Solicitud de Repuestos", page: "SolicitudRepuestos", path: "/SolicitudRepuestos", icon: Package,
    roles: [ROLES.MECANICO] },

  { label: "Equipos", page: "Equipos2", path: "/Equipos2", icon: Monitor,
    roles: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.ENCARGADO_SALUD, ROLES.ENCARGADO_COMPRAS_SALUD, ROLES.USER] },

  { label: "Alertas", page: "AlertasV2", path: "/AlertasV2", icon: Bell,
    roles: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.ENCARGADO_SALUD, ROLES.ENCARGADO_COMPRAS_SALUD, ROLES.USER] },

  { label: "Solicitudes", page: "SolicitudesV2", path: "/SolicitudesV2", icon: ClipboardList,
    roles: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.ENCARGADO_SALUD, ROLES.ENCARGADO_COMPRAS_SALUD, ROLES.USER] },

  { label: "Repuestos", page: "Repuestos", path: "/Repuestos", icon: Package,
    roles: [ROLES.SUPER_ADMIN, ROLES.JEFE_TALLER, ROLES.ENCARGADO_COMPRAS_TALLER] },

  { label: "Aprobación Solicitudes", page: "AprobacionRepuestos", path: "/AprobacionRepuestos", icon: ClipboardCheck,
    roles: [ROLES.SUPER_ADMIN, ROLES.JEFE_TALLER, ROLES.ENCARGADO_COMPRAS_TALLER] },

  { label: "Tablero de Compras", page: "ComprasTablero", path: "/ComprasTablero", icon: ShoppingCart,
    roles: [ROLES.SUPER_ADMIN, ROLES.ENCARGADO_COMPRAS_TALLER] },

  { label: "Tablero de Compras Salud", page: "ComprasSaludTablero", path: "/ComprasSaludTablero", icon: Heart,
    roles: [ROLES.SUPER_ADMIN, ROLES.ENCARGADO_COMPRAS_SALUD, ROLES.ENCARGADO_SALUD] },

  { label: "Proveedores", page: "Proveedores", path: "/Proveedores", icon: Building2,
    roles: [ROLES.SUPER_ADMIN, ROLES.JEFE_TALLER, ROLES.ENCARGADO_COMPRAS_TALLER, ROLES.ENCARGADO_COMPRAS_SALUD] },

  { label: "Revisión Bitácora", page: "RevisionInspecciones", path: "/RevisionInspecciones", icon: ClipboardList,
    roles: [ROLES.SUPER_ADMIN, ROLES.ENCARGADO_SALUD] },

  { label: "Reportes", page: "Reportes", path: "/Reportes", icon: FileText,
    roles: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.ENCARGADO_SALUD, ROLES.JEFE_TALLER, ROLES.MONITOR_CORPORATIVO] },

  { label: "Monitor Corporativo", page: "MonitorCorporativo", path: "/MonitorCorporativo", icon: BarChart3,
    roles: [ROLES.SUPER_ADMIN, ROLES.MONITOR_CORPORATIVO] },

  { label: "Configuración", page: "Configuracion", path: "/Configuracion", icon: Settings,
    roles: [ROLES.SUPER_ADMIN, ROLES.ADMIN] },

  { label: "Auditoría", page: "Auditoria", path: "/Auditoria", icon: ScrollText,
    roles: [ROLES.SUPER_ADMIN] },

  { label: "Usuarios", page: "Usuarios", path: "/Usuarios", icon: Users,
    roles: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.ENCARGADO_SALUD, ROLES.JEFE_TALLER] },
];

// Orden prioritario por rol: estos ítems aparecen primero en el menú del rol,
// sin alterar el orden del resto de roles. El resto de ítems conservan el
// orden definido en NAV_ITEMS.
const ROLE_ORDER = {
  [ROLES.ENCARGADO_COMPRAS_TALLER]: ["ComprasTablero"],
  [ROLES.ENCARGADO_COMPRAS_SALUD]: ["ComprasSaludTablero"],
};

export function getNavItemsForRole(role) {
  const items = NAV_ITEMS.filter(item => item.roles.includes(role || ROLES.USER));
  const priority = ROLE_ORDER[role];
  if (!priority?.length) return items;
  return [
    ...priority.map(page => items.find(i => i.page === page)).filter(Boolean),
    ...items.filter(i => !priority.includes(i.page)),
  ];
}