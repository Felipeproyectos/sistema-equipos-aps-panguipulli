// Lo que un sistema externo puede ENVIAR por /api/v1, recurso por recurso:
// a qué tabla va, qué alcance exige, qué campos acepta (con su tipo y sus
// límites) y las reglas entre campos que se revisan antes de ir a la base.
//
// Los catálogos son los mismos que exige la base (constraints de
// 32_unidad_control.sql y 34_api_integracion.sql) y que muestra la pantalla
// (src/lib/unidadControl.js). Si cambian allá, cambian acá.
import { sumarDias } from './validacion.js';

export const TIPOS_COMBUSTIBLE = ['diesel', 'gasolina_93', 'gasolina_95', 'gasolina_97', 'otro'];
export const DOCUMENTOS = ['boleta', 'factura', 'guia', 'vale', 'otro'];
export const MEDIOS_PAGO = ['tarjeta_combustible', 'efectivo', 'transferencia', 'credito', 'otro'];
export const TIPOS_PAGO = ['permiso_circulacion', 'revision_tecnica', 'soap', 'seguro', 'peaje_tag',
  'multa', 'reparacion_externa', 'neumaticos', 'lavado', 'estacionamiento', 'otro'];
const CON_VIGENCIA = ['permiso_circulacion', 'revision_tecnica', 'soap'];

const MONTO_MAXIMO = 100_000_000;

const COMUNES = {
  id_externo: {
    tipo: 'id_externo', requerido: true, ejemplo: 'COPEC-2026-000123',
    descripcion: 'Identificador del registro en el sistema que lo envía. Un mismo id_externo entra una sola vez: reenviarlo no lo duplica.',
  },
  patente: {
    tipo: 'patente', requerido: true, ejemplo: 'AB-CD-12',
    descripcion: 'Patente del vehículo. Se ignoran guiones, puntos, espacios y mayúsculas. Debe estar en GET /vehiculos.',
  },
};

// Marca de quién lo mandó: la ve la Unidad de Control junto a cada registro.
const control = (cliente) => ({
  origen: 'api',
  api_cliente_id: cliente.id,
  registrado_por_email: `api:${cliente.prefijo}`,
  registrado_por_nombre: `API · ${cliente.nombre}`,
});

