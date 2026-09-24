// El Monitor Corporativo en cuatro áreas: Calidad, Gestión, Movilización y
// Taller Mecánico. Para cada una, tres cosas y nada más:
//   · estado:     verde / ámbar / rojo, con una frase que lo explica
//   · atencion:   lo que hay que mirar, con nombres, de lo más grave a lo menos
//   · indicadores: cuatro números, cada uno con su contexto ("46 de 50")
//
// El Monitor antes mostraba todo lo que había; esto elige lo que importa para
// decidir. Separado de la pantalla para poder probarlo sin navegador:
// `node src/lib/monitorResumen.js`.
import { asignacionDeHoy, periodosEnTaller, rangosSeTocan } from "./calendarioFlota.js";
import { estaAbierta, necesitaAgenda, resumenCoordinacion } from "./agendaTaller.js";
import { resumen as resumenBitacora } from "./bitacoraFlota.js";

const DIA_MS = 86400000;
const aISO = (d) => d.toISOString().split("T")[0];
const sumar = (dia, n) => aISO(new Date(new Date(`${dia}T12:00:00`).getTime() + n * DIA_MS));
const diasEntre = (a, b) => Math.round((new Date(`${String(b).slice(0, 10)}T12:00:00`) - new Date(`${String(a).slice(0, 10)}T12:00:00`)) / DIA_MS);
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
const TIPOS_VEHICULO = ["ambulancia", "camioneta", "furgon", "camion_3_4"];
const esVehiculo = (e) => TIPOS_VEHICULO.includes(e?.tipo);

export function nombres(lista, rotulo, max = 3) {
  const vistos = lista.slice(0, max).map(rotulo).filter(Boolean);
  const resto = lista.length - vistos.length;
  return vistos.join(", ") + (resto > 0 ? ` y ${resto} más` : "");
}
const rotuloEquipo = (e) => [`${e?.marca || ""} ${e?.modelo || ""}`.trim(), e?.patente || e?.centro_principal]
  .filter(Boolean).join(" · ");
const rotuloOT = (o) => o.equipo_label || [o.marca_modelo, o.patente].filter(Boolean).join(" · ") || o.numero_ot;

/** El estado del área sale de lo más grave que tenga en "atención". */
function estadoDe(atencion, frasesBien) {
  const rojo = atencion.find(a => a.tono === "rojo");
  const ambar = atencion.find(a => a.tono === "ambar");
  if (rojo) return { tono: "rojo", palabra: "Crítico", frase: rojo.titulo };
  if (ambar) return { tono: "ambar", palabra: "Atención", frase: ambar.titulo };
  return { tono: "verde", palabra: "Bien", frase: frasesBien };
}

