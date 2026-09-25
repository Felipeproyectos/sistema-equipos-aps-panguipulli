import { createClientFromRequest } from '#compat';

// Todo lo que tiene que ver con PODER ENTRAR al sistema. Antes esto vivía en la
// plataforma de Base44 (base44.users.inviteUser) y la migración a Supabase lo
// dejó sin reemplazo: crear un usuario reventaba, y quien no alcanzó a quedar
// en Supabase Auth simplemente no podía entrar, sin que nadie pudiera verlo
// desde la aplicación.
//
// Una cuenta que funciona son DOS cosas que tienen que existir y coincidir:
//   1. la fila en `usuario`  → rol, centro, subsedes (lo que la app muestra)
//   2. la cuenta en Supabase Auth → correo y clave (lo que deja entrar)
// El enlace entre ambas es el correo (ver mi_rol() en 03_policies.sql). Si
// falta cualquiera de las dos, la persona queda fuera.
//
// Acciones:
//   diagnostico  → qué cuentas están completas y cuáles no (nadie queda ciego)
//   crear        → alta completa: fila + cuenta + clave temporal + correo
//   reparar      → crea las cuentas de Auth que faltan, en lote
//   restablecer  → clave nueva: temporal automática, o una elegida a mano
//   recuperar    → enlace de recuperación por correo (público, sin sesión)
//   actualizar   → corregir el correo o el nombre de una ficha
//   suspender    → dejar a alguien fuera sin borrar su historial (y revertirlo)
//   eliminar     → borrar la ficha y su cuenta de acceso
//   ingreso      → dejar anotado en Auditoría que alguien entró

// La misma jerarquía de src/lib/roles.js. Se repite acá a propósito: el
// servidor no puede confiar en que el cliente respetó la matriz, y un endpoint
// que crea cuentas es justo donde eso importa.
const ROLES_VALIDOS = [
  'super_admin', 'admin', 'encargado_salud', 'encargado_compras_salud',
  'monitor_corporativo', 'encargado_movilizacion', 'chofer',
  'jefe_taller', 'encargado_compras_taller', 'mecanico', 'user',
];

const QUIEN_CREA_A_QUIEN = {
  super_admin: ROLES_VALIDOS,
  admin: ['admin', 'encargado_salud', 'encargado_compras_salud', 'user'],
  encargado_salud: ['user'],
  jefe_taller: ['mecanico', 'encargado_compras_taller'],
  encargado_compras_salud: [],
  encargado_compras_taller: [],
  monitor_corporativo: [],
  // Movilizacion da de alta a sus choferes y a nadie mas. Es la unica
  // excepcion a que solo Base del Sistema toque los perfiles de flota.
  encargado_movilizacion: ['chofer'],
  mecanico: [],
  user: [],
  chofer: [],
};

// Quién puede ver el diagnóstico y reparar cuentas: administrar el acceso de
// TODA la red es distinto de crear una cuenta dentro del propio centro.
const ROLES_QUE_ADMINISTRAN = ['super_admin', 'admin'];

function puedeCrear(rolCreador, rolObjetivo) {
  // super_admin nunca se asigna desde la aplicación: es la máxima autoridad y
  // se gestiona fuera de este flujo.
  if (rolObjetivo === 'super_admin') return false;
  return (QUIEN_CREA_A_QUIEN[rolCreador] || []).includes(rolObjetivo);
}

// Legible y tecleable por teléfono: sin caracteres que se confundan (0/O, 1/l).
function claveTemporal() {
  const abc = 'ABCDEFGHJKMNPQRSTUVWXYZ';
  const num = '23456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += abc[Math.floor(Math.random() * abc.length)];
  for (let i = 0; i < 4; i++) s += num[Math.floor(Math.random() * num.length)];
  return `Aps-${s}`;
}

const normalizar = (correo) => String(correo || '').trim().toLowerCase();

// ── Supabase Admin API ──────────────────────────────────────────────────────
// El SDK del servidor se creó con la llave de servicio, pero `auth.admin` no
// pasa por base44compat: se habla con el endpoint directo.
async function admin(metodo, ruta, cuerpo) {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  const r = await fetch(`${SUPABASE_URL}${ruta}`, {
    method: metodo,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'content-type': 'application/json',
    },
    ...(cuerpo !== undefined && { body: JSON.stringify(cuerpo) }),
  });
  const texto = await r.text();
  const datos = texto ? JSON.parse(texto) : null;
  if (!r.ok) throw new Error(datos?.msg || datos?.error_description || datos?.message || `Auth ${r.status}`);
  return datos;
}

