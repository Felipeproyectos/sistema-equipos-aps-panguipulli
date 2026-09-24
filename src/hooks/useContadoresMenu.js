import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { contarPendientes, datosParaRol } from "@/lib/contadoresMenu";

// Los números del menú (ver src/lib/contadoresMenu.js). Se piden a la base
// solo los datos que usan las pantallas del rol, y se comparten entre el menú
// de escritorio, el del celular y la barra inferior: una sola consulta aunque
// haya tres menús montados.
//
// Se refrescan al cambiar de pantalla (si pasaron más de 20 s), cada 90 s, al
// volver a la pestaña, y cuando una pantalla avisa que cambió algo con
// `avisarCambioEnPendientes()`.

const PEDIDOS = {
  solicitudes: () => base44.entities.Solicitud.list("-created_date", 500),
  ordenes: () => base44.entities.OrdenTrabajo.list("-created_date", 500),
  equipos: () => base44.entities.Equipo.list("-updated_date", 500),
  repuestos: () => base44.entities.SolicitudRepuesto.list("-created_date", 300),
  repuestosSalud: () => base44.entities.SolicitudRepuestoSalud.list("-created_date", 300),
  inspecciones: () => base44.entities.InspeccionPendiente.filter({ estado: "pendiente" }, "-created_date", 500),
  alertas: () => base44.entities.Alerta.filter({ estado: "activa" }, "-created_date", 500),
};

const EVENTO = "contadores-menu:refrescar";
const VIGENCIA_MS = 20000;

let cache = { clave: null, en: 0, valor: {} };
let enCurso = null;
const suscriptores = new Set();

async function cargar(role, email, forzar = false) {
  const clave = `${role}|${email}`;
  if (!forzar && cache.clave === clave && Date.now() - cache.en < VIGENCIA_MS) return;
  if (enCurso?.clave === clave) return enCurso.promesa;

  const promesa = (async () => {
    const nombres = datosParaRol(role);
    // Una consulta que falla (una tabla que ese rol no puede leer) deja ese
    // contador en cero; no apaga los demás.
    const filas = await Promise.all(nombres.map(n => PEDIDOS[n]().catch(() => [])));
    const datos = Object.fromEntries(nombres.map((n, i) => [n, filas[i]]));
    cache = { clave, en: Date.now(), valor: contarPendientes(role, email, datos) };
    suscriptores.forEach(fn => fn(cache.valor));
  })().finally(() => { enCurso = null; });

  enCurso = { clave, promesa };
  return promesa;
}

/** Para las pantallas: "acabo de resolver algo, recalculen". */
export function avisarCambioEnPendientes() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENTO));
}

export default function useContadoresMenu(role, email, pagina) {
  const clave = `${role}|${email}`;
  const [valor, setValor] = useState(() => (cache.clave === clave ? cache.valor : {}));

  useEffect(() => {
    if (!role) return undefined;
    const fn = (v) => setValor(v);
    suscriptores.add(fn);
    if (cache.clave === clave) setValor(cache.valor);
    cargar(role, email);

    const forzar = () => cargar(role, email, true);
    const alVolver = () => { if (document.visibilityState === "visible") cargar(role, email); };
    const intervalo = setInterval(forzar, 90000);
    window.addEventListener(EVENTO, forzar);
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      suscriptores.delete(fn);
      clearInterval(intervalo);
      window.removeEventListener(EVENTO, forzar);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [role, email, clave]);

  // Cambiar de pantalla es la señal más común de "quiero ver lo último".
  useEffect(() => { if (role) cargar(role, email); }, [pagina, role, email]);

  return cache.clave === clave ? valor : {};
}
