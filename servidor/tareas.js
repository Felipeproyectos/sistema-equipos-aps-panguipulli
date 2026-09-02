// Las automatizaciones que en Base44 disparaba la plataforma y que la
// migracion no traia: sin esto nadie recibe una alerta nunca.
//
// ponytail: node-cron y no setInterval porque Chile cambia de horario dos
// veces al ano; 'America/Santiago' lo resuelve la libreria, un intervalo a
// mano no. Corren dentro del mismo proceso del servidor — un servicio aparte
// en Railway seria otra deploy y otro contenedor para dos llamadas al dia.
import cron from 'node-cron';
import { CABECERA_TAREA } from './base44compat.js';
import { handlers } from './funciones/index.js';

const ZONA = 'America/Santiago';

const TAREAS = [
  // Vencimientos de parches y baterias. El horario lo fijo la propia funcion
  // en su comentario: "Automatizacion programada (1 vez al dia, 03:00 CL)".
  { nombre: 'generarAlertasAutomaticas', horario: '0 3 * * *', descripcion: 'alertas de vencimiento' },
  // Repuestos bajo el minimo. Estaba escrita y sin llamador desde siempre.
  { nombre: 'verificarStockRepuestos', horario: '0 7 * * *', descripcion: 'stock bajo de repuestos' },
];

async function ejecutar({ nombre, descripcion }) {
  const fn = handlers[nombre];
  if (!fn) return console.error(`[tarea] ${nombre} no existe`);
  const inicio = Date.now();
  try {
    const req = new Request(`http://tarea.interna/functions/${nombre}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', [CABECERA_TAREA]: process.env.CRON_SECRET },
      body: '{}',
    });
    const res = await fn(req);
    const cuerpo = await res.json().catch(() => ({}));
    const ms = Date.now() - inicio;
    if (res.ok) console.log(`[tarea] ${nombre} (${descripcion}) ok en ${ms}ms`, cuerpo);
    else console.error(`[tarea] ${nombre} respondio ${res.status}`, cuerpo);
  } catch (error) {
    console.error(`[tarea] ${nombre} reventó:`, error);
  }
}

export function programarTareas() {
  if (!process.env.CRON_SECRET) {
    console.warn('[tarea] CRON_SECRET no esta puesto: las tareas programadas quedan apagadas');
    return [];
  }
  for (const t of TAREAS) {
    cron.schedule(t.horario, () => ejecutar(t), { timezone: ZONA });
    console.log(`[tarea] ${t.nombre} programada: ${t.horario} (${ZONA})`);
  }
  return TAREAS;
}

// Para dispararlas a mano desde /tareas/:nombre sin esperar al horario.
export async function ejecutarAhora(nombre) {
  const tarea = TAREAS.find((t) => t.nombre === nombre);
  if (!tarea) return false;
  await ejecutar(tarea);
  return true;
}

export const nombresDeTareas = () => TAREAS.map((t) => t.nombre);
