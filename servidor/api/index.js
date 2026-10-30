// API de integración: /api/v1. Otros sistemas ENTREGAN información a éste.
//
//   GET  /api/v1/openapi.json             contrato (público, sin datos)
//   GET  /api/v1/yo                       qué puede hacer la clave con que se llama
//   GET  /api/v1/vehiculos                patentes de la flota de sus centros
//   POST /api/v1/<recurso>                envía registros (lote de hasta 200)
//   GET  /api/v1/<recurso>/<id_externo>   estado de algo que ya mandó
//
// Los recursos están en recursos.js. Cada sistema externo llama con su propia
// clave (Authorization: Bearer aps_...), que se crea en Configuración → API de
// integración (gestionarApiClientes). La clave dice qué puede enviar
// (alcances), de qué centros, y cuántas llamadas por minuto.
//
// Lo que no hace: modificar ni anular registros. Una carga mal enviada la
// anula la Unidad de Control desde su pantalla, con motivo, como cualquier
// otra; el sistema externo lo ve en GET /<recurso>/<id_externo>.
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { getConnInfo } from '@hono/node-server/conninfo';
import { RECURSOS } from './recursos.js';
import { validarRegistro, patenteSimple, hoyEnChile } from './validacion.js';
import { leerClave, hashClave, igualesEnTiempoConstante, pepperValido } from './claves.js';
import { crearLimitador } from './limite.js';
import { documentoOpenApi } from './openapi.js';

export const MAX_REGISTROS = 200;
const MAX_CUERPO = 1024 * 1024;
const MAX_FALLOS_IP = 20;
const VENTANA_FALLOS_MS = 15 * 60_000;
const MARCAR_USO_CADA_MS = 5 * 60_000;
const ID_EXTERNO = /^[A-Za-z0-9._:/-]{1,100}$/;

const CABECERAS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
};

const responderError = (c, estado, codigo, mensaje, extra = {}) =>
  c.json({ error: { codigo, mensaje, ...extra } }, estado);

// Railway agrega la IP de quien llama al final de X-Forwarded-For; lo que
// venga antes lo pudo escribir cualquiera.
function ipDe(c) {
  const ultima = (c.req.header('x-forwarded-for') || '').split(',').map((s) => s.trim()).filter(Boolean).pop();
  if (ultima) return ultima.slice(0, 64);
  try {
    return getConnInfo(c).remote.address || 'desconocida';
  } catch {
    return 'desconocida';
  }
}

// Lo que la base contesta cuando no guarda un registro, traducido para quien
// lo mandó. Los mensajes de los disparadores (P0001) ya vienen escritos para
// personas: "El kilometraje (100) es menor que el de una carga anterior...".
function falloDeBase(e) {
  if (e?.codigo === 'P0001') return { errores: [e.message] };
  if (e?.codigo === '23514') return { errores: ['un valor no está permitido por la base'] };
  if (e?.codigo === '22P02' || e?.codigo === '22003') return { errores: ['un valor no tiene el formato que espera la base'] };
  return null;
}

/**
 * Valida y guarda un lote. Cada registro se responde por separado: uno malo
 * no impide que entren los demás.
 */
