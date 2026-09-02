import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { differenceInDays, parseISO } from 'npm:date-fns@3.6.0';

// Devuelve los datos consolidados del Monitor Corporativo en una sola llamada
// (en lugar de 9 round-trips cliente→servidor). Usa asServiceRole con límites.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const role = user.role;
    if (!['super_admin', 'admin', 'monitor_corporativo', 'jefe_taller'].includes(role)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const [equipos, parches, alertas, solicitudes, inspecciones, ordenes, repuestos, proveedores] = await Promise.all([
      base44.asServiceRole.entities.Equipo.list('-created_date', 500),
      base44.asServiceRole.entities.Parche.list('-created_date', 2000),
      base44.asServiceRole.entities.Alerta.filter({ estado: 'activa' }, '-created_date', 500),
      base44.asServiceRole.entities.Solicitud.filter({ estado: 'pendiente' }, '-created_date', 500),
      base44.asServiceRole.entities.InspeccionPendiente.filter({ estado: 'pendiente' }, '-created_date', 500),
      base44.asServiceRole.entities.OrdenTrabajo.list('-created_date', 300),
      base44.asServiceRole.entities.Repuesto.list('-created_date', 500),
      base44.asServiceRole.entities.Proveedor.list('-created_date', 200),
    ]);

    const activos = equipos.filter(e => e.activo !== false);
    const parchesActivos = parches.filter(p => p.activo !== false);

    return Response.json({
      equipos: activos,
      parches: parchesActivos,
      alertas,
      solicitudes,
      inspecciones,
      ordenes,
      repuestos,
      proveedores,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});