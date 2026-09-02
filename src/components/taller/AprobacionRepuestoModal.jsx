import { useState } from "react";
import { Loader2, X, CheckCircle2, XCircle } from "lucide-react";
import { base44 } from "@/api/base44Client";

export default function AprobacionRepuestoModal({ solicitud, user, onClose, onResolver }) {
  const [comentario, setComentario] = useState("");
  const [saving, setSaving] = useState(null);

  if (!solicitud) return null;

  const resolver = async (estado) => {
    setSaving(estado);
    try {
      const res = await base44.functions.invoke("aprobarSolicitudRepuesto", {
        solicitud_id: solicitud.id,
        estado,
        comentario,
      });
      onResolver(estado, null, res.data);
    } catch (e) {
      onResolver(estado, e);
    }
    setSaving(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" style={{ background: "rgba(15,23,42,0.55)" }}>
      <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-800">Revisar Solicitud</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-3">
          <div className="bg-slate-50 rounded-2xl p-4 space-y-1">
            <p className="font-bold text-slate-800">{solicitud.repuesto_nombre}</p>
            <p className="text-xs text-slate-500">{solicitud.cantidad} unid. · {solicitud.categoria} · Urgencia {solicitud.urgencia}</p>
            <p className="text-xs text-slate-400">Solicita: {solicitud.solicitante_nombre || solicitud.solicitante_email}</p>
            {solicitud.orden_trabajo_label && <p className="text-xs text-slate-400">OT: {solicitud.orden_trabajo_label}</p>}
            {solicitud.motivo && <p className="text-xs text-slate-500 mt-1 pt-1 border-t border-slate-200">"{solicitud.motivo}"</p>}
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">Comentario del Jefe de Taller (opcional)</label>
            <textarea rows={3} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 bg-slate-50"
              value={comentario} onChange={e => setComentario(e.target.value)}
              placeholder="Ej. Aprobado, gestionar compra con proveedor X..." />
          </div>
        </div>
        <div className="px-5 py-4 border-t border-slate-100 flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100">Cancelar</button>
          <button onClick={() => resolver("rechazada")} disabled={saving !== null}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50 flex items-center justify-center gap-1.5" style={{ background: "#DC2626" }}>
            {saving === "rechazada" ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />} Rechazar
          </button>
          <button onClick={() => resolver("aprobada")} disabled={saving !== null}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50 flex items-center justify-center gap-1.5" style={{ background: "#16A34A" }}>
            {saving === "aprobada" ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Aprobar
          </button>
        </div>
      </div>
    </div>
  );
}