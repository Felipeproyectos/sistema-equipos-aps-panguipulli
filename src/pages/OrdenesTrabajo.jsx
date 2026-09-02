import { useState, useEffect, useCallback, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import {
  Wrench, ClipboardList, CheckCircle2, Activity, RefreshCw,
} from "lucide-react";
import usePullToRefresh from "@/hooks/usePullToRefresh";
import OrdenTrabajoCard from "@/components/taller/OrdenTrabajoCard";
import { useAuth } from "@/lib/AuthContext";

const FILTROS = [
  { value: "asignada", label: "Asignadas" },
  { value: "en_proceso", label: "En Proceso" },
  { value: "pausada", label: "Pausadas" },
  { value: "en_revision", label: "En Revisión" },
  { value: "completada", label: "Completadas" },
  { value: "todas", label: "Todas" },
];

export default function OrdenesTrabajo() {
  const { user } = useAuth();
  const [ordenes, setOrdenes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState("asignada");
  const containerRef = useRef(null);
  const navigate = useNavigate();

  const fetchData = useCallback(async () => {
    const ots = await base44.entities.OrdenTrabajo.list("-created_date", 100).catch(() => []);
    setOrdenes(ots);
  }, []);

  useEffect(() => { fetchData().finally(() => setLoading(false)); }, [fetchData]);
  const { refreshing } = usePullToRefresh(fetchData, containerRef);

  const mias = ordenes.filter(o => o.mecanico_email && o.mecanico_email === user?.email);
  const filtradas = filtro === "todas" ? mias : mias.filter(o => o.estado === filtro);
  const asignadas = mias.filter(o => o.estado === "asignada").length;
  const enProceso = mias.filter(o => o.estado === "en_proceso").length;
  const pausadas = mias.filter(o => o.estado === "pausada").length;
  const completadas = mias.filter(o => o.estado === "completada").length;

  const irDetalle = (ot) => navigate(`/OrdenTrabajoDetalle/${ot.id}`);

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div ref={containerRef} className="min-h-screen bg-slate-50" style={{ overscrollBehavior: "none" }}>
      {refreshing && (
        <div className="flex items-center justify-center py-3 lg:hidden">
          <RefreshCw className="w-5 h-5 text-blue-500 animate-spin" />
        </div>
      )}

      {/* Header */}
      <div className="relative overflow-hidden px-4 lg:px-10 pt-6 lg:pt-12 pb-6 lg:pb-8"
        style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e293b 40%, #334155 100%)" }}>
        <div className="relative max-w-6xl mx-auto flex items-center gap-3">
          <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(255,255,255,0.15)" }}>
            <ClipboardList className="w-5 h-5 lg:w-6 lg:h-6 text-white" />
          </div>
          <div>
            <p className="text-amber-300 text-[10px] lg:text-xs font-semibold uppercase tracking-widest hidden sm:block">Módulo de Taller Mecánico</p>
            <h1 className="text-xl lg:text-4xl font-bold text-white leading-tight">Órdenes de Trabajo</h1>
            <p className="text-slate-300 text-xs lg:text-sm mt-0.5">Órdenes asignadas por el Jefe de Taller</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="max-w-6xl mx-auto px-4 lg:px-10 mt-4 lg:mt-6 mb-4 lg:mb-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
          {[
            { label: "Asignadas", value: asignadas, icon: Wrench, color: "#2563EB", bg: "#EFF6FF" },
            { label: "En Proceso", value: enProceso, icon: Activity, color: "#7C3AED", bg: "#F5F3FF" },
            { label: "Pausadas", value: pausadas, icon: ClipboardList, color: "#64748B", bg: "#F1F5F9" },
            { label: "Completadas", value: completadas, icon: CheckCircle2, color: "#16A34A", bg: "#F0FDF4" },
          ].map((s, i) => {
            const Icon = s.icon;
            return (
              <div key={i} className="bg-white rounded-2xl p-4 lg:p-5" style={{ boxShadow: "0 4px 20px rgba(15,45,107,0.08)" }}>
                <div className="flex items-center gap-3 lg:block">
                  <div className="w-9 h-9 lg:w-11 lg:h-11 rounded-xl flex items-center justify-center flex-shrink-0 lg:mb-3" style={{ background: s.bg }}>
                    <Icon className="w-4 h-4 lg:w-5 lg:h-5" style={{ color: s.color }} />
                  </div>
                  <div>
                    <p className="text-2xl lg:text-3xl font-bold" style={{ color: s.color }}>{s.value}</p>
                    <p className="text-xs text-slate-500 font-medium leading-tight">{s.label}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Filtros + Lista */}
      <div className="max-w-6xl mx-auto px-4 lg:px-10 pb-10 space-y-4">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {FILTROS.map(f => (
            <button key={f.value} onClick={() => setFiltro(f.value)}
              className="px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all"
              style={filtro === f.value
                ? { background: "#1E293B", color: "white" }
                : { background: "white", color: "#64748B", border: "1px solid #E2E8F0" }}>
              {f.label}
              {f.value !== "todas" && (
                <span className="ml-1.5 text-xs">({mias.filter(o => o.estado === f.value).length})</span>
              )}
            </button>
          ))}
        </div>

        {filtradas.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center" style={{ boxShadow: "0 4px 20px rgba(15,45,107,0.06)" }}>
            <Wrench className="w-12 h-12 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-400 text-sm">No hay órdenes {filtro !== "todas" ? `"${FILTROS.find(f => f.value === filtro)?.label.toLowerCase()}"` : ""}.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtradas.map(ot => (
              <OrdenTrabajoCard key={ot.id} ot={ot} onActualizar={fetchData} onEditar={irDetalle} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}