import { createClientFromRequest } from '#compat';
import { ALCANCES, CLAVES_ALCANCE, LIMITE_POR_MINUTO, DIAS_VIGENCIA } from '../api/alcances.js';
import { generarClave, hashClave, pepperValido } from '../api/claves.js';

// Los accesos de la API de integración (servidor/api/, 34_api_integracion.sql):
// cada sistema externo que entrega información tiene el suyo.
//
// Acciones:
//   listar     → accesos, catálogos de alcances y centros, y si el servidor
//                tiene el secreto para firmar claves
//   crear      → acceso nuevo; devuelve la clave UNA sola vez
//   rotar      → clave nueva para el mismo acceso (la anterior deja de servir
//                en el acto) y vigencia renovada
//   revocar    → lo deja fuera para siempre; no se borra, queda su historia
//   actividad  → las últimas llamadas, de un acceso o de todos
//
// Solo Base del Sistema: una clave de integración escribe gastos de toda la
// flota sin que una persona inicie sesión. La clave no se guarda: queda su
// hash, y quien la pierde pide una nueva (rotar).

const PUEDEN = ['super_admin'];

// En el modo local esta función corre en el navegador (src/api/local/compat.js),
// donde no hay process.env ni clave real que proteger: se usa un secreto de
// mentira para que la pantalla se pueda recorrer. En Node `window` no existe.
function pepper() {
  const p = globalThis.process?.env?.API_CLAVES_PEPPER;
  if (p) return p;
  return typeof window !== 'undefined' ? 'modo-local-sin-secreto-real-de-ningun-tipo' : '';
}

const texto = (v, max) => String(v ?? '').trim().slice(0, max);

// Lo que sale hacia la pantalla: nunca el hash.
function publico(f) {
  return {
    id: f.id,
    nombre: f.nombre,
    descripcion: f.descripcion || '',
    prefijo: f.prefijo,
    alcances: f.alcances || [],
    centros: f.centros || [],
    todos_los_centros: !!f.todos_los_centros,
    limite_por_minuto: f.limite_por_minuto,
    activo: f.activo !== false,
    expira: f.expira,
    ultimo_uso: f.ultimo_uso || null,
    rotada_en: f.rotada_en || null,
    created_date: f.created_date,
    creado_por_nombre: f.creado_por_nombre || '',
    revocado_en: f.revocado_en || null,
    revocado_por: f.revocado_por || '',
    motivo_revocacion: f.motivo_revocacion || '',
  };
}

async function auditar(base44, quien, accion, fila, descripcion) {
  try {
    await base44.asServiceRole.entities.Historial.create({
      usuario_email: quien.email || '',
      usuario_nombre: quien.full_name || '',
      usuario_rol: quien.role || '',
      accion,
      entidad: 'ApiCliente',
      entidad_id: fila.id,
      descripcion,
    });
  } catch (e) {
    console.error('gestionarApiClientes: no se pudo auditar:', e.message);
  }
}

async function nombresDeCentros(base44) {
  const centros = await base44.asServiceRole.entities.Centro.list('nombre', 200).catch(() => []);
  return [...new Set(centros.filter((c) => !c.is_sample).map((c) => String(c.nombre || '').trim()).filter(Boolean))];
}

function enteroEntre(v, { minimo, maximo, defecto }) {
  if (v === undefined || v === null || v === '') return defecto;
  const n = Number(v);
  return Number.isInteger(n) && n >= minimo && n <= maximo ? n : null;
}

const vencimiento = (dias) => new Date(Date.now() + dias * 86_400_000).toISOString();

async function listar(base44) {
  const [filas, centros] = await Promise.all([
    base44.asServiceRole.entities.ApiCliente.list('-created_date', 200),
    nombresDeCentros(base44),
  ]);
  return {
    configurada: pepperValido(pepper()),
    clientes: filas.map(publico),
    alcances: ALCANCES,
    centros,
    limites: LIMITE_POR_MINUTO,
    vigencia: DIAS_VIGENCIA,
  };
}

