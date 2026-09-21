import { createClientFromRequest } from '#compat';
import { differenceInDays, parseISO } from 'date-fns';

// Automatización programada (1 vez al día, 03:00 CL).
// Genera alertas de vencimiento de parches y baterías de forma centralizada,
// con deduplicación server-side y bulkCreate. Reemplaza la generación
// client-side que disparaba writes por cada usuario que abría AlertasV2.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const [equipos, parches, alertasActivas, usuarios, prestamos] = await Promise.all([
      base44.asServiceRole.entities.Equipo.list('-created_date', 1000),
      base44.asServiceRole.entities.Parche.list('-created_date', 2000),
      base44.asServiceRole.entities.Alerta.filter({ estado: 'activa' }, '-created_date', 1000),
      base44.asServiceRole.entities.User.list('email', 1000),
      base44.asServiceRole.entities.PrestamoVehiculo.filter({ estado: 'vigente' }, '-desde', 500)
        .catch(() => []),
    ]);

    const hoy = new Date();
    // Índice de alertas activas para deduplicación O(1)
    const existentes = new Set(
      alertasActivas.map(a => `${a.equipo_id}|${a.tipo}`)
    );
    // Las alertas de licencia cuelgan de una persona, no de un equipo, asi que
    // se deduplican por su propia clave.
    const existentesChofer = new Set(
      alertasActivas.filter(a => a.chofer_id).map(a => `${a.chofer_id}|${a.tipo}`)
    );

    const nuevas = [];
    const activos = equipos.filter(e => e.activo !== false);

    for (const eq of activos) {
      const parchesEq = parches.filter(p => p.equipo_id === eq.id && p.activo !== false);
      for (const parche of parchesEq) {
        if (!parche.fecha_vencimiento) continue;
        const dias = differenceInDays(parseISO(parche.fecha_vencimiento), hoy);
        const tipo = dias < 0 ? 'parche_vencido' : dias <= 90 ? 'parche_por_vencer' : null;
        if (!tipo) continue;
        const key = `${eq.id}|${tipo}`;
        if (existentes.has(key)) continue;
        existentes.add(key);
        nuevas.push({
          equipo_id: eq.id,
          tipo,
          nivel: dias < 0 ? 'critica' : 'advertencia',
          descripcion: `Parche ${parche.tipo} ${dias < 0 ? 'vencido' : `vence en ${dias} días`}`,
          estado: 'activa',
          centro: eq.centro_principal || '',
          subsede: eq.subsede || '',
        });
      }
      // Fechas de vencimiento propias del equipo. Antes solo se miraba la
      // batería: la revisión técnica, el permiso de circulación y la
      // certificación anual ya estaban cargados y nadie avisaba de ellos.
      const VENCIMIENTOS = [
        { campo: 'fecha_vencimiento_bateria', vencido: 'bateria_vencida', porVencer: 'bateria_por_vencer', que: 'Batería' },
        { campo: 'fecha_vencimiento_revision_tecnica', vencido: 'revision_tecnica_vencida', porVencer: 'revision_tecnica_por_vencer', que: 'Revisión técnica' },
        { campo: 'fecha_vencimiento_permiso_circulacion', vencido: 'permiso_circulacion_vencido', porVencer: 'permiso_circulacion_por_vencer', que: 'Permiso de circulación' },
        { campo: 'proxima_revision_anual', vencido: 'certificacion_vencida', porVencer: 'certificacion_por_vencer', que: 'Certificación anual' },
      ];
      for (const v of VENCIMIENTOS) {
        const valor = eq[v.campo];
        if (!valor) continue;
        const dias = differenceInDays(parseISO(valor), hoy);
        const tipo = dias < 0 ? v.vencido : dias <= 90 ? v.porVencer : null;
        if (!tipo) continue;
        const key = `${eq.id}|${tipo}`;
        if (existentes.has(key)) continue;
        existentes.add(key);
        nuevas.push({
          equipo_id: eq.id,
          tipo,
          nivel: dias < 0 ? 'critica' : 'advertencia',
          descripcion: `${v.que} ${dias < 0 ? `vencida hace ${Math.abs(dias)} días` : `vence en ${dias} días`}`,
          estado: 'activa',
          centro: eq.centro_principal || '',
          subsede: eq.subsede || '',
        });
      }
    }

    // ── Licencias de conducir ──────────────────────────────────────────────
    // A diferencia de los vencimientos del vehiculo, que avisan a 90 dias,
    // la licencia avisa a 60: es el plazo que decidio Movilizacion, tiempo
    // suficiente para pedir hora y renovar en el municipio sin que la alerta
    // quede meses en pantalla antes de que se pueda hacer algo.
    const DIAS_AVISO_LICENCIA = 60;
    for (const u of usuarios) {
      if (u.role !== 'chofer' || !u.licencia_vencimiento) continue;
      const dias = differenceInDays(parseISO(u.licencia_vencimiento), hoy);
      const tipo = dias < 0 ? 'licencia_vencida'
                 : dias <= DIAS_AVISO_LICENCIA ? 'licencia_por_vencer'
                 : null;
      if (!tipo) continue;
      const key = `${u.id}|${tipo}`;
      if (existentesChofer.has(key)) continue;
      existentesChofer.add(key);
      const quien = u.full_name || u.email;
      nuevas.push({
        chofer_id: u.id,
        tipo,
        nivel: dias < 0 ? 'critica' : 'advertencia',
        descripcion: dias < 0
          ? `Licencia de ${quien} vencida hace ${Math.abs(dias)} días`
          : `Licencia de ${quien} vence en ${dias} días`,
        estado: 'activa',
        centro: u.centro_principal || '',
      });
    }

    // ── Prestamos que pasaron su fecha de devolucion ───────────────────────
    // Un prestamo no se cierra solo: queda vigente hasta que alguien confirme
    // que el vehiculo volvio. El riesgo de eso es que nadie se acuerde, y
    // mientras tanto los gastos se siguen cargando al centro del prestamo.
    // Este aviso es el contrapeso.
    for (const p of prestamos) {
      if (!p.hasta_previsto) continue;
      const dias = differenceInDays(parseISO(p.hasta_previsto), hoy);
      if (dias >= 0) continue;
      const tipo = 'prestamo_vencido';
      const key = `${p.equipo_id}|${tipo}`;
      if (existentes.has(key)) continue;
      existentes.add(key);
      nuevas.push({
        equipo_id: p.equipo_id,
        tipo,
        nivel: 'advertencia',
        descripcion: `${p.equipo_label || 'Vehiculo'} prestado a ${p.centro_destino}: `
          + `debia volver hace ${Math.abs(dias)} dias. El gasto se sigue cargando a ${p.centro_costo}.`,
        estado: 'activa',
        centro: p.centro_origen || '',
      });
    }

    let creadas = 0;
    if (nuevas.length > 0) {
      const res = await base44.asServiceRole.entities.Alerta.bulkCreate(nuevas);
      creadas = Array.isArray(res) ? res.length : nuevas.length;
    }

    return Response.json({ ok: true, generadas: creadas, total_activas: alertasActivas.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
