import { useState } from "react";
import { invokePublic } from "@/lib/publicFetch";
import { Loader2, AlertTriangle, ChevronDown, ChevronUp, Send
} from "lucide-react";
import EquipoSelector from "./EquipoSelector";

// Momento: "inicio" = Antes del Turno, "termino" = Después del Turno
const SECCIONES = [
  {
    id: "exterior",
    label: "1. Revisión Exterior",
    color: "#2563EB",
    items: [
      "Verificar presión y estado de neumáticos, neumático de repuesto",
      "Revisar luces (frontales, traseras, intermitentes, emergencia, freno)",
      "Inspeccionar carrocería (abolladuras, rayones, etc.)",
      "Verificar estado de ventanas y espejos externos e internos",
      "Verificar funcionamiento de baliza, radiotransmisor, antena y bocina",
    ],
  },
  {
    id: "interior",
    label: "2. Revisión Interior",
    color: "#7C3AED",
    items: [
      "Verificar nivel de combustible",
      "Revisar nivel de aceite, líquido de frenos, refrigerante y correas",
      "Comprobar estado de la batería",
      "Comprobar estado de los cinturones de seguridad",
      "Revisar estado de frenos mano y pedal",
    ],
  },
  {
    id: "equipos_medicos",
    label: "3. Equipos Médicos",
    color: "#059669",
    items: [
      "Verificar que los equipos estén asegurados y en buen estado",
      "Comprobar funcionamiento de sistemas de oxígeno",
      "Revisar estado de la camilla y sistemas de sujeción",
      "Comprobar la presencia del DEA",
    ],
  },
  {
    id: "accesorios",
    label: "4. Accesorios",
    color: "#D97706",
    items: [
      "Extintor",
      "Botiquín",
      "Gata, llaves de ruedas, cuñas y herramientas",
      "Triángulos de emergencias",
    ],
  },
  {
    id: "limpieza",
    label: "5. Limpieza Básica",
    color: "#0891B2",
    items: [
      "Limpiar superficies interiores (pisos, paneles, etc.)",
      "Desinfectar áreas de contacto frecuente",
      "Vaciar contenedores de basura y desechos médicos",
    ],
  },
  {
    id: "documentacion",
    label: "6. Documentación",
    color: "#DC2626",
    items: [
      "Seguro",
      "Revisión técnica",
      "Permiso de circulación",
    ],
  },
];

const ESTADOS = [
  { value: "", label: "Seleccionar *" },
  { value: "correcto", label: "✓ Correcto" },
  { value: "incorrecto", label: "✗ Incorrecto" },
];

function initChecklist() {
  const result = {};
  SECCIONES.forEach(sec => {
    sec.items.forEach(item => {
      result[`${sec.id}__${item}`] = { estado: "", obs: "" };
    });
  });
  return result;
}

