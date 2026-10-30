// Pruebas de la API de integración, sin Supabase: un doble en memoria con los
// mismos métodos que datos.js. Correr con `npm test` dentro de servidor/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';
import { crearApi, purgarRegistroApi, MAX_REGISTROS } from './index.js';
import { generarClave, leerClave, hashClave, igualesEnTiempoConstante, pepperValido } from './claves.js';
import { crearLimitador } from './limite.js';
import { validarRegistro, rutValido, patenteSimple, hoyEnChile } from './validacion.js';
import { RECURSOS } from './recursos.js';

const PEPPER = 'pepper-de-prueba-con-mas-de-32-caracteres';
const callado = { error: () => {}, log: () => {} };
const AHORA = Date.parse('2026-10-30T15:00:00Z');

const VEHICULOS = [
  { id: 'v1', patente: 'AB-CD-12', tipo: 'camioneta', marca: 'Toyota', modelo: 'Hilux', centro_principal: 'CESFAM Panguipulli', subsede: '', activo: true },
  { id: 'v2', patente: 'TR-KL-21', tipo: 'ambulancia', marca: 'Mercedes', modelo: 'Sprinter', centro_principal: 'CESFAM Coñaripe', subsede: '', activo: true },
  { id: 'v3', patente: 'ZZZZ99', tipo: 'furgon', centro_principal: 'CESFAM Panguipulli', activo: true },
  { id: 'v4', patente: 'zz-zz-99', tipo: 'furgon', centro_principal: 'CESFAM Panguipulli', activo: true },
];

function crearDoble({ clientes = [], fallaInsertar = null } = {}) {
  const tablas = { carga_combustible: [], pago_vehiculo: [], lectura_odometro: [] };
  const registro = [];
  let n = 0;
  return {
    tablas,
    registro,
    usos: [],
    async buscarCliente(prefijo) { return clientes.find((c) => c.prefijo === prefijo) || null; },
    async vehiculos() { return VEHICULOS; },
    async existentes(tabla, clienteId, ids) {
      return new Map(tablas[tabla].filter((f) => f.api_cliente_id === clienteId && ids.includes(f.id_externo)).map((f) => [f.id_externo, f.id]));
    },
    async insertar(tabla, fila) {
      if (fallaInsertar) {
        const e = fallaInsertar(fila);
        if (e) throw e;
      }
      if (tablas[tabla].some((f) => f.api_cliente_id === fila.api_cliente_id && f.id_externo === fila.id_externo)) {
        throw Object.assign(new Error('duplicate key'), { codigo: '23505' });
      }
      const id = `id${++n}`;
      tablas[tabla].push({ ...fila, id, estado: 'vigente' });
      return id;
    },
    async consultar(tabla, _columnas, clienteId, idExterno) {
      return tablas[tabla].find((f) => f.api_cliente_id === clienteId && f.id_externo === idExterno) || null;
    },
    async registrar(entrada) { registro.push(entrada); },
    async marcarUso(id, fecha) { this.usos.push({ id, fecha }); },
    async purgarRegistro(antesDe) { return antesDe; },
  };
}

async function clienteDePrueba(extra = {}) {
  const { clave, prefijo } = generarClave();
  return {
    clave,
    fila: {
      id: `c-${prefijo}`, nombre: 'Proveedor combustible', prefijo, clave_hash: await hashClave(clave, PEPPER),
      alcances: ['combustible:escribir', 'odometro:escribir', 'pagos:escribir'], centros: ['CESFAM Panguipulli'],
      todos_los_centros: false, limite_por_minuto: 60, activo: true, expira: '2027-10-30T00:00:00Z', ...extra,
    },
  };
}

function montar(datos, opciones = {}) {
  const app = new Hono();
  let t = AHORA;
  const reloj = { avanzar: (ms) => { t += ms; } };
  app.route('/api/v1', crearApi({ datos, pepper: PEPPER, ahora: () => t, consola: callado, ...opciones }));
  return { app, reloj };
}