export const RECURSOS = {
  'cargas-combustible': {
    tabla: 'carga_combustible',
    alcance: 'combustible:escribir',
    titulo: 'Cargas de combustible',
    descripcion: 'Llegan a Unidad de Control → Combustible, con origen «API». El centro que paga lo calcula el sistema (considera préstamos de vehículos).',
    campos: {
      ...COMUNES,
      fecha: { tipo: 'fecha', requerido: true, ejemplo: '2026-10-30', descripcion: 'Día de la carga (AAAA-MM-DD, hora de Chile).' },
      hora: { tipo: 'hora', ejemplo: '14:05', descripcion: 'Hora de la carga (HH:MM). Ordena las cargas de un mismo día.' },
      litros: { tipo: 'numero', requerido: true, mayorQue: 0, max: 1000, ejemplo: 45.2 },
      monto: { tipo: 'numero', min: 0, max: MONTO_MAXIMO, ejemplo: 52000, descripcion: 'Total en pesos. Obligatorio si no viene precio_litro.' },
      precio_litro: { tipo: 'numero', min: 0, max: 100_000, ejemplo: 1150, descripcion: 'Si no viene monto, el sistema lo calcula como litros × precio_litro.' },
      km: { tipo: 'numero', min: 0, max: 3_000_000, ejemplo: 105230, descripcion: 'Odómetro al cargar. No puede ser menor que el de una carga anterior del mismo vehículo.' },
      estanque_lleno: { tipo: 'booleano', ejemplo: true },
      tipo_combustible: { tipo: 'catalogo', valores: TIPOS_COMBUSTIBLE, ejemplo: 'diesel' },
      estacion: { tipo: 'texto', max: 120, ejemplo: 'Copec Panguipulli Centro' },
      comuna: { tipo: 'texto', max: 80, ejemplo: 'Panguipulli' },
      documento_tipo: { tipo: 'catalogo', valores: DOCUMENTOS, ejemplo: 'boleta' },
      documento_numero: { tipo: 'texto', max: 40, ejemplo: '88123' },
      medio_pago: { tipo: 'catalogo', valores: MEDIOS_PAGO, ejemplo: 'tarjeta_combustible' },
      tarjeta: { tipo: 'tarjeta', ejemplo: '7001234567891234', descripcion: 'Número de la tarjeta de combustible. Solo se guardan los 4 últimos dígitos.' },
      chofer_nombre: { tipo: 'texto', max: 120, ejemplo: 'Juan Pérez' },
      observaciones: { tipo: 'texto', max: 500 },
    },
    revisar(fila, { hoy }) {
      const errores = [];
      if (fila.monto === undefined && fila.precio_litro === undefined) {
        errores.push('monto: es obligatorio si no viene precio_litro');
      }
      if (fila.fecha && fila.fecha > sumarDias(hoy, 1)) errores.push(`fecha: ${fila.fecha} está en el futuro`);
      return errores;
    },
    // Las de un mismo vehículo se guardan en orden: la base compara el km
    // con la carga anterior.
    orden: (f) => `${f.fecha} ${f.hora || ''}`,
    control,
    consulta: 'id,id_externo,estado,motivo_anulacion,fecha_anulacion,equipo_label,fecha,hora,litros,monto,centro_costo,created_date',
  },

  'pagos-vehiculos': {
    tabla: 'pago_vehiculo',
    alcance: 'pagos:escribir',
    titulo: 'Pagos de vehículos',
    descripcion: 'Llegan a Unidad de Control → Pagos, con origen «API». Los de permiso de circulación, revisión técnica y SOAP alimentan los vencimientos de cada vehículo.',
    campos: {
      ...COMUNES,
      tipo: { tipo: 'catalogo', valores: TIPOS_PAGO, requerido: true, ejemplo: 'permiso_circulacion' },
      categoria_otro: { tipo: 'texto', min: 3, max: 80, descripcion: 'Obligatorio si tipo es "otro": de qué se trata.' },
      descripcion: { tipo: 'texto', max: 300, ejemplo: 'Permiso de circulación 2027' },
      monto: { tipo: 'numero', requerido: true, min: 0, max: MONTO_MAXIMO, ejemplo: 98500 },
      estado_pago: { tipo: 'catalogo', valores: ['pagado', 'pendiente'], ejemplo: 'pagado', descripcion: 'Si no viene, "pagado".' },
      fecha_pago: { tipo: 'fecha', ejemplo: '2026-03-28', descripcion: 'Obligatoria si el pago está hecho.' },
      vence_pago: { tipo: 'fecha', descripcion: 'Obligatoria si el pago está pendiente: hasta cuándo se puede pagar.' },
      proveedor: { tipo: 'texto', max: 120, ejemplo: 'Municipalidad de Panguipulli' },
      rut_proveedor: { tipo: 'rut', ejemplo: '11.111.111-1', descripcion: 'Se verifica el dígito verificador.' },
      documento_tipo: { tipo: 'catalogo', valores: DOCUMENTOS, ejemplo: 'factura' },
      documento_numero: { tipo: 'texto', max: 40 },
      medio_pago: { tipo: 'catalogo', valores: MEDIOS_PAGO, ejemplo: 'transferencia' },
      vigencia_desde: { tipo: 'fecha', ejemplo: '2026-04-01' },
      vigencia_hasta: { tipo: 'fecha', ejemplo: '2027-03-31', descripcion: 'Obligatoria para permiso de circulación, revisión técnica y SOAP.' },
      observaciones: { tipo: 'texto', max: 500 },
    },
    revisar(fila, { hoy }) {
      const errores = [];
      const estado = fila.estado_pago || 'pagado';
      if (estado === 'pagado' && !fila.fecha_pago) errores.push('fecha_pago: es obligatoria si el pago está hecho');
      if (estado === 'pendiente' && !fila.vence_pago) errores.push('vence_pago: es obligatoria si el pago está pendiente');
      if (fila.fecha_pago && fila.fecha_pago > sumarDias(hoy, 1)) errores.push(`fecha_pago: ${fila.fecha_pago} está en el futuro`);
      if (fila.tipo === 'otro' && !fila.categoria_otro) errores.push('categoria_otro: es obligatoria si tipo es "otro"');
      if (CON_VIGENCIA.includes(fila.tipo) && !fila.vigencia_hasta) {
        errores.push('vigencia_hasta: es obligatoria para permiso de circulación, revisión técnica y SOAP');
      }
      if (fila.vigencia_desde && fila.vigencia_hasta && fila.vigencia_hasta < fila.vigencia_desde) {
        errores.push('vigencia_hasta: termina antes de vigencia_desde');
      }
      fila.estado_pago = estado;
      return errores;
    },
    orden: (f) => f.fecha_pago || f.vence_pago || '',
    control,
    consulta: 'id,id_externo,estado,motivo_anulacion,fecha_anulacion,equipo_label,tipo,monto,estado_pago,fecha_pago,vence_pago,vigencia_hasta,centro_costo,created_date',
  },

  'lecturas-odometro': {
    tabla: 'lectura_odometro',
    alcance: 'odometro:escribir',
    titulo: 'Lecturas de odómetro (GPS)',
    descripcion: 'El kilometraje de cada vehículo según el GPS. Se muestra como «último km» en las fichas de la flota. Basta una lectura por vehículo al día (por ejemplo, al cierre de la jornada).',
    campos: {
      ...COMUNES,
      km: { tipo: 'numero', requerido: true, min: 0, max: 3_000_000, ejemplo: 105480, descripcion: 'Odómetro. No puede ser menor que una lectura anterior ni mayor que una posterior del mismo vehículo.' },
      fecha_lectura: { tipo: 'fecha_hora', requerido: true, ejemplo: '2026-10-30T20:00:00-03:00', descripcion: 'Momento de la lectura, ISO 8601 con zona horaria.' },
      fuente: { tipo: 'texto', max: 40, ejemplo: 'gps', descripcion: 'Si no viene, "gps".' },
    },
    revisar(fila, { ahora }) {
      const errores = [];
      if (fila.fecha_lectura && new Date(fila.fecha_lectura).getTime() > ahora + 86_400_000) {
        errores.push(`fecha_lectura: ${fila.fecha_lectura} está en el futuro`);
      }
      fila.fuente = fila.fuente || 'gps';
      return errores;
    },
    orden: (f) => f.fecha_lectura || '',
    control: (cliente) => ({ origen: 'api', api_cliente_id: cliente.id, registrado_por_nombre: `API · ${cliente.nombre}` }),
    consulta: 'id,id_externo,equipo_label,fecha_lectura,km,fuente,created_date',
  },
};
