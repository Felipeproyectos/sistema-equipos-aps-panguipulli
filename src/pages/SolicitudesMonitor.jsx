import { useCallback, useEffect, useMemo, useState } from "react";
import { Inbox, Search, ChevronDown, X, Loader2, AlertTriangle, Clock, RefreshCw } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { getEffectiveNavRole } from "@/lib/roleSimulator";
import { esSolicitudDeFlota } from "@/lib/panelFlota";
import { avisarCambioEnPendientes } from "@/hooks/useContadoresMenu";
import { mensajeDeError } from "@/lib/mensajesDeError";
import FichaSolicitud, { EstadoBadge, PrioridadBadge, conDatosDelEquipo } from "@/components/solicitudes/FichaSolicitud";
import {
  CATEGORIAS, ESTADOS_CERRADOS, accionesPara, cambiosDeAccion, ordenarBandeja, rotulo,
} from "@/lib/solicitudesMonitor";

// La bandeja del Monitor Corporativo: las solicitudes de equipos vitales que
// le envían los Encargados de Salud de cada centro. Las toma, las resuelve,
// las devuelve si falta información, o las cierra si no proceden. Cada paso
// queda en la línea de tiempo, a su nombre (la base lo exige: ver
// migracion/31_solicitudes_monitor.sql).

const PESTANAS = [
  { clave: "por_atender", label: "Por atender", estados: ["derivada"] },
  { clave: "en_gestion", label: "En gestión", estados: ["en_proceso"] },
  { clave: "devueltas", label: "Devueltas al centro", estados: ["devuelta"] },
  { clave: "cerradas", label: "Cerradas", estados: ESTADOS_CERRADOS },
];

const sombra = { boxShadow: "0 4px 20px rgba(15,45,107,0.06)" };