async function buscarEnAuth(correo) {
  const r = await admin('GET', `/auth/v1/admin/users?filter=${encodeURIComponent(correo)}`);
  return (r?.users || []).find((u) => normalizar(u.email) === correo) || null;
}

async function listarAuth() {
  // Paginado: el Admin API entrega 50 por página si no se le pide más.
  const cuentas = new Map();
  for (let pagina = 1; pagina <= 20; pagina++) {
    const r = await admin('GET', `/auth/v1/admin/users?page=${pagina}&per_page=200`);
    const lote = r?.users || [];
    for (const u of lote) if (u.email) cuentas.set(normalizar(u.email), u);
    if (lote.length < 200) break;
  }
  return cuentas;
}

async function crearEnAuth(correo, clave, nombre) {
  return admin('POST', '/auth/v1/admin/users', {
    email: correo,
    password: clave,
    email_confirm: true,   // sin SMTP propio no hay confirmación que llegue
    user_metadata: { full_name: nombre || '' },
  });
}

async function fijarClave(authId, clave) {
  return admin('PUT', `/auth/v1/admin/users/${authId}`, { password: clave, email_confirm: true });
}

async function cambiarCorreoEnAuth(authId, correo) {
  return admin('PUT', `/auth/v1/admin/users/${authId}`, { email: correo, email_confirm: true });
}

async function cambiarNombreEnAuth(authId, nombre) {
  return admin('PUT', `/auth/v1/admin/users/${authId}`, { user_metadata: { full_name: nombre || '' } });
}

// Suspender = "ban" de Supabase Auth. Se prefirió esto a una columna propia
// porque frena el ingreso en la puerta, no en la pantalla: mientras dure, ni
// la clave correcta abre sesión. `none` lo levanta. Cien años es la forma de
// decir "hasta que alguien lo revierta" — el Admin API pide una duración.
const SUSPENSION_LARGA = '876000h';

async function suspenderEnAuth(authId, suspender) {
  return admin('PUT', `/auth/v1/admin/users/${authId}`, {
    ban_duration: suspender ? SUSPENSION_LARGA : 'none',
  });
}

async function borrarDeAuth(authId) {
  return admin('DELETE', `/auth/v1/admin/users/${authId}`);
}

// Una cuenta está suspendida si su ban sigue vigente.
function estaSuspendida(cuenta) {
  const hasta = cuenta?.banned_until;
  if (!hasta) return false;
  const t = Date.parse(hasta);
  return Number.isFinite(t) && t > Date.now();
}

// ── correo ──────────────────────────────────────────────────────────────────
const plantilla = (titulo, cuerpo) => `
<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;color:#0f172a">
  <div style="background:linear-gradient(135deg,#1b63b0,#0b2138);padding:22px 24px;border-radius:14px 14px 0 0">
    <p style="margin:0;color:#bfdbfe;font-size:11px;letter-spacing:.12em;text-transform:uppercase">Corporación Municipal de Panguipulli</p>
    <h1 style="margin:4px 0 0;color:#fff;font-size:19px">${titulo}</h1>
  </div>
  <div style="border:1px solid #e2e8f0;border-top:none;border-radius:0 0 14px 14px;padding:24px;font-size:14px;line-height:1.6">
    ${cuerpo}
    <p style="margin-top:22px;color:#94a3b8;font-size:12px">
      Sistema de Gestión de Equipamiento Crítico · Área Salud
    </p>
  </div>
</div>`;

async function avisarClaveTemporal(base44, correo, nombre, clave) {
  const cuerpo = `
    <p>Hola${nombre ? ` ${nombre}` : ''}:</p>
    <p>Ya tienes acceso al Sistema de Gestión de Equipamiento Crítico.</p>
    <p style="margin:18px 0;padding:16px;background:#f1f5f9;border-radius:10px">
      <strong>Correo:</strong> ${correo}<br>
      <strong>Clave temporal:</strong>
      <span style="font-family:ui-monospace,Menlo,monospace;font-size:17px;font-weight:700">${clave}</span>
    </p>
    <p>Al entrar por primera vez el sistema te pedirá cambiarla por una tuya.</p>`;
  await base44.asServiceRole.integrations.Core.SendEmail({
    to: correo,
    subject: 'Tu acceso al Sistema de Equipamiento Crítico',
    body: plantilla('Acceso creado', cuerpo),
  });
}

