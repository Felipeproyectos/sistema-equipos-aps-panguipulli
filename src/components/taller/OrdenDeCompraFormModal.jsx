import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, X, Plus, Trash2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

export default function OrdenDeCompraFormModal({ open, onClose, onGuardar, user }) {
  const [proveedor, setProveedor] = useState("");
  const [fechaEntrega, setFechaEntrega] = useState("");
  const [notas, setNotas] = useState("");
  const [items, setItems] = useState([{ repuesto_nombre: "", cantidad: 1, precio_unitario: 0 }]);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  if (!open) return null;

  const setItem = (i, k, v) => setItems(prev => prev.map((it, idx) => idx === i ? { ...it, [k]: v } : it));
  const addItem = () => setItems(prev => [...prev, { repuesto_nombre: "", cantidad: 1, precio_unitario: 0 }]);
  const delItem = (i) => setItems(prev => prev.filter((_, idx) => idx !== i));

  const total = items.reduce((s, it) => s + (Number(it.cantidad) || 0) * (Number(it.precio_unitario) || 0), 0);

  const submit = async () => {
    const validos = items.filter(it => it.repuesto_nombre.trim());
    if (validos.length === 0) { toast({ title: "Agrega al menos un ítem", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const numero = `OC-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Date.now().toString().slice(-5)}`;
      const itemsFinal = validos.map(it => ({
        repuesto_nombre: it.repuesto_nombre,
        cantidad: Number(it.cantidad) || 1,
        precio_unitario: Number(it.precio_unitario) || 0,
        subtotal: (Number(it.cantidad) || 1) * (Number(it.precio_unitario) || 0),
      }));
      await base44.entities.OrdenDeCompra.create({
        numero_oc: numero,
        proveedor_nombre: proveedor,
        items: itemsFinal,
        total,
        estado: "emitida",
        fecha_emision: new Date().toISOString().split("T")[0],
        fecha_entrega_estimada: fechaEntrega || undefined,
        notas,
        creado_por_email: user?.email,
        creado_por_nombre: user?.full_name,
      });
      toast({ title: "Orden de compra emitida" });
      setProveedor(""); setFechaEntrega(""); setNotas(""); setItems([{ repuesto_nombre: "", cantidad: 1, precio_unitario: 0 }]);
      onGuardar();
      onClose();
    } catch (e) {
      toast({ title: "No se pudo crear", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const input = "w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-slate-50";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" style={{ background: "rgba(15,23,42,0.5)" }}>
      <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
          <h3 className="font-bold text-slate-800">Nueva Orden de Compra</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-500">Proveedor</label>
            <input className={input} value={proveedor} onChange={e => setProveedor(e.target.value)} placeholder="Nombre del proveedor" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">Fecha entrega estimada</label>
            <input type="date" className={input} value={fechaEntrega} onChange={e => setFechaEntrega(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">Ítems</label>
            <div className="space-y-2">
              {items.map((it, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input className={input + " flex-1"} value={it.repuesto_nombre} onChange={e => setItem(i, "repuesto_nombre", e.target.value)} placeholder="Repuesto" />
                  <input type="number" min="1" className={input + " w-16"} value={it.cantidad} onChange={e => setItem(i, "cantidad", e.target.value)} />
                  <input type="number" min="0" className={input + " w-24"} value={it.precio_unitario} onChange={e => setItem(i, "precio_unitario", e.target.value)} />
                  {items.length > 1 && (
                    <button onClick={() => delItem(i)} className="p-2 text-slate-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                  )}
                </div>
              ))}
            </div>
            <button onClick={addItem} className="mt-2 flex items-center gap-1 text-xs font-bold text-blue-600"><Plus className="w-3.5 h-3.5" /> Agregar ítem</button>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">Notas</label>
            <textarea rows={2} className={input} value={notas} onChange={e => setNotas(e.target.value)} />
          </div>
          <div className="flex justify-between items-center pt-2 border-t border-slate-100">
            <span className="text-sm font-bold text-slate-700">Total</span>
            <span className="text-lg font-bold text-blue-700">${total.toLocaleString("es-CL")}</span>
          </div>
        </div>
        <div className="px-5 py-4 border-t border-slate-100 flex gap-2 sticky bottom-0 bg-white">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100">Cancelar</button>
          <button onClick={submit} disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50 flex items-center justify-center gap-1.5" style={{ background: "#2563EB" }}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Emitir OC"}
          </button>
        </div>
      </div>
    </div>
  );
}