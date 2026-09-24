import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { base44 } from "@/api/base44Client";
import {
  Monitor, AlertTriangle, ClipboardList, Wrench, CheckCircle2, ShieldCheck, RefreshCw,
  Car, Search, Hash, MapPin, Eye, Truck, HeartPulse, Briefcase, ChevronDown, MessageCircle,
  ShoppingCart, Circle,
} from "lucide-react";
import { Link } from "react-router-dom";
import { parseISO, format } from "date-fns";
import usePullToRefresh from "@/hooks/usePullToRefresh";
import CentroBreakdown from "@/components/monitor/CentroBreakdown";
import { getCentrosEstructura, TIPOS_EQUIPO, ESTADOS_EQUIPO, esVehiculo } from "@/lib/centros";
import { getNavItemsForRole } from "@/lib/navPermissions";
import { getEffectiveNavRole } from "@/lib/roleSimulator";
import ComentariosEquipo from "@/components/monitor/ComentariosEquipo";
import FlotaSemanaMini from "@/components/monitor/FlotaSemanaMini";
import CoordinacionTaller from "@/components/monitor/CoordinacionTaller";
import SeguimientoCompraModal from "@/components/taller/SeguimientoCompraModal";
import { useAuth } from "@/lib/AuthContext";
import { estadoLicencia } from "@/pages/Choferes";
import { areaCalidad, areaGestion, areaMovilizacion, areaTaller } from "@/lib/monitorResumen";
import { esSolicitudDeFlota } from "@/lib/panelFlota";

// El Monitor Corporativo, en cuatro áreas: Calidad, Gestión, Movilización y
// Taller Mecánico.
//
// Antes mostraba todo lo que había — gráficos, contadores, listados — y no
// decía nada: había que mirar veinte números para saber si algo andaba mal.
// Ahora cada área responde tres preguntas, en este orden:
//   1. ¿Cómo está?        un semáforo con una frase
//   2. ¿Qué hay que mirar? la lista de lo que requiere atención, con nombres
//   3. ¿Cuánto?           cuatro indicadores, cada uno con su contexto
// Los listados completos siguen estando, pero plegados: son para buscar, no
// para leer al entrar. Las reglas viven en src/lib/monitorResumen.js.

const OT_ESTADO_LABELS = {
  pendiente: "Pendiente",
  asignada: "Asignada",
  en_proceso: "En Proceso",
  pausada: "Pausada",
  en_revision: "En Revisión",
  completada: "Completada",
  cancelada: "Cancelada",
};
const OT_ESTADO_COLORS = {
  pendiente: "#d97706",
  asignada: "#2563eb",
  en_proceso: "#7c3aed",
  pausada: "#64748b",
  en_revision: "#0891b2",
  completada: "#16a34a",
  cancelada: "#dc2626",
};
const OT_ESTADOS_ABIERTOS = ["pendiente", "asignada", "en_proceso", "pausada", "en_revision"];
const OT_PRIORIDAD = {
  baja: { label: "Baja", color: "#64748b", bg: "#f1f5f9" },
  media: { label: "Media", color: "#2563eb", bg: "#eff6ff" },
  alta: { label: "Alta", color: "#d97706", bg: "#fffbeb" },
  critica: { label: "Crítica", color: "#dc2626", bg: "#fef2f2" },
};
const FILTROS_OT = [
  { value: "abiertas", label: "Abiertas" },
  ...Object.keys(OT_ESTADO_LABELS).map(k => ({ value: k, label: OT_ESTADO_LABELS[k] })),
  { value: "todas", label: "Todas" },
];
const COMPRA_ESTADO = {
  pendiente: { label: "Pendiente", color: "#D97706", bg: "#FEF3C7" },
  aprobada: { label: "Por comprar", color: "#D97706", bg: "#FEF3C7" },
  comprada: { label: "En camino", color: "#2563EB", bg: "#DBEAFE" },
  recibida: { label: "En bodega", color: "#16A34A", bg: "#DCFCE7" },
  rechazada: { label: "Rechazada", color: "#DC2626", bg: "#FEE2E2" },
};

