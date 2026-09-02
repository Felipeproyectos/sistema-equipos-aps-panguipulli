import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import {
  Wrench, ClipboardList, CheckCircle2, Activity, Plus,
  RefreshCw, ChevronRight, Building2, User, ArrowRight, MapPin,
} from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import usePullToRefresh from "@/hooks/usePullToRefresh";

const ESTADO_OT = {
  pendiente: { label: "Pendiente", color: "#D97706", bg: "#FEF3C7" },
  asignada: { label: "Asignada", color: "#2563EB", bg: "#DBEAFE" },
  en_proceso: { label: "En Proceso", color: "#7C3AED", bg: "#F5F3FF" },
  pausada: { label: "Pausada", color: "#64748B", bg: "#F1F5F9" },
  completada: { label: "Completada", color: "#16A34A", bg: "#DCFCE7" },
  cancelada: { label: "Cancelada", color: "#DC2626", bg: "#FEE2E2" },
};

const TIPO_SOL = {
  compra_repuestos: "Compra de Repuestos",
  cambio_parches: "Cambio de Parches",
  mantenimiento_preventivo: "Mant. Preventivo",
  mantenimiento_correctivo: "Mant. Correctivo",
  revision_tecnica: "Revisión Técnica",
  otros: "Otros",
};

export default function TallerDashboard({ user }) {
  const [ordenes, setOrdenes] = useState([]);
  const [solicitudes, setSolicitudes] = useState([]);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef(null);

  const fetchData = async () => {
    const [ots, sols] = await Promise.all([
      base44.entities.OrdenTrabajo.list("-created_date", 100).catch(() => []),
      base44.entities.Solicitud.list("-created_date", 50).catch(() => []),
    ]);
    setOrdenes(ots);
    setSolicitudes(sols);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const { refreshing } = usePullToRefresh(fetchData, containerRef);

  const pendientes = ordenes.filter(o => o.estado === "pendiente");
  const enProceso = ordenes.filter(o => ["asignada", "en_proceso"].includes(o.estado));
  const completadas = ordenes.filter(o => o.estado === "completada");
  const solPendientes = solicitudes.filter(s => s.estado === "pendiente");

  const timeAgo = (d) => {
    try { return d ? formatDistanceToNow(new Date(d), { addSuffix: true, locale: es }) : ""; }
    catch { return ""; }
  };

  return (
    <div ref={containerRef} className="min-h-screen bg-slate-50" style={{ overscrollBehavior: "none" }}>
      {loading && (
        <div className="fixed top-0 left-0 right-0 z-50 h-1 overflow-hidden" style={{ background: "#bfdbfe" }}>
          <div className="h-full w-1/3 animate-pulse" style={{ background: "#2563eb" }} />
        </div>
      )}
      {refreshing && (
        <div className="flex items-center justify-center py-3 lg:hidden">
          <RefreshCw className="w-5 h-5 text-blue-500 animate-spin" />
        </div>
      )}

      {/* Header */}
      <div className="relative overflow-hidden px-4 lg:px-10 pt-6 lg:pt-12 pb-6 lg:pb-8"
        style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e293b 40%, #334155 100%)" }}>
        <div className="relative max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(255,255,255,0.15)" }}>
              <Wrench className="w-5 h-5 lg:w-6 lg:h-6 text-white" />
            </div>
            <div>
              <p className="text-amber-300 text-[10px] lg:text-xs font-semibold uppercase tracking-widest hidden sm:block">Módulo de Taller Mecánico</p>
              <h1 className="text-xl lg:text-4xl font-bold text-white leading-tight">Panel de Taller</h1>
              <p className="text-slate-300 text-xs lg:text-sm mt-0.5">Hola, {user?.full_name?.split(" ")[0] || "Usuario"} · Órdenes y solicitudes desde los centros</p>
            </div>
          </div>
          <Link to={createPageUrl("Taller")} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:scale-105" style={{ background: "#2563EB" }}>
            <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Ir a Taller</span>
          </Link>
        </div>
      </div>

      {/* KPIs */}
      <div className="max-w-6xl mx-auto px-4 lg:px-10 mt-4 lg:mt-6 mb-4 lg:mb-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
          {[
            { label: "Órdenes Pendientes", value: pendientes.length, icon: ClipboardList, color: "#D97706", bg: "#FFFBEB" },
            { label: "En Proceso", value: enProceso.length, icon: Activity, color: "#7C3AED", bg: "#F5F3FF" },
            { label: "Solicitudes Pendientes", value: solPendientes.length, icon: Building2, color: "#2563EB", bg: "#EFF6FF" },
            { label: "Completadas", value: completadas.length, icon: CheckCircle2, color: "#16A34A", bg: "#F0FDF4" },
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
        {/* Órdenes entrantes desde los centros */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-2xl shadow-lg overflow-hidden" style={{ boxShadow: "0 8px 32px rgba(15,45,107,0.10)" }}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between" style={{ background: "linear-gradient(90deg, #0f172a 0%, #1e293b 100%)" }}>
              <h2 className="font-bold text-white flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "rgba(255,255,255,0.2)" }}>
                  <Wrench className="w-4 h-4 text-white" />
                </div>
                Órdenes de Trabajo Entrantes
              </h2>
              <Link to={createPageUrl("Taller")} className="text-xs text-blue-200 font-semibold flex items-center gap-1 hover:text-white transition-colors">
                Ver todas <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div className="divide-y divide-slate-50">
              {pendientes.length === 0 ? (
                <div className="px-6 py-12 text-center text-slate-400 text-sm">
                  <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-green-200" />
                  No hay órdenes pendientes desde los centros.
                </div>
              ) : pendientes.map(ot => {
                const cfg = ESTADO_OT[ot.estado] || ESTADO_OT.pendiente;
                return (
                  <Link to={`/OrdenTrabajoDetalle/${ot.id}`} key={ot.id} className="px-4 lg:px-6 py-3.5 flex items-start gap-3 hover:bg-slate-50 transition-colors">
                    <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Wrench className="w-4 h-4 text-amber-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-800">{ot.numero_ot}</p>
                          <p className="text-xs text-slate-500 mt-0.5 truncate">{ot.equipo_label}{ot.patente ? ` · ${ot.patente}` : ""}</p>
                          {ot.problema_reportado && <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{ot.problema_reportado}</p>}
                          <div className="flex items-center gap-3 mt-1 flex-wrap">
                            {ot.reportado_por_nombre && (
                              <span className="text-xs text-slate-400 flex items-center gap-1"><User className="w-3 h-3" />{ot.reportado_por_nombre}</span>
                            )}
                            {ot.origen && (
                              <span className="text-xs text-slate-400 flex items-center gap-1"><MapPin className="w-3 h-3" />{ot.origen === "bitacora" ? "Bitácora" : ot.origen === "inspeccion" ? "Inspección" : "Solicitud directa"}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                          <span className="text-xs text-slate-400 whitespace-nowrap">{timeAgo(ot.created_date)}</span>
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Órdenes en proceso (compacto) */}
          {enProceso.length > 0 && (
            <div className="bg-white rounded-2xl shadow-lg overflow-hidden" style={{ boxShadow: "0 8px 32px rgba(124,58,237,0.08)" }}>
              <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between" style={{ background: "#F5F3FF" }}>
                <h2 className="font-bold text-violet-800 text-sm flex items-center gap-2">
                  <Activity className="w-4 h-4" /> En Proceso
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">{enProceso.length}</span>
                </h2>
              </div>
              <div className="divide-y divide-slate-50">
                {enProceso.slice(0, 6).map(ot => (
                  <Link to={`/OrdenTrabajoDetalle/${ot.id}`} key={ot.id} className="px-5 py-2.5 flex items-center justify-between hover:bg-slate-50 transition-colors">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-800">{ot.numero_ot}</p>
                      <p className="text-xs text-slate-400 truncate">{ot.equipo_label}{ot.mecanico_nombre ? ` · ${ot.mecanico_nombre}` : ""}</p>
                    </div>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 flex-shrink-0">{ESTADO_OT[ot.estado]?.label}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Solicitudes desde los centros */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl shadow-lg overflow-hidden" style={{ boxShadow: "0 8px 32px rgba(37,99,235,0.10)" }}>
            <div className="px-5 py-4 border-b border-blue-50 flex items-center justify-between" style={{ background: "#EFF6FF" }}>
              <h2 className="font-bold text-blue-800 flex items-center gap-2 text-sm">
                <div className="w-6 h-6 rounded-lg bg-blue-100 flex items-center justify-center">
                  <ClipboardList className="w-3.5 h-3.5 text-blue-600" />
                </div>
                Solicitudes desde Centros
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">{solPendientes.length}</span>
              </h2>
              <Link to={createPageUrl("SolicitudesV2")} className="text-xs text-blue-600 font-semibold flex items-center gap-1 hover:gap-2 transition-all">
                Ver <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="divide-y divide-slate-50 max-h-[28rem] overflow-y-auto">
              {solPendientes.length === 0 ? (
                <div className="px-5 py-8 text-center text-xs text-slate-400">
                  <CheckCircle2 className="w-8 h-8 text-blue-200 mx-auto mb-2" />
                  Sin solicitudes pendientes desde los centros.
                </div>
              ) : solPendientes.map(sol => (
                <div key={sol.id} className="px-5 py-3">
                  <p className="text-xs font-bold text-slate-800">{TIPO_SOL[sol.tipo] || sol.tipo}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{sol.centro || "Sin centro"}</p>
                  {sol.usuario_nombre && <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1"><User className="w-3 h-3" />{sol.usuario_nombre}</p>}
                  {sol.observaciones && <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{sol.observaciones}</p>}
                  <p className="text-xs text-blue-500 font-medium mt-0.5">{timeAgo(sol.created_date)}</p>
                </div>
              ))}
            </div>
            <div className="px-5 py-3 border-t border-slate-100">
              <Link to={createPageUrl("SolicitudesV2")} className="text-xs text-blue-600 font-semibold flex items-center gap-1 hover:gap-2 transition-all">
                Ver todas las solicitudes <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}