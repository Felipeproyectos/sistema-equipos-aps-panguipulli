import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { base44 } from "@/api/base44Client";
import {
  Monitor, AlertTriangle, ClipboardCheck, ClipboardList, Activity,
  Wrench, Package, CheckCircle2, TrendingUp, BarChart3,
  ShieldCheck, RefreshCw, Heart, Stethoscope, ShoppingCart
} from "lucide-react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar,
  XAxis, YAxis, Tooltip, CartesianGrid
} from "recharts";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { differenceInDays, parseISO } from "date-fns";
import usePullToRefresh from "@/hooks/usePullToRefresh";
import KpiCard from "@/components/monitor/KpiCard";
import CentroBreakdown from "@/components/monitor/CentroBreakdown";
import { getCentrosEstructura } from "@/lib/centros";
import ComentariosEquipo from "@/components/monitor/ComentariosEquipo";
import SeguimientoCompraModal from "@/components/taller/SeguimientoCompraModal";
import { MessageCircle } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";

const ESTADO_EQUIPO_COLORS = {
  operativo: "#16a34a",
  mantenimiento: "#d97706",
  fuera_de_servicio: "#dc2626",
};

const OT_ESTADO_LABELS = {
  pendiente: "Pendiente",
  asignada: "Asignada",
  en_proceso: "En Proceso",
  pausada: "Pausada",
  completada: "Completada",
  cancelada: "Cancelada",
};
const OT_ESTADO_COLORS = {
  pendiente: "#d97706",
  asignada: "#2563eb",
  en_proceso: "#7c3aed",
  pausada: "#64748b",
  completada: "#16a34a",
  cancelada: "#dc2626",
};

const ALERTA_TIPO_LABELS = {
  parche_vencido: "Parche vencido",
  parche_por_vencer: "Parche por vencer",
  bateria_vencida: "Batería vencida",
  bateria_por_vencer: "Batería por vencer",
  mantenimiento_requerido: "Mant. requerido",
  equipo_fuera_servicio: "Fuera de servicio",
};

const COMPRA_ESTADO = {
  pendiente: { label: "Pendiente", color: "#D97706", bg: "#FEF3C7", icon: ClipboardList },
  aprobada: { label: "Pendiente de Compra", color: "#D97706", bg: "#FEF3C7", icon: ShoppingCart },
  comprada: { label: "Comprada", color: "#2563EB", bg: "#DBEAFE", icon: Package },
  recibida: { label: "Recibida en Bodega", color: "#16A34A", bg: "#DCFCE7", icon: CheckCircle2 },
  rechazada: { label: "Rechazada", color: "#DC2626", bg: "#FEE2E2", icon: AlertTriangle },
};

