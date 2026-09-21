import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { CalendarDays, ChevronLeft, ChevronRight, RefreshCw, AlertTriangle, Wrench, ArrowLeftRight, UserCheck } from "lucide-react";
import usePullToRefresh from "@/hooks/usePullToRefresh";
import { useAuth } from "@/lib/AuthContext";
import { isSimulandoActivo } from "@/lib/roleSimulator";
import { esVehiculo } from "@/lib/centros";
import AsignarChoferModal from "@/components/flota/AsignarChoferModal";
import {
  diasDelMes, esFinDeSemana, aISO, rangosSeTocan,
  periodosEnTaller, choquesConTaller,
} from "@/lib/calendarioFlota";

// El calendario de programación de la flota.
//
// Una fila por vehículo, una columna por día. Tres cosas se dibujan encima:
// quién lo tiene asignado, si está prestado a otro centro, y si está en el
// taller. Es la vista que permite ver de un golpe qué vehículo está libre.
//
// El taller se muestra y se avisa, pero NO impide programar. Un vehículo
// puede entrar al taller después de que alguien ya tenía su semana agendada,
// y cancelarle el turno solo sería peor que avisarle: el Encargado decide.
//
// Las reglas de choque viven en src/lib/calendarioFlota.js, con su autotest.

const MESES = ["enero","febrero","marzo","abril","mayo","junio",
               "julio","agosto","septiembre","octubre","noviembre","diciembre"];

const COLOR_TURNO = {
  completo: { fondo: "#bbf7d0", borde: "#16a34a", texto: "#14532d" },
  manana:   { fondo: "#bfdbfe", borde: "#2563eb", texto: "#1e3a8a" },
  tarde:    { fondo: "#ddd6fe", borde: "#7c3aed", texto: "#4c1d95" },
};

export default function Calendario() {
  const { user } = useAuth();
  const hoy = aISO(new Date());
  const [cursor, setCursor] = useState(() => { const d = new Date(); return { anio: d.getFullYear(), mes: d.getMonth() }; });
  const [equipos, setEquipos] = useState([]);
  const [asignaciones, setAsignaciones] = useState([]);
  const [prestamos, setPrestamos] = useState([]);
  const [ordenes, setOrdenes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [asignando, setAsignando] = useState(null);
  const containerRef = useRef(null);

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

  const dias = useMemo(() => diasDelMes(cursor.anio, cursor.mes), [cursor]);
  const primero = dias[0];
  const ultimo = dias[dias.length - 1];

  const taller = useMemo(() => periodosEnTaller(ordenes), [ordenes]);
  const activas = useMemo(() => asignaciones.filter(a => a.estado === "activa"), [asignaciones]);
  const choques = useMemo(() => choquesConTaller(activas, taller), [activas, taller]);
  const idsEnChoque = useMemo(() => new Set(choques.map(c => c.asignacion.id)), [choques]);

  /** Lo que le pasa a un vehículo un día: asignación, préstamo, taller. */
  const delDia = (equipoId, dia) => ({
    asignaciones: activas.filter(a => a.equipo_id === equipoId && rangosSeTocan(a.desde, a.hasta, dia, dia)),
    prestamo: prestamos.find(p => p.equipo_id === equipoId && rangosSeTocan(p.desde, p.hasta_previsto, dia, dia)) || null,
    taller: taller.find(t => t.equipo_id === equipoId && rangosSeTocan(t.desde, t.hasta, dia, dia)) || null,
  });

  const mover = (n) => setCursor(c => {
    const d = new Date(c.anio, c.mes + n, 1);
    return { anio: d.getFullYear(), mes: d.getMonth() };
  });

  const abrirAsignacion = (equipo, dia) => {
    if (soloLectura) return;
    setAsignando({
      equipo,
      desdeSugerido: dia,
      prestamo: prestamos.find(p => p.equipo_id === equipo.id) || null,
    });
  };

  // Lo que hay que mirar de este mes: choques con taller dentro del rango.
  const choquesDelMes = choques.filter(c =>
    rangosSeTocan(c.asignacion.desde, c.asignacion.hasta, primero, ultimo));

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
          <div className="flex items-center gap-2">
            <button onClick={() => mover(-1)} aria-label="Mes anterior"
              className="w-9 h-9 rounded-xl flex items-center justify-center text-white"
              style={{ background: "rgba(255,255,255,0.2)" }}>
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="text-white font-semibold capitalize min-w-[9.5rem] text-center">
              {MESES[cursor.mes]} {cursor.anio}
            </span>
            <button onClick={() => mover(1)} aria-label="Mes siguiente"
              className="w-9 h-9 rounded-xl flex items-center justify-center text-white"
              style={{ background: "rgba(255,255,255,0.2)" }}>
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      <div className="px-4 lg:px-10 pt-5 pb-10">
        {choquesDelMes.length > 0 && (
          <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 mb-5">
            <AlertTriangle className="w-5 h-5 text-red-700 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm text-red-900">
                <strong>{choquesDelMes.length}</strong>{" "}
                {choquesDelMes.length === 1 ? "programación cae" : "programaciones caen"} sobre un paso por el taller.
              </p>
              <ul className="text-xs text-red-700 mt-1 space-y-0.5">
                {choquesDelMes.slice(0, 5).map((c, i) => (
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
          <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
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
                        className={`border-b border-slate-200 px-0 py-2 text-[10px] font-semibold w-7
                                    ${esHoy ? "text-amber-800" : finde ? "text-slate-300" : "text-slate-500"}`}
                        style={esHoy ? { background: "#fffbeb" } : finde ? { background: "#fafafa" } : {}}>
                        {nro}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {equipos.map(eq => (
                  <tr key={eq.id}>
                    <td className="sticky left-0 z-10 bg-white border-b border-r border-slate-200 px-3 py-2">
                      <p className="text-xs font-bold text-slate-800 leading-tight">
                        {eq.marca} {eq.modelo}
                      </p>
                      <p className="text-[10px] text-slate-400">{eq.patente || eq.numero_inventario || "—"}</p>
                    </td>
                    {dias.map(d => {
                      const { asignaciones: asigs, prestamo, taller: enTaller } = delDia(eq.id, d);
                      const finde = esFinDeSemana(d);
                      const conChoque = asigs.some(a => idsEnChoque.has(a.id));
                      const titulo = [
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

                      return (
                        <td key={d} title={titulo}
                          onClick={() => abrirAsignacion(eq, d)}
                          className={`border-b border-slate-100 h-9 w-7 p-0 ${soloLectura ? "" : "cursor-pointer"}`}
                          style={{ background: fondo,
                                   boxShadow: borde ? `inset 0 -2px 0 ${borde}` : undefined }}>
                          <span className="flex items-center justify-center h-full">
                            {conChoque && <AlertTriangle className="w-3 h-3 text-red-700" />}
                            {!conChoque && prestamo && asigs.length > 0 &&
                              <ArrowLeftRight className="w-2.5 h-2.5 text-orange-700" />}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!soloLectura && equipos.length > 0 && (
          <p className="text-xs text-slate-400 mt-3">
            Haz clic en un día para programar a alguien desde esa fecha.
          </p>
        )}
      </div>

      {asignando && (
        <AsignarChoferModal
          equipo={asignando.equipo}
          asignacionActual={null}
          prestamoVigente={asignando.prestamo}
          desdeSugerido={asignando.desdeSugerido}
          onClose={() => setAsignando(null)}
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
