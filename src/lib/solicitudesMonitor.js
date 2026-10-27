// Las solicitudes de los equipos vitales, canalizadas por el Monitor Corporativo.
//
// El recorrido
// ────────────
//   pendiente  → la abrió alguien del centro (un Usuario, una pauta con fallas,
//                una alerta). El Encargado de Salud la revisa, completa el
//                detalle y la envía.
//   derivada   → está en la bandeja del Monitor Corporativo, sin tomar.
//   en_proceso → el Monitor la tomó y la está gestionando.
//   devuelta   → el Monitor pidió más información: vuelve al Encargado, que la
//                corrige y la reenvía (vuelve a "derivada").
//   finalizada → el Monitor la resolvió, con su resolución por escrito.
//   rechazada  → el Monitor la cerró porque no procede, con el motivo.
//
// Las de vehículos (ambulancias y resto de la flota) NO pasan por acá: esas
// las resuelven Movilización y el Taller (esSolicitudDeFlota en panelFlota.js).
//
// La base hace cumplir lo mismo (migracion/31_solicitudes_monitor.sql): quién
// mueve cada estado y qué detalle es obligatorio para enviar. Esto decide qué
// botones se muestran y avisa antes de guardar; no reemplaza a la base.
// `node src/lib/solicitudesMonitor.js` corre el autotest.

export const CATEGORIAS = [
  { value: "mantenimiento", label: "Mantenimiento", ayuda: "Preventivo, calibración, revisión técnica o certificación del equipo." },
  { value: "compra_insumo", label: "Compra de insumo", ayuda: "Parches, electrodos, baterías, sensores, cables, papel u otro consumible." },
  { value: "desperfecto_tecnico", label: "Desperfecto técnico", ayuda: "El equipo falla, no enciende, da error o se dañó." },
];

export const PRIORIDADES = [
  { value: "critica", label: "Crítica", ayuda: "Sin este equipo no se puede atender una urgencia vital.", color: "#dc2626", bg: "#fef2f2" },
  { value: "alta", label: "Alta", ayuda: "Hay que resolverlo esta semana.", color: "#d97706", bg: "#fffbeb" },
  { value: "media", label: "Media", ayuda: "Puede esperar a la próxima gestión.", color: "#2563eb", bg: "#eff6ff" },
  { value: "baja", label: "Baja", ayuda: "Mejora o reposición sin apuro.", color: "#64748b", bg: "#f1f5f9" },
];

export const OPERATIVIDAD = [
  { value: "operativo", label: "Operativo", color: "#16a34a" },
  { value: "operativo_con_restricciones", label: "Operativo con restricciones", color: "#d97706" },
  { value: "fuera_de_servicio", label: "Fuera de servicio", color: "#dc2626" },
];

export const ESTADOS = {
  pendiente:  { label: "Por enviar al Monitor", corto: "Pendiente", color: "#d97706", bg: "#fffbeb" },
  derivada:   { label: "En Monitor Corporativo", corto: "Enviada", color: "#4f46e5", bg: "#eef2ff" },
  en_proceso: { label: "En gestión", corto: "En gestión", color: "#2563eb", bg: "#eff6ff" },
  devuelta:   { label: "Devuelta para completar", corto: "Devuelta", color: "#c2410c", bg: "#fff7ed" },
  finalizada: { label: "Resuelta", corto: "Resuelta", color: "#16a34a", bg: "#f0fdf4" },
  rechazada:  { label: "No procede", corto: "No procede", color: "#64748b", bg: "#f1f5f9" },
};

export const ESTADOS_CERRADOS = ["finalizada", "rechazada"];
export const ESTADOS_EN_MONITOR = ["derivada", "en_proceso"];

/** Lo que se muestra cuando el detalle viene de una solicitud vieja, sin categoría. */
export const rotulo = (lista, v) => lista.find(x => x.value === v)?.label || "";

export const DESCRIPCION_MINIMA = 20;

const ROLES_CENTRO = ["super_admin", "admin", "encargado_salud"];
const ROLES_MONITOR = ["super_admin", "monitor_corporativo"];

/** ¿Puede enviar (o reenviar) solicitudes al Monitor? */
export const puedeEnviarAlMonitor = (role) => ROLES_CENTRO.includes(role);

