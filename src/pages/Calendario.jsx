import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import {
  CalendarDays, ChevronLeft, ChevronRight, RefreshCw, AlertTriangle, Wrench,
  ArrowLeftRight, UserCheck, Printer,
} from "lucide-react";
import usePullToRefresh from "@/hooks/usePullToRefresh";
import { isSimulandoActivo } from "@/lib/roleSimulator";
import { esVehiculo } from "@/lib/centros";
import AsignarChoferModal from "@/components/flota/AsignarChoferModal";
import EditarAsignacionModal from "@/components/flota/EditarAsignacionModal";
import DiaFlotaModal from "@/components/flota/DiaFlotaModal";
import { generarProgramacionFlota } from "@/utils/generarProgramacionFlota";
import {
  diasDelMes, diasDeLaSemana, esFinDeSemana, aISO, sumarDias, rangoEntre,
  rangosSeTocan, periodosEnTaller, choquesConTaller, asignacionesDelDia, agruparEnFranjas,
} from "@/lib/calendarioFlota";
import AyudaPantalla from "@/components/flota/AyudaPantalla";

// El calendario de programación de la flota.
//
// Una fila por vehículo, una columna por día. Tres cosas se dibujan encima:
// quién lo tiene asignado, si está prestado a otro centro, y si está en el
// taller. Es la vista que permite ver de un golpe qué vehículo está libre.
//
// Cómo se programa: marcando los días
// ───────────────────────────────────
// Se arrastra sobre los días que se quieren cubrir y se suelta. Eso es lo que
// hace el Encargado con el dedo sobre la planilla de papel, y era lo que
// faltaba: antes un clic abría siempre "desde este día", sin fecha de
// término, y una asignación sin término bloquea programar cualquier cosa
// después en ese vehículo.
//
// Un día libre abre derecho el formulario; uno ocupado abre primero el
// detalle, porque ahí lo que se quiere casi siempre es mirar o corregir lo
// que ya hay, no agregarle algo encima.
//
// El taller se muestra y se avisa, pero NO impide programar. Un vehículo
// puede entrar al taller después de que alguien ya tenía su semana agendada,
// y cancelarle el turno solo sería peor que avisarle: el Encargado decide.
//
// Las reglas de choque viven en src/lib/calendarioFlota.js, con su autotest,
// y la de verdad en la base (migracion/17_calendario.sql).

const MESES = ["enero","febrero","marzo","abril","mayo","junio",
               "julio","agosto","septiembre","octubre","noviembre","diciembre"];
const DIAS_CORTOS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

const COLOR_TURNO = {
  completo: { fondo: "#bbf7d0", borde: "#16a34a", texto: "#14532d" },
  manana:   { fondo: "#bfdbfe", borde: "#2563eb", texto: "#1e3a8a" },
  tarde:    { fondo: "#ddd6fe", borde: "#7c3aed", texto: "#4c1d95" },
};

const ABREV_TURNO = { manana: "AM", tarde: "PM" };

/** "ALEJANDRO CARDENAS" -> "Alejandro C.": lo que cabe en una franja corta y
 *  todavía se reconoce. Respeta el nombre tal como está si es de una palabra. */
function nombreCorto(nombre) {
  // Sin etiquetas como "[PRUEBA]": ocupan el poco espacio que hay.
  const partes = String(nombre || "?").trim().split(/\s+/).filter(x => !/^\[.*\]$/.test(x));
  if (!partes.length) return "?";
  const cap = (x) => x.charAt(0).toUpperCase() + x.slice(1).toLowerCase();
  if (partes.length === 1) return cap(partes[0]);
  return `${cap(partes[0])} ${partes[1].charAt(0).toUpperCase()}.`;
}

