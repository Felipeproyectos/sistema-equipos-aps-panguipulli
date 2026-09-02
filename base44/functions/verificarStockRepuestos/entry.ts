import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Obtener todos los repuestos
    const repuestos = await base44.asServiceRole.entities.Repuesto.list();

    // Filtrar los que tienen stock bajo (stock_actual <= stock_minimo y stock_minimo > 0)
    const stockBajo = repuestos.filter(r =>
      (r.stock_actual || 0) <= (r.stock_minimo || 0) && (r.stock_minimo || 0) > 0
    );

    if (stockBajo.length === 0) {
      return Response.json({ status: 'ok', mensaje: 'No hay repuestos con stock bajo', alertados: 0 });
    }

    // Obtener usuarios a notificar (admin, super_admin, jefe_taller)
    const usuarios = await base44.asServiceRole.entities.User.list();
    const destinatarios = usuarios
      .filter(u => ['super_admin', 'jefe_taller', 'encargado_compras_taller'].includes(u.role))
      .map(u => u.email)
      .filter(Boolean);

    if (destinatarios.length === 0) {
      return Response.json({ status: 'ok', mensaje: 'Sin destinatarios para notificar', alertados: stockBajo.length });
    }

    // Construir el cuerpo del email
    const filas = stockBajo.map(r => `
      <tr>
        <td style="padding:8px;border:1px solid #e2e8f0">${r.nombre || '—'}</td>
        <td style="padding:8px;border:1px solid #e2e8f0;text-align:center">${r.codigo || '—'}</td>
        <td style="padding:8px;border:1px solid #e2e8f0;text-align:center">${r.stock_actual || 0}</td>
        <td style="padding:8px;border:1px solid #e2e8f0;text-align:center">${r.stock_minimo || 0}</td>
        <td style="padding:8px;border:1px solid #e2e8f0">${r.proveedor_nombre || '—'}</td>
        <td style="padding:8px;border:1px solid #e2e8f0">${r.ubicacion_bodega || '—'}</td>
      </tr>
    `).join('');

    const cuerpo = `
      <h2 style="color:#dc2626">⚠️ Alerta de Stock Bajo - Repuestos</h2>
      <p>Se han detectado <strong>${stockBajo.length}</strong> repuesto(s) con stock por debajo del mínimo establecido.</p>
      <table style="border-collapse:collapse;width:100%;font-size:13px">
        <thead>
          <tr style="background:#fef2f2">
            <th style="padding:8px;border:1px solid #e2e8f0;text-align:left">Repuesto</th>
            <th style="padding:8px;border:1px solid #e2e8f0">Código</th>
            <th style="padding:8px;border:1px solid #e2e8f0">Stock Actual</th>
            <th style="padding:8px;border:1px solid #e2e8f0">Stock Mínimo</th>
            <th style="padding:8px;border:1px solid #e2e8f0">Proveedor</th>
            <th style="padding:8px;border:1px solid #e2e8f0">Ubicación</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>
      <p style="margin-top:16px;color:#64748b;font-size:12px">
        Este es un reporte automático del Sistema de Gestión de la Corporación Municipal de Panguipulli.
      </p>
    `;

    // Enviar a cada destinatario
    const resultados = [];
    for (const email of destinatarios) {
      try {
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: email,
          subject: `⚠️ Alerta Stock Bajo: ${stockBajo.length} repuesto(s) requieren reposición`,
          body: cuerpo,
          from_name: 'Sistema de Gestión - Taller'
        });
        resultados.push({ email, ok: true });
      } catch (e) {
        resultados.push({ email, ok: false, error: e.message });
      }
    }

    return Response.json({
      status: 'ok',
      alertados: stockBajo.length,
      notificados: resultados
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});