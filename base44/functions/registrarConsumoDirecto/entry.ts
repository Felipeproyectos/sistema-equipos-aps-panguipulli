import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const rolesPermitidos = ['super_admin', 'admin', 'jefe_taller', 'encargado_compras_taller'];
    if (!rolesPermitidos.includes(user.role)) {
      return Response.json({ error: 'No tienes permiso para registrar consumo directo' }, { status: 403 });
    }

    const body = await req.json();
    const {
      repuesto_id, cantidad, tipo_vehiculo,
      equipo_id, equipo_label, patente, marca_modelo, observaciones,
    } = body;

    if (!repuesto_id) return Response.json({ error: 'repuesto_id es obligatorio' }, { status: 400 });
    const cant = Number(cantidad) || 0;
    if (cant <= 0) return Response.json({ error: 'La cantidad debe ser mayor a 0' }, { status: 400 });
    if (!['corporativo', 'externo'].includes(tipo_vehiculo)) {
      return Response.json({ error: 'tipo_vehiculo inválido' }, { status: 400 });
    }
    if (tipo_vehiculo === 'corporativo' && !equipo_id) {
      return Response.json({ error: 'Debes seleccionar un vehículo corporativo' }, { status: 400 });
    }
    if (tipo_vehiculo === 'externo' && !patente && !marca_modelo) {
      return Response.json({ error: 'Indica patente o marca/modelo del vehículo externo' }, { status: 400 });
    }

    // Cargar repuesto
    let repuesto;
    try {
      repuesto = await base44.entities.Repuesto.get(repuesto_id);
    } catch {
      return Response.json({ error: 'Repuesto no encontrado' }, { status: 404 });
    }

    const stockPrevio = Number(repuesto.stock_actual) || 0;
    if (stockPrevio < cant) {
      return Response.json({ error: `Stock insuficiente. Solo hay ${stockPrevio} unidades disponibles.` }, { status: 400 });
    }

    const nuevoStock = stockPrevio - cant;
    const precioUnit = Number(repuesto.precio_unitario) || 0;

    // Descontar stock
    await base44.entities.Repuesto.update(repuesto_id, {
      stock_actual: nuevoStock,
    });

    // Construir label del vehículo
    let labelVehiculo = equipo_label || '';
    if (tipo_vehiculo === 'externo') {
      const partes = [marca_modelo, patente].filter(Boolean);
      labelVehiculo = partes.join(' · ') + ' (externo)';
    }

    // Registrar el consumo
    const consumo = await base44.entities.ConsumoRepuesto.create({
      repuesto_id,
      repuesto_nombre: repuesto.nombre,
      cantidad: cant,
      precio_unitario: precioUnit,
      subtotal: precioUnit * cant,
      tipo_vehiculo,
      equipo_id: tipo_vehiculo === 'corporativo' ? equipo_id : '',
      equipo_label: labelVehiculo,
      patente: patente || (tipo_vehiculo === 'corporativo' ? (repuesto.patente || '') : ''),
      marca_modelo: marca_modelo || '',
      consumido_por_email: user.email,
      consumido_por_nombre: user.full_name,
      fecha: new Date().toISOString().split('T')[0],
      observaciones: observaciones || '',
      origen: 'consumo_directo',
    });

    return Response.json({
      ok: true,
      consumo_id: consumo.id,
      repuesto_nombre: repuesto.nombre,
      cantidad: cant,
      stock_previo: stockPrevio,
      nuevo_stock: nuevoStock,
      vehiculo: labelVehiculo,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});