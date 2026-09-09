// Registro de auditoria. Antes vivia en servidor/funciones/registrarHistorial.js,
// disparado por los webhooks de Base44; al migrar a Supabase esos disparadores
// dejaron de existir y la tabla `historial` quedo vacia — la pantalla de
// Auditoria leia una tabla que nadie escribia.
//
// Ahora se registra desde el unico punto por donde pasan las ~214 llamadas de
// la app: el Proxy de src/api/base44Client.js. Una sola vez, no pantalla por
// pantalla.

const NOMBRES = {
  Equipo: "Equipo", Parche: "Parche", SolicitudStock: "Solicitud de Stock",
  HistorialMantenimiento: "Mantenimiento", Centro: "Centro de Salud",
  ConfigAlerta: "Config. Alerta", Repuesto: "Repuesto", OrdenTrabajo: "Orden de Trabajo",
  Proveedor: "Proveedor", User: "Usuario", Actividad: "Actividad", Kilometraje: "Kilometraje",
  InspeccionPendiente: "Inspección", Alerta: "Alerta", ConsumoRepuesto: "Consumo de Repuesto",
  OrdenDeCompra: "Orden de Compra", InvitacionPendiente: "Invitación",
  SolicitudRepuesto: "Solicitud de Repuesto", SolicitudRepuestoSalud: "Solicitud de Insumo Médico",
  Comentario: "Comentario", AppConfig: "Configuración", Solicitud: "Solicitud",
};

// Lo que identifica una fila a ojo humano, en orden de preferencia.
const ETIQUETA = [
  "numero_ot", "numero_oc", "numero_inventario", "nombre", "full_name", "email",
  "titulo", "equipo_label", "repuesto_nombre", "descripcion", "tipo_formulario", "codigo",
];

function etiquetaDe(datos) {
  if (!datos || typeof datos !== "object") return "";
  for (const campo of ETIQUETA) {
    if (datos[campo]) return String(datos[campo]).slice(0, 80);
  }
  return "";
}

const VERBOS = { create: "creó", update: "editó", delete: "eliminó" };
const ACCIONES = { create: "crear", update: "editar", delete: "eliminar" };

// Nunca se auditan las propias tablas de auditoria: se llenarian solas.
const SIN_AUDITAR = new Set(["Historial", "AccesoNoAutorizado"]);

export function debeAuditarse(entidad) {
  return !SIN_AUDITAR.has(String(entidad));
}

// `args` son los argumentos originales del metodo:
//   create(obj) | update(id, cambios) | delete(id)
// `resultado` es lo que devolvio la llamada (create/update devuelven la fila).
export function describir(entidad, metodo, args, resultado) {
  const nombre = NOMBRES[entidad] || entidad;
  const verbo = VERBOS[metodo] || metodo;
  const datos = metodo === "create" ? args[0] : metodo === "update" ? args[1] : null;
  const etiqueta = etiquetaDe(resultado) || etiquetaDe(datos);
  const id = metodo === "create" ? resultado?.id : args[0];

  let descripcion = `${verbo.charAt(0).toUpperCase() + verbo.slice(1)} ${nombre}`;
  if (etiqueta) descripcion += `: ${etiqueta}`;
  if (metodo === "update" && datos) {
    const campos = Object.keys(datos).filter((c) => c !== "id").slice(0, 6);
    if (campos.length) descripcion += ` — campos: ${campos.join(", ")}`;
  }

  return {
    accion: ACCIONES[metodo] || metodo,
    entidad,
    entidad_id: id ? String(id) : "",
    descripcion,
    datos_anteriores: datos ? JSON.stringify(datos).slice(0, 4000) : "",
  };
}

// ponytail: solo un self-check, no una suite. Si describir() se rompe, la
// auditoria queda con filas ilegibles y nadie se entera hasta el mes siguiente.
export function _selfCheck() {
  const a = describir("OrdenTrabajo", "create", [{ numero_ot: "OT-12" }], { id: "x1", numero_ot: "OT-12" });
  console.assert(a.accion === "crear" && a.entidad_id === "x1" && a.descripcion.includes("OT-12"), "create", a);
  const b = describir("Equipo", "update", ["e9", { marca: "Zoll", modelo: "X" }], { id: "e9", numero_inventario: "INV-7" });
  console.assert(b.accion === "editar" && b.entidad_id === "e9" && b.descripcion.includes("INV-7") && b.descripcion.includes("marca"), "update", b);
  const c = describir("Repuesto", "delete", ["r3"], undefined);
  console.assert(c.accion === "eliminar" && c.entidad_id === "r3", "delete", c);
  console.assert(!debeAuditarse("Historial") && debeAuditarse("Equipo"), "filtro");
  return true;
}