const AREAS = [
  { clave: "calidad", titulo: "Calidad", sub: "Equipos vitales", icono: HeartPulse, color: "#0f766e" },
  { clave: "gestion", titulo: "Gestión", sub: "Solicitudes, compras y coordinación", icono: Briefcase, color: "#4f46e5" },
  { clave: "movilizacion", titulo: "Movilización", sub: "Flota y choferes", icono: Truck, color: "#b45309" },
  { clave: "taller", titulo: "Taller Mecánico", sub: "Reparaciones y repuestos", icono: Wrench, color: "#7c3aed" },
];

const TONO = {
  rojo:  { punto: "#dc2626", fondo: "#fef2f2", borde: "#fecaca", texto: "#991b1b" },
  ambar: { punto: "#d97706", fondo: "#fffbeb", borde: "#fde68a", texto: "#92400e" },
  verde: { punto: "#16a34a", fondo: "#f0fdf4", borde: "#bbf7d0", texto: "#166534" },
  gris:  { punto: "#94a3b8", fondo: "#f8fafc", borde: "#e2e8f0", texto: "#334155" },
};
const PESO = { rojo: 0, ambar: 1, verde: 2 };
const sombra = { boxShadow: "0 4px 20px rgba(15,45,107,0.06)" };

export default function MonitorCorporativo() {
  const { user: currentUser } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorCarga, setErrorCarga] = useState(null);
  const [areaElegida, setAreaElegida] = useState(null);
  const [equipoSeleccionado, setEquipoSeleccionado] = useState("");
  const [busquedaEquipo, setBusquedaEquipo] = useState("");
  const [filtroTipoEquipo, setFiltroTipoEquipo] = useState("todos");
  const [filtroEstadoEquipo, setFiltroEstadoEquipo] = useState("todos");
  const [busquedaOT, setBusquedaOT] = useState("");
  const [filtroEstadoOT, setFiltroEstadoOT] = useState("abiertas");
  const [selSeguimiento, setSelSeguimiento] = useState(null);
  const containerRef = useRef(null);
  const panelRef = useRef(null);

  // Todo sale de getMonitorData. Si esa llamada falla y el error se traga en
  // silencio, la pantalla muestra todo en verde — indistinguible de "todo en
  // orden". En equipamiento crítico eso es peor que no mostrar nada: se avisa.
  const fetchData = useCallback(async () => {
    let fallo = null;
    const [res, centros, comprasTaller, comprasSalud] = await Promise.all([
      base44.functions.invoke('getMonitorData').catch((e) => { fallo = e; return { data: {} }; }),
      getCentrosEstructura().catch(() => []),
      base44.entities.SolicitudRepuesto.list("-created_date", 200).catch(() => []),
      base44.entities.SolicitudRepuestoSalud.list("-created_date", 200).catch(() => []),
    ]);
    setErrorCarga(fallo ? (fallo.message || "No se pudo contactar al servidor") : null);
    const d = res.data || {};
    setData({
      equipos: d.equipos || [],
      parches: d.parches || [],
      alertas: d.alertas || [],
      solicitudes: d.solicitudes || [],
      inspecciones: d.inspecciones || [],
      ordenes: d.ordenes || [],
      repuestos: d.repuestos || [],
      asignaciones: d.asignaciones || [],
      prestamos: d.prestamos || [],
      bitacoraFlota: d.bitacoraFlota || [],
      choferes: d.choferes || [],
      centros,
      comprasTaller: comprasTaller.map(s => ({ ...s, _area: "Taller" })),
      comprasSalud: comprasSalud.map(s => ({ ...s, _area: "Salud", _entidad: "SolicitudRepuestoSalud" })),
    });
  }, []);

  useEffect(() => { fetchData().finally(() => setLoading(false)); }, [fetchData]);
  const { refreshing } = usePullToRefresh(fetchData, containerRef);

  const {
    equipos = [], parches = [], alertas = [], solicitudes = [], inspecciones = [], ordenes = [],
    repuestos = [], centros = [], comprasTaller = [], comprasSalud = [],
    asignaciones = [], prestamos = [], bitacoraFlota = [], choferes = [],
  } = data || {};

  const areas = useMemo(() => ({
    calidad: areaCalidad({ equipos, parches, alertas, inspecciones }),
    gestion: areaGestion({ solicitudes, comprasTaller, comprasSalud, ordenes }),
    movilizacion: areaMovilizacion({ equipos, ordenes, asignaciones, prestamos, bitacora: bitacoraFlota, choferes, estadoLicencia }),
    taller: areaTaller({ ordenes, repuestos }),
  }), [equipos, parches, alertas, inspecciones, solicitudes, comprasTaller, comprasSalud, ordenes, asignaciones, prestamos, bitacoraFlota, choferes, repuestos]);

  // Se abre en el área que peor está; después manda la persona.
  const peor = AREAS.map(a => a.clave).sort((x, y) => PESO[areas[x].estado.tono] - PESO[areas[y].estado.tono])[0];
  const area = areaElegida || peor;
  const elegir = (clave) => {
    setAreaElegida(clave);
    requestAnimationFrame(() => panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const equiposFiltrados = useMemo(() => {
    const q = busquedaEquipo.trim().toLowerCase();
    return equipos.filter(e => {
      if (filtroTipoEquipo !== "todos" && e.tipo !== filtroTipoEquipo) return false;
      if (filtroEstadoEquipo !== "todos" && e.estado !== filtroEstadoEquipo) return false;
      if (!q) return true;
      return [e.marca, e.modelo, e.patente, e.numero_serie, e.centro_principal, e.subsede, e.ubicacion_especifica]
        .some(v => String(v || "").toLowerCase().includes(q));
    });
  }, [equipos, busquedaEquipo, filtroTipoEquipo, filtroEstadoEquipo]);

  const ordenesFiltradas = useMemo(() => {
    const q = busquedaOT.trim().toLowerCase();
    return ordenes.filter(o => {
      if (filtroEstadoOT === "abiertas") { if (!OT_ESTADOS_ABIERTOS.includes(o.estado)) return false; }
      else if (filtroEstadoOT !== "todas" && o.estado !== filtroEstadoOT) return false;
      if (!q) return true;
      return [o.numero_ot, o.equipo_label, o.patente, o.marca_modelo, o.mecanico_nombre, o.mecanico_email, o.problema_reportado]
        .some(v => String(v || "").toLowerCase().includes(q));
    });
  }, [ordenes, busquedaOT, filtroEstadoOT]);

  // Enlazar solo a lo que el rol que mira puede abrir: el Monitor está
  // confinado a esta pantalla, y un enlace fuera de su menú lo rebota acá.
  const paginasAlcanzables = useMemo(
    () => new Set(getNavItemsForRole(getEffectiveNavRole(currentUser?.role)).map(i => i.page)),
    [currentUser?.role]
  );
  const verDetalleOT = paginasAlcanzables.has("Taller") || paginasAlcanzables.has("OrdenesTrabajo");

  const tiposPresentes = useMemo(() => {
    const vistos = [...new Set(equipos.map(e => e.tipo).filter(Boolean))];
    return vistos.map(t => ({ value: t, label: TIPOS_EQUIPO.find(x => x.value === t)?.label || t }));
  }, [equipos]);

  if (loading || !data) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const info = AREAS.find(a => a.clave === area);
  const r = areas[area];
  const compras = [...comprasTaller, ...comprasSalud]
    .sort((a, b) => String(b.created_date || "").localeCompare(String(a.created_date || "")));
  const vehiculos = equipos.filter(e => esVehiculo(e.tipo));
  const hoyTexto = new Date().toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div ref={containerRef} className="min-h-screen" style={{ background: "#f8fafc", overscrollBehavior: "none" }}>
      {refreshing && (
        <div className="flex items-center justify-center py-3 lg:hidden">
          <RefreshCw className="w-5 h-5 text-indigo-500 animate-spin" />
        </div>
      )}

      {/* Header */}
      <div className="px-4 lg:px-10 pt-6 lg:pt-10 pb-6 lg:pb-8"
        style={{ background: "linear-gradient(135deg, #4F46E5 0%, #312E81 100%)" }}>
        <div className="max-w-6xl mx-auto flex items-center gap-3">
          <div className="w-11 h-11 lg:w-12 lg:h-12 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(255,255,255,0.18)" }}>
            <ShieldCheck className="w-6 h-6 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl lg:text-3xl font-bold text-white leading-tight">Monitor Corporativo</h1>
            <p className="text-indigo-100 text-xs lg:text-sm mt-0.5 first-letter:uppercase">{hoyTexto} · Solo lectura</p>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 lg:px-10 mt-5 pb-10 space-y-6">

        {errorCarga && (
          <div className="rounded-2xl px-4 py-3 flex items-start gap-3 bg-red-50 border border-red-200">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5 text-red-600" />
            <div>
              <p className="text-sm font-bold text-red-700">No se pudieron cargar los datos del monitor</p>
              <p className="text-xs mt-0.5 text-red-600">
                Lo que ves abajo puede aparecer "en orden" solo porque no llegaron los datos. No tomes
                decisiones con esta pantalla hasta que se recupere. — {errorCarga}
              </p>
            </div>
          </div>
        )}

        {/* 1. Cómo está cada área: un semáforo y una frase. Tocar abre el área. */}
        <section>
          <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-3">Estado general</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {AREAS.map(a => {
              const est = areas[a.clave].estado;
              const t = TONO[est.tono];
              const Icono = a.icono;
              const activa = a.clave === area;
              return (
                <button key={a.clave} type="button" onClick={() => elegir(a.clave)}
                  aria-pressed={activa}
                  className="text-left bg-white rounded-2xl p-4 border-2 transition-all hover:-translate-y-0.5"
                  style={{ borderColor: activa ? a.color : "transparent", ...sombra }}>
                  <div className="flex items-center gap-2">
                    <Icono className="w-5 h-5 flex-shrink-0" style={{ color: a.color }} />
                    <span className="font-bold text-slate-800">{a.titulo}</span>
                    <span className="ml-auto flex items-center gap-1.5 text-xs font-bold px-2 py-0.5 rounded-full"
                      style={{ background: t.fondo, color: t.texto }}>
                      <Circle className="w-2 h-2" fill={t.punto} stroke="none" /> {est.palabra}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600 mt-2 leading-snug line-clamp-2">{est.frase}</p>
                </button>
              );
            })}
          </div>
        </section>

        {/* 2. El área elegida */}
        <section ref={panelRef} style={{ scrollMarginTop: 16 }} className="space-y-5">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${info.color}15` }}>
              <info.icono className="w-5 h-5" style={{ color: info.color }} />
            </div>
            <div>
              <h2 className="text-xl font-bold" style={{ color: info.color }}>{info.titulo}</h2>
              <p className="text-xs text-slate-500">{info.sub}</p>
            </div>
          </div>

          <Indicadores lista={r.indicadores} />

          <div>
            <h3 className="text-sm font-bold text-slate-700 mb-2">Requiere atención</h3>
            <Atencion lista={r.atencion} />
          </div>

          {area === "calidad" && (
            <>
              <Desplegable titulo={`Todos los equipos (${equipos.length})`} icono={Monitor}>
                <div className="flex flex-col sm:flex-row gap-2 mb-3">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input value={busquedaEquipo} onChange={(e) => setBusquedaEquipo(e.target.value)}
                      placeholder="Buscar por marca, modelo, patente, serie o centro..."
                      className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-sm" />
                  </div>
                  <select value={filtroTipoEquipo} onChange={(e) => setFiltroTipoEquipo(e.target.value)}
                    className="bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm">
                    <option value="todos">Todos los tipos</option>
                    {tiposPresentes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  <select value={filtroEstadoEquipo} onChange={(e) => setFiltroEstadoEquipo(e.target.value)}
                    className="bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm">
                    <option value="todos">Todos los estados</option>
                    {ESTADOS_EQUIPO.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
                  </select>
                </div>
                {equiposFiltrados.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-6">Ningún equipo coincide con el filtro.</p>
                ) : (
                  <div className="space-y-2 max-h-[30rem] overflow-y-auto pr-1">
                    {equiposFiltrados.map(eq => <EquipoFila key={eq.id} equipo={eq} />)}
                  </div>
                )}
              </Desplegable>
              <Desplegable titulo="Por centro y subsede" icono={MapPin}>
                <CentroBreakdown centros={centros} equipos={equipos} alertas={alertas} parches={parches} ordenes={ordenes} />
              </Desplegable>
            </>
          )}

          {area === "gestion" && (
            <>
              <div className="bg-white rounded-2xl p-5" style={sombra}>
                <h3 className="text-sm font-bold text-slate-700 mb-3">Pedidos de Movilización al Taller</h3>
                <CoordinacionTaller resumen={r.coordinacion} verDetalle={verDetalleOT}
                  porRevisar={solicitudes.filter(s => esSolicitudDeFlota(s, equipos.find(e => e.id === s.equipo_id))).length} />
              </div>
              <Desplegable titulo={`Compras de repuestos e insumos (${compras.length})`} icono={ShoppingCart}>
                {compras.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-6">No hay compras registradas.</p>
                ) : (
                  <div className="space-y-2 max-h-[30rem] overflow-y-auto pr-1">
                    {compras.slice(0, 40).map(sol => {
                      const cfg = COMPRA_ESTADO[sol.estado] || COMPRA_ESTADO.pendiente;
                      return (
                        <div key={`${sol._area}-${sol.id}`} className="bg-white rounded-xl p-3 flex items-center gap-3 border border-slate-100">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 flex-shrink-0">{sol._area}</span>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-slate-800 text-sm truncate">{sol.repuesto_nombre}</p>
                            <p className="text-[11px] text-slate-400 truncate">{sol.cantidad} unid. · {sol.solicitante_nombre || sol.solicitante_email}</p>
                          </div>
                          <span className="text-[11px] font-bold px-2 py-1 rounded-full flex-shrink-0" style={{ background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                          <button onClick={() => setSelSeguimiento(sol)} className="text-xs font-bold text-indigo-700 flex-shrink-0">Seguimiento</button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Desplegable>
            </>
          )}

          {area === "movilizacion" && (
            <div className="bg-white rounded-2xl p-5" style={sombra}>
              <h3 className="text-sm font-bold text-slate-700 mb-3">Quién tiene cada vehículo los próximos 7 días</h3>
              <FlotaSemanaMini vehiculos={vehiculos} asignaciones={asignaciones} prestamos={prestamos} taller={r.taller} />
            </div>
          )}

          {area === "taller" && (
            <Desplegable titulo={`Órdenes de trabajo (${ordenes.length})`} icono={ClipboardList}>
              <div className="relative mb-3">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input value={busquedaOT} onChange={(e) => setBusquedaOT(e.target.value)}
                  placeholder="Buscar por N° de OT, vehículo, patente, mecánico o falla..."
                  className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-sm" />
              </div>
              <div className="flex flex-wrap gap-2 mb-3">
                {FILTROS_OT.map(f => (
                  <button key={f.value} onClick={() => setFiltroEstadoOT(f.value)}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold"
                    style={filtroEstadoOT === f.value
                      ? { background: "#7c3aed", color: "white" }
                      : { background: "white", color: "#64748b", border: "1px solid #e2e8f0" }}>
                    {f.label}
                  </button>
                ))}
              </div>
              {ordenesFiltradas.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">Ninguna orden coincide con el filtro.</p>
              ) : (
                <div className="space-y-2 max-h-[30rem] overflow-y-auto pr-1">
                  {ordenesFiltradas.map(ot => <OrdenFila key={ot.id} ot={ot} verDetalle={verDetalleOT} />)}
                </div>
              )}
            </Desplegable>
          )}
        </section>

        {/* 3. Lo que el Monitor puede hacer además de mirar: dejar una nota. */}
        <Desplegable titulo="Notas y consultas por equipo" icono={MessageCircle}
          ayuda="El hilo lo ven el Jefe de Taller y el Encargado de Salud del centro.">
          <select value={equipoSeleccionado} onChange={(e) => setEquipoSeleccionado(e.target.value)}
            className="w-full sm:w-96 border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white mb-3">
            <option value="">Elige un equipo o vehículo...</option>
            {equipos.slice()
              .sort((a, b) => {
                const rango = (e) => e.tipo === "ambulancia" ? 0 : esVehiculo(e.tipo) ? 1 : 2;
                return rango(a) - rango(b);
              })
              .map((e) => (
                <option key={e.id} value={e.id}>
                  {e.marca} {e.modelo}{e.patente ? ` · ${e.patente}` : ""} — {e.centro_principal}{e.subsede ? " / " + e.subsede : ""}
                </option>
              ))}
          </select>
          {equipoSeleccionado && (() => {
            const eq = equipos.find((e) => e.id === equipoSeleccionado);
            // La OT abierta del equipo, si tiene: así el comentario llega al taller.
            const otAbierta = ordenes
              .filter((o) => o.equipo_id === equipoSeleccionado && o.estado !== "completada" && o.estado !== "cancelada")
              .sort((a, b) => new Date(b.created_date) - new Date(a.created_date))[0];
            return (
              <>
                <p className="text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 mb-3">
                  {otAbierta
                    ? <>Este hilo queda ligado a la <strong>OT {otAbierta.numero_ot || otAbierta.id}</strong>: el taller lo ve en la orden.</>
                    : "Este equipo no tiene una orden abierta: el comentario queda en su ficha."}
                </p>
                <ComentariosEquipo
                  equipoId={equipoSeleccionado}
                  equipoLabel={eq ? `${eq.marca} ${eq.modelo}` : equipoSeleccionado}
                  ordenTrabajoId={otAbierta?.id}
                  currentUser={currentUser}
                />
              </>
            );
          })()}
        </Desplegable>
      </div>

      <SeguimientoCompraModal
        solicitud={selSeguimiento}
        user={currentUser}
        onClose={() => setSelSeguimiento(null)}
        onActualizado={fetchData}
        readOnly
        {...(selSeguimiento?._entidad ? { entityName: selSeguimiento._entidad } : {})}
      />
    </div>
  );
}

/* ══════════════════════════════════════════════
   Piezas del panel
══════════════════════════════════════════════ */
function Indicadores({ lista }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {lista.map((k, i) => (
        <div key={i} className="bg-white rounded-2xl p-4" style={sombra}>
          <p className={`text-2xl lg:text-3xl font-bold ${k.malo ? "text-red-600" : "text-slate-800"}`}>{k.valor}</p>
          <p className="text-xs text-slate-600 font-medium leading-tight mt-0.5">{k.etiqueta}</p>
          {k.contexto && <p className="text-[11px] text-slate-400 mt-0.5">{k.contexto}</p>}
        </div>
      ))}
    </div>
  );
}

function Atencion({ lista }) {
  if (!lista.length) {
    return (
      <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 flex items-center gap-3 text-sm text-green-800">
        <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" /> Nada que requiera atención.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {lista.map((a, i) => {
        const t = TONO[a.tono] || TONO.gris;
        return (
          <div key={i} className="rounded-2xl border px-4 py-3 flex items-start gap-3"
            style={{ background: t.fondo, borderColor: t.borde }}>
            <Circle className="w-2.5 h-2.5 mt-1.5 flex-shrink-0" fill={t.punto} stroke="none" />
            <div className="min-w-0">
              <p className="text-sm font-semibold" style={{ color: t.texto }}>{a.titulo}</p>
              {a.detalle && <p className="text-xs mt-0.5" style={{ color: t.texto, opacity: 0.85 }}>{a.detalle}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Desplegable({ titulo, icono: Icono, ayuda, children }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <div className="bg-white rounded-2xl" style={sombra}>
      <button type="button" onClick={() => setAbierto(a => !a)} aria-expanded={abierto}
        className="w-full flex items-center gap-2 px-5 py-4 text-left">
        {Icono && <Icono className="w-4 h-4 text-slate-400" />}
        <span className="text-sm font-bold text-slate-700 flex-1">{titulo}</span>
        {ayuda && <span className="hidden sm:inline text-xs text-slate-400">{ayuda}</span>}
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${abierto ? "rotate-180" : ""}`} />
      </button>
      {abierto && <div className="px-5 pb-5">{children}</div>}
    </div>
  );
}

