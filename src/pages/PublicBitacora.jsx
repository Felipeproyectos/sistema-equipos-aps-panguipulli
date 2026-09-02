import { useState, useEffect } from "react";
import { invokePublic } from "@/lib/publicFetch";
import {
  Car, CheckCircle, Loader2, AlertTriangle, ClipboardCheck,
  ChevronRight, ArrowLeft, Activity, Heart, Zap, ClipboardList
} from "lucide-react";
import PautaInspeccionSemanal from "@/components/bitacora/PautaInspeccionSemanal";
import PautaPlaceholder from "@/components/bitacora/PautaPlaceholder";
import TurnoChoferForm from "@/components/bitacora/TurnoChoferForm";
import PautaSemanalDesfibrilador from "@/components/bitacora/PautaSemanalDesfibrilador";
import PautaSemanalDEA from "@/components/bitacora/PautaSemanalDEA";
import PautaSemanalMultiparametros from "@/components/bitacora/PautaSemanalMultiparametros";
import PautaDiariaAmbulancia from "@/components/bitacora/PautaDiariaAmbulancia";

// Categorías principales
const CATEGORIAS = [
  {
    id: "turno_chofer",
    label: "Turno Chofer",
    descripcion: "Registro de inicio de turno con conductor y kilometraje",
    icon: Car,
    color: "#2563EB",
    bg: "#EFF6FF",
    pautas: null, // flujo directo sin sub-pautas
  },
  {
    id: "ambulancia",
    label: "Ambulancias",
    descripcion: "Pautas de inspección y mantenimiento para ambulancias",
    icon: Car,
    color: "#DC2626",
    bg: "#FEF2F2",
    pautas: [
      { id: "diaria", label: "Pauta Diaria", desc: "Revisión rápida diaria del vehículo", tipo_actividad: "inspeccion_rutinaria" },
      { id: "semanal", label: "Pauta Semanal", desc: "Inspección completa: luces, motor, accesorios y documentos", tipo_actividad: "inspeccion_semanal" },
    ],
  },
  {
    id: "monitor_desfibrilador",
    label: "Monitor Desfibrilador",
    descripcion: "Pautas para monitores desfibriladores",
    icon: Activity,
    color: "#7C3AED",
    bg: "#F5F3FF",
    pautas: [
      { id: "diaria", label: "Pauta Diaria", desc: "Revisión diaria del equipo", tipo_actividad: "inspeccion_rutinaria" },
      { id: "semanal", label: "Pauta Semanal", desc: "Inspección semanal completa", tipo_actividad: "inspeccion_semanal" },
    ],
  },
  {
    id: "monitor_multiparametros",
    label: "Monitor Multiparámetros",
    descripcion: "Pautas para monitores multiparámetros",
    icon: Heart,
    color: "#059669",
    bg: "#F0FDF4",
    pautas: [
      { id: "diaria", label: "Pauta Diaria", desc: "Revisión diaria del equipo", tipo_actividad: "inspeccion_rutinaria" },
      { id: "semanal", label: "Pauta Semanal", desc: "Inspección semanal completa", tipo_actividad: "inspeccion_semanal" },
    ],
  },
  {
    id: "dea",
    label: "DEA",
    descripcion: "Pautas para desfibriladores externos automáticos",
    icon: Zap,
    color: "#D97706",
    bg: "#FFFBEB",
    pautas: [
      { id: "diaria", label: "Pauta Diaria", desc: "Revisión diaria del equipo", tipo_actividad: "inspeccion_rutinaria" },
      { id: "semanal", label: "Pauta Semanal", desc: "Inspección semanal completa", tipo_actividad: "inspeccion_semanal" },
    ],
  },
];

