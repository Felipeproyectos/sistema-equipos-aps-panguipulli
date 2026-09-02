import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, X } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { agregarEventoCompra } from "@/utils/compraTimeline";

export default function EjecutarCompraModal({ solicitud, user, onClose, onGuardado, entityName = "SolicitudRepuesto" }) {
  const [form, setForm] = useState({
    proveedor_compra_nombre: solicitud?.proveedor_compra_nombre || "",
    precio_total_compra: solicitud?.precio_total_compra || "",
    fecha_compra: new Date().toISOString().split("T")[0],
    observaciones_compra: solicitud?.observaciones_compra || "",
  });
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  if (!solicitud) return null;

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    setSaving(true);
    try {
      await base44.entities[entityName].update(solicitud.id, {
        estado: "comprada",
        proveedor_compra_nombre: form.proveedor_compra_nombre || undefined,
        precio_total_compra: Number(form.precio_total_compra) || 0,
        fecha_compra: form.fecha_compra,
        observaciones_compra: form.observaciones_compra || undefined,
        comprado_por_email: user?.email,
        comprado_por_nombre: user?.full_name,
      });
      const detalle = [form.proveedor_compra_nombre && `Proveedor: ${form.proveedor_compra_nombre}`, Number(form.precio_total_compra) > 0 && `$${form.precio_total_compra}`].filter(Boolean).join(" · ");
      await agregarEventoCompra(solicitud.id, "Compra ejecutada", detalle, user, entityName).catch(() => {});
      toast({ title: "Compra registrada", description: `"${solicitud.repuesto_nombre}" marcada como comprada.` });
      onGuardado();
      onClose();
    } catch (e) {
      toast({ title: "No se pudo registrar", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const input = "w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-slate-50";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" style={{ background: "rgba(15,23,42,0.5)" }}>
      <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-slate-800">Registrar Compra</h3>
            <p className="text-xs text-slate-500">{solicitud.repuesto_nombre} · {solicitud.cantidad} unid.</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-500">Proveedor</label>
            <input className={input} value={form.proveedor_compra_nombre} onChange={e => set("proveedor_compra_nombre", e.target.value)} placeholder="Ej. Automotriz San Martín" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500">Precio total ($)</label>
              <input type="number" min="0" className={input} value={form.precio_total_compra} onChange={e => set("precio_total_compra", e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">Fecha de compra</label>
              <input type="date" className={input} value={form.fecha_compra} onChange={e => set("fecha_compra", e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">Observaciones</label>
            <textarea rows={2} className={input} value={form.observaciones_compra} onChange={e => set("observaciones_compra", e.target.value)} placeholder="Ej. Factura N°, tiempo de entrega, etc." />
          </div>
        </div>
        <div className="px-5 py-4 border-t border-slate-100 flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100">Cancelar</button>
          <button onClick={submit} disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50 flex items-center justify-center gap-1.5" style={{ background: "#2563EB" }}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirmar Compra"}
          </button>
        </div>
      </div>
    </div>
  );
}