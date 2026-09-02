import { createClientFromRequest } from '#compat';

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
    let otCreada = null;
    if (!inspeccion_id || !accion) return Response.json({ error: 'Faltan parámetros' }, { status: 400 });

    const inspeccion = await base44.asServiceRole.entities.InspeccionPendiente.get(inspeccion_id);
    if (!inspeccion) return Response.json({ error: 'No encontrada' }, { status: 404 });

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
      if (!equipo || !user.centro_principal || equipo.centro_principal !== user.centro_principal) {
        return Response.json(
          { error: 'Esta inspección pertenece a otro centro' },
          { status: 403 },
        );
      }
    }

    if (accion === 'aprobar') {
      const datos = inspeccion.datos_json ? JSON.parse(inspeccion.datos_json) : {};

      // Mapear tipo_formulario a tipo de actividad válido en el enum
      const tipoActividadMap = {
        inspeccion_semanal: 'inspeccion_semanal',
        inspeccion_diaria: 'inspeccion_rutinaria',
        turno_chofer: 'inspeccion_rutinaria',
        inspeccion_anual: 'inspeccion_anual',
      };
      const tipoActividad = tipoActividadMap[inspeccion.tipo_formulario] || 'inspeccion';

      // Crear actividad
      await base44.asServiceRole.entities.Actividad.create({
        equipo_id: inspeccion.equipo_id,
        tipo: tipoActividad,
        fecha: inspeccion.fecha,
        usuario_nombre: inspeccion.conductor || '',
        usuario_email: inspeccion.revisor_email || user.email,
        observaciones: inspeccion.observaciones || '',
      });

      // Crear registro en HistorialMantenimiento
      const tipoMantenimientoMap = {
        inspeccion_semanal: 'inspeccion_rutinaria',
        inspeccion_diaria: 'inspeccion_rutinaria',
        turno_chofer: 'inspeccion_rutinaria',
        inspeccion_anual: 'inspeccion_rutinaria',
      };

      // Calcular si hay fallas en el checklist
      const hasFallas = inspeccion.observaciones?.includes('Incorrectos:') ||
                        inspeccion.observaciones?.includes('Fallas:') ||
                        inspeccion.observaciones?.includes('Daños');

      await base44.asServiceRole.entities.HistorialMantenimiento.create({
        equipo_id: inspeccion.equipo_id,
        fecha_inspeccion: inspeccion.fecha,
        tipo_mantenimiento: tipoMantenimientoMap[inspeccion.tipo_formulario] || 'inspeccion_rutinaria',
        resultado: hasFallas ? 'aprobado_con_observaciones' : 'aprobado',
        observaciones: inspeccion.observaciones || '',
        tecnico_responsable: inspeccion.conductor || inspeccion.conductor || '',
        cargado_por_email: user.email,
        empresa_responsable: 'Registro automático — Bitácora',
      });

      // Si la inspección aprobada tiene fallas, crear Orden de Trabajo automáticamente
      if (hasFallas) {
        // Recolectar detalle de fallas del checklist
        const fallasDetalle = [];
        const recolectar = (obj) => {
          if (!obj) return;
          Object.entries(obj).forEach(([item, v]) => {
            if (v && (v.estado === 'malo' || v.estado === 'incorrecto')) {
              fallasDetalle.push('- ' + item + (v.obs ? ': ' + v.obs : ''));
            }
          });
        };
        ['luces', 'motor', 'accesorios', 'documentos', 'exterior', 'interior', 'equipo_medico', 'accesorios_diaria', 'saneamiento', 'documentacion'].forEach(k => recolectar(datos[k]));
        if (datos.danos) {
          Object.entries(datos.danos).forEach(([zone, v]) => {
            if (v && v.marcado) {
              fallasDetalle.push('- Daño visual: ' + zone.replace(/_/g, ' ') + (v.descripcion ? ': ' + v.descripcion : ''));
            }
          });
        }

        const ahora = new Date();
        const ymd = ahora.toISOString().slice(0, 10).replace(/-/g, '');
        const hhmmss = ahora.toTimeString().slice(0, 8).replace(/:/g, '');
        const numero_ot = `OT-${ymd}-${hhmmss}`;

        const equipo = datos.equipo || {};
        const equipoLabel = inspeccion.equipo_label || `${equipo.marca || ''} ${equipo.modelo || ''}`.trim() || inspeccion.equipo_id;

        // Prioridad: alta si hay daños visuales o fallas de motor, media en caso contrario
        const tieneDanos = datos.danos && Object.values(datos.danos).some(v => v && v.marcado);
        const fallasMotor = datos.motor && Object.values(datos.motor).some(v => v && v.estado === 'malo');
        const prioridad = (tieneDanos || fallasMotor) ? 'alta' : 'media';

        await base44.asServiceRole.entities.OrdenTrabajo.create({
          numero_ot: numero_ot,
          equipo_id: inspeccion.equipo_id,
          equipo_label: equipoLabel,
          patente: equipo.patente || '',
          tipo_activo: 'corporativo',
          prioridad,
          estado: 'pendiente',
          problema_reportado: `Fallas detectadas en inspección (${inspeccion.tipo_formulario}):\n${fallasDetalle.join('\n')}\n\nObservaciones: ${inspeccion.observaciones || ''}`,
          diagnostico: '',
          origen: 'inspeccion',
          inspeccion_id: inspeccion_id,
          reportado_por_email: user.email,
          reportado_por_nombre: inspeccion.conductor || user.full_name,
          supervisor_email: user.email,
          supervisor_nombre: user.full_name,
          linea_tiempo: [{
            fecha: ahora.toISOString(),
            evento: 'OT creada automáticamente desde inspección aprobada',
            usuario_email: user.email,
            usuario_nombre: user.full_name,
            notas: `Inspección ${inspeccion_id}`,
          }],
        });
        otCreada = { numero_ot, prioridad, fallas: fallasDetalle.length };
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

    return Response.json({ ok: true, ot_creada: otCreada });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
