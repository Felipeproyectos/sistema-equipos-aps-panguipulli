// Lo que deja una pauta en el historial del equipo cuando queda registrada:
// la actividad, la línea del historial de mantenimiento y el kilometraje.
//
// Lo usan dos caminos, y por eso está aparte:
//   · aprobarInspeccion.js — el Encargado revisó una pauta con novedades;
//   · guardarInspeccionPendiente.js — la pauta llegó sin novedades y se
//     registra sola, sin esperar a nadie (src/lib/fallasPauta.js).
// Antes este código vivía solo en aprobarInspeccion: el historial de un equipo
// dependía de que alguien apretara «Aprobar», y la mitad de las pautas
// esperaba más de una semana.

export const REGISTRO_AUTOMATICO = 'Registro automático';

// tipo_formulario → tipo de actividad válido en el enum.
const TIPO_ACTIVIDAD = {
  inspeccion_semanal: 'inspeccion_semanal',
  inspeccion_diaria: 'inspeccion_rutinaria',
  turno_chofer: 'inspeccion_rutinaria',
  inspeccion_anual: 'inspeccion_anual',
  pauta_cabina: 'inspeccion_cabina',
};

export const leerDatos = (inspeccion) => {
  try { return inspeccion?.datos_json ? JSON.parse(inspeccion.datos_json) : {}; } catch { return {}; }
};

/** La Pauta de Cabina no trae checklist: trae archivos y dos respuestas. */
export function resumenDeCabina(inspeccion, datos) {
  const archivos = Array.isArray(datos.archivos) ? datos.archivos.filter(a => a && a.url) : [];
  const resumen = [`Material caducado: ${datos.material_caducado ? 'Sí' : 'No'}`,
    `Reponer material: ${datos.reponer_material ? 'Sí' : 'No'}`,
    `Archivos: ${archivos.length}`].join('. ') + '.'
    + (inspeccion.observaciones?.trim() ? ` Observaciones: ${inspeccion.observaciones.trim()}` : '');
  return { archivos, resumen, avisos: datos.material_caducado === true || datos.reponer_material === true };
}

/**
 * Deja la pauta en el historial del equipo.
 *   quien: { email, nombre } de quien la da por revisada (vacío si es automático)
 *   conObservaciones: la pauta trae fallas o avisos
 *   nota: lo que el Encargado decidió, para que quede junto a la pauta
 */
export async function registrarEnHistorial(db, { inspeccion, datos, quien = {}, conObservaciones = false, nota = '' }) {
  const esCabina = inspeccion.tipo_formulario === 'pauta_cabina';
  const cabina = esCabina ? resumenDeCabina(inspeccion, datos) : null;
  const base = esCabina ? cabina.resumen : (inspeccion.observaciones || '');
  const observaciones = [base, nota].map(t => String(t || '').trim()).filter(Boolean).join('\n');

  // El centro que tenía el equipo al hacer la pauta (si estaba prestado, el
  // que lo recibió): con él ese centro conserva el historial después de
  // devolverlo (30_historial_prestamo.sql). Si la columna todavía no existe,
  // la actividad se guarda igual, sin él.
  const actividad = {
    equipo_id: inspeccion.equipo_id,
    tipo: TIPO_ACTIVIDAD[inspeccion.tipo_formulario] || 'inspeccion',
    fecha: inspeccion.fecha,
    usuario_nombre: inspeccion.conductor || '',
    usuario_email: quien.email || '',
    observaciones,
    ...(cabina?.archivos[0] && { archivo_url: cabina.archivos[0].url }),
  };
  const aCargo = {
    centro_responsable: datos.prestamo?.centro_destino || datos.equipo?.centro_principal || '',
    ...(datos.prestamo?.id && { prestamo_id: datos.prestamo.id }),
  };
  await db.Actividad.create({ ...actividad, ...aCargo }).catch((e) => {
    if (!/centro_responsable|prestamo_id/.test(String(e?.message))) throw e;
    return db.Actividad.create(actividad);
  });

  await db.HistorialMantenimiento.create({
    equipo_id: inspeccion.equipo_id,
    fecha_inspeccion: inspeccion.fecha,
    tipo_mantenimiento: 'inspeccion_rutinaria',
    resultado: conObservaciones ? 'aprobado_con_observaciones' : 'aprobado',
    observaciones,
    tecnico_responsable: inspeccion.conductor || '',
    cargado_por_email: quien.email || '',
    empresa_responsable: 'Registro automático — Bitácora',
  });

  if (inspeccion.km_inicial) {
    const kmInicial = Number(inspeccion.km_inicial);
    const kms = await db.Kilometraje.filter({ equipo_id: inspeccion.equipo_id });
    const activo = kms.find(r => !r.km_final);
    if (activo) await db.Kilometraje.update(activo.id, { km_final: kmInicial });
    await db.Kilometraje.create({
      equipo_id: inspeccion.equipo_id,
      fecha: inspeccion.fecha,
      conductor: inspeccion.conductor || '',
      valor_km: kmInicial,
      km_inicial: kmInicial,
      observaciones: inspeccion.observaciones || '',
    });
  }
}

/** El kilometraje del registro más reciente del vehículo, o null. */
export async function ultimoKm(db, equipoId) {
  const kms = await db.Kilometraje.filter({ equipo_id: equipoId }, '-created_date', 5).catch(() => []);
  const valores = kms.map(k => Number(k.km_final ?? k.valor_km ?? k.km_inicial)).filter(Number.isFinite);
  return valores.length ? valores[0] : null;
}

export const hoyISO = () => new Date().toISOString().split('T')[0];
