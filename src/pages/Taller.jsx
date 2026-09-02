import { useState, useEffect, useCallback, useRef } from "react";
import { base44 } from "@/api/base44Client";
import {
  Wrench, ClipboardList, CheckCircle2, AlertTriangle,
  Package, Plus, RefreshCw, TrendingUp, Activity,
  ChevronRight, Building2
} from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import usePullToRefresh from "@/hooks/usePullToRefresh";
import OrdenTrabajoCard from "@/components/taller/OrdenTrabajoCard";
import OrdenTrabajoFormModal from "@/components/taller/OrdenTrabajoFormModal";
import SolicitudRepuestoModule from "@/components/taller/SolicitudRepuestoModule";
import HistorialSolicitudesModal from "@/components/taller/HistorialSolicitudesModal";
import { useAuth } from "@/lib/AuthContext";
import { getEffectiveNavRole, isSimulandoActivo } from "@/lib/roleSimulator";

const FILTROS = [
  { value: "pendiente", label: "Pendientes" },
  { value: "asignada", label: "Asignadas" },
  { value: "en_proceso", label: "En Proceso" },
  { value: "en_revision", label: "En Revisión" },
  { value: "completada", label: "Completadas" },
  { value: "todas", label: "Todas" },
];

export default function Taller() {
  const { user } = useAuth();
  const [ordenes, setOrdenes] = useState([]);
  const [repuestos, setRepuestos] = useState([]);
  const [equipos, setEquipos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState("pendiente");
  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState(null);
  const [solicitudesOpen, setSolicitudesOpen] = useState(false);
  const containerRef = useRef(null);

  const fetchData = useCallback(async () => {
    const [ots, reps, eqs] = await Promise.all([
      base44.entities.OrdenTrabajo.list("-created_date", 100).catch(() => []),
      base44.entities.Repuesto.list("-created_date", 200).catch(() => []),
      base44.entities.Equipo.list("-created_date", 500).catch(() => []),
    ]);
    setOrdenes(ots);
    setRepuestos(reps);
    setEquipos(eqs.filter(e => e.tipo === "ambulancia"));
  }, []);

  useEffect(() => {
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  const { refreshing } = usePullToRefresh(fetchData, containerRef);

  // Solo el Jefe de Taller (o super_admin) puede cerrar una OT (marcarla como completada)
  const esJefe = !isSimulandoActivo() && ["super_admin", "jefe_taller"].includes(getEffectiveNavRole(user?.role));
  const stockBajo = repuestos.filter(r => (r.stock_actual || 0) <= (r.stock_minimo || 0));
  const filtradas = filtro === "todas" ? ordenes : ordenes.filter(o => o.estado === filtro);
  const pendientes = ordenes.filter(o => o.estado === "pendiente").length;
  const enProceso = ordenes.filter(o => o.estado === "en_proceso" || o.estado === "asignada").length;
  const completadas = ordenes.filter(o => o.estado === "completada").length;

  const handleEditar = (ot) => {
    setEditando(ot);
    setModalOpen(true);
  };

  const handleGuardar = () => {
    setEditando(null);
    setModalOpen(false);
    fetchData();
  };

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
        <div className="relative max-w-6xl mx-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(255,255,255,0.15)" }}>
                <Wrench className="w-5 h-5 lg:w-6 lg:h-6 text-white" />
              </div>
              <div>
                <p className="text-amber-300 text-[10px] lg:text-xs font-semibold uppercase tracking-widest hidden sm:block">Módulo de Taller Mecánico</p>
                <h1 className="text-xl lg:text-4xl font-bold text-white leading-tight">Taller</h1>
                <p className="text-slate-300 text-xs lg:text-sm mt-0.5">Gestión de órdenes de trabajo y repuestos</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setSolicitudesOpen(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:scale-105"
                style={{ background: "#D97706" }}>
                <Package className="w-4 h-4" /> <span className="hidden sm:inline">Solicitud de Repuesto</span>
              </button>
              <button onClick={() => { setEditando(null); setModalOpen(true); }}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:scale-105"
                style={{ background: "#2563EB" }}>
                <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Nueva Orden</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="max-w-6xl mx-auto px-4 lg:px-10 mt-4 lg:mt-6 mb-4 lg:mb-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
          {[
            { label: "Pendientes", value: pendientes, icon: ClipboardList, color: "#D97706", bg: "#FFFBEB" },
            { label: "En Proceso", value: enProceso, icon: Activity, color: "#7C3AED", bg: "#F5F3FF" },
            { label: "Completadas", value: completadas, icon: CheckCircle2, color: "#16A34A", bg: "#F0FDF4" },
            { label: "Stock Bajo", value: stockBajo.length, icon: AlertTriangle, color: "#DC2626", bg: "#FEF2F2" },
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

      <div className="max-w-6xl mx-auto px-4 lg:px-10 pb-10 grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        {/* Columna principal: Órdenes de Trabajo */}
        <div className="lg:col-span-2 space-y-4">
          {/* Filtros */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {FILTROS.map(f => (
              <button key={f.value} onClick={() => setFiltro(f.value)}
                className="px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all"
                style={filtro === f.value
                  ? { background: "#1E293B", color: "white" }
                  : { background: "white", color: "#64748B", border: "1px solid #E2E8F0" }}>
                {f.label}
                {f.value !== "todas" && (
                  <span className="ml-1.5 text-xs">({ordenes.filter(o => o.estado === f.value).length})</span>
                )}
              </button>
            ))}
          </div>

          {/* Lista de OTs */}
          {filtradas.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center" style={{ boxShadow: "0 4px 20px rgba(15,45,107,0.06)" }}>
              <Wrench className="w-12 h-12 text-slate-200 mx-auto mb-3" />
              <p className="text-slate-400 text-sm">No hay órdenes {filtro !== "todas" ? `"${FILTROS.find(f => f.value === filtro)?.label.toLowerCase()}"` : ""}.</p>
              <button onClick={() => { setEditando(null); setModalOpen(true); }}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white" style={{ background: "#2563EB" }}>
                <Plus className="w-4 h-4" /> Crear primera orden
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {filtradas.map(ot => (
                <OrdenTrabajoCard key={ot.id} ot={ot} onActualizar={fetchData} onEditar={handleEditar} puedeCerrar={esJefe} />
              ))}
            </div>
          )}
        </div>

        {/* Columna lateral: Repuestos con stock bajo + resumen */}
        <div className="space-y-4">
          {/* Repuestos stock bajo */}
          <div className="bg-white rounded-2xl shadow-lg overflow-hidden" style={{ boxShadow: "0 8px 32px rgba(220,38,38,0.10)" }}>
            <div className="px-5 py-4 border-b border-red-50 flex items-center gap-2" style={{ background: "#FFF5F5" }}>
              <div className="w-7 h-7 rounded-lg bg-red-100 flex items-center justify-center">
                <Package className="w-4 h-4 text-red-600" />
              </div>
              <h2 className="font-bold text-red-800 text-sm flex items-center gap-2 flex-1">
                Repuestos Stock Bajo
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">{stockBajo.length}</span>
              </h2>
              <Link to={createPageUrl("Repuestos")} className="text-xs text-red-600 font-semibold flex items-center gap-1 hover:gap-2 transition-all">Ver <ChevronRight className="w-3 h-3" /></Link>
            </div>
            <div className="divide-y divide-slate-50">
              {stockBajo.length === 0 ? (
                <div className="px-5 py-6 text-center">
                  <CheckCircle2 className="w-8 h-8 text-green-200 mx-auto mb-2" />
                  <p className="text-xs text-slate-400">Todos los repuestos con stock suficiente</p>
                </div>
              ) : stockBajo.slice(0, 6).map(r => (
                <div key={r.id} className="px-5 py-3 flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-800 truncate">{r.nombre}</p>
                    <p className="text-xs text-slate-400">{r.categoria} · {r.proveedor_nombre || "Sin proveedor"}</p>
                  </div>
                  <div className="text-right flex-shrink-0 ml-2">
                    <p className="text-sm font-bold text-red-600">{r.stock_actual || 0}</p>
                    <p className="text-xs text-slate-400">mín. {r.stock_minimo || 0}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Acceso a Proveedores */}
          <Link to={createPageUrl("Proveedores")} className="bg-white rounded-2xl shadow-lg p-5 flex items-center gap-3 hover:shadow-xl transition-all" style={{ boxShadow: "0 8px 32px rgba(21,101,192,0.08)" }}>
            <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "#EFF6FF" }}>
              <Building2 className="w-5 h-5 text-blue-600" />
            </div>
            <div className="flex-1">
              <p className="font-bold text-slate-800 text-sm">Proveedores</p>
              <p className="text-xs text-slate-400">Gestionar directorio</p>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-300" />
          </Link>

          {/* Resumen de costos */}
          <div className="bg-white rounded-2xl shadow-lg p-5" style={{ boxShadow: "0 8px 32px rgba(21,101,192,0.08)" }}>
            <h2 className="font-bold text-slate-800 text-sm flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-blue-600" />
              </div>
              Resumen de Costos
            </h2>
            <div className="space-y-3">
              {(() => {
                const totalRep = ordenes.reduce((s, o) => s + (o.total_repuestos || 0), 0);
                const totalMO = ordenes.reduce((s, o) => s + (o.total_mano_obra || 0), 0);
                const total = totalRep + totalMO;
                return (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-500">Repuestos</span>
                      <span className="text-sm font-bold text-slate-700">${totalRep.toLocaleString("es-CL")}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-500">Mano de Obra</span>
                      <span className="text-sm font-bold text-slate-700">${totalMO.toLocaleString("es-CL")}</span>
                    </div>
                    <div className="h-px bg-slate-100" />
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-slate-700">Total</span>
                      <span className="text-lg font-bold text-blue-700">${total.toLocaleString("es-CL")}</span>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      </div>

      {/* Módulo de Taller: Solicitud de Repuestos (enviadas por mecánicos, aprobadas por Jefe de Taller) */}
      <div className="max-w-6xl mx-auto px-4 lg:px-10 pb-10 space-y-4 lg:space-y-6">
        <SolicitudRepuestoModule user={user} />
      </div>

      <HistorialSolicitudesModal open={solicitudesOpen} onClose={() => setSolicitudesOpen(false)} user={user} />

      <OrdenTrabajoFormModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditando(null); }}
        onGuardar={handleGuardar}
        equipos={equipos}
        editando={editando}
        user={user}
      />
    </div>
  );
}