export default function PublicBitacora() {
  const [equipos, setEquipos] = useState([]);
  const [loadingEquipos, setLoadingEquipos] = useState(true);

  // Navegación: null → categoria → pauta
  const [categoria, setCategoria] = useState(null);
  const [pauta, setPauta] = useState(null);

  const [momentoDiario, setMomentoDiario] = useState(null); // "inicio" | "termino"

  const [success, setSuccess] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    invokePublic("getPublicAmbulances", {})
      .then(data => {
        const lista = data?.equipos || [];
        setEquipos(lista);
        if (lista.length === 0) setError("No hay equipos registrados en el sistema.");
      })
      .catch((err) => setError(`No se pudieron cargar los equipos: ${err.message}`))
      .finally(() => setLoadingEquipos(false));
  }, []);

  const handleSuccess = (msg) => {
    setSuccessMsg(msg);
    setSuccess(true);
  };

  const resetAll = () => {
    setSuccess(false);
    setCategoria(null);
    setPauta(null);
    setMomentoDiario(null);
    setError("");
  };

  const categoriaObj = CATEGORIAS.find(c => c.id === categoria);
  const pautaObj = categoriaObj?.pautas?.find(p => p.id === pauta);

  // Filtrar equipos por tipo de categoría
  const equiposFiltrados = equipos.filter(eq => {
    if (!categoriaObj) return true;
    if (categoriaObj.id === "turno_chofer" || categoriaObj.id === "ambulancia") return eq.tipo === "ambulancia";
    if (categoriaObj.id === "monitor_desfibrilador") return eq.tipo === "monitor_desfibrilador";
    if (categoriaObj.id === "monitor_multiparametros") return eq.tipo === "monitor_multiparametros";
    if (categoriaObj.id === "dea") return eq.tipo === "dea";
    return true;
  });

  return (
    <div className="min-h-screen flex flex-col items-center px-4 py-8"
      style={{ background: "linear-gradient(135deg, #0f2d6b 0%, #1565c0 60%, #29b6f6 100%)" }}>
      <div className="w-full max-w-lg">

        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: "rgba(255,255,255,0.2)" }}>
            <ClipboardList className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white leading-tight" style={{ fontFamily: "Manrope, sans-serif" }}>
            Pautas y/o Formularios<br />de Equipo Gestión
          </h1>
          <p className="text-blue-200 mt-2 text-sm">Selecciona una categoría para continuar</p>
        </div>

        {/* Pantalla de éxito */}
        {success ? (
          <div className="bg-white rounded-3xl shadow-2xl p-8 text-center space-y-4">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto" style={{ background: "#DCFCE7" }}>
              <CheckCircle className="w-9 h-9 text-green-500" />
            </div>
            <h2 className="text-xl font-bold text-slate-800">¡Guardado exitosamente!</h2>
            <p className="text-slate-500 text-sm">{successMsg}</p>
            <button onClick={resetAll}
              className="w-full px-6 py-3 rounded-xl text-sm font-semibold text-white"
              style={{ background: "#2563EB" }}>
              Volver al inicio
            </button>
          </div>

        ) : !categoria ? (
          /* NIVEL 1: Categorías */
          <div className="space-y-3">
            {loadingEquipos && (
              <div className="flex items-center justify-center gap-2 py-3 text-white/70 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" /> Cargando equipos...
              </div>
            )}
            {CATEGORIAS.map((cat, idx) => {
              const Icon = cat.icon;
              return (
                <button key={cat.id} onClick={() => setCategoria(cat.id)}
                  className="w-full bg-white rounded-2xl shadow-lg p-5 text-left hover:shadow-xl transition-all flex items-center gap-4 active:scale-98">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
                    style={{ background: cat.bg }}>
                    <Icon className="w-6 h-6" style={{ color: cat.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold rounded-full px-2 py-0.5"
                        style={{ background: cat.bg, color: cat.color }}>
                        {idx + 1}
                      </span>
                      <p className="font-bold text-slate-800">{cat.label}</p>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5 leading-snug">{cat.descripcion}</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-300 flex-shrink-0" />
                </button>
              );
            })}
            {error && (
              <div className="flex items-center gap-2 p-3 rounded-xl text-sm"
                style={{ background: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA" }}>
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />{error}
              </div>
            )}
          </div>

        ) : categoriaObj?.pautas && !pauta ? (
          /* NIVEL 2: Sub-pautas de la categoría seleccionada */
          <div className="space-y-3">
            <button onClick={() => setCategoria(null)}
              className="flex items-center gap-1.5 text-sm text-white/70 hover:text-white mb-2 transition-colors">
              <ArrowLeft className="w-4 h-4" /> Volver
            </button>

            {/* Header categoría */}
            <div className="bg-white/10 rounded-2xl p-4 mb-2 flex items-center gap-3">
              {(() => { const Icon = categoriaObj.icon; return <Icon className="w-5 h-5 text-white" />; })()}
              <div>
                <p className="text-xs font-bold text-blue-200 uppercase tracking-widest">Categoría seleccionada</p>
                <p className="text-white font-bold">{categoriaObj.label}</p>
              </div>
            </div>

            {categoriaObj.pautas.map(p => (
              <button key={p.id} onClick={() => setPauta(p.id)}
                className="w-full bg-white rounded-2xl shadow-lg p-5 text-left hover:shadow-xl transition-all flex items-center gap-4">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: categoriaObj.bg }}>
                  <ClipboardCheck className="w-5 h-5" style={{ color: categoriaObj.color }} />
                </div>
                <div className="flex-1">
                  <p className="font-bold text-slate-800">{p.label}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{p.desc}</p>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-300 flex-shrink-0" />
              </button>
            ))}
          </div>

        ) : (
          /* NIVEL 3: Formulario de la pauta */
          <div>
            <button onClick={() => {
              if (momentoDiario) { setMomentoDiario(null); }
              else if (categoriaObj?.pautas) { setPauta(null); }
              else { setCategoria(null); }
            }}
              className="flex items-center gap-1.5 text-sm text-white/70 hover:text-white mb-4 transition-colors">
              <ArrowLeft className="w-4 h-4" /> Volver
            </button>

            {/* Turno Chofer */}
            {categoria === "turno_chofer" && (
              <TurnoChoferForm
                equipos={equiposFiltrados}
                loading={loadingEquipos}
                onSuccess={(msg) => handleSuccess(msg)}
              />
            )}

            {/* Ambulancia — Pauta Diaria: selector de momento */}
            {categoria === "ambulancia" && pauta === "diaria" && !momentoDiario && (
              <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
                <div className="px-6 py-5 border-b border-slate-100">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Pauta Diaria · Ambulancia</p>
                  <p className="font-bold text-slate-800 mt-0.5">¿Cuándo se realiza esta inspección?</p>
                </div>
                <div className="p-5 grid grid-cols-2 gap-3">
                  <button onClick={() => setMomentoDiario("inicio")}
                    className="flex flex-col items-center gap-3 p-5 rounded-2xl transition-all hover:shadow-md active:scale-95"
                    style={{ border: "1px solid #BFDBFE", background: "#EFF6FF" }}>
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: "#DBEAFE" }}>
                      <CheckCircle className="w-6 h-6 text-blue-600" />
                    </div>
                    <div className="text-center">
                      <p className="font-bold text-slate-800">Inicio de Turno</p>
                      <p className="text-xs text-slate-500 mt-0.5">Antes del turno</p>
                    </div>
                  </button>
                  <button onClick={() => setMomentoDiario("termino")}
                    className="flex flex-col items-center gap-3 p-5 rounded-2xl transition-all hover:shadow-md active:scale-95"
                    style={{ border: "1px solid #A7F3D0", background: "#ECFDF5" }}>
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: "#D1FAE5" }}>
                      <CheckCircle className="w-6 h-6 text-emerald-600" />
                    </div>
                    <div className="text-center">
                      <p className="font-bold text-slate-800">Término de Turno</p>
                      <p className="text-xs text-slate-500 mt-0.5">Después del turno</p>
                    </div>
                  </button>
                </div>
              </div>
            )}

            {/* Ambulancia — Pauta Diaria: formulario */}
            {categoria === "ambulancia" && pauta === "diaria" && momentoDiario && (
              <PautaDiariaAmbulancia
                equipos={equiposFiltrados}
                momento={momentoDiario}
                onSuccess={({ conductor }) =>
                  handleSuccess(`Pauta diaria (${momentoDiario === "inicio" ? "inicio" : "término"} de turno) registrada${conductor ? ` por ${conductor}` : ""}.`)
                }
              />
            )}

            {/* Ambulancia — Pauta Semanal */}
            {categoria === "ambulancia" && pauta === "semanal" && (
              <PautaInspeccionSemanal
                equipos={equiposFiltrados}
                onSuccess={({ hasFallas, conductor }) =>
                  handleSuccess(`Inspección semanal registrada para ${conductor}.${hasFallas ? " Se detectaron fallas." : " Vehículo en buen estado."}`)
                }
              />
            )}

            {/* Monitor Desfibrilador — Pauta Semanal */}
            {categoria === "monitor_desfibrilador" && pauta === "semanal" && (
              <PautaSemanalDesfibrilador
                equipos={equiposFiltrados}
                loading={loadingEquipos}
                onSuccess={({ hasFallas, conductor }) =>
                  handleSuccess(`Pauta semanal registrada por ${conductor}.${hasFallas ? " Se detectaron fallas." : " Equipo en buen estado."}`)
                }
              />
            )}

            {/* Monitor Multiparámetros — Pauta Semanal */}
            {categoria === "monitor_multiparametros" && pauta === "semanal" && (
              <PautaSemanalMultiparametros
                equipos={equiposFiltrados}
                loading={loadingEquipos}
                onSuccess={({ hasFallas, conductor }) =>
                  handleSuccess(`Pauta semanal registrada por ${conductor}.${hasFallas ? " Se detectaron fallas." : " Equipo en buen estado."}`)
                }
              />
            )}

            {/* DEA — Pauta Semanal */}
            {categoria === "dea" && pauta === "semanal" && (
              <PautaSemanalDEA
                equipos={equiposFiltrados}
                loading={loadingEquipos}
                onSuccess={({ hasFallas, conductor }) =>
                  handleSuccess(`Pauta quincenal DEA registrada por ${conductor}.${hasFallas ? " Se detectaron fallas." : " Equipo en buen estado."}`)
                }
              />
            )}

            {/* Cualquier otra combinación → Placeholder.
                Hoy solo cae acá la Pauta Diaria de los 3 equipos médicos: en 5
                meses no se registró ninguna (las 106 diarias son de ambulancia),
                así que o se les construye un formulario propio o se sacan. */}
            {!(categoria === "turno_chofer") &&
             !(categoria === "ambulancia" && pauta === "diaria") &&
             !(categoria === "ambulancia" && pauta === "semanal") &&
             !(categoria === "monitor_desfibrilador" && pauta === "semanal") &&
             !(categoria === "monitor_multiparametros" && pauta === "semanal") &&
             !(categoria === "dea" && pauta === "semanal") && (
              <PautaPlaceholder
                categoria={categoriaObj}
                pauta={pautaObj}
                equipos={equiposFiltrados}
                loading={loadingEquipos}
                onSuccess={(msg) => handleSuccess(msg)}
              />
            )}
          </div>
        )}

        <p className="text-center text-blue-200 text-xs mt-6 opacity-60 leading-relaxed px-4">
          Sistema elaborado por el Departamento de Informática de la<br />
          Corporación Municipal de Panguipulli
        </p>
      </div>
    </div>
  );
}