export async function procesarLote({ def, registros, cliente, datos, ahora, consola = console }) {
  const hoy = hoyEnChile(new Date(ahora));
  const porPatente = new Map();
  for (const v of await datos.vehiculos()) {
    const p = patenteSimple(v.patente);
    if (p) porPatente.set(p, [...(porPatente.get(p) || []), v]);
  }

  const resultados = registros.map((registro, indice) => ({
    indice,
    id_externo: typeof registro?.id_externo === 'string' ? registro.id_externo.slice(0, 100) : null,
  }));
  const vistos = new Map();
  const pendientes = [];

  registros.forEach((registro, i) => {
    const { fila, errores } = validarRegistro(registro, def.campos);
    if (!errores.length) errores.push(...def.revisar(fila, { hoy, ahora }));
    if (fila.id_externo) {
      if (vistos.has(fila.id_externo)) errores.push(`id_externo: repetido en este mismo envío (registro ${vistos.get(fila.id_externo)})`);
      else vistos.set(fila.id_externo, i);
    }
    let vehiculo = null;
    if (fila.patente) {
      const candidatos = porPatente.get(fila.patente) || [];
      if (!candidatos.length) errores.push(`patente: ${fila.patente} no corresponde a un vehículo de la flota`);
      else if (candidatos.length > 1) errores.push(`patente: ${fila.patente} está en más de un vehículo; avisa a la Unidad de Control`);
      else if (!cliente.todos && !cliente.centros.has(candidatos[0].centro_principal)) {
        errores.push(`patente: ${fila.patente} es de un centro que este acceso no tiene autorizado`);
      } else vehiculo = candidatos[0];
    }
    if (errores.length) {
      Object.assign(resultados[i], { estado: 'rechazado', errores });
      return;
    }
    const { patente: _patente, ...resto } = fila;
    pendientes.push({ i, fila: { ...resto, equipo_id: vehiculo.id, ...def.control(cliente) } });
  });

  // Lo que ya llegó antes no se vuelve a guardar. Se mira ANTES de insertar:
  // un reenvío viejo podría chocar con una regla (el km de una carga
  // posterior) y salir rechazado en vez de "ya lo tengo".
  const existentes = pendientes.length
    ? await datos.existentes(def.tabla, cliente.id, pendientes.map((p) => p.fila.id_externo))
    : new Map();
  const nuevos = [];
  for (const p of pendientes) {
    const id = existentes.get(p.fila.id_externo);
    if (id) Object.assign(resultados[p.i], { estado: 'duplicado', id });
    else nuevos.push(p);
  }

  // En orden de fecha: la base compara cada km con el registro anterior del
  // mismo vehículo.
  nuevos.sort((a, b) => def.orden(a.fila).localeCompare(def.orden(b.fila)) || a.i - b.i);
  for (const p of nuevos) {
    try {
      const id = await datos.insertar(def.tabla, p.fila);
      Object.assign(resultados[p.i], { estado: 'creado', id });
    } catch (e) {
      if (e?.codigo === '23505') {
        // Otro envío con el mismo id_externo entró justo antes que éste.
        const id = (await datos.existentes(def.tabla, cliente.id, [p.fila.id_externo])).get(p.fila.id_externo);
        Object.assign(resultados[p.i], { estado: 'duplicado', id: id || null });
        continue;
      }
      const conocido = falloDeBase(e);
      if (!conocido) consola.error(`[api] ${def.tabla}: no se pudo guardar ${p.fila.id_externo}:`, e?.codigo, e?.message);
      Object.assign(resultados[p.i], {
        estado: 'rechazado',
        ...(conocido || { errores: ['no se pudo guardar por un error interno; reintenta más tarde'], reintentable: true }),
      });
    }
  }

  const contar = (estado) => resultados.filter((r) => r.estado === estado).length;
  return {
    resumen: {
      recibidos: registros.length,
      creados: contar('creado'),
      duplicados: contar('duplicado'),
      rechazados: contar('rechazado'),
    },
    resultados,
  };
}

/** Borra del registro lo anterior a `dias`. Lo llama una tarea diaria. */
export async function purgarRegistroApi(datos, dias, ahora = Date.now()) {
  const antesDe = new Date(ahora - dias * 86_400_000).toISOString();
  return datos.purgarRegistro(antesDe);
}

