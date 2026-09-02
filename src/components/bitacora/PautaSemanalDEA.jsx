import { useState } from "react";
import { invokePublic } from "@/lib/publicFetch";
import { Loader2, AlertTriangle, Send, ChevronDown, ChevronUp } from "lucide-react";
import EquipoSelector from "./EquipoSelector";

const GRUPOS_CHECKLIST = [
  {
    label: "Inspección General y Accesibilidad",
    items: [
      "Presente en ubicación señalada",
      "Acceso expedito, libre de obstáculos",
      "Gabinete / vitrina en buen estado",
    ],
  },
  {
    label: "Estado Operativo",
    items: [
      "Indicador de estado en condición operativa",
      "Sin alarmas activas",
      "Equipo sin daños físicos visibles",
    ],
  },
  {
    label: "Batería / Pilas",
    items: [
      "Baterías/pilas instaladas correctamente",
      "Nivel de carga adecuado",
      "Fecha de vencimiento vigente (batería)",
    ],
  },
  {
    label: "Electrodos",
    items: [
      "Empaque sellado e íntegro",
      "Fecha de vencimiento vigente (electrodos)",
    ],
  },
];

const GRUPOS_PARCHES = [
  { key: "parches_adulto", label: "Parches Adulto" },
  { key: "parches_pediatrico", label: "Parches Pediátrico" },
  { key: "parches_mixto", label: "Parches Mixto" },
];

const ESTADOS = [
  { value: "ok", label: "OK" },
  { value: "malo", label: "MALO" },
  { value: "na", label: "N/A" },
];

const TODOS_ITEMS = GRUPOS_CHECKLIST.flatMap(g => g.items);

function initChecklist() {
  return TODOS_ITEMS.reduce((acc, item) => {
    acc[item] = { estado: "", obs: "", abierto: false };
    return acc;
  }, {});
}

function initParches() {
  return GRUPOS_PARCHES.reduce((acc, p) => {
    acc[p.key] = { estado: "", obs: "", cantidad: "", abierto: false };
    return acc;
  }, {});
}

