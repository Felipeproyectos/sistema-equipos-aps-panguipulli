import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { X, Package, FileText, Upload, Loader2, CheckCircle2 } from "lucide-react";

const CATEGORIAS = [
  { value: "neumaticos", label: "Neumáticos" },
  { value: "frenos", label: "Frenos" },
  { value: "bateria", label: "Batería" },
  { value: "filtros", label: "Filtros" },
  { value: "lubricantes", label: "Lubricantes" },
  { value: "electrico", label: "Eléctrico" },
  { value: "sirena", label: "Sirena" },
  { value: "luces", label: "Luces" },
  { value: "otros", label: "Otros" },
];

const emptyForm = {
  codigo: "", nombre: "", categoria: "otros", marca_modelo_compat: "",
  stock_actual: 0, stock_minimo: 0, precio_unitario: 0,
  proveedor_id: "", proveedor_nombre: "", ubicacion_bodega: "", notas: "",
  numero_factura: "", fecha_factura: "", factura_url: "",
  numero_orden_compra: "", fecha_orden_compra: "", orden_compra_url: "",
};

export default function RepuestoFormModal({ open, onClose, onGuardar, editando, proveedores }) {
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [uploadingFactura, setUploadingFactura] = useState(false);
  const [uploadingOC, setUploadingOC] = useState(false);

  useEffect(() => {
    if (editando) {
      setForm({ ...emptyForm, ...editando });
    } else {
      setForm(emptyForm);
    }
    setError("");
  }, [editando, open]);

  if (!open) return null;

  const handleProveedor = (id) => {
    const p = proveedores.find(x => x.id === id);
    setForm(f => ({ ...f, proveedor_id: id, proveedor_nombre: p?.nombre || "" }));
  };

  const subirDocumento = async (e, tipo) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (tipo === "factura") setUploadingFactura(true); else setUploadingOC(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      if (tipo === "factura") setForm(f => ({ ...f, factura_url: file_url }));
      else setForm(f => ({ ...f, orden_compra_url: file_url }));
    } catch (err) {
      setError("Error al subir documento: " + (err.message || ""));
    }
    if (tipo === "factura") setUploadingFactura(false); else setUploadingOC(false);
  };

  const handleSubmit = async () => {
    if (!form.nombre.trim()) { setError("El nombre es obligatorio."); return; }
    setSaving(true);
    try {
      const data = {
        ...form,
        stock_actual: Number(form.stock_actual) || 0,
        stock_minimo: Number(form.stock_minimo) || 0,
        precio_unitario: Number(form.precio_unitario) || 0,
      };
      if (editando) {
        await base44.entities.Repuesto.update(editando.id, data);
      } else {
        await base44.entities.Repuesto.create(data);
      }
      onGuardar();
      onClose();
    } catch (e) {
      setError(e.message || "Error al guardar");
    }
    setSaving(false);
  };

  const Field = ({ label, value, onChange, type = "text", ...props }) => (
    <div>
      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm" {...props} />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center" style={{ background: "rgba(15,23,42,0.5)" }}>
      <div className="bg-white w-full lg:max-w-lg rounded-t-3xl lg:rounded-3xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-white px-6 py-4 border-b border-slate-100 flex items-center justify-between z-10">
          <h2 className="font-bold text-slate-800 flex items-center gap-2">
            <Package className="w-5 h-5 text-blue-600" />
            {editando ? "Editar Repuesto" : "Nuevo Repuesto"}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Código" value={form.codigo} onChange={v => setForm(f => ({ ...f, codigo: v }))} placeholder="Ej: R-001" />
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Categoría</label>
              <select value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm">
                {CATEGORIAS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
          </div>
          <Field label="Nombre *" value={form.nombre} onChange={v => setForm(f => ({ ...f, nombre: v }))} placeholder="Repuesto descriptivo" />
          <Field label="Marca / Modelo Compatible" value={form.marca_modelo_compat} onChange={v => setForm(f => ({ ...f, marca_modelo_compat: v }))} placeholder="Ej: Toyota Hilux 2018" />
          <div className="grid grid-cols-3 gap-3">
            <Field label="Stock Actual" type="number" value={form.stock_actual} onChange={v => setForm(f => ({ ...f, stock_actual: v }))} />
            <Field label="Stock Mínimo" type="number" value={form.stock_minimo} onChange={v => setForm(f => ({ ...f, stock_minimo: v }))} />
            <Field label="Precio Unit." type="number" value={form.precio_unitario} onChange={v => setForm(f => ({ ...f, precio_unitario: v }))} />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Proveedor</label>
            <select value={form.proveedor_id} onChange={e => handleProveedor(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm">
              <option value="">Sin proveedor</option>
              {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>
          <Field label="Ubicación en Bodega" value={form.ubicacion_bodega} onChange={v => setForm(f => ({ ...f, ubicacion_bodega: v }))} placeholder="Ej: Estante A-3" />

          {/* Factura */}
          <div className="rounded-2xl p-3 space-y-2" style={{ background: "#F8FAFC", border: "1px solid #E2E8F0" }}>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" /> Factura
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="N° Factura" value={form.numero_factura} onChange={v => setForm(f => ({ ...f, numero_factura: v }))} placeholder="Folio" />
              <Field label="Fecha Factura" type="date" value={form.fecha_factura} onChange={v => setForm(f => ({ ...f, fecha_factura: v }))} />
            </div>
            <div className="flex items-center gap-2">
              <label className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold cursor-pointer transition-all"
                style={{ background: form.factura_url ? "#F0FDF4" : "white", color: form.factura_url ? "#16A34A" : "#64748B", border: `1px solid ${form.factura_url ? "#BBF7D0" : "#E2E8F0"}` }}>
                {uploadingFactura ? <Loader2 className="w-4 h-4 animate-spin" /> : form.factura_url ? <CheckCircle2 className="w-4 h-4" /> : <Upload className="w-4 h-4" />}
                {form.factura_url ? "Factura cargada" : "Subir factura PDF"}
                <input type="file" accept=".pdf,.png,.jpg,.jpeg" className="hidden" onChange={e => subirDocumento(e, "factura")} />
              </label>
              {form.factura_url && (
                <a href={form.factura_url} target="_blank" rel="noreferrer" className="text-xs font-bold text-blue-600 px-3 py-2.5 rounded-xl hover:bg-blue-50">Ver</a>
              )}
            </div>
          </div>

          {/* Orden de Compra */}
          <div className="rounded-2xl p-3 space-y-2" style={{ background: "#F8FAFC", border: "1px solid #E2E8F0" }}>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" /> Orden de Compra
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="N° Orden Compra" value={form.numero_orden_compra} onChange={v => setForm(f => ({ ...f, numero_orden_compra: v }))} placeholder="OC #" />
              <Field label="Fecha OC" type="date" value={form.fecha_orden_compra} onChange={v => setForm(f => ({ ...f, fecha_orden_compra: v }))} />
            </div>
            <div className="flex items-center gap-2">
              <label className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold cursor-pointer transition-all"
                style={{ background: form.orden_compra_url ? "#F0FDF4" : "white", color: form.orden_compra_url ? "#16A34A" : "#64748B", border: `1px solid ${form.orden_compra_url ? "#BBF7D0" : "#E2E8F0"}` }}>
                {uploadingOC ? <Loader2 className="w-4 h-4 animate-spin" /> : form.orden_compra_url ? <CheckCircle2 className="w-4 h-4" /> : <Upload className="w-4 h-4" />}
                {form.orden_compra_url ? "OC cargada" : "Subir orden de compra PDF"}
                <input type="file" accept=".pdf,.png,.jpg,.jpeg" className="hidden" onChange={e => subirDocumento(e, "oc")} />
              </label>
              {form.orden_compra_url && (
                <a href={form.orden_compra_url} target="_blank" rel="noreferrer" className="text-xs font-bold text-blue-600 px-3 py-2.5 rounded-xl hover:bg-blue-50">Ver</a>
              )}
            </div>
          </div>

          {error && <div className="text-xs text-red-600 font-semibold bg-red-50 rounded-xl px-3 py-2">{error}</div>}
        </div>

        <div className="sticky bottom-0 bg-white px-6 py-4 border-t border-slate-100 flex gap-2">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl text-sm font-bold bg-slate-100 text-slate-600">Cancelar</button>
          <button onClick={handleSubmit} disabled={saving}
            className="flex-1 py-3 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-50"
            style={{ background: "#2563EB" }}>
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}