/** ¿Puede resolver lo que llega al Monitor? */
export const puedeResolverComoMonitor = (role) => ROLES_MONITOR.includes(role);

const estadoDe = (s) => s?.estado || "pendiente";
const texto = (v) => String(v ?? "").trim();

/**
 * Lo que le falta a una solicitud para poder enviarse al Monitor, en palabras
 * de quien la llena. Vacío = lista. La base repite estas mismas reglas.
 */
export function faltantesParaEnviar(s) {
  const f = [];
  if (!rotulo(CATEGORIAS, s?.categoria)) f.push("el tipo de solicitud (mantenimiento, compra de insumo o desperfecto técnico)");
  if (!texto(s?.equipo_id)) f.push("el equipo");
  if (!texto(s?.centro)) f.push("el CESFAM o centro");
  if (!texto(s?.ubicacion_especifica)) f.push("la ubicación exacta del equipo (sala, box, piso)");
  if (!rotulo(PRIORIDADES, s?.prioridad)) f.push("la prioridad");
  if (!rotulo(OPERATIVIDAD, s?.operatividad)) f.push("en qué estado quedó el equipo");
  if (texto(s?.descripcion).length < DESCRIPCION_MINIMA) f.push(`una descripción de al menos ${DESCRIPCION_MINIMA} caracteres`);
  if (!texto(s?.usuario_nombre)) f.push("el nombre de quien solicita");
  if (!texto(s?.solicitante_cargo)) f.push("el cargo de quien solicita");
  if (s?.categoria === "compra_insumo") {
    if (!texto(s?.insumo_nombre)) f.push("el insumo que se necesita");
    if (!(Number(s?.insumo_cantidad) > 0)) f.push("la cantidad del insumo");
  }
  if (s?.categoria === "desperfecto_tecnico" && !texto(s?.fecha_deteccion)) f.push("la fecha en que se detectó la falla");
  return f;
}

/** El equipo tal como está en su ficha, para que la solicitud lo recuerde. */
export function fotoDelEquipo(equipo) {
  if (!equipo) return {};
  return {
    equipo_tipo: equipo.tipo || "",
    equipo_marca: equipo.marca || "",
    equipo_modelo: equipo.modelo || "",
    equipo_numero_serie: equipo.numero_serie || "",
    equipo_numero_inventario: equipo.numero_inventario || "",
  };
}

/** Un evento de la línea de tiempo. */
export function evento(user, nombre, notas = "") {
  return {
    fecha: new Date().toISOString(),
    evento: nombre,
    usuario_email: user?.email || "",
    usuario_nombre: user?.full_name || user?.email || "",
    notas: texto(notas),
  };
}

/**
 * Las acciones que este rol puede hacer sobre esta solicitud, en orden.
 * Cada una: { clave, estado, etiqueta, pideTexto, campoTexto }.
 */
export function accionesPara(role, s, { esFlota = false } = {}) {
  if (esFlota) return [];
  const e = estadoDe(s);
  const out = [];
  if (puedeEnviarAlMonitor(role) && (e === "pendiente" || e === "devuelta")) {
    out.push({ clave: "enviar", estado: "derivada", etiqueta: e === "devuelta" ? "Corregir y reenviar" : "Completar y enviar al Monitor" });
  }
  if (puedeResolverComoMonitor(role)) {
    if (e === "derivada") out.push({ clave: "tomar", estado: "en_proceso", etiqueta: "Tomar solicitud", pideTexto: false });
    if (ESTADOS_EN_MONITOR.includes(e)) {
      out.push({ clave: "resolver", estado: "finalizada", etiqueta: "Marcar resuelta", pideTexto: true, campoTexto: "Qué se hizo para resolverla" });
      out.push({ clave: "devolver", estado: "devuelta", etiqueta: "Devolver al centro", pideTexto: true, campoTexto: "Qué información falta o qué hay que corregir" });
      out.push({ clave: "rechazar", estado: "rechazada", etiqueta: "No procede", pideTexto: true, campoTexto: "Por qué no procede" });
    }
  }
  return out;
}

