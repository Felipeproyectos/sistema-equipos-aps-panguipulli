import { createClientFromRequest } from '#compat';

// Aviso por correo del recorrido de una solicitud de equipo vital
// (migracion/31_solicitudes_monitor.sql):
//   · llega al Monitor Corporativo (derivada) → a cada Monitor Corporativo
//   · el Monitor la devuelve o la cierra      → a quien la envió y a quien la pidió
//
// Solo la dispara el trigger de Postgres, por /webhooks (con el secreto; ver
// SOLO_WEBHOOK en servidor/index.js). No se confía en lo que trae el cuerpo:
// se vuelve a leer la fila de la base, y se avisa solo si el estado cambió.

const ENV = (typeof process !== 'undefined' && process.env) || {};

const escapar = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const CATEGORIA = { mantenimiento: 'Mantenimiento', compra_insumo: 'Compra de insumo', desperfecto_tecnico: 'Desperfecto técnico' };
const PRIORIDAD = { critica: 'CRÍTICA', alta: 'Alta', media: 'Media', baja: 'Baja' };
const OPERATIVIDAD = { operativo: 'Operativo', operativo_con_restricciones: 'Operativo con restricciones', fuera_de_servicio: 'Fuera de servicio' };
const RESULTADO = { devuelta: 'fue devuelta para completar', finalizada: 'fue resuelta', rechazada: 'se cerró: no procede' };

function urlDelSistema() {
  const explicita = (ENV.APP_URL || '').trim();
  if (explicita) return explicita.replace(/\/+$/, '');
  const cors = (ENV.CORS_ORIGIN || '').split(',').map((s) => s.trim()).find((s) => s.startsWith('http'));
  return (cors || 'https://gestion.apscolab.com').replace(/\/+$/, '');
}