// ── Calidad: el equipamiento médico ──────────────────────────────────────
export function areaCalidad({ equipos = [], parches = [], alertas = [], inspecciones = [], hoy }) {
  const dia = hoy || aISO(new Date());
  // Los vehículos, ambulancias incluidas, se miran en Movilización.
  const medicos = equipos.filter(e => !esVehiculo(e) && e.activo !== false);
  const porId = new Map(equipos.map(e => [e.id, e]));
  const operativos = medicos.filter(e => e.estado === "operativo");
  const fuera = medicos.filter(e => e.estado === "fuera_de_servicio");
  const enMantencion = medicos.filter(e => e.estado === "mantenimiento");

  const vigentes = parches.filter(p => p.activo !== false && p.fecha_vencimiento);
  const vencidos = vigentes.filter(p => p.fecha_vencimiento < dia);
  const porVencer = vigentes.filter(p => p.fecha_vencimiento >= dia && p.fecha_vencimiento <= sumar(dia, 30));
  const bateriasVencidas = medicos.filter(e => e.fecha_vencimiento_bateria && e.fecha_vencimiento_bateria < dia);
  const criticas = alertas.filter(a => a.nivel === "critica");
  const equiposDe = (ps) => [...new Map(ps.map(p => [p.equipo_id, porId.get(p.equipo_id)])).values()].filter(Boolean);

  const atencion = [];
  if (fuera.length) atencion.push({ tono: "rojo", titulo: `${plural(fuera.length, "equipo fuera de servicio", "equipos fuera de servicio")}`, detalle: nombres(fuera, rotuloEquipo) });
  if (vencidos.length) atencion.push({ tono: "rojo", titulo: `${plural(vencidos.length, "parche vencido", "parches vencidos")}`, detalle: `En ${nombres(equiposDe(vencidos), rotuloEquipo) || "equipos sin ficha"}.` });
  if (bateriasVencidas.length) atencion.push({ tono: "rojo", titulo: `${plural(bateriasVencidas.length, "batería vencida", "baterías vencidas")}`, detalle: nombres(bateriasVencidas, rotuloEquipo) });
  if (criticas.length) atencion.push({ tono: "rojo", titulo: `${plural(criticas.length, "alerta crítica", "alertas críticas")}`, detalle: nombres(criticas, a => a.mensaje || a.tipo) });
  if (porVencer.length) atencion.push({ tono: "ambar", titulo: `${plural(porVencer.length, "parche vence", "parches vencen")} en los próximos 30 días`, detalle: `En ${nombres(equiposDe(porVencer), rotuloEquipo) || "equipos sin ficha"}.` });
  if (inspecciones.length) atencion.push({ tono: "ambar", titulo: `${plural(inspecciones.length, "bitácora espera", "bitácoras esperan")} revisión de Salud`, detalle: "Pautas de inspección enviadas desde el enlace público." });
  if (enMantencion.length) atencion.push({ tono: "gris", titulo: `${plural(enMantencion.length, "equipo en mantención", "equipos en mantención")}`, detalle: nombres(enMantencion, rotuloEquipo) });

  const pct = medicos.length ? Math.round((operativos.length / medicos.length) * 100) : null;
  return {
    clave: "calidad",
    estado: estadoDe(atencion, "Todos los equipos operativos y al día."),
    atencion,
    indicadores: [
      { valor: pct === null ? "—" : `${pct}%`, etiqueta: "equipos operativos", contexto: `${operativos.length} de ${medicos.length}` },
      { valor: fuera.length, etiqueta: "fuera de servicio", malo: fuera.length > 0 },
      { valor: vencidos.length, etiqueta: "parches vencidos", contexto: porVencer.length ? `${porVencer.length} por vencer` : "", malo: vencidos.length > 0 },
      { valor: inspecciones.length, etiqueta: "bitácoras por revisar" },
    ],
  };
}

// ── Gestión: lo que va entre personas y áreas ────────────────────────────
export function areaGestion({ solicitudes = [], comprasTaller = [], comprasSalud = [], ordenes = [], hoy, ahora = new Date() }) {
  const dia = hoy || aISO(new Date());
  const hace = (f) => (f ? diasEntre(f, dia) : 0);
  const fechaAprob = (s) => s.fecha_aprobacion || s.updated_date || s.created_date;

  const pendientesSalud = solicitudes.filter(s => (s.estado || "pendiente") === "pendiente");
  const viejas = pendientesSalud.filter(s => hace(s.created_date || s.fecha) > 7);
  const porComprar = [...comprasTaller, ...comprasSalud].filter(s => s.estado === "aprobada");
  const comprasDemoradas = porComprar.filter(s => hace(fechaAprob(s)) > 7);
  const enCamino = [...comprasTaller, ...comprasSalud].filter(s => s.estado === "comprada");
  const sinLlegar = enCamino.filter(s => hace(s.fecha_compra || s.updated_date) > 14);
  const coord = resumenCoordinacion(ordenes, { ahora });

  const atencion = [];
  if (coord.atascados.length) {
    const a = coord.atascados[0];
    atencion.push({
      tono: "rojo",
      titulo: `${plural(coord.atascados.length, "pedido al taller detenido", "pedidos al taller detenidos")} hace 3 días o más`,
      detalle: coord.atascados.slice(0, 3).map(x => `${rotuloOT(x.ot)} (${x.dias} días, responde ${x.quien === "taller" ? "Taller" : "Movilización"})`).join(" · ")
        || rotuloOT(a.ot),
    });
  }
  if (comprasDemoradas.length) atencion.push({ tono: "rojo", titulo: `${plural(comprasDemoradas.length, "compra aprobada lleva", "compras aprobadas llevan")} más de 7 días sin hacerse`, detalle: nombres(comprasDemoradas, s => s.repuesto_nombre) });
  if (viejas.length) atencion.push({ tono: "ambar", titulo: `${plural(viejas.length, "solicitud de Salud lleva", "solicitudes de Salud llevan")} más de una semana sin respuesta`, detalle: "" });
  if (sinLlegar.length) atencion.push({ tono: "ambar", titulo: `${plural(sinLlegar.length, "compra no llega", "compras no llegan")} a bodega después de 14 días`, detalle: nombres(sinLlegar, s => s.repuesto_nombre) });
  if (porComprar.length && !comprasDemoradas.length) atencion.push({ tono: "gris", titulo: `${plural(porComprar.length, "compra aprobada", "compras aprobadas")} en curso`, detalle: nombres(porComprar, s => s.repuesto_nombre) });

  const dias = coord.diasRespuestaTaller;
  return {
    clave: "gestion",
    estado: estadoDe(atencion, "Solicitudes, compras y pedidos entre áreas avanzando a tiempo."),
    atencion,
    coordinacion: coord,
    indicadores: [
      { valor: pendientesSalud.length, etiqueta: "solicitudes de Salud pendientes", contexto: viejas.length ? `${viejas.length} de hace más de 7 días` : "" },
      { valor: porComprar.length, etiqueta: "compras por hacer", contexto: `${enCamino.length} en camino`, malo: comprasDemoradas.length > 0 },
      { valor: coord.porAgendar.length + coord.reagendar.length + coord.esperanMovilizacion.length, etiqueta: "pedidos al taller sin fecha acordada" },
      { valor: dias === null ? "—" : `${String(dias).replace(".", ",")} d`, etiqueta: "demora del taller en dar fecha" },
    ],
  };
}

