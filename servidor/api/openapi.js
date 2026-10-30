// El contrato de /api/v1 en OpenAPI 3.1, armado desde recursos.js: lo que se
// documenta es exactamente lo que se valida. Se sirve en
// GET /api/v1/openapi.json y se puede abrir en cualquier visor de OpenAPI
// (Swagger Editor, Postman, Insomnia).
import { RECURSOS } from './recursos.js';
import { ALCANCES } from './alcances.js';

const ESQUEMA_CAMPO = {
  id_externo: () => ({ type: 'string', pattern: '^[A-Za-z0-9._:/-]{1,100}$' }),
  patente: () => ({ type: 'string', minLength: 4, maxLength: 12 }),
  texto: (d) => ({ type: 'string', maxLength: d.max, ...(d.min && { minLength: d.min }) }),
  numero: (d) => ({
    type: 'number',
    ...(d.mayorQue !== undefined && { exclusiveMinimum: d.mayorQue }),
    ...(d.min !== undefined && { minimum: d.min }),
    ...(d.max !== undefined && { maximum: d.max }),
  }),
  booleano: () => ({ type: 'boolean' }),
  catalogo: (d) => ({ type: 'string', enum: d.valores }),
  fecha: () => ({ type: 'string', format: 'date' }),
  hora: () => ({ type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' }),
  fecha_hora: () => ({ type: 'string', format: 'date-time' }),
  rut: () => ({ type: 'string', maxLength: 12 }),
  tarjeta: () => ({ type: 'string', maxLength: 30 }),
};

function esquemaRegistro(def) {
  const properties = {};
  for (const [nombre, d] of Object.entries(def.campos)) {
    properties[nombre] = {
      ...ESQUEMA_CAMPO[d.tipo](d),
      ...(d.descripcion && { description: d.descripcion }),
      ...(d.ejemplo !== undefined && { examples: [d.ejemplo] }),
    };
  }
  return {
    type: 'object',
    additionalProperties: false,
    required: Object.entries(def.campos).filter(([, d]) => d.requerido).map(([n]) => n),
    properties,
  };
}

const ejemploRegistro = (def) => Object.fromEntries(
  Object.entries(def.campos).filter(([, d]) => d.ejemplo !== undefined).map(([n, d]) => [n, d.ejemplo]),
);

const respuestaError = (descripcion) => ({
  description: descripcion,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
});

const ERRORES_COMUNES = {
  401: respuestaError('Falta la clave, no es válida, fue revocada (clave_revocada) o venció (clave_vencida).'),
  403: respuestaError('El acceso no tiene el alcance necesario, o la llamada no fue por HTTPS.'),
  429: respuestaError('Se superó el límite por minuto, o hubo demasiados intentos fallidos desde esa dirección. Respetar Retry-After.'),
  500: respuestaError('Error interno. Trae solicitud_id para informarlo.'),
  503: respuestaError('La API no está configurada en el servidor.'),
};

export function documentoOpenApi({ maxRegistros }) {
  const paths = {
    '/yo': {
      get: {
        summary: 'Qué puede hacer la clave con que se llama',
        operationId: 'yo',
        responses: { 200: { description: 'Nombre del acceso, alcances, centros, límite y vencimiento.' }, ...ERRORES_COMUNES },
      },
    },
    '/vehiculos': {
      get: {
        summary: 'Vehículos de la flota de los centros autorizados',
        description: 'Las patentes que se pueden usar en los envíos. Disponible para cualquier acceso.',
        operationId: 'listarVehiculos',
        responses: {
          200: {
            description: 'Lista de vehículos.',
            content: { 'application/json': { schema: { type: 'object', properties: { datos: { type: 'array', items: { $ref: '#/components/schemas/Vehiculo' } } } } } },
          },
          ...ERRORES_COMUNES,
        },
      },
    },
  };
  const schemas = {
    Error: {
      type: 'object',
      properties: {
        error: {
          type: 'object',
          required: ['codigo', 'mensaje'],
          properties: { codigo: { type: 'string' }, mensaje: { type: 'string' }, solicitud_id: { type: 'string' } },
        },
      },
    },
    Vehiculo: {
      type: 'object',
      properties: {
        id: { type: 'string' }, patente: { type: 'string' }, tipo: { type: 'string', enum: ['ambulancia', 'camioneta', 'furgon', 'camion_3_4'] },
        marca: { type: 'string' }, modelo: { type: 'string' }, centro: { type: 'string' }, subsede: { type: 'string' }, activo: { type: 'boolean' },
      },
    },
    Resultado: {
      type: 'object',
      properties: {
        resumen: {
          type: 'object',
          properties: { recibidos: { type: 'integer' }, creados: { type: 'integer' }, duplicados: { type: 'integer' }, rechazados: { type: 'integer' } },
        },
        resultados: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              indice: { type: 'integer', description: 'Posición del registro en el arreglo enviado (desde 0).' },
              id_externo: { type: ['string', 'null'] },
              estado: { type: 'string', enum: ['creado', 'duplicado', 'rechazado'] },
              id: { type: 'string', description: 'Id interno (creado o duplicado).' },
              errores: { type: 'array', items: { type: 'string' } },
              reintentable: { type: 'boolean', description: 'true si falló por un problema del servidor: se puede reenviar tal cual.' },
            },
          },
        },
      },
    },
  };

  for (const [ruta, def] of Object.entries(RECURSOS)) {
    const nombre = def.tabla.replace(/(^|_)(\w)/g, (_, __, l) => l.toUpperCase());
    schemas[nombre] = esquemaRegistro(def);
    paths[`/${ruta}`] = {
      post: {
        summary: `Enviar ${def.titulo.toLowerCase()}`,
        description: `${def.descripcion}\n\nAlcance: \`${def.alcance}\`. Hasta ${maxRegistros} registros por llamada. Cada registro se responde por separado: los válidos entran aunque otros se rechacen.`,
        operationId: `enviar${nombre}`,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                additionalProperties: false,
                required: ['registros'],
                properties: { registros: { type: 'array', minItems: 1, maxItems: maxRegistros, items: { $ref: `#/components/schemas/${nombre}` } } },
              },
              example: { registros: [ejemploRegistro(def)] },
            },
          },
        },
        responses: {
          200: { description: 'Todos los registros entraron o ya estaban (duplicado).', content: { 'application/json': { schema: { $ref: '#/components/schemas/Resultado' } } } },
          207: { description: 'Algunos registros se rechazaron: revisar resultados[].errores.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Resultado' } } } },
          400: respuestaError('El cuerpo no tiene la forma {"registros": [...]} o supera el máximo.'),
          413: respuestaError('El cuerpo supera 1 MB.'),
          415: respuestaError('El cuerpo no es application/json.'),
          422: { description: 'Ningún registro entró: revisar resultados[].errores.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Resultado' } } } },
          ...ERRORES_COMUNES,
        },
      },
    };
    paths[`/${ruta}/{id_externo}`] = {
      get: {
        summary: `Estado de un registro de ${def.titulo.toLowerCase()} ya enviado`,
        description: 'Solo encuentra lo que envió este mismo acceso. `estado` = "anulado" si la Unidad de Control lo anuló (con su motivo).',
        operationId: `consultar${nombre}`,
        parameters: [{ name: 'id_externo', in: 'path', required: true, schema: { type: 'string', pattern: '^[A-Za-z0-9._:/-]{1,100}$' } }],
        responses: {
          200: { description: 'El registro.' },
          404: respuestaError('Este acceso no envió un registro con ese id_externo.'),
          ...ERRORES_COMUNES,
        },
      },
    };
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'API de integración — Gestión de Equipos APS Panguipulli',
      version: '1.0.0',
      description: [
        'Para que otros sistemas entreguen información: cargas de combustible, lecturas de odómetro (GPS) y pagos de vehículos.',
        '',
        'Autenticación: `Authorization: Bearer <clave>`. La clave la entrega el administrador del sistema y dice qué puede enviar cada sistema:',
        ...ALCANCES.map((a) => `- \`${a.clave}\`: ${a.nombre}.`),
        '',
        'Reenviar un registro con el mismo `id_externo` no lo duplica: responde "duplicado". Ante un error de red se puede reenviar el lote completo.',
      ].join('\n'),
    },
    servers: [{ url: '/api/v1' }],
    security: [{ clave: [] }],
    paths,
    components: {
      securitySchemes: { clave: { type: 'http', scheme: 'bearer', description: 'Clave aps_… entregada por el administrador.' } },
      schemas,
    },
  };
}
