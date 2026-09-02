import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } });
  }

  try {
    const base44 = createClientFromRequest(req, { allowUnauthenticated: true });
    const body = await req.json();

    const { equipo_id, conductor, fecha, km_inicial, valor_km, observaciones } = body;

    if (!equipo_id || !conductor || !fecha || km_inicial === undefined) {
      return Response.json({ error: "Faltan campos obligatorios" }, { status: 400 });
    }

    const kmInicial = Number(km_inicial);

    // Validar que el equipo existe antes de modificar o crear registros.
    let equipo;
    try {
      equipo = await base44.asServiceRole.entities.Equipo.get(equipo_id);
    } catch (_) {
      return Response.json({ error: "Equipo no encontrado" }, { status: 404, headers: { 'Access-Control-Allow-Origin': '*' } });
    }
    if (!equipo) {
      return Response.json({ error: "Equipo no encontrado" }, { status: 404, headers: { 'Access-Control-Allow-Origin': '*' } });
    }

    // Cerrar turnos activos (sin km_final) de la misma ambulancia
    const registros = await base44.asServiceRole.entities.Kilometraje.filter({ equipo_id });
    const activos = registros.filter(r => !r.km_final && r.km_final !== 0);

    for (const turno of activos) {
      await base44.asServiceRole.entities.Kilometraje.update(turno.id, {
        km_final: kmInicial,
        valor_km: kmInicial - (turno.km_inicial || 0)
      });
    }

    // Crear nuevo registro
    await base44.asServiceRole.entities.Kilometraje.create({
      equipo_id,
      conductor,
      fecha,
      km_inicial: kmInicial,
      valor_km: Number(valor_km || km_inicial),
      observaciones: observaciones || ""
    });

    return Response.json({ ok: true }, { headers: { 'Access-Control-Allow-Origin': '*' } });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } });
  }
});