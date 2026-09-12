// Datos estáticos de respaldo
export const CENTROS_ESTRUCTURA_STATIC = [
  {
    nombre: "CESFAM Panguipulli",
    subsedes: ["Posta Bocatoma", "Posta Cayumapu", "Posta Melefquén", "Posta Huitag", "SAR Panguipulli"]
  },
  {
    nombre: "CESFAM Coñaripe",
    subsedes: ["EMR Pucura", "CECOSF Liquiñe"]
  },
  {
    nombre: "CESFAM Choshuenco",
    subsedes: ["CECOSF Neltume", "CCR Neltume", "Posta Lago Neltume", "EMR Puerto Fuy", "Posta Pirehueico"]
  },
  {
    nombre: "Corporación Municipal de Panguipulli",
    subsedes: []
  }
];

// Cache en memoria para evitar múltiples fetches
let _cache = null;

export async function getCentrosEstructura() {
  if (_cache) return _cache;
  try {
    const { base44 } = await import("@/api/base44Client");
    const centros = await base44.entities.Centro.list();
    if (centros.length > 0) {
      _cache = centros.map(c => ({ nombre: c.nombre, subsedes: c.sucursales || [] }));
      return _cache;
    }
  } catch {}
  return CENTROS_ESTRUCTURA_STATIC;
}

// Para compatibilidad con código sincrónico existente, exportar los datos estáticos
// El formulario de equipos llama getCentrosEstructura() de forma asíncrona
export const CENTROS_ESTRUCTURA = CENTROS_ESTRUCTURA_STATIC;

export const TIPOS_EQUIPO = [
  { value: "dea", label: "DEA" },
  { value: "monitor_desfibrilador", label: "Monitor Desfibrilador" },
  { value: "ambulancia", label: "Ambulancia" },
  { value: "monitor_multiparametros", label: "Monitor Multiparámetros" },
  { value: "camioneta", label: "Camioneta" },
  { value: "furgon", label: "Furgón" },
  { value: "camion_3_4", label: "Camión 3/4" }
];

/* ──────────────────────────────────────────────────────────────
   Categorías de activos del Taller Mecánico
   - salud: flota clínica (ambulancias)
   - corporativo: flota administrativa/operativa (camionetas, furgones, camiones 3/4)
   - externo: vehículo de otra entidad, se registra manualmente en la OT
   ────────────────────────────────────────────────────────────── */
export const TIPOS_VEHICULO_SALUD = ["ambulancia"];

export const TIPOS_VEHICULO_CORPORATIVO = ["camioneta", "furgon", "camion_3_4"];

export const TIPOS_VEHICULO = [...TIPOS_VEHICULO_SALUD, ...TIPOS_VEHICULO_CORPORATIVO];

export const CATEGORIAS_ACTIVO_TALLER = [
  { value: "salud", label: "Salud", descripcion: "Ambulancias", color: "#DC2626", bg: "#FEF2F2" },
  { value: "corporativo", label: "Corporativo", descripcion: "Camionetas, furgones, camiones 3/4", color: "#2563EB", bg: "#EFF6FF" },
  { value: "externo", label: "Externo", descripcion: "Vehículo de otra entidad", color: "#7C3AED", bg: "#F5F3FF" }
];

/** ¿El tipo de equipo corresponde a un vehículo (cualquier categoría interna)? */
export function esVehiculo(tipo) {
  return TIPOS_VEHICULO.includes(tipo);
}

/** Categoría de taller ("salud" | "corporativo") a partir del tipo de equipo. */
export function categoriaActivoPorTipo(tipo) {
  if (TIPOS_VEHICULO_SALUD.includes(tipo)) return "salud";
  if (TIPOS_VEHICULO_CORPORATIVO.includes(tipo)) return "corporativo";
  return null;
}

/**
 * Normaliza el tipo_activo de una OT.
 * Compatibilidad: las OT antiguas de ambulancias quedaron guardadas como
 * "corporativo"; si el equipo asociado es de flota salud se reclasifican.
 */
export function normalizarTipoActivo(tipoActivo, equipo) {
  if (tipoActivo === "externo") return "externo";
  const porEquipo = equipo ? categoriaActivoPorTipo(equipo.tipo) : null;
  if (porEquipo) return porEquipo;
  if (tipoActivo === "salud" || tipoActivo === "corporativo") return tipoActivo;
  return "salud";
}

/** Etiqueta legible de la categoría de activo. */
export function etiquetaTipoActivo(tipoActivo) {
  return CATEGORIAS_ACTIVO_TALLER.find(c => c.value === tipoActivo)?.label || "Corporativo";
}

export const TIPOS_ACTIVIDAD = [
  { value: "cambio_parches", label: "Cambio de Parches" },
  { value: "mantenimiento_preventivo", label: "Mantenimiento Preventivo" },
  { value: "mantenimiento_correctivo", label: "Mantenimiento Correctivo" },
  { value: "error_calibracion", label: "Error de Calibración" },
  { value: "inspeccion", label: "Inspección" },
  { value: "traslado", label: "Traslado" }
];

export const TIPOS_SOLICITUD = [
  { value: "compra_repuestos", label: "Compra de Repuestos" },
  { value: "cambio_parches", label: "Cambio de Parches" },
  { value: "mantenimiento_preventivo", label: "Mantenimiento Preventivo" },
  { value: "mantenimiento_correctivo", label: "Mantenimiento Correctivo" },
  { value: "revision_tecnica", label: "Revisión Técnica" },
  { value: "otros", label: "Otros" }
];

export const ESTADOS_EQUIPO = [
  { value: "operativo", label: "Operativo", color: "#16a34a", bg: "#f0fdf4" },
  { value: "mantenimiento", label: "En Mantenimiento", color: "#d97706", bg: "#fffbeb" },
  { value: "fuera_de_servicio", label: "Fuera de Servicio", color: "#dc2626", bg: "#fef2f2" }
];