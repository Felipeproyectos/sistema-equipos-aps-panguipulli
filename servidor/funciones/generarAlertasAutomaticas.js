import { createClientFromRequest } from '#compat';
import { alertasQueCorresponden, planDeAlertas } from '../compartido/alertas.js';
import { hoyChile } from '../compartido/turnoFlota.js';

// Automatización programada (1 vez al día, 03:00 CL).
//
// Deja las alertas activas iguales a lo que dicen hoy las fechas cargadas en
// las fichas (src/lib/alertas.js): crea las que faltan, corrige el texto de
// las que cambiaron de fecha y CIERRA las que ya no corresponden.
//
// Antes solo creaba. Una alerta quedaba activa para siempre aunque la fecha se
// hubiera corregido, la «por vencer» seguía al lado de la «vencida», y la que
// alguien marcaba resuelta sin corregir la fecha reaparecía al día siguiente.
//
// Solo se tocan las automáticas. Las que escribe una persona en «Crear alerta»
// se resuelven a mano.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    // La dispara el reloj del servidor; a mano, solo Base del Sistema.
    if (user.role !== 'super_admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const db = base44.asServiceRole.entities;
    const [equipos, parches, activas, usuarios, prestamos] = await Promise.all([
      db.Equipo.list('-created_date', 1000),
      db.Parche.list('-created_date', 2000),
      db.Alerta.filter({ estado: 'activa' }, '-created_date', 1000),
      db.User.list('email', 1000),
      db.PrestamoVehiculo.filter({ estado: 'vigente' }, '-desde', 500).catch(() => []),
    ]);

    const hoy = hoyChile();
    const plan = planDeAlertas(alertasQueCorresponden({ equipos, parches, usuarios, prestamos, hoy }), activas);

    let creadas = 0;
    if (plan.crear.length) {
      // `automatica` existe desde 34_simplificar_flujo.sql. Si la migración
      // todavía no se ejecutó, se crean igual, sin la marca.
      const res = await db.Alerta.bulkCreate(plan.crear.map(a => ({ ...a, automatica: true }))).catch((e) => {
        if (!/automatica/.test(String(e?.message))) throw e;
        return db.Alerta.bulkCreate(plan.crear);
      });
      creadas = Array.isArray(res) ? res.length : plan.crear.length;
    }
    for (const a of plan.actualizar) await db.Alerta.update(a.id, a.cambios);
    for (const id of plan.cerrar) await db.Alerta.update(id, { estado: 'resuelta', fecha_resolucion: hoy });

    return Response.json({
      ok: true, generadas: creadas, actualizadas: plan.actualizar.length, cerradas: plan.cerrar.length,
      total_activas: activas.length + creadas - plan.cerrar.length,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