// ── Movilización: la flota ───────────────────────────────────────────────
export function areaMovilizacion({ equipos = [], ordenes = [], asignaciones = [], prestamos = [], bitacora = [], choferes = [], estadoLicencia, hoy }) {
  const dia = hoy || aISO(new Date());
  const vehiculos = equipos.filter(e => esVehiculo(e) && e.activo !== false);
  const taller = periodosEnTaller(ordenes);
  const enTallerHoy = (id) => taller.some(t => t.equipo_id === id && rangosSeTocan(t.desde, t.hasta, dia, dia));
  const enTaller = vehiculos.filter(v => enTallerHoy(v.id));
  const conChofer = vehiculos.filter(v => !enTallerHoy(v.id) && asignacionDeHoy(asignaciones, v.id, dia));
  const sinChofer = vehiculos.filter(v => !enTallerHoy(v.id) && !asignacionDeHoy(asignaciones, v.id, dia));

  const lic = (c) => (estadoLicencia ? estadoLicencia(c.licencia_vencimiento).clave : "sin_datos");
  const vencidas = choferes.filter(c => lic(c) === "vencida");
  const porVencer = choferes.filter(c => lic(c) === "por_vencer");
  const conVehiculoHoy = new Set(asignaciones.filter(a => a.estado === "activa" && a.desde <= dia && (!a.hasta || a.hasta >= dia)).map(a => a.chofer_id));
  const manejandoVencida = vencidas.filter(c => conVehiculoHoy.has(c.id));
  const atrasados = prestamos.filter(p => p.hasta_previsto && p.hasta_previsto < dia);
  const abiertas = bitacora.filter(r => r.estado === "en_ruta" && r.fecha && r.fecha < dia);
  const mes = resumenBitacora(bitacora.filter(r => (r.fecha || "").startsWith(dia.slice(0, 7))));
  const nombreChofer = (c) => c.full_name || c.email;

  const atencion = [];
  if (manejandoVencida.length) atencion.push({ tono: "rojo", titulo: `${plural(manejandoVencida.length, "chofer maneja", "choferes manejan")} hoy con la licencia vencida`, detalle: nombres(manejandoVencida, nombreChofer) });
  if (atrasados.length) atencion.push({ tono: "rojo", titulo: `${plural(atrasados.length, "vehículo prestado no ha vuelto", "vehículos prestados no han vuelto")} a su centro`, detalle: nombres(atrasados, p => `${p.equipo_label || "vehículo"} en ${p.centro_destino}`) });
  if (vencidas.length > manejandoVencida.length) atencion.push({ tono: "ambar", titulo: `${plural(vencidas.length, "licencia vencida", "licencias vencidas")}`, detalle: nombres(vencidas, nombreChofer) });
  if (sinChofer.length) atencion.push({ tono: "ambar", titulo: `${plural(sinChofer.length, "vehículo sin chofer", "vehículos sin chofer")} hoy`, detalle: nombres(sinChofer, rotuloEquipo) });
  if (abiertas.length) atencion.push({ tono: "ambar", titulo: `${plural(abiertas.length, "salida de días anteriores", "salidas de días anteriores")} sin registrar el regreso`, detalle: nombres(abiertas, r => r.equipo_label) });
  if (porVencer.length) atencion.push({ tono: "gris", titulo: `${plural(porVencer.length, "licencia vence", "licencias vencen")} en los próximos 60 días`, detalle: nombres(porVencer, nombreChofer) });
  if (enTaller.length) atencion.push({ tono: "gris", titulo: `${plural(enTaller.length, "vehículo en el taller", "vehículos en el taller")} hoy`, detalle: nombres(enTaller, rotuloEquipo) });

  return {
    clave: "movilizacion",
    estado: estadoDe(atencion, "Todos los vehículos con chofer y los choferes con licencia al día."),
    atencion,
    taller,
    indicadores: [
      { valor: conChofer.length, etiqueta: "vehículos en servicio hoy", contexto: `de ${vehiculos.length}` },
      { valor: enTaller.length, etiqueta: "en el taller" },
      { valor: sinChofer.length, etiqueta: "sin chofer hoy", malo: sinChofer.length > 0 },
      { valor: mes.km.toLocaleString("es-CL"), etiqueta: "km recorridos este mes", contexto: `${mes.salidas} salidas` },
    ],
  };
}