async function crear(base44, quien, datos) {
  if (!pepperValido(pepper())) {
    return { error: 'El servidor no tiene API_CLAVES_PEPPER: no se pueden crear claves.', status: 503 };
  }
  const nombre = texto(datos.nombre, 80);
  if (nombre.length < 3) return { error: 'El nombre debe tener al menos 3 caracteres.' };

  const alcances = [...new Set(Array.isArray(datos.alcances) ? datos.alcances : [])];
  if (!alcances.length) return { error: 'Elige al menos qué información va a enviar.' };
  const raros = alcances.filter((a) => !CLAVES_ALCANCE.includes(a));
  if (raros.length) return { error: `Alcance desconocido: ${raros.join(', ')}` };

  const todos = datos.todos_los_centros === true;
  const existentes = await nombresDeCentros(base44);
  const centros = todos ? [] : [...new Set(Array.isArray(datos.centros) ? datos.centros.map((c) => String(c)) : [])];
  if (!todos && !centros.length) return { error: 'Elige los centros cuyos vehículos puede informar, o «Todos los centros».' };
  const ajenos = centros.filter((c) => !existentes.includes(c));
  if (ajenos.length) return { error: `Centro desconocido: ${ajenos.join(', ')}` };

  const limite = enteroEntre(datos.limite_por_minuto, LIMITE_POR_MINUTO);
  if (limite === null) return { error: `El límite por minuto va de ${LIMITE_POR_MINUTO.minimo} a ${LIMITE_POR_MINUTO.maximo}.` };
  const dias = enteroEntre(datos.dias_vigencia, DIAS_VIGENCIA);
  if (dias === null) return { error: `La vigencia va de ${DIAS_VIGENCIA.minimo} a ${DIAS_VIGENCIA.maximo} días.` };

  const { clave, prefijo } = generarClave();
  const fila = await base44.asServiceRole.entities.ApiCliente.create({
    nombre,
    descripcion: texto(datos.descripcion, 300),
    prefijo,
    clave_hash: await hashClave(clave, pepper()),
    alcances,
    centros,
    todos_los_centros: todos,
    limite_por_minuto: limite,
    activo: true,
    expira: vencimiento(dias),
    creado_por_email: quien.email || '',
    creado_por_nombre: quien.full_name || quien.email || '',
  });
  await auditar(base44, quien, 'crear', fila,
    `Creó acceso de API «${nombre}» (aps_${prefijo}) — envía: ${alcances.join(', ')}; centros: ${todos ? 'todos' : centros.join(', ')}`);
  return { cliente: publico(fila), clave };
}

async function buscar(base44, id) {
  if (!id) return null;
  return base44.asServiceRole.entities.ApiCliente.get(String(id)).catch(() => null);
}

async function rotar(base44, quien, datos) {
  if (!pepperValido(pepper())) {
    return { error: 'El servidor no tiene API_CLAVES_PEPPER: no se pueden crear claves.', status: 503 };
  }
  const fila = await buscar(base44, datos.id);
  if (!fila) return { error: 'No existe ese acceso.', status: 404 };
  if (fila.activo === false) return { error: 'Ese acceso está revocado: crea uno nuevo.' };
  const dias = enteroEntre(datos.dias_vigencia, DIAS_VIGENCIA);
  if (dias === null) return { error: `La vigencia va de ${DIAS_VIGENCIA.minimo} a ${DIAS_VIGENCIA.maximo} días.` };

  const { clave, prefijo } = generarClave();
  const nueva = await base44.asServiceRole.entities.ApiCliente.update(fila.id, {
    prefijo,
    clave_hash: await hashClave(clave, pepper()),
    expira: vencimiento(dias),
    rotada_en: new Date().toISOString(),
  });
  await auditar(base44, quien, 'editar', fila,
    `Rotó la clave del acceso de API «${fila.nombre}» (aps_${fila.prefijo} → aps_${prefijo})`);
  return { cliente: publico(nueva), clave };
}

async function revocar(base44, quien, datos) {
  const fila = await buscar(base44, datos.id);
  if (!fila) return { error: 'No existe ese acceso.', status: 404 };
  if (fila.activo === false) return { error: 'Ese acceso ya estaba revocado.' };
  const motivo = texto(datos.motivo, 300);
  if (motivo.length < 5) return { error: 'Escribe el motivo (al menos 5 caracteres).' };
  const nueva = await base44.asServiceRole.entities.ApiCliente.update(fila.id, {
    activo: false,
    revocado_en: new Date().toISOString(),
    revocado_por: quien.full_name || quien.email || '',
    motivo_revocacion: motivo,
  });
  await auditar(base44, quien, 'editar', fila, `Revocó el acceso de API «${fila.nombre}» (aps_${fila.prefijo}): ${motivo}`);
  return { cliente: publico(nueva) };
}

async function actividad(base44, datos) {
  const limite = Math.min(Math.max(Number(datos.limite) || 50, 1), 200);
  const db = base44.asServiceRole.entities.ApiRegistro;
  const filas = datos.id
    ? await db.filter({ cliente_id: String(datos.id) }, '-fecha', limite).catch(() => [])
    : await db.list('-fecha', limite).catch(() => []);
  return { registros: filas };
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const quien = await base44.auth.me();
    if (!quien) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (!PUEDEN.includes(quien.role)) return Response.json({ error: 'Forbidden' }, { status: 403 });

    const cuerpo = await req.json().catch(() => ({}));
    const acciones = {
      listar: () => listar(base44),
      crear: () => crear(base44, quien, cuerpo),
      rotar: () => rotar(base44, quien, cuerpo),
      revocar: () => revocar(base44, quien, cuerpo),
      actividad: () => actividad(base44, cuerpo),
    };
    const accion = acciones[cuerpo.accion];
    if (!accion) return Response.json({ error: `Acción desconocida: ${cuerpo.accion}` }, { status: 400 });

    const salida = await accion();
    if (salida?.error) return Response.json({ error: salida.error }, { status: salida.status || 400 });
    return Response.json(salida);
  } catch (error) {
    console.error('gestionarApiClientes:', error);
    if (/api_cliente|api_registro/.test(String(error?.message))) {
      return Response.json({ error: 'Falta ejecutar migracion/34_api_integracion.sql en Supabase.' }, { status: 503 });
    }
    return Response.json({ error: 'No se pudo completar la operación.' }, { status: 500 });
  }
}
