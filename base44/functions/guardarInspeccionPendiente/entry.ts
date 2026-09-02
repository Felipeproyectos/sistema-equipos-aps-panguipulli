import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } });
  }

  try {
    const base44 = createClientFromRequest(req, { allowUnauthenticated: true });
    const data = await req.json();

    if (!data.equipo_id || !data.fecha || !data.tipo_formulario) {
      return Response.json({ error: 'Faltan campos obligatorios' }, { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } });
    }

    // Buscar el equipo para obtener sus datos completos
    let equipo;
    try {
      equipo = await base44.asServiceRole.entities.Equipo.get(data.equipo_id);
    } catch (_) {
      return Response.json({ error: 'Equipo no encontrado' }, { status: 404, headers: { 'Access-Control-Allow-Origin': '*' } });
    }
    if (!equipo) {
      return Response.json({ error: 'Equipo no encontrado' }, { status: 404, headers: { 'Access-Control-Allow-Origin': '*' } });
    }

    const registro = await base44.asServiceRole.entities.InspeccionPendiente.create({
      tipo_formulario: data.tipo_formulario,
      equipo_id: data.equipo_id,
      equipo_label: data.equipo_label || (equipo ? equipo.marca + ' ' + equipo.modelo : data.equipo_id),
      conductor: data.conductor || '',
      fecha: data.fecha,
      km_inicial: data.km_inicial || undefined,
      combustible: data.combustible || undefined,
      observaciones: data.observaciones || '',
      datos_json: JSON.stringify({
        equipo: equipo ? {
          marca: equipo.marca,
          modelo: equipo.modelo,
          tipo: equipo.tipo,
          patente: equipo.patente,
          centro_principal: equipo.centro_principal,
          subsede: equipo.subsede,
          numero_inventario: equipo.numero_inventario,
        } : null,
        conductor: data.conductor,
        fecha: data.fecha,
        hora_registro: new Date().toISOString(),
        km_inicial: data.km_inicial,
        combustible: data.combustible,
        luces: data.luces || null,
        motor: data.motor || null,
        accesorios: data.accesorios || null,
        documentos: data.documentos || null,
        danos: data.danos || null,
        momento: data.momento || null,
        exterior: data.exterior || null,
        interior: data.interior || null,
        equipo_medico: data.equipo_medico || null,
        accesorios_diaria: data.accesorios_diaria || null,
        saneamiento: data.saneamiento || null,
        documentacion: data.documentacion || null,
        problemasDetectados: data.problemasDetectados || null,
        accionesTomadas: data.accionesTomadas || null,
        checklist: data.checklist || null,
        parches: data.parches || null,
        descripcion: data.descripcion || null,
      }),
      estado: 'pendiente',
    });

    return Response.json({ ok: true, id: registro.id }, { headers: { 'Access-Control-Allow-Origin': '*' } });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } });
  }
});