/** Los cambios que se guardan al aplicar una acción del Monitor. */
export function cambiosDeAccion(accion, s, user, nota = "") {
  const notas = texto(nota);
  const nombre = {
    tomar: "Tomada por el Monitor Corporativo",
    resolver: "Resuelta",
    devolver: "Devuelta al centro",
    rechazar: "Cerrada: no procede",
  }[accion.clave] || accion.etiqueta;
  return {
    estado: accion.estado,
    ...(notas ? { resolucion: notas } : {}),
    linea_tiempo: [...(Array.isArray(s?.linea_tiempo) ? s.linea_tiempo : []), evento(user, nombre, notas)],
  };
}

const DIA_MS = 86400000;
const diasDesde = (f, ahora) => (f ? Math.floor((ahora - new Date(f).getTime()) / DIA_MS) : 0);

/**
 * La bandeja del Monitor ordenada por urgencia: crítica y fuera de servicio
 * primero, después la más antigua. `atrasada` = más de 3 días sin tomar, o
 * más de 14 en gestión.
 */
export function ordenarBandeja(lista, ahora = Date.now()) {
  const peso = { critica: 0, alta: 1, media: 2, baja: 3 };
  return lista
    .map(s => {
      const desde = estadoDe(s) === "en_proceso" ? (s.fecha_toma || s.fecha_derivacion) : (s.fecha_derivacion || s.created_date);
      const dias = diasDesde(desde, ahora);
      const atrasada = (estadoDe(s) === "derivada" && dias > 3) || (estadoDe(s) === "en_proceso" && dias > 14);
      return { ...s, _dias: dias, _atrasada: atrasada };
    })
    .sort((a, b) =>
      (a.operatividad === "fuera_de_servicio" ? 0 : 1) - (b.operatividad === "fuera_de_servicio" ? 0 : 1)
      || (peso[a.prioridad] ?? 2) - (peso[b.prioridad] ?? 2)
      || b._dias - a._dias);
}

/** Texto plano con todo el detalle: para copiar, imprimir o mandar a un proveedor. */
export function fichaEnTexto(s) {
  const linea = (k, v) => (texto(v) ? `${k}: ${texto(v)}` : "");
  return [
    `Solicitud ${s?.numero_solicitud || ""}`.trim(),
    linea("Tipo", rotulo(CATEGORIAS, s?.categoria)),
    linea("Prioridad", rotulo(PRIORIDADES, s?.prioridad)),
    linea("Estado del equipo", rotulo(OPERATIVIDAD, s?.operatividad)),
    linea("CESFAM / centro", s?.centro),
    linea("Subsede", s?.subsede),
    linea("Ubicación exacta", s?.ubicacion_especifica),
    linea("Equipo", [s?.equipo_marca, s?.equipo_modelo].filter(Boolean).join(" ")),
    linea("N° de serie", s?.equipo_numero_serie),
    linea("N° de inventario", s?.equipo_numero_inventario),
    linea("Insumo", s?.insumo_nombre ? `${s.insumo_nombre} × ${s.insumo_cantidad || 1}` : ""),
    linea("Especificación", s?.insumo_especificacion),
    linea("Falla detectada el", s?.fecha_deteccion),
    linea("Descripción", s?.descripcion || s?.observaciones),
    linea("Solicita", [s?.usuario_nombre, s?.solicitante_cargo].filter(Boolean).join(", ")),
    linea("Contacto", [s?.solicitante_telefono, s?.usuario_email].filter(Boolean).join(" · ")),
    linea("Enviada por", s?.derivada_por_nombre),
  ].filter(Boolean).join("\n");
}