// ── Taller mecánico ──────────────────────────────────────────────────────
export function areaTaller({ ordenes = [], repuestos = [], hoy }) {
  const dia = hoy || aISO(new Date());
  const abiertas = ordenes.filter(estaAbierta);
  const atrasadas = abiertas.filter(o => o.fecha_inicio && o.cita_entrega && o.cita_entrega < dia);
  const viejas = abiertas.filter(o => o.created_date && diasEntre(o.created_date, dia) > 15);
  const porCerrar = abiertas.filter(o => o.estado === "en_revision");
  const sinMecanico = abiertas.filter(o => o.estado === "pendiente" && !o.mecanico_email && !necesitaAgenda(o));
  const stockBajo = repuestos.filter(r => (r.stock_actual || 0) <= (r.stock_minimo || 0));

  const hace30 = sumar(dia, -30);
  const terminadas = ordenes.filter(o => o.estado === "completada" && o.fecha_fin && o.fecha_fin >= hace30);
  const duraciones = terminadas.filter(o => o.fecha_inicio).map(o => Math.max(0, diasEntre(o.fecha_inicio, o.fecha_fin)));
  const promedio = duraciones.length ? Math.round((duraciones.reduce((a, b) => a + b, 0) / duraciones.length) * 10) / 10 : null;
  const costoMes = ordenes.filter(o => o.estado === "completada" && (o.fecha_fin || "").startsWith(dia.slice(0, 7)))
    .reduce((s, o) => s + (Number(o.total) || 0), 0);

  const atencion = [];
  if (atrasadas.length) atencion.push({ tono: "rojo", titulo: `${plural(atrasadas.length, "reparación pasó", "reparaciones pasaron")} la fecha de entrega`, detalle: nombres(atrasadas, rotuloOT) });
  if (viejas.length) atencion.push({ tono: "ambar", titulo: `${plural(viejas.length, "orden lleva", "órdenes llevan")} más de 15 días abierta${viejas.length === 1 ? "" : "s"}`, detalle: nombres(viejas, rotuloOT) });
  if (sinMecanico.length) atencion.push({ tono: "ambar", titulo: `${plural(sinMecanico.length, "orden sin mecánico", "órdenes sin mecánico")}`, detalle: nombres(sinMecanico, rotuloOT) });
  if (stockBajo.length) atencion.push({ tono: "ambar", titulo: `${plural(stockBajo.length, "repuesto bajo", "repuestos bajo")} el stock mínimo`, detalle: nombres(stockBajo, r => r.nombre) });
  if (porCerrar.length) atencion.push({ tono: "gris", titulo: `${plural(porCerrar.length, "orden terminada espera", "órdenes terminadas esperan")} el cierre del Jefe de Taller`, detalle: nombres(porCerrar, rotuloOT) });

  return {
    clave: "taller",
    estado: estadoDe(atencion, "Órdenes al día y repuestos sobre el mínimo."),
    atencion,
    indicadores: [
      { valor: abiertas.length, etiqueta: "órdenes abiertas", contexto: `${terminadas.length} terminadas en 30 días` },
      { valor: atrasadas.length, etiqueta: "entregas atrasadas", malo: atrasadas.length > 0 },
      { valor: promedio === null ? "—" : `${String(promedio).replace(".", ",")} d`, etiqueta: "demora promedio de reparación", contexto: "últimos 30 días" },
      { valor: `$${costoMes.toLocaleString("es-CL")}`, etiqueta: "costo de reparaciones del mes" },
    ],
  };
}

