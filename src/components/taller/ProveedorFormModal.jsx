import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { X, Building2 } from "lucide-react";

const RUBROS = [
  { value: "repuestos", label: "Repuestos" },
  { value: "neumaticos", label: "Neumáticos" },
  { value: "lubricantes", label: "Lubricantes" },
  { value: "servicio_tecnico", label: "Servicio Técnico" },
  { value: "otros", label: "Otros" },
];

export default function ProveedorFormModal({ open, onClose, onGuardar, editando }) {
  const [form, setForm] = useState({
    nombre: "", rut: "", rubro: "repuestos", contacto_nombre: "",
    telefono: "", email: "", direccion: "", ciudad: "", web: "", notas: "", activo: true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (editando) {
      setForm({
        nombre: editando.nombre || "", rut: editando.rut || "",
        rubro: editando.rubro || "repuestos", contacto_nombre: editando.contacto_nombre || "",
        telefono: editando.telefono || "", email: editando.email || "",
        direccion: editando.direccion || "", ciudad: editando.ciudad || "",
        web: editando.web || "", notas: editando.notas || "",
        activo: editando.activo !== false,
      });
    } else {
      setForm({ nombre: "", rut: "", rubro: "repuestos", contacto_nombre: "", telefono: "", email: "", direccion: "", ciudad: "", web: "", notas: "", activo: true });
    }
    setError("");
  }, [editando, open]);

  if (!open) return null;

  const handleSubmit = async () => {
    if (!form.nombre.trim()) { setError("El nombre es obligatorio."); return; }
    setSaving(true);
    try {
      if (editando) {
        await base44.entities.Proveedor.update(editando.id, form);
      } else {
        await base44.entities.Proveedor.create(form);
      }
      onGuardar();
      onClose();
    } catch (e) {
      setError(e.message || "Error al guardar");
    }
    setSaving(false);
  };

  const Field = ({ label, value, onChange, ...props }) => (
    <div>
      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)}
        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm"
        {...props} />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center" style={{ background: "rgba(15,23,42,0.5)" }}>
      <div className="bg-white w-full lg:max-w-lg rounded-t-3xl lg:rounded-3xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-bold text-slate-800 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-blue-600" />
            {editando ? "Editar Proveedor" : "Nuevo Proveedor"}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nombre *" value={form.nombre} onChange={v => setForm(f => ({ ...f, nombre: v }))} placeholder="Razón social" />
            <Field label="RUT" value={form.rut} onChange={v => setForm(f => ({ ...f, rut: v }))} placeholder="12.345.678-9" />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Rubro</label>
            <select value={form.rubro} onChange={e => setForm(f => ({ ...f, rubro: e.target.value }))}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm">
              {RUBROS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Contacto" value={form.contacto_nombre} onChange={v => setForm(f => ({ ...f, contacto_nombre: v }))} placeholder="Nombre" />
            <Field label="Teléfono" value={form.telefono} onChange={v => setForm(f => ({ ...f, telefono: v }))} placeholder="+56 9..." />
          </div>
          <Field label="Email" value={form.email} onChange={v => setForm(f => ({ ...f, email: v }))} placeholder="contacto@..." type="email" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Dirección" value={form.direccion} onChange={v => setForm(f => ({ ...f, direccion: v }))} placeholder="Calle #" />
            <Field label="Ciudad" value={form.ciudad} onChange={v => setForm(f => ({ ...f, ciudad: v }))} placeholder="Ciudad" />
          </div>
          <Field label="Sitio Web" value={form.web} onChange={v => setForm(f => ({ ...f, web: v }))} placeholder="www..." />
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Notas</label>
            <textarea rows={2} value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm resize-none" />
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