export default function PautaSemanalDEA({ equipos, loading, onSuccess, equipoFijo }) {
  const [equipo_id, setEquipoId] = useState(equipoFijo?.id || "");
  const [responsable, setResponsable] = useState("");
  const [fecha, setFecha] = useState(new Date().toISOString().split("T")[0]);
  const [checklist, setChecklist] = useState(initChecklist());
  const [parches, setParches] = useState(initParches());
  const [descripcion, setDescripcion] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const equipo = (equipos || []).find(e => e.id === equipo_id) || equipoFijo;

  const pendientesChecklist = TODOS_ITEMS.filter(i => !checklist[i].estado).length;
  const pendientesParches = GRUPOS_PARCHES.filter(p => !parches[p.key].estado).length;
  const pendientes = pendientesChecklist + pendientesParches;

  const malosChecklist = TODOS_ITEMS.filter(i => checklist[i].estado === "malo");
  const malosParches = GRUPOS_PARCHES.filter(p => parches[p.key].estado === "malo").map(p => p.label);
  const hasFallas = malosChecklist.length > 0 || malosParches.length > 0;

  const handleCheck = (item, value) => {
    setChecklist(prev => ({
      ...prev,
      [item]: { ...prev[item], estado: prev[item].estado === value ? "" : value }
    }));
  };

  const handleObs = (item, obs) => {
    setChecklist(prev => ({ ...prev, [item]: { ...prev[item], obs } }));
  };

  const toggleItem = (item) => {
    setChecklist(prev => ({ ...prev, [item]: { ...prev[item], abierto: !prev[item].abierto } }));
  };

  const handleParcheCheck = (key, value) => {
    setParches(prev => ({
      ...prev,
      [key]: { ...prev[key], estado: prev[key].estado === value ? "" : value }
    }));
  };

  const handleParcheObs = (key, obs) => {
    setParches(prev => ({ ...prev, [key]: { ...prev[key], obs } }));
  };

  const handleParcheCantidad = (key, cantidad) => {
    setParches(prev => ({ ...prev, [key]: { ...prev[key], cantidad } }));
  };

  const toggleParche = (key) => {
    setParches(prev => ({ ...prev, [key]: { ...prev[key], abierto: !prev[key].abierto } }));
  };

  const handleSubmit = async () => {
    if (!equipo_id && !equipoFijo) { setError("Selecciona un equipo."); return; }
    if (!responsable.trim()) { setError("Ingresa el nombre del responsable."); return; }
    if (pendientes > 0) { setError(`Faltan ${pendientes} ítem(s) por revisar.`); return; }
    setError("");
    setSaving(true);

    const obsLines = [];
    if (malosChecklist.length > 0) obsLines.push(`Fallas checklist: ${malosChecklist.join(", ")}`);
    if (malosParches.length > 0) obsLines.push(`Fallas parches: ${malosParches.join(", ")}`);
    if (descripcion.trim()) obsLines.push(`Descripción: ${descripcion.trim()}`);
    const observaciones = obsLines.join(" | ") || "Sin observaciones";

    const targetId = equipoFijo?.id || equipo_id;
    const equipoLabel = equipoFijo
      ? `${equipoFijo.marca} ${equipoFijo.modelo}`
      : equipo ? `${equipo.marca} ${equipo.modelo}` : targetId;

    const checklistData = {};
    TODOS_ITEMS.forEach(i => { checklistData[i] = { estado: checklist[i].estado, obs: checklist[i].obs }; });

    const parchesData = {};
    GRUPOS_PARCHES.forEach(p => { parchesData[p.key] = { estado: parches[p.key].estado, obs: parches[p.key].obs }; });

    try {
      await invokePublic("guardarInspeccionPendiente", {
        tipo_formulario: "inspeccion_semanal",
        equipo_id: targetId,
        equipo_label: equipoLabel,
        conductor: responsable,
        fecha,
        observaciones,
        checklist: checklistData,
        parches: parchesData,
        descripcion,
      });
      setSaving(false);
      onSuccess && onSuccess({ hasFallas, conductor: responsable });
    } catch (err) {
      setSaving(false);
      setError(err?.message || "Error al guardar. Intenta de nuevo.");
    }
  };

  const activeColor = (v) => v === "ok" ? "#16A34A" : v === "malo" ? "#DC2626" : "#94A3B8";
  const activeBg = (v) => v === "ok" ? "#F0FDF4" : v === "malo" ? "#FEF2F2" : "#F8FAFC";

  const renderBotones = (val, onToggle) => (
    <div className="flex gap-1.5 flex-shrink-0">
      {ESTADOS.map(({ value, label }) => {
        const active = val === value;
        return (
          <button key={value} type="button" onClick={() => onToggle(value)}
            className="rounded-lg transition-all text-xs font-bold"
            style={{
              width: 44, height: 32,
              background: active ? activeBg(value) : "#F8FAFC",
              border: `2px solid ${active ? activeColor(value) : "#E2E8F0"}`,
              color: active ? activeColor(value) : "#CBD5E1",
            }}>
            {active ? (value === "ok" ? "✓" : value === "malo" ? "✗" : "N/A") : label}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-4" style={{ fontFamily: "Manrope, sans-serif" }}>
      {/* Header */}
      <div className="rounded-2xl p-5"
        style={{ background: "linear-gradient(135deg, #92400E 0%, #D97706 100%)" }}>
        <p className="text-xs font-bold text-amber-200 uppercase tracking-widest mb-1">
          Check List Quincenal · DEA
        </p>
        <h2 className="text-xl font-bold text-white">DEA (Desfibrilador Externo Automático)</h2>
        <p className="text-amber-200 text-sm mt-1">Inspección quincenal de estado del equipo</p>
      </div>

      {/* Datos responsable */}
      <div className="bg-white rounded-2xl p-5 space-y-4" style={{ border: "1px solid #E2E8F0" }}>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Datos del Responsable</p>

        {equipoFijo ? (
          <div className="p-3 rounded-xl" style={{ background: "#FFFBEB", border: "1px solid #FDE68A" }}>
            <p className="text-xs font-bold text-amber-500 uppercase tracking-widest mb-0.5">Equipo</p>
            <p className="text-sm font-semibold text-amber-900">
              {equipoFijo.marca} {equipoFijo.modelo}
              {equipoFijo.numero_serie && <span className="font-normal text-amber-700"> · S/N: {equipoFijo.numero_serie}</span>}
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
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
          <input type="text" placeholder="Ej: María González" value={responsable}
            onChange={e => setResponsable(e.target.value)}
            className="w-full border border-slate-200 rounded-xl px-4 py-3.5 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-amber-300" />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Fecha *</label>
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
            className="w-full border border-slate-200 rounded-xl px-4 py-3.5 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-amber-300" />
        </div>
      </div>

      {/* Checklist por grupos */}
      <div className="bg-white rounded-2xl overflow-hidden" style={{ border: "1px solid #E2E8F0" }}>
        <div className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-widest"
          style={{ borderBottom: "1px solid #E2E8F0", background: "#F8FAFC" }}>
          Check List Quincenal
        </div>

        {GRUPOS_CHECKLIST.map((grupo, gi) => (
          <div key={gi}>
            <div className="px-4 py-2 text-xs font-bold uppercase tracking-widest"
              style={{ background: "#FFFBEB", color: "#92400E", borderBottom: "1px solid #FDE68A", borderTop: gi > 0 ? "2px solid #FDE68A" : "none" }}>
              {grupo.label}
            </div>
            <div className="divide-y divide-slate-50">
              {grupo.items.map(item => {
                const val = checklist[item].estado;
                const obs = checklist[item].obs;
                const abierto = checklist[item].abierto;
                const missing = !val;
                return (
                  <div key={item} style={{ background: val === "malo" ? "#FFF5F5" : "white" }}>
                    <div className="flex items-center px-4 py-3 gap-2">
                      <span className="flex-1 text-sm text-slate-700 flex items-center gap-1.5">
                        {missing && <span className="w-1.5 h-1.5 rounded-full bg-orange-400 flex-shrink-0 inline-block" />}
                        {item}
                      </span>
                      {renderBotones(val, (v) => handleCheck(item, v))}
                      <button type="button" onClick={() => toggleItem(item)}
                        className="ml-1 text-slate-300 hover:text-slate-500 transition-colors">
                        {abierto ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>
                    {abierto && (
                      <div className="px-4 pb-3">
                        <textarea rows={2} placeholder="Observación (opcional)..."
                          value={obs} onChange={e => handleObs(item, e.target.value)}
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs bg-slate-50 focus:outline-none focus:ring-1 focus:ring-amber-300 resize-none" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Sección Electrodos y Parches — unificada */}
      <div className="bg-white rounded-2xl overflow-hidden" style={{ border: "1px solid #E2E8F0" }}>
        <div className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-widest"
          style={{ borderBottom: "1px solid #E2E8F0", background: "#F8FAFC" }}>
          Electrodos / Parches
        </div>
        <div className="divide-y divide-slate-50">
          {GRUPOS_PARCHES.map(p => {
            const val = parches[p.key].estado;
            const obs = parches[p.key].obs;
            const cantidad = parches[p.key].cantidad;
            const abierto = parches[p.key].abierto;
            const missing = !val;
            return (
              <div key={p.key} style={{ background: val === "malo" ? "#FFF5F5" : "white" }}>
                <div className="flex items-center px-4 py-3 gap-2">
                  <span className="flex-1 text-sm text-slate-700 flex items-center gap-1.5">
                    {missing && <span className="w-1.5 h-1.5 rounded-full bg-orange-400 flex-shrink-0 inline-block" />}
                    {p.label}
                  </span>
                  {renderBotones(val, (v) => handleParcheCheck(p.key, v))}
                  <button type="button" onClick={() => toggleParche(p.key)}
                    className="ml-1 text-slate-300 hover:text-slate-500 transition-colors">
                    {abierto ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>
                {abierto && (
                  <div className="px-4 pb-3 space-y-2">
                    <div>
                      <label className="text-xs font-semibold text-slate-500 mb-1 block">Cantidad disponible</label>
                      <input type="number" min="0" placeholder="Ej: 2"
                        value={cantidad} onChange={e => handleParcheCantidad(p.key, e.target.value)}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs bg-slate-50 focus:outline-none focus:ring-1 focus:ring-amber-300" />
                    </div>
                    <textarea rows={2} placeholder="Observación (opcional)..."
                      value={obs} onChange={e => handleParcheObs(p.key, e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs bg-slate-50 focus:outline-none focus:ring-1 focus:ring-amber-300 resize-none" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Observaciones generales */}
      <div className="bg-white rounded-2xl p-5" style={{ border: "1px solid #E2E8F0" }}>
        <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-widest">
          Observaciones generales
        </label>
        <textarea rows={3} placeholder="Describe cualquier falla, alarma o situación observada..."
          value={descripcion} onChange={e => setDescripcion(e.target.value)}
          className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-amber-300 resize-none" />
      </div>

      {/* Resumen fallas */}
      {hasFallas && (
        <div className="flex items-start gap-2 p-3 rounded-xl text-sm"
          style={{ background: "#FEF2F2", border: "1px solid #FECACA" }}>
          <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-red-700 text-xs mb-0.5">Ítems con falla:</p>
            <p className="text-xs text-red-600">{[...malosChecklist, ...malosParches].join(", ")}</p>
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

      <button type="button" disabled={saving} onClick={handleSubmit}
        className="w-full py-4 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-60"
        style={{ background: "linear-gradient(135deg, #92400E, #D97706)" }}>
        {saving
          ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</>
          : <><Send className="w-4 h-4" /> Finalizar Inspección</>}
      </button>
    </div>
  );
}