const conClave = (clave, init = {}) => ({ ...init, headers: { authorization: `Bearer ${clave}`, ...(init.headers || {}) } });
const enviar = (clave, registros, headers = {}) => conClave(clave, {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...headers },
  body: JSON.stringify({ registros }),
});
const esperar = () => new Promise((r) => setImmediate(r));

const CARGA = { id_externo: 'TX-1', patente: 'ab cd 12', fecha: '2026-10-29', hora: '08:30', litros: 40, monto: 46000, km: 1000, tarjeta: '7001 2345 6789 1234' };

// ── claves ──────────────────────────────────────────────────────────────────
test('la clave tiene el formato esperado y se reconoce', () => {
  const { clave, prefijo } = generarClave();
  assert.match(clave, /^aps_[a-z0-9]{12}_[A-Za-z0-9_-]{43}$/);
  assert.deepEqual(leerClave(` ${clave} `), { clave, prefijo });
  assert.equal(leerClave('aps_corto_x'), null);
  assert.equal(leerClave(''), null);
  assert.notEqual(generarClave().clave, generarClave().clave);
});

test('el hash depende del pepper y la comparación es exacta', async () => {
  const { clave } = generarClave();
  const a = await hashClave(clave, PEPPER);
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.equal(a, await hashClave(clave, PEPPER));
  assert.notEqual(a, await hashClave(clave, `${PEPPER}x`));
  assert.ok(igualesEnTiempoConstante(a, a));
  assert.ok(!igualesEnTiempoConstante(a, a.replace(/.$/, (c) => (c === '0' ? '1' : '0'))));
  assert.ok(!igualesEnTiempoConstante(a, a.slice(1)));
  assert.ok(!pepperValido('corto'));
  await assert.rejects(hashClave(clave, 'corto'));
});

// ── validación ──────────────────────────────────────────────────────────────
test('validación de campos', () => {
  const { fila, errores } = validarRegistro({ ...CARGA, litros: '40', extra: 1 }, RECURSOS['cargas-combustible'].campos);
  assert.ok(errores.includes('extra: campo desconocido'));
  assert.ok(errores.some((e) => e.startsWith('litros:')));
  assert.equal(fila.patente, 'ABCD12');
  assert.equal(fila.tarjeta, '**** 1234');
  assert.ok(validarRegistro({ patente: 'AB-CD-12' }, RECURSOS['cargas-combustible'].campos).errores.includes('id_externo: es obligatorio'));
  assert.ok(validarRegistro({ ...CARGA, fecha: '2026-02-30' }, RECURSOS['cargas-combustible'].campos).errores.some((e) => e.startsWith('fecha:')));
  assert.ok(validarRegistro([], RECURSOS['cargas-combustible'].campos).errores.length);
  assert.ok(rutValido('11.111.111-1'));
  assert.ok(!rutValido('11.111.111-2'));
  assert.equal(patenteSimple('ab.cd-12'), 'ABCD12');
  assert.equal(hoyEnChile(new Date('2026-10-31T02:00:00Z')), '2026-10-30');
});

test('el limitador cuenta por ventana', () => {
  let t = 0;
  const l = crearLimitador({ ventanaMs: 1000, ahora: () => t });
  assert.ok(l.contar('a', 2).permitido);
  assert.ok(l.contar('a', 2).permitido);
  assert.ok(!l.contar('a', 2).permitido);
  assert.ok(l.agotado('a', 2));
  assert.ok(l.contar('b', 2).permitido);
  t = 1000;
  assert.ok(l.contar('a', 2).permitido);
});

// ── autenticación ───────────────────────────────────────────────────────────
test('openapi.json es público y describe los recursos', async () => {
  const { app } = montar(crearDoble());
  const r = await app.request('/api/v1/openapi.json');
  assert.equal(r.status, 200);
  const doc = await r.json();
  assert.equal(doc.openapi, '3.1.0');
  for (const recurso of Object.keys(RECURSOS)) assert.ok(doc.paths[`/${recurso}`].post, recurso);
});

