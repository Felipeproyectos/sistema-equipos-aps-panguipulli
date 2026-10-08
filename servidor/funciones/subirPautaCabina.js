import { createClientFromRequest } from '#compat';

// Recibe la Pauta de Cabina de una ambulancia desde la pagina publica de
// pautas (o desde la ficha del vehiculo): los archivos que la persona subio
// (el Word llenado, un PDF o fotos de las hojas), su nombre y las dos
// respuestas rapidas. Guarda los archivos en el Storage y deja la pauta
// pendiente en InspeccionPendiente, donde la aprueba el encargado.
//
// Es publica, como guardarInspeccionPendiente: quien llena las pautas no tiene
// cuenta. Por eso valida todo lo que recibe: que el equipo sea una ambulancia,
// cuantos archivos, cuanto pesan y que cada uno sea de verdad lo que dice ser
// (los primeros bytes, no solo la extension). El archivo se guarda con el tipo
// ya validado, asi nadie puede colar una pagina web disfrazada de PDF.
//
// Los limites son los mismos que muestra la pantalla (src/lib/pautaCabina.js).

const CORS = { 'Access-Control-Allow-Origin': '*' };
const MAX_ARCHIVOS = 5;
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL = 20 * 1024 * 1024;

const TIPOS = {
  'application/pdf': { ext: 'pdf', firma: (b) => b.startsWith('%PDF') },
  'application/msword': { ext: 'doc', firma: (b) => b.startsWith('\xD0\xCF\x11\xE0') },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { ext: 'docx', firma: (b) => b.startsWith('PK') },
  'image/jpeg': { ext: 'jpg', firma: (b) => b.startsWith('\xFF\xD8\xFF') },
  'image/png': { ext: 'png', firma: (b) => b.startsWith('\x89PNG') },
  'image/webp': { ext: 'webp', firma: (b) => b.startsWith('RIFF') && b.slice(8, 12) === 'WEBP' },
};

const responder = (cuerpo, status = 200) => Response.json(cuerpo, { status, headers: CORS });

const bytesDe = (base64) => {
  const limpio = base64.replace(/=+$/, '');
  return Math.floor((limpio.length * 3) / 4);
};

const nombreSeguro = (nombre, ext) => {
  const base = String(nombre || 'pauta').replace(/\.[^.]+$/, '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\-]+/g, '_').replace(/_+/g, '_').slice(0, 60) || 'pauta';
  return `${base}.${ext}`;
};

const hoyEnChile = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });

export default async function (req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { ...CORS, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } });
  }

  try {
    const base44 = createClientFromRequest(req, { allowUnauthenticated: true });
    const datos = await req.json().catch(() => ({}));

    const nombre = String(datos.nombre || '').trim().replace(/\s+/g, ' ');
    const fecha = String(datos.fecha || '');
    const observaciones = String(datos.observaciones || '').trim().slice(0, 1000);
    const archivos = Array.isArray(datos.archivos) ? datos.archivos : [];

    if (!datos.equipo_id) return responder({ error: 'Falta la ambulancia' }, 400);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fecha > hoyEnChile()) {
      return responder({ error: 'La fecha de revisión no es válida' }, 400);
    }
    if (nombre.length < 2 || nombre.length > 120) return responder({ error: 'Escribe tu nombre' }, 400);
    if (typeof datos.material_caducado !== 'boolean' || typeof datos.reponer_material !== 'boolean') {
      return responder({ error: 'Responde las dos preguntas: material caducado y reponer material' }, 400);
    }
    if (archivos.length < 1) return responder({ error: 'Adjunta la pauta completada' }, 400);
    if (archivos.length > MAX_ARCHIVOS) return responder({ error: `Se pueden subir hasta ${MAX_ARCHIVOS} archivos` }, 400);

    let equipo = null;
    try { equipo = await base44.asServiceRole.entities.Equipo.get(datos.equipo_id); } catch { equipo = null; }
    if (!equipo || equipo.tipo !== 'ambulancia') return responder({ error: 'La Pauta de Cabina es solo para ambulancias' }, 400);

    // Validar todos antes de guardar el primero: si uno no sirve, no queda
    // nada a medias en el Storage.
    let total = 0;
    const listos = [];
    for (const a of archivos) {
      const base64 = typeof a?.base64 === 'string' ? a.base64 : '';
      const tipo = TIPOS[a?.tipo];
      if (!tipo || !base64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
        return responder({ error: `«${a?.nombre || 'archivo'}» no es PDF, Word ni foto` }, 400);
      }
      const bytes = bytesDe(base64);
      if (bytes > MAX_BYTES) return responder({ error: `«${a.nombre}» pesa más de 10 MB` }, 400);
      total += bytes;
      if (!tipo.firma(atob(base64.slice(0, 24)))) {
        return responder({ error: `«${a.nombre}» no es un ${tipo.ext.toUpperCase()} válido` }, 400);
      }
      listos.push({ base64, tipo: a.tipo, ext: tipo.ext, nombre: String(a.nombre || '').slice(0, 120), bytes });
    }
    if (total > MAX_TOTAL) return responder({ error: 'Entre todos los archivos no pueden pasar de 20 MB' }, 400);

    const carpeta = `pautas-cabina/${String(equipo.id).replace(/[^\w\-]/g, '_')}`;
    const sello = Date.now();
    const guardados = [];
    for (const [i, a] of listos.entries()) {
      const ruta = `${carpeta}/${fecha}-${sello}-${i + 1}-${nombreSeguro(a.nombre, a.ext)}`;
      const { file_url } = await base44.asServiceRole.integrations.Core.GuardarArchivo({ ruta, base64: a.base64, tipo: a.tipo });
      guardados.push({ nombre: a.nombre || nombreSeguro(a.nombre, a.ext), url: file_url, tipo: a.tipo, tamano: a.bytes });
    }

    // Igual que guardarInspeccionPendiente: marca y modelo. La patente la
    // agrega la pantalla al lado, desde datos_json.equipo.
    const etiqueta = `${equipo.marca || ''} ${equipo.modelo || ''}`.trim();
    const registro = await base44.asServiceRole.entities.InspeccionPendiente.create({
      tipo_formulario: 'pauta_cabina',
      equipo_id: equipo.id,
      equipo_label: etiqueta || equipo.id,
      conductor: nombre,
      fecha,
      observaciones,
      datos_json: JSON.stringify({
        equipo: {
          marca: equipo.marca,
          modelo: equipo.modelo,
          tipo: equipo.tipo,
          patente: equipo.patente,
          centro_principal: equipo.centro_principal,
          subsede: equipo.subsede,
          numero_inventario: equipo.numero_inventario,
        },
        conductor: nombre,
        fecha,
        hora_registro: new Date().toISOString(),
        material_caducado: datos.material_caducado,
        reponer_material: datos.reponer_material,
        archivos: guardados,
      }),
      estado: 'pendiente',
    });

    return responder({ ok: true, id: registro.id, archivos: guardados.length });
  } catch (error) {
    return responder({ error: error.message }, 500);
  }
}
