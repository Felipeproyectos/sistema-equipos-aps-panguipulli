import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const TALLER_ROLES = ['jefe_taller', 'encargado_compras_taller', 'mecanico'];
const SALUD_ROLES = ['admin', 'encargado_salud', 'encargado_compras_salud', 'user'];
const ADMIN_AREA_ROLES = ['super_admin', 'admin', 'monitor_corporativo'];

function esRolTaller(role) { return TALLER_ROLES.includes(role); }
function esRolSalud(role) { return SALUD_ROLES.includes(role); }

function getCentros(u) {
  const arr = Array.isArray(u.centros_asignados) ? u.centros_asignados : [];
  const legacy = u.centro_asignado ? [u.centro_asignado] : [];
  const principal = u.centro_principal ? [u.centro_principal] : [];
  return [...new Set([...principal, ...arr, ...legacy])].filter(Boolean);
}

function deriveArea(u) {
  if (u.area === 'salud') return 'salud';
  if (u.area === 'taller') return 'taller';
  if (u.area === 'admin') return 'admin';
  if (esRolTaller(u.role)) return 'taller';
  if (ADMIN_AREA_ROLES.includes(u.role)) return 'admin';
  if (esRolSalud(u.role)) return 'salud';
  return 'salud';
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const all = await base44.asServiceRole.entities.User.list();

    let permitidos;
    const role = me.role;
    if (role === 'super_admin') {
      permitidos = all;
    } else if (role === 'admin') {
      permitidos = all.filter(u => deriveArea(u) !== 'taller');
    } else if (role === 'encargado_salud') {
      const cp = me.centro_principal;
      permitidos = cp ? all.filter(u => deriveArea(u) === 'salud' && getCentros(u).includes(cp)) : [];
    } else if (role === 'jefe_taller') {
      permitidos = all.filter(u => deriveArea(u) === 'taller');
    } else {
      permitidos = [];
    }

    return Response.json(permitidos);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});