export default function MonitorCorporativo() {
  const { user: currentUser } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorCarga, setErrorCarga] = useState(null);
  const [equipoSeleccionado, setEquipoSeleccionado] = useState("");
  const [selSeguimiento, setSelSeguimiento] = useState(null);
  const [selSeguimientoSalud, setSelSeguimientoSalud] = useState(null);
  const containerRef = useRef(null);

  // Todo el tablero sale de getMonitorData. Si esa llamada falla y el error se
  // traga en silencio, la pantalla muestra 0 equipos, 0 alertas y 0 órdenes —
  // indistinguible de "todo en orden". En un sistema de equipamiento crítico
  // eso es peor que no mostrar nada: alguien puede concluir que no hay alertas
  // activas cuando en realidad no se sabe. Se guarda el fallo y se avisa.
  const fetchData = useCallback(async () => {
    let fallo = null;
    const [res, centros, solicitudesCompra, solicitudesCompraSalud] = await Promise.all([
      base44.functions.invoke('getMonitorData').catch((e) => { fallo = e; return { data: {} }; }),
      getCentrosEstructura().catch(() => []),
      base44.entities.SolicitudRepuesto.list("-created_date", 100).catch(() => []),
      base44.entities.SolicitudRepuestoSalud.list("-created_date", 100).catch(() => []),
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
      proveedores: d.proveedores || [],
      centros,
      solicitudesCompra,
      solicitudesCompraSalud,
    });
  }, []);

  useEffect(() => { fetchData().finally(() => setLoading(false)); }, [fetchData]);
  const { refreshing } = usePullToRefresh(fetchData, containerRef);

  const { equipos = [], parches = [], alertas = [], solicitudes = [], inspecciones = [], ordenes = [], repuestos = [], proveedores = [], centros = [], solicitudesCompra = [], solicitudesCompraSalud = [] } = data || {};
  const hoy = new Date();
  const compraPendientes = solicitudesCompra.filter(s => s.estado === "aprobada");
  const compraCompradas = solicitudesCompra.filter(s => s.estado === "comprada");
  const compraRecibidas = solicitudesCompra.filter(s => s.estado === "recibida");
  const compraSaludPendientes = solicitudesCompraSalud.filter(s => s.estado === "aprobada");
  const compraSaludCompradas = solicitudesCompraSalud.filter(s => s.estado === "comprada");
  const compraSaludRecibidas = solicitudesCompraSalud.filter(s => s.estado === "recibida");

  const kpis = useMemo(() => {
    const operativos = equipos.filter(e => e.estado === "operativo");
    const enMantenimiento = equipos.filter(e => e.estado === "mantenimiento");
    const fueraServicio = equipos.filter(e => e.estado === "fuera_de_servicio");
    const ambulancias = equipos.filter(e => e.tipo === "ambulancia");
    const deas = equipos.filter(e => e.tipo === "dea" || e.tipo === "monitor_desfibrilador");
    const parchesVencidos = parches.filter(p => differenceInDays(parseISO(p.fecha_vencimiento), hoy) < 0);
    const alertasCriticas = alertas.filter(a => a.nivel === "critica");

    const otPendientes = ordenes.filter(o => o.estado === "pendiente");
    const otEnProceso = ordenes.filter(o => ["asignada", "en_proceso"].includes(o.estado));
    const otCompletadas = ordenes.filter(o => o.estado === "completada");
    const otPorInspeccion = ordenes.filter(o => o.origen === "inspeccion");
    const stockBajo = repuestos.filter(r => (r.stock_actual || 0) <= (r.stock_minimo || 0));
    const valorInventario = repuestos.reduce((s, r) => s + (r.precio_unitario || 0) * (r.stock_actual || 0), 0);
    const totalCostoOT = ordenes.reduce((s, o) => s + (o.total || 0), 0);
    const proveedoresActivos = proveedores.filter(p => p.activo !== false);

    const estadoEquiposData = [
      { name: "Operativos", value: operativos.length, color: ESTADO_EQUIPO_COLORS.operativo },
      { name: "En Mantención", value: enMantenimiento.length, color: ESTADO_EQUIPO_COLORS.mantenimiento },
      { name: "Fuera Servicio", value: fueraServicio.length, color: ESTADO_EQUIPO_COLORS.fuera_de_servicio },
    ];

    const otEstadosData = Object.keys(OT_ESTADO_LABELS).map(k => ({
      name: OT_ESTADO_LABELS[k],
      value: ordenes.filter(o => o.estado === k).length,
      color: OT_ESTADO_COLORS[k],
    })).filter(d => d.value > 0);

    const alertasPorTipo = Object.keys(ALERTA_TIPO_LABELS).map(k => ({
      name: ALERTA_TIPO_LABELS[k],
      value: alertas.filter(a => a.tipo === k).length,
    })).filter(d => d.value > 0);

    return {
      operativos, enMantenimiento, fueraServicio, ambulancias, deas,
      parchesVencidos, alertasCriticas,
      otPendientes, otEnProceso, otCompletadas, otPorInspeccion,
      stockBajo, valorInventario, totalCostoOT, proveedoresActivos,
      estadoEquiposData, otEstadosData, alertasPorTipo,
    };
  }, [equipos, parches, alertas, ordenes, repuestos, proveedores]);

  const {
    operativos, enMantenimiento, fueraServicio, ambulancias, deas,
    parchesVencidos, alertasCriticas,
    otPendientes, otEnProceso, otCompletadas, otPorInspeccion,
    stockBajo, valorInventario, totalCostoOT, proveedoresActivos,
    estadoEquiposData, otEstadosData, alertasPorTipo,
  } = kpis;

  if (loading || !data) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div ref={containerRef} className="min-h-screen" style={{ background: "#f8fafc", overscrollBehavior: "none" }}>
      {refreshing && (
        <div className="flex items-center justify-center py-3 lg:hidden">
          <RefreshCw className="w-5 h-5 text-indigo-500 animate-spin" />
        </div>
      )}

      {/* Header */}
      <div className="relative overflow-hidden px-4 lg:px-10 pt-6 lg:pt-12 pb-6 lg:pb-10"
        style={{ background: "linear-gradient(135deg, #6366F1 0%, #4F46E5 100%)" }}>
        <div className="absolute right-8 top-1/2 -translate-y-1/2 w-56 h-56 rounded-full opacity-20 border-4 border-white hidden lg:block"
          style={{ background: "radial-gradient(circle, rgba(255,255,255,0.15) 0%, transparent 70%)" }} />
        <div className="relative max-w-6xl mx-auto flex items-center gap-3">
          <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(255,255,255,0.2)" }}>
            <ShieldCheck className="w-5 h-5 lg:w-6 lg:h-6 text-white" />
          </div>
          <div>
            <p className="text-indigo-100 text-[10px] lg:text-xs font-semibold uppercase tracking-widest hidden sm:block">Visualización Estratégica Global</p>
            <h1 className="text-xl lg:text-4xl font-bold text-white leading-tight">Monitor Corporativo</h1>
            <p className="text-indigo-50 text-xs lg:text-sm mt-0.5">KPIs consolidados · Área Salud y Taller · Solo lectura</p>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 lg:px-10 mt-4 lg:mt-6 pb-10 space-y-6 relative z-10">

        {/* Los ceros de abajo solo son reales si los datos llegaron. */}
        {errorCarga && (
          <div className="rounded-2xl px-4 py-3 flex items-start gap-3"
            style={{ background: "#FEF2F2", border: "1px solid #FECACA" }}>
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: "#DC2626" }} />
            <div>
              <p className="text-sm font-bold" style={{ color: "#B91C1C" }}>
                No se pudieron cargar los datos del monitor
              </p>
              <p className="text-xs mt-0.5" style={{ color: "#DC2626" }}>
                Los números que ves abajo están en cero porque falló la consulta al servidor,
                no porque no haya equipos, alertas ni órdenes. No tomes decisiones con esta
                pantalla hasta que se recupere. — {errorCarga}
              </p>
            </div>
          </div>
        )}

        {/* KPIs Globales */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
          <KpiCard label="Equipos Totales" value={equipos.length} icon={Monitor} color="#6d28d9" bg="#f5f3ff" sub={`${ambulancias.length} ambulancias · ${deas.length} DEA`} />
          <KpiCard label="Alertas Activas" value={alertas.length} icon={AlertTriangle} color="#dc2626" bg="#fee2e2" sub={`${alertasCriticas.length} críticas`} />
          <KpiCard label="OT en Gestión" value={otPendientes.length + otEnProceso.length} icon={Wrench} color="#d97706" bg="#fffbeb" sub={`${otCompletadas.length} completadas`} />
          <KpiCard label="Inventario Repuestos" value={repuestos.length} icon={Package} color="#4f46e5" bg="#e0e7ff" sub={`${stockBajo.length} con stock bajo`} />
        </div>

        {/* ===== ÁREA SALUD ===== */}
        <SeccionArea
          titulo="Área de Salud" subtitulo="Equipos médicos, alertas e inspecciones"
          icon={Stethoscope} color="#16a34a" bg="#f0fdf4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            <KpiCard label="Operativos" value={operativos.length} total={equipos.length} icon={CheckCircle2} color="#16a34a" bg="#dcfce7" />
            <KpiCard label="En Mantención" value={enMantenimiento.length} icon={Wrench} color="#d97706" bg="#fef9c3" />
            <KpiCard label="Fuera de Servicio" value={fueraServicio.length} icon={AlertTriangle} color="#dc2626" bg="#fee2e2" />
            <KpiCard label="Parches Vencidos" value={parchesVencidos.length} icon={Heart} color="#dc2626" bg="#fef2f2" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Pie estado equipos */}
            <div className="bg-white rounded-2xl p-5" style={{ boxShadow: "0 4px 20px rgba(15,45,107,0.06)" }}>
              <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-green-600" /> Estado de Equipos
              </h3>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={estadoEquiposData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={65} innerRadius={35}
                    label={({ value }) => value} labelLine={false}>
                    {estadoEquiposData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap justify-center gap-3 mt-2">
                {estadoEquiposData.map((d, i) => (
                  <span key={i} className="flex items-center gap-1.5 text-xs text-slate-600">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />{d.name}
                  </span>
                ))}
              </div>
            </div>
            {/* Alertas por tipo */}
            <div className="bg-white rounded-2xl p-5" style={{ boxShadow: "0 4px 20px rgba(15,45,107,0.06)" }}>
              <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600" /> Alertas por Tipo
              </h3>
              {alertasPorTipo.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-xs">
                  <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-200" />Sin alertas activas
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={alertasPorTipo} layout="vertical" margin={{ left: 10, right: 10 }}>
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="value" fill="#dc2626" radius={[0, 4, 4, 0]} barSize={16} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
            {/* Pendientes salud */}
            <div className="bg-white rounded-2xl p-5 space-y-3" style={{ boxShadow: "0 4px 20px rgba(15,45,107,0.06)" }}>
              <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-amber-600" /> Pendientes Salud
              </h3>
              <FilaPendiente icon={ClipboardCheck} color="#d97706" label="Bitácoras por revisar" valor={inspecciones.length} to="RevisionInspecciones" />
              <FilaPendiente icon={ClipboardList} color="#2563eb" label="Solicitudes pendientes" valor={solicitudes.length} to="SolicitudesV2" />
              <FilaPendiente icon={AlertTriangle} color="#dc2626" label="Alertas activas" valor={alertas.length} to="AlertasV2" />
              <FilaPendiente icon={Heart} color="#dc2626" label="Parches vencidos" valor={parchesVencidos.length} to="Equipos2" />
            </div>
          </div>
        </SeccionArea>

        {/* ===== ÁREA TALLER ===== */}
        <SeccionArea
          titulo="Área de Taller" subtitulo="Órdenes de trabajo, repuestos y proveedores"
          icon={Wrench} color="#7c3aed" bg="#f5f3ff">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            <KpiCard label="OT Pendientes" value={otPendientes.length} icon={ClipboardList} color="#d97706" bg="#fffbeb" />
            <KpiCard label="OT En Proceso" value={otEnProceso.length} icon={Activity} color="#7c3aed" bg="#f5f3ff" />
            <KpiCard label="OT Completadas" value={otCompletadas.length} icon={CheckCircle2} color="#16a34a" bg="#dcfce7" />
            <KpiCard label="OT desde Inspección" value={otPorInspeccion.length} icon={ClipboardCheck} color="#2563eb" bg="#eff6ff" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* OT por estado */}
            <div className="bg-white rounded-2xl p-5" style={{ boxShadow: "0 4px 20px rgba(15,45,107,0.06)" }}>
              <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-violet-600" /> OT por Estado
              </h3>
              {otEstadosData.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-xs">
                  <Wrench className="w-8 h-8 mx-auto mb-2 text-slate-200" />Sin órdenes de trabajo
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={otEstadosData} margin={{ left: -20, right: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-15} textAnchor="end" height={50} />
                    <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]} barSize={28}>
                      {otEstadosData.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
            {/* Resumen costos */}
            <div className="bg-white rounded-2xl p-5" style={{ boxShadow: "0 4px 20px rgba(15,45,107,0.06)" }}>
              <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-blue-600" /> Resumen de Costos
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-500">Valor Inventario</span>
                  <span className="text-sm font-bold text-slate-700">${valorInventario.toLocaleString("es-CL")}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-500">Costo Total OT</span>
                  <span className="text-sm font-bold text-slate-700">${totalCostoOT.toLocaleString("es-CL")}</span>
                </div>
                <div className="h-px bg-slate-100" />
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-700">Proveedores Activos</span>
                  <span className="text-lg font-bold text-violet-700">{proveedoresActivos.length}</span>
                </div>
                <Link to={createPageUrl("Proveedores")} className="block text-xs text-violet-600 font-semibold mt-2 hover:underline">
                  Ver directorio →
                </Link>
              </div>
            </div>
            {/* Stock bajo */}
            <div className="bg-white rounded-2xl p-5" style={{ boxShadow: "0 4px 20px rgba(15,45,107,0.06)" }}>
              <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                <Package className="w-4 h-4 text-red-600" /> Repuestos Stock Bajo
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">{stockBajo.length}</span>
              </h3>
              {stockBajo.length === 0 ? (
                <div className="text-center py-6 text-slate-400 text-xs">
                  <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-200" />Stock suficiente en todos los repuestos
                </div>
              ) : (
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {stockBajo.slice(0, 8).map(r => (
                    <div key={r.id} className="flex items-center justify-between text-xs">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-700 truncate">{r.nombre}</p>
                        <p className="text-slate-400">{r.categoria}</p>
                      </div>
                      <span className="font-bold text-red-600 flex-shrink-0 ml-2">{r.stock_actual || 0}/{r.stock_minimo || 0}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </SeccionArea>

        {/* ===== SOLICITUDES DE COMPRA DE TALLER ===== */}
        <SeccionArea
          titulo="Solicitudes de Compra de Taller" subtitulo="Repuestos solicitados por el Jefe de Taller y gestionados por Compras · Solo lectura"
          icon={ShoppingCart} color="#2563eb" bg="#eff6ff">
          <div className="grid grid-cols-3 gap-3 mb-5">
            <KpiCard label="Pendientes de Compra" value={compraPendientes.length} icon={ShoppingCart} color="#d97706" bg="#fffbeb" />
            <KpiCard label="Compradas" value={compraCompradas.length} icon={Package} color="#2563eb" bg="#eff6ff" />
            <KpiCard label="Recibidas en Bodega" value={compraRecibidas.length} icon={CheckCircle2} color="#16a34a" bg="#dcfce7" />
          </div>
          {solicitudesCompra.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center" style={{ boxShadow: "0 4px 20px rgba(15,45,107,0.06)" }}>
              <ShoppingCart className="w-10 h-10 text-slate-200 mx-auto mb-2" />
              <p className="text-slate-400 text-sm">No hay solicitudes de compra registradas.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {solicitudesCompra.slice(0, 12).map(sol => {
                const cfg = COMPRA_ESTADO[sol.estado] || COMPRA_ESTADO.pendiente;
                const Icon = cfg.icon;
                return (
                  <div key={sol.id} className="bg-white rounded-2xl p-4 flex items-center gap-3" style={{ boxShadow: "0 4px 14px rgba(15,45,107,0.06)" }}>
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: cfg.bg }}>
                      <Icon className="w-5 h-5" style={{ color: cfg.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-800 text-sm truncate">{sol.repuesto_nombre}</p>
                      <p className="text-[11px] text-slate-400">{sol.numero_solicitud} · {sol.cantidad} unid. · {sol.solicitante_nombre || sol.solicitante_email}</p>
                    </div>
                    <span className="text-[11px] font-bold px-2 py-1 rounded-full flex-shrink-0 hidden sm:inline" style={{ background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                    <button onClick={() => setSelSeguimiento(sol)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold flex-shrink-0" style={{ background: "#EFF6FF", color: "#1D4ED8", border: "1px solid #BFDBFE" }}>
                      <ClipboardList className="w-3.5 h-3.5" /> Ver Seguimiento
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </SeccionArea>

        {/* ===== SOLICITUDES DE COMPRA DE SALUD ===== */}
        <SeccionArea
          titulo="Solicitudes de Compra de Salud" subtitulo="Insumos médicos (parches, baterías, electrodos) solicitados por Encargado de Salud y gestionados por Compras Salud · Solo lectura"
          icon={Heart} color="#0d9488" bg="#ccfbf1">
          <div className="grid grid-cols-3 gap-3 mb-5">
            <KpiCard label="Pendientes de Compra" value={compraSaludPendientes.length} icon={ShoppingCart} color="#d97706" bg="#fffbeb" />
            <KpiCard label="Compradas" value={compraSaludCompradas.length} icon={Package} color="#0d9488" bg="#ccfbf1" />
            <KpiCard label="Recibidas en Bodega" value={compraSaludRecibidas.length} icon={CheckCircle2} color="#16a34a" bg="#dcfce7" />
          </div>
          {solicitudesCompraSalud.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center" style={{ boxShadow: "0 4px 20px rgba(15,45,107,0.06)" }}>
              <Heart className="w-10 h-10 text-slate-200 mx-auto mb-2" />
              <p className="text-slate-400 text-sm">No hay solicitudes de compra de insumos médicos.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {solicitudesCompraSalud.slice(0, 12).map(sol => {
                const cfg = COMPRA_ESTADO[sol.estado] || COMPRA_ESTADO.pendiente;
                const Icon = cfg.icon;
                return (
                  <div key={sol.id} className="bg-white rounded-2xl p-4 flex items-center gap-3" style={{ boxShadow: "0 4px 14px rgba(15,45,107,0.06)" }}>
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: cfg.bg }}>
                      <Icon className="w-5 h-5" style={{ color: cfg.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-800 text-sm truncate">{sol.repuesto_nombre}</p>
                      <p className="text-[11px] text-slate-400">{sol.numero_solicitud} · {sol.cantidad} unid. · {sol.solicitante_nombre || sol.solicitante_email}</p>
                    </div>
                    <span className="text-[11px] font-bold px-2 py-1 rounded-full flex-shrink-0 hidden sm:inline" style={{ background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                    <button onClick={() => setSelSeguimientoSalud(sol)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold flex-shrink-0" style={{ background: "#CCFBF1", color: "#0F766E", border: "1px solid #99F6E4" }}>
                      <ClipboardList className="w-3.5 h-3.5" /> Ver Seguimiento
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </SeccionArea>

        {/* ===== NOTAS Y CONSULTAS (bidireccional: Monitor Corporativo, Jefe de Taller, Encargado Salud) ===== */}
        <SeccionArea
          titulo="Notas y Consultas" subtitulo="Hilo por equipo, visible para Monitor Corporativo, Jefe de Taller y Encargado Salud del centro"
          icon={MessageCircle} color="#4f46e5" bg="#eef2ff">
          <div className="mb-3">
            <select
              value={equipoSeleccionado}
              onChange={(e) => setEquipoSeleccionado(e.target.value)}
              className="w-full sm:w-96 border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
            >
              <option value="">Selecciona un equipo para ver/dejar notas...</option>
              {equipos
                .slice()
                .sort((a, b) => (a.tipo === "ambulancia" ? -1 : 1))
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.tipo === "ambulancia" ? "🚑" : "🩺"} {e.marca} {e.modelo} — {e.centro_principal}{e.subsede ? " / " + e.subsede : ""}
                  </option>
                ))}
            </select>
          </div>
          {equipoSeleccionado && (() => {
            const eq = equipos.find((e) => e.id === equipoSeleccionado);
            // La OT abierta del equipo, si tiene. Sin esto el comentario se
            // guardaba con orden_trabajo_id vacio y no llegaba nunca al taller:
            // ComentariosEquipo ya aceptaba la prop, pero nadie se la pasaba.
            const otAbierta = ordenes
              .filter((o) => o.equipo_id === equipoSeleccionado && o.estado !== "completada" && o.estado !== "cancelada")
              .sort((a, b) => new Date(b.created_date) - new Date(a.created_date))[0];
            return (
              <>
                {otAbierta ? (
                  <p className="text-xs text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2 mb-3">
                    Este hilo queda ligado a la <strong>OT {otAbierta.numero_ot || otAbierta.id}</strong>
                    {" "}({String(otAbierta.estado || "").replace(/_/g, " ")}) — el taller lo ve en la orden.
                  </p>
                ) : (
                  <p className="text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 mb-3">
                    Este equipo no tiene una orden de trabajo abierta: el comentario queda en su ficha.
                  </p>
                )}
                <ComentariosEquipo
                  equipoId={equipoSeleccionado}
                  equipoLabel={eq ? `${eq.marca} ${eq.modelo}` : equipoSeleccionado}
                  ordenTrabajoId={otAbierta?.id}
                  currentUser={currentUser}
                />
              </>
            );
          })()}
        </SeccionArea>

        {/* ===== DISTRIBUCIÓN POR CENTRO Y SUCURSAL ===== */}
        <CentroBreakdown
          centros={centros}
          equipos={equipos}
          alertas={alertas}
          parches={parches}
          ordenes={ordenes}
        />

      </div>

      <SeguimientoCompraModal
        solicitud={selSeguimiento}
        user={currentUser}
        onClose={() => setSelSeguimiento(null)}
        onActualizado={fetchData}
        readOnly
      />
      <SeguimientoCompraModal
        solicitud={selSeguimientoSalud}
        user={currentUser}
        onClose={() => setSelSeguimientoSalud(null)}
        onActualizado={fetchData}
        readOnly
        entityName="SolicitudRepuestoSalud"
      />
    </div>
  );
}

function SeccionArea({ titulo, subtitulo, icon: Icon, color, bg, children }) {
  return (
    <div className="bg-white/60 rounded-3xl p-5 lg:p-6" style={{ boxShadow: "0 4px 24px rgba(15,45,107,0.06)" }}>
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: bg }}>
          <Icon className="w-5 h-5" style={{ color }} />
        </div>
        <div>
          <h2 className="text-lg font-bold" style={{ color }}>{titulo}</h2>
          <p className="text-xs text-slate-500">{subtitulo}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function FilaPendiente({ icon: Icon, color, label, valor, to }) {
  return (
    <Link to={createPageUrl(to)} className="flex items-center gap-3 p-2 rounded-xl hover:bg-slate-50 transition-colors">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: color + "15" }}>
        <Icon className="w-4 h-4" style={{ color }} />
      </div>
      <span className="text-xs text-slate-600 flex-1">{label}</span>
      <span className="text-sm font-bold" style={{ color }}>{valor}</span>
    </Link>
  );
}