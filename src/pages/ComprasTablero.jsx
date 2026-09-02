import { useState, useEffect, useCallback, useRef } from "react";
import { base44 } from "@/api/base44Client";
import {
  ShoppingCart, CheckCircle2, Package, Loader2, RefreshCw, User,
  Wrench, Calendar, Building2, DollarSign, FileDown, Warehouse, ClipboardList,
} from "lucide-react";
import { generarPDFSolicitudRepuesto } from "@/utils/generarPDFSolicitudRepuesto";
import { useToast } from "@/components/ui/use-toast";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import usePullToRefresh from "@/hooks/usePullToRefresh";
import { useAuth } from "@/lib/AuthContext";
import SeguimientoCompraModal from "@/components/taller/SeguimientoCompraModal";

const COLS = [
  { key: "aprobada", label: "Pendientes de Compra", icon: ShoppingCart, color: "#D97706", bg: "#FEF3C7" },
  { key: "comprada", label: "Compradas (Ejecutadas)", icon: Building2, color: "#2563EB", bg: "#DBEAFE" },
  { key: "recibida", label: "Recibidas en Bodega", icon: Warehouse, color: "#16A34A", bg: "#DCFCE7" },
];

const fmtCLP = (n) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(n || 0);

export default function ComprasTablero() {
  const { user } = useAuth();
  const [solicitudes, setSolicitudes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selSeguimiento, setSelSeguimiento] = useState(null);
  const containerRef = useRef(null);
  const { toast } = useToast();

  const fetch = useCallback(async () => {
    const list = await base44.entities.SolicitudRepuesto.list("-created_date", 200).catch(() => []);
    setSolicitudes(list);
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const { refreshing } = usePullToRefresh(fetch, containerRef);

  const pendientesCompra = solicitudes.filter(s => s.estado === "aprobada");
  const compradas = solicitudes.filter(s => s.estado === "comprada");
  const recibidas = solicitudes.filter(s => s.estado === "recibida");

  const timeAgo = (d) => {
    try { return d ? formatDistanceToNow(new Date(d), { addSuffix: true, locale: es }) : ""; }
    catch { return ""; }
  };

  const Card = ({ sol }) => (
    <div className="bg-white rounded-2xl p-4" style={{ boxShadow: "0 4px 14px rgba(15,45,107,0.07)" }}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold text-slate-800 text-sm">{sol.repuesto_nombre}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">{sol.numero_solicitud} · {sol.cantidad} unid. · {sol.categoria}</p>
        </div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${sol.urgencia === "alta" ? "bg-red-100 text-red-600" : sol.urgencia === "media" ? "bg-amber-100 text-amber-600" : "bg-slate-100 text-slate-500"}`}>
          {sol.urgencia?.toUpperCase()}
        </span>
      </div>
      <div className="flex items-center gap-3 mt-2 flex-wrap text-[11px] text-slate-400">
        <span className="flex items-center gap-1"><User className="w-3 h-3" />{sol.solicitante_nombre || sol.solicitante_email}</span>
        {sol.orden_trabajo_label && <span className="flex items-center gap-1"><Wrench className="w-3 h-3" />{sol.orden_trabajo_label}</span>}
      </div>
      {sol.motivo && <p className="text-[11px] text-slate-500 mt-2 bg-slate-50 rounded-lg px-2.5 py-1.5 italic">"{sol.motivo}"</p>}

      {sol.estado === "comprada" && (sol.proveedor_compra_nombre || sol.precio_total_compra || sol.fecha_compra) && (
        <div className="mt-2.5 space-y-1 text-[11px] text-slate-600 bg-blue-50 rounded-lg px-2.5 py-2">
          {sol.proveedor_compra_nombre && <p className="flex items-center gap-1.5"><Building2 className="w-3 h-3" /> {sol.proveedor_compra_nombre}</p>}
          {sol.precio_total_compra > 0 && <p className="flex items-center gap-1.5"><DollarSign className="w-3 h-3" /> {fmtCLP(sol.precio_total_compra)}</p>}
          {sol.fecha_compra && <p className="flex items-center gap-1.5"><Calendar className="w-3 h-3" /> Comprado: {sol.fecha_compra}</p>}
        </div>
      )}
      {sol.estado === "recibida" && (
        <div className="mt-2.5 space-y-1 text-[11px] text-green-700 bg-green-50 rounded-lg px-2.5 py-2">
          <p className="flex items-center gap-1.5"><Warehouse className="w-3 h-3" /> Recibido en bodega: {sol.fecha_recepcion_bodega || "—"}</p>
          {sol.comprado_por_nombre && <p className="flex items-center gap-1.5"><ShoppingCart className="w-3 h-3" /> Compró: {sol.comprado_por_nombre}</p>}
        </div>
      )}

      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <button onClick={() => setSelSeguimiento(sol)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white"
          style={{ background: sol.estado === "aprobada" ? "#D97706" : sol.estado === "comprada" ? "#2563EB" : "#16A34A" }}>
          <ClipboardList className="w-3.5 h-3.5" /> Seguimiento
        </button>
        <button onClick={() => generarPDFSolicitudRepuesto(sol)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold" style={{ background: "#F1F5F9", color: "#334155" }}>
          <FileDown className="w-3.5 h-3.5" /> PDF
        </button>
        <span className="text-[10px] text-slate-300 ml-auto">{timeAgo(sol.created_date)}</span>
      </div>
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
        <div className="relative max-w-7xl mx-auto flex items-center gap-3">
          <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(255,255,255,0.15)" }}>
            <ShoppingCart className="w-5 h-5 lg:w-6 lg:h-6 text-white" />
          </div>
          <div>
            <p className="text-blue-300 text-[10px] lg:text-xs font-semibold uppercase tracking-widest hidden sm:block">Encargado de Compras · Taller</p>
            <h1 className="text-xl lg:text-4xl font-bold text-white leading-tight">Tablero de Compras</h1>
            <p className="text-slate-300 text-xs lg:text-sm mt-0.5">Gestiona solicitudes pendientes, ejecuta compras y confirma recepción en bodega</p>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="max-w-7xl mx-auto px-4 lg:px-10 mt-4 lg:mt-6 mb-4 lg:mb-6">
        <div className="grid grid-cols-3 gap-3 lg:gap-4">
          {[
            { label: "Pendientes de Compra", value: pendientesCompra.length, icon: ShoppingCart, color: "#D97706", bg: "#FFFBEB" },
            { label: "Compradas", value: compradas.length, icon: Building2, color: "#2563EB", bg: "#EFF6FF" },
            { label: "Recibidas en Bodega", value: recibidas.length, icon: Warehouse, color: "#16A34A", bg: "#F0FDF4" },
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

      {/* Tablero Kanban */}
      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 text-slate-300 animate-spin" /></div>
      ) : (
        <div className="max-w-7xl mx-auto px-4 lg:px-10 pb-10">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-5">
            <div className="rounded-2xl p-3" style={{ background: "#FFFBEB" }}>
              <div className="flex items-center gap-2 mb-3 px-1">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "#FEF3C7" }}>
                  <ShoppingCart className="w-4 h-4" style={{ color: "#D97706" }} />
                </div>
                <p className="font-bold text-sm" style={{ color: "#92400E" }}>Pendientes de Compra</p>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full ml-auto" style={{ background: "#FEF3C7", color: "#92400E" }}>{pendientesCompra.length}</span>
              </div>
              <div className="space-y-3 min-h-[120px]">
                {pendientesCompra.length === 0
                  ? <p className="text-xs text-slate-400 text-center py-8">No hay solicitudes pendientes de compra.</p>
                  : pendientesCompra.map(sol => <Card key={sol.id} sol={sol} showActions="comprar" />)}
              </div>
            </div>

            <div className="rounded-2xl p-3" style={{ background: "#EFF6FF" }}>
              <div className="flex items-center gap-2 mb-3 px-1">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "#DBEAFE" }}>
                  <Building2 className="w-4 h-4" style={{ color: "#2563EB" }} />
                </div>
                <p className="font-bold text-sm" style={{ color: "#1E40AF" }}>Compradas (Ejecutadas)</p>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full ml-auto" style={{ background: "#DBEAFE", color: "#1E40AF" }}>{compradas.length}</span>
              </div>
              <div className="space-y-3 min-h-[120px]">
                {compradas.length === 0
                  ? <p className="text-xs text-slate-400 text-center py-8">No hay compras ejecutadas.</p>
                  : compradas.map(sol => <Card key={sol.id} sol={sol} showActions="recibir" />)}
              </div>
            </div>

            <div className="rounded-2xl p-3" style={{ background: "#F0FDF4" }}>
              <div className="flex items-center gap-2 mb-3 px-1">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "#DCFCE7" }}>
                  <Warehouse className="w-4 h-4" style={{ color: "#16A34A" }} />
                </div>
                <p className="font-bold text-sm" style={{ color: "#166534" }}>Recibidas en Bodega</p>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full ml-auto" style={{ background: "#DCFCE7", color: "#166534" }}>{recibidas.length}</span>
              </div>
              <div className="space-y-3 min-h-[120px]">
                {recibidas.length === 0
                  ? <p className="text-xs text-slate-400 text-center py-8">No hay repuestos recibidos en bodega.</p>
                  : recibidas.map(sol => <Card key={sol.id} sol={sol} showActions={null} />)}
              </div>
            </div>
          </div>
        </div>
      )}

      <SeguimientoCompraModal
        solicitud={selSeguimiento}
        user={user}
        onClose={() => setSelSeguimiento(null)}
        onActualizado={fetch}
      />
    </div>
  );
}