function tabla(s) {
  const filas = [
    ['N°', s.numero_solicitud],
    ['Tipo', CATEGORIA[s.categoria]],
    ['Prioridad', PRIORIDAD[s.prioridad]],
    ['Estado del equipo', OPERATIVIDAD[s.operatividad]],
    ['CESFAM / centro', [s.centro, s.subsede].filter(Boolean).join(' · ')],
    ['Ubicación exacta', s.ubicacion_especifica],
    ['Equipo', [s.equipo_marca, s.equipo_modelo].filter(Boolean).join(' ')],
    ['N° de serie', s.equipo_numero_serie],
    ['N° de inventario', s.equipo_numero_inventario],
    ['Insumo', s.insumo_nombre ? `${s.insumo_nombre} × ${s.insumo_cantidad || 1}` : ''],
    ['Especificación', s.insumo_especificacion],
    ['Falla detectada el', s.fecha_deteccion],
    ['Solicita', [s.usuario_nombre, s.solicitante_cargo].filter(Boolean).join(', ')],
    ['Contacto', [s.solicitante_telefono, s.usuario_email].filter(Boolean).join(' · ')],
    ['Enviada por', s.derivada_por_nombre],
  ].filter(([, v]) => String(v ?? '').trim());
  return `<table style="width:100%;border-collapse:collapse;margin:12px 0;font-size:13px">${filas.map(([k, v]) => `
    <tr><td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;color:#64748b;white-space:nowrap">${escapar(k)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;font-weight:600">${escapar(v)}</td></tr>`).join('')}
  </table>`;
}

function cuerpo({ titulo, intro, s, extra, enlace }) {
  return `
<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:560px;margin:0 auto;color:#0f172a">
  <div style="background:linear-gradient(135deg,#4F46E5,#312E81);padding:20px 24px;border-radius:14px 14px 0 0">
    <p style="margin:0;color:#c7d2fe;font-size:11px;letter-spacing:.12em;text-transform:uppercase">Corporación Municipal de Panguipulli</p>
    <h1 style="margin:4px 0 0;color:#fff;font-size:18px">${escapar(titulo)}</h1>
  </div>
  <div style="border:1px solid #e2e8f0;border-top:none;border-radius:0 0 14px 14px;padding:22px;font-size:14px;line-height:1.6">
    <p>${escapar(intro)}</p>
    ${tabla(s)}
    <p style="white-space:pre-line;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px">${escapar(s.descripcion || s.observaciones || '')}</p>
    ${extra ? `<p style="white-space:pre-line;background:#eef2ff;border:1px solid #c7d2fe;border-radius:10px;padding:10px 12px"><strong>Monitor Corporativo:</strong> ${escapar(extra)}</p>` : ''}
    <p style="margin:20px 0"><a href="${enlace}" style="background:#4F46E5;color:#fff;text-decoration:none;padding:11px 20px;border-radius:9px;font-weight:600;display:inline-block">Abrir en el sistema</a></p>
    <p style="color:#94a3b8;font-size:12px">Sistema de Gestión de Equipamiento Crítico · Equipos Vitales</p>
  </div>
</div>`;
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const id = body?.event?.entity_id || body?.data?.id;
    if (!id) return Response.json({ error: 'ID de solicitud requerido' }, { status: 400 });

    const nuevo = body?.data?.estado;
    const anterior = body?.old_data?.estado;
    if (anterior && anterior === nuevo) return Response.json({ ok: true, sinCambio: true });

    const db = base44.asServiceRole.entities;
    const s = await db.Solicitud.get(id).catch(() => null);
    if (!s) return Response.json({ error: 'Solicitud no encontrada' }, { status: 404 });
    // La fila manda: si ya cambió de nuevo, se avisa de lo que hay ahora.
    if (s.estado !== nuevo) return Response.json({ ok: true, desactualizado: true });

    const url = urlDelSistema();
    let destinatarios = [];
    let asunto = '';
    let html = '';

    if (s.estado === 'derivada') {
      const usuarios = await db.User.filter({ role: 'monitor_corporativo' }, 'full_name', 100).catch(() => []);
      destinatarios = usuarios.map((u) => u.email).filter(Boolean);
      const urgente = s.prioridad === 'critica' || s.operatividad === 'fuera_de_servicio';
      asunto = `${urgente ? '[URGENTE] ' : ''}Solicitud ${s.numero_solicitud || ''} — ${CATEGORIA[s.categoria] || 'Equipo vital'} · ${s.centro || ''}`.replace(/\s+/g, ' ').trim();
      html = cuerpo({
        titulo: 'Nueva solicitud de un centro',
        intro: `${s.derivada_por_nombre || 'El Encargado de Salud'} envió esta solicitud para tu gestión.`,
        s, enlace: `${url}/SolicitudesMonitor`,
      });
    } else if (RESULTADO[s.estado]) {
      destinatarios = [...new Set([s.derivada_por_email, s.usuario_email].filter(Boolean).map((e) => e.toLowerCase()))];
      asunto = `Solicitud ${s.numero_solicitud || ''} ${RESULTADO[s.estado]}`.replace(/\s+/g, ' ').trim();
      html = cuerpo({
        titulo: `La solicitud ${RESULTADO[s.estado]}`,
        intro: `${s.monitor_nombre || 'El Monitor Corporativo'} respondió la solicitud de ${[s.equipo_marca, s.equipo_modelo].filter(Boolean).join(' ') || 'su equipo'}.`,
        s, extra: s.resolucion, enlace: `${url}/SolicitudesV2`,
      });
    } else {
      return Response.json({ ok: true, sinAviso: true });
    }

    const resultados = [];
    for (const to of destinatarios) {
      try {
        await base44.integrations.Core.SendEmail({ to, subject: asunto, body: html });
        resultados.push({ email: to, ok: true });
      } catch (e) {
        resultados.push({ email: to, ok: false, error: e.message });
      }
    }
    return Response.json({ ok: true, notificados: resultados, solicitud_id: id });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
