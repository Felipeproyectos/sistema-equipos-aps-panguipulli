import { useState, useRef } from "react";
import { invokePublic } from "@/lib/publicFetch";
import { base44 } from "@/api/base44Client";
import {
  CheckCircle, Loader2, AlertTriangle, ChevronDown, ChevronUp,
  Send, Fuel, Car, Zap, Wrench, Package, FileText, Camera, X
} from "lucide-react";
import EquipoSelector from "./EquipoSelector";

const NIVEL_COMBUSTIBLE = ["E", "1/4", "1/2", "3/4", "F"];

const ITEMS_LUCES = [
  "Luces Altas", "Luces Bajas", "Luces Retroceso", "Intermitentes",
  "Luces Patente", "Luces Freno", "Luces Emergencia", "Faenero", "Neblineros"
];
const ITEMS_MOTOR = [
  "Sonido Normal", "Correas", "Nivel Refrigerante",
  "Mangueras", "Nivel Aceite", "Nivel Líquido Dirección"
];
const ITEMS_ACCESORIOS = [
  "Baliza", "Camilla", "Cinturones", "Oxígeno", "Bocina",
  "Parabrisas", "Espejos", "Extintor", "Cuñas", "Sirena",
  "Radio Comunicación", "Kit Primeros Auxilios"
];
const ITEMS_DOCUMENTOS = [
  "Permiso de Circulación", "Revisión Técnica", "Seguro Obligatorio"
];

// Zonas del diagrama SVG con posiciones relativas para cada vista
const VIEWS = [
  {
    id: "lateral_izq",
    label: "Lateral Izquierdo",
    zones: [
      { id: "frontal_lat_izq", label: "Frontal", x: 8, y: 25, w: 18, h: 50 },
      { id: "puerta_delantera_izq", label: "Puerta Delantera", x: 28, y: 15, w: 22, h: 65 },
      { id: "puerta_trasera_izq", label: "Puerta Trasera", x: 52, y: 15, w: 22, h: 65 },
      { id: "trasera_lat_izq", label: "Trasera", x: 76, y: 25, w: 18, h: 50 },
      { id: "techo_izq", label: "Techo", x: 15, y: 5, w: 70, h: 12 },
      { id: "rueda_del_izq", label: "Rueda Del.", x: 20, y: 78, w: 15, h: 18 },
      { id: "rueda_tra_izq", label: "Rueda Tra.", x: 62, y: 78, w: 15, h: 18 },
    ]
  },
  {
    id: "lateral_der",
    label: "Lateral Derecho",
    zones: [
      { id: "frontal_lat_der", label: "Frontal", x: 8, y: 25, w: 18, h: 50 },
      { id: "puerta_delantera_der", label: "Puerta Delantera", x: 28, y: 15, w: 22, h: 65 },
      { id: "puerta_trasera_der", label: "Puerta Trasera", x: 52, y: 15, w: 22, h: 65 },
      { id: "trasera_lat_der", label: "Trasera", x: 76, y: 25, w: 18, h: 50 },
      { id: "techo_der", label: "Techo", x: 15, y: 5, w: 70, h: 12 },
      { id: "rueda_del_der", label: "Rueda Del.", x: 20, y: 78, w: 15, h: 18 },
      { id: "rueda_tra_der", label: "Rueda Tra.", x: 62, y: 78, w: 15, h: 18 },
    ]
  },
  {
    id: "frontal",
    label: "Vista Frontal",
    zones: [
      { id: "parabrisas_frontal", label: "Parabrisas", x: 20, y: 15, w: 60, h: 25 },
      { id: "capo", label: "Capó", x: 15, y: 42, w: 70, h: 20 },
      { id: "parachoque_frontal", label: "Parachoque", x: 15, y: 64, w: 70, h: 16 },
      { id: "faro_izq", label: "Faro Izq.", x: 5, y: 42, w: 12, h: 20 },
      { id: "faro_der", label: "Faro Der.", x: 83, y: 42, w: 12, h: 20 },
    ]
  },
  {
    id: "trasera",
    label: "Vista Trasera",
    zones: [
      { id: "puerta_trasera_doble", label: "Puertas Traseras", x: 15, y: 15, w: 70, h: 55 },
      { id: "parachoque_trasero", label: "Parachoque Trasero", x: 15, y: 72, w: 70, h: 15 },
      { id: "faro_trasero_izq", label: "Faro Tra. Izq.", x: 5, y: 20, w: 12, h: 25 },
      { id: "faro_trasero_der", label: "Faro Tra. Der.", x: 83, y: 20, w: 12, h: 25 },
    ]
  }
];

