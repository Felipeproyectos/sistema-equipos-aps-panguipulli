import { createClientFromRequest } from '#compat';
import { miTurnoActivo, MODO_MI_TURNO, MODO_PAUTAS } from '../compartido/turnoFlota.js';
import { prestamoVigente } from '../compartido/prestamoEquipo.js';

export default async function (req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } });
  }

  try {
    const base44 = createClientFromRequest(req, { allowUnauthenticated: true });

    const [equipos, configs, prestamos] = await Promise.all([
      base44.asServiceRole.entities.Equipo.list(),
      base44.asServiceRole.entities.AppConfig.list().catch(() => []),
      base44.asServiceRole.entities.PrestamoVehiculo.filter({ estado: 'vigente' }).catch(() => []),
    ]);

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
      estado: e.estado || "operativo",
      // Prestada: el centro que la tiene hoy, para que la encuentre al llenar la pauta.
      prestada_a: prestamoVigente(prestamos, e.id)?.centro_destino || ""
    }));

    // Con «Mi turno» apagado (26_modo_turno.sql) la tarjeta Turno Chofer de
    // la página pública muestra el formulario de siempre.
    const modo_turno = miTurnoActivo(configs[0]) ? MODO_MI_TURNO : MODO_PAUTAS;

    return Response.json({ equipos: result, modo_turno }, { headers: { 'Access-Control-Allow-Origin': '*' } });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } });
  }
}
