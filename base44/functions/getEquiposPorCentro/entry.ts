import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// Devuelve equipos + parches con scoping por rol/centro, filtrando EN LA CONSULTA
// (no cargando todo y filtrando en memoria). Reduce drásticamente el payload
// para roles de salud y taller.
Deno.serve(async (req) => {
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
});