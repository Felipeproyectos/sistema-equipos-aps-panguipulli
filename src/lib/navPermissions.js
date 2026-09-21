import {
  LayoutDashboard, Monitor, Bell, ClipboardList, FileText,
  Settings, Wrench, Building2, Package, ScrollText, BarChart3, Users, ClipboardCheck, ShoppingCart, Heart, Route, Truck, IdCard, CalendarDays, NotebookPen
} from "lucide-react";
import { ROLES } from "@/lib/roles";

// Matriz de navegación por rol. Roles finales:
// super_admin (Base del Sistema) · admin · encargado_salud ·
// encargado_compras_salud · monitor_corporativo · jefe_taller ·
// encargado_compras_taller · mecanico · user (Usuario/Chofer) ·
// encargado_movilizacion
export const NAV_ITEMS = [
  { label: "Dashboard", page: "Dashboard", path: "/", icon: LayoutDashboard,
    roles: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.ENCARGADO_SALUD, ROLES.ENCARGADO_COMPRAS_SALUD, ROLES.USER] },

  { label: "Movilización", page: "Movilizacion", path: "/Movilizacion", icon: Route,
    roles: [ROLES.SUPER_ADMIN, ROLES.ENCARGADO_MOVILIZACION] },

  { label: "Vehículos", page: "Flota", path: "/Flota", icon: Truck,
    roles: [ROLES.SUPER_ADMIN, ROLES.ENCARGADO_MOVILIZACION] },

  { label: "Calendario", page: "Calendario", path: "/Calendario", icon: CalendarDays,
    roles: [ROLES.SUPER_ADMIN, ROLES.ENCARGADO_MOVILIZACION] },

  { label: "Choferes", page: "Choferes", path: "/Choferes", icon: IdCard,
    roles: [ROLES.SUPER_ADMIN, ROLES.ENCARGADO_MOVILIZACION] },

  // La bitacora de operacion de la flota. Es otra que la de Calidad (la del
  // enlace publico, que revisa el Encargado de Salud en "Revision Bitacora"):
  // miden cosas distintas y las miran personas distintas.
  { label: "Bitácora", page: "BitacoraFlota", path: "/BitacoraFlota", icon: NotebookPen,
    roles: [ROLES.SUPER_ADMIN, ROLES.ENCARGADO_MOVILIZACION] },

  // La primera pantalla del chofer. Sin ninguna, el control de acceso lo
  // mandaba al Dashboard, que tampoco es suyo, y lo rebotaba en bucle.
  { label: "Mi licencia", page: "MiLicencia", path: "/MiLicencia", icon: IdCard,
    roles: [ROLES.SUPER_ADMIN, ROLES.CHOFER] },

  // La que usa todos los dias: anotar la salida y cerrarla al volver.
  { label: "Mi bitácora", page: "MiBitacora", path: "/MiBitacora", icon: Route,
    roles: [ROLES.SUPER_ADMIN, ROLES.CHOFER] },

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
  // Su pantalla principal es el Monitor; en el orden general quedaba despues
  // de Reportes, y ese orden decide tambien a donde se lo manda de vuelta.
  [ROLES.MONITOR_CORPORATIVO]: ["MonitorCorporativo"],
  [ROLES.ENCARGADO_MOVILIZACION]: ["Movilizacion", "Flota", "Calendario", "Choferes", "BitacoraFlota"],
  // "Mi licencia" primero a proposito: es el tramite que lo habilita, y es
  // ademas a donde se lo manda cuando llega a una pantalla que no es suya.
  [ROLES.CHOFER]: ["MiLicencia", "MiBitacora"],
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
// ── Acceso por ruta ─────────────────────────────────────────────────────────
// El menú oculta los enlaces, pero ocultar no es bloquear: escribiendo la URL
// se llegaba igual a Auditoría, Configuración o los tableros de compras desde
// cualquier rol. La base los frena (las policies de 03_policies.sql filtran las
// filas), así que no se filtraban datos, pero la pantalla se abría con su
// cabecera y sus botones — el mismo tipo de confusión que ya generaba el rol
// simulado aterrizando en la pantalla de otro perfil.
//
// La regla se saca de esta misma matriz, para que menú y acceso no puedan
// contradecirse: si una pantalla es ítem de menú de ALGÚN rol pero no del rol
// que la abre, se rebota. Las pantallas que no son ítem de menú (el detalle de
// una orden de trabajo, el Dashboard, Centros) quedan fuera de la regla: se
// llega a ellas desde dentro de otras pantallas y cada una controla lo suyo.
const PAGINAS_DE_MENU = new Set(NAV_ITEMS.map((i) => i.page));

/** ¿Esta pantalla pertenece al menú de otro rol y no al de este? */
export function paginaFueraDelRol(role, page) {
  // Base del Sistema entra a todo: hay dos pantallas del mecanico que no
  // figuran en su menu y no tiene sentido cerrarselas al rol de maxima
  // autoridad. Para VER el sistema como otro perfil esta "Simular Rol", que
  // cambia el rol efectivo y con el, este bloqueo.
  if (role === ROLES.SUPER_ADMIN) return false;
  if (!page || !PAGINAS_DE_MENU.has(page)) return false;
  return !getNavItemsForRole(role).some((i) => i.page === page);
}

/** Primer ítem del menú del rol: a dónde se lo manda cuando se lo rebota. */
export function rutaInicialDelRol(role) {
  return getNavItemsForRole(role)[0]?.path || "/";
}
