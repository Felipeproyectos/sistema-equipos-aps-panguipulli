import { useCallback, useEffect, useMemo, useState } from "react";
import { Inbox, Search, ChevronDown, X, Loader2, AlertTriangle, Clock, RefreshCw, Printer } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { getEffectiveNavRole } from "@/lib/roleSimulator";
import { esSolicitudDeFlota } from "@/lib/panelFlota";
import { avisarCambioEnPendientes } from "@/hooks/useContadoresMenu";
import { mensajeDeError } from "@/lib/mensajesDeError";
import FichaSolicitud, { EstadoBadge, PrioridadBadge, conDatosDelEquipo } from "@/components/solicitudes/FichaSolicitud";
import {
  CATEGORIAS, ESTADOS_CERRADOS, GRUPOS_INFORME, accionesPara, cambiosDeAccion, filtrarParaInforme, ordenarBandeja, rotulo,
} from "@/lib/solicitudesMonitor";
import { generarPDFSolicitudesMonitor } from "@/utils/generarPDFSolicitudesMonitor";
import { useToast } from "@/components/ui/use-toast";

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
  const [imprimiendo, setImprimiendo] = useState(false);
  const { toast } = useToast();

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

  // Abre el informe en una pestaña nueva, lista para imprimir o guardar en PDF.
  const abrirInforme = (lista, filtros, formato) => {
    const ok = generarPDFSolicitudesMonitor({
      solicitudes: lista, equipos, filtros, formato, quien: user?.full_name || user?.email || "",
    });
    if (!ok) toast({ title: "El navegador bloqueó la ventana", description: "Permite las ventanas emergentes de este sitio y vuelve a intentarlo.", variant: "destructive" });
    return ok;
  };

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
          <div className="flex gap-2">
            <button type="button" onClick={() => setImprimiendo(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-indigo-900 bg-white">
              <Printer className="w-4 h-4" /> Imprimir / PDF
            </button>
            <button type="button" onClick={() => { setCargando(true); cargar(); }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: "rgba(255,255,255,0.18)" }}>
              <RefreshCw className="w-4 h-4" /> Actualizar
            </button>
          </div>
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
                        {s.ambito === "cabina" && <span className="text-teal-700 font-semibold"> · Cabina sanitaria{eq?.patente ? ` (${eq.patente})` : ""}</span>}
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
                      <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
                          <button type="button" onClick={() => abrirInforme([s], { grupos: GRUPOS_INFORME.map(g => g.clave), centro: s.centro || "todos" }, "detalle")}
                            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold"
                            style={{ background: "white", color: "#4338ca", border: "1px solid #c7d2fe" }}>
                            <Printer className="w-3.5 h-3.5" /> Imprimir esta solicitud
                          </button>
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
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {imprimiendo && (
        <ImprimirSolicitudes
          solicitudes={delMonitor}
          centros={centros}
          centroInicial={centro}
          onCerrar={() => setImprimiendo(false)}
          onGenerar={(lista, filtros, formato) => { if (abrirInforme(lista, filtros, formato)) setImprimiendo(false); }}
        />
      )}

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

// Qué imprimir: todo, o por centro, estado, tipo, urgencia y período. Muestra
// cuántas entran antes de generar, para no sacar un PDF vacío.
function ImprimirSolicitudes({ solicitudes, centros, centroInicial, onCerrar, onGenerar }) {
  const [f, setF] = useState({
    centro: centroInicial || "todos",
    grupos: ["por_atender", "en_gestion", "devueltas"],
    categoria: "todas",
    soloUrgentes: false,
    desde: "",
    hasta: "",
  });
  const [formato, setFormato] = useState("resumen");
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const alternarGrupo = (g) => set("grupos", f.grupos.includes(g) ? f.grupos.filter(x => x !== g) : [...f.grupos, g]);
  const lista = useMemo(() => filtrarParaInforme(solicitudes, f), [solicitudes, f]);
  const porCentro = useMemo(() => {
    const m = new Map();
    lista.forEach(s => m.set(s.centro || "Sin centro", (m.get(s.centro || "Sin centro") || 0) + 1));
    return [...m.entries()];
  }, [lista]);
  const campo = "w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm";
  const etiqueta = "text-xs font-semibold text-slate-600 block mb-1";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white sm:rounded-3xl rounded-t-3xl shadow-2xl w-full max-w-lg max-h-[94vh] overflow-y-auto">
        <div className="px-6 pt-6 pb-3 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2"><Printer className="w-5 h-5 text-indigo-600" /> Imprimir o guardar en PDF</h2>
            <p className="text-xs text-slate-500">Elige qué solicitudes van en el documento.</p>
          </div>
          <button type="button" onClick={onCerrar} aria-label="Cerrar"><X className="w-5 h-5 text-slate-400" /></button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className={etiqueta}>Centro</label>
            <select value={f.centro} onChange={e => set("centro", e.target.value)} className={campo}>
              <option value="todos">Todos los centros</option>
              {centros.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div>
            <p className={etiqueta}>Estados</p>
            <div className="grid grid-cols-2 gap-2">
              {GRUPOS_INFORME.map(g => (
                <label key={g.clave} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={f.grupos.includes(g.clave)} onChange={() => alternarGrupo(g.clave)} className="accent-indigo-600" />
                  {g.label}
                </label>
              ))}
            </div>
            <div className="flex gap-3 mt-1.5 text-xs">
              <button type="button" className="text-indigo-700 font-semibold" onClick={() => set("grupos", GRUPOS_INFORME.map(g => g.clave))}>Todas</button>
              <button type="button" className="text-indigo-700 font-semibold" onClick={() => set("grupos", ["por_atender", "en_gestion", "devueltas"])}>Solo abiertas</button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={etiqueta}>Tipo</label>
              <select value={f.categoria} onChange={e => set("categoria", e.target.value)} className={campo}>
                <option value="todas">Todos los tipos</option>
                {CATEGORIAS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm sm:mt-6">
              <input type="checkbox" checked={f.soloUrgentes} onChange={e => set("soloUrgentes", e.target.checked)} className="accent-indigo-600" />
              Solo críticas o fuera de servicio
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={etiqueta}>Enviadas desde</label>
              <input type="date" value={f.desde} onChange={e => set("desde", e.target.value)} className={campo} />
            </div>
            <div>
              <label className={etiqueta}>Hasta</label>
              <input type="date" value={f.hasta} min={f.desde || undefined} onChange={e => set("hasta", e.target.value)} className={campo} />
            </div>
          </div>

          <div>
            <p className={etiqueta}>Formato</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[
                { v: "resumen", t: "Resumen", a: "Una tabla por centro, en hoja horizontal." },
                { v: "detalle", t: "Ficha por solicitud", a: "Todo el detalle, una por hoja, con firmas." },
              ].map(o => (
                <button key={o.v} type="button" onClick={() => setFormato(o.v)} aria-pressed={formato === o.v}
                  className="text-left rounded-xl border-2 px-3 py-2"
                  style={{ borderColor: formato === o.v ? "#4F46E5" : "#e2e8f0", background: formato === o.v ? "#eef2ff" : "white" }}>
                  <span className="block text-sm font-bold text-slate-800">{o.t}</span>
                  <span className="block text-[11px] text-slate-500">{o.a}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5 text-sm">
            <p className="font-semibold text-slate-800">{lista.length} {lista.length === 1 ? "solicitud" : "solicitudes"} en el documento</p>
            {porCentro.length > 0 && (
              <p className="text-xs text-slate-500 mt-0.5">{porCentro.map(([c, n]) => `${c}: ${n}`).join(" · ")}</p>
            )}
          </div>

          <div className="flex gap-3">
            <button type="button" onClick={onCerrar} className="flex-1 py-2.5 rounded-xl text-sm font-medium text-slate-600 border border-slate-200">Cancelar</button>
            <button type="button" disabled={!lista.length} onClick={() => onGenerar(lista, f, formato)}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: "#4F46E5" }}>
              <Printer className="w-4 h-4" /> Generar documento
            </button>
          </div>
          <p className="text-[11px] text-slate-400">Se abre en una pestaña nueva. Para guardarlo, elige «Guardar como PDF» en la ventana de impresión.</p>
        </div>
      </div>
    </div>
  );
}