function SeccionAccordion({ seccion, momento, checklist, onChange, expanded, onToggle }) {
  const itemKeys = seccion.items.map(i => `${seccion.id}__${i}`);
  const pendientes = itemKeys.filter(k => !checklist[k]?.estado).length;
  const incorrectos = itemKeys.filter(k => checklist[k]?.estado === "incorrecto").length;

  return (
    <div className="bg-white rounded-2xl overflow-hidden" style={{ border: "1px solid #E2E8F0" }}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-4"
        style={{ borderBottom: expanded ? "1px solid #E2E8F0" : "none" }}
      >
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: seccion.color }} />
          <div className="text-left">
            <p className="font-bold text-slate-800" style={{ fontFamily: "Manrope, sans-serif" }}>{seccion.label}</p>
            <p className="text-xs text-slate-400">
              {seccion.items.length} ítems
              {pendientes > 0 ? ` · ${pendientes} sin revisar` : incorrectos > 0 ? ` · ${incorrectos} incorrecto(s)` : " · Completo ✓"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {pendientes > 0 && (
            <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: "#FFF7ED", color: "#C2410C" }}>
              {pendientes} pend.
            </span>
          )}
          {pendientes === 0 && incorrectos > 0 && (
            <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: "#FEF2F2", color: "#DC2626" }}>
              {incorrectos} incorrecto{incorrectos > 1 ? "s" : ""}
            </span>
          )}
          {pendientes === 0 && incorrectos === 0 && (
            <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: "#F0FDF4", color: "#16A34A" }}>
              ✓ OK
            </span>
          )}
          {expanded ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
        </div>
      </button>

      {expanded && (
        <div className="divide-y divide-slate-50">
          {seccion.items.map(item => {
            const key = `${seccion.id}__${item}`;
            const estado = checklist[key]?.estado;
            return (
              <div key={key} className="px-5 py-3.5 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-slate-700 flex items-center gap-1.5" style={{ fontFamily: "Manrope, sans-serif" }}>
                    {!estado && <span className="w-1.5 h-1.5 rounded-full bg-orange-400 inline-block flex-shrink-0" />}
                    {item}
                  </span>
                  <select
                    value={estado}
                    onChange={e => onChange(key, "estado", e.target.value)}
                    className="text-xs font-bold rounded-xl px-3 py-2 border focus:outline-none focus:ring-2 focus:ring-blue-200 flex-shrink-0"
                    style={
                      !estado
                        ? { background: "#FFF7ED", color: "#C2410C", borderColor: "#FED7AA" }
                        : estado === "correcto"
                        ? { background: "#F0FDF4", color: "#16A34A", borderColor: "#BBF7D0" }
                        : { background: "#FEF2F2", color: "#DC2626", borderColor: "#FECACA" }
                    }
                  >
                    {ESTADOS.map(e => (
                      <option key={e.value} value={e.value} disabled={e.value === ""}>{e.label}</option>
                    ))}
                  </select>
                </div>
                {(estado === "incorrecto" || checklist[key]?.obs) && (
                  <textarea
                    rows={2}
                    placeholder="Observaciones (obligatorio si está incorrecto)..."
                    value={checklist[key]?.obs || ""}
                    onChange={e => onChange(key, "obs", e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-xl bg-slate-50 border border-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:bg-white transition-all resize-none"
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// momento: "inicio" | "termino"
export default function PautaDiariaAmbulancia({ equipoFijo, equipos = [], onSuccess, momento = "inicio" }) {
  const [equipoId, setEquipoId] = useState(equipoFijo?.id || "");
  const [conductor, setConductor] = useState("");
  const [fecha, setFecha] = useState(new Date().toISOString().split("T")[0]);
  const [observacionesGenerales, setObservacionesGenerales] = useState("");
  const [problemasDetectados, setProblemasDetectados] = useState("");
  const [accionesTomadas, setAccionesTomadas] = useState("");
  const [checklist, setChecklist] = useState(initChecklist());
  const [expanded, setExpanded] = useState({ exterior: true, interior: false, equipos_medicos: false, accesorios: false, limpieza: false, documentacion: false });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const momentoLabel = momento === "inicio" ? "Inicio de Turno" : "Término de Turno";
  const momentoColor = momento === "inicio" ? "#2563EB" : "#059669";
  const momentoGradient = momento === "inicio"
    ? "linear-gradient(135deg, #1A365D 0%, #2563EB 100%)"
    : "linear-gradient(135deg, #064E3B 0%, #059669 100%)";

  const handleChange = (key, field, value) => {
    setChecklist(prev => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
  };

  const equipoSeleccionado = equipoFijo || equipos.find(e => e.id === equipoId);

  const handleSubmit = async () => {
    if (!equipoSeleccionado && !equipoFijo) { setError("Selecciona una ambulancia."); return; }
    if (!conductor.trim()) { setError("Ingresa el nombre del responsable."); return; }
    const pendientes = Object.values(checklist).filter(v => !v.estado).length;
    if (pendientes > 0) { setError(`Faltan ${pendientes} ítems sin revisar.`); return; }
    const incConObs = Object.values(checklist).filter(v => v.estado === "incorrecto" && !v.obs?.trim());
    if (incConObs.length > 0) { setError(`${incConObs.length} ítem(s) incorrecto(s) requieren observación.`); return; }

    setError("");
    setSaving(true);

    try {
      const eq = equipoSeleccionado;
      const equipoLabel = eq
        ? `${eq.marca} ${eq.modelo}${eq.patente ? ` — ${eq.patente}` : ""}`
        : equipoId;

      const lineas = [];
      SECCIONES.forEach(sec => {
        const malos = sec.items.filter(item => checklist[`${sec.id}__${item}`]?.estado === "incorrecto");
        if (malos.length > 0) {
          lineas.push(`[${sec.label}] Incorrectos: ${malos.map(i => {
            const obs = checklist[`${sec.id}__${i}`]?.obs;
            return obs ? `${i} (${obs})` : i;
          }).join(", ")}`);
        }
      });
      if (problemasDetectados) lineas.push(`Problemas detectados: ${problemasDetectados}`);
      if (accionesTomadas) lineas.push(`Acciones tomadas: ${accionesTomadas}`);
      lineas.push(`Momento: ${momentoLabel}`);

      const hasFallas = Object.values(checklist).some(v => v.estado === "incorrecto");

      // Serializar el checklist por sección para mostrarlo en la revisión
      const checklistPorSeccion = {};
      SECCIONES.forEach(sec => {
        checklistPorSeccion[sec.id] = {};
        sec.items.forEach(item => {
          const key = `${sec.id}__${item}`;
          checklistPorSeccion[sec.id][item] = checklist[key];
        });
      });

      await invokePublic("guardarInspeccionPendiente", {
        tipo_formulario: "inspeccion_diaria",
        equipo_id: eq?.id || equipoId,
        equipo_label: equipoLabel,
        conductor,
        fecha,
        observaciones: lineas.join(" | "),
        momento,
        exterior: checklistPorSeccion.exterior,
        interior: checklistPorSeccion.interior,
        equipo_medico: checklistPorSeccion.equipos_medicos,
        accesorios_diaria: checklistPorSeccion.accesorios,
        saneamiento: checklistPorSeccion.limpieza,
        documentacion: checklistPorSeccion.documentacion,
        problemasDetectados,
        accionesTomadas,
      });

      setSaving(false);
      onSuccess && onSuccess({ hasFallas, conductor });
    } catch (err) {
      setSaving(false);
      setError("Error al guardar. Intenta nuevamente.");
    }
  };

  return (
    <div className="space-y-4" style={{ fontFamily: "Manrope, sans-serif" }}>
      {/* Header */}
      <div className="rounded-2xl p-5" style={{ background: momentoGradient }}>
        <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: "rgba(255,255,255,0.6)" }}>
          Pauta Diaria · Ambulancia
        </p>
        <h2 className="text-xl font-bold text-white mb-1">
          {momentoLabel}
        </h2>
        {equipoFijo && (
          <p className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.7)" }}>
            {equipoFijo.marca} {equipoFijo.modelo}{equipoFijo.patente ? ` — ${equipoFijo.patente}` : ""}
          </p>
        )}
      </div>

      {/* Datos básicos */}
      <div className="bg-white rounded-2xl p-5 space-y-4" style={{ border: "1px solid #E2E8F0" }}>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Datos del Responsable</p>

        {/* Selector de ambulancia si no viene fija */}
        {!equipoFijo && equipos.length > 0 && (
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Ambulancia *</label>
            <EquipoSelector
              equipos={equipos || []}
              value={equipoId}
              onChange={id => setEquipoId(id)}
              placeholder="Selecciona una ambulancia..."
            />
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Nombre del Responsable *</label>
            <input
              type="text"
              placeholder="Ej: Juan Pérez"
              value={conductor}
              onChange={e => setConductor(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Fecha *</label>
            <input
              type="date"
              value={fecha}
              onChange={e => setFecha(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
        </div>
      </div>

      {/* Secciones con acordeón */}
      {SECCIONES.map(sec => (
        <SeccionAccordion
          key={sec.id}
          seccion={sec}
          momento={momento}
          checklist={checklist}
          onChange={handleChange}
          expanded={expanded[sec.id]}
          onToggle={() => setExpanded(e => ({ ...e, [sec.id]: !e[sec.id] }))}
        />
      ))}

      {/* Observaciones generales */}
      <div className="bg-white rounded-2xl p-5 space-y-3" style={{ border: "1px solid #E2E8F0" }}>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">7. Observaciones Generales</p>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Problemas detectados</label>
          <textarea
            rows={2}
            placeholder="Describe problemas detectados durante la inspección..."
            value={problemasDetectados}
            onChange={e => setProblemasDetectados(e.target.value)}
            className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Acciones tomadas</label>
          <textarea
            rows={2}
            placeholder="Describe las acciones tomadas..."
            value={accionesTomadas}
            onChange={e => setAccionesTomadas(e.target.value)}
            className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
          />
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl text-sm" style={{ background: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA" }}>
          <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      <button
        type="button"
        disabled={saving}
        onClick={handleSubmit}
        className="w-full py-4 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2"
        style={{ background: momentoGradient }}
      >
        {saving
          ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</>
          : <><Send className="w-4 h-4" /> Enviar Inspección — {momentoLabel}</>
        }
      </button>
    </div>
  );
}