import { useState, useEffect, useCallback, useRef } from "react";
import { base44 } from "@/api/base44Client";
import {
  Package, ClipboardCheck, CheckCircle2, XCircle, Clock, Loader2,
  RefreshCw, User, Wrench, ArrowRight, FileDown, ShoppingCart,
} from "lucide-react";
import { generarPDFSolicitudRepuesto } from "@/utils/generarPDFSolicitudRepuesto";
import { useToast } from "@/components/ui/use-toast";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import usePullToRefresh from "@/hooks/usePullToRefresh";
import AprobacionRepuestoModal from "@/components/taller/AprobacionRepuestoModal";
import SeguimientoCompraModal from "@/components/taller/SeguimientoCompraModal";
import { useAuth } from "@/lib/AuthContext";
import { ClipboardList } from "lucide-react";

const ESTADO_CFG = {
  pendiente: { label: "Pendiente", color: "#D97706", bg: "#FEF3C7", icon: Clock },
  aprobada: { label: "Aprobada", color: "#16A34A", bg: "#DCFCE7", icon: CheckCircle2 },
  rechazada: { label: "Rechazada", color: "#DC2626", bg: "#FEE2E2", icon: XCircle },
  comprada: { label: "Comprada", color: "#2563EB", bg: "#DBEAFE", icon: Package },
};

const FILTROS = [
  { value: "pendiente", label: "Pendientes" },
  { value: "aprobada", label: "Aprobadas" },
  { value: "comprada", label: "Compradas" },
  { value: "rechazada", label: "Rechazadas" },
  { value: "todas", label: "Todas" },
];

