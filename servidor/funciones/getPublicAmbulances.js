import { createClientFromRequest } from '#compat';

export default async function (req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } });
  }

  try {
    const base44 = createClientFromRequest(req, { allowUnauthenticated: true });

    const equipos = await base44.asServiceRole.entities.Equipo.list();

    const result = equipos.map(e => ({
      id: e.id,
      tipo: e.tipo,
      marca: e.marca,
      modelo: e.modelo,
      numero_serie: e.numero_serie || "",
      patente: e.patente || "",
      centro_principal: e.centro_principal,
      subsede: e.subsede || "",
      ubicacion_especifica: e.ubicacion_especifica || "",
      estado: e.estado || "operativo"
    }));

    return Response.json({ equipos: result }, { headers: { 'Access-Control-Allow-Origin': '*' } });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } });
  }
}