test('sin clave, clave mal formada o equivocada: 401', async () => {
  const { clave, fila } = await clienteDePrueba();
  const datos = crearDoble({ clientes: [fila] });
  const { app } = montar(datos);
  let r = await app.request('/api/v1/yo');
  assert.equal(r.status, 401);
  assert.match(r.headers.get('www-authenticate'), /Bearer/);
  assert.equal((await r.json()).error.codigo, 'no_autenticado');
  r = await app.request('/api/v1/yo', conClave('no-es-una-clave'));
  assert.equal((await r.json()).error.codigo, 'clave_invalida');
  const otra = `${clave.slice(0, -1)}${clave.endsWith('A') ? 'B' : 'A'}`;
  r = await app.request('/api/v1/yo', conClave(otra));
  assert.equal(r.status, 401);
  r = await app.request('/api/v1/yo', conClave(clave));
  assert.equal(r.status, 200);
  const yo = (await r.json()).datos;
  assert.equal(yo.nombre, 'Proveedor combustible');
  assert.deepEqual(yo.centros, ['CESFAM Panguipulli']);
  r = await app.request('/api/v1/yo', { headers: { 'x-api-key': clave } });
  assert.equal(r.status, 200);
});

test('revocada o vencida: 401 con el motivo', async () => {
  const revocada = await clienteDePrueba({ activo: false });
  const vencida = await clienteDePrueba({ expira: '2026-10-01T00:00:00Z' });
  const { app } = montar(crearDoble({ clientes: [revocada.fila, vencida.fila] }));
  assert.equal((await (await app.request('/api/v1/yo', conClave(revocada.clave))).json()).error.codigo, 'clave_revocada');
  assert.equal((await (await app.request('/api/v1/yo', conClave(vencida.clave))).json()).error.codigo, 'clave_vencida');
});

test('muchos intentos fallidos desde una IP: 429, pero una clave correcta entra', async () => {
  const { clave, fila } = await clienteDePrueba();
  const datos = crearDoble({ clientes: [fila] });
  const { app, reloj } = montar(datos);
  const ip = { headers: { 'x-forwarded-for': '1.1.1.1, 9.9.9.9' } };
  for (let i = 0; i < 20; i++) assert.equal((await app.request('/api/v1/yo', ip)).status, 401);
  const r = await app.request('/api/v1/yo', ip);
  assert.equal(r.status, 429);
  assert.ok(Number(r.headers.get('retry-after')) > 0);
  assert.equal((await app.request('/api/v1/yo', conClave(clave, ip))).status, 200);
  assert.equal((await app.request('/api/v1/yo', { headers: { 'x-forwarded-for': '1.1.1.1, 8.8.8.8' } })).status, 401);
  reloj.avanzar(15 * 60_000);
  assert.equal((await app.request('/api/v1/yo', ip)).status, 401);
});

test('límite por minuto de cada acceso', async () => {
  const { clave, fila } = await clienteDePrueba({ limite_por_minuto: 10 });
  const { app, reloj } = montar(crearDoble({ clientes: [fila] }));
  for (let i = 0; i < 10; i++) assert.equal((await app.request('/api/v1/yo', conClave(clave))).status, 200);
  const r = await app.request('/api/v1/yo', conClave(clave));
  assert.equal(r.status, 429);
  assert.equal(r.headers.get('ratelimit-limit'), '10');
  reloj.avanzar(60_000);
  assert.equal((await app.request('/api/v1/yo', conClave(clave))).status, 200);
});

