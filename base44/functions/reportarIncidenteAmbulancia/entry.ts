import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { equipo_id, fecha, tipo_incidente, observaciones, usuario_nombre, ambulancia_operativa } = await req.json();

    // 1. Crear actividad de incidente
    const actividad = await base44.entities.Actividad.create({
      equipo_id,
      tipo: "incidente",
      fecha,
      tipo_incidente,
      observaciones,
      usuario_nombre,
      usuario_email: user.email,
      ambulancia_operativa: ambulancia_operativa !== false
    });

    // 2. Si la ambulancia NO está operativa, actualizar estado del equipo
    if (ambulancia_operativa === false) {
      await base44.entities.Equipo.update(equipo_id, { estado: "fuera_de_servicio" });

      // 3. Buscar todos los admins y enviar correo
      const usuarios = await base44.asServiceRole.entities.User.list();
      const admins = usuarios.filter(u => ['super_admin', 'admin', 'encargado_salud'].includes(u.role));

      const tipoLabel = { falla_mecanica: "Falla Mecánica", accidente: "Accidente", otros: "Otros" }[tipo_incidente] || tipo_incidente;

      // Obtener datos del equipo para el correo
      const equipos = await base44.asServiceRole.entities.Equipo.filter({ id: equipo_id });
      const equipo = equipos[0];
      const equipoNombre = equipo ? `${equipo.marca} ${equipo.modelo} (${equipo.numero_inventario}${equipo.patente ? ' - ' + equipo.patente : ''})` : equipo_id;

      const subject = `🚨 ALERTA: Ambulancia fuera de servicio — ${tipoLabel}`;
      const body = `
<h2 style="color:#DC2626;">⚠️ Alerta: Ambulancia Fuera de Servicio</h2>
<p>Se ha registrado un incidente que dejó la ambulancia <strong>fuera de servicio</strong>.</p>
<hr/>
<table style="border-collapse:collapse; width:100%;">
  <tr><td style="padding:8px; font-weight:bold; color:#64748B;">Equipo</td><td style="padding:8px;">${equipoNombre}</td></tr>
  <tr style="background:#F8FAFC;"><td style="padding:8px; font-weight:bold; color:#64748B;">Centro</td><td style="padding:8px;">${equipo?.centro_principal || '—'}${equipo?.subsede ? ' / ' + equipo.subsede : ''}</td></tr>
  <tr><td style="padding:8px; font-weight:bold; color:#64748B;">Tipo de Incidente</td><td style="padding:8px;">${tipoLabel}</td></tr>
  <tr style="background:#F8FAFC;"><td style="padding:8px; font-weight:bold; color:#64748B;">Fecha</td><td style="padding:8px;">${fecha}</td></tr>
  <tr><td style="padding:8px; font-weight:bold; color:#64748B;">Reportado por</td><td style="padding:8px;">${usuario_nombre || user.full_name || user.email}</td></tr>
  <tr style="background:#F8FAFC;"><td style="padding:8px; font-weight:bold; color:#64748B;">Descripción</td><td style="padding:8px;">${observaciones || 'Sin descripción'}</td></tr>
</table>
<br/>
<p style="color:#DC2626; font-weight:bold;">La ambulancia ha sido marcada como FUERA DE SERVICIO en el sistema.</p>
<p style="color:#64748B; font-size:12px;">Este mensaje fue generado automáticamente por el Sistema de Gestión de Equipos.</p>
      `.trim();

      for (const admin of admins) {
        if (admin.email) {
          await base44.asServiceRole.integrations.Core.SendEmail({
            to: admin.email,
            subject,
            body
          });
        }
      }
    }

    return Response.json({ success: true, actividad_id: actividad.id, correos_enviados: ambulancia_operativa === false });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});