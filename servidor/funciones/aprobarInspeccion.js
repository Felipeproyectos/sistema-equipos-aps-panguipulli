import { createClientFromRequest } from '#compat';
import {
  pautaConFallas, textoSolicitudDePauta, areaQueDecide, ORIGEN_PAUTA,
  fallasDeInspeccion, separarFallas, AMBITO_CABINA, AMBITO_VEHICULO,
  DECISIONES, NOTA_MINIMA, solicitudAbiertaDePauta,
} from '../compartido/fallasPauta.js';
import { CATEGORIAS, PRIORIDADES, OPERATIVIDAD, fotoDelEquipo, evento } from '../compartido/solicitudesMonitor.js';
import { leerDatos, resumenDeCabina, registrarEnHistorial, hoyISO } from '../lib/registroPauta.js';

// El Encargado de Salud revisa una pauta que llegó con novedades (las que
// llegan sin novedades se registran solas: guardarInspeccionPendiente.js).
//
// Al aprobarla la pauta queda en el historial del equipo y, si trae fallas:
//   · lo del VEHÍCULO abre una solicitud para Movilización, siempre;
//   · lo de CALIDAD (equipos médicos y cabina sanitaria) lo decide el
//     Encargado en ese mismo momento, con `decision`:
//       enviar_monitor  → solicitud completa, directo a la bandeja del Monitor
//       resuelto_centro → sin solicitud; queda anotado cómo se resolvió
//       sin_gestion     → sin solicitud; queda anotada la observación
//     Sin `decision` (una pantalla que no se ha actualizado) se comporta como
//     antes: deja la solicitud «Por enviar» en Solicitudes.
//
// Una falla que se repite no abre otra solicitud: se suma a la que el equipo
// ya tiene abierta, esté por enviar, en el Monitor o en el taller.

