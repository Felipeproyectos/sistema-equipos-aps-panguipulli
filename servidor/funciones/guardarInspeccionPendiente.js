import { createClientFromRequest } from '#compat';
import { prestamoVigente } from '../compartido/prestamoEquipo.js';
import { sinNovedades } from '../compartido/fallasPauta.js';
import { hoyChile } from '../compartido/turnoFlota.js';
import { LIMITES, normalizarPauta, motivoDeRechazo, decidirRecepcion, kmCreible } from '../compartido/pautaPublica.js';
import { REGISTRO_AUTOMATICO, registrarEnHistorial, ultimoKm } from '../lib/registroPauta.js';
import { subirPautaADrive } from './subirInspeccionDrive.js';

// Recibe una pauta desde el enlace público (quien la llena no tiene cuenta).
//
// Qué pasa con ella
// ─────────────────
//   · Sin novedades (ningún ítem malo, nada escrito a mano) → queda registrada
//     de inmediato en el historial del equipo, sin esperar aprobación.
//   · Con novedades → queda pendiente para el Encargado, en Revisión Bitácora.
//
// Como la puerta es pública y lo que entra puede registrarse solo, todo lo que
// llega pasa por las reglas de src/lib/pautaPublica.js: tamaño, forma, pautas
// repetidas, tope por equipo y un freno general que apaga el registro
// automático si el volumen se sale de lo normal. El tope por dirección de red
// está antes, en servidor/index.js.
//
// PAUTAS_REGISTRO_AUTOMATICO=off (variable de entorno) vuelve al modo de
// antes: toda pauta espera al Encargado.

const CORS = { 'Access-Control-Allow-Origin': '*' };
const ENV = (typeof process !== 'undefined' && process.env) || {};
const responder = (cuerpo, status = 200) => Response.json(cuerpo, { status, headers: CORS });

// La ambulancia puede estar prestada a otro centro (src/lib/prestamoEquipo.js):
// la pauta queda con el préstamo de ese momento, para que la revise el centro
// que la tenía. Si la tabla no existe o falla, la pauta se guarda igual.
async function prestamoDeHoy(db, equipoId) {
  const lista = await db.PrestamoVehiculo.filter({ equipo_id: equipoId, estado: 'vigente' }).catch(() => []);
  const p = prestamoVigente(lista, equipoId);
  return p ? { id: p.id, centro_origen: p.centro_origen || '', centro_destino: p.centro_destino || '', desde: p.desde || '' } : null;
}

