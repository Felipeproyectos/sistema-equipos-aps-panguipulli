import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { X, Loader2 } from "lucide-react";
import { TIPOS_ACTIVIDAD, CENTROS_ESTRUCTURA } from "@/lib/centros";

export default function ActividadForm({ equipo, user, onClose, onSaved }) {
  const [form, setForm] = useState({
    tipo: "inspeccion",
    fecha: new Date().toISOString().split("T")[0],
    observaciones: "",
    centro_destino: "",
    subsede_destino: ""
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const centroDestData = CENTROS_ESTRUCTURA.find(c => c.nombre === form.centro_destino);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const data = {
      ...form,
      equipo_id: equipo.id,
      usuario_email: user?.email || "",
      usuario_nombre: user?.full_name || user?.email || ""
    };
    // Si es traslado, actualizar el equipo
    if (form.tipo === "traslado" && form.centro_destino) {
      data.centro_origen = equipo.centro_principal;
      data.subsede_origen = equipo.subsede || "";
      await base44.entities.Equipo.update(equipo.id, {
        centro_principal: form.centro_destino,
        subsede: form.subsede_destino || ""
      });
    }
    await base44.entities.Actividad.create(data);
    // Si cambio de parches, cerrar alertas de parche relacionadas
    if (form.tipo === "cambio_parches") {
      const alertas = await base44.entities.Alerta.filter({ equipo_id: equipo.id, estado: "activa" }).catch(() => []);
      const parche_alertas = alertas.filter(a => a.tipo === "parche_vencido" || a.tipo === "parche_por_vencer");
      for (const a of parche_alertas) {
        await base44.entities.Alerta.update(a.id, { estado: "resuelta", fecha_resolucion: form.fecha });
      }
    }
    setSaving(false);
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md">
        <div className="px-7 pt-7 pb-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Registrar Actividad</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-slate-400" /></button>
        </div>
        <form onSubmit={handleSubmit} className="px-7 py-5 space-y-4">
          <p className="text-sm text-slate-500">Equipo: <span className="font-semibold text-slate-800">{equipo.marca} {equipo.modelo}</span></p>

          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Tipo de Actividad *</label>
            <select required className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" value={form.tipo} onChange={e => set("tipo", e.target.value)}>
              {TIPOS_ACTIVIDAD.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Fecha *</label>
            <input type="date" required className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" value={form.fecha} onChange={e => set("fecha", e.target.value)} />
          </div>

          {form.tipo === "traslado" && (
            <div className="space-y-3 bg-blue-50 rounded-xl p-4 border border-blue-100">
              <p className="text-xs font-semibold text-blue-700">Destino del Traslado</p>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">Centro Destino</label>
                <select className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white" value={form.centro_destino} onChange={e => { set("centro_destino", e.target.value); set("subsede_destino", ""); }}>
                  <option value="">Seleccionar...</option>
                  {CENTROS_ESTRUCTURA.map(c => <option key={c.nombre} value={c.nombre}>{c.nombre}</option>)}
                </select>
              </div>
              {centroDestData?.subsedes?.length > 0 && (
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">Subsede Destino</label>
                  <select className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white" value={form.subsede_destino} onChange={e => set("subsede_destino", e.target.value)}>
                    <option value="">Sin subsede</option>
                    {centroDestData.subsedes.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              )}
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Observaciones</label>
            <textarea rows={3} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" value={form.observaciones} onChange={e => set("observaciones", e.target.value)} />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-medium text-slate-600 border border-slate-200">Cancelar</button>
            <button type="submit" disabled={saving} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60" style={{ background: "linear-gradient(135deg, #1565c0, #0288d1)" }}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {saving ? "Guardando..." : "Registrar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}