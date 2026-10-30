// Qué puede ENVIAR cada acceso de la API de integración.
//
// Lo usan dos lados: la API (servidor/api/index.js), que lo exige en cada
// ruta, y gestionarApiClientes, que valida lo que se pide al crear un acceso
// y se lo entrega a la pantalla de Configuración para armar los casilleros.
// No importa nada de Node: el modo local lo carga en el navegador.
//
// Cualquier acceso puede además consultar el catálogo de vehículos de sus
// centros (GET /api/v1/vehiculos): sin eso no sabría qué patentes existen.

export const ALCANCES = [
  {
    clave: 'combustible:escribir',
    nombre: 'Cargas de combustible',
    descripcion: 'Por ejemplo, el proveedor de la tarjeta de combustible. Llegan a Unidad de Control.',
  },
  {
    clave: 'odometro:escribir',
    nombre: 'Kilometraje (GPS)',
    descripcion: 'Lecturas del odómetro de cada vehículo. Se ven como «último km» en las fichas de la flota.',
  },
  {
    clave: 'pagos:escribir',
    nombre: 'Pagos de vehículos',
    descripcion: 'Permisos de circulación, revisión técnica, SOAP, TAG, multas. Llegan a Unidad de Control.',
  },
];

export const CLAVES_ALCANCE = ALCANCES.map((a) => a.clave);

export const LIMITE_POR_MINUTO = { minimo: 10, maximo: 600, defecto: 60 };

// Un acceso vence siempre: obliga a rotar la clave al menos una vez al año.
export const DIAS_VIGENCIA = { minimo: 1, maximo: 365, defecto: 365 };
