import { createClientFromRequest } from '#compat';

// La pantalla de Alertas deja mandar un aviso por correo a mano. En Base44 eso
// salia del cliente con integrations.Core.SendEmail; aca tiene que pasar por el
// servidor, que es quien guarda la llave de Resend.
//
// Dos frenos, porque un endpoint que manda correos arbitrarios es un regalo
// para quien quiera usarlo de spam:
//   1. solo los roles que de verdad avisan
//   2. solo a correos que existen en la tabla de usuarios
const ROLES_QUE_AVISAN = ['super_admin', 'admin', 'encargado_salud', 'jefe_taller'];

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (!ROLES_QUE_AVISAN.includes(user.role)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { to, subject, body } = await req.json();
    if (!to || !subject || !body) {
      return Response.json({ error: 'Faltan to, subject o body' }, { status: 400 });
    }

    // El destinatario tiene que ser gente del sistema, no cualquier direccion.
    const usuarios = await base44.asServiceRole.entities.User.list('-created_date', 500);
    const conocidos = new Set(usuarios.map((u) => (u.email || '').toLowerCase()));
    const destinatarios = (Array.isArray(to) ? to : [to])
      .map((d) => String(d).trim().toLowerCase())
      .filter((d) => conocidos.has(d));

    if (destinatarios.length === 0) {
      return Response.json(
        { error: 'Ningun destinatario esta registrado en el sistema' },
        { status: 400 },
      );
    }

    let enviados = 0;
    for (const destino of destinatarios) {
      try {
        await base44.asServiceRole.integrations.Core.SendEmail({ to: destino, subject, body });
        enviados++;
      } catch (e) {
        console.error('No se pudo enviar a', destino, e.message);
      }
    }

    return Response.json({ ok: true, enviados, pedidos: destinatarios.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
