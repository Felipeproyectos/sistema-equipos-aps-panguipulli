import { useState, useEffect, useMemo, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { ClipboardList, Plus, Search, ChevronDown, Truck, Send } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { getEffectiveNavRole } from "@/lib/roleSimulator";
import { puedeEliminar } from "@/lib/roles";
import { esSolicitudDeFlota } from "@/lib/panelFlota";
import { rotuloOrigenSolicitud } from "@/lib/fallasPauta";
import { avisarCambioEnPendientes } from "@/hooks/useContadoresMenu";
import SeguimientoTaller from "@/components/salud/SeguimientoTaller";
import FichaSolicitud, { EstadoBadge, PrioridadBadge, conDatosDelEquipo } from "@/components/solicitudes/FichaSolicitud";
import SolicitudFormDetallado from "@/components/solicitudes/SolicitudFormDetallado";
import { CATEGORIAS, ESTADOS_CERRADOS, ESTADOS_EN_MONITOR, accionesPara, rotulo } from "@/lib/solicitudesMonitor";

// Las solicitudes del centro.
//
// Las de equipos vitales las resuelve el Monitor Corporativo: acá el Encargado
// de Salud las completa con todo el detalle y se las envía, y ve en qué va
// cada una. Si el Monitor la devuelve, vuelve a esta bandeja para corregirla.
// Las de vehículos siguen yendo a Movilización y al Taller (pestaña Vehículos).
// El recorrido está en src/lib/solicitudesMonitor.js.

// "Gestiona" (ve todas): Base del Sistema, Administrador, Encargado Salud y
// Encargado Compras Salud. El Usuario ve y edita solo las suyas.
const ROLES_VEN_TODAS = ["super_admin", "admin", "encargado_salud", "encargado_compras_salud"];

const PESTANAS = [
  { clave: "por_enviar", label: "Por enviar", filtro: (s, flota) => !flota && (s.estado || "pendiente") === "pendiente" },
  { clave: "devueltas", label: "Devueltas", filtro: (s, flota) => !flota && s.estado === "devuelta" },
  { clave: "en_monitor", label: "En Monitor", filtro: (s, flota) => !flota && ESTADOS_EN_MONITOR.includes(s.estado) },
  { clave: "cerradas", label: "Cerradas", filtro: (s, flota) => !flota && ESTADOS_CERRADOS.includes(s.estado) },
  { clave: "vehiculos", label: "Vehículos", filtro: (s, flota) => flota },
  { clave: "todas", label: "Todas", filtro: () => true },
];

const ESTADO_FLOTA = {
  pendiente: { label: "En Movilización", color: "#d97706", bg: "#fffbeb" },
  en_proceso: { label: "En el taller", color: "#2563eb", bg: "#eff6ff" },
  finalizada: { label: "Finalizada", color: "#16a34a", bg: "#f0fdf4" },
};

export default function SolicitudesV2() {
  const { user } = useAuth();
  const role = getEffectiveNavRole(user?.role);
  const [solicitudes, setSolicitudes] = useState([]);
  const [equipos, setEquipos] = useState([]);
  // Las órdenes del taller, para mostrar en qué va lo que se informó de un
  // vehículo (lo resuelven Movilización y el Taller, no esta pantalla).
  const [ordenes, setOrdenes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formulario, setFormulario] = useState(null);
  const [pestana, setPestana] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const [abierta, setAbierta] = useState(null);

  const cargar = useCallback(() => Promise.all([
    base44.entities.Solicitud.list("-created_date", 500),
    base44.entities.Equipo.list("-created_date", 500),
    base44.entities.OrdenTrabajo.list("-created_date", 500).catch(() => []),
  ]).then(([sol, eq, ots]) => {
    setSolicitudes(sol);
    setEquipos(eq);
    setOrdenes(ots);
  }).catch(() => {}).finally(() => setLoading(false)), []);

  useEffect(() => { cargar(); }, [cargar]);

  const porId = useMemo(() => new Map(equipos.map(e => [e.id, e])), [equipos]);
  const veTodas = ROLES_VEN_TODAS.includes(role);
  const visibles = useMemo(
    () => (veTodas ? solicitudes : solicitudes.filter(s => s.usuario_email === user?.email)),
    [solicitudes, veTodas, user?.email]);
  const esFlota = useCallback((s) => esSolicitudDeFlota(s, porId.get(s.equipo_id)), [porId]);
  const cuenta = (clave) => visibles.filter(s => PESTANAS.find(p => p.clave === clave).filtro(s, esFlota(s))).length;

  // Se abre en lo que espera una acción del centro.
  const activa = pestana || (cuenta("devueltas") ? "devueltas" : cuenta("por_enviar") ? "por_enviar" : "en_monitor");

  const lista = useMemo(() => {
    const p = PESTANAS.find(x => x.clave === activa);
    const q = busqueda.trim().toLowerCase();
    return visibles.filter(s => {
      if (!p.filtro(s, esFlota(s))) return false;
      if (!q) return true;
      const c = conDatosDelEquipo(s, porId.get(s.equipo_id));
      return [c.numero_solicitud, c.equipo_marca, c.equipo_modelo, c.equipo_numero_serie, c.equipo_numero_inventario,
        c.centro, c.ubicacion_especifica, c.usuario_nombre, c.descripcion, c.observaciones, c.insumo_nombre]
        .some(v => String(v || "").toLowerCase().includes(q));
    });
  }, [visibles, activa, busqueda, esFlota, porId]);

  const alGuardar = async () => {
    setFormulario(null);
    await cargar();
    avisarCambioEnPendientes();
  };

  const borrar = async (sol, pregunta) => {
    if (!confirm(pregunta)) return;
    try {
      await base44.entities.Solicitud.delete(sol.id);
      setSolicitudes(prev => prev.filter(s => s.id !== sol.id));
      avisarCambioEnPendientes();
    } catch {
      // El motivo ya lo mostró base44Client.
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen" style={{ background: "#e8f4fd" }}>
      <div className="relative overflow-hidden px-4 sm:px-6 lg:px-10 pt-10 pb-8" style={{ background: "linear-gradient(135deg, #0f2d6b 0%, #1565c0 40%, #29b6f6 100%)" }}>
        <div className="relative max-w-5xl mx-auto flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(255,255,255,0.2)" }}>
              <ClipboardList className="w-6 h-6 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-cyan-200 text-xs font-semibold uppercase tracking-widest">Gestión</p>
              <h1 className="text-3xl font-bold text-white">Solicitudes</h1>
              <p className="text-blue-100 text-sm mt-0.5">Las resuelve el Monitor Corporativo de la Corporación Municipal</p>
            </div>
          </div>
          <button onClick={() => setFormulario({ inicial: null })} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold" style={{ background: "rgba(255,255,255,0.2)", color: "white", border: "1px solid rgba(255,255,255,0.3)" }}>
            <Plus className="w-4 h-4" /> Nueva Solicitud
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-10 pt-6 pb-10">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { clave: "por_enviar", etiqueta: "Por enviar al Monitor", color: "#d97706" },
            { clave: "devueltas", etiqueta: "Devueltas para corregir", color: "#c2410c" },
            { clave: "en_monitor", etiqueta: "En el Monitor", color: "#4f46e5" },
            { clave: "cerradas", etiqueta: "Cerradas", color: "#16a34a" },
          ].map(k => (
            <button key={k.clave} type="button" onClick={() => setPestana(k.clave)} className="text-left bg-white rounded-2xl p-4 shadow border border-slate-100">
              <p className="text-2xl font-bold" style={{ color: k.color }}>{cuenta(k.clave)}</p>
              <p className="text-xs text-slate-500 mt-0.5">{k.etiqueta}</p>
            </button>
          ))}
        </div>

        <div className="bg-white rounded-2xl shadow p-4 mb-6 space-y-3">
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {PESTANAS.map(t => (
              <button key={t.clave} onClick={() => setPestana(t.clave)} aria-pressed={activa === t.clave}
                className={`px-4 py-2 rounded-xl text-xs font-medium whitespace-nowrap flex-shrink-0 ${activa === t.clave ? "text-white" : "bg-white text-slate-500 border border-slate-200"}`}
                style={activa === t.clave ? { background: "#1a2e4a" } : {}}>
                {t.label} ({cuenta(t.clave)})
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input type="text" placeholder="Buscar por N°, equipo, serie, ubicación o solicitante..." className="w-full pl-10 pr-4 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-300" value={busqueda} onChange={e => setBusqueda(e.target.value)} />
          </div>
        </div>

        <div className="space-y-3">
          {lista.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl shadow text-slate-400">
              <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p>No hay solicitudes en esta bandeja</p>
            </div>
          ) : lista.map(sol => {
            const equipo = porId.get(sol.equipo_id);
            const flota = esFlota(sol);
            const c = conDatosDelEquipo(sol, equipo);
            const expandida = abierta === sol.id;
            // Acá solo lo del centro: completar y enviar. Lo del Monitor se hace
            // en su bandeja (Solicitudes de Centros).
            const acciones = accionesPara(role, sol, { esFlota: flota }).filter(a => a.clave === "enviar");
            const propiaPendiente = sol.usuario_email === user?.email && (sol.estado || "pendiente") === "pendiente";
            const fc = ESTADO_FLOTA[sol.estado] || ESTADO_FLOTA.pendiente;
            return (
              <div key={sol.id} className="bg-white rounded-2xl shadow border border-slate-100">
                <button type="button" onClick={() => setAbierta(expandida ? null : sol.id)} aria-expanded={expandida}
                  className="w-full text-left p-5 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      {sol.numero_solicitud && <span className="text-xs font-bold text-slate-400">{sol.numero_solicitud}</span>}
                      {flota
                        ? <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ color: fc.color, background: fc.bg }}><Truck className="w-3 h-3 inline mr-1" />{fc.label}</span>
                        : <EstadoBadge estado={sol.estado} />}
                      <PrioridadBadge prioridad={sol.prioridad} />
                      <span className="text-xs text-slate-500">{rotulo(CATEGORIAS, sol.categoria) || rotuloOrigenSolicitud(sol)}</span>
                    </div>
                    <p className="font-semibold text-slate-900 text-sm">
                      {[c.equipo_marca, c.equipo_modelo].filter(Boolean).join(" ") || "Equipo desconocido"}
                      {c.equipo_numero_inventario && <span className="text-slate-400 font-normal ml-1">· Inv. {c.equipo_numero_inventario}</span>}
                    </p>
                    <p className="text-xs text-slate-500 truncate">{[c.centro, c.subsede, c.ubicacion_especifica, sol.fecha].filter(Boolean).join(" · ")}</p>
                    {veTodas && sol.usuario_nombre && <p className="text-xs text-slate-400">Solicita: {sol.usuario_nombre}{sol.solicitante_cargo ? `, ${sol.solicitante_cargo}` : ""}</p>}
                    {sol.estado === "devuelta" && sol.resolucion && (
                      <p className="text-xs text-orange-800 bg-orange-50 border border-orange-200 rounded-lg px-2 py-1 mt-1 whitespace-pre-line">El Monitor pide: {sol.resolucion}</p>
                    )}
                  </div>
                  <ChevronDown className={`w-4 h-4 text-slate-400 flex-shrink-0 mt-1 transition-transform ${expandida ? "rotate-180" : ""}`} />
                </button>

                {expandida && (
                  <div className="px-5 pb-5 space-y-3">
                    <FichaSolicitud solicitud={sol} equipo={equipo} />
                    {flota && <SeguimientoTaller solicitud={sol} ot={ordenes.find(o => o.solicitud_id === sol.id) || null} />}
                  </div>
                )}

                {(acciones.length > 0 || propiaPendiente || puedeEliminar(role, "solicitud")) && (
                  <div className="px-5 pb-4 flex flex-wrap gap-2">
                    {acciones.map(a => (
                      <button key={a.clave} type="button" onClick={() => setFormulario({ inicial: sol })}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white"
                        style={{ background: "linear-gradient(135deg, #4F46E5, #312E81)" }}>
                        <Send className="w-3.5 h-3.5" /> {a.etiqueta}
                      </button>
                    ))}
                    {/* Quien la pidió completa su detalle mientras su Encargado no la envíe. */}
                    {propiaPendiente && !acciones.length && !flota && (
                      <button type="button" onClick={() => setFormulario({ inicial: sol })}
                        className="px-3.5 py-2 rounded-xl text-xs font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50">
                        Editar detalle
                      </button>
                    )}
                    {/* El propio solicitante puede cancelar mientras siga "pendiente" */}
                    {propiaPendiente && (
                      <button type="button" onClick={() => borrar(sol, "¿Cancelar esta solicitud?")}
                        className="px-3.5 py-2 rounded-xl text-xs font-semibold border border-red-200 text-red-600 hover:bg-red-50">
                        Cancelar
                      </button>
                    )}
                    {/* Borrar cualquiera (policy `solicitud_delete`). No se duplica
                        en las que ya ofrecen "Cancelar". */}
                    {puedeEliminar(role, "solicitud") && !propiaPendiente && (
                      <button type="button"
                        onClick={() => borrar(sol, `¿Eliminar la solicitud ${sol.numero_solicitud || ""} de ${sol.usuario_nombre || sol.usuario_email}? No se puede deshacer.`)}
                        className="px-3.5 py-2 rounded-xl text-xs font-semibold border border-red-200 text-red-600 hover:bg-red-50">
                        Eliminar
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {formulario && (
        <SolicitudFormDetallado
          equipos={equipos}
          user={user}
          role={role}
          inicial={formulario.inicial}
          onClose={() => setFormulario(null)}
          onSaved={alGuardar}
        />
      )}
    </div>
  );
}