export function _selfCheck() {
  const fallos = [];
  const debe = (c, q) => { if (!c) fallos.push(q); };

  const completa = {
    categoria: "desperfecto_tecnico", equipo_id: "e1", centro: "CESFAM Panguipulli", ubicacion_especifica: "Box 3, primer piso",
    prioridad: "critica", operatividad: "fuera_de_servicio", descripcion: "No enciende después de la carga nocturna.",
    usuario_nombre: "Ana", solicitante_cargo: "Enfermera", fecha_deteccion: "2026-10-20",
  };
  debe(faltantesParaEnviar(completa).length === 0, "una solicitud completa no tiene faltantes: " + faltantesParaEnviar(completa));
  debe(faltantesParaEnviar({ ...completa, fecha_deteccion: "" }).length === 1, "el desperfecto pide la fecha de detección");
  debe(faltantesParaEnviar({ ...completa, descripcion: "corto" }).some(x => x.includes("descripción")), "descripción mínima");
  const insumo = { ...completa, categoria: "compra_insumo", fecha_deteccion: "" };
  debe(faltantesParaEnviar(insumo).length === 2, "el insumo pide nombre y cantidad");
  debe(faltantesParaEnviar({ ...insumo, insumo_nombre: "Parches adulto", insumo_cantidad: 2 }).length === 0, "insumo completo");
  debe(faltantesParaEnviar({}).length >= 9, "vacía: falta todo");

  const enviar = accionesPara("encargado_salud", { estado: "pendiente" });
  debe(enviar.length === 1 && enviar[0].estado === "derivada", "el Encargado envía la pendiente");
  debe(accionesPara("encargado_salud", { estado: "derivada" }).length === 0, "el Encargado no resuelve");
  debe(accionesPara("encargado_salud", { estado: "devuelta" })[0]?.etiqueta === "Corregir y reenviar", "el Encargado reenvía la devuelta");
  debe(accionesPara("monitor_corporativo", { estado: "pendiente" }).length === 0, "el Monitor no toca lo que no le llegó");
  debe(accionesPara("monitor_corporativo", { estado: "derivada" }).map(a => a.clave).join() === "tomar,resolver,devolver,rechazar", "acciones del Monitor");
  debe(accionesPara("monitor_corporativo", { estado: "en_proceso" }).map(a => a.clave).join() === "resolver,devolver,rechazar", "en gestión no se vuelve a tomar");
  debe(accionesPara("monitor_corporativo", { estado: "finalizada" }).length === 0, "cerrada no tiene acciones");
  debe(accionesPara("encargado_salud", { estado: "pendiente" }, { esFlota: true }).length === 0, "las de vehículos no pasan por el Monitor");
  debe(accionesPara("user", { estado: "pendiente" }).length === 0, "el Usuario no envía al Monitor");

  const c = cambiosDeAccion({ clave: "devolver", estado: "devuelta" }, { linea_tiempo: [{ evento: "x" }] }, { email: "m@x", full_name: "Mónica" }, " falta la serie ");
  debe(c.estado === "devuelta" && c.resolucion === "falta la serie" && c.linea_tiempo.length === 2
    && c.linea_tiempo[1].usuario_nombre === "Mónica", "devolver deja el motivo y suma a la línea de tiempo");

  const ahora = new Date("2026-10-27T12:00:00Z").getTime();
  const b = ordenarBandeja([
    { id: "a", estado: "derivada", prioridad: "baja", fecha_derivacion: "2026-10-26T12:00:00Z" },
    { id: "b", estado: "derivada", prioridad: "alta", fecha_derivacion: "2026-10-20T12:00:00Z" },
    { id: "c", estado: "derivada", prioridad: "media", operatividad: "fuera_de_servicio", fecha_derivacion: "2026-10-27T10:00:00Z" },
  ], ahora);
  debe(b.map(x => x.id).join() === "c,b,a", "fuera de servicio primero, después prioridad: " + b.map(x => x.id));
  debe(b[1]._atrasada && !b[2]._atrasada, "más de 3 días sin tomar es atrasada");

  debe(fotoDelEquipo({ tipo: "dea", marca: "Zoll", modelo: "AED Plus", numero_serie: "X1", numero_inventario: "77" }).equipo_modelo === "AED Plus", "foto del equipo");
  debe(fichaEnTexto({ ...completa, numero_solicitud: "SOL-2026-00001" }).includes("Ubicación exacta: Box 3, primer piso"), "ficha en texto");

  if (fallos.length) { console.error("FALLOS:\n  " + fallos.join("\n  ")); return false; }
  console.log("solicitudesMonitor: autotest ok");
  return true;
}

if (typeof process !== "undefined" && process.argv?.[1]?.endsWith("solicitudesMonitor.js")) _selfCheck();