/* ══════════════════════════════════════════════
   Filas de los listados (solo lectura)
══════════════════════════════════════════════ */
function EquipoFila({ equipo }) {
  const estado = ESTADOS_EQUIPO.find(e => e.value === equipo.estado) || ESTADOS_EQUIPO[0];
  const tipoLabel = TIPOS_EQUIPO.find(t => t.value === equipo.tipo)?.label || equipo.tipo || "—";
  const Icon = equipo.patente ? Car : Monitor;
  const ubicacion = [equipo.centro_principal, equipo.subsede, equipo.ubicacion_especifica].filter(Boolean).join(" / ");

  return (
    <div className="bg-white rounded-2xl p-3.5 flex items-center gap-3" style={{ boxShadow: "0 4px 14px rgba(15,45,107,0.06)" }}>
      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: estado.bg }}>
        <Icon className="w-5 h-5" style={{ color: estado.color }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-bold text-slate-800 text-sm truncate">{equipo.marca} {equipo.modelo}</p>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{tipoLabel}</span>
        </div>
        <div className="flex items-center gap-3 flex-wrap mt-0.5 text-[11px] text-slate-400">
          {equipo.patente && <span className="flex items-center gap-1"><Hash className="w-3 h-3" />{equipo.patente}</span>}
          {!equipo.patente && equipo.numero_serie && <span className="flex items-center gap-1"><Hash className="w-3 h-3" />{equipo.numero_serie}</span>}
          {ubicacion && <span className="flex items-center gap-1 truncate"><MapPin className="w-3 h-3 flex-shrink-0" />{ubicacion}</span>}
        </div>
      </div>
      <span className="text-[11px] font-bold px-2 py-1 rounded-full flex-shrink-0" style={{ background: estado.bg, color: estado.color }}>
        {estado.label}
      </span>
    </div>
  );
}

