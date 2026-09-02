import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, Trash2 } from "lucide-react";
import { differenceInDays, parseISO, format } from "date-fns";

const TIPO_LABELS = { adulto: "Adulto", pediatrico: "Pediátrico", mixto: "Mixto" };
const TIPO_COLORS = { adulto: "#2563eb", pediatrico: "#9333ea", mixto: "#059669" };

export default function ParchesPanelV2({ equipo, parches, user, onUpdated }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ tipo: "adulto", cantidad: 1, lote: "", fecha_adquisicion: "", fecha_vencimiento: "" });
  const [saving, setSaving] = useState(false);
  const hoy = new Date();

  const handleAdd = async (e) => {
    e.preventDefault();
    setSaving(true);
    await base44.entities.Parche.create({ ...form, equipo_id: equipo.id, cantidad: Number(form.cantidad), activo: true });
    setSaving(false);
    setShowForm(false);
    onUpdated && onUpdated();
  };

  const handleDelete = async (id) => {
    if (!confirm("¿Eliminar este parche?")) return;
    await base44.entities.Parche.delete(id);
    onUpdated && onUpdated();
  };

  const getColor = (p) => {
    const dias = differenceInDays(parseISO(p.fecha_vencimiento), hoy);
    if (dias < 0) return { bg: "#fef2f2", border: "#fca5a5", text: "#dc2626", label: "Vencido" };
    if (dias <= 30) return { bg: "#fff7ed", border: "#fdba74", text: "#ea580c", label: `${dias}d` };
    if (dias <= 90) return { bg: "#fffbeb", border: "#fde68a", text: "#d97706", label: `${dias}d` };
    return { bg: "#f0fdf4", border: "#86efac", text: "#16a34a", label: `${dias}d` };
  };

  return (
    <div className="space-y-3">
      <button
        onClick={() => setShowForm(!showForm)}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white"
        style={{ background: "linear-gradient(135deg, #1565c0, #0288d1)" }}
      >
        <Plus className="w-4 h-4" /> Agregar Parche
      </button>

      {showForm && (
        <form onSubmit={handleAdd} className="bg-slate-50 rounded-xl p-4 space-y-3 border border-slate-100">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">Tipo *</label>
              <select required className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}>
                <option value="adulto">Adulto</option>
                <option value="pediatrico">Pediátrico</option>
                <option value="mixto">Mixto</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">Cantidad *</label>
              <input type="number" required min="1" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" value={form.cantidad} onChange={e => setForm(f => ({ ...f, cantidad: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">Vencimiento *</label>
              <input type="date" required className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" value={form.fecha_vencimiento} onChange={e => setForm(f => ({ ...f, fecha_vencimiento: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">Lote</label>
              <input className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" value={form.lote} onChange={e => setForm(f => ({ ...f, lote: e.target.value }))} />
            </div>
          </div>
          <button type="submit" disabled={saving} className="w-full py-2 rounded-xl text-sm font-semibold text-white" style={{ background: "#1565c0" }}>
            {saving ? "Guardando..." : "Agregar Parche"}
          </button>
        </form>
      )}

      {parches.length === 0 ? (
        <p className="text-center text-slate-400 py-8">No hay parches registrados</p>
      ) : (
        parches.map(p => {
          const c = getColor(p);
          return (
            <div key={p.id} className="flex items-center justify-between p-3 rounded-xl border" style={{ background: c.bg, borderColor: c.border }}>
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full" style={{ background: TIPO_COLORS[p.tipo] }} />
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    {TIPO_LABELS[p.tipo]} — {p.cantidad} ud{p.cantidad > 1 ? "s" : ""}
                    {p.lote && <span className="text-slate-400 font-normal"> · Lote {p.lote}</span>}
                  </p>
                  <p className="text-xs text-slate-500">Vence: {format(parseISO(p.fecha_vencimiento), "dd/MM/yyyy")}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold px-2 py-1 rounded-full" style={{ color: c.text, background: "white" }}>{c.label}</span>
                <button onClick={() => handleDelete(p.id)} className="text-slate-300 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}