test('sin pepper la API no atiende; por HTTP tampoco', async () => {
  const { clave, fila } = await clienteDePrueba();
  const datos = crearDoble({ clientes: [fila] });
  const app = new Hono();
  app.route('/api/v1', crearApi({ datos, pepper: '', consola: callado }));
  assert.equal((await app.request('/api/v1/yo', conClave(clave))).status, 503);
  const { app: otra } = montar(datos);
  const r = await otra.request('/api/v1/yo', conClave(clave, { headers: { 'x-forwarded-proto': 'http' } }));
  assert.equal(r.status, 403);
  assert.equal((await r.json()).error.codigo, 'https_requerido');
});

test('cabeceras de seguridad y registro de auditoría sin la clave', async () => {
  const { clave, fila } = await clienteDePrueba();
  const datos = crearDoble({ clientes: [fila] });
  const { app } = montar(datos);
  const r = await app.request('/api/v1/yo', conClave(clave, { headers: { 'user-agent': 'prueba/1.0' } }));
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.ok(r.headers.get('x-request-id'));
  await esperar();
  const e = datos.registro.at(-1);
  assert.equal(e.cliente_id, fila.id);
  assert.equal(e.estado, 200);
  assert.equal(e.ruta, '/api/v1/yo');
  assert.ok(!JSON.stringify(datos.registro).includes(clave.split('_')[2]));
  assert.equal(datos.usos.length, 1);
});

// ── vehículos y alcances ────────────────────────────────────────────────────
test('vehículos: solo los de los centros autorizados', async () => {
  const { clave, fila } = await clienteDePrueba();
  const { app } = montar(crearDoble({ clientes: [fila] }));
  const { datos } = await (await app.request('/api/v1/vehiculos', conClave(clave))).json();
  assert.deepEqual(datos.map((v) => v.id).sort(), ['v1', 'v3', 'v4']);
  assert.ok(!('clave_hash' in datos[0]));
});

test('sin el alcance: 403', async () => {
  const { clave, fila } = await clienteDePrueba({ alcances: ['odometro:escribir'] });
  const { app } = montar(crearDoble({ clientes: [fila] }));
  const r = await app.request('/api/v1/cargas-combustible', enviar(clave, [CARGA]));
  assert.equal(r.status, 403);
  assert.equal((await r.json()).error.codigo, 'alcance_insuficiente');
});

// ── envíos ──────────────────────────────────────────────────────────────────
test('carga de combustible: entra con la marca de quién la mandó', async () => {
  const { clave, fila } = await clienteDePrueba();
  const datos = crearDoble({ clientes: [fila] });
  const { app } = montar(datos);
  const r = await app.request('/api/v1/cargas-combustible', enviar(clave, [CARGA]));
  assert.equal(r.status, 200);
  const cuerpo = await r.json();
  assert.deepEqual(cuerpo.resumen, { recibidos: 1, creados: 1, duplicados: 0, rechazados: 0 });
  const guardada = datos.tablas.carga_combustible[0];
  assert.equal(guardada.equipo_id, 'v1');
  assert.equal(guardada.origen, 'api');
  assert.equal(guardada.api_cliente_id, fila.id);
  assert.equal(guardada.registrado_por_nombre, 'API · Proveedor combustible');
  assert.equal(guardada.tarjeta, '**** 1234');
  assert.ok(!('patente' in guardada));
  await esperar();
  assert.equal(datos.registro.at(-1).creados, 1);
});

test('reenviar el mismo id_externo no duplica', async () => {
  const { clave, fila } = await clienteDePrueba();
  const datos = crearDoble({ clientes: [fila] });
  const { app } = montar(datos);
  await app.request('/api/v1/cargas-combustible', enviar(clave, [CARGA]));
  const r = await app.request('/api/v1/cargas-combustible', enviar(clave, [CARGA]));
  assert.equal(r.status, 200);
  const { resultados } = await r.json();
  assert.equal(resultados[0].estado, 'duplicado');
  assert.equal(datos.tablas.carga_combustible.length, 1);
});