// ── acciones ────────────────────────────────────────────────────────────────

// Nadie puede arreglar lo que no puede ver: esto dice, persona por persona, si
// puede entrar y qué le falta si no.
async function diagnostico(base44) {
  const filas = await base44.asServiceRole.entities.User.list('email', 1000);
  const cuentas = await listarAuth();
  const vistos = new Set();

  const usuarios = filas.map((u) => {
    const correo = normalizar(u.email);
    vistos.add(correo);
    const cuenta = correo ? cuentas.get(correo) : null;
    const problemas = [];
    if (!correo) problemas.push('sin_correo');
    else if (!cuenta) problemas.push('sin_cuenta_de_acceso');
    if (!u.role) problemas.push('sin_rol');
    else if (!ROLES_VALIDOS.includes(u.role)) problemas.push('rol_desconocido');
    return {
      id: u.id,
      email: u.email || '',
      full_name: u.full_name || '',
      role: u.role || '',
      centro_principal: u.centro_principal || '',
      tiene_cuenta: !!cuenta,
      ultimo_ingreso: cuenta?.last_sign_in_at || null,
      creada: cuenta?.created_at || null,
      suspendido: estaSuspendida(cuenta),
      debe_cambiar_clave: !!u.force_password_reset,
      puede_entrar: problemas.length === 0,
      problemas,
    };
  });

  // Cuentas de Auth sin ficha en este sistema. OJO: el proyecto de Supabase
  // esta compartido con otra aplicacion, asi que la mayoria de estas son de esa
  // otra app y NO son un problema — nunca intentan entrar aca. Se listan como
  // dato, no como falla: solo importa si alguien de gestion aparece en la lista.
  const ajenas = [...cuentas.values()]
    .filter((c) => !vistos.has(normalizar(c.email)))
    .map((c) => ({ email: c.email, ultimo_ingreso: c.last_sign_in_at || null }));

  return {
    usuarios,
    cuentas_ajenas: ajenas,
    resumen: {
      total: usuarios.length,
      pueden_entrar: usuarios.filter((u) => u.puede_entrar).length,
      sin_cuenta: usuarios.filter((u) => u.problemas.includes('sin_cuenta_de_acceso')).length,
      sin_rol: usuarios.filter((u) => u.problemas.includes('sin_rol') || u.problemas.includes('rol_desconocido')).length,
      suspendidos: usuarios.filter((u) => u.suspendido).length,
      cuentas_ajenas: ajenas.length,
    },
  };
}

async function crear(base44, quien, datos) {
  const correo = normalizar(datos.email);
  const rol = datos.role;
  if (!correo || !correo.includes('@')) return { error: 'Correo inválido', status: 400 };
  if (!puedeCrear(quien.role, rol)) return { error: 'No puedes asignar ese rol', status: 403 };

  // El encargado de salud solo da de alta dentro de su propio centro.
  const centro = quien.role === 'encargado_salud'
    ? (quien.centro_principal || '')
    : (datos.centro_principal || '');

  const existentes = await base44.asServiceRole.entities.User.filter({}, 'email', 1000);
  const ficha = existentes.find((u) => normalizar(u.email) === correo) || null;
  let cuenta = await buscarEnAuth(correo);

  if (ficha && cuenta) return { error: 'Ese correo ya tiene acceso al sistema', status: 409 };

  const clave = claveTemporal();
  if (!cuenta) cuenta = await crearEnAuth(correo, clave, datos.full_name);
  else await fijarClave(cuenta.id, clave);   // había cuenta suelta: se reaprovecha

  // Sin `activo`: esa columna no existe en `usuario` y PostgREST rechazaba el
  // insert entero con "Could not find the 'activo' column of 'usuario' in the
  // schema cache", asi que no se podia crear ninguna cuenta. Tampoco hace
  // falta: quien puede entrar lo decide Supabase Auth (si existe la cuenta),
  // no una casilla en esta tabla. `activo` si existe en equipo y repuesto,
  // donde es el borrado logico; de ahi la confusion.
  const campos = {
    email: correo,
    full_name: datos.full_name || correo.split('@')[0],
    role: rol,
    centro_principal: centro,
    centros_asignados: centro ? [centro] : [],
    subsedes_asignadas: Array.isArray(datos.subsedes_asignadas) ? datos.subsedes_asignadas : [],
    auth_id: cuenta.id,
    force_password_reset: true,
  };
  const guardado = ficha
    ? await base44.asServiceRole.entities.User.update(ficha.id, campos)
    : await base44.asServiceRole.entities.User.create(campos);

  let correo_enviado = true;
  try { await avisarClaveTemporal(base44, correo, campos.full_name, clave); }
  catch (e) { correo_enviado = false; console.error('No se pudo avisar por correo:', e.message); }

  // La clave viaja de vuelta a propósito: si el correo no salió, quien creó la
  // cuenta tiene que poder dictarla. Solo la ve quien acaba de crearla.
  return { usuario: guardado, clave_temporal: clave, correo_enviado };
}

