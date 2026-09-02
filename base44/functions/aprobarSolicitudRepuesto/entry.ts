import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const rolesAprobadores = ['super_admin', 'admin', 'jefe_taller', 'encargado_compras_taller'];
    if (!rolesAprobadores.includes(user.role)) {
      return Response.json({ error: 'No tienes permiso para aprobar solicitudes' }, { status: 403 });
    }

    const body = await req.json();
    const { solicitud_id, estado, comentario } = body;
    if (!solicitud_id) return Response.json({ error: 'solicitud_id es obligatorio' }, { status: 400 });
    if (!['aprobada', 'rechazada'].includes(estado)) {
      return Response.json({ error: 'estado inválido' }, { status: 400 });
    }

    // Cargar la solicitud
    let solicitud;
    try {
      solicitud = await base44.entities.SolicitudRepuesto.get(solicitud_id);
    } catch {
      return Response.json({ error: 'Solicitud no encontrada' }, { status: 404 });
    }
    if (!solicitud) return Response.json({ error: 'Solicitud no encontrada' }, { status: 404 });
    if (solicitud.estado !== 'pendiente') {
      return Response.json({ error: 'La solicitud ya fue resuelta' }, { status: 400 });
    }

    let deduccion = null;

    // Al aprobar, descontar automáticamente del inventario de repuestos.
    if (estado === 'aprobada') {
      const cantidad = Number(solicitud.cantidad) || 0;
      const nombreBuscado = (solicitud.repuesto_nombre || '').trim().toLowerCase();

      if (nombreBuscado && cantidad > 0) {
        // Buscar repuesto activo que coincida por nombre (exacto case-insensitive, luego contiene).
        const repuestos = await base44.entities.Repuesto.list('-updated_date', 500);
        const activos = repuestos.filter(r => r.activo !== false);
        let match = activos.find(r => (r.nombre || '').trim().toLowerCase() === nombreBuscado);
        if (!match) {
          match = activos.find(r => (r.nombre || '').trim().toLowerCase().includes(nombreBuscado) || nombreBuscado.includes((r.nombre || '').trim().toLowerCase()));
        }

        if (match) {
          const stockPrevio = Number(match.stock_actual) || 0;
          const nuevoStock = stockPrevio - cantidad;
          await base44.entities.Repuesto.update(match.id, {
            stock_actual: nuevoStock,
            ultimo_reposicion: match.ultimo_reposicion,
          });
          deduccion = {
            repuesto_id: match.id,
            repuesto_nombre: match.nombre,
            stock_previo: stockPrevio,
            cantidad_descontada: cantidad,
            nuevo_stock: nuevoStock,
            insuficiente: stockPrevio < cantidad,
          };
        } else {
          deduccion = { no_encontrado: true, repuesto_nombre: solicitud.repuesto_nombre };
        }
      }
    }

    // Actualizar la solicitud
    await base44.entities.SolicitudRepuesto.update(solicitud_id, {
      estado,
      aprobador_email: user.email,
      aprobador_nombre: user.full_name,
      fecha_aprobacion: new Date().toISOString().split('T')[0],
      comentario_aprobador: comentario || '',
    });

    return Response.json({
      ok: true,
      estado,
      deduccion,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});