test('lote mixto: 207, cada registro con su resultado', async () => {
  const { clave, fila } = await clienteDePrueba();
  const datos = crearDoble({ clientes: [fila] });
  const { app } = montar(datos);
  const r = await app.request('/api/v1/cargas-combustible', enviar(clave, [
    CARGA,
    { ...CARGA, id_externo: 'TX-2', patente: 'NO-EX-99' },
    { ...CARGA, id_externo: 'TX-3', patente: 'TR-KL-21' },
    { ...CARGA, id_externo: 'TX-4', patente: 'ZZZZ99' },
    { ...CARGA, id_externo: 'TX-5', monto: undefined },
    { ...CARGA, id_externo: 'TX-6', fecha: '2026-11-05' },
    CARGA,
  ]));
  assert.equal(r.status, 207);
  const { resumen, resultados } = await r.json();
  assert.deepEqual(resumen, { recibidos: 7, creados: 1, duplicados: 0, rechazados: 6 });
  assert.match(resultados[1].errores[0], /no corresponde a un vehículo/);
  assert.match(resultados[2].errores[0], /no tiene autorizado/);
  assert.match(resultados[3].errores[0], /más de un vehículo/);
  assert.match(resultados[4].errores[0], /monto: es obligatorio/);
  assert.match(resultados[5].errores[0], /en el futuro/);
  assert.match(resultados[6].errores[0], /repetido en este mismo envío/);
});

test('todo rechazado: 422; regla de la base: su mensaje; error interno: reintentable', async () => {
  const { clave, fila } = await clienteDePrueba();
  const datos = crearDoble({
    clientes: [fila],
    fallaInsertar: (f) => (f.id_externo === 'KM'
      ? Object.assign(new Error('El kilometraje (900) es menor que el de una carga anterior de este vehículo (1000).'), { codigo: 'P0001' })
      : f.id_externo === 'CAIDA' ? Object.assign(new Error('connection reset'), { codigo: '' }) : null),
  });
  const { app } = montar(datos);
  const r = await app.request('/api/v1/cargas-combustible', enviar(clave, [
    { ...CARGA, id_externo: 'KM' }, { ...CARGA, id_externo: 'CAIDA' },
  ]));
  assert.equal(r.status, 422);
  const { resultados } = await r.json();
  assert.match(resultados[0].errores[0], /menor que el de una carga anterior/);
  assert.equal(resultados[1].reintentable, true);
  assert.ok(!JSON.stringify(resultados).includes('connection reset'));
});

test('se guardan en orden de fecha', async () => {
  const { clave, fila } = await clienteDePrueba();
  const datos = crearDoble({ clientes: [fila] });
  const { app } = montar(datos);
  await app.request('/api/v1/lecturas-odometro', enviar(clave, [
    { id_externo: 'L2', patente: 'ABCD12', km: 200, fecha_lectura: '2026-10-29T20:00:00-03:00' },
    { id_externo: 'L1', patente: 'ABCD12', km: 100, fecha_lectura: '2026-10-28T20:00:00-03:00' },
  ]));
  assert.deepEqual(datos.tablas.lectura_odometro.map((f) => f.id_externo), ['L1', 'L2']);
  assert.equal(datos.tablas.lectura_odometro[0].fuente, 'gps');
  assert.equal(datos.tablas.lectura_odometro[0].fecha_lectura, '2026-10-28T23:00:00.000Z');
});

