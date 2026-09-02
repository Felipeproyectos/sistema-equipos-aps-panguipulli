import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, X, Upload, Image as ImageIcon, ShoppingCart } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/lib/AuthContext";

export default function CompraDirectaModal({ ot, onClose, onGuardado }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [form, setForm] = useState({
    descripcion: "",
    cantidad: 1,
    precio_total: "",
    fecha_compra: new Date().toISOString().split("T")[0],
    proveedor_nombre: "",
  });
  const [boleta, setBoleta] = useState(null);
  const [foto, setFoto] = useState(null);
  const [boletaUrl, setBoletaUrl] = useState("");
  const [fotoUrl, setFotoUrl] = useState("");
  const [uploading, setUploading] = useState(null); // 'boleta' | 'foto' | null
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const uploadFile = async (file, kind) => {
    if (!file) return;
    setUploading(kind);
    try {
      const res = await base44.integrations.Core.UploadFile({ file });
      if (kind === "boleta") setBoletaUrl(res.file_url);
      else setFotoUrl(res.file_url);
      toast({ title: "Archivo subido", description: kind === "boleta" ? "Boleta/factura cargada." : "Foto del repuesto cargada." });
    } catch (e) {
      toast({ title: "Error al subir", description: e.message, variant: "destructive" });
    }
    setUploading(null);
  };

  const submit = async () => {
    if (!form.descripcion.trim()) {
      toast({ title: "Falta la descripción", variant: "destructive" });
      return;
    }
    if (!boletaUrl) {
      toast({ title: "Adjunta la boleta o factura", description: "Es obligatoria para el reembolso.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const items = ot.repuestos_utilizados || [];
      const nuevoItem = {
        tipo: "compra_directa",
        nombre: form.descripcion.trim(),
        descripcion: form.descripcion.trim(),
        cantidad: Number(form.cantidad) || 1,
        precio_total: Number(form.precio_total) || 0,
        subtotal: Number(form.precio_total) || 0,
        proveedor_nombre: form.proveedor_nombre || undefined,
        boleta_url: boletaUrl,
        foto_repuesto_url: fotoUrl || undefined,
        fecha_compra: form.fecha_compra,
        pagado_por_email: user?.email,
        pagado_por_nombre: user?.full_name,
        estado_reembolso: "pendiente",
      };
      await base44.entities.OrdenTrabajo.update(ot.id, { repuestos_utilizados: [...items, nuevoItem] });
      toast({ title: "Compra registrada", description: "Queda pendiente de reembolso con respaldo documental." });
      onGuardado?.();
      onClose();
    } catch (e) {
      toast({ title: "No se pudo guardar", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const input = "w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-slate-50";
  const busy = saving || uploading !== null;

  const UploadBox = ({ label, kind, file, url, setFile }) => (
    <div>
      <label className="text-xs font-semibold text-slate-500">{label}</label>
      <label className={`mt-1 flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${url ? "border-green-300 bg-green-50" : "border-slate-200 bg-slate-50 hover:border-orange-300"}`}
        style={{ minHeight: 88 }}>
        <input type="file" accept="image/*" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) { setFile(f); uploadFile(f, kind); } }} />
        {uploading === kind ? (
          <Loader2 className="w-5 h-5 text-orange-400 animate-spin" />
        ) : url ? (
          <>
            <ImageIcon className="w-5 h-5 text-green-500" />
            <span className="text-[11px] text-green-600 font-semibold">Adjuntado ✓</span>
          </>
        ) : (
          <>
            <Upload className="w-5 h-5 text-slate-400" />
            <span className="text-[11px] text-slate-400 font-medium">{file ? file.name : "Tocar para subir"}</span>
          </>
        )}
      </label>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" style={{ background: "rgba(15,23,42,0.5)" }}>
      <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "#FFEDD5" }}>
              <ShoppingCart className="w-4 h-4 text-orange-500" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-sm">Compra Directa</h3>
              <p className="text-[11px] text-slate-500">Repuesto pagado por ti · respaldo para reembolso</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-500">Descripción del repuesto *</label>
            <input className={input} value={form.descripcion} onChange={e => set("descripcion", e.target.value)} placeholder="Ej. Filtro de aceite Mahle OC-54" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500">Cantidad</label>
              <input type="number" min="1" className={input} value={form.cantidad} onChange={e => set("cantidad", e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-semibold text-slate-500">Precio total pagado ($)</label>
              <input type="number" min="0" className={input} value={form.precio_total} onChange={e => set("precio_total", e.target.value)} placeholder="0" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500">Fecha</label>
              <input type="date" className={input} value={form.fecha_compra} onChange={e => set("fecha_compra", e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">Proveedor (opcional)</label>
              <input className={input} value={form.proveedor_nombre} onChange={e => set("proveedor_nombre", e.target.value)} placeholder="Ej. Ferretería" />
            </div>
          </div>
          <UploadBox label="Boleta o factura *" kind="boleta" file={boleta} url={boletaUrl} setFile={setBoleta} />
          <UploadBox label="Foto del repuesto (opcional)" kind="foto" file={foto} url={fotoUrl} setFile={setFoto} />
        </div>
        <div className="px-5 py-4 border-t border-slate-100 flex gap-2 sticky bottom-0 bg-white">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100">Cancelar</button>
          <button onClick={submit} disabled={busy} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50 flex items-center justify-center gap-1.5" style={{ background: "#F97316" }}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShoppingCart className="w-4 h-4" />} Registrar Compra
          </button>
        </div>
      </div>
    </div>
  );
}