const valido = (lista, v) => lista.some(x => x.value === v);

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'super_admin' && user.role !== 'encargado_salud') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const { inspeccion_id, accion, nota: notaCruda, decision, detalle = {} } = await req.json();
    const nota = String(notaCruda || '').trim().slice(0, 2000);
    // Se declara aca y no dentro del `if (accion === 'aprobar')`: el return
    // final la usa desde fuera de ese bloque, y por el scope de `let` toda
    // aprobacion terminaba en 500 aunque el trabajo se hubiera hecho.
    let solicitudCreada = null;
    const solicitudesCreadas = [];
    if (!inspeccion_id || !accion) return Response.json({ error: 'Faltan parámetros' }, { status: 400 });
    if (!['aprobar', 'rechazar'].includes(accion)) return Response.json({ error: 'Acción no válida' }, { status: 400 });
    if (decision != null && !valido(DECISIONES, decision)) return Response.json({ error: 'Decisión no válida' }, { status: 400 });

    const db = base44.asServiceRole.entities;
    const inspeccion = await db.InspeccionPendiente.get(inspeccion_id);
    if (!inspeccion) return Response.json({ error: 'No encontrada' }, { status: 404 });
    // Dos revisores a la vez, o un doble clic, aprobaban dos veces: dos
    // actividades y dos órdenes por la misma pauta.
    if (inspeccion.estado && inspeccion.estado !== 'pendiente') {
      const quien = inspeccion.revisor_nombre || inspeccion.revisor_email;
      return Response.json({ error: `Esta pauta ya fue ${inspeccion.estado === 'aprobado' ? 'aprobada' : 'rechazada'}${quien ? ` por ${quien}` : ''}.` }, { status: 409 });
    }

    const datos = leerDatos(inspeccion);

    // El encargado de salud solo resuelve inspecciones de SU centro. Apagado
    // por defecto: en Base44 no habia chequeo y uno de Coñaripe podia aprobar
    // las de Panguipulli. Se enciende con la variable de entorno, junto con
    // RESTRINGIR_INSPECCIONES_POR_CENTRO en migracion/generar_sql.py.
    // InspeccionPendiente no guarda el centro, asi que se saca del equipo.
    const restringirPorCentro = (globalThis.process?.env?.RESTRINGIR_INSPECCIONES_POR_CENTRO) === 'true';
    if (restringirPorCentro && user.role === 'encargado_salud') {
      const equipo = inspeccion.equipo_id ? await db.Equipo.get(inspeccion.equipo_id) : null;
      // Si estaba prestada, también la aprueba el centro que la tenía.
      const centros = [equipo?.centro_principal, datos.prestamo?.centro_destino].filter(Boolean);
      if (!equipo || !user.centro_principal || !centros.includes(user.centro_principal)) {
        return Response.json({ error: 'Esta inspección pertenece a otro centro' }, { status: 403 });
      }
    }

    if (accion === 'aprobar') {
      const esCabina = inspeccion.tipo_formulario === 'pauta_cabina';
      const cabina = esCabina ? resumenDeCabina(inspeccion, datos) : null;
      const avisosCabina = !!cabina?.avisos;
      // Fallas: los ítems malos de cualquier formulario (también el checklist
      // de los monitores y los parches del DEA) o, en las pautas antiguas sin
      // ítems, lo que diga el texto. Ver src/lib/fallasPauta.js.
      const hasFallas = !esCabina && pautaConFallas(inspeccion, datos);
      const revisor = user.full_name || user.email;

      // ── A quién le toca cada falla ──────────────────────────────────────
      // En una ambulancia la pauta se parte: lo de la cabina sanitaria
      // (equipos médicos, oxígeno, camilla, botiquín, desechos clínicos) es de
      // Calidad y lo del vehículo es de Movilización. La Pauta de Cabina con
      // material caducado o por reponer también es de Calidad.
      const grupos = [];
      let equipo = { ...(datos.equipo || {}) };
      if (hasFallas || avisosCabina || decision === 'enviar_monitor') {
        const actual = await db.Equipo.get(inspeccion.equipo_id).catch(() => null);
        equipo = { ...equipo, ...(actual || {}) };
        const esAmbulancia = equipo.tipo === 'ambulancia';
        if (esCabina) {
          if (avisosCabina) {
            grupos.push({
              area: 'salud', ambito: AMBITO_CABINA, categoria: 'compra_insumo',
              texto: [`Pauta de Cabina del ${String(inspeccion.fecha || '').slice(0, 10)}${inspeccion.conductor ? `, hecha por ${inspeccion.conductor}` : ''}:`,
                cabina.resumen, revisor ? `Aprobada por ${revisor}.` : ''].filter(Boolean).join('\n'),
            });
          }
        } else if (hasFallas && esAmbulancia) {
          const { cabina: deCabina, vehiculo } = separarFallas(fallasDeInspeccion(datos));
          if (deCabina.length) {
            grupos.push({ area: 'salud', ambito: AMBITO_CABINA, categoria: 'desperfecto_tecnico',
              texto: textoSolicitudDePauta({ insp: inspeccion, datos, revisor, fallas: deCabina }) });
          }
          // Lo que no es de la cabina, o una pauta vieja sin ítems: al vehículo.
          if (vehiculo.length || !deCabina.length) {
            grupos.push({ area: 'movilizacion', ambito: AMBITO_VEHICULO,
              texto: textoSolicitudDePauta({ insp: inspeccion, datos, revisor, ...(vehiculo.length ? { fallas: vehiculo } : {}) }) });
          }
        } else if (hasFallas) {
          grupos.push({ area: areaQueDecide(equipo), texto: textoSolicitudDePauta({ insp: inspeccion, datos, revisor }) });
        }
        // Sin ítems malos pero con algo escrito que el Encargado quiere que
        // vea el Monitor: solo en equipos médicos, donde no hay duda del área.
        if (decision === 'enviar_monitor' && !grupos.some(g => g.area === 'salud')
            && !esCabina && areaQueDecide(equipo) === 'salud') {
          grupos.push({ area: 'salud', texto: textoSolicitudDePauta({ insp: inspeccion, datos, revisor }) });
        }
      }

      const deCalidad = grupos.filter(g => g.area === 'salud');
      if (decision === 'enviar_monitor') {
        if (!deCalidad.length) return Response.json({ error: 'Esta pauta no trae nada de Calidad que enviar al Monitor Corporativo.' }, { status: 400 });
        const faltan = [
          !valido(PRIORIDADES, detalle.prioridad) && 'la prioridad',
          !valido(OPERATIVIDAD, detalle.operatividad) && 'en qué estado quedó el equipo',
        ].filter(Boolean);
        if (faltan.length) return Response.json({ error: `Para enviarla al Monitor Corporativo falta ${faltan.join(' y ')}.` }, { status: 400 });
      }
      if (decision === 'resuelto_centro' && nota.length < NOTA_MINIMA) {
        return Response.json({ error: `Cuenta en al menos ${NOTA_MINIMA} caracteres cómo se resolvió en el centro.` }, { status: 400 });
      }

      // ── Historial del equipo ────────────────────────────────────────────
      const rotuloDecision = deCalidad.length && decision && decision !== 'enviar_monitor'
        ? `${decision === 'resuelto_centro' ? 'Resuelto en el centro' : 'Sin gestión'}${nota ? `: ${nota}` : ''} (${revisor})`
        : '';
      await registrarEnHistorial(db, {
        inspeccion, datos,
        quien: { email: inspeccion.revisor_email || user.email },
        conObservaciones: hasFallas || avisosCabina,
        nota: rotuloDecision,
      });

      // ── Solicitudes ─────────────────────────────────────────────────────
      if (grupos.length) {
        const delEquipo = await db.Solicitud.filter({ equipo_id: inspeccion.equipo_id }, '-created_date', 200).catch(() => []);
        const sumar = (linea, nombre, texto) => [...(Array.isArray(linea) ? linea : []), evento(user, nombre, texto)];

        for (const g of grupos) {
          const enviar = g.area === 'salud' && decision === 'enviar_monitor';
          // Calidad decidió que no hace falta solicitud: ya quedó en el historial.
          if (g.area === 'salud' && decision && !enviar) continue;

          const abierta = solicitudAbiertaDePauta(delEquipo, g.ambito);
          const estadoAbierta = abierta ? (abierta.estado || 'pendiente') : null;

          // Lo que el Monitor necesita para resolverla sin llamar al centro:
          // sale de la ficha del equipo y de la propia pauta.
          const paraElMonitor = enviar ? {
            categoria: valido(CATEGORIAS, detalle.categoria) ? detalle.categoria : (g.categoria || 'desperfecto_tecnico'),
            prioridad: detalle.prioridad,
            operatividad: detalle.operatividad,
            fecha_deteccion: inspeccion.fecha || hoyISO(),
            centro: equipo.centro_principal || '',
            subsede: equipo.subsede || '',
            ubicacion_especifica: String(detalle.ubicacion_especifica || '').trim().slice(0, 200)
              || equipo.ubicacion_especifica
              || (g.ambito === AMBITO_CABINA ? `Cabina sanitaria de la ambulancia${equipo.patente ? ` ${equipo.patente}` : ''}` : equipo.subsede || equipo.centro_principal || ''),
            ...fotoDelEquipo(equipo),
            estado: 'derivada',
            derivada_por_email: user.email || '',
            derivada_por_nombre: revisor,
            fecha_derivacion: new Date().toISOString(),
          } : null;
          const descripcion = [g.texto, enviar && nota ? `Nota del Encargado: ${nota}` : ''].filter(Boolean).join('\n');

          let creada;
          if (abierta && estadoAbierta === 'pendiente') {
            // Todavía en el centro: la falla nueva se suma al texto y, si el
            // Encargado decidió enviarla, sale completa hacia el Monitor.
            const observaciones = [abierta.observaciones, g.texto].filter(Boolean).join('\n\n');
            await db.Solicitud.update(abierta.id, {
              observaciones,
              ...(enviar ? {
                ...paraElMonitor,
                descripcion: [abierta.observaciones, descripcion].filter(Boolean).join('\n\n'),
                linea_tiempo: sumar(abierta.linea_tiempo, 'Enviada al Monitor Corporativo desde Revisión Bitácora'),
              } : {}),
            });
            creada = { id: abierta.id, nueva: false, area: g.area, enviada: enviar };
          } else if (abierta) {
            // Ya la tiene el Monitor, el taller, o volvió al centro para
            // corregir: no se abre otra. Queda anotado que la falla se repite.
            await db.Solicitud.update(abierta.id, {
              linea_tiempo: sumar(abierta.linea_tiempo, 'La falla se repite en otra pauta', g.texto),
              ...(g.area === 'movilizacion' ? { observaciones: [abierta.observaciones, g.texto].filter(Boolean).join('\n\n') } : {}),
            });
            creada = { id: abierta.id, nueva: false, area: g.area, repetida: true, enviada: false };
          } else {
            const nueva = await db.Solicitud.create({
              equipo_id: inspeccion.equipo_id,
              tipo: g.ambito === AMBITO_CABINA && g.categoria === 'compra_insumo' ? 'insumos_cabina' : 'mantenimiento_correctivo',
              fecha: inspeccion.fecha || hoyISO(),
              usuario_email: user.email || '',
              usuario_nombre: inspeccion.conductor || user.full_name || user.email || '',
              centro: equipo.centro_principal || '',
              estado: 'pendiente',
              origen: ORIGEN_PAUTA,
              observaciones: g.texto,
              ...(g.ambito ? { ambito: g.ambito } : {}),
              ...(g.categoria ? { categoria: g.categoria } : {}),
              ...(enviar ? {
                ...paraElMonitor,
                descripcion,
                linea_tiempo: sumar([], 'Enviada al Monitor Corporativo desde Revisión Bitácora'),
              } : {}),
            });
            creada = { id: nueva?.id, nueva: true, area: g.area, enviada: enviar };
          }
          solicitudesCreadas.push(creada);
          if (!solicitudCreada) solicitudCreada = creada;
        }
      }

      // Marcar como aprobado
      await db.InspeccionPendiente.update(inspeccion_id, {
        estado: 'aprobado',
        revisor_email: user.email,
        revisor_nombre: user.full_name,
        fecha_revision: hoyISO(),
        nota_revision: rotuloDecision ? rotuloDecision.replace(` (${revisor})`, '') : nota,
      });

      // Subir PDF a Google Drive (en background, no bloquea la respuesta)
      base44.asServiceRole.functions.invoke('subirInspeccionDrive', {
        tipo: 'inspeccion',
        inspeccion_id,
      }).catch(err => console.error('Error subiendo a Drive:', err.message));

    } else if (accion === 'rechazar') {
      await db.InspeccionPendiente.update(inspeccion_id, {
        estado: 'rechazado',
        revisor_email: user.email,
        revisor_nombre: user.full_name,
        fecha_revision: hoyISO(),
        nota_revision: nota,
      });
    }

    return Response.json({ ok: true, solicitud_creada: solicitudCreada, solicitudes_creadas: solicitudesCreadas });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