export default function SolicitudesMonitor() {
  const { user } = useAuth();
  const role = getEffectiveNavRole(user?.role);
  const [solicitudes, setSolicitudes] = useState([]);
  const [equipos, setEquipos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState("");
  const [pestana, setPestana] = useState("por_atender");
  const [centro, setCentro] = useState("todos");
  const [categoria, setCategoria] = useState("todas");
  const [busqueda, setBusqueda] = useState("");
  const [abierta, setAbierta] = useState(null);
  const [accion, setAccion] = useState(null);
  const [ocupado, setOcupado] = useState(null);

  const cargar = useCallback(async () => {
    setErrorCarga("");
    try {
      const [sol, eq] = await Promise.all([
        base44.entities.Solicitud.list("-created_date", 1000),
        base44.entities.Equipo.list("-updated_date", 1000).catch(() => []),
      ]);
      setSolicitudes(sol);
      setEquipos(eq);
    } catch (e) {
      setErrorCarga(mensajeDeError(e, "cargar las solicitudes"));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const porId = useMemo(() => new Map(equipos.map(e => [e.id, e])), [equipos]);

  // Solo lo que le llegó: lo enviado alguna vez por un centro, nunca vehículos.
  const delMonitor = useMemo(() => solicitudes.filter(s =>
    !esSolicitudDeFlota(s, porId.get(s.equipo_id))
    && (s.fecha_derivacion || ["derivada", "en_proceso", "devuelta", "rechazada"].includes(s.estado))),
  [solicitudes, porId]);

  const centros = useMemo(() => [...new Set(delMonitor.map(s => s.centro).filter(Boolean))].sort(), [delMonitor]);
  const cuenta = (estados) => delMonitor.filter(s => estados.includes(s.estado)).length;
  const urgentes = delMonitor.filter(s => ["derivada", "en_proceso"].includes(s.estado)
    && (s.prioridad === "critica" || s.operatividad === "fuera_de_servicio")).length;

  const lista = useMemo(() => {
    const p = PESTANAS.find(x => x.clave === pestana);
    const q = busqueda.trim().toLowerCase();
    const filtradas = delMonitor.filter(s => {
      if (!p.estados.includes(s.estado)) return false;
      if (centro !== "todos" && s.centro !== centro) return false;
      if (categoria !== "todas" && s.categoria !== categoria) return false;
      if (!q) return true;
      const c = conDatosDelEquipo(s, porId.get(s.equipo_id));
      return [c.numero_solicitud, c.equipo_marca, c.equipo_modelo, c.equipo_numero_serie, c.equipo_numero_inventario,
        c.centro, c.subsede, c.ubicacion_especifica, c.usuario_nombre, c.descripcion, c.insumo_nombre]
        .some(v => String(v || "").toLowerCase().includes(q));
    });
    return pestana === "cerradas"
      ? filtradas.sort((a, b) => String(b.fecha_resolucion || b.updated_date || "").localeCompare(String(a.fecha_resolucion || a.updated_date || "")))
      : ordenarBandeja(filtradas);
  }, [delMonitor, pestana, centro, categoria, busqueda, porId]);

  const aplicar = async (s, acc, nota = "") => {
    setOcupado(s.id);
    try {
      await base44.entities.Solicitud.update(s.id, cambiosDeAccion(acc, s, user, nota));
      setAccion(null);
      await cargar();
      avisarCambioEnPendientes();
      return true;
    } catch {
      // El motivo ya lo mostró base44Client.
      return false;
    } finally {
      setOcupado(null);
    }
  };

  if (cargando) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen" style={{ background: "#f8fafc" }}>
      <div className="px-4 lg:px-10 pt-6 lg:pt-10 pb-6 lg:pb-8" style={{ background: "linear-gradient(135deg, #4F46E5 0%, #312E81 100%)" }}>
        <div className="max-w-6xl mx-auto flex items-center gap-3 flex-wrap">
          <div className="w-11 h-11 lg:w-12 lg:h-12 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(255,255,255,0.18)" }}>
            <Inbox className="w-6 h-6 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl lg:text-3xl font-bold text-white leading-tight">Solicitudes de los centros</h1>
            <p className="text-indigo-100 text-xs lg:text-sm mt-0.5">Mantenimiento, compra de insumos y desperfectos de los equipos vitales</p>
          </div>
          <button type="button" onClick={() => { setCargando(true); cargar(); }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: "rgba(255,255,255,0.18)" }}>
            <RefreshCw className="w-4 h-4" /> Actualizar
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 lg:px-10 mt-5 pb-10 space-y-5">
        {errorCarga && (
          <p className="rounded-2xl px-4 py-3 bg-red-50 border border-red-200 text-sm text-red-700">{errorCarga}</p>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { valor: cuenta(["derivada"]), etiqueta: "por atender", malo: cuenta(["derivada"]) > 0 },
            { valor: cuenta(["en_proceso"]), etiqueta: "en gestión" },
            { valor: urgentes, etiqueta: "críticas o con equipo fuera de servicio", malo: urgentes > 0 },
            { valor: cuenta(["devuelta"]), etiqueta: "devueltas, esperan al centro" },
          ].map((k, i) => (
            <div key={i} className="bg-white rounded-2xl p-4" style={sombra}>
              <p className={`text-2xl lg:text-3xl font-bold ${k.malo ? "text-red-600" : "text-slate-800"}`}>{k.valor}</p>
              <p className="text-xs text-slate-600 font-medium leading-tight mt-0.5">{k.etiqueta}</p>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl p-4 space-y-3" style={sombra}>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {PESTANAS.map(p => (
              <button key={p.clave} type="button" onClick={() => setPestana(p.clave)} aria-pressed={pestana === p.clave}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap flex-shrink-0"
                style={pestana === p.clave ? { background: "#4F46E5", color: "white" } : { background: "white", color: "#64748b", border: "1px solid #e2e8f0" }}>
                {p.label} ({cuenta(p.estados)})
              </button>
            ))}
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
                placeholder="N°, equipo, serie, inventario, ubicación, solicitante..."
                className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-sm" />
            </div>
            <select value={centro} onChange={e => setCentro(e.target.value)} className="bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm">
              <option value="todos">Todos los centros</option>
              {centros.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={categoria} onChange={e => setCategoria(e.target.value)} className="bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm">
              <option value="todas">Todos los tipos</option>
              {CATEGORIAS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
        </div>

        {lista.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl text-slate-400" style={sombra}>
            <Inbox className="w-10 h-10 mx-auto mb-3 opacity-20" />
            <p>No hay solicitudes en esta bandeja.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {lista.map(s => {
              const eq = porId.get(s.equipo_id);
              const c = conDatosDelEquipo(s, eq);
              const expandida = abierta === s.id;
              const acciones = accionesPara(role, s);
              return (
                <div key={s.id} className="bg-white rounded-2xl border" style={{ ...sombra, borderColor: s._atrasada ? "#fecaca" : "#f1f5f9" }}>
                  <button type="button" onClick={() => setAbierta(expandida ? null : s.id)} aria-expanded={expandida}
                    className="w-full text-left p-4 flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-xs font-bold text-slate-400">{s.numero_solicitud || "Sin N°"}</span>
                        <EstadoBadge estado={s.estado} />
                        <PrioridadBadge prioridad={s.prioridad} />
                        <span className="text-xs font-semibold text-slate-600">{rotulo(CATEGORIAS, s.categoria) || "Sin tipo"}</span>
                        {s.operatividad === "fuera_de_servicio" && (
                          <span className="flex items-center gap-1 text-xs font-bold text-red-600"><AlertTriangle className="w-3.5 h-3.5" /> Fuera de servicio</span>
                        )}
                      </div>
                      <p className="font-semibold text-slate-900 text-sm">
                        {[c.equipo_marca, c.equipo_modelo].filter(Boolean).join(" ") || "Equipo"}
                        {c.equipo_numero_serie && <span className="text-slate-400 font-normal"> · S/N {c.equipo_numero_serie}</span>}
                        {s.insumo_nombre && <span className="text-slate-500 font-normal"> · {s.insumo_nombre} × {s.insumo_cantidad || 1}</span>}
                      </p>
                      <p className="text-xs text-slate-500 truncate">{[c.centro, c.subsede, c.ubicacion_especifica].filter(Boolean).join(" · ")}</p>
                      <p className="text-xs text-slate-400 truncate">Solicita {[s.usuario_nombre, s.solicitante_cargo].filter(Boolean).join(", ")}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      {!ESTADOS_CERRADOS.includes(s.estado) && s._dias !== undefined && (
                        <span className={`flex items-center gap-1 text-[11px] font-semibold ${s._atrasada ? "text-red-600" : "text-slate-400"}`}>
                          <Clock className="w-3 h-3" /> {s._dias} d
                        </span>
                      )}
                      <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${expandida ? "rotate-180" : ""}`} />
                    </div>
                  </button>

                  {expandida && (
                    <div className="px-4 pb-4 space-y-3">
                      <FichaSolicitud solicitud={s} equipo={eq} />
                      {acciones.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
                          {acciones.map(a => (
                            <button key={a.clave} type="button" disabled={ocupado === s.id}
                              onClick={() => (a.pideTexto ? setAccion({ solicitud: s, accion: a }) : aplicar(s, a))}
                              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold disabled:opacity-60"
                              style={a.clave === "resolver" ? { background: "#16a34a", color: "white" }
                                : a.clave === "tomar" ? { background: "#4F46E5", color: "white" }
                                : a.clave === "devolver" ? { background: "#fff7ed", color: "#c2410c", border: "1px solid #fed7aa" }
                                : { background: "white", color: "#475569", border: "1px solid #e2e8f0" }}>
                              {ocupado === s.id && !a.pideTexto && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                              {a.etiqueta}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {accion && (
        <AccionConTexto
          {...accion}
          ocupado={ocupado === accion.solicitud.id}
          onCerrar={() => setAccion(null)}
          onConfirmar={(nota) => aplicar(accion.solicitud, accion.accion, nota)}
        />
      )}
    </div>
  );
}

function AccionConTexto({ solicitud, accion, ocupado, onCerrar, onConfirmar }) {
  const [nota, setNota] = useState("");
  const [aviso, setAviso] = useState("");
  const confirmar = async () => {
    if (nota.trim().length < 10) {
      setAviso("Escribe al menos 10 caracteres: el centro lo va a leer.");
      return;
    }
    setAviso("");
    await onConfirmar(nota);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white sm:rounded-3xl rounded-t-3xl shadow-2xl w-full max-w-md">
        <div className="px-6 pt-6 pb-3 border-b border-slate-100 flex items-center justify-between">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-slate-900">{accion.etiqueta}</h2>
            <p className="text-xs text-slate-500 truncate">{solicitud.numero_solicitud} · {solicitud.centro}</p>
          </div>
          <button type="button" onClick={onCerrar} aria-label="Cerrar"><X className="w-5 h-5 text-slate-400" /></button>
        </div>
        <div className="px-6 py-5 space-y-3">
          <label className="text-xs font-semibold text-slate-600 block">{accion.campoTexto} *</label>
          <textarea rows={5} value={nota} onChange={e => setNota(e.target.value)} maxLength={4000} autoFocus
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
          <p className="text-[11px] text-slate-400">Le llega por correo a quien la envió y a quien la pidió.</p>
          {aviso && <p className="text-xs text-red-600">{aviso}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onCerrar} className="flex-1 py-2.5 rounded-xl text-sm font-medium text-slate-600 border border-slate-200">Cancelar</button>
            <button type="button" onClick={confirmar} disabled={ocupado}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60" style={{ background: "#4F46E5" }}>
              {ocupado && <Loader2 className="w-4 h-4 animate-spin" />} Confirmar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
