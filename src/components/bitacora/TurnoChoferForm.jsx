import { useState } from "react";
import { invokePublic } from "@/lib/publicFetch";
import { Loader2, AlertTriangle } from "lucide-react";
import EquipoSelector from "./EquipoSelector";

export default function TurnoChoferForm({ equipos, loading, onSuccess, equipoFijo }) {
  const [form, setForm] = useState({
    equipo_id: equipoFijo?.id || "",
    conductor: "",
    fecha: new Date().toISOString().split("T")[0],
    km_inicial: "",
    observaciones: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const equipo = equipos.find(e => e.id === form.equipo_id);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.equipo_id || !form.conductor || !form.km_inicial) {
      setError("Por favor completa todos los campos obligatorios.");
      return;
    }
    setError("");
    setSaving(true);
    const equipoLabel = equipoFijo
      ? `${equipoFijo.marca} ${equipoFijo.modelo}${equipoFijo.patente ? ` — ${equipoFijo.patente}` : ""}`
      : form.equipo_id;

    try {
      await invokePublic("guardarInspeccionPendiente", {
        tipo_formulario: "turno_chofer",
        equipo_id: form.equipo_id,
        equipo_label: equipoLabel,
        conductor: form.conductor,
        fecha: form.fecha,
        km_inicial: Number(form.km_inicial),
        observaciones: form.observaciones || `KM Inicial: ${form.km_inicial}`,
      });
      setSaving(false);
      onSuccess("Registro de turno enviado para revisión.");
    } catch (err) {
      setSaving(false);
      setError(`Error al guardar: ${err?.message || "Intenta de nuevo."}`);
    }
  };

  const inputCls = "w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-slate-50";
  const labelCls = "block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-widest";

  return (
    <div className="bg-white rounded-3xl shadow-2xl p-6">
      <h2 className="text-lg font-bold text-slate-800 mb-5" style={{ fontFamily: "Manrope, sans-serif" }}>
        Registro de Turno Chofer
      </h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={labelCls}>Ambulancia *</label>
          {equipoFijo ? (
            <div className="p-3 rounded-xl" style={{ background: "#EFF6FF", border: "1px solid #BFDBFE" }}>
              <p className="text-sm font-semibold text-blue-900">{equipoFijo.marca} {equipoFijo.modelo}{equipoFijo.patente ? ` — ${equipoFijo.patente}` : ""}</p>
              <p className="text-xs text-blue-600 mt-0.5">{equipoFijo.centro_principal}{equipoFijo.subsede ? ` · ${equipoFijo.subsede}` : ""}</p>
            </div>
          ) : loading ? (
            <div className="flex items-center gap-2 text-sm text-slate-400 py-3">
              <Loader2 className="w-4 h-4 animate-spin" /> Cargando equipos...
            </div>
          ) : (
            <EquipoSelector
              equipos={equipos || []}
              value={form.equipo_id}
              onChange={id => setForm(f => ({ ...f, equipo_id: id }))}
              placeholder="Selecciona una ambulancia..."
            />
          )}
          {!equipoFijo && equipo && (
            <p className="text-xs text-blue-600 mt-1 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
              {equipo.centro_principal}{equipo.subsede ? ` · ${equipo.subsede}` : ""}
            </p>
          )}
        </div>

        <div>
          <label className={labelCls}>Nombre del Conductor *</label>
          <input required type="text" placeholder="Ej: Juan Pérez" value={form.conductor}
            onChange={e => setForm(f => ({ ...f, conductor: e.target.value }))}
            className={inputCls} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Fecha *</label>
            <input required type="date" value={form.fecha}
              onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))}
              className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>KM Inicial *</label>
            <input required type="number" min="0" placeholder="45230" value={form.km_inicial}
              onChange={e => setForm(f => ({ ...f, km_inicial: e.target.value }))}
              className={inputCls} />
          </div>
        </div>

        <div>
          <label className={labelCls}>Observaciones</label>
          <textarea rows={3} placeholder="Algún detalle adicional del turno..." value={form.observaciones}
            onChange={e => setForm(f => ({ ...f, observaciones: e.target.value }))}
            className={`${inputCls} resize-none`} />
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-xl text-sm"
            style={{ background: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA" }}>
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />{error}
          </div>
        )}

        <button type="submit" disabled={saving}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-bold text-white disabled:opacity-60"
          style={{ background: "linear-gradient(135deg, #1D4ED8, #2563EB)" }}>
          {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</> : "Registrar Turno"}
        </button>
      </form>
    </div>
  );
}