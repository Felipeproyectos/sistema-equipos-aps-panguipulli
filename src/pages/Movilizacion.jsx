import { useState, useEffect, useCallback, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Route, Wrench, RefreshCw, Clock, CheckCircle2, AlertTriangle, ChevronRight } from "lucide-react";
import usePullToRefresh from "@/hooks/usePullToRefresh";
import OrdenTrabajoFormModal from "@/components/taller/OrdenTrabajoFormModal";
import { useAuth } from "@/lib/AuthContext";
import { esVehiculo } from "@/lib/centros";
import { isSimulandoActivo } from "@/lib/roleSimulator";

// La bandeja del Encargado de Movilización.
//
// Por qué existe
// --------------
// Calidad ya podía pedir mantenimiento de un vehículo: `solicitud` tiene los
// tipos mantenimiento_correctivo, mantenimiento_preventivo y revision_tecnica,
// y el Encargado de Salud los ve en su pantalla. Lo que no existía era alguien
// del otro lado: esas solicitudes quedaban en una lista pasando de pendiente a
// finalizada a mano, sin que el Taller se enterara nunca.
//
// Acá llegan. El Encargado las evalúa y decide cuáles se convierten en orden
// de trabajo. La orden queda enlazada a la solicitud que la originó, para que
// Calidad pueda ver en qué terminó lo que pidió.

// Lo que le toca a Movilización: todo lo que sea de un vehículo, más los tres
// tipos de mantenimiento aunque la solicitud no apunte a un equipo cargado
// (una camioneta municipal puede no estar en el inventario).
const TIPOS_DE_FLOTA = ["mantenimiento_correctivo", "mantenimiento_preventivo", "revision_tecnica"];

const ETIQUETA_TIPO = {
  mantenimiento_correctivo: "Reparación",
  mantenimiento_preventivo: "Mantenimiento preventivo",
  revision_tecnica: "Revisión técnica",
  compra_repuestos: "Compra de repuestos",
  cambio_parches: "Cambio de parches",
  otros: "Otros",
};

const PESTANAS = [
  { value: "pendiente",  label: "Por revisar", icon: AlertTriangle },
  { value: "en_proceso", label: "En taller",   icon: Wrench },
  { value: "finalizada", label: "Cerradas",    icon: CheckCircle2 },
];

const COLOR_OT = {
  pendiente:   { texto: "#b45309", fondo: "#fffbeb", borde: "#fcd34d" },
  asignada:    { texto: "#1d4ed8", fondo: "#eff6ff", borde: "#93c5fd" },
  en_proceso:  { texto: "#1d4ed8", fondo: "#eff6ff", borde: "#93c5fd" },
  pausada:     { texto: "#b45309", fondo: "#fffbeb", borde: "#fcd34d" },
  en_revision: { texto: "#6d28d9", fondo: "#f5f3ff", borde: "#c4b5fd" },
  completada:  { texto: "#15803d", fondo: "#f0fdf4", borde: "#86efac" },
  cancelada:   { texto: "#64748b", fondo: "#f8fafc", borde: "#cbd5e1" },
};

function cuando(fecha) {
  if (!fecha) return "";
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return "";
  const dias = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (dias <= 0) return "hoy";
  if (dias === 1) return "ayer";
  if (dias < 31) return `hace ${dias} días`;
  return d.toLocaleDateString("es-CL");
}

