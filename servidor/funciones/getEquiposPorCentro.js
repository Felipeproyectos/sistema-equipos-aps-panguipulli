import { createClientFromRequest } from '#compat';
import { prestamoVigente, esPrestable } from '../compartido/prestamoEquipo.js';

// Devuelve equipos + parches con scoping por rol/centro, filtrando EN LA CONSULTA
// (no cargando todo y filtrando en memoria). Reduce drásticamente el payload
// para roles de salud y taller.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const role = user.role;
    const centrosPermitidos = Array.from(new Set([
      ...(user.centro_principal ? [user.centro_principal] : []),
      ...(Array.isArray(user.centros_asignados) ? user.centros_asignados : [])
    ].filter(Boolean)));

    let equipos = [];

    if (role === 'super_admin' || role === 'admin' || role === 'monitor_corporativo') {
      equipos = await base44.asServiceRole.entities.Equipo.list('-created_date', 500);
    } else if (role === 'encargado_movilizacion') {
      // Movilizacion administra la flota completa, de todos los centros: una
      // camioneta se mueve entre centros y el Encargado tiene que verla igual.
      // Se acota por TIPO, no por centro: los DEA y los monitores no son
      // asunto suyo. La ambulancia si, porque tambien es un vehiculo — la ve,
      // aunque su ficha la edite Calidad (ver migracion/13_flota.sql).
      equipos = await base44.asServiceRole.entities.Equipo.filter(
        { tipo: { $in: ['ambulancia', 'camioneta', 'furgon', 'camion_3_4'] } }, '-created_date', 500
      );
    } else if (role === 'jefe_taller' || role === 'mecanico' || role === 'encargado_compras_taller') {
      // Taller: solo ambulancias
      equipos = await base44.asServiceRole.entities.Equipo.filter({ tipo: 'ambulancia' }, '-created_date', 500);
    } else if (role === 'encargado_salud' || role === 'encargado_compras_salud' || role === 'user') {
      // Salud: filtrar por centros permitidos en la consulta
      if (centrosPermitidos.length > 0) {
        const porCentro = await base44.asServiceRole.entities.Equipo.filter(
          { centro_principal: { $in: centrosPermitidos } }, '-created_date', 500
        );
        // Equipos explícitamente asignados al email del usuario (puede estar en otro centro)
        const todosActivos = await base44.asServiceRole.entities.Equipo.list('-created_date', 1000);
        const porEmail = todosActivos.filter(e => (e.usuarios_asignados || []).includes(user.email));
        // Unir sin duplicar
        const vistos = new Set(porCentro.map(e => e.id));
        equipos = [...porCentro, ...porEmail.filter(e => !vistos.has(e.id))];
      } else {
        equipos = [];
      }
    } else {
      equipos = await base44.asServiceRole.entities.Equipo.list('-created_date', 500);
      equipos = equipos.filter(e => (e.usuarios_asignados || []).includes(user.email));
    }

    // Préstamos vigentes (src/lib/prestamoEquipo.js). Una ambulancia prestada
    // aparece también en el centro que la tiene, para que le aplique sus
    // pautas; y cada equipo prestado lleva su préstamo, para mostrarlo.
    const prestamos = await base44.asServiceRole.entities.PrestamoVehiculo
      .filter({ estado: 'vigente' }, '-desde', 500).catch(() => []);
    if (['encargado_salud', 'encargado_compras_salud', 'user'].includes(role) && centrosPermitidos.length) {
      const vistos = new Set(equipos.map(e => e.id));
      const recibidas = [...new Set(prestamos
        .filter(p => centrosPermitidos.includes(p.centro_destino) && !vistos.has(p.equipo_id))
        .map(p => p.equipo_id))];
      if (recibidas.length) {
        const extra = await base44.asServiceRole.entities.Equipo.filter({ id: { $in: recibidas } }, '-created_date', 200);
        equipos = [...equipos, ...extra.filter(esPrestable)];
      }
    }
    equipos = equipos.map(e => {
      const p = prestamoVigente(prestamos, e.id);
      return p ? { ...e, prestamo: {
        id: p.id, centro_origen: p.centro_origen || '', centro_destino: p.centro_destino || '',
        centro_costo: p.centro_costo || '', desde: p.desde || '', hasta_previsto: p.hasta_previsto || '',
        motivo: p.motivo || '', estado: p.estado || 'vigente',
      } } : e;
    });

    const activos = equipos.filter(e => e.activo !== false);
    const ids = new Set(activos.map(e => e.id));

    // Parches: solo de los equipos permitidos
    let parches = [];
    if (activos.length > 0) {
      const idArray = Array.from(ids);
      parches = await base44.asServiceRole.entities.Parche.filter(
        { equipo_id: { $in: idArray } }, '-created_date', 2000
      );
      parches = parches.filter(p => p.activo !== false);
    }

    return Response.json({ equipos: activos, parches });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