// Las cuentas que faltan, en lote. Devuelve la clave de cada una para que
// Informática pueda entregarlas aunque el correo no salga.
async function reparar(base44) {
  const filas = await base44.asServiceRole.entities.User.list('email', 1000);
  const cuentas = await listarAuth();
  const reparados = [];

  for (const u of filas) {
    const correo = normalizar(u.email);
    if (!correo || cuentas.has(correo)) continue;
    try {
      const clave = claveTemporal();
      const cuenta = await crearEnAuth(correo, clave, u.full_name);
      await base44.asServiceRole.entities.User.update(u.id, {
        auth_id: cuenta.id, force_password_reset: true,
      });
      let correo_enviado = true;
      try { await avisarClaveTemporal(base44, correo, u.full_name, clave); }
      catch { correo_enviado = false; }
      reparados.push({ email: correo, full_name: u.full_name || '', clave_temporal: clave, correo_enviado });
    } catch (e) {
      reparados.push({ email: correo, full_name: u.full_name || '', error: e.message });
    }
  }
  return { reparados, total: reparados.length };
}

async function restablecer(base44, quien, datos) {
  const correo = normalizar(datos.email);
  if (!correo) return { error: 'Falta el correo', status: 400 };

  const filas = await base44.asServiceRole.entities.User.list('email', 1000);
  const ficha = filas.find((u) => normalizar(u.email) === correo);
  if (!ficha) return { error: 'Ese correo no tiene ficha en el sistema', status: 404 };

  // Quien administra puede restablecer a cualquiera; el resto, solo a las
  // cuentas de los roles que podría haber creado.
  const mando = ROLES_QUE_ADMINISTRAN.includes(quien.role) || puedeCrear(quien.role, ficha.role);
  if (!mando) return { error: 'No puedes restablecer la clave de esa cuenta', status: 403 };

  // Se puede dictar una clave concreta en vez de aceptar la generada. Cuando
  // la elige una persona NO se exige cambiarla al entrar: es a propósito — si
  // se acordó por teléfono, obligar a cambiarla enseguida no sirve de nada.
  const aMano = String(datos.clave || '').trim();
  if (aMano && aMano.length < 8) {
    return { error: 'La clave debe tener al menos 8 caracteres', status: 400 };
  }
  const clave = aMano || claveTemporal();

  let cuenta = await buscarEnAuth(correo);
  if (cuenta) await fijarClave(cuenta.id, clave);
  else cuenta = await crearEnAuth(correo, clave, ficha.full_name);

  await base44.asServiceRole.entities.User.update(ficha.id, {
    auth_id: cuenta.id, force_password_reset: !aMano,
  });

  let correo_enviado = true;
  try { await avisarClaveTemporal(base44, correo, ficha.full_name, clave); }
  catch { correo_enviado = false; }

  return { email: correo, clave_temporal: clave, correo_enviado, elegida: !!aMano };
}