export default async function (req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { ...CORS, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } });
  }

  try {
    const base44 = createClientFromRequest(req, { allowUnauthenticated: true });
    const db = base44.asServiceRole.entities;

    // El tamaño se mira antes de interpretar nada.
    if (Number(req.headers.get('content-length') || 0) > LIMITES.cuerpoBytes) {
      return responder({ error: 'La pauta es demasiado grande' }, 413);
    }
    const crudo = await req.text();
    if (crudo.length > LIMITES.cuerpoBytes) return responder({ error: 'La pauta es demasiado grande' }, 413);
    let cuerpo;
    try { cuerpo = JSON.parse(crudo || '{}'); } catch { return responder({ error: 'La pauta no se pudo leer' }, 400); }
    if (!cuerpo || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) return responder({ error: 'La pauta no se pudo leer' }, 400);

    const pauta = normalizarPauta(cuerpo);
    if (!pauta.equipo_id || !pauta.fecha || !pauta.tipo_formulario) {
      return responder({ error: 'Faltan campos obligatorios' }, 400);
    }

    let equipo = null;
    try { equipo = await db.Equipo.get(pauta.equipo_id); } catch { equipo = null; }
    const hoy = hoyChile();
    const motivo = motivoDeRechazo(pauta, equipo, hoy);
    if (motivo) return responder({ error: motivo }, equipo ? 400 : 404);

    // Lo recibido en las últimas 24 horas: repetidas, tope del equipo y freno.
    const desde = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const recientes = await db.InspeccionPendiente.filter({ created_date: { $gte: desde } }, '-created_date', 400);
    const decision = decidirRecepcion(pauta, recientes);
    if (decision.accion === 'repetida') return responder({ ok: true, id: decision.id, repetida: true });
    if (decision.accion === 'rechazar') {
      console.warn(`[pautas] rechazada (${decision.status}): ${decision.motivo} — equipo ${pauta.equipo_id}`);
      return responder({ error: decision.motivo }, decision.status);
    }
    if (decision.accion === 'manual') console.warn(`[pautas] registro automático en pausa: ${decision.motivo}`);

    const prestamo = await prestamoDeHoy(db, pauta.equipo_id);

    const datos = {
      equipo: {
        marca: equipo.marca,
        modelo: equipo.modelo,
        tipo: equipo.tipo,
        patente: equipo.patente,
        centro_principal: equipo.centro_principal,
        subsede: equipo.subsede,
        numero_inventario: equipo.numero_inventario,
      },
      conductor: pauta.conductor,
      fecha: pauta.fecha,
      hora_registro: new Date().toISOString(),
      km_inicial: pauta.km_inicial ?? undefined,
      combustible: pauta.combustible || undefined,
      luces: pauta.luces,
      motor: pauta.motor,
      accesorios: pauta.accesorios,
      documentos: pauta.documentos,
      danos: pauta.danos,
      momento: pauta.momento,
      exterior: pauta.exterior,
      interior: pauta.interior,
      equipo_medico: pauta.equipo_medico,
      accesorios_diaria: pauta.accesorios_diaria,
      saneamiento: pauta.saneamiento,
      documentacion: pauta.documentacion,
      problemasDetectados: pauta.problemasDetectados || null,
      accionesTomadas: pauta.accionesTomadas || null,
      checklist: pauta.checklist,
      parches: pauta.parches,
      descripcion: pauta.descripcion || null,
      prestamo,
    };

    const registro = await db.InspeccionPendiente.create({
      tipo_formulario: pauta.tipo_formulario,
      equipo_id: pauta.equipo_id,
      equipo_label: pauta.equipo_label || `${equipo.marca || ''} ${equipo.modelo || ''}`.trim() || pauta.equipo_id,
      conductor: pauta.conductor,
      fecha: pauta.fecha,
      km_inicial: pauta.km_inicial || undefined,
      combustible: pauta.combustible || undefined,
      observaciones: pauta.observaciones,
      datos_json: JSON.stringify(datos),
      estado: 'pendiente',
    });

    // Sin novedades: al historial del equipo, ahora. Si algo falla acá la
    // pauta ya está guardada y queda pendiente, como antes.
    let registrada = false;
    const automatico = String(ENV.PAUTAS_REGISTRO_AUTOMATICO || '').toLowerCase() !== 'off';
    if (automatico && decision.accion === 'auto' && sinNovedades(registro, datos)) {
      try {
        const kmOk = pauta.km_inicial == null || kmCreible(pauta.km_inicial, await ultimoKm(db, pauta.equipo_id));
        if (kmOk) {
          await registrarEnHistorial(db, { inspeccion: registro, datos });
          await db.InspeccionPendiente.update(registro.id, {
            estado: 'aprobado',
            revisor_nombre: REGISTRO_AUTOMATICO,
            fecha_revision: hoy,
            nota_revision: 'Sin novedades: quedó registrada al recibirla.',
          });
          registrada = true;
          subirPautaADrive(base44, registro.id, { full_name: REGISTRO_AUTOMATICO })
            .catch(err => console.error('Error subiendo a Drive:', err.message));
        }
      } catch (e) {
        console.error('[pautas] no se pudo registrar sola, queda pendiente:', e.message);
      }
    }

    return responder({ ok: true, id: registro.id, registrada });
  } catch (error) {
    return responder({ error: error.message }, 500);
  }
}
