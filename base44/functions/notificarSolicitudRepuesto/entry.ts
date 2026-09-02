import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    // La automatización de entidad envía { event, data }.
    const solicitud = body.data || body;
    const evento = body.event || {};
    const entityId = evento.entity_id || solicitud.id;

    if (!solicitud || !solicitud.repuesto_nombre) {
      return Response.json({ error: 'Payload sin datos de solicitud' }, { status: 400 });
    }

    // Verificar que la solicitud existe en la base de datos (protección contra
    // invocaciones arbitrarias externas: solo una solicitud real puede disparar correos).
    if (!entityId) {
      return Response.json({ error: 'ID de solicitud requerido' }, { status: 400 });
    }
    try {
      const sol = await base44.asServiceRole.entities.SolicitudRepuesto.get(entityId);
      if (!sol) return Response.json({ error: 'Solicitud no encontrada' }, { status: 404 });
    } catch (_) {
      return Response.json({ error: 'Solicitud no válida' }, { status: 404 });
    }

    // Obtener usuarios con rol Encargado de Compras de Taller
    const usuarios = await base44.asServiceRole.entities.User.list('-created_date', 200);
    const comprasTaller = usuarios.filter(u => u.role === 'encargado_compras_taller');

    if (comprasTaller.length === 0) {
      return Response.json({ ok: true, mensaje: 'No hay usuarios de Compras de Taller registrados' });
    }

    const numero = solicitud.numero_solicitud || 'S/N';
    const fecha = solicitud.fecha_solicitud || new Date().toISOString().split('T')[0];
    const solicitante = solicitud.solicitante_nombre || solicitud.solicitante_email || 'Jefe de Taller';
    const cantidad = solicitud.cantidad || 1;
    const categoria = solicitud.categoria || 'otros';
    const urgencia = solicitud.urgencia || 'media';
    const motivo = solicitud.motivo || '—';

    const asunto = `Nueva solicitud de repuesto ${numero} — ${urgencia.toUpperCase()}`;
    const cuerpo = `
Hola,

Se ha registrado una nueva solicitud de repuesto que requiere tu gestión como Encargado de Compras de Taller.

DETALLE DE LA SOLICITUD
- N°: ${numero}
- Repuesto: ${solicitud.repuesto_nombre}
- Cantidad: ${cantidad}
- Categoría: ${categoria}
- Urgencia: ${urgencia}
- Solicitante: ${solicitante}
- Fecha: ${fecha}
- Motivo / justificación: ${motivo}

Revisa y gestiona esta solicitud en el módulo "Aprobación Solicitudes" del sistema.

— Sistema de Gestión de Equipos · Corporación Municipal de Panguipulli
    `.trim();

    const resultados = [];
    for (const u of comprasTaller) {
      if (!u.email) continue;
      try {
        await base44.integrations.Core.SendEmail({
          to: u.email,
          subject: asunto,
          body: cuerpo,
          from_name: 'Taller — Solicitudes de Repuesto',
        });
        resultados.push({ email: u.email, ok: true });
      } catch (e) {
        resultados.push({ email: u.email, ok: false, error: e.message });
      }
    }

    return Response.json({ ok: true, notificados: resultados, solicitud_id: entityId });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});