// Recuperación por el propio usuario, SIN sesión. El correo sale por Resend y
// no por el SMTP del proyecto: el de Supabase está limitado a unos pocos envíos
// por hora y su Site URL apunta a otra aplicación.
async function recuperar(base44, datos, origen) {
  const correo = normalizar(datos.email);
  // Nunca se delata si el correo existe o no: siempre la misma respuesta.
  const respuesta = { enviado: true };
  if (!correo || !correo.includes('@')) return respuesta;

  try {
    const filas = await base44.asServiceRole.entities.User.list('email', 1000);
    const ficha = filas.find((u) => normalizar(u.email) === correo);
    if (!ficha) return respuesta;

    const r = await admin('POST', '/auth/v1/admin/generate_link', {
      type: 'recovery',
      email: correo,
      options: { redirect_to: `${origen}/` },
    });
    const enlace = r?.properties?.action_link || r?.action_link;
    if (!enlace) return respuesta;

    const cuerpo = `
      <p>Hola${ficha.full_name ? ` ${ficha.full_name}` : ''}:</p>
      <p>Recibimos una solicitud para restablecer la clave de tu cuenta.</p>
      <p style="margin:22px 0">
        <a href="${enlace}" style="background:#1b63b0;color:#fff;text-decoration:none;padding:12px 22px;border-radius:9px;font-weight:600;display:inline-block">Crear una clave nueva</a>
      </p>
      <p style="color:#64748b;font-size:13px">El enlace vence en una hora. Si no fuiste tú, ignora este correo: tu clave actual sigue funcionando.</p>`;
    await base44.asServiceRole.integrations.Core.SendEmail({
      to: correo,
      subject: 'Restablecer tu clave',
      body: plantilla('Recuperación de clave', cuerpo),
    });
  } catch (e) {
    console.error('Recuperación falló para', correo, e.message);
  }
  return respuesta;
}

// ── quién puede tocar la ficha de quién ─────────────────────────────────────
// Mismo criterio que restablecer: quien administra llega a cualquiera; el resto
// solo a los roles que podría haber creado. Y nadie se toca a sí mismo, para
// que no exista el caso de quedarse sin administrador por accidente.
async function fichaBajoMando(base44, quien, datos) {
  const correo = normalizar(datos.email);
  if (!correo) return { error: 'Falta el correo', status: 400 };

  const filas = await base44.asServiceRole.entities.User.list('email', 1000);
  const ficha = filas.find((u) => normalizar(u.email) === correo);
  if (!ficha) return { error: 'Ese correo no tiene ficha en el sistema', status: 404 };

  if (normalizar(quien.email) === correo) {
    return { error: 'No puedes hacer eso sobre tu propia cuenta', status: 400 };
  }
  const mando = ROLES_QUE_ADMINISTRAN.includes(quien.role) || puedeCrear(quien.role, ficha.role);
  if (!mando) return { error: 'No puedes administrar esa cuenta', status: 403 };
  return { ficha, filas };
}

// Corregir el correo o el nombre de alguien.
//
// El correo es el enlace entre la ficha y la cuenta de acceso (ver mi_rol() en
// 03_policies.sql): cambiarlo en un solo lado deja a la persona sin rol y sin
// filas. Por eso acá se cambian LOS DOS, y si Auth falla no se toca la ficha.
async function actualizar(base44, quien, datos) {
  const hallado = await fichaBajoMando(base44, quien, datos);
  if (hallado.error) return hallado;
  const { ficha, filas } = hallado;

  const nuevoCorreo = datos.email_nuevo === undefined ? null : normalizar(datos.email_nuevo);
  const nuevoNombre = datos.full_name === undefined ? null : String(datos.full_name).trim();
  if (nuevoCorreo === null && nuevoNombre === null) {
    return { error: 'No hay nada que cambiar', status: 400 };
  }
  if (nuevoNombre !== null && !nuevoNombre) {
    return { error: 'El nombre no puede quedar vacío', status: 400 };
  }
  if (nuevoCorreo !== null) {
    if (!nuevoCorreo.includes('@')) return { error: 'Correo inválido', status: 400 };
    const chocaFicha = filas.some((u) => u.id !== ficha.id && normalizar(u.email) === nuevoCorreo);
    if (chocaFicha) return { error: 'Ya hay otra persona con ese correo', status: 409 };
    const chocaCuenta = await buscarEnAuth(nuevoCorreo);
    if (chocaCuenta) return { error: 'Ese correo ya tiene una cuenta de acceso', status: 409 };
  }

  const cuenta = await buscarEnAuth(normalizar(ficha.email));
  const cambios = {};

  // Primero Auth. Si revienta, la ficha queda intacta y siguen emparejadas.
  if (nuevoCorreo !== null && nuevoCorreo !== normalizar(ficha.email)) {
    if (cuenta) await cambiarCorreoEnAuth(cuenta.id, nuevoCorreo);
    cambios.email = nuevoCorreo;
  }
  if (nuevoNombre !== null && nuevoNombre !== (ficha.full_name || '')) {
    if (cuenta) await cambiarNombreEnAuth(cuenta.id, nuevoNombre);
    cambios.full_name = nuevoNombre;
  }
  if (!Object.keys(cambios).length) return { ok: true, sin_cambios: true };

  const guardado = await base44.asServiceRole.entities.User.update(ficha.id, cambios);
  return { ok: true, usuario: guardado, cambios };
}