function OrdenFila({ ot, verDetalle }) {
  const color = OT_ESTADO_COLORS[ot.estado] || "#64748b";
  const label = OT_ESTADO_LABELS[ot.estado] || ot.estado || "—";
  const prio = OT_PRIORIDAD[ot.prioridad] || OT_PRIORIDAD.media;
  const fecha = ot.created_date ? format(parseISO(ot.created_date), "dd-MM-yyyy") : "";
  const vehiculo = ot.equipo_label || ot.marca_modelo || "Sin vehículo asociado";

  return (
    <div className="bg-white rounded-2xl p-3.5 flex items-center gap-3" style={{ boxShadow: "0 4px 14px rgba(15,45,107,0.06)" }}>
      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: color + "15" }}>
        <Wrench className="w-5 h-5" style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-bold text-slate-800 text-sm">{ot.numero_ot || "OT"}</p>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: color + "15", color }}>{label}</span>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: prio.bg, color: prio.color }}>{prio.label}</span>
        </div>
        <p className="text-xs text-slate-600 truncate mt-0.5">{vehiculo}{ot.patente ? ` · ${ot.patente}` : ""}</p>
        <div className="flex items-center gap-3 flex-wrap mt-0.5 text-[11px] text-slate-400">
          {fecha && <span>{fecha}</span>}
          <span className="truncate">{ot.mecanico_nombre || ot.mecanico_email || "Sin mecánico asignado"}</span>
          {ot.total > 0 && <span className="font-semibold text-slate-500">${Number(ot.total).toLocaleString("es-CL")}</span>}
        </div>
      </div>
      {verDetalle && (
        <Link to={`/OrdenTrabajoDetalle/${ot.id}`}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold flex-shrink-0"
          style={{ background: "#F5F3FF", color: "#6D28D9", border: "1px solid #DDD6FE" }}>
          <Eye className="w-3.5 h-3.5" /> Ver
        </Link>
      )}
    </div>
  );
}
