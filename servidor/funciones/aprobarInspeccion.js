import { createClientFromRequest } from '#compat';
import { pautaConFallas, textoSolicitudDePauta, areaQueDecide, ORIGEN_PAUTA } from '../compartido/fallasPauta.js';

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'super_admin' && user.role !== 'encargado_salud') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const { inspeccion_id, accion, nota } = await req.json();
    // Se declara aca y no dentro del `if (accion === 'aprobar')`: el return
    // final la usa desde fuera de ese bloque, y por el scope de `let` toda
    // aprobacion terminaba en 500 aunque el trabajo se hubiera hecho.
    let solicitudCreada = null;
    if (!inspeccion_id || !accion) return Response.json({ error: 'Faltan parámetros' }, { status: 400 });

    const inspeccion = await base44.asServiceRole.entities.InspeccionPendiente.get(inspeccion_id);
    if (!inspeccion) return Response.json({ error: 'No encontrada' }, { status: 404 });
    // Dos revisores a la vez, o un doble clic, aprobaban dos veces: dos
    // actividades y dos órdenes por la misma pauta.
    if (inspeccion.estado && inspeccion.estado !== 'pendiente') {
      const quien = inspeccion.revisor_nombre || inspeccion.revisor_email;
      return Response.json({ error: `Esta pauta ya fue ${inspeccion.estado === 'aprobado' ? 'aprobada' : 'rechazada'}${quien ? ` por ${quien}` : ''}.` }, { status: 409 });
    }

    // El encargado de salud solo resuelve inspecciones de SU centro. Apagado
    // por defecto: en Base44 no habia chequeo y uno de Coñaripe podia aprobar
    // las de Panguipulli. Se enciende con la variable de entorno, junto con
    // RESTRINGIR_INSPECCIONES_POR_CENTRO en migracion/generar_sql.py.
    // InspeccionPendiente no guarda el centro, asi que se saca del equipo.
    const restringirPorCentro = (globalThis.process?.env?.RESTRINGIR_INSPECCIONES_POR_CENTRO) === 'true';
    if (restringirPorCentro && user.role === 'encargado_salud') {
      const equipo = inspeccion.equipo_id
        ? await base44.asServiceRole.entities.Equipo.get(inspeccion.equipo_id)
        : null;
      // Si estaba prestada, también la aprueba el centro que la tenía.
      let datosInsp = {};
      try { datosInsp = inspeccion.datos_json ? JSON.parse(inspeccion.datos_json) : {}; } catch { datosInsp = {}; }
      const centros = [equipo?.centro_principal, datosInsp.prestamo?.centro_destino].filter(Boolean);
      if (!equipo || !user.centro_principal || !centros.includes(user.centro_principal)) {
        return Response.json(
          { error: 'Esta inspección pertenece a otro centro' },
          { status: 403 },
        );
      }
    }

    if (accion === 'aprobar') {
      let datos = {};
      try { datos = inspeccion.datos_json ? JSON.parse(inspeccion.datos_json) : {}; } catch { datos = {}; }

      // Mapear tipo_formulario a tipo de actividad válido en el enum
      const tipoActividadMap = {
        inspeccion_semanal: 'inspeccion_semanal',
        inspeccion_diaria: 'inspeccion_rutinaria',
        turno_chofer: 'inspeccion_rutinaria',
        inspeccion_anual: 'inspeccion_anual',
        pauta_cabina: 'inspeccion_cabina',
      };
      const tipoActividad = tipoActividadMap[inspeccion.tipo_formulario] || 'inspeccion';

      // La Pauta de Cabina no trae checklist: trae archivos y dos respuestas.
      // En la ficha queda un resumen de una linea y el primer archivo a mano;
      // el resto se ve al desplegarla. No genera orden de trabajo: lo que
      // falta en la cabina se repone, no se repara en el taller.
      const esCabina = inspeccion.tipo_formulario === 'pauta_cabina';
      const archivosCabina = esCabina && Array.isArray(datos.archivos) ? datos.archivos.filter(a => a && a.url) : [];
      const avisosCabina = esCabina && (datos.material_caducado === true || datos.reponer_material === true);
      const resumenCabina = esCabina
        ? [`Material caducado: ${datos.material_caducado ? 'Sí' : 'No'}`,
           `Reponer material: ${datos.reponer_material ? 'Sí' : 'No'}`,
           `Archivos: ${archivosCabina.length}`].join('. ') + '.'
          + (inspeccion.observaciones?.trim() ? ` Observaciones: ${inspeccion.observaciones.trim()}` : '')
        : '';

      // Crear actividad
      // El centro que tenía el equipo al hacer la pauta (si estaba prestado,
      // el que lo recibió): con él ese centro conserva el historial después
      // de devolverlo (30_historial_prestamo.sql). Si la columna todavía no
      // existe, la actividad se guarda igual, sin él.
      const actividad = {
        equipo_id: inspeccion.equipo_id,
        tipo: tipoActividad,
        fecha: inspeccion.fecha,
        usuario_nombre: inspeccion.conductor || '',
        usuario_email: inspeccion.revisor_email || user.email,
        observaciones: esCabina ? resumenCabina : (inspeccion.observaciones || ''),
        ...(archivosCabina[0] && { archivo_url: archivosCabina[0].url }),
      };
      const aCargo = {
        centro_responsable: datos.prestamo?.centro_destino || datos.equipo?.centro_principal || '',
        ...(datos.prestamo?.id && { prestamo_id: datos.prestamo.id }),
      };
      await base44.asServiceRole.entities.Actividad.create({ ...actividad, ...aCargo }).catch((e) => {
        if (!/centro_responsable|prestamo_id/.test(String(e?.message))) throw e;
        return base44.asServiceRole.entities.Actividad.create(actividad);
      });

      // Crear registro en HistorialMantenimiento
      const tipoMantenimientoMap = {
        inspeccion_semanal: 'inspeccion_rutinaria',
        inspeccion_diaria: 'inspeccion_rutinaria',
        turno_chofer: 'inspeccion_rutinaria',
        inspeccion_anual: 'inspeccion_rutinaria',
      };

      // Fallas: los ítems malos de cualquier formulario (también el checklist
      // de los monitores y los parches del DEA) o, en las pautas antiguas sin
      // ítems, lo que diga el texto. Ver src/lib/fallasPauta.js.
      const hasFallas = !esCabina && pautaConFallas(inspeccion, datos);

      await base44.asServiceRole.entities.HistorialMantenimiento.create({
        equipo_id: inspeccion.equipo_id,
        fecha_inspeccion: inspeccion.fecha,
        tipo_mantenimiento: tipoMantenimientoMap[inspeccion.tipo_formulario] || 'inspeccion_rutinaria',
        resultado: hasFallas || avisosCabina ? 'aprobado_con_observaciones' : 'aprobado',
        observaciones: esCabina ? resumenCabina : (inspeccion.observaciones || ''),
        tecnico_responsable: inspeccion.conductor || inspeccion.conductor || '',
        cargado_por_email: user.email,
        empresa_responsable: 'Registro automático — Bitácora',
      });

      // Si la pauta aprobada trae fallas, se abre una SOLICITUD para quien
      // decide qué se hace (src/lib/fallasPauta.js): Movilización si es un
      // vehículo («Solicitudes al Taller»: la deriva al taller o la cierra),
      // Salud si es un equipo («Solicitudes»). Antes se abría una OT directo
      // en la fila del taller, sin que nadie la evaluara. Si el equipo ya tiene
      // una solicitud de pauta sin revisar, la falla nueva se suma a esa.
      if (hasFallas) {
        const db = base44.asServiceRole.entities;
        const actual = await db.Equipo.get(inspeccion.equipo_id).catch(() => null);
        const equipo = { ...(datos.equipo || {}), ...(actual || {}) };
        const area = areaQueDecide(equipo);
        const texto = textoSolicitudDePauta({ insp: inspeccion, datos, revisor: user.full_name || user.email });
        const abiertas = await db.Solicitud.filter({ equipo_id: inspeccion.equipo_id, estado: 'pendiente' }).catch(() => []);
        const abierta = abiertas.find(x => x.origen === ORIGEN_PAUTA);
        if (abierta) {
          await db.Solicitud.update(abierta.id, { observaciones: [abierta.observaciones, texto].filter(Boolean).join('\n\n') });
          solicitudCreada = { id: abierta.id, nueva: false, area };
        } else {
          const nueva = await db.Solicitud.create({
            equipo_id: inspeccion.equipo_id,
            tipo: 'mantenimiento_correctivo',
            fecha: inspeccion.fecha || new Date().toISOString().slice(0, 10),
            usuario_email: user.email || '',
            usuario_nombre: inspeccion.conductor || user.full_name || user.email || '',
            centro: equipo.centro_principal || '',
            estado: 'pendiente',
            origen: ORIGEN_PAUTA,
            observaciones: texto,
          });
          solicitudCreada = { id: nueva?.id, nueva: true, area };
        }
      }

      // Si tiene kilometraje, registrarlo
      if (inspeccion.km_inicial) {
        const kmInicial = Number(inspeccion.km_inicial);
        const kms = await base44.asServiceRole.entities.Kilometraje.filter({ equipo_id: inspeccion.equipo_id });
        const activo = kms.find(r => !r.km_final);
        if (activo) {
          await base44.asServiceRole.entities.Kilometraje.update(activo.id, { km_final: kmInicial });
        }
        await base44.asServiceRole.entities.Kilometraje.create({
          equipo_id: inspeccion.equipo_id,
          fecha: inspeccion.fecha,
          conductor: inspeccion.conductor || '',
          valor_km: kmInicial,
          km_inicial: kmInicial,
          observaciones: inspeccion.observaciones || '',
        });
      }

      // Marcar como aprobado
      await base44.asServiceRole.entities.InspeccionPendiente.update(inspeccion_id, {
        estado: 'aprobado',
        revisor_email: user.email,
        revisor_nombre: user.full_name,
        fecha_revision: new Date().toISOString().split('T')[0],
        nota_revision: nota || '',
      });

      // Subir PDF a Google Drive (en background, no bloquea la respuesta)
      base44.asServiceRole.functions.invoke('subirInspeccionDrive', {
        tipo: 'inspeccion',
        inspeccion_id,
      }).catch(err => console.error('Error subiendo a Drive:', err.message));

    } else if (accion === 'rechazar') {
      await base44.asServiceRole.entities.InspeccionPendiente.update(inspeccion_id, {
        estado: 'rechazado',
        revisor_email: user.email,
        revisor_nombre: user.full_name,
        fecha_revision: new Date().toISOString().split('T')[0],
        nota_revision: nota || '',
      });
    }

    return Response.json({ ok: true, solicitud_creada: solicitudCreada });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