// Dejar a alguien fuera sin borrar nada, o devolverle el acceso.
async function suspender(base44, quien, datos, activar) {
  const hallado = await fichaBajoMando(base44, quien, datos);
  if (hallado.error) return hallado;
  const { ficha } = hallado;

  const cuenta = await buscarEnAuth(normalizar(ficha.email));
  if (!cuenta) return { error: 'Esa persona no tiene cuenta de acceso que suspender', status: 404 };

  await suspenderEnAuth(cuenta.id, !activar);
  return { ok: true, email: normalizar(ficha.email), suspendido: !activar };
}

// Borrar la ficha y su cuenta de acceso. No se deshace.
async function eliminar(base44, quien, datos) {
  const hallado = await fichaBajoMando(base44, quien, datos);
  if (hallado.error) return hallado;
  const { ficha } = hallado;

  // La máxima autoridad no se borra desde la aplicación, igual que no se
  // asigna desde acá.
  if (ficha.role === 'super_admin') {
    return { error: 'La cuenta de Base del Sistema no se elimina desde la aplicación', status: 403 };
  }

  // Primero la cuenta de acceso: si queda la ficha sin cuenta, el diagnóstico
  // lo muestra y se puede arreglar. Al revés quedaría una cuenta suelta que
  // ninguna pantalla lista.
  const cuenta = await buscarEnAuth(normalizar(ficha.email));
  if (cuenta) await borrarDeAuth(cuenta.id);
  await base44.asServiceRole.entities.User.delete(ficha.id);

  return { ok: true, email: normalizar(ficha.email), tenia_cuenta: !!cuenta };
}

// Quien acaba de elegir su clave nueva en el primer ingreso avisa por aca.
//
// No puede hacerlo por su cuenta: la policy `usuario_escribe` solo deja
// escribir en `usuario` a super_admin y admin, asi que el update salia con
// cero filas y PostgREST respondia "Cannot coerce the result to a single JSON
// object". La clave SI quedaba cambiada (eso pasa en Supabase Auth, antes),
// pero la marca no se apagaba: al volver a entrar el sistema le pedia
// cambiarla otra vez, para siempre.
//
// Se hace con la llave de servicio, y solo sobre la ficha de quien llama:
// `quien` sale del token, no del cuerpo del pedido, asi que nadie puede
// apagarle la marca a otro.
async function claveYaCambiada(base44, quien) {
  if (!quien?.id) return { error: 'Sin ficha de usuario', status: 400 };
  if (!quien.force_password_reset) return { ok: true, sin_cambios: true };
  await base44.asServiceRole.entities.User.update(quien.id, { force_password_reset: false });
  return { ok: true };
}

// Deja anotado en Auditoría que alguien entró.
//
// Lo anotaba el navegador directo sobre `acceso_no_autorizado`, pero la policy
// `acceso_no_autorizado_create` solo deja escribir esa tabla a super_admin: el
// insert de todos los demás se rechazaba en silencio (queda un console.warn y
// nada más). Por eso Auditoría solo mostraba los ingresos de Base del Sistema,
// como si nadie más entrara.
//
// Ahora lo escribe el servidor con la llave de servicio, y la identidad sale
// del token: no se puede anotar un ingreso a nombre de otra persona.
// Los datos que una persona puede cambiar DE SI MISMA. Es una lista blanca
// a proposito: `role`, `email` y los centros de otro perfil no se tocan desde
// aca, aunque vengan en el cuerpo de la peticion.
//
// Por que pasa por el servidor y no por `auth.updateMe`: la policy
// `usuario_escribe` solo deja escribir en `usuario` a super_admin y admin, asi
// que `updateMe` fallaba para todos los demas. CompletarPerfil se lo tragaba en
// un console.error y la persona quedaba apretando "Guardar" sin que pasara
// nada. Es el mismo motivo por el que `clave_cambiada` ya venia por aca.
const CAMPOS_DE_MI_PERFIL = [
  'area', 'centros_asignados', 'centro_principal', 'subsedes_asignadas',
  'licencia_numero', 'licencia_clase', 'licencia_vencimiento',
];

