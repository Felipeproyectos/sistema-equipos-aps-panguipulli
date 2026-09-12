// La red tiene TRES centros principales. Todo lo demás —postas, CECOSF, EMR,
// SAR y la propia Corporación— cuelga de uno de ellos como subsede.
export const CENTROS_ESTRUCTURA_STATIC = [
  {
    nombre: "CESFAM Panguipulli",
    subsedes: ["Posta Bocatoma", "Posta Cayumapu", "Posta Melefquén", "Posta Huitag", "SAR Panguipulli", "Corporación Municipal"]
  },
  {
    nombre: "CESFAM Coñaripe",
    subsedes: ["EMR Pucura", "CECOSF Liquiñe"]
  },
  {
    nombre: "CESFAM Choshuenco",
    subsedes: ["CECOSF Neltume", "CCR Neltume", "Posta Lago Neltume", "EMR Puerto Fuy", "Posta Pirehueico"]
  }
];

/* ──────────────────────────────────────────────────────────────
   Sedes que se cargaron como centro principal por error y que en
   realidad dependen de un CESFAM. Se pliegan sobre su centro tanto en
   los selectores como al ubicar cada registro, para que la aplicación
   quede correcta antes y después de correr migracion/07.
   ────────────────────────────────────────────────────────────── */
export const CENTROS_DEPENDIENTES = {
  "CECOSF Liquiñe": { centro: "CESFAM Coñaripe", subsede: "CECOSF Liquiñe" },
  "CECOSF Neltume": { centro: "CESFAM Choshuenco", subsede: "CECOSF Neltume" },
  "Corporación Municipal de Panguipulli": { centro: "CESFAM Panguipulli", subsede: "Corporación Municipal" }
};

// Comparación tolerante: los nombres vienen escritos a mano en la base
// (mayúsculas, tildes y espacios de más incluidos).
function clave(nombre) {
  return String(nombre || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

const DEPENDIENTES_POR_CLAVE = new Map(
  Object.entries(CENTROS_DEPENDIENTES).map(([nombre, destino]) => [clave(nombre), destino])
);

/** Si el nombre es una sede dependiente, devuelve su centro y subsede. */
export function centroDependiente(nombre) {
  return DEPENDIENTES_POR_CLAVE.get(clave(nombre)) || null;
}

/**
 * Ubicación real de un registro a partir de lo que trae guardado.
 * Un equipo cargado en "CECOSF Neltume" pertenece a CESFAM Choshuenco,
 * subsede CECOSF Neltume.
 */
export function resolverUbicacion(centroPrincipal, subsede) {
  const sub = String(subsede || "").trim();
  const dep = centroDependiente(centroPrincipal);
  if (dep) return { centro: dep.centro, subsede: sub || dep.subsede };
  return { centro: String(centroPrincipal || "").trim(), subsede: sub };
}

/** Pliega las sedes dependientes sobre su centro, conservando el resto. */
export function normalizarEstructura(lista) {
  const salida = [];
  const porClave = new Map();

  const obtener = (nombre) => {
    const k = clave(nombre);
    if (!porClave.has(k)) {
      const centro = { nombre, subsedes: [] };
      porClave.set(k, centro);
      salida.push(centro);
    }
    return porClave.get(k);
  };
  const agregar = (centro, subsede) => {
    const s = String(subsede || "").trim();
    if (s && !centro.subsedes.some(x => clave(x) === clave(s))) centro.subsedes.push(s);
  };

  for (const c of lista || []) {
    const dep = centroDependiente(c.nombre);
    const destino = obtener(dep ? dep.centro : c.nombre);
    if (dep) agregar(destino, dep.subsede);
    (c.subsedes || []).forEach(s => agregar(destino, s));
  }
  return salida;
}

// Cache en memoria para evitar múltiples fetches
let _cache = null;

export async function getCentrosEstructura() {
  if (_cache) return _cache;
  try {
    const { base44 } = await import("@/api/base44Client");
    const centros = await base44.entities.Centro.list();
    if (centros.length > 0) {
      _cache = normalizarEstructura(centros.map(c => ({ nombre: c.nombre, subsedes: c.sucursales || [] })));
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
  { value: "monitor_multiparametros", label: "Monitor Multiparámetros" }
];

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