import { useState } from "react";
import { invokePublic } from "@/lib/publicFetch";
import { Loader2, AlertTriangle, ClipboardCheck, Send } from "lucide-react";
import EquipoSelector from "./EquipoSelector";

/**
 * Formulario genérico para pautas aún no implementadas.
 * Guarda la inspección en Actividad + HistorialMantenimiento para sincronizar con mantenciones internas.
 */
export default function PautaPlaceholder({ categoria, pauta, equipos, loading, onSuccess, equipoFijo }) {
  const [equipo_id, setEquipoId] = useState(equipoFijo?.id || "");
  const [responsable, setResponsable] = useState("");
  const [fecha, setFecha] = useState(new Date().toISOString().split("T")[0]);
  const [resultado, setResultado] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const equipo = equipos.find(e => e.id === equipo_id);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!equipo_id || !responsable || !resultado) {
      setError("Completa todos los campos obligatorios.");
      return;
    }
    setError("");
    setSaving(true);

    await invokePublic("guardarInspeccionPendiente", {
      tipo_formulario: "inspeccion_semanal",
      equipo_id,
      equipo_label: equipo ? `${equipo.marca} ${equipo.modelo}` : equipo_id,
      conductor: responsable,
      fecha,
      observaciones: `[${pauta?.label || "Pauta"} - ${categoria?.label}] Resultado: ${resultado}. ${observaciones}`.trim(),
    });

    setSaving(false);
    onSuccess(`${pauta?.label} registrada correctamente para ${equipo?.marca || "equipo"} ${equipo?.modelo || ""}.`);
  };

  const inputCls = "w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-slate-50";
  const labelCls = "block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-widest";

  return (
    <div className="bg-white rounded-3xl shadow-2xl p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3 pb-3" style={{ borderBottom: "1px solid #F1F5F9" }}>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: categoria?.bg || "#EFF6FF" }}>
          <ClipboardCheck className="w-5 h-5" style={{ color: categoria?.color || "#2563EB" }} />
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-widest" style={{ color: categoria?.color || "#2563EB" }}>
            {categoria?.label}
          </p>
          <p className="font-bold text-slate-800">{pauta?.label}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={labelCls}>Equipo *</label>
          {equipoFijo ? (
            <div className="p-3 rounded-xl" style={{ background: "#EFF6FF", border: "1px solid #BFDBFE" }}>
              <p className="text-sm font-semibold text-blue-900">{equipoFijo.marca} {equipoFijo.modelo}{equipoFijo.patente ? ` — ${equipoFijo.patente}` : ""}{equipoFijo.numero_serie ? ` · S/N: ${equipoFijo.numero_serie}` : ""}</p>
              <p className="text-xs text-blue-600 mt-0.5">{equipoFijo.centro_principal}{equipoFijo.subsede ? ` · ${equipoFijo.subsede}` : ""}</p>
            </div>
          ) : loading ? (
            <div className="flex items-center gap-2 text-sm text-slate-400 py-3">
              <Loader2 className="w-4 h-4 animate-spin" /> Cargando equipos...
            </div>
          ) : (equipos || []).length === 0 ? (
            <p className="text-xs text-amber-600 py-2">No hay equipos de esta categoría disponibles.</p>
          ) : (
            <EquipoSelector
              equipos={equipos || []}
              value={equipo_id}
              onChange={id => setEquipoId(id)}
              placeholder="Selecciona un equipo..."
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
          <label className={labelCls}>Nombre del Responsable *</label>
          <input required type="text" placeholder="Ej: María González" value={responsable}
            onChange={e => setResponsable(e.target.value)} className={inputCls} />
        </div>

        <div>
          <label className={labelCls}>Fecha *</label>
          <input required type="date" value={fecha}
            onChange={e => setFecha(e.target.value)} className={inputCls} />
        </div>

        <div>
          <label className={labelCls}>Resultado *</label>
          <select required value={resultado} onChange={e => setResultado(e.target.value)} className={inputCls}
            style={!resultado ? {} : resultado === "aprobado"
              ? { borderColor: "#BBF7D0", background: "#F0FDF4", color: "#16A34A" }
              : resultado === "observaciones"
              ? { borderColor: "#FED7AA", background: "#FFFBEB", color: "#C2410C" }
              : { borderColor: "#FECACA", background: "#FEF2F2", color: "#DC2626" }}>
            <option value="">Seleccionar resultado *</option>
            <option value="aprobado">✓ Aprobado</option>
            <option value="observaciones">⚠ Aprobado con observaciones</option>
            <option value="rechazado">✗ Rechazado / Requiere mantención</option>
          </select>
        </div>

        <div>
          <label className={labelCls}>Observaciones</label>
          <textarea rows={3} placeholder="Detalle cualquier falla, observación o acción tomada..."
            value={observaciones} onChange={e => setObservaciones(e.target.value)}
            className={`${inputCls} resize-none`} />
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-xl text-sm"
            style={{ background: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA" }}>
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />{error}
          </div>
        )}

        <button type="submit" disabled={saving || equipos.length === 0}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-bold text-white disabled:opacity-60"
          style={{ background: `linear-gradient(135deg, ${categoria?.color || "#1D4ED8"}, ${categoria?.color || "#2563EB"}dd)` }}>
          {saving
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</>
            : <><Send className="w-4 h-4" /> Registrar {pauta?.label}</>}
        </button>
      </form>

      <p className="text-xs text-center text-slate-400">
        Este registro se sincroniza automáticamente con el historial de mantenciones internas del sistema.
      </p>
    </div>
  );
}