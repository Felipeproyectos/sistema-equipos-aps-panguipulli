// Las reglas de la bitácora de operación, separadas de la pantalla para poder
// probarlas sin navegador.
//
// Lo que se mide acá se usa después para decidir gastos y mantenciones, así
// que un error de suma no se nota hasta que ya está en un informe. El
// autotest del final corre con `node src/lib/bitacoraFlota.js`.
//
// La regla de verdad sobre el odómetro vive en la base (el disparador
// `bitacora_flota_contexto` de migracion/18_bitacora_flota.sql). Acá está
// para avisar antes de guardar, que es distinto de impedir.

/** Una salida sin regreso sigue abierta. No se cierra sola: el vehículo que
 *  salió y no volvió es justamente lo que hay que ver. */
export const ESTADOS_SALIDA = [
  { value: "en_ruta", label: "En ruta", color: "#b45309", bg: "#fffbeb", borde: "#fde68a" },
  { value: "cerrada", label: "Cerrada", color: "#15803d", bg: "#f0fdf4", borde: "#bbf7d0" },
];

export const estadoSalida = (v) =>
  ESTADOS_SALIDA.find(e => e.value === v) || ESTADOS_SALIDA[0];

/** Un número o null. `""`, null y lo que no es número dan null — nunca 0:
 *  un campo en blanco no es "salió con el odómetro en cero". */
