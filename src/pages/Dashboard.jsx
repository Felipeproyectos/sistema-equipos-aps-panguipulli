import { useState, useEffect, useCallback, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { esRolTaller, ROLES } from "@/lib/roles";
import {
  Monitor, AlertTriangle, ClipboardList, Activity, Zap, Car, Wrench,
  CheckCircle, Bell, User, MapPin, ChevronRight, RefreshCw,
  Package, ClipboardCheck, TrendingUp, ArrowRight, QrCode
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Link, Navigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { differenceInDays, parseISO, formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import usePullToRefresh from "@/hooks/usePullToRefresh";
import TallerDashboard from "@/pages/TallerDashboard";
import MonitorCorporativo from "@/pages/MonitorCorporativo";
import { useAuth } from "@/lib/AuthContext";
import { getEffectiveNavRole } from "@/lib/roleSimulator";

const TIPO_ACT_LABEL = {
  mantenimiento_preventivo: "Mantenimiento Preventivo",
  mantenimiento_correctivo: "Mantenimiento Correctivo",
  inspeccion: "Inspección",
  inspeccion_semanal: "Inspección Semanal",
  inspeccion_anual: "Inspección Anual",
  inspeccion_rutinaria: "Inspección Diaria",
  incidente: "Incidente",
  traslado: "Traslado",
  otros: "Otros",
  error_calibracion: "Error Calibración"
};

const TIPO_ACT_COLOR = {
  mantenimiento_preventivo: { bg: "#eff6ff", color: "#2563eb", icon: Wrench },
  mantenimiento_correctivo: { bg: "#fef2f2", color: "#dc2626", icon: Wrench },
  inspeccion: { bg: "#f0fdf4", color: "#16a34a", icon: CheckCircle },
  inspeccion_semanal: { bg: "#f0fdf4", color: "#16a34a", icon: CheckCircle },
  inspeccion_anual: { bg: "#eff6ff", color: "#2563eb", icon: CheckCircle },
  inspeccion_rutinaria: { bg: "#f5f3ff", color: "#7c3aed", icon: CheckCircle },
  incidente: { bg: "#fef2f2", color: "#dc2626", icon: AlertTriangle },
  traslado: { bg: "#fdf4ff", color: "#7c3aed", icon: MapPin },
  otros: { bg: "#f8fafc", color: "#64748b", icon: Activity },
  error_calibracion: { bg: "#fff7ed", color: "#ea580c", icon: AlertTriangle }
};

export default function Dashboard() {
  const { user } = useAuth();
  // Rol efectivo: cuando Base del Sistema simula otro rol, este es el rol que
  // determina qué dashboard ver (igual que el menú lateral). Sin simulación,
  // coincide con user.role. Esto evita que el contenido quede "pegado" en el
  // dashboard del rol real mientras el menú muestra el rol simulado.
  const effectiveRole = getEffectiveNavRole(user?.role);
  const [equipos, setEquipos] = useState([]);
  const [parches, setParches] = useState([]);
  const [solicitudes, setSolicitudes] = useState([]);
  const [actividades, setActividades] = useState([]);
  const [alertas, setAlertas] = useState([]);
  const [bitacorasPendientes, setBitacorasPendientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef(null);

  const fetchData = useCallback(async () => {
    // El mecánico se redirige a su módulo de Órdenes de Trabajo;
    // no necesita cargar ningún listado del dashboard.
    if (effectiveRole === ROLES.MECANICO) return;
    // El taller (jefe/encargado compras) solo necesita equipos y
    // actividades. Se omiten los 4 listados de salud (parches, solicitudes,
    // alertas, bitácoras) para acelerar la carga inicial.
    const esTaller = esRolTaller(effectiveRole);
    // Equipos y parches se obtienen vía función backend (asServiceRole + auth.me)
    // porque la RLS integrada no resuelve centro_principal/centros_asignados
    // para encargados de salud ni para usuarios (chofer). La función aplica el
    // scoping por rol/centro en el servidor.
    const equiposRes = base44.functions.invoke('getEquiposPorCentro').then(r => r.data || {}).catch(() => ({}));
    const acts = base44.entities.Actividad.list('-created_date', 50).catch(() => []);
    if (esTaller) {
      const [eq, a] = await Promise.all([equiposRes, acts]);
      setEquipos(eq.equipos || []);
      setActividades(a);
      return;
    }
    const [eq, a, sols, alts, insps] = await Promise.all([
      equiposRes, acts,
      base44.entities.Solicitud.list('-fecha', 200).catch(() => []),
      base44.entities.Alerta.filter({ estado: 'activa' }, '-created_date', 500).catch(() => []),
      base44.entities.InspeccionPendiente.filter({ estado: 'pendiente' }, '-created_date', 500).catch(() => []),
    ]);
    setEquipos(eq.equipos || []);
    setActividades(a);
    setParches(eq.parches || []);
    setSolicitudes(sols);
    setAlertas(alts);
    setBitacorasPendientes(insps);
  }, [user, effectiveRole]);

  useEffect(() => {
    if (!user) return;
    fetchData().finally(() => setLoading(false));
  }, [fetchData, user]);

  const { refreshing } = usePullToRefresh(fetchData, containerRef);

  const esTallerUser = esRolTaller(effectiveRole);
  // El mecánico aterriza directo en su módulo de Órdenes de Trabajo.
  if (effectiveRole === ROLES.MECANICO && !loading) return <Navigate to="/OrdenesTrabajo" replace />;
  // El Jefe de Taller visualiza el mismo dashboard consolidado que el Monitor
  // Corporativo (Área Salud + Taller), que se ve ordenado y profesional.
  if (effectiveRole === ROLES.JEFE_TALLER && !loading) return <MonitorCorporativo />;
  // El resto de roles de taller ven un panel enfocado en órdenes y solicitudes.
  if (esTallerUser && !loading) return <TallerDashboard user={user} />;
  const hoy = new Date();
  const vencidos = parches.filter(p => differenceInDays(parseISO(p.fecha_vencimiento), hoy) < 0);
  const operativos = equipos.filter(e => e.estado === "operativo");
  const enMantenimiento = equipos.filter(e => e.estado === "mantenimiento");
  const fueraServicio = equipos.filter(e => e.estado === "fuera_de_servicio");
  const pendientesSolicitudes = solicitudes.filter(s => s.estado === "pendiente");

  // Total notificaciones prioritarias
  const totalNotif = alertas.length + bitacorasPendientes.length + vencidos.length;

  return (
    <div ref={containerRef} className="min-h-screen" style={{ background: "#e8f4fd", overscrollBehavior: "none" }}>
      {loading && (
        <div className="fixed top-0 left-0 right-0 z-50 h-1 overflow-hidden" style={{ background: "#bfdbfe" }}>
          <div className="h-full w-1/3 animate-pulse" style={{ background: "#2563eb" }} />
        </div>
      )}
      {refreshing && (
        <div className="flex items-center justify-center py-3 lg:hidden">
          <RefreshCw className="w-5 h-5 text-blue-500 animate-spin" />
        </div>
      )}

      {/* Header */}
      <div className="relative overflow-hidden px-4 lg:px-10 pt-6 lg:pt-12 pb-6 lg:pb-8"
        style={{ background: "linear-gradient(135deg, #0f2d6b 0%, #1565c0 40%, #29b6f6 100%)" }}>
        <div className="absolute right-8 top-1/2 -translate-y-1/2 w-56 h-56 rounded-full opacity-20 border-4 border-white hidden lg:block"
          style={{ background: "radial-gradient(circle, rgba(255,255,255,0.15) 0%, transparent 70%)" }} />
        <div className="relative max-w-6xl mx-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(255,255,255,0.2)" }}>
                <Activity className="w-5 h-5 lg:w-6 lg:h-6 text-white" />
              </div>
              <div>
                <p className="text-cyan-200 text-[10px] lg:text-xs font-semibold uppercase tracking-widest hidden sm:block">Sistema de Gestión de Equipos Críticos</p>
                <h1 className="text-xl lg:text-4xl font-bold text-white leading-tight">Dashboard</h1>
                <p className="text-blue-100 text-xs lg:text-sm mt-0.5">Hola, {user?.full_name?.split(" ")[0] || "Usuario"}</p>
              </div>
            </div>
            {totalNotif > 0 && (
              <div className="lg:hidden flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: "rgba(220,38,38,0.25)", border: "1px solid rgba(255,255,255,0.2)" }}>
                <Bell className="w-4 h-4 text-white" />
                <span className="text-white font-bold text-sm">{totalNotif}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="max-w-6xl mx-auto px-4 lg:px-10 pt-4 lg:pt-6 mb-4 lg:mb-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
          {[
            { label: "Actividades Hoy", value: actividades.filter(a => a.fecha === hoy.toISOString().split("T")[0]).length, icon: TrendingUp, color: "#2563eb", bg: "#eff6ff" },
            { label: "Equipos Operativos", value: operativos.length, total: equipos.length, icon: Monitor, color: "#16a34a", bg: "#dcfce7" },
            { label: "Alertas Activas", value: alertas.length, icon: Bell, color: "#dc2626", bg: "#fee2e2" },
            { label: "Bitácoras Pendientes", value: bitacorasPendientes.length, icon: ClipboardCheck, color: "#d97706", bg: "#fef9c3" },
          ].map((s, i) => {
            const Icon = s.icon;
            return (
              <div key={i} className="bg-white rounded-2xl p-4 lg:p-5 transition-all duration-300"
                style={{ boxShadow: "0 4px 20px rgba(21,101,192,0.10)" }}>
                <div className="flex items-center gap-3 lg:block">
                  <div className="w-9 h-9 lg:w-11 lg:h-11 rounded-xl flex items-center justify-center flex-shrink-0 lg:mb-3" style={{ background: s.bg }}>
                    <Icon className="w-4 h-4 lg:w-5 lg:h-5" style={{ color: s.color }} />
                  </div>
                  <div>
                    <p className="text-2xl lg:text-3xl font-bold" style={{ color: s.color }}>{s.value}</p>
                    <p className="text-xs text-slate-500 font-medium leading-tight">{s.label}</p>
                    {s.total !== undefined && <p className="text-xs text-slate-400 hidden lg:block mt-0.5">de {s.total} totales</p>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Contenido principal */}
      <div className="max-w-6xl mx-auto px-4 lg:px-10 pb-10 grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">

        {/* ===== COLUMNA PRINCIPAL: Actividades ===== */}
        <div className="lg:col-span-2 space-y-6">

          {/* Actividades recientes — protagonista */}
          <div className="bg-white rounded-2xl shadow-lg overflow-hidden" style={{ boxShadow: "0 8px 32px rgba(21,101,192,0.10)" }}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between"
              style={{ background: "linear-gradient(90deg, #0f2d6b 0%, #1565c0 100%)" }}>
              <h2 className="font-bold text-white flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "rgba(255,255,255,0.2)" }}>
                  <Activity className="w-4 h-4 text-white" />
                </div>
                Actividades Recientes
              </h2>
              <Link to={createPageUrl("Actividades")}
                className="text-xs text-blue-200 font-semibold flex items-center gap-1 hover:text-white transition-colors">
                Ver todas <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="divide-y divide-slate-50">
              {actividades.slice(0, 20).map(act => {
                const equipo = equipos.find(e => e.id === act.equipo_id);
                const cfg = TIPO_ACT_COLOR[act.tipo] || TIPO_ACT_COLOR.otros;
                const ActIcon = cfg.icon;
                let timeAgo = "";
                try {
                  timeAgo = act.created_date
                    ? formatDistanceToNow(new Date(act.created_date), { addSuffix: true, locale: es })
                    : act.fecha;
                } catch { timeAgo = act.fecha; }
                return (
                  <div key={act.id} className="px-4 lg:px-6 py-3 lg:py-3.5 flex items-start gap-3 lg:gap-4 hover:bg-slate-50 transition-colors">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: cfg.bg }}>
                      <ActIcon className="w-4 h-4" style={{ color: cfg.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-800">
                            {TIPO_ACT_LABEL[act.tipo] || act.tipo}
                          </p>
                          {equipo && (
                            <p className="text-xs text-slate-500 mt-0.5 truncate">
                              {equipo.marca} {equipo.modelo}
                              {equipo.patente ? ` · ${equipo.patente}` : ""}
                              {equipo.centro_principal ? ` · ${equipo.centro_principal}` : ""}
                            </p>
                          )}
                          {act.usuario_nombre && (
                            <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                              <User className="w-3 h-3 flex-shrink-0" />{act.usuario_nombre}
                            </p>
                          )}
                          {act.observaciones && (
                            <p className="text-xs text-slate-400 mt-0.5 break-words line-clamp-2">{act.observaciones}</p>
                          )}
                        </div>
                        <span className="text-xs font-medium flex-shrink-0 whitespace-nowrap" style={{ color: cfg.color }}>{timeAgo}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
              {actividades.length === 0 && (
                <div className="px-6 py-12 text-center text-slate-400 text-sm">
                  <Activity className="w-10 h-10 mx-auto mb-2 opacity-20" />
                  Sin actividades registradas
                </div>
              )}
            </div>

            {actividades.length > 20 && (
              <div className="px-6 py-3 border-t border-slate-100 text-center">
                <Link to={createPageUrl("Actividades")}
                  className="text-xs text-blue-600 font-semibold flex items-center justify-center gap-1 hover:gap-2 transition-all">
                  Ver todas las actividades <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            )}
          </div>

          {/* Estado de Equipos (secundario) */}
          <div className="bg-white rounded-2xl shadow-lg overflow-hidden" style={{ boxShadow: "0 8px 32px rgba(21,101,192,0.10)" }}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-bold text-slate-800 flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center">
                  <Monitor className="w-4 h-4 text-blue-600" />
                </div>
                Estado de Equipos
              </h2>
              <Link to={createPageUrl("Equipos2")} className="text-xs text-blue-600 font-semibold flex items-center gap-1 hover:gap-2 transition-all">
                Ver todos <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div className="px-6 py-3 grid grid-cols-3 divide-x divide-slate-100" style={{ background: "#f8fafc" }}>
              {[
                { label: "Operativos", n: operativos.length, color: "#16a34a" },
                { label: "En Mantención", n: enMantenimiento.length, color: "#d97706" },
                { label: "Fuera Servicio", n: fueraServicio.length, color: "#dc2626" }
              ].map(s => (
                <div key={s.label} className="text-center px-3">
                  <p className="text-2xl font-bold" style={{ color: s.color }}>{s.n}</p>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
            <div className="divide-y divide-slate-50">
              {equipos.slice(0, 6).map(e => {
                const TIPO_ICON = { ambulancia: Car, dea: Zap, monitor_desfibrilador: Activity, monitor_multiparametros: Monitor };
                const EIcon = TIPO_ICON[e.tipo] || Monitor;
                const estadoCfg = {
                  operativo: { dot: "#16a34a", label: "Operativo" },
                  mantenimiento: { dot: "#d97706", label: "Mantención" },
                  fuera_de_servicio: { dot: "#dc2626", label: "Fuera Serv." }
                }[e.estado] || { dot: "#94a3b8", label: e.estado };
                return (
                  <div key={e.id} className="px-6 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "#eff6ff" }}>
                        <EIcon className="w-4 h-4 text-blue-600" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{e.marca} {e.modelo}</p>
                        <p className="text-xs text-slate-400">{e.centro_principal}{e.subsede ? ` / ${e.subsede}` : ""}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full" style={{ background: estadoCfg.dot }} />
                      <span className="text-xs font-semibold" style={{ color: estadoCfg.dot }}>{estadoCfg.label}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ===== COLUMNA LATERAL: Notificaciones prioritarias ===== */}
        <div className="space-y-4">

          {/* Banner notificaciones */}
          {totalNotif > 0 && (
            <div className="rounded-2xl px-5 py-4 flex items-center gap-3"
              style={{ background: "linear-gradient(135deg, #7f1d1d, #dc2626)", boxShadow: "0 4px 20px rgba(220,38,38,0.3)" }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(255,255,255,0.2)" }}>
                <Bell className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-bold text-white text-sm">{totalNotif} {totalNotif === 1 ? "notificación" : "notificaciones"} pendiente{totalNotif !== 1 ? "s" : ""}</p>
                <p className="text-red-200 text-xs mt-0.5">Requieren atención inmediata</p>
              </div>
            </div>
          )}

          {/* Alertas activas */}
          {alertas.length > 0 && (
            <div className="bg-white rounded-2xl shadow-lg overflow-hidden" style={{ boxShadow: "0 8px 32px rgba(220,38,38,0.12)" }}>
              <div className="px-5 py-4 border-b border-red-50 flex items-center justify-between" style={{ background: "#fff5f5" }}>
                <h2 className="font-bold text-red-800 flex items-center gap-2 text-sm">
                  <div className="w-6 h-6 rounded-lg bg-red-100 flex items-center justify-center">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                  </div>
                  Alertas Activas
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">{alertas.length}</span>
                </h2>
                <Link to={createPageUrl("AlertasV2")} className="text-xs text-red-600 font-semibold flex items-center gap-1 hover:gap-2 transition-all">
                  Ver <ChevronRight className="w-3 h-3" />
                </Link>
              </div>
              <div className="divide-y divide-slate-50">
                {alertas.slice(0, 5).map(al => {
                  const equipo = equipos.find(eq => eq.id === al.equipo_id);
                  const nivelCfg = {
                    critica: { bg: "#fee2e2", color: "#dc2626", label: "CRÍTICA" },
                    advertencia: { bg: "#fef9c3", color: "#d97706", label: "ADVERTENCIA" },
                    info: { bg: "#eff6ff", color: "#2563eb", label: "INFO" }
                  }[al.nivel] || { bg: "#f1f5f9", color: "#64748b", label: al.nivel };
                  return (
                    <div key={al.id} className="px-5 py-3 flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: nivelCfg.bg }}>
                        <AlertTriangle className="w-3.5 h-3.5" style={{ color: nivelCfg.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-slate-800">{equipo?.marca} {equipo?.modelo}</p>
                        <p className="text-xs text-slate-500 mt-0.5 leading-snug">{al.descripcion}</p>
                        <span className="text-xs font-bold mt-1 inline-block px-2 py-0.5 rounded-full"
                          style={{ background: nivelCfg.bg, color: nivelCfg.color }}>
                          {nivelCfg.label}
                        </span>
                      </div>
                    </div>
                  );
                })}
                {vencidos.length > 0 && vencidos.slice(0, 2).map(p => {
                  const equipo = equipos.find(eq => eq.id === p.equipo_id);
                  return (
                    <div key={p.id} className="px-5 py-3 flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Package className="w-3.5 h-3.5 text-red-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-slate-800">{equipo?.marca} {equipo?.modelo}</p>
                        <p className="text-xs text-slate-500 mt-0.5">Parche {p.tipo} vencido</p>
                        <span className="text-xs font-bold mt-1 inline-block px-2 py-0.5 rounded-full bg-red-100 text-red-700">VENCIDO</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Bitácoras / Inspecciones pendientes de revisión */}
          {bitacorasPendientes.length > 0 && (
            <div className="bg-white rounded-2xl shadow-lg overflow-hidden" style={{ boxShadow: "0 8px 32px rgba(217,119,6,0.12)" }}>
              <div className="px-5 py-4 border-b border-amber-50 flex items-center justify-between" style={{ background: "#fffbeb" }}>
                <h2 className="font-bold text-amber-800 flex items-center gap-2 text-sm">
                  <div className="w-6 h-6 rounded-lg bg-amber-100 flex items-center justify-center">
                    <ClipboardCheck className="w-3.5 h-3.5 text-amber-600" />
                  </div>
                  Bitácoras por Revisar
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">{bitacorasPendientes.length}</span>
                </h2>
                <Link to={createPageUrl("RevisionInspecciones")} className="text-xs text-amber-600 font-semibold flex items-center gap-1 hover:gap-2 transition-all">
                  Revisar <ChevronRight className="w-3 h-3" />
                </Link>
              </div>
              <div className="divide-y divide-slate-50">
                {bitacorasPendientes.slice(0, 6).map(bit => {
                  const tipoLabel = {
                    inspeccion_semanal: "Inspección Semanal",
                    inspeccion_diaria: "Inspección Diaria",
                    turno_chofer: "Turno Chofer",
                    inspeccion_anual: "Inspección Anual"
                  }[bit.tipo_formulario] || bit.tipo_formulario;
                  let timeAgo = "";
                  try {
                    timeAgo = bit.created_date
                      ? formatDistanceToNow(new Date(bit.created_date), { addSuffix: true, locale: es })
                      : bit.fecha;
                  } catch { timeAgo = bit.fecha; }
                  return (
                    <div key={bit.id} className="px-5 py-3 flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <ClipboardList className="w-3.5 h-3.5 text-amber-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-slate-800">{tipoLabel}</p>
                        <p className="text-xs text-slate-500 truncate mt-0.5">{bit.equipo_label || "Equipo"}</p>
                        {bit.conductor && (
                          <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                            <User className="w-3 h-3" />{bit.conductor}
                          </p>
                        )}
                        <p className="text-xs text-amber-600 font-medium mt-0.5">{timeAgo}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="px-5 py-3 border-t border-slate-100">
                <Link to={createPageUrl("RevisionInspecciones")}
                  className="text-xs text-amber-600 font-semibold flex items-center gap-1 hover:gap-2 transition-all">
                  Ir a revisar todas <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          )}

          {/* Sin notificaciones */}
          {totalNotif === 0 && (
            <div className="bg-white rounded-2xl p-6 text-center shadow-lg" style={{ boxShadow: "0 8px 32px rgba(21,101,192,0.10)" }}>
              <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
                <CheckCircle className="w-6 h-6 text-green-500" />
              </div>
              <p className="font-bold text-slate-700 text-sm">Todo en orden</p>
              <p className="text-xs text-slate-400 mt-1">Sin alertas ni bitácoras pendientes</p>
            </div>
          )}

          {/* Solicitudes pendientes */}
          {pendientesSolicitudes.length > 0 && (
            <div className="bg-white rounded-2xl shadow-lg overflow-hidden" style={{ boxShadow: "0 8px 32px rgba(21,101,192,0.10)" }}>
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <h2 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
                  <div className="w-6 h-6 rounded-lg bg-slate-100 flex items-center justify-center">
                    <ClipboardList className="w-3.5 h-3.5 text-slate-600" />
                  </div>
                  Solicitudes Pendientes
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{pendientesSolicitudes.length}</span>
                </h2>
              </div>
              <div className="divide-y divide-slate-50">
                {pendientesSolicitudes.slice(0, 4).map(sol => {
                  const equipo = equipos.find(e => e.id === sol.equipo_id);
                  return (
                    <div key={sol.id} className="px-5 py-3">
                      <p className="text-xs font-semibold text-slate-800">{sol.tipo?.replace(/_/g, " ")}</p>
                      {equipo && <p className="text-xs text-slate-500">{equipo.marca} {equipo.modelo}</p>}
                      <p className="text-xs text-slate-400 mt-0.5">{sol.centro || "—"} · {sol.fecha}</p>
                    </div>
                  );
                })}
              </div>
              <div className="px-5 py-3 border-t border-slate-100">
                <Link to={createPageUrl("SolicitudesV2")} className="text-xs text-blue-600 font-semibold flex items-center gap-1 hover:gap-2 transition-all">
                  Ver todas <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          )}
          {/* QR Bitácora Pública — solo perfiles de salud/administración */}
          {!esTallerUser && <QRBitacoraCard />}

        </div>

      </div>
    </div>
  );
}

function QRBitacoraCard() {
  const qrRef = useRef(null);
  const url = "https://gestion.apscolab.com/bitacora-publica";

  const handleDownload = () => {
    const svg = qrRef.current?.querySelector("svg");
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement("canvas");
    canvas.width = 300; canvas.height = 300;
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.onload = () => {
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, 300, 300);
      ctx.drawImage(img, 0, 0, 300, 300);
      const a = document.createElement("a");
      a.download = "qr-bitacora.png";
      a.href = canvas.toDataURL("image/png");
      a.click();
    };
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
  };

  return (
    <div className="bg-white rounded-2xl shadow-lg overflow-hidden" style={{ boxShadow: "0 8px 32px rgba(21,101,192,0.10)" }}>
      <div className="px-5 py-4 border-b border-blue-50 flex items-center gap-2" style={{ background: "#eff6ff" }}>
        <div className="w-6 h-6 rounded-lg bg-blue-100 flex items-center justify-center">
          <QrCode className="w-3.5 h-3.5 text-blue-600" />
        </div>
        <h2 className="font-bold text-blue-800 text-sm">Pautas de Inspección</h2>
      </div>
      <div className="px-5 py-4 flex flex-col items-center gap-3">
        <p className="text-xs text-slate-500 text-center">Escanea este QR para completar una pauta de inspección sin necesidad de cuenta.</p>
        <div ref={qrRef} className="p-3 border-2 border-slate-200 rounded-xl bg-white">
          <QRCodeSVG value={url} size={140} bgColor="#ffffff" fgColor="#1e293b" level="H" />
        </div>
        <button onClick={handleDownload}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold text-white"
          style={{ background: "#2563eb" }}>
          Descargar QR
        </button>
      </div>
    </div>
  );
}