function initChecklist(items) {
  return items.reduce((acc, item) => {
    acc[item] = { estado: "", obs: "" };
    return acc;
  }, {});
}

function ChecklistSection({ title, icon: Icon, color, items, data, onChange, expanded, onToggle }) {
  const badCount = items.filter(i => data[i]?.estado === "malo").length;
  const pendingCount = items.filter(i => !data[i]?.estado).length;

  return (
    <div className="bg-white rounded-2xl overflow-hidden" style={{ border: "1px solid #E2E8F0", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
      <button type="button" onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-4"
        style={{ borderBottom: expanded ? "1px solid #E2E8F0" : "none" }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${color}18` }}>
            <Icon className="w-5 h-5" style={{ color }} />
          </div>
          <div className="text-left">
            <p className="font-bold text-slate-800" style={{ fontFamily: "Manrope, sans-serif" }}>{title}</p>
            <p className="text-xs text-slate-400">
              {items.length} ítems
              {pendingCount > 0 ? ` · ${pendingCount} sin revisar` : badCount > 0 ? ` · ${badCount} con falla` : " · Completo ✓"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {pendingCount > 0 && (
            <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: "#FFF7ED", color: "#C2410C" }}>
              {pendingCount} pend.
            </span>
          )}
          {pendingCount === 0 && badCount > 0 && (
            <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: "#FEF2F2", color: "#DC2626" }}>
              {badCount} malo{badCount > 1 ? "s" : ""}
            </span>
          )}
          {expanded ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
        </div>
      </button>

      {expanded && (
        <div className="divide-y divide-slate-50">
          {items.map(item => {
            const estado = data[item]?.estado;
            const missing = !estado;
            return (
              <div key={item} className="px-5 py-3.5 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-slate-700 flex items-center gap-1.5" style={{ fontFamily: "Manrope, sans-serif" }}>
                    {missing && <span className="w-1.5 h-1.5 rounded-full bg-orange-400 inline-block flex-shrink-0" />}
                    {item}
                  </span>
                  <select
                    value={estado}
                    onChange={e => onChange(item, "estado", e.target.value)}
                    className="text-xs font-bold rounded-xl px-3 py-2 border focus:outline-none focus:ring-2 focus:ring-blue-200 flex-shrink-0"
                    style={
                      !estado
                        ? { background: "#FFF7ED", color: "#C2410C", borderColor: "#FED7AA" }
                        : estado === "bueno"
                        ? { background: "#F0FDF4", color: "#16A34A", borderColor: "#BBF7D0" }
                        : { background: "#FEF2F2", color: "#DC2626", borderColor: "#FECACA" }
                    }>
                    <option value="" disabled>Seleccionar *</option>
                    <option value="bueno">✓ Bueno</option>
                    <option value="malo">✗ Malo</option>
                  </select>
                </div>
                <textarea
                  rows={2}
                  placeholder="Observaciones (obligatorio si está malo)..."
                  value={data[item]?.obs || ""}
                  onChange={e => onChange(item, "obs", e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-xl bg-slate-50 border border-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:bg-white transition-all resize-none"
                  style={{ fontFamily: "Manrope, sans-serif" }}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// SVG ambulancia por vista
function AmbulanceSVG({ view, danos, onZoneClick }) {
  const isLateral = view.id === "lateral_izq" || view.id === "lateral_der";
  const isFrontal = view.id === "frontal";

  return (
    <svg viewBox="0 0 100 100" className="w-full" style={{ maxHeight: 200 }}>
      {/* Carrocería principal */}
      {isLateral && <>
        <rect x="10" y="18" width="80" height="55" rx="3" fill="#F0F4FF" stroke="#1A365D" strokeWidth="1.5" />
        {/* Cabina */}
        <rect x="10" y="10" width="30" height="20" rx="2" fill="#E0E7FF" stroke="#1A365D" strokeWidth="1.2" />
        {/* Ventana cabina */}
        <rect x="13" y="12" width="24" height="12" rx="1" fill="#BAE6FD" stroke="#1A365D" strokeWidth="0.8" />
        {/* Ventanas traseras */}
        <rect x="43" y="20" width="20" height="15" rx="1" fill="#BAE6FD" stroke="#1A365D" strokeWidth="0.8" />
        <rect x="65" y="20" width="18" height="15" rx="1" fill="#BAE6FD" stroke="#1A365D" strokeWidth="0.8" />
        {/* Ruedas */}
        <circle cx="26" cy="76" r="8" fill="#334155" stroke="#1A365D" strokeWidth="1" />
        <circle cx="26" cy="76" r="4" fill="#64748B" />
        <circle cx="72" cy="76" r="8" fill="#334155" stroke="#1A365D" strokeWidth="1" />
        <circle cx="72" cy="76" r="4" fill="#64748B" />
        {/* Barra luces */}
        <rect x="15" y="7" width="70" height="5" rx="1" fill="#EF4444" stroke="#1A365D" strokeWidth="0.8" />
        {/* Cruz */}
        <rect x="52" y="28" width="12" height="4" rx="0.5" fill="#16A34A" />
        <rect x="55" y="25" width="4" height="10" rx="0.5" fill="#16A34A" />
        {/* Texto AMBULANCIA */}
        <text x="50" y="53" textAnchor="middle" fontSize="4" fill="#1A365D" fontWeight="bold" fontFamily="sans-serif">AMBULANCIA</text>
      </>}

      {isFrontal && <>
        <rect x="10" y="12" width="80" height="75" rx="3" fill="#F0F4FF" stroke="#1A365D" strokeWidth="1.5" />
        {/* Parabrisas */}
        <rect x="20" y="16" width="60" height="24" rx="2" fill="#BAE6FD" stroke="#1A365D" strokeWidth="1" />
        {/* Faros */}
        <rect x="10" y="38" width="14" height="16" rx="1" fill="#FEF9C3" stroke="#1A365D" strokeWidth="1" />
        <rect x="76" y="38" width="14" height="16" rx="1" fill="#FEF9C3" stroke="#1A365D" strokeWidth="1" />
        {/* Capó */}
        <rect x="15" y="42" width="70" height="22" rx="1" fill="#E0E7FF" stroke="#1A365D" strokeWidth="0.8" />
        {/* Parachoque */}
        <rect x="12" y="66" width="76" height="14" rx="2" fill="#CBD5E1" stroke="#1A365D" strokeWidth="1" />
        {/* Cruz */}
        <rect x="45" y="46" width="10" height="3" rx="0.5" fill="#16A34A" />
        <rect x="48" y="43" width="3" height="9" rx="0.5" fill="#16A34A" />
        {/* Barra luces */}
        <rect x="15" y="8" width="70" height="6" rx="1" fill="#EF4444" stroke="#1A365D" strokeWidth="0.8" />
      </>}

      {view.id === "trasera" && <>
        <rect x="10" y="12" width="80" height="75" rx="3" fill="#F0F4FF" stroke="#1A365D" strokeWidth="1.5" />
        {/* Puertas traseras */}
        <rect x="14" y="14" width="35" height="58" rx="1" fill="#E0E7FF" stroke="#1A365D" strokeWidth="1" />
        <rect x="51" y="14" width="35" height="58" rx="1" fill="#E0E7FF" stroke="#1A365D" strokeWidth="1" />
        {/* Ventanas */}
        <rect x="18" y="18" width="26" height="22" rx="1" fill="#BAE6FD" stroke="#1A365D" strokeWidth="0.8" />
        <rect x="56" y="18" width="26" height="22" rx="1" fill="#BAE6FD" stroke="#1A365D" strokeWidth="0.8" />
        {/* Faros traseros */}
        <rect x="10" y="20" width="6" height="24" rx="1" fill="#EF4444" stroke="#1A365D" strokeWidth="0.8" />
        <rect x="84" y="20" width="6" height="24" rx="1" fill="#EF4444" stroke="#1A365D" strokeWidth="0.8" />
        {/* Parachoque */}
        <rect x="12" y="74" width="76" height="12" rx="2" fill="#CBD5E1" stroke="#1A365D" strokeWidth="1" />
      </>}

      {/* Zonas clickeables */}
      {view.zones.map(z => {
        const active = danos[z.id]?.marcado;
        return (
          <rect
            key={z.id}
            x={z.x} y={z.y} width={z.w} height={z.h}
            rx="1"
            fill={active ? "rgba(239,68,68,0.35)" : "rgba(37,99,235,0)"}
            stroke={active ? "#EF4444" : "rgba(37,99,235,0.15)"}
            strokeWidth={active ? "1.5" : "1"}
            strokeDasharray={active ? "none" : "2,2"}
            className="cursor-pointer transition-all"
            onClick={() => onZoneClick(z)}
          />
        );
      })}
    </svg>
  );
}

function DamageModal({ zone, data, onSave, onClose }) {
  const fileRef = useRef();
  const [desc, setDesc] = useState(data?.descripcion || "");
  const [fotoUrl, setFotoUrl] = useState(data?.foto_url || "");
  const [uploading, setUploading] = useState(false);

  const handleFoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setFotoUrl(file_url);
    setUploading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }}>
      <div className="bg-white w-full max-w-md rounded-3xl p-6 space-y-4" style={{ boxShadow: "0 -8px 40px rgba(0,0,0,0.2)" }}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-red-500 uppercase tracking-widest">Zona Dañada</p>
            <p className="font-bold text-slate-800 text-lg">{zone.label}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-100 text-slate-400 hover:bg-slate-200">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-600 block mb-1.5">Descripción del daño *</label>
          <textarea
            rows={3}
            placeholder="Ej: Abolladura en puerta delantera, rayón profundo..."
            value={desc}
            onChange={e => setDesc(e.target.value)}
            className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-red-200 resize-none"
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-600 block mb-1.5">Foto del daño (opcional)</label>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFoto} />
          {fotoUrl ? (
            <div className="relative">
              <img src={fotoUrl} alt="daño" className="w-full h-32 object-cover rounded-xl" />
              <button onClick={() => setFotoUrl("")}
                className="absolute top-2 right-2 w-7 h-7 rounded-full bg-red-500 text-white flex items-center justify-center">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-semibold border-2 border-dashed border-slate-200 text-slate-500 hover:border-blue-300 hover:text-blue-500 transition-all">
              {uploading ? <><Loader2 className="w-4 h-4 animate-spin" /> Subiendo...</> : <><Camera className="w-4 h-4" /> Tomar / subir foto</>}
            </button>
          )}
        </div>

        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl text-sm font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50">
            Cancelar
          </button>
          <button
            disabled={!desc.trim()}
            onClick={() => onSave(zone.id, { marcado: true, descripcion: desc, foto_url: fotoUrl })}
            className="flex-1 py-3 rounded-xl text-sm font-bold text-white disabled:opacity-50"
            style={{ background: "#EF4444" }}>
            Marcar Daño
          </button>
        </div>
      </div>
    </div>
  );
}

// equipoFijo: si se pasa, se usa ese equipo directamente y no se muestra el selector
export default function PautaInspeccionSemanal({ equipos, onSuccess, equipoFijo }) {
  const [step, setStep] = useState(1);

  const [form, setForm] = useState({
    equipo_id: equipoFijo?.id || "",
    conductor: "",
    fecha: new Date().toISOString().split("T")[0],
    km_inicial: "",
    combustible: "1/2",
  });

  const [danos, setDanos] = useState({});  // { zoneId: { marcado, descripcion, foto_url } }
  const [activeView, setActiveView] = useState("lateral_izq");
  const [selectedZone, setSelectedZone] = useState(null);
  const [luces, setLuces] = useState(initChecklist(ITEMS_LUCES));
  const [motor, setMotor] = useState(initChecklist(ITEMS_MOTOR));
  const [accesorios, setAccesorios] = useState(initChecklist(ITEMS_ACCESORIOS));
  const [documentos, setDocumentos] = useState(initChecklist(ITEMS_DOCUMENTOS));
  const [expanded, setExpanded] = useState({ luces: true, motor: false, accesorios: false, documentos: false });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const totalItems = ITEMS_LUCES.length + ITEMS_MOTOR.length + ITEMS_ACCESORIOS.length + ITEMS_DOCUMENTOS.length;
  const doneItems = [luces, motor, accesorios, documentos].reduce((acc, cat) =>
    acc + Object.values(cat).filter(v => v.estado).length, 0);
  const progress = Math.round((step - 1) * 33);

  const equipo = equipos.find(e => e.id === form.equipo_id);

  const updateChecklist = (setter) => (item, field, value) => {
    setter(prev => ({ ...prev, [item]: { ...prev[item], [field]: value } }));
  };

  const buildObservaciones = () => {
    const lines = [];
    const cats = [
      { name: "LUCES", data: luces, items: ITEMS_LUCES },
      { name: "MOTOR", data: motor, items: ITEMS_MOTOR },
      { name: "ACCESORIOS", data: accesorios, items: ITEMS_ACCESORIOS },
      { name: "DOCUMENTOS", data: documentos, items: ITEMS_DOCUMENTOS },
    ];
    cats.forEach(({ name, data, items }) => {
      const malos = items.filter(i => data[i]?.estado === "malo");
      if (malos.length > 0) {
        lines.push(`[${name}] Fallas: ${malos.map(i => {
          const obs = data[i]?.obs;
          return obs ? `${i} (${obs})` : i;
        }).join(", ")}`);
      }
    });
    const allZones = VIEWS.flatMap(v => v.zones);
    const danosList = Object.entries(danos).filter(([, v]) => v?.marcado);
    if (danosList.length > 0) {
      lines.push(`Daños reportados: ${danosList.map(([k, v]) => {
        const zone = allZones.find(z => z.id === k);
        return `${zone?.label || k}: ${v.descripcion}`;
      }).join("; ")}`);
    }
    if (form.km_inicial) lines.push(`KM Inicial: ${form.km_inicial}`);
    lines.push(`Combustible: ${form.combustible}`);
    return lines.join(" | ");
  };

  const handleSubmit = async () => {
    const allItems = { ...luces, ...motor, ...accesorios, ...documentos };
    const pendientes = Object.values(allItems).filter(v => !v.estado).length;
    if (pendientes > 0) {
      setError(`Debes revisar todos los ítems. Faltan ${pendientes} sin estado.`);
      return;
    }
    setError("");
    setSaving(true);

    if (!form.equipo_id) {
      setSaving(false);
      setError("No se pudo identificar el equipo. Recarga e intenta de nuevo.");
      return;
    }

    try {
      const observaciones = buildObservaciones();
      const hasFallas = Object.values(allItems).some(v => v.estado === "malo");
      const equipoLabel = equipoFijo
        ? `${equipoFijo.marca} ${equipoFijo.modelo}${equipoFijo.patente ? ` — ${equipoFijo.patente}` : ""}`
        : form.equipo_id;

      // Guardar en InspeccionPendiente via backend (sin autenticación requerida)
      await invokePublic("guardarInspeccionPendiente", {
        tipo_formulario: "inspeccion_semanal",
        equipo_id: form.equipo_id,
        equipo_label: equipoLabel,
        conductor: form.conductor,
        fecha: form.fecha,
        km_inicial: form.km_inicial ? Number(form.km_inicial) : undefined,
        combustible: form.combustible,
        observaciones: observaciones || "",
        luces,
        motor,
        accesorios,
        documentos,
        danos,
      });

      setSaving(false);
      onSuccess && onSuccess({ hasFallas, conductor: form.conductor });
    } catch (err) {
      setSaving(false);
      console.error("Error pauta semanal:", err);
      const msg = err?.response?.data?.message || err?.message || "Error desconocido";
      setError(`Error al guardar: ${msg}`);
    }
  };

  return (
    <div className="space-y-4" style={{ fontFamily: "Manrope, sans-serif" }}>
      {/* Header con progreso */}
      <div className="bg-white rounded-2xl p-5" style={{ border: "1px solid #E2E8F0", background: "linear-gradient(135deg, #1A365D 0%, #2563EB 100%)" }}>
        <p className="text-xs font-bold text-blue-200 uppercase tracking-widest mb-1">Pauta Semanal · Ambulancia</p>
        <h2 className="text-xl font-bold text-white mb-3">Inspección de Vehículo</h2>
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2 rounded-full bg-white/20">
            <div className="h-2 rounded-full bg-white transition-all duration-500" style={{ width: `${progress + (step === 4 ? 100 : 0)}%` }} />
          </div>
          <span className="text-xs font-bold text-white/80">{step}/3</span>
        </div>
        <div className="flex gap-2 mt-3">
          {[
            { n: 1, label: "Datos" },
            { n: 2, label: "Daños" },
            { n: 3, label: "Revisión" }
          ].map(s => (
            <button key={s.n} type="button" onClick={() => s.n < step && setStep(s.n)}
              className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
              style={step === s.n
                ? { background: "white", color: "#1D4ED8" }
                : step > s.n
                ? { background: "rgba(255,255,255,0.3)", color: "white" }
                : { background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)" }
              }>
              {s.n}. {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* PASO 1: Datos básicos */}
      {step === 1 && (
        <div className="space-y-3">
          <div className="bg-white rounded-2xl p-5 space-y-4" style={{ border: "1px solid #E2E8F0" }}>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Datos del Conductor</p>

            {equipoFijo ? (
              <div className="p-3 rounded-xl" style={{ background: "#EFF6FF", border: "1px solid #BFDBFE" }}>
                <p className="text-xs font-bold text-blue-500 uppercase tracking-widest mb-0.5">Equipo</p>
                <p className="text-sm font-semibold text-blue-900">{equipoFijo.marca} {equipoFijo.modelo}{equipoFijo.patente ? ` — ${equipoFijo.patente}` : ""}</p>
                <p className="text-xs text-blue-600 mt-0.5">{equipoFijo.centro_principal}{equipoFijo.subsede ? ` · ${equipoFijo.subsede}` : ""}</p>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Ambulancia *</label>
                <EquipoSelector
                  equipos={equipos || []}
                  value={form.equipo_id}
                  onChange={id => setForm(f => ({ ...f, equipo_id: id }))}
                  placeholder="Selecciona una ambulancia..."
                />
                {equipo && (
                  <p className="text-xs text-blue-600 mt-1.5 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                    {equipo.centro_principal}{equipo.subsede ? ` · ${equipo.subsede}` : ""}
                  </p>
                )}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Nombre del Chofer *</label>
              <input
                required type="text" placeholder="Ej: Juan Pérez"
                value={form.conductor}
                onChange={e => setForm(f => ({ ...f, conductor: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl px-4 py-3.5 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-300" />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Fecha *</label>
              <input
                type="date" value={form.fecha}
                onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl px-4 py-3.5 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-300" />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">KM Inicial *</label>
              <input
                type="number" min="0" placeholder="45230"
                value={form.km_inicial}
                onChange={e => setForm(f => ({ ...f, km_inicial: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl px-4 py-3.5 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-300" />
              <p className="text-xs text-slate-400 mt-1">El KM final lo registrará el próximo conductor.</p>
            </div>
          </div>

          {/* Nivel combustible */}
          <div className="bg-white rounded-2xl p-5" style={{ border: "1px solid #E2E8F0" }}>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
              <Fuel className="w-4 h-4 text-amber-500" /> Nivel de Combustible
            </p>
            <div className="flex gap-2">
              {NIVEL_COMBUSTIBLE.map(n => (
                <button key={n} type="button"
                  onClick={() => setForm(f => ({ ...f, combustible: n }))}
                  className="flex-1 py-3 rounded-xl text-sm font-bold transition-all"
                  style={form.combustible === n
                    ? { background: "#F59E0B", color: "white", boxShadow: "0 2px 8px rgba(245,158,11,0.35)" }
                    : { background: "#F8FAFC", color: "#94A3B8", border: "1px solid #E2E8F0" }}>
                  {n}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl text-sm" style={{ background: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA" }}>
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />{error}
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              if (!form.equipo_id || !form.conductor || !form.km_inicial) {
                setError("Completa los campos obligatorios.");
                return;
              }
              setError("");
              setStep(2);
            }}
            className="w-full py-4 rounded-2xl text-sm font-bold text-white"
            style={{ background: "linear-gradient(135deg, #1A365D, #2563EB)" }}>
            Continuar →
          </button>
        </div>
      )}

      {/* PASO 2: Registro de daños */}
      {step === 2 && (
        <div className="space-y-3">
          <div className="bg-white rounded-2xl overflow-hidden" style={{ border: "1px solid #E2E8F0" }}>
            <div className="px-5 pt-5 pb-3">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-0.5 flex items-center gap-2">
                <Car className="w-4 h-4 text-blue-500" /> Registro de Daños Visuales
              </p>
              <p className="text-xs text-slate-400">Selecciona una vista y toca la zona dañada para registrar el daño</p>
            </div>

            {/* Selector de vistas */}
            <div className="flex gap-1.5 px-4 pb-3 overflow-x-auto">
              {VIEWS.map(v => {
                const hasDano = v.zones.some(z => danos[z.id]?.marcado);
                return (
                  <button key={v.id} type="button"
                    onClick={() => setActiveView(v.id)}
                    className="flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                    style={activeView === v.id
                      ? { background: "#1A365D", color: "white" }
                      : { background: "#F1F5F9", color: "#475569", border: "1px solid #E2E8F0" }}>
                    {hasDano && <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />}
                    {v.label}
                  </button>
                );
              })}
            </div>

            {/* Diagrama SVG interactivo */}
            <div className="px-4 pb-2" style={{ background: "#F8FAFC" }}>
              <div className="rounded-2xl p-3 relative" style={{ background: "white", border: "1px solid #E2E8F0" }}>
                <p className="text-xs text-slate-400 text-center mb-2 font-medium">
                  Toca las zonas punteadas para marcar daños
                </p>
                {VIEWS.filter(v => v.id === activeView).map(view => (
                  <AmbulanceSVG
                    key={view.id}
                    view={view}
                    danos={danos}
                    onZoneClick={(zone) => {
                      if (danos[zone.id]?.marcado) {
                        // Si ya está marcado, desmarcar
                        setDanos(prev => { const n = { ...prev }; delete n[zone.id]; return n; });
                      } else {
                        setSelectedZone(zone);
                      }
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Lista de daños marcados */}
            {Object.keys(danos).filter(k => danos[k]?.marcado).length > 0 && (
              <div className="px-4 pb-4 pt-2 space-y-2">
                <p className="text-xs font-bold text-red-500 uppercase tracking-widest flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Daños registrados ({Object.keys(danos).filter(k => danos[k]?.marcado).length})
                </p>
                {Object.entries(danos).filter(([, v]) => v?.marcado).map(([zoneId, data]) => {
                  const allZones = VIEWS.flatMap(v => v.zones);
                  const zone = allZones.find(z => z.id === zoneId);
                  return (
                    <div key={zoneId} className="flex items-start gap-3 p-3 rounded-xl" style={{ background: "#FEF2F2", border: "1px solid #FECACA" }}>
                      {data.foto_url && (
                        <img src={data.foto_url} alt="daño" className="w-12 h-12 object-cover rounded-lg flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-red-700">{zone?.label || zoneId}</p>
                        <p className="text-xs text-slate-600 mt-0.5">{data.descripcion}</p>
                      </div>
                      <button type="button"
                        onClick={() => setDanos(prev => { const n = { ...prev }; delete n[zoneId]; return n; })}
                        className="text-slate-400 hover:text-red-500 flex-shrink-0 mt-0.5">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {Object.keys(danos).filter(k => danos[k]?.marcado).length === 0 && (
              <div className="px-4 pb-4">
                <p className="text-xs text-green-600 font-medium flex items-center gap-1.5 p-3 rounded-xl" style={{ background: "#F0FDF4", border: "1px solid #BBF7D0" }}>
                  <CheckCircle className="w-3.5 h-3.5" /> Sin daños registrados en esta inspección
                </p>
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <button type="button" onClick={() => setStep(1)}
              className="px-5 py-4 rounded-2xl text-sm font-bold text-slate-600 hover:bg-slate-100 border border-slate-200">
              ← Atrás
            </button>
            <button type="button" onClick={() => setStep(3)}
              className="flex-1 py-4 rounded-2xl text-sm font-bold text-white"
              style={{ background: "linear-gradient(135deg, #1A365D, #2563EB)" }}>
              Continuar →
            </button>
          </div>
        </div>
      )}

      {/* Modal daño */}
      {selectedZone && (
        <DamageModal
          zone={selectedZone}
          data={danos[selectedZone.id]}
          onClose={() => setSelectedZone(null)}
          onSave={(zoneId, data) => {
            setDanos(prev => ({ ...prev, [zoneId]: data }));
            setSelectedZone(null);
          }}
        />
      )}

      {/* PASO 3: Checklists */}
      {step === 3 && (
        <div className="space-y-3">
          <ChecklistSection
            title="Luces" icon={Zap} color="#F59E0B"
            items={ITEMS_LUCES} data={luces}
            onChange={updateChecklist(setLuces)}
            expanded={expanded.luces}
            onToggle={() => setExpanded(e => ({ ...e, luces: !e.luces }))}
          />
          <ChecklistSection
            title="Motor" icon={Wrench} color="#2563EB"
            items={ITEMS_MOTOR} data={motor}
            onChange={updateChecklist(setMotor)}
            expanded={expanded.motor}
            onToggle={() => setExpanded(e => ({ ...e, motor: !e.motor }))}
          />
          <ChecklistSection
            title="Accesorios" icon={Package} color="#7C3AED"
            items={ITEMS_ACCESORIOS} data={accesorios}
            onChange={updateChecklist(setAccesorios)}
            expanded={expanded.accesorios}
            onToggle={() => setExpanded(e => ({ ...e, accesorios: !e.accesorios }))}
          />
          <ChecklistSection
            title="Documentos" icon={FileText} color="#059669"
            items={ITEMS_DOCUMENTOS} data={documentos}
            onChange={updateChecklist(setDocumentos)}
            expanded={expanded.documentos}
            onToggle={() => setExpanded(e => ({ ...e, documentos: !e.documentos }))}
          />

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl text-sm" style={{ background: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA" }}>
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />{error}
            </div>
          )}

          <div className="flex gap-3">
            <button type="button" onClick={() => setStep(2)}
              className="px-5 py-4 rounded-2xl text-sm font-bold text-slate-600 hover:bg-slate-100 border border-slate-200">
              ← Atrás
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={handleSubmit}
              className="flex-1 py-4 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2"
              style={{ background: "linear-gradient(135deg, #065F46, #059669)" }}>
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</> : <><Send className="w-4 h-4" /> Finalizar Inspección</>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}