export function aNumero(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Los kilómetros de una salida, o null si todavía no se sabe. */
export function kmRecorridos(r) {
  const sale = aNumero(r?.km_salida);
  const vuelve = aNumero(r?.km_regreso);
  if (sale === null || vuelve === null) return null;
  const d = vuelve - sale;
  return d >= 0 ? d : null;
}

/** El kilometraje más alto que consta para un vehículo. Es lo que se propone
 *  como salida siguiente y contra lo que se avisa si alguien escribe menos. */
export function ultimoKm(registros, equipoId) {
  let max = null;
  for (const r of registros) {
    if (r.equipo_id !== equipoId) continue;
    for (const v of [aNumero(r.km_salida), aNumero(r.km_regreso)]) {
      if (v !== null && (max === null || v > max)) max = v;
    }
  }
  return max;
}

/** Las salidas de un vehículo que siguen sin regreso. */
export const enRuta = (registros, equipoId) =>
  registros.filter(r => r.estado === "en_ruta" && (!equipoId || r.equipo_id === equipoId));

/**
 * Revisa una salida antes de guardarla.
 *
 * Devuelve `{ error, aviso }`. `error` impide guardar; `aviso` no — es para
 * que la persona mire dos veces. La diferencia importa: el odómetro al revés
 * es un dato imposible, pero un kilometraje más bajo que el último registrado
 * puede ser perfectamente real (alguien anotó mal la semana pasada, o el
 * vehículo tiene el tablero cambiado). Frenarlo dejaría trabado justo al que
 * está tratando de corregir.
 */
export function validarSalida(form, opciones = {}) {
  const { ultimo = null, hoy = new Date().toISOString().split("T")[0] } = opciones;
  const sale = aNumero(form.km_salida);
  const vuelve = aNumero(form.km_regreso);

  if (!form.equipo_id) return { error: "Elige el vehículo." };
  if (!form.fecha) return { error: "Falta la fecha de la salida." };
  if (form.fecha > hoy) return { error: "No se puede registrar una salida de un día que todavía no llega." };
  if (form.km_salida !== "" && form.km_salida !== undefined && sale === null) {
    return { error: "El kilometraje de salida tiene que ser un número." };
  }
  if (form.km_regreso !== "" && form.km_regreso !== undefined && vuelve === null) {
    return { error: "El kilometraje de regreso tiene que ser un número." };
  }
  if (sale !== null && vuelve !== null && vuelve < sale) {
    return { error: "El kilometraje de regreso no puede ser menor que el de salida." };
  }
  if (sale !== null && sale < 0) return { error: "El kilometraje no puede ser negativo." };

  let aviso = null;
  if (sale !== null && ultimo !== null && sale < ultimo) {
    aviso = `El último kilometraje registrado de este vehículo es ${ultimo.toLocaleString("es-CL")} km. `
          + "Si la salida es menor, revisa el dato antes de guardar.";
  }
  const recorrido = kmRecorridos({ km_salida: sale, km_regreso: vuelve });
  if (recorrido !== null && recorrido > 1500) {
    aviso = `Son ${recorrido.toLocaleString("es-CL")} km en una salida. Revisa que el kilometraje esté bien anotado.`;
  }
  return { error: null, aviso };
}

// ── Totales ──────────────────────────────────────────────────────────────
// Las salidas abiertas cuentan como salidas pero no suman kilómetros: todavía
// no se sabe cuántos fueron. Sumar cero por ellas dejaría los promedios
// mintiendo hacia abajo sin que nada lo diga, así que se cuentan aparte.

export function resumen(registros) {
  let km = 0, litros = 0, monto = 0, abiertas = 0, conKm = 0;
  for (const r of registros) {
    const d = kmRecorridos(r);
    if (d === null) { if (r.estado === "en_ruta") abiertas++; }
    else { km += d; conKm++; }
    litros += aNumero(r.combustible_litros) || 0;
    monto += aNumero(r.combustible_monto) || 0;
  }
  return { salidas: registros.length, km, litros, monto, abiertas, conKm };
}

/** Agrupa por lo que diga `clave`, y ordena por kilómetros de mayor a menor. */
function agrupar(registros, clave, etiqueta) {
  const mapa = new Map();
  for (const r of registros) {
    const k = r[clave] || "(sin dato)";
    if (!mapa.has(k)) mapa.set(k, { clave: k, label: r[etiqueta] || k, filas: [] });
    mapa.get(k).filas.push(r);
  }
  return [...mapa.values()]
    .map(g => ({ clave: g.clave, label: g.label, ...resumen(g.filas) }))
    .sort((a, b) => b.km - a.km || b.salidas - a.salidas);
}

export const porVehiculo = (registros) => agrupar(registros, "equipo_id", "equipo_label");
export const porChofer = (registros) => agrupar(registros, "chofer_id", "chofer_nombre");

/** "durante el préstamo a Coñaripe" — el dato que hace que la bitácora del
 *  chofer explique dónde estaba, y no solo qué manejó. */
export const etiquetaPrestamo = (r) =>
  r?.prestamo_id ? `Durante el préstamo a ${r.prestamo_destino || "otro centro"}` : null;

export function _selfCheck() {
  const fallos = [];
  const debe = (cond, que) => { if (!cond) fallos.push(que); };

  debe(aNumero("") === null && aNumero(null) === null, "vacio no es cero");
  debe(aNumero("0") === 0, "cero escrito si es cero");
  debe(aNumero("12,5") === null, "la coma no es un numero valido");

  debe(kmRecorridos({ km_salida: 100, km_regreso: 180 }) === 80, "80 km");
  debe(kmRecorridos({ km_salida: 100, km_regreso: "" }) === null, "sin regreso no se sabe");
  debe(kmRecorridos({ km_salida: 100, km_regreso: 90 }) === null, "al reves no inventa un negativo");
  debe(kmRecorridos({ km_salida: 100, km_regreso: 100 }) === 0, "cero km es un resultado valido");

  const hoy = "2026-09-21";
  debe(validarSalida({ equipo_id: "e1", fecha: hoy, km_salida: 100, km_regreso: 90 }, { hoy }).error,
    "el regreso menor se rechaza");
  debe(validarSalida({ equipo_id: "e1", fecha: "2026-12-01" }, { hoy }).error,
    "no se registra una salida futura");
  debe(!validarSalida({ equipo_id: "e1", fecha: hoy }, { hoy }).error,
    "una salida sin kilometraje se puede guardar");
  debe(validarSalida({ equipo_id: "", fecha: hoy }, { hoy }).error, "sin vehiculo no va");
  const conAviso = validarSalida({ equipo_id: "e1", fecha: hoy, km_salida: 50 }, { hoy, ultimo: 900 });
  debe(!conAviso.error && conAviso.aviso, "el kilometraje mas bajo avisa pero no frena");

  const filas = [
    { equipo_id: "e1", equipo_label: "Hilux", chofer_id: "c1", chofer_nombre: "Ana",
      estado: "cerrada", km_salida: 1000, km_regreso: 1100, combustible_litros: 40, combustible_monto: 50000 },
    { equipo_id: "e1", equipo_label: "Hilux", chofer_id: "c2", chofer_nombre: "Luis",
      estado: "cerrada", km_salida: 1100, km_regreso: 1150 },
    { equipo_id: "e2", equipo_label: "Kangoo", chofer_id: "c1", chofer_nombre: "Ana",
      estado: "en_ruta", km_salida: 500, km_regreso: null },
  ];

  const r = resumen(filas);
  debe(r.salidas === 3, "tres salidas");
  debe(r.km === 150, `150 km en total, hubo ${r.km}`);
  debe(r.abiertas === 1, "una sigue en ruta");
  debe(r.conKm === 2, "solo dos aportan kilometros");
  debe(r.monto === 50000 && r.litros === 40, "el combustible suma");

  debe(ultimoKm(filas, "e1") === 1150, "el ultimo km del e1 es 1150");
  debe(ultimoKm(filas, "e2") === 500, "una salida abierta igual deja constancia del odometro");
  debe(ultimoKm(filas, "e9") === null, "un vehiculo sin registros no tiene ultimo km");

  const veh = porVehiculo(filas);
  debe(veh[0].clave === "e1" && veh[0].km === 150, "el e1 va primero con 150 km");
  debe(veh[1].km === 0 && veh[1].abiertas === 1, "el e2 no suma km porque no ha vuelto");

  const ch = porChofer(filas);
  debe(ch.length === 2, "dos choferes");
  debe(ch.find(c => c.clave === "c1").km === 100, "Ana lleva 100 km cerrados");
  debe(ch.find(c => c.clave === "c1").salidas === 2, "pero hizo dos salidas");

  debe(enRuta(filas).length === 1, "una en ruta");
  debe(enRuta(filas, "e1").length === 0, "el e1 no tiene ninguna abierta");

  debe(etiquetaPrestamo({ prestamo_id: "p1", prestamo_destino: "Coñaripe" })
    === "Durante el préstamo a Coñaripe", "la etiqueta del prestamo");
  debe(etiquetaPrestamo({}) === null, "sin prestamo no hay etiqueta");

  if (fallos.length) { console.error("FALLOS:\n  " + fallos.join("\n  ")); return false; }
  console.log("bitacoraFlota: autotest ok");
  return true;
}

if (typeof process !== "undefined" && process.argv?.[1]?.endsWith("bitacoraFlota.js")) _selfCheck();