export default function Movilizacion() {
  const { user } = useAuth();
  const [solicitudes, setSolicitudes] = useState([]);
  const [ordenes, setOrdenes] = useState([]);
  const [equipos, setEquipos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pestana, setPestana] = useState("pendiente");
  const [derivando, setDerivando] = useState(null);
  const [cerrando, setCerrando] = useState(null);
  const containerRef = useRef(null);

  const soloLectura = isSimulandoActivo();

  const cargar = useCallback(async () => {
    const [sols, ots, eqs] = await Promise.all([
      base44.entities.Solicitud.list("-created_date", 500).catch(() => []),
      base44.entities.OrdenTrabajo.list("-created_date", 500).catch(() => []),
      base44.entities.Equipo.list("-updated_date", 500).catch(() => []),
    ]);
    setSolicitudes(sols);
    setOrdenes(ots);
    setEquipos(eqs);
  }, []);

  useEffect(() => { cargar().finally(() => setLoading(false)); }, [cargar]);
  const { refreshing } = usePullToRefresh(cargar, containerRef);

  const equipoDe = (s) => equipos.find(e => e.id === s.equipo_id);
  const ordenDe = (s) => ordenes.find(o => o.solicitud_id === s.id);

  // De Movilización si el equipo es un vehículo, o si el tipo es de flota.
  const mias = solicitudes.filter(s => {
    const eq = equipoDe(s);
    if (eq) return esVehiculo(eq.tipo);
    return TIPOS_DE_FLOTA.includes(s.tipo);
  });

  const visibles = mias.filter(s => (s.estado || "pendiente") === pestana);
  const cuenta = (estado) => mias.filter(s => (s.estado || "pendiente") === estado).length;

  // Deriva al taller: abre el formulario de orden de trabajo con el vehículo y
  // el problema ya puestos, y el vínculo a esta solicitud.
  const abrirDerivacion = (s) => {
    const eq = equipoDe(s);
    setDerivando({
      solicitud: s,
      semilla: {
        solicitud_id: s.id,
        origen: "movilizacion",
        equipo_id: eq?.id || "",
        equipo_label: eq ? `${eq.marca} ${eq.modelo}${eq.patente ? ` · ${eq.patente}` : ""}` : "",
        patente: eq?.patente || "",
        marca_modelo: eq ? `${eq.marca} ${eq.modelo}` : "",
        tipo_activo: eq?.tipo === "ambulancia" ? "salud" : "corporativo",
        problema_reportado: [ETIQUETA_TIPO[s.tipo] || s.tipo, s.observaciones]
          .filter(Boolean).join(" — "),
        prioridad: s.tipo === "mantenimiento_correctivo" ? "alta" : "media",
      },
    });
  };

  // La orden quedó creada: la solicitud pasa a "en taller".
  const alDerivar = async () => {
    const s = derivando?.solicitud;
    setDerivando(null);
    if (s && (s.estado || "pendiente") === "pendiente") {
      await base44.entities.Solicitud.update(s.id, {
        estado: "en_proceso",
        respuesta_admin: [s.respuesta_admin, `Derivada al taller por ${user?.full_name || user?.email}`]
          .filter(Boolean).join("\n"),
      }).catch(() => {});
    }
    await cargar();
  };

  const cerrar = async (s) => {
    setCerrando(s.id);
    try {
      await base44.entities.Solicitud.update(s.id, { estado: "finalizada" });
      await cargar();
    } finally {
      setCerrando(null);
    }
  };

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

      <div className="relative overflow-hidden px-4 lg:px-10 pt-6 lg:pt-12 pb-6 lg:pb-8"
        style={{ background: "linear-gradient(135deg, #451a03 0%, #92400e 45%, #d97706 100%)" }}>
        <div className="relative max-w-5xl mx-auto flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
            style={{ background: "rgba(255,255,255,0.2)" }}>
            <Route className="w-6 h-6 text-white" />
          </div>
          <div>
            <p className="text-amber-200 text-xs font-semibold uppercase tracking-widest">Flota</p>
            <h1 className="text-2xl lg:text-3xl font-bold text-white">Movilización</h1>
            <p className="text-amber-100 text-sm mt-0.5">
              {cuenta("pendiente")} por revisar · {cuenta("en_proceso")} en taller
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 lg:px-10 pt-5 pb-10">
        <div className="flex gap-2 mb-5 overflow-x-auto">
          {PESTANAS.map(p => {
            const Icono = p.icon;
            const activa = pestana === p.value;
            return (
              <button key={p.value} onClick={() => setPestana(p.value)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap border transition-colors ${
                  activa ? "bg-amber-700 text-white border-amber-700" : "bg-white text-slate-600 border-slate-200 hover:border-amber-300"}`}>
                <Icono className="w-4 h-4" />
                {p.label}
                <span className={activa ? "text-amber-200" : "text-slate-400"}>{cuenta(p.value)}</span>
              </button>
            );
          })}
        </div>

        {visibles.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
            <Route className="w-12 h-12 mx-auto text-slate-200 mb-3" />
            <p className="text-slate-500 font-medium">
              {pestana === "pendiente"
                ? "No hay solicitudes esperando revisión."
                : pestana === "en_proceso"
                  ? "No hay nada en el taller ahora mismo."
                  : "Todavía no se cierra ninguna solicitud."}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {visibles.map(s => {
              const eq = equipoDe(s);
              const ot = ordenDe(s);
              const colorOT = ot ? (COLOR_OT[ot.estado] || COLOR_OT.pendiente) : null;
              return (
                <div key={s.id} className="bg-white rounded-2xl border border-slate-200 p-5">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="min-w-0">
                      <p className="font-bold text-slate-800">
                        {eq ? `${eq.marca} ${eq.modelo}` : "Vehículo sin ficha"}
                        {eq?.patente && <span className="text-slate-400 font-medium"> · {eq.patente}</span>}
                      </p>
                      <p className="text-sm text-slate-500 mt-0.5">
                        {ETIQUETA_TIPO[s.tipo] || s.tipo}
                        {s.centro && <> · {s.centro}</>}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-slate-400 flex items-center gap-1 justify-end">
                        <Clock className="w-3 h-3" /> {cuando(s.created_date || s.fecha)}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {s.usuario_nombre || s.usuario_email}
                      </p>
                    </div>
                  </div>

                  {s.observaciones && (
                    <p className="text-sm text-slate-600 mt-3 bg-slate-50 rounded-xl p-3 whitespace-pre-line">
                      {s.observaciones}
                    </p>
                  )}

                  {ot && (
                    <div className="flex items-center gap-2 mt-3 text-sm">
                      <Wrench className="w-4 h-4 text-slate-400" />
                      <span className="text-slate-600">{ot.numero_ot}</span>
                      <span className="px-2 py-0.5 rounded-lg text-xs font-semibold border"
                        style={{ color: colorOT.texto, background: colorOT.fondo, borderColor: colorOT.borde }}>
                        {ot.estado?.replace(/_/g, " ")}
                      </span>
                    </div>
                  )}

                  {!soloLectura && (s.estado || "pendiente") !== "finalizada" && (
                    <div className="flex gap-2 mt-4 flex-wrap">
                      {!ot && (
                        <button onClick={() => abrirDerivacion(s)}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-amber-700 hover:bg-amber-800">
                          <Wrench className="w-4 h-4" /> Derivar al taller
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      )}
                      <button onClick={() => cerrar(s)} disabled={cerrando === s.id}
                        className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 disabled:opacity-60">
                        {cerrando === s.id ? "Cerrando..." : "Cerrar sin taller"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <OrdenTrabajoFormModal
        open={!!derivando}
        onClose={() => setDerivando(null)}
        onGuardar={alDerivar}
        equipos={equipos}
        editando={null}
        semilla={derivando?.semilla}
        user={user}
      />
    </div>
  );
}
