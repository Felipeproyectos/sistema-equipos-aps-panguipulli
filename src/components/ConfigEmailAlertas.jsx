import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, Trash2, Mail, X, Loader2 } from "lucide-react";

export default function ConfigEmailAlertas() {
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ cesfam: "", email1: "", email2: "" });
  const [adding, setAdding] = useState(false);

  const load = async () => {
    const data = await base44.entities.ConfigAlerta.list().catch(() => []);
    setConfigs(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    if (!form.cesfam || !form.email1) return;
    setSaving(true);
    const emails = [form.email1.trim()];
    if (form.email2.trim()) emails.push(form.email2.trim());
    await base44.entities.ConfigAlerta.create({ cesfam: form.cesfam, emails });
    setForm({ cesfam: "", email1: "", email2: "" });
    setAdding(false);
    setSaving(false);
    load();
  };

  const handleDelete = async (id) => {
    await base44.entities.ConfigAlerta.delete(id);
    load();
  };

  const handleRemoveEmail = async (config, emailToRemove) => {
    const emails = config.emails.filter(e => e !== emailToRemove);
    await base44.entities.ConfigAlerta.update(config.id, { emails });
    load();
  };

  const inputCls = "border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 bg-slate-50 w-full";

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
      <div className="flex items-center justify-between mb-5">
        <h3 className="font-semibold text-slate-800 flex items-center gap-2">
          <Mail className="w-4 h-4 text-red-500" /> Correos para Alertas por CESFAM
        </h3>
        <button
          onClick={() => setAdding(!adding)}
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg text-white"
          style={{ background: "#e63946" }}
        >
          <Plus className="w-3.5 h-3.5" /> Agregar CESFAM
        </button>
      </div>

      {adding && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-5 space-y-3">
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Nombre del CESFAM *</label>
            <input className={inputCls} value={form.cesfam} onChange={e => setForm(f => ({ ...f, cesfam: e.target.value }))} placeholder="Ej: CESFAM Panguipulli" />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Correo 1 *</label>
            <input type="email" className={inputCls} value={form.email1} onChange={e => setForm(f => ({ ...f, email1: e.target.value }))} placeholder="correo1@ejemplo.com" />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Correo 2</label>
            <input type="email" className={inputCls} value={form.email2} onChange={e => setForm(f => ({ ...f, email2: e.target.value }))} placeholder="correo2@ejemplo.com (opcional)" />
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <button onClick={() => setAdding(false)} className="text-xs px-3 py-1.5 rounded-lg text-slate-500 hover:bg-slate-200 transition-colors">Cancelar</button>
            <button
              onClick={handleAdd}
              disabled={saving || !form.cesfam || !form.email1}
              className="text-xs px-4 py-1.5 rounded-lg text-white font-medium flex items-center gap-1 disabled:opacity-60"
              style={{ background: "#e63946" }}
            >
              {saving && <Loader2 className="w-3 h-3 animate-spin" />} Guardar
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
      ) : configs.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-6">No hay CESFAM configurados</p>
      ) : (
        <div className="space-y-3">
          {configs.map(c => (
            <div key={c.id} className="border border-slate-100 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-slate-800">{c.cesfam}</p>
                <button onClick={() => handleDelete(c.id)} className="text-slate-300 hover:text-red-500 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {c.emails?.map(email => (
                  <div key={email} className="flex items-center gap-1.5 bg-blue-50 text-blue-700 text-xs px-2.5 py-1 rounded-full">
                    <Mail className="w-3 h-3" />
                    {email}
                    <button onClick={() => handleRemoveEmail(c, email)} className="hover:text-red-500">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}