import { useState } from "react";
import { invokePublic } from "@/lib/publicFetch";
import { Loader2, AlertTriangle, Send } from "lucide-react";
import EquipoSelector from "./EquipoSelector";

const ITEMS_CHECKLIST = [
  "Integridad carcaza",
  "Integridad pantalla",
  "Integridad accesorios",
  "Integridad botones y cables",
  "Se enciende/apaga correctamente",
  "Batería funcionando correctamente",
  "Sistema funcionando correctamente",
  "Saturómetro pediátrico funcionando correctamente",
  "Saturómetro adulto funcionando correctamente",
  "Presencia de manguito rojo",
  "Presenta alguna alarma o falla",
];

const ESTADOS = [
  { value: "ok", label: "OK" },
  { value: "malo", label: "MALO" },
  { value: "na", label: "N/A" },
];

function initChecklist() {
  return ITEMS_CHECKLIST.reduce((acc, item) => {
    acc[item] = "";
    return acc;
  }, {});
}

export default function PautaSemanalMultiparametros({ equipos, loading, onSuccess, equipoFijo }) {
  const [equipo_id, setEquipoId] = useState(equipoFijo?.id || "");
  const [responsable, setResponsable] = useState("");
  const [fecha, setFecha] = useState(new Date().toISOString().split("T")[0]);
  const [checklist, setChecklist] = useState(initChecklist());
  const [descripcion, setDescripcion] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const equipo = (equipos || []).find(e => e.id === equipo_id) || equipoFijo;

  const pendientes = ITEMS_CHECKLIST.filter(i => !checklist[i]).length;
  const malos = ITEMS_CHECKLIST.filter(i => checklist[i] === "malo");
  const hasFallas = malos.length > 0;

  const handleCheck = (item, value) => {
    setChecklist(prev => ({ ...prev, [item]: active => active === value ? "" : value }));
    setChecklist(prev => ({ ...prev, [item]: prev[item] === value ? "" : value }));
  };

  const handleSubmit = async () => {
    if (!equipo_id && !equipoFijo) { setError("Selecciona un equipo."); return; }
    if (!responsable.trim()) { setError("Ingresa el nombre del responsable."); return; }
    if (pendientes > 0) { setError(`Faltan ${pendientes} ítem(s) por revisar.`); return; }
    setError("");
    setSaving(true);

    const obsLines = [];
    if (malos.length > 0) obsLines.push(`Fallas: ${malos.join(", ")}`);
    if (descripcion.trim()) obsLines.push(`Descripción: ${descripcion.trim()}`);
    const observaciones = obsLines.join(" | ") || "Sin observaciones";

    const targetId = equipoFijo?.id || equipo_id;
    const equipoLabel = equipoFijo
      ? `${equipoFijo.marca} ${equipoFijo.modelo}`
      : equipo ? `${equipo.marca} ${equipo.modelo}` : targetId;

    try {
      await invokePublic("guardarInspeccionPendiente", {
        tipo_formulario: "inspeccion_semanal",
        equipo_id: targetId,
        equipo_label: equipoLabel,
        conductor: responsable,
        fecha,
        observaciones,
        checklist,
        descripcion,
      });
      setSaving(false);
      onSuccess && onSuccess({ hasFallas, conductor: responsable });
    } catch (err) {
      setSaving(false);
      setError(err?.message || "Error al guardar. Intenta de nuevo.");
    }
  };

  return (
    <div className="space-y-4" style={{ fontFamily: "Manrope, sans-serif" }}>
      {/* Header */}
      <div className="rounded-2xl p-5"
        style={{ background: "linear-gradient(135deg, #064E3B 0%, #059669 100%)" }}>
        <p className="text-xs font-bold text-emerald-200 uppercase tracking-widest mb-1">
          Check List Semanal · Monitor Multiparámetros
        </p>
        <h2 className="text-xl font-bold text-white">Equipo de Monitorización Multiparámetros</h2>
        <p className="text-emerald-200 text-sm mt-1">Inspección semanal de estado del equipo</p>
      </div>

      {/* Datos responsable */}
      <div className="bg-white rounded-2xl p-5 space-y-4" style={{ border: "1px solid #E2E8F0" }}>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Datos del Responsable</p>

        {equipoFijo ? (
          <div className="p-3 rounded-xl" style={{ background: "#F0FDF4", border: "1px solid #BBF7D0" }}>
            <p className="text-xs font-bold text-emerald-600 uppercase tracking-widest mb-0.5">Equipo</p>
            <p className="text-sm font-semibold text-emerald-900">
              {equipoFijo.marca} {equipoFijo.modelo}
              {equipoFijo.numero_serie && <span className="font-normal text-emerald-600"> · S/N: {equipoFijo.numero_serie}</span>}
            </p>
            <p className="text-xs text-emerald-600 mt-0.5">
              {equipoFijo.centro_principal}{equipoFijo.subsede ? ` · ${equipoFijo.subsede}` : ""}
            </p>
          </div>
        ) : loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-400 py-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Cargando equipos...
          </div>
        ) : (
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Equipo *</label>
            <EquipoSelector
              equipos={equipos || []}
              value={equipo_id}
              onChange={id => setEquipoId(id)}
              placeholder="Selecciona un equipo..."
            />
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Nombre del Responsable *</label>
          <input
            type="text"
            placeholder="Ej: María González"
            value={responsable}
            onChange={e => setResponsable(e.target.value)}
            className="w-full border border-slate-200 rounded-xl px-4 py-3.5 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-300"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Fecha *</label>
          <input
            type="date"
            value={fecha}
            onChange={e => setFecha(e.target.value)}
            className="w-full border border-slate-200 rounded-xl px-4 py-3.5 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-300"
          />
        </div>
      </div>

      {/* Checklist */}
      <div className="bg-white rounded-2xl overflow-hidden" style={{ border: "1px solid #E2E8F0" }}>
        {/* Cabecera tabla */}
        <div className="grid px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-widest"
          style={{ gridTemplateColumns: "1fr 60px 60px 60px", borderBottom: "1px solid #E2E8F0", background: "#F8FAFC" }}>
          <span>Check List Semanal</span>
          <span className="text-center">OK</span>
          <span className="text-center">MALO</span>
          <span className="text-center">N/A</span>
        </div>

        <div className="divide-y divide-slate-50">
          {ITEMS_CHECKLIST.map(item => {
            const val = checklist[item];
            const missing = !val;
            return (
              <div
                key={item}
                className="grid items-center px-4 py-3.5 gap-2"
                style={{
                  gridTemplateColumns: "1fr 60px 60px 60px",
                  background: val === "malo" ? "#FFF5F5" : "white"
                }}>
                <span className="text-sm text-slate-700 flex items-center gap-1.5">
                  {missing && <span className="w-1.5 h-1.5 rounded-full bg-orange-400 flex-shrink-0 inline-block" />}
                  {item}
                </span>
                {ESTADOS.map(({ value, label }) => {
                  const active = val === value;
                  const activeColor = value === "ok" ? "#16A34A" : value === "malo" ? "#DC2626" : "#94A3B8";
                  const activeBg = value === "ok" ? "#F0FDF4" : value === "malo" ? "#FEF2F2" : "#F8FAFC";
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setChecklist(prev => ({ ...prev, [item]: prev[item] === value ? "" : value }))}
                      className="flex items-center justify-center mx-auto rounded-lg transition-all"
                      style={{
                        width: 40, height: 34,
                        background: active ? activeBg : "#F8FAFC",
                        border: `2px solid ${active ? activeColor : "#E2E8F0"}`,
                        color: active ? activeColor : "#CBD5E1",
                        fontWeight: "bold",
                        fontSize: 11,
                      }}>
                      {active ? (value === "ok" ? "✓" : value === "malo" ? "✗" : "N/A") : label}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* Descripción breve */}
      <div className="bg-white rounded-2xl p-5" style={{ border: "1px solid #E2E8F0" }}>
        <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-widest">
          Descripción breve (observaciones)
        </label>
        <textarea
          rows={3}
          placeholder="Describe cualquier falla, alarma o situación observada..."
          value={descripcion}
          onChange={e => setDescripcion(e.target.value)}
          className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-300 resize-none"
        />
      </div>

      {/* Resumen fallas */}
      {hasFallas && (
        <div className="flex items-start gap-2 p-3 rounded-xl text-sm"
          style={{ background: "#FEF2F2", border: "1px solid #FECACA" }}>
          <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-red-700 text-xs mb-0.5">Ítems con falla:</p>
            <p className="text-xs text-red-600">{malos.join(", ")}</p>
          </div>
        </div>
      )}

      {pendientes > 0 && (
        <p className="text-xs text-center text-orange-500 font-semibold">
          {pendientes} ítem(s) sin revisar
        </p>
      )}

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl text-sm"
          style={{ background: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA" }}>
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />{error}
        </div>
      )}

      <button
        type="button"
        disabled={saving}
        onClick={handleSubmit}
        className="w-full py-4 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-60"
        style={{ background: "linear-gradient(135deg, #064E3B, #059669)" }}>
        {saving
          ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</>
          : <><Send className="w-4 h-4" /> Finalizar Inspección</>}
      </button>
    </div>
  );
}