test('pagos: reglas entre campos', async () => {
  const { clave, fila } = await clienteDePrueba();
  const datos = crearDoble({ clientes: [fila] });
  const { app } = montar(datos);
  const base = { patente: 'ABCD12', monto: 98500, fecha_pago: '2026-03-28' };
  const r = await app.request('/api/v1/pagos-vehiculos', enviar(clave, [
    { ...base, id_externo: 'P1', tipo: 'permiso_circulacion', vigencia_desde: '2026-04-01', vigencia_hasta: '2027-03-31', rut_proveedor: '11.111.111-1' },
    { ...base, id_externo: 'P2', tipo: 'soap' },
    { ...base, id_externo: 'P3', tipo: 'otro' },
    { ...base, id_externo: 'P4', tipo: 'multa', estado_pago: 'pendiente', fecha_pago: undefined },
    { ...base, id_externo: 'P5', tipo: 'multa', rut_proveedor: '11.111.111-2' },
  ]));
  const { resultados } = await r.json();
  assert.equal(resultados[0].estado, 'creado');
  assert.match(resultados[1].errores[0], /vigencia_hasta/);
  assert.match(resultados[2].errores[0], /categoria_otro/);
  assert.match(resultados[3].errores[0], /vence_pago/);
  assert.match(resultados[4].errores[0], /RUT/);
  assert.equal(datos.tablas.pago_vehiculo[0].estado_pago, 'pagado');
  assert.equal(datos.tablas.pago_vehiculo[0].rut_proveedor, '11111111-1');
});

test('cuerpo mal formado', async () => {
  const { clave, fila } = await clienteDePrueba();
  const { app } = montar(crearDoble({ clientes: [fila] }));
  const post = (body, ct = 'application/json') => app.request('/api/v1/cargas-combustible',
    conClave(clave, { method: 'POST', headers: { 'content-type': ct }, body }));
  assert.equal((await post('{no es json')).status, 400);
  assert.equal((await post(JSON.stringify({ registros: [] }))).status, 400);
  assert.equal((await post(JSON.stringify([CARGA]))).status, 400);
  assert.equal((await post(JSON.stringify({ registros: [CARGA], otro: 1 }))).status, 400);
  assert.equal((await post(JSON.stringify({ registros: Array(MAX_REGISTROS + 1).fill(CARGA) }))).status, 400);
  assert.equal((await post('registros=1', 'application/x-www-form-urlencoded')).status, 415);
  assert.equal((await post(JSON.stringify({ registros: [{ ...CARGA, observaciones: 'x'.repeat(1_100_000) }] }))).status, 413);
});

test('consultar lo enviado: solo lo propio', async () => {
  const a = await clienteDePrueba();
  const b = await clienteDePrueba();
  const datos = crearDoble({ clientes: [a.fila, b.fila] });
  const { app } = montar(datos);
  await app.request('/api/v1/cargas-combustible', enviar(a.clave, [CARGA]));
  const r = await app.request('/api/v1/cargas-combustible/TX-1', conClave(a.clave));
  assert.equal(r.status, 200);
  assert.equal((await r.json()).datos.estado, 'vigente');
  assert.equal((await app.request('/api/v1/cargas-combustible/TX-1', conClave(b.clave))).status, 404);
  assert.equal((await app.request('/api/v1/cargas-combustible/%20mal%20', conClave(a.clave))).status, 400);
});

test('rutas y métodos desconocidos', async () => {
  const { clave, fila } = await clienteDePrueba();
  const { app } = montar(crearDoble({ clientes: [fila] }));
  let r = await app.request('/api/v1/cargas-combustible', conClave(clave));
  assert.equal(r.status, 405);
  assert.equal(r.headers.get('allow'), 'POST');
  r = await app.request('/api/v1/equipos', enviar(clave, [CARGA]));
  assert.equal(r.status, 404);
  r = await app.request('/api/v1/a/b/c', conClave(clave));
  assert.equal(r.status, 404);
});

test('un error inesperado responde 500 sin detalles internos', async () => {
  const { clave, fila } = await clienteDePrueba();
  const datos = crearDoble({ clientes: [fila] });
  datos.vehiculos = async () => { throw new Error('detalle interno de la base'); };
  const { app } = montar(datos);
  const r = await app.request('/api/v1/vehiculos', conClave(clave));
  assert.equal(r.status, 500);
  const texto = await r.text();
  assert.ok(!texto.includes('detalle interno'));
  assert.match(texto, /solicitud_id/);
});

test('purga del registro', async () => {
  const antesDe = await purgarRegistroApi(crearDoble(), 180, AHORA);
  assert.equal(antesDe, '2026-05-03T15:00:00.000Z');
});