export function _selfCheck() {
  const fallos = [];
  const debe = (c, q) => { if (!c) fallos.push(q); };
  const hoy = "2026-09-24";

  // Calidad
  const c = areaCalidad({
    hoy,
    equipos: [
      { id: "d1", tipo: "dea", marca: "Zoll", modelo: "AED", estado: "operativo" },
      { id: "d2", tipo: "dea", marca: "Philips", modelo: "HS1", estado: "fuera_de_servicio" },
      { id: "a1", tipo: "ambulancia", estado: "fuera_de_servicio" },
    ],
    parches: [{ equipo_id: "d1", fecha_vencimiento: "2026-10-10" }],
  });
  debe(c.estado.tono === "rojo" && /fuera de servicio/.test(c.estado.frase), "un equipo fuera de servicio pone Calidad en rojo");
  debe(c.indicadores[0].valor === "50%" && c.indicadores[0].contexto === "1 de 2", "la ambulancia no cuenta en Calidad");
  debe(c.atencion.some(a => /próximos 30 días/.test(a.titulo)), "avisa el parche por vencer");
  debe(areaCalidad({ hoy, equipos: [{ id: "x", tipo: "dea", estado: "operativo" }] }).estado.tono === "verde", "todo operativo es verde");

  // Gestión
  const g = areaGestion({
    hoy, ahora: new Date(`${hoy}T12:00:00Z`),
    solicitudes: [{ estado: "pendiente", created_date: "2026-09-10T10:00:00Z" }],
    comprasTaller: [{ estado: "aprobada", fecha_aprobacion: "2026-09-01", repuesto_nombre: "Filtro" }],
    comprasSalud: [{ estado: "comprada", fecha_compra: "2026-09-20" }],
    ordenes: [{ id: "o", origen: "movilizacion", estado: "pendiente", cita_estado: "por_agendar", created_date: "2026-09-15T12:00:00Z", equipo_label: "Canter" }],
  });
  debe(g.estado.tono === "rojo", "un pedido detenido o una compra demorada es rojo");
  debe(g.atencion[0].titulo.startsWith("1 pedido al taller detenido"), "lo más grave primero");
  debe(g.indicadores[1].valor === 1 && g.indicadores[1].contexto === "1 en camino", "compras por hacer y en camino");

  // Movilización
  const lic = (v) => ({ clave: !v ? "sin_datos" : v < hoy ? "vencida" : "vigente" });
  const m = areaMovilizacion({
    hoy, estadoLicencia: lic,
    equipos: [{ id: "v1", tipo: "camioneta", marca: "Toyota", modelo: "Hilux" }, { id: "v2", tipo: "ambulancia" }],
    asignaciones: [{ equipo_id: "v1", chofer_id: "c1", estado: "activa", desde: "2026-09-20", hasta: null }],
    choferes: [{ id: "c1", full_name: "Hugo", licencia_vencimiento: "2026-09-01" }],
    ordenes: [{ equipo_id: "v2", estado: "en_proceso", fecha_inicio: "2026-09-23" }],
  });
  debe(m.estado.tono === "rojo" && /licencia vencida/.test(m.estado.frase), "manejar con licencia vencida es lo primero");
  debe(m.indicadores[0].valor === 1 && m.indicadores[1].valor === 1 && m.indicadores[2].valor === 0,
    "uno en servicio, uno en el taller, ninguno sin chofer");

  // Taller
  const t = areaTaller({
    hoy,
    ordenes: [
      { estado: "en_proceso", fecha_inicio: "2026-09-20", cita_entrega: "2026-09-22", created_date: "2026-09-19", equipo_label: "Hilux" },
      { estado: "completada", fecha_inicio: "2026-09-10", fecha_fin: "2026-09-14", total: 100000 },
      { estado: "completada", fecha_inicio: "2026-09-01", fecha_fin: "2026-09-03", total: 50000 },
    ],
    repuestos: [{ nombre: "Filtro", stock_actual: 1, stock_minimo: 2 }],
  });
  debe(t.estado.tono === "rojo", "una entrega atrasada es rojo");
  debe(t.indicadores[2].valor === "3 d", `promedio de 4 y 2 días es 3, dio ${t.indicadores[2].valor}`);
  debe(t.indicadores[3].valor === "$150.000", `costo del mes, dio ${t.indicadores[3].valor}`);

  if (fallos.length) { console.error("FALLOS:\n  " + fallos.join("\n  ")); return false; }
  console.log("monitorResumen: autotest ok");
  return true;
}

if (typeof process !== "undefined" && process.argv?.[1]?.endsWith("monitorResumen.js")) _selfCheck();
