import { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { X, Plus, FileDown, Loader2, Clock, CheckCircle2, XCircle, ShoppingCart } from "lucide-react";
import SolicitudRepuestoFormModal from "./SolicitudRepuestoFormModal";
import { generarPDFSolicitudRepuesto } from "@/utils/generarPDFSolicitudRepuesto";

const ESTADO_CFG = {
  pendiente: { label: "Pendiente", seguimiento: "Enviada a Compras de Taller", color: "#D97706", bg: "#FEF3C7", icon: Clock },
  aprobada: { label: "Aprobada", seguimiento: "Compra pendiente de ejecución", color: "#16A34A", bg: "#DCFCE7", icon: CheckCircle2 },
  rechazada: { label: "Rechazada", seguimiento: "Compra no ejecutada", color: "#DC2626", bg: "#FEE2E2", icon: XCircle },
  comprada: { label: "Comprada", seguimiento: "Compra ejecutada ✔", color: "#2563EB", bg: "#DBEAFE", icon: ShoppingCart },
};

const FILTROS = ["todas", "pendiente", "aprobada", "comprada", "rechazada"];

export default function HistorialSolicitudesModal({ open, onClose, user }) {
  const [solicitudes, setSolicitudes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState("todas");
  const [formOpen, setFormOpen] = useState(false);

  const fetch = useCallback(async () => {
    setLoading(true);
    const list = await base44.entities.SolicitudRepuesto.list("-created_date", 200).catch(() => []);
    setSolicitudes(list);
    setLoading(false);
  }, []);

  useEffect(() => { if (open) fetch(); }, [open, fetch]);

  if (!open) return null;

  const filtradas = filtro === "todas" ? solicitudes : solicitudes.filter(s => s.estado === filtro);
  const fmtFecha = (f) => f ? new Date(f).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" }) : "—";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" style={{ background: "rgba(15,23,42,0.5)" }}>
      <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl flex flex-col" style={{ maxHeight: "85vh" }}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
          <div>
            <h3 className="font-bold text-slate-800">Solicitudes de Compra de Repuestos</h3>
            <p className="text-xs text-slate-400 mt-0.5">Histórico y seguimiento de ejecución de compras</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setFormOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-white" style={{ background: "#D97706" }}>
              <Plus className="w-3.5 h-3.5" /> Nueva Solicitud
            </button>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto px-5 py-3 flex-shrink-0 border-b border-slate-50">
          {FILTROS.map(f => (
            <button key={f} onClick={() => setFiltro(f)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap capitalize transition-all"
              style={filtro === f ? { background: "#1E293B", color: "white" } : { background: "#F1F5F9", color: "#64748B" }}>
              {f} ({f === "todas" ? solicitudes.length : solicitudes.filter(s => s.estado === f).length})
            </button>
          ))}
        </div>

        <div className="overflow-y-auto divide-y divide-slate-50 flex-1">
          {loading ? (
            <div className="py-10 text-center"><Loader2 className="w-6 h-6 text-slate-300 animate-spin mx-auto" /></div>
          ) : filtradas.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-400">No hay solicitudes en esta categoría.</div>
          ) : filtradas.map(sol => {
            const cfg = ESTADO_CFG[sol.estado] || ESTADO_CFG.pendiente;
            const Icon = cfg.icon;
            return (
              <div key={sol.id} className="px-5 py-3 flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: cfg.bg }}>
                  <Icon className="w-4 h-4" style={{ color: cfg.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold text-slate-800">{sol.repuesto_nombre}</p>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{sol.numero_solicitud} · {sol.cantidad} unid. · {fmtFecha(sol.fecha_solicitud || sol.created_date)} · {sol.solicitante_nombre || sol.solicitante_email}</p>
                  <p className="text-xs font-semibold mt-1" style={{ color: cfg.color }}>{cfg.seguimiento}</p>
                  {sol.comentario_aprobador && <p className="text-xs text-slate-400 italic mt-0.5">"{sol.comentario_aprobador}" — {sol.aprobador_nombre}</p>}
                </div>
                <button onClick={() => generarPDFSolicitudRepuesto(sol)} title="Descargar PDF"
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold flex-shrink-0"
                  style={{ background: "#F1F5F9", color: "#334155" }}>
                  <FileDown className="w-3.5 h-3.5" /> PDF
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <SolicitudRepuestoFormModal open={formOpen} onClose={() => setFormOpen(false)} onGuardar={fetch} user={user} />
    </div>
  );
}