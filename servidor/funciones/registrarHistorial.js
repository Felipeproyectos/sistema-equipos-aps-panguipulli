import { createClientFromRequest } from '#compat';

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    const { event, data, old_data } = body;
    if (!event) return Response.json({ ok: true, skipped: true });

    const entityName = event.entity_name;
    const eventType = event.type;

    // Mapeo de nombres legibles
    const NOMBRES = {
      Equipo: "Equipo",
      Parche: "Parche",
      SolicitudStock: "Solicitud de Stock",
      HistorialMantenimiento: "Mantenimiento",
      Centro: "Centro de Salud",
      ConfigAlerta: "Config. Alerta",
      Repuesto: "Repuesto",
      OrdenTrabajo: "Orden de Trabajo",
      Proveedor: "Proveedor",
      User: "Usuario",
      Actividad: "Actividad",
      Kilometraje: "Kilometraje",
      InspeccionPendiente: "Inspección",
      Alerta: "Alerta",
      ConsumoRepuesto: "Consumo de Repuesto",
      OrdenDeCompra: "Orden de Compra",
      InvitacionPendiente: "Invitación",
      SolicitudRepuesto: "Solicitud de Repuesto",
      SolicitudRepuestoSalud: "Solicitud de Insumo Médico",
    };

    const ACCIONES = { create: "crear", update: "editar", delete: "eliminar" };
    const accion = ACCIONES[eventType] || eventType;
    const entidadLabel = NOMBRES[entityName] || entityName;

    // Generar descripción según entidad
    let descripcion = `${accion.charAt(0).toUpperCase() + accion.slice(1)} ${entidadLabel}`;
    if (data) {
      if (entityName === "Parche") {
        descripcion = `${accion === "crear" ? "Agregó" : accion === "editar" ? "Editó" : "Eliminó"} parche tipo ${data.tipo || "—"} para equipo ID ${data.equipo_id || "—"}`;
      } else if (entityName === "SolicitudStock") {
        descripcion = `${accion === "crear" ? "Creó" : accion === "editar" ? "Actualizó" : "Eliminó"} solicitud de ${data.tipo_solicitud || "—"} — Estado: ${data.estado || "—"}`;
      } else if (entityName === "HistorialMantenimiento") {
        descripcion = `${accion === "crear" ? "Registró" : accion === "editar" ? "Editó" : "Eliminó"} mantenimiento tipo ${data.tipo_mantenimiento || "—"} para equipo ID ${data.equipo_id || "—"}`;
      } else if (entityName === "Centro") {
        descripcion = `${accion === "crear" ? "Creó" : accion === "editar" ? "Editó" : "Eliminó"} centro: ${data.nombre || "—"}`;
      } else if (entityName === "Equipo") {
        descripcion = `${accion === "crear" ? "Registró" : accion === "editar" ? "Editó" : "Eliminó"} equipo: ${data.marca || ""} ${data.modelo || ""} (Inv. ${data.numero_inventario || "—"}) en ${data.centro_principal || "—"}`;
      } else if (entityName === "Repuesto") {
        descripcion = `${accion === "crear" ? "Registró" : accion === "editar" ? "Editó" : "Eliminó"} repuesto: ${data.nombre || "—"} (código ${data.codigo || "—"})`;
      } else if (entityName === "OrdenTrabajo") {
        descripcion = `${accion === "crear" ? "Creó" : accion === "editar" ? "Editó" : "Eliminó"} orden de trabajo ${data.numero_ot || "—"} — ${data.equipo_label || "—"}`;
      } else if (entityName === "Proveedor") {
        descripcion = `${accion === "crear" ? "Registró" : accion === "editar" ? "Editó" : "Eliminó"} proveedor: ${data.nombre || "—"} (${data.rubro || "—"})`;
      } else if (entityName === "User") {
        descripcion = `${accion === "crear" ? "Creó" : accion === "editar" ? "Editó" : "Eliminó"} usuario: ${data.email || data.full_name || "—"} — rol: ${data.role || "—"}`;
      } else if (entityName === "Actividad") {
        descripcion = `${accion === "crear" ? "Registró" : accion === "editar" ? "Editó" : "Eliminó"} actividad: ${data.tipo || "—"} en equipo ID ${data.equipo_id || "—"}`;
      } else if (entityName === "Kilometraje") {
        descripcion = `${accion === "crear" ? "Registró" : accion === "editar" ? "Editó" : "Eliminó"} kilometraje: ${data.valor_km ?? "—"} km — conductor: ${data.conductor || "—"}`;
      } else if (entityName === "InspeccionPendiente") {
        descripcion = `${accion === "crear" ? "Envió" : accion === "editar" ? "Editó" : "Eliminó"} inspección: ${data.tipo_formulario || "—"} — equipo: ${data.equipo_label || "—"}`;
      } else if (entityName === "Alerta") {
        descripcion = `${accion === "crear" ? "Generó" : accion === "editar" ? "Actualizó" : "Eliminó"} alerta: ${data.tipo || "—"} — ${data.descripcion || ""}`;
      } else if (entityName === "ConsumoRepuesto") {
        descripcion = `${accion === "crear" ? "Registró" : accion === "editar" ? "Editó" : "Eliminó"} consumo de repuesto: ${data.repuesto_nombre || "—"} (cant. ${data.cantidad ?? "—"})`;
      } else if (entityName === "OrdenDeCompra") {
        descripcion = `${accion === "crear" ? "Creó" : accion === "editar" ? "Editó" : "Eliminó"} orden de compra ${data.numero_oc || "—"} — proveedor: ${data.proveedor_nombre || "—"}`;
      } else if (entityName === "InvitacionPendiente") {
        descripcion = `${accion === "crear" ? "Invitó" : accion === "editar" ? "Editó" : "Eliminó"} invitación para: ${data.email || "—"} — rol: ${data.rol_asignado || "—"}`;
      } else if (entityName === "SolicitudRepuesto") {
        descripcion = `${accion === "crear" ? "Creó" : accion === "editar" ? "Actualizó" : "Eliminó"} solicitud de repuesto: ${data.repuesto_nombre || "—"} — Estado: ${data.estado || "—"}`;
      } else if (entityName === "SolicitudRepuestoSalud") {
        descripcion = `${accion === "crear" ? "Creó" : accion === "editar" ? "Actualizó" : "Eliminó"} solicitud de insumo médico: ${data.repuesto_nombre || "—"} — Estado: ${data.estado || "—"}`;
      }
    }

    // Obtener usuario que hizo la acción
    let usuario_email = data?.created_by || old_data?.created_by || "sistema";
    let usuario_nombre = "";

    let usuario_rol = "";
    try {
      const users = await base44.asServiceRole.entities.User.list();
      const u = users.find(x => x.email === usuario_email);
      if (u) {
        usuario_nombre = u.full_name || "";
        usuario_rol = u.role || "";
      }
    } catch (_) {}

    await base44.asServiceRole.entities.Historial.create({
      usuario_email,
      usuario_nombre,
      usuario_rol,
      accion,
      entidad: entityName,
      entidad_id: event.entity_id || "",
      descripcion,
      datos_anteriores: old_data ? JSON.stringify(old_data) : "",
    });

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
