import { createClientFromRequest } from '#compat';

// Borra los datos de prueba (migraciones 19 y 22) desde la aplicación, sin
// tener que abrir el SQL Editor de Supabase. Solo Base del Sistema.
//
// Qué es "de prueba": filas con `is_sample = true` Y cuyo id empieza con
// `pba-`. Las dos condiciones a la vez, a propósito: lo que venía marcado como
// ejemplo desde Base44 también tiene is_sample, y eso no es de estas pruebas.
//
// Además se lleva lo que existe solo por esas filas: los comentarios de las
// órdenes de prueba y las alertas de licencia o vencimiento de los choferes y
// vehículos de prueba. La auditoría NO se toca: registra lo que pasó, también
// con los datos de prueba.
//
// Las solicitudes de repuesto que apunten a una orden de prueba no se borran:
// pueden haber movido stock o tener una compra detrás. Se informan.
//
// Acciones:
//   contar → cuántas filas se borrarían, por tabla (no cambia nada)
//   borrar → las borra y devuelve lo mismo

// En orden: primero lo que apunta a otras filas, al final lo apuntado.
const ENTIDADES = [
  ['BitacoraFlota', 'salidas de bitácora'],
  ['AsignacionChofer', 'asignaciones'],
  ['PrestamoVehiculo', 'préstamos'],
  ['OrdenTrabajo', 'órdenes de trabajo'],
  ['Solicitud', 'solicitudes'],
  ['Equipo', 'vehículos'],
  ['User', 'choferes'],
];

const esDePrueba = (fila) => typeof fila?.id === 'string' && fila.id.startsWith('pba-');

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'super_admin' || user.id === 'sistema') {
      return Response.json({ error: 'Solo Base del Sistema puede borrar los datos de prueba' }, { status: 403 });
    }

    const { accion = 'contar' } = await req.json().catch(() => ({}));
    if (!['contar', 'borrar'].includes(accion)) {
      return Response.json({ error: 'accion debe ser contar o borrar' }, { status: 400 });
    }
    const db = base44.asServiceRole.entities;

    // 1. Qué hay
    const porEntidad = {};
    for (const [nombre] of ENTIDADES) {
      const filas = await db[nombre].filter({ is_sample: true }, null, 5000);
      porEntidad[nombre] = filas.filter(esDePrueba);
    }
    const idsOT = porEntidad.OrdenTrabajo.map(o => o.id);
    const idsEquipo = porEntidad.Equipo.map(e => e.id);
    const idsChofer = porEntidad.User.map(u => u.id);

    const comentarios = idsOT.length ? await db.Comentario.filter({ orden_trabajo_id: { $in: idsOT } }, null, 5000) : [];
    const alertas = [...new Map([
      ...(idsEquipo.length ? await db.Alerta.filter({ equipo_id: { $in: idsEquipo } }, null, 5000) : []),
      ...(idsChofer.length ? await db.Alerta.filter({ chofer_id: { $in: idsChofer } }, null, 5000).catch(() => []) : []),
    ].map(a => [a.id, a])).values()];
    const repuestos = idsOT.length
      ? await db.SolicitudRepuesto.filter({ orden_trabajo_id: { $in: idsOT } }, null, 1000).catch(() => [])
      : [];

    const resumen = [
      { que: 'comentarios de órdenes de prueba', cuantos: comentarios.length },
      { que: 'alertas de vehículos y choferes de prueba', cuantos: alertas.length },
      ...ENTIDADES.map(([nombre, que]) => ({ que, cuantos: porEntidad[nombre].length })),
    ];
    const total = resumen.reduce((s, r) => s + r.cuantos, 0);

    if (accion === 'contar') {
      return Response.json({ ok: true, total, resumen, repuestosQueQuedan: repuestos.length });
    }

    // 2. Borrar, en orden
    const fallidos = [];
    const borrar = async (entidad, filas) => {
      for (const f of filas) {
        try { await db[entidad].delete(f.id); } catch (e) { fallidos.push(`${entidad} ${f.id}: ${e.message}`); }
      }
    };
    await borrar('Comentario', comentarios);
    await borrar('Alerta', alertas);
    for (const [nombre] of ENTIDADES) await borrar(nombre, porEntidad[nombre]);

    return Response.json({
      ok: fallidos.length === 0,
      total: total - fallidos.length,
      resumen,
      repuestosQueQuedan: repuestos.length,
      fallidos,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