export function crearApi({ datos, pepper, ahora = Date.now, consola = console }) {
  const api = new Hono();
  const porCliente = crearLimitador({ ventanaMs: 60_000, ahora });
  const fallos = crearLimitador({ ventanaMs: VENTANA_FALLOS_MS, ahora });
  const usoMarcado = new Map();

  function marcarUso(id) {
    const t = ahora();
    if (t - (usoMarcado.get(id) || 0) < MARCAR_USO_CADA_MS) return;
    usoMarcado.set(id, t);
    datos.marcarUso(id, new Date(t).toISOString())
      .catch((e) => consola.error('[api] no se pudo anotar el último uso:', e.message));
  }

  api.onError((e, c) => {
    consola.error(`[api ${c.get('solicitudId')}]`, e);
    return responderError(c, 500, 'error_interno',
      'Error interno del servidor. Si se repite, informa el código de solicitud.',
      { solicitud_id: c.get('solicitudId') });
  });

  // Cabeceras de seguridad, identificador de la solicitud y registro de
  // auditoría de TODA llamada, también de las rechazadas.
  api.use('*', async (c, next) => {
    const inicio = ahora();
    const solicitudId = crypto.randomUUID();
    c.set('solicitudId', solicitudId);
    await next();
    for (const [k, v] of Object.entries(CABECERAS)) c.res.headers.set(k, v);
    c.res.headers.set('X-Request-Id', solicitudId);
    if (c.get('sinRegistro')) return;
    const cliente = c.get('cliente');
    const resumen = c.get('resumen') || {};
    datos.registrar({
      fecha: new Date(inicio).toISOString(),
      cliente_id: cliente?.id || null,
      prefijo: c.get('prefijo') || null,
      metodo: c.req.method,
      ruta: c.req.path.slice(0, 300),
      estado: c.res.status,
      recibidos: resumen.recibidos ?? null,
      creados: resumen.creados ?? null,
      duplicados: resumen.duplicados ?? null,
      rechazados: resumen.rechazados ?? null,
      duracion_ms: Math.round(ahora() - inicio),
      ip: c.get('ip') || null,
      user_agent: (c.req.header('user-agent') || '').slice(0, 200) || null,
      solicitud_id: solicitudId,
    }).catch((e) => consola.error('[api] no se pudo anotar en api_registro:', e.message));
  });

  // Railway termina el TLS y avisa el protocolo original. Una clave que viaja
  // por HTTP plano ya quedó expuesta: se rechaza aunque sea correcta.
  api.use('*', async (c, next) => {
    const proto = (c.req.header('x-forwarded-proto') || '').split(',')[0].trim().toLowerCase();
    if (proto === 'http') return responderError(c, 403, 'https_requerido', 'La API solo atiende por HTTPS.');
    await next();
  });

  api.get('/openapi.json', (c) => {
    c.set('sinRegistro', true);
    return c.json(documentoOpenApi({ maxRegistros: MAX_REGISTROS }));
  });

  api.use('*', async (c, next) => {
    if (!pepperValido(pepper)) {
      return responderError(c, 503, 'api_no_configurada', 'La API de integración no está configurada en el servidor.');
    }
    const ip = ipDe(c);
    c.set('ip', ip);
    const bloqueada = fallos.agotado(ip, MAX_FALLOS_IP);

    // Quien ya falló muchas veces desde esa dirección recibe 429 y deja de
    // anotarse en api_registro (un bot no llena la tabla). Una clave correcta
    // entra igual: si la dirección es la de un proxy compartido, el sistema
    // legítimo no paga por los intentos de otro.
    const rechazar = (codigo, mensaje) => {
      if (bloqueada) {
        c.set('sinRegistro', true);
        c.header('Retry-After', String(bloqueada.reinicio));
        return responderError(c, 429, 'demasiados_intentos', 'Demasiados intentos fallidos desde esta dirección. Espera e intenta de nuevo.');
      }
      fallos.contar(ip, MAX_FALLOS_IP);
      c.header('WWW-Authenticate', 'Bearer realm="api-equipos-aps"');
      return responderError(c, 401, codigo, mensaje);
    };

    const autorizacion = c.req.header('authorization') || '';
    const texto = /^Bearer\s+/i.test(autorizacion)
      ? autorizacion.replace(/^Bearer\s+/i, '')
      : c.req.header('x-api-key') || '';
    if (!texto) return rechazar('no_autenticado', 'Falta la clave: envíala en la cabecera Authorization: Bearer <clave>.');
    const leida = leerClave(texto);
    if (!leida) return rechazar('clave_invalida', 'La clave no es válida.');
    c.set('prefijo', leida.prefijo);

    const [fila, hash] = await Promise.all([datos.buscarCliente(leida.prefijo), hashClave(leida.clave, pepper)]);
    if (!fila || !igualesEnTiempoConstante(hash, fila.clave_hash)) return rechazar('clave_invalida', 'La clave no es válida.');

    // Desde acá quien llama tiene la clave verdadera: se le puede decir por
    // qué no entra, sin revelarle nada a quien adivina.
    if (!fila.activo) return responderError(c, 401, 'clave_revocada', 'Este acceso fue revocado.');
    if (!fila.expira || new Date(fila.expira).getTime() <= ahora()) {
      return responderError(c, 401, 'clave_vencida', 'Este acceso venció. Pide una clave nueva al administrador del sistema.');
    }

    const cliente = {
      id: fila.id,
      nombre: fila.nombre,
      prefijo: fila.prefijo,
      alcances: new Set(fila.alcances || []),
      centros: new Set(fila.centros || []),
      todos: !!fila.todos_los_centros,
      limite: fila.limite_por_minuto,
      expira: fila.expira,
    };
    c.set('cliente', cliente);

    const cuota = porCliente.contar(cliente.id, cliente.limite);
    c.header('RateLimit-Limit', String(cliente.limite));
    c.header('RateLimit-Remaining', String(cuota.restantes));
    c.header('RateLimit-Reset', String(cuota.reinicio));
    if (!cuota.permitido) {
      c.header('Retry-After', String(cuota.reinicio));
      return responderError(c, 429, 'demasiadas_solicitudes', `Se superó el límite de ${cliente.limite} solicitudes por minuto.`);
    }
    marcarUso(cliente.id);
    await next();
  });

  api.get('/yo', (c) => {
    const cl = c.get('cliente');
    return c.json({
      datos: {
        nombre: cl.nombre,
        prefijo: cl.prefijo,
        alcances: [...cl.alcances],
        centros: cl.todos ? 'todos' : [...cl.centros],
        limite_por_minuto: cl.limite,
        expira: cl.expira,
      },
    });
  });

  api.get('/vehiculos', async (c) => {
    const cl = c.get('cliente');
    const lista = (await datos.vehiculos())
      .filter((v) => cl.todos || cl.centros.has(v.centro_principal))
      .map((v) => ({
        id: v.id,
        patente: v.patente,
        tipo: v.tipo,
        marca: v.marca,
        modelo: v.modelo,
        centro: v.centro_principal,
        subsede: v.subsede,
        activo: v.activo !== false,
      }));
    return c.json({ datos: lista });
  });

  // Recurso conocido y con el alcance que pide; si no, la respuesta de error.
  function recursoPara(c) {
    const def = RECURSOS[c.req.param('recurso')];
    if (!def) return { respuesta: responderError(c, 404, 'recurso_desconocido', `No existe el recurso ${c.req.param('recurso')}.`) };
    if (!c.get('cliente').alcances.has(def.alcance)) {
      return { respuesta: responderError(c, 403, 'alcance_insuficiente', `Este acceso no tiene el alcance ${def.alcance}.`) };
    }
    return { def };
  }

  api.post('/:recurso',
    bodyLimit({
      maxSize: MAX_CUERPO,
      onError: (c) => responderError(c, 413, 'cuerpo_demasiado_grande', `El cuerpo supera ${MAX_CUERPO / 1024} KB. Divide el envío en lotes.`),
    }),
    async (c) => {
      const { def, respuesta } = recursoPara(c);
      if (respuesta) return respuesta;
      if (!(c.req.header('content-type') || '').toLowerCase().startsWith('application/json')) {
        return responderError(c, 415, 'tipo_no_soportado', 'El cuerpo debe ser JSON (Content-Type: application/json).');
      }
      let cuerpo;
      try {
        cuerpo = await c.req.json();
      } catch {
        return responderError(c, 400, 'json_invalido', 'El cuerpo no es JSON válido.');
      }
      const registros = cuerpo?.registros;
      if (!Array.isArray(registros) || registros.length === 0 || registros.length > MAX_REGISTROS) {
        return responderError(c, 400, 'cuerpo_invalido',
          `El cuerpo debe ser {"registros": [...]} con entre 1 y ${MAX_REGISTROS} registros.`);
      }
      const extra = Object.keys(cuerpo).filter((k) => k !== 'registros');
      if (extra.length) return responderError(c, 400, 'cuerpo_invalido', `Campo desconocido en el cuerpo: ${extra.join(', ')}.`);

      const resultado = await procesarLote({ def, registros, cliente: c.get('cliente'), datos, ahora: ahora(), consola });
      c.set('resumen', resultado.resumen);
      const { creados, duplicados, rechazados } = resultado.resumen;
      // 200: todo entró (o ya estaba). 207: una parte se rechazó. 422: nada entró.
      const estado = rechazados === 0 ? 200 : creados + duplicados > 0 ? 207 : 422;
      return c.json(resultado, estado);
    });

  api.get('/:recurso/:idExterno', async (c) => {
    const { def, respuesta } = recursoPara(c);
    if (respuesta) return respuesta;
    const idExterno = c.req.param('idExterno');
    if (!ID_EXTERNO.test(idExterno)) return responderError(c, 400, 'parametro_invalido', 'El id_externo no es válido.');
    const fila = await datos.consultar(def.tabla, def.consulta, c.get('cliente').id, idExterno);
    if (!fila) return responderError(c, 404, 'no_encontrado', 'No hay un registro con ese id_externo enviado por este acceso.');
    return c.json({ datos: fila });
  });

  api.all('*', (c) => {
    const tramos = c.req.path.split('/').filter(Boolean);
    const recurso = tramos[tramos.length - 1];
    if (RECURSOS[recurso] || ['yo', 'vehiculos'].includes(recurso)) {
      c.header('Allow', RECURSOS[recurso] ? 'POST' : 'GET');
      return responderError(c, 405, 'metodo_no_permitido', `Método ${c.req.method} no permitido aquí.`);
    }
    return responderError(c, 404, 'ruta_desconocida', 'Esa ruta no existe. Revisa GET /api/v1/openapi.json.');
  });

  return api;
}