export default function AprobacionRepuestos() {
  const { user } = useAuth();
  const [solicitudes, setSolicitudes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState("pendiente");
  const [seleccionada, setSeleccionada] = useState(null);
  const [comprando, setComprando] = useState(null);
  const [selSeguimiento, setSelSeguimiento] = useState(null);
  const containerRef = useRef(null);
  const { toast } = useToast();

  const puedeComprar = ["super_admin", "admin", "jefe_taller", "encargado_compras_taller"].includes(user?.role);

  const marcarComprada = async (sol) => {
    setComprando(sol.id);
    try {
      await base44.entities.SolicitudRepuesto.update(sol.id, { estado: "comprada" });
      toast({ title: "Compra registrada", description: `"${sol.repuesto_nombre}" marcada como comprada.` });
      fetch();
    } catch (e) {
      toast({ title: "No se pudo registrar la compra", description: e.message, variant: "destructive" });
    }
    setComprando(null);
  };

  const fetch = useCallback(async () => {
    const list = await base44.entities.SolicitudRepuesto.list("-created_date", 200).catch(() => []);
    setSolicitudes(list);
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const { refreshing } = usePullToRefresh(fetch, containerRef);

  // Un aprobador no debe ver ni actuar sobre sus propias solicitudes en este
  // módulo (evita auto-aprobación / auto-compra). Las solicitudes propias se
  // gestionan desde la lista de solicitudes del usuario, no desde aprobación.
  const visibles = solicitudes.filter(s => s.solicitante_email !== user?.email);
  const filtradas = filtro === "todas" ? visibles : visibles.filter(s => s.estado === filtro);
  const pendientes = visibles.filter(s => s.estado === "pendiente").length;
  const aprobadas = visibles.filter(s => s.estado === "aprobada").length;
  const rechazadas = visibles.filter(s => s.estado === "rechazada").length;

  const onResolver = (estado, error, data) => {
    if (error) {
      toast({ title: "No se pudo procesar", description: error.message, variant: "destructive" });
    } else {
      let title = `Solicitud ${estado === "aprobada" ? "aprobada" : "rechazada"}`;
      let description;
      if (estado === "aprobada" && data?.deduccion) {
        const d = data.deduccion;
        if (d.no_encontrado) {
          description = `"${d.repuesto_nombre}" no está en el inventario. Gestiona la compra por separado.`;
        } else if (d.insuficiente) {
          description = `Stock insuficiente. Stock actual: ${d.nuevo_stock} (era ${d.stock_previo}). Reponer pronto.`;
        } else {
          description = `Descontado ${d.cantidad_descontada} de "${d.repuesto_nombre}". Stock: ${d.stock_previo} → ${d.nuevo_stock}.`;
        }
      }
      toast({ title, description });
      setSeleccionada(null);
      fetch();
    }
  };

  const timeAgo = (d) => {
    try { return d ? formatDistanceToNow(new Date(d), { addSuffix: true, locale: es }) : ""; }
    catch { return ""; }
  };

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
            <ClipboardCheck className="w-5 h-5 lg:w-6 lg:h-6 text-white" />
          </div>
          <div>
            <p className="text-amber-300 text-[10px] lg:text-xs font-semibold uppercase tracking-widest hidden sm:block">Módulo de Taller Mecánico</p>
            <h1 className="text-xl lg:text-4xl font-bold text-white leading-tight">Aprobación de Solicitudes</h1>
            <p className="text-slate-300 text-xs lg:text-sm mt-0.5">Revisa y aprueba las solicitudes de repuestos enviadas por los mecánicos</p>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="max-w-6xl mx-auto px-4 lg:px-10 mt-4 lg:mt-6 mb-4 lg:mb-6">
        <div className="grid grid-cols-3 gap-3 lg:gap-4">
          {[
            { label: "Pendientes", value: pendientes, icon: Clock, color: "#D97706", bg: "#FFFBEB" },
            { label: "Aprobadas", value: aprobadas, icon: CheckCircle2, color: "#16A34A", bg: "#F0FDF4" },
            { label: "Rechazadas", value: rechazadas, icon: XCircle, color: "#DC2626", bg: "#FEF2F2" },
          ].map((s, i) => {
            const Icon = s.icon;
            return (
              <div key={i} className="bg-white rounded-2xl p-4 lg:p-5" style={{ boxShadow: "0 4px 20px rgba(15,45,107,0.08)" }}>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 lg:w-11 lg:h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: s.bg }}>
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

      <div className="max-w-6xl mx-auto px-4 lg:px-10 pb-10">
        {/* Filtros */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
          {FILTROS.map(f => (
            <button key={f.value} onClick={() => setFiltro(f.value)}
              className="px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all"
              style={filtro === f.value
                ? { background: "#1E293B", color: "white" }
                : { background: "white", color: "#64748B", border: "1px solid #E2E8F0" }}>
              {f.label}
              <span className="ml-1.5 text-xs">({f.value === "todas" ? visibles.length : visibles.filter(s => s.estado === f.value).length})</span>
            </button>
          ))}
        </div>

        {/* Lista */}
        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 text-slate-300 animate-spin" /></div>
        ) : filtradas.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center" style={{ boxShadow: "0 4px 20px rgba(15,45,107,0.06)" }}>
            <ClipboardCheck className="w-12 h-12 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-400 text-sm">No hay solicitudes {filtro !== "todas" ? `"${FILTROS.find(f => f.value === filtro)?.label.toLowerCase()}"` : ""}.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtradas.map(sol => {
              const cfg = ESTADO_CFG[sol.estado] || ESTADO_CFG.pendiente;
              const Icon = cfg.icon;
              const esPendiente = sol.estado === "pendiente";
              return (
                <div key={sol.id} className="bg-white rounded-2xl p-4 lg:p-5" style={{ boxShadow: "0 4px 20px rgba(15,45,107,0.06)" }}>
                  <div className="flex items-start gap-3">
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: cfg.bg }}>
                      <Icon className="w-5 h-5" style={{ color: cfg.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div className="min-w-0">
                          <p className="font-bold text-slate-800">{sol.repuesto_nombre}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{sol.numero_solicitud} · {sol.cantidad} unid. · {sol.categoria}</p>
                        </div>
                        <span className="text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1" style={{ background: cfg.bg, color: cfg.color }}>
                          <Icon className="w-3 h-3" /> {cfg.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-2 flex-wrap text-xs text-slate-400">
                        <span className="flex items-center gap-1"><User className="w-3 h-3" />{sol.solicitante_nombre || sol.solicitante_email}</span>
                        {sol.orden_trabajo_label && <span className="flex items-center gap-1"><Wrench className="w-3 h-3" />{sol.orden_trabajo_label}</span>}
                        <span>Urgencia {sol.urgencia}</span>
                        <span>{timeAgo(sol.created_date)}</span>
                      </div>
                      {sol.motivo && <p className="text-xs text-slate-500 mt-2 bg-slate-50 rounded-lg px-3 py-2 italic">"{sol.motivo}"</p>}
                      {sol.comentario_aprobador && (
                        <p className="text-xs text-slate-600 mt-2 flex items-start gap-1">
                          <ArrowRight className="w-3 h-3 mt-0.5 flex-shrink-0" />
                          <span>"{sol.comentario_aprobador}" — {sol.aprobador_nombre || sol.aprobador_email}</span>
                        </p>
                      )}
                      <div className="mt-3 flex items-center gap-2 flex-wrap">
                        {esPendiente && sol.solicitante_email !== user?.email && (
                          <button onClick={() => setSeleccionada(sol)}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white" style={{ background: "#D97706" }}>
                            <ClipboardCheck className="w-4 h-4" /> Revisar y resolver
                          </button>
                        )}
                        {sol.estado === "aprobada" && puedeComprar && (
                          <button onClick={() => marcarComprada(sol)} disabled={comprando === sol.id}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-50" style={{ background: "#2563EB" }}>
                            {comprando === sol.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShoppingCart className="w-4 h-4" />} Marcar Comprada
                          </button>
                        )}
                        {!esPendiente && (
                          <button onClick={() => setSelSeguimiento(sol)}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold" style={{ background: "#EFF6FF", color: "#1D4ED8", border: "1px solid #BFDBFE" }}>
                            <ClipboardList className="w-4 h-4" /> Ver Seguimiento
                          </button>
                        )}
                        <button onClick={() => generarPDFSolicitudRepuesto(sol)}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold" style={{ background: "#F1F5F9", color: "#334155" }}>
                          <FileDown className="w-4 h-4" /> PDF
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <AprobacionRepuestoModal solicitud={seleccionada} user={user} onClose={() => setSeleccionada(null)} onResolver={onResolver} />
      <SeguimientoCompraModal
        solicitud={selSeguimiento}
        user={user}
        onClose={() => setSelSeguimiento(null)}
        onActualizado={fetch}
        readOnly
      />
    </div>
  );
}