export default function Calendario() {
  const hoy = aISO(new Date());
  const [vista, setVista] = useState("mes");
  // Una sola fecha ancla el período, sea mes o semana. Con dos estados
  // distintos, cambiar de vista perdía dónde estabas parado.
  const [ancla, setAncla] = useState(hoy);
  const [equipos, setEquipos] = useState([]);
  const [asignaciones, setAsignaciones] = useState([]);
  const [prestamos, setPrestamos] = useState([]);
  const [ordenes, setOrdenes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [asignando, setAsignando] = useState(null);
  const [detalle, setDetalle] = useState(null);
  const [editando, setEditando] = useState(null);
  const [arrastre, setArrastre] = useState(null);
  const containerRef = useRef(null);
  const arrastreRef = useRef(null);

  const soloLectura = isSimulandoActivo();

  const cargar = useCallback(async () => {
    const [eqs, asigs, pres, ots] = await Promise.all([
      base44.functions.invoke("getEquiposPorCentro")
        .then(r => (r.data?.equipos || []))
        .catch(() => base44.entities.Equipo.list("-updated_date", 500).catch(() => [])),
      base44.entities.AsignacionChofer.list("-desde", 1000).catch(() => []),
      base44.entities.PrestamoVehiculo.filter({ estado: "vigente" }, "-desde", 500).catch(() => []),
      base44.entities.OrdenTrabajo.list("-created_date", 500).catch(() => []),
    ]);
    setEquipos(eqs.filter(e => esVehiculo(e.tipo)));
    setAsignaciones(asigs);
    setPrestamos(pres);
    setOrdenes(ots);
  }, []);

  useEffect(() => { cargar().finally(() => setLoading(false)); }, [cargar]);
  const { refreshing } = usePullToRefresh(cargar, containerRef);

  const dias = useMemo(() => {
    const d = new Date(`${ancla}T12:00:00`);
    return vista === "mes" ? diasDelMes(d.getFullYear(), d.getMonth()) : diasDeLaSemana(ancla);
  }, [ancla, vista]);
  const primero = dias[0];
  const ultimo = dias[dias.length - 1];

  const taller = useMemo(() => periodosEnTaller(ordenes), [ordenes]);
  const activas = useMemo(() => asignaciones.filter(a => a.estado === "activa"), [asignaciones]);
  const choques = useMemo(() => choquesConTaller(activas, taller), [activas, taller]);
  const idsEnChoque = useMemo(() => new Set(choques.map(c => c.asignacion.id)), [choques]);

  /** Lo que le pasa a un vehículo en un tramo de días. Sirve igual para un día
   *  suelto (desde === hasta) que para lo que se marcó arrastrando. */
  const enTramo = useCallback((equipoId, desde, hasta) => ({
    asignaciones: activas.filter(a => a.equipo_id === equipoId && rangosSeTocan(a.desde, a.hasta, desde, hasta)),
    prestamo: prestamos.find(p => p.equipo_id === equipoId && rangosSeTocan(p.desde, p.hasta_previsto, desde, hasta)) || null,
    taller: taller.find(t => t.equipo_id === equipoId && rangosSeTocan(t.desde, t.hasta, desde, hasta)) || null,
  }), [activas, prestamos, taller]);

  const mover = (n) => setAncla(a => {
    if (vista === "semana") return sumarDias(a, 7 * n);
    const d = new Date(`${a}T12:00:00`);
    d.setDate(1);
    d.setMonth(d.getMonth() + n);
    return aISO(d);
  });

  /** Lo que se abre al soltar: el formulario si está libre, el detalle si hay
   *  algo que mirar primero. */
  const abrirTramo = useCallback((equipo, desde, hasta) => {
    if (soloLectura) return;
    const c = enTramo(equipo.id, desde, hasta);
    if (!c.asignaciones.length && !c.prestamo && !c.taller) {
      setAsignando({ equipo, desde, hasta, prestamo: null });
    } else {
      setDetalle({ equipo, desde, hasta, ...c });
    }
  }, [enTramo, soloLectura]);

  // El arrastre se cierra en `window` y no en la celda: si se suelta fuera de
  // la tabla, la selección tiene que terminar igual y no quedar pegada.
  useEffect(() => {
    const soltar = () => {
      const a = arrastreRef.current;
      arrastreRef.current = null;
      setArrastre(null);
      if (!a) return;
      const { desde, hasta } = rangoEntre(a.desde, a.hasta);
      abrirTramo(a.equipo, desde, hasta);
    };
    window.addEventListener("mouseup", soltar);
    return () => window.removeEventListener("mouseup", soltar);
  }, [abrirTramo]);

  const empezarArrastre = (equipo, dia) => {
    if (soloLectura) return;
    const a = { equipo, desde: dia, hasta: dia };
    arrastreRef.current = a;
    setArrastre(a);
  };

  const extenderArrastre = (equipo, dia) => {
    if (!arrastreRef.current || arrastreRef.current.equipo.id !== equipo.id) return;
    const a = { ...arrastreRef.current, hasta: dia };
    arrastreRef.current = a;
    setArrastre(a);
  };

  const marcado = (equipoId, dia) => {
    if (!arrastre || arrastre.equipo.id !== equipoId) return false;
    const { desde, hasta } = rangoEntre(arrastre.desde, arrastre.hasta);
    return dia >= desde && dia <= hasta;
  };

  const imprimir = () => generarProgramacionFlota({
    modo: vista === "semana" ? "semana" : "mes",
    dias, equipos, asignaciones, prestamos, taller,
  });

  // Lo que hay que mirar de este período: choques con taller dentro del rango.
  const choquesDelPeriodo = choques.filter(c =>
    rangosSeTocan(c.asignacion.desde, c.asignacion.hasta, primero, ultimo));

  // Se arma con la mayuscula puesta acá y no con `capitalize` en CSS, que
  // capitaliza CADA palabra y dejaba el titulo de la semana como
  // "21 Al 27 De Septiembre".
  const conMayuscula = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  const mesDe = (iso) => MESES[new Date(`${iso}T12:00:00`).getMonth()];
  const titulo = vista === "mes"
    ? conMayuscula(`${mesDe(ancla)} ${new Date(`${ancla}T12:00:00`).getFullYear()}`)
    : conMayuscula(`${Number(primero.slice(-2))} al ${Number(ultimo.slice(-2))} de ${mesDe(ultimo)}`);

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div ref={containerRef} className="min-h-screen bg-slate-50" style={{ overscrollBehavior: "none" }}>
      {refreshing && (
        <div className="flex items-center justify-center py-3 lg:hidden">
          <RefreshCw className="w-5 h-5 text-amber-500 animate-spin" />
        </div>
      )}

      <div className="relative overflow-hidden px-4 lg:px-10 pt-6 lg:pt-10 pb-6"
        style={{ background: "linear-gradient(135deg, #451a03 0%, #92400e 45%, #d97706 100%)" }}>
        <div className="relative max-w-full mx-auto flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
              style={{ background: "rgba(255,255,255,0.2)" }}>
              <CalendarDays className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-amber-200 text-xs font-semibold uppercase tracking-widest">Flota</p>
              <h1 className="text-2xl lg:text-3xl font-bold text-white">Calendario</h1>
              <p className="text-amber-100 text-sm mt-0.5">{equipos.length} vehículos</p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.3)" }}>
              {[["semana", "Semana"], ["mes", "Mes"]].map(([v, label]) => (
                <button key={v} onClick={() => setVista(v)}
                  className="px-3 py-2 text-xs font-semibold text-white"
                  style={{ background: vista === v ? "rgba(255,255,255,0.3)" : "transparent" }}>
                  {label}
                </button>
              ))}
            </div>

            <button onClick={() => setAncla(hoy)}
              className="px-3 py-2 rounded-xl text-xs font-semibold text-white"
              style={{ background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)" }}>
              Hoy
            </button>

            <button onClick={imprimir} disabled={equipos.length === 0}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-white disabled:opacity-50"
              style={{ background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)" }}>
              <Printer className="w-4 h-4" /> Imprimir
            </button>

            <div className="flex items-center gap-2">
              <button onClick={() => mover(-1)} aria-label={vista === "mes" ? "Mes anterior" : "Semana anterior"}
                className="w-9 h-9 rounded-xl flex items-center justify-center text-white"
                style={{ background: "rgba(255,255,255,0.2)" }}>
                <ChevronLeft className="w-5 h-5" />
              </button>
              <span id="periodo-calendario" className="text-white font-semibold min-w-[10.5rem] text-center">{titulo}</span>
              <button onClick={() => mover(1)} aria-label={vista === "mes" ? "Mes siguiente" : "Semana siguiente"}
                className="w-9 h-9 rounded-xl flex items-center justify-center text-white"
                style={{ background: "rgba(255,255,255,0.2)" }}>
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 lg:px-10 pt-5 pb-10">
        <AyudaPantalla clave="calendario">
          Quién maneja qué vehículo y cuándo. <strong>Arrastra sobre los días</strong> de un vehículo
          y suelta para programar a un chofer en esas fechas. Un día pintado se toca para
          cambiarlo o sacarlo. Con <strong>Imprimir</strong> sale la programación de la semana o del mes.
        </AyudaPantalla>
        {choquesDelPeriodo.length > 0 && (
          <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 mb-5">
            <AlertTriangle className="w-5 h-5 text-red-700 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm text-red-900">
                <strong>{choquesDelPeriodo.length}</strong>{" "}
                {choquesDelPeriodo.length === 1 ? "programación cae" : "programaciones caen"} sobre un paso por el taller.
              </p>
              <ul className="text-xs text-red-700 mt-1 space-y-0.5">
                {choquesDelPeriodo.slice(0, 5).map((c, i) => (
                  <li key={i}>
                    {c.asignacion.chofer_nombre} en {c.asignacion.equipo_label || "el vehículo"}
                    {" — "}choca con {c.taller.numero_ot}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-red-700 mt-1.5">
                No se canceló nada: decide tú si se cambia el vehículo o se corre la fecha.
              </p>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-4 mb-4 text-xs text-slate-500">
          <Leyenda color="#bbf7d0" borde="#16a34a" icono={UserCheck} texto="Con chofer" />
          <Leyenda color="#bfdbfe" borde="#2563eb" texto="Solo mañana" />
          <Leyenda color="#ddd6fe" borde="#7c3aed" texto="Solo tarde" />
          <Leyenda color="#fed7aa" borde="#ea580c" icono={ArrowLeftRight} texto="Prestado" />
          <Leyenda color="#fecaca" borde="#dc2626" icono={Wrench} texto="En taller" />
        </div>

        {equipos.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-14 text-center">
            <CalendarDays className="w-12 h-12 mx-auto text-slate-200 mb-3" />
            <p className="text-slate-500 font-medium">No hay vehículos para programar.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto select-none">
            <table className="border-collapse" style={{ minWidth: "100%" }}>
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-slate-50 border-b border-r border-slate-200
                                 px-3 py-2 text-left text-xs font-bold text-slate-600 min-w-[11rem]">
                    Vehículo
                  </th>
                  {dias.map(d => {
                    const nro = Number(d.slice(-2));
                    const finde = esFinDeSemana(d);
                    const esHoy = d === hoy;
                    return (
                      <th key={d}
                        className={`border-b border-slate-200 px-0 py-2 text-[10px] font-semibold
                                    ${vista === "semana" ? "min-w-[7.5rem]" : "w-7"}
                                    ${esHoy ? "text-amber-800" : finde ? "text-slate-300" : "text-slate-500"}`}
                        style={esHoy ? { background: "#fffbeb" } : finde ? { background: "#fafafa" } : {}}>
                        {vista === "semana" && (
                          <span className="block text-[9px] font-normal">
                            {DIAS_CORTOS[new Date(`${d}T12:00:00`).getDay()]}
                          </span>
                        )}
                        {nro}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {equipos.map(eq => {
                  // Lo de cada día se calcula una vez por fila: lo usan la
                  // celda, el rótulo de la franja y la columna del vehículo.
                  const info = dias.map(d => {
                    const asigs = asignacionesDelDia(activas, eq.id, d);
                    const prestamo = prestamos.find(p => p.equipo_id === eq.id
                      && rangosSeTocan(p.desde, p.hasta_previsto, d, d)) || null;
                    const enTaller = taller.find(t => t.equipo_id === eq.id
                      && rangosSeTocan(t.desde, t.hasta, d, d)) || null;
                    const conChoque = asigs.some(a => idsEnChoque.has(a.id));
                    return { d, asigs, prestamo, enTaller, conChoque };
                  });

                  // Qué se lee sobre la franja. La clave es lo que se LEE, no el
                  // id de la asignación: si el mismo chofer tiene esta semana y
                  // la siguiente, es una sola franja con su nombre, no dos.
                  const rotulo = ({ asigs, prestamo, enTaller, conChoque }) => {
                    if (enTaller) {
                      const n = enTaller.numero_ot || "En taller";
                      const t = enTaller.cita ? `Cita taller ${n}${enTaller.porConfirmar ? " (por confirmar)" : ""}` : n;
                      return { clave: `t:${t}`, texto: t, corto: enTaller.porConfirmar ? "Taller?" : "Taller", tipo: "taller" };
                    }
                    if (asigs.length) {
                      const turno = (a) => (ABREV_TURNO[a.turno] ? ` (${ABREV_TURNO[a.turno]})` : "");
                      const texto = asigs.map(a => `${a.chofer_nombre || "?"}${turno(a)}`).join(" / ")
                        + (prestamo ? ` · en ${prestamo.centro_destino}` : "");
                      const corto = asigs.map(a => nombreCorto(a.chofer_nombre)).join(" / ");
                      return { clave: `a:${texto}|${conChoque}`, texto, corto, tipo: "chofer", conChoque };
                    }
                    if (prestamo) {
                      return { clave: `p:${prestamo.id}`, texto: `Prestado · ${prestamo.centro_destino}`, corto: "Prestado", tipo: "prestamo" };
                    }
                    return null;
                  };
                  const rotulos = info.map(rotulo);
                  const franjas = vista === "mes" ? agruparEnFranjas(rotulos.map(r => r?.clave || null)) : [];
                  const franjaQueEmpieza = new Map(franjas.map(f => [f.inicio, f]));

                  // Quién lo tiene hoy, bajo el nombre del vehículo: responde
                  // la pregunta sin tener que buscar el día en la grilla.
                  const deHoy = rotulo({
                    asigs: asignacionesDelDia(activas, eq.id, hoy),
                    prestamo: null,
                    enTaller: taller.find(t => t.equipo_id === eq.id && rangosSeTocan(t.desde, t.hasta, hoy, hoy)) || null,
                    conChoque: false,
                  });

                  return (
                  <tr key={eq.id}>
                    <td className="sticky left-0 z-10 bg-white border-b border-r border-slate-200 px-3 py-2">
                      <p className="text-xs font-bold text-slate-800 leading-tight">
                        {eq.marca} {eq.modelo}
                      </p>
                      <p className="text-[10px] text-slate-400">{eq.patente || eq.numero_inventario || "—"}</p>
                      <p className={`text-[10px] font-semibold mt-0.5 truncate max-w-[10rem] ${
                        !deHoy ? "text-amber-700" : deHoy.tipo === "taller" ? "text-red-700" : "text-green-700"}`}>
                        {!deHoy ? "Hoy: sin chofer"
                          : deHoy.tipo === "taller" ? `Hoy: en taller`
                          : `Hoy: ${deHoy.texto}`}
                      </p>
                    </td>
                    {info.map(({ d, asigs, prestamo, enTaller, conChoque }, i) => {
                      const finde = esFinDeSemana(d);
                      const tooltip = [
                        ...asigs.map(a => `${a.chofer_nombre}${a.turno && a.turno !== "completo" ? ` (${a.turno})` : ""}`),
                        prestamo ? `Prestado a ${prestamo.centro_destino}` : "",
                        enTaller ? `En taller — ${enTaller.numero_ot}` : "",
                      ].filter(Boolean).join(" · ") || "Libre";

                      let fondo = finde ? "#fafafa" : "#fff";
                      let borde = "";
                      if (enTaller) { fondo = "#fecaca"; borde = "#dc2626"; }
                      else if (asigs.length) {
                        // Con dos medios dias el vehiculo esta tomado la jornada
                        // entera: pintar solo el color del primero diria "solo
                        // manana" cuando en realidad no queda hueco.
                        const turnos = new Set(asigs.map(a => a.turno || "completo"));
                        const clave = turnos.size > 1 ? "completo" : [...turnos][0];
                        const c = COLOR_TURNO[clave] || COLOR_TURNO.completo;
                        fondo = c.fondo; borde = c.borde;
                      } else if (prestamo) { fondo = "#fed7aa"; borde = "#ea580c"; }

                      const seleccionado = marcado(eq.id, d);
                      const franja = franjaQueEmpieza.get(i);
                      const r = franja ? rotulos[i] : null;

                      return (
                        <td key={d} title={tooltip}
                          onMouseDown={() => empezarArrastre(eq, d)}
                          onMouseEnter={() => extenderArrastre(eq, d)}
                          className={`border-b border-slate-100 p-0 align-top relative
                                      ${vista === "semana" ? "h-14 min-w-[7.5rem]" : "h-9 w-7"}
                                      ${soloLectura ? "" : "cursor-pointer"}`}
                          style={{
                            background: fondo,
                            boxShadow: [
                              borde ? `inset 0 -2px 0 ${borde}` : "",
                              seleccionado ? "inset 0 0 0 2px #b45309" : "",
                            ].filter(Boolean).join(", ") || undefined,
                          }}>
                          {vista === "semana" ? (
                            <div className="px-1.5 py-1 text-[10px] leading-tight text-slate-700 overflow-hidden h-full">
                              {enTaller ? (
                                <span className="font-semibold text-red-800 flex items-center gap-1">
                                  <Wrench className="w-3 h-3 shrink-0" />{enTaller.numero_ot || "Taller"}
                                </span>
                              ) : asigs.length ? (
                                asigs.map(a => (
                                  <span key={a.id} className="block truncate font-semibold">
                                    {conChoque && <AlertTriangle className="w-2.5 h-2.5 inline text-red-700 mr-0.5" />}
                                    {a.chofer_nombre || "?"}
                                    {ABREV_TURNO[a.turno] ? ` (${ABREV_TURNO[a.turno]})` : ""}
                                  </span>
                                ))
                              ) : prestamo ? (
                                <span className="text-orange-800 truncate block">
                                  <ArrowLeftRight className="w-2.5 h-2.5 inline mr-0.5" />
                                  {prestamo.centro_destino}
                                </span>
                              ) : null}
                              {asigs.length > 0 && prestamo && (
                                <span className="block truncate text-[9px] text-orange-800">
                                  en {prestamo.centro_destino}
                                </span>
                              )}
                            </div>
                          ) : r ? (
                            // El nombre va una sola vez, al empezar la franja, y
                            // se extiende sobre los días que abarca. No recibe
                            // clics: los días de abajo siguen respondiendo al
                            // arrastre y al toque como siempre.
                            <span
                              className={`absolute left-0 top-0 h-full z-[1] pointer-events-none flex items-center gap-1 px-1.5
                                          text-[10.5px] font-semibold whitespace-nowrap overflow-hidden ${
                                r.tipo === "taller" ? "text-red-800" : r.tipo === "prestamo" ? "text-orange-800" : "text-green-900"}`}
                              style={{ width: `${franja.largo * 100}%` }}>
                              {r.tipo === "taller" && <Wrench className="w-3 h-3 shrink-0" />}
                              {r.tipo === "prestamo" && <ArrowLeftRight className="w-3 h-3 shrink-0" />}
                              {r.conChoque && <AlertTriangle className="w-3 h-3 shrink-0 text-red-700" />}
                              {/* En pocos días no cabe el nombre entero: "Alejandro C."
                                  se reconoce, "Alejandro Cárd…" no. */}
                              <span className="truncate">{franja.largo >= 4 ? r.texto : r.corto}</span>
                            </span>
                          ) : null}
                        </td>
                      );
                    })}
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!soloLectura && equipos.length > 0 && (
          <p className="text-xs text-slate-400 mt-3">
            Arrastra sobre los días que quieres cubrir y suelta: se programa con
            fecha de inicio y de término. Un día ocupado abre lo que ya hay, para
            cambiarlo.
          </p>
        )}
      </div>

      {detalle && (
        <DiaFlotaModal
          equipo={detalle.equipo}
          desde={detalle.desde}
          hasta={detalle.hasta}
          asignaciones={detalle.asignaciones}
          prestamo={detalle.prestamo}
          taller={detalle.taller}
          soloLectura={soloLectura}
          onEditar={(a) => { setDetalle(null); setEditando(a); }}
          onAsignar={(desde, hasta) => {
            setDetalle(null);
            setAsignando({ equipo: detalle.equipo, desde, hasta, prestamo: detalle.prestamo });
          }}
          onClose={() => setDetalle(null)}
        />
      )}

      {asignando && (
        <AsignarChoferModal
          equipo={asignando.equipo}
          asignacionActual={null}
          prestamoVigente={asignando.prestamo}
          desdeSugerido={asignando.desde}
          hastaSugerido={asignando.hasta}
          onClose={() => setAsignando(null)}
          onGuardado={cargar}
        />
      )}

      {editando && (
        <EditarAsignacionModal
          asignacion={editando}
          onClose={() => setEditando(null)}
          onGuardado={cargar}
        />
      )}
    </div>
  );
}

function Leyenda({ color, borde, icono: Icono, texto }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="w-4 h-4 rounded" style={{ background: color, boxShadow: `inset 0 -2px 0 ${borde}` }} />
      {Icono && <Icono className="w-3 h-3 text-slate-400" />}
      {texto}
    </span>
  );
}