// El centro y el área definen QUÉ ve una persona (los equipos de su CESFAM).
// Al entrar por primera vez cada uno completa los suyos; después ya no: si no,
// un Encargado de Salud podía asignarse todos los centros desde "mi perfil" y
// ver la red completa. Cambiarlos después es trabajo de quien administra
// cuentas, desde Usuarios. Las fechas y datos de la licencia sí se editan
// siempre: los mantiene el propio chofer.
const CAMPOS_SOLO_LA_PRIMERA_VEZ = ['area', 'centros_asignados', 'centro_principal', 'subsedes_asignadas'];
const vacio = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

async function miPerfil(base44, quien, datos) {
  const cambios = {};
  const administra = ROLES_QUE_ADMINISTRAN.includes(quien.role);
  for (const campo of CAMPOS_DE_MI_PERFIL) {
    if (datos[campo] === undefined) continue;
    if (CAMPOS_SOLO_LA_PRIMERA_VEZ.includes(campo) && !administra && !vacio(quien[campo])) continue;
    cambios[campo] = datos[campo];
  }
  if (Object.keys(cambios).length === 0) {
    return { error: 'No hay nada que guardar', status: 400 };
  }
  // Una fecha vacia es null, no ''. PostgREST rechaza el update entero si le
  // mandan '' a una columna `date`.
  if (cambios.licencia_vencimiento === '') cambios.licencia_vencimiento = null;

  const guardado = await base44.asServiceRole.entities.User.update(quien.id, cambios);
  return { usuario: guardado };
}

async function registrarIngreso(base44, quien, datos) {
  await base44.asServiceRole.entities.AccesoNoAutorizado.create({
    email: quien.email || '',
    usuario_nombre: quien.full_name || '',
    rol: quien.role || '',
    resultado: 'exitoso',
    fecha_intento: new Date().toISOString(),
    user_agent: String(datos.user_agent || '').slice(0, 400),
    notas: String(datos.notas || '').slice(0, 300),
  });
  return { ok: true };
}

// ── entrada ─────────────────────────────────────────────────────────────────
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const cuerpo = await req.json().catch(() => ({}));
    const accion = cuerpo.accion;
    const origen = String(cuerpo.origen || '').replace(/\/+$/, '');

    // "recuperar" es la única acción sin sesión: la pide quien justamente no
    // puede entrar.
    if (accion === 'recuperar') {
      return Response.json(await recuperar(base44, cuerpo, origen));
    }

    const quien = await base44.auth.me();
    if (!quien) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    let salida;
    if (accion === 'diagnostico') {
      if (!ROLES_QUE_ADMINISTRAN.includes(quien.role)) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }
      salida = await diagnostico(base44);
    } else if (accion === 'reparar') {
      if (!ROLES_QUE_ADMINISTRAN.includes(quien.role)) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }
      salida = await reparar(base44);
    } else if (accion === 'crear') {
      salida = await crear(base44, quien, cuerpo);
    } else if (accion === 'restablecer') {
      salida = await restablecer(base44, quien, cuerpo);
    } else if (accion === 'clave_cambiada') {
      salida = await claveYaCambiada(base44, quien);
    } else if (accion === 'actualizar') {
      salida = await actualizar(base44, quien, cuerpo);
    } else if (accion === 'suspender') {
      salida = await suspender(base44, quien, cuerpo, false);
    } else if (accion === 'reactivar') {
      salida = await suspender(base44, quien, cuerpo, true);
    } else if (accion === 'eliminar') {
      salida = await eliminar(base44, quien, cuerpo);
    } else if (accion === 'mi_perfil') {
      salida = await miPerfil(base44, quien, cuerpo);
    } else if (accion === 'ingreso') {
      salida = await registrarIngreso(base44, quien, cuerpo);
    } else {
      return Response.json({ error: `Acción desconocida: ${accion}` }, { status: 400 });
    }

    if (salida?.error) return Response.json({ error: salida.error }, { status: salida.status || 400 });
    return Response.json(salida);
  } catch (error) {
    console.error('gestionarAcceso:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
