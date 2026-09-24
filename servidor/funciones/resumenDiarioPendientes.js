import { createClientFromRequest } from '#compat';
import { CONTADORES, datosParaRol, resumenParaCorreo } from '../compartido/contadoresMenu.js';

// El resumen de la mañana por correo: a cada persona, lo que la espera en el
// sistema. Existe porque un pedido puede quedarse detenido días si nadie abre
// la pantalla — el Taller propone una fecha y Movilización no entra; Salud
// informa una falla y nadie la revisa. El número del menú solo lo ve quien ya
// entró; el correo llega igual.
//
// Cuenta con las MISMAS reglas que el número del menú (contadoresMenu.js,
// copiado a servidor/compartido/ por migracion/sincronizar_compartido.py): lo
// que dice el correo es lo que la persona encuentra al entrar.
//
// A quién le llega: a quien tiene algo pendiente en su menú. Si no hay nada,
// no se manda nada — un correo diario que dice "todo bien" enseña a no abrirlo.
// Las alertas solas tampoco lo disparan: ya tienen su propio correo.
// Tampoco a quien no tiene tareas en el menú (Monitor, choferes, Usuario).
//
// Lo que NO mira: si la cuenta está suspendida. Eso vive en Supabase Auth,
// que este proyecto comparte con otra aplicación, y acá no se consulta. Quien
// esté suspendido y tenga algo pendiente a su nombre recibe el correo; al
// intentar entrar, el sistema no lo deja.
//
// Cuándo: lo programa tareas.js, días hábiles a las 08:00 (Chile). Se apaga
// con la variable RESUMEN_DIARIO=off en Railway.
//
// Base del Sistema puede llamarla a mano con { soloAmi: true } para recibir
// su propio resumen y ver cómo llega, sin mandárselo a nadie más.

const CARGAS = {
  solicitudes: (db) => db.Solicitud.list('-created_date', 1000),
  ordenes: (db) => db.OrdenTrabajo.list('-created_date', 1000),
  equipos: (db) => db.Equipo.list('-updated_date', 1000),
  repuestos: (db) => db.SolicitudRepuesto.list('-created_date', 500),
  repuestosSalud: (db) => db.SolicitudRepuestoSalud.list('-created_date', 500),
  inspecciones: (db) => db.InspeccionPendiente.filter({ estado: 'pendiente' }, '-created_date', 500),
  alertas: (db) => db.Alerta.filter({ estado: 'activa' }, '-created_date', 500),
};

// En Railway es process.env; en el modo local la función corre en el
// navegador, donde `process` no existe.
const ENV = (typeof process !== 'undefined' && process.env) || {};

const escapar = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function urlDelSistema() {
  const explicita = (ENV.APP_URL || '').trim();
  if (explicita) return explicita.replace(/\/+$/, '');
  const cors = (ENV.CORS_ORIGIN || '').split(',').map((s) => s.trim()).find((s) => s.startsWith('http'));
  return (cors || 'https://gestion.apscolab.com').replace(/\/+$/, '');
}

function cuerpoDelCorreo(nombre, lineas, url) {
  const filas = lineas.map((l) => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0">
          <a href="${url}/${l.pagina}" style="color:#1b63b0;font-weight:600;text-decoration:none">${escapar(l.etiqueta)}</a>
          <div style="color:#64748b;font-size:12px">${escapar(l.frase)}</div>
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;text-align:right;font-size:18px;font-weight:700;color:#b45309">${l.n}</td>
      </tr>`).join('');
  return `
<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;color:#0f172a">
  <div style="background:linear-gradient(135deg,#1b63b0,#0b2138);padding:22px 24px;border-radius:14px 14px 0 0">
    <p style="margin:0;color:#bfdbfe;font-size:11px;letter-spacing:.12em;text-transform:uppercase">Corporación Municipal de Panguipulli</p>
    <h1 style="margin:4px 0 0;color:#fff;font-size:19px">Lo que te espera hoy</h1>
  </div>
  <div style="border:1px solid #e2e8f0;border-top:none;border-radius:0 0 14px 14px;padding:24px;font-size:14px;line-height:1.6">
    <p>Hola${nombre ? ` ${escapar(nombre)}` : ''}:</p>
    <p>Esto está esperando una acción tuya en el sistema:</p>
    <table style="width:100%;border-collapse:collapse;margin:14px 0">${filas}</table>
    <p style="margin:22px 0">
      <a href="${url}/" style="background:#1b63b0;color:#fff;text-decoration:none;padding:12px 22px;border-radius:9px;font-weight:600;display:inline-block">Entrar al sistema</a>
    </p>
    <p style="margin-top:22px;color:#94a3b8;font-size:12px">
      Resumen automático de los días hábiles. Solo llega cuando hay algo pendiente.<br>
      Sistema de Gestión de Equipamiento Crítico · Equipos Vitales · Movilización · Taller Mecánico
    </p>
  </div>
</div>`;
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const quien = await base44.auth.me();
    if (!quien) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const esTarea = quien.id === 'sistema';
    if (!esTarea && quien.role !== 'super_admin') {
      return Response.json({ error: 'Solo Base del Sistema' }, { status: 403 });
    }
    const { soloAmi = false } = await req.json().catch(() => ({}));
    if (esTarea && String(ENV.RESUMEN_DIARIO || '').toLowerCase() === 'off') {
      return Response.json({ ok: true, apagado: true });
    }
    if (!esTarea && !soloAmi) {
      return Response.json({ error: 'A mano solo se puede pedir el propio (soloAmi)' }, { status: 400 });
    }

    const db = base44.asServiceRole.entities;
    const destinatarios = soloAmi
      ? [quien]
      : (await db.User.list('email', 1000)).filter((u) => u.email && u.role);

    // Solo se cargan las tablas que usa alguno de los roles que van a recibir.
    const rolesConContador = new Set(Object.values(CONTADORES).flatMap((c) => c.roles));
    const necesarias = new Set(destinatarios.filter((u) => rolesConContador.has(u.role))
      .flatMap((u) => datosParaRol(u.role)));
    const datos = {};
    for (const n of necesarias) datos[n] = await CARGAS[n](db).catch(() => []);

    const url = urlDelSistema();
    const enviados = [];
    const sinNada = [];
    const fallidos = [];
    for (const u of destinatarios) {
      const lineas = resumenParaCorreo(u.role, u.email, datos);
      if (!lineas.length) { sinNada.push(u.email); continue; }
      const total = lineas.filter((l) => !l.soloInfo).reduce((s, l) => s + l.n, 0);
      try {
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: u.email,
          subject: `Tienes ${total} ${total === 1 ? 'cosa pendiente' : 'cosas pendientes'} en el sistema`,
          body: cuerpoDelCorreo(u.full_name, lineas, url),
        });
        enviados.push(u.email);
      } catch (e) {
        fallidos.push(`${u.email}: ${e.message}`);
      }
    }

    return Response.json({ ok: fallidos.length === 0, enviados: enviados.length, sinNada: sinNada.length, fallidos });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
