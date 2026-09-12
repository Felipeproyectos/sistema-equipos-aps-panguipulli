import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import {
  X, Edit, Trash2, Plus, Info, Wrench, ClipboardCheck, Package, BookOpen, Hammer,
  MapPin, Calendar, User, Upload, AlertTriangle, Activity, Car, Zap, Monitor,
  Hash, Gauge, FileText, Shield, CheckCircle, Clock, ArrowLeft,
  Loader2, ExternalLink, Printer, ChevronDown
} from "lucide-react";
import { TIPOS_EQUIPO, ESTADOS_EQUIPO, resolverUbicacion } from "@/lib/centros";
import { esRolTaller, ROLES } from "@/lib/roles";
import RepuestosTab from "./RepuestosTab";
import ChecklistPlano from "./ChecklistPlano";
import ImprimirHistorialModal from "./ImprimirHistorialModal";
import PautaInspeccionSemanal from "@/components/bitacora/PautaInspeccionSemanal";
import PautaPlaceholder from "@/components/bitacora/PautaPlaceholder";
import PautaSemanalDesfibrilador from "@/components/bitacora/PautaSemanalDesfibrilador";
import PautaSemanalMultiparametros from "@/components/bitacora/PautaSemanalMultiparametros";
import PautaDiariaAmbulancia from "@/components/bitacora/PautaDiariaAmbulancia";
import TallerTab from "./TallerTab";
import { format, parseISO, differenceInDays } from "date-fns";
import { generarPDFEquipo } from "@/utils/generarPDFEquipo";

const TIPO_ICONS = { dea: Zap, monitor_desfibrilador: Activity, ambulancia: Car, monitor_multiparametros: Monitor };

export default function EquipoDetalleModal({ equipo, parches, onClose, onEdit, onDeleted, user, onActividadCreada }) {
  const [actividades, setActividades] = useState([]);
  const [deleting, setDeleting] = useState(false);
  const [tab, setTab] = useState("info");

  const isAdmin = user?.role === "admin";

  const handleImprimirInforme = async () => {
    let conductorActivo = equipo.conductor_responsable;
    try {
      const kms = await base44.entities.Kilometraje.filter({ equipo_id: equipo.id }, "-created_date", 50);
      const activo = kms.find(r => !r.km_final);
      if (activo?.conductor) conductorActivo = activo.conductor;
    } catch (_) {}
    generarPDFEquipo({ equipo: { ...equipo, conductor_responsable: conductorActivo }, actividades, parches });
  };
  const estado = ESTADOS_EQUIPO.find(e => e.value === equipo.estado) || ESTADOS_EQUIPO[0];
  const tipoLabel = TIPOS_EQUIPO.find(t => t.value === equipo.tipo)?.label || equipo.tipo;
  const Icon = TIPO_ICONS[equipo.tipo] || Monitor;
  const esAmbulancia = equipo.tipo === "ambulancia";

  useEffect(() => {
    base44.entities.Actividad.filter({ equipo_id: equipo.id }, "-created_date", 100).then(setActividades).catch(() => {});
  }, [equipo.id]);

  const reloadActividades = () => {
    base44.entities.Actividad.filter({ equipo_id: equipo.id }, "-created_date", 100).then(setActividades).catch(() => {});
    onActividadCreada && onActividadCreada();
  };

  const handleDelete = async () => {
    if (!confirm("¿Eliminar este equipo? Quedará oculto de los listados pero se conserva en el historial para auditoría.")) return;
    setDeleting(true);
    // Soft delete: se marca inactivo en vez de borrar el registro real, para
    // que Base del Sistema siempre pueda auditar qué se eliminó y cuándo.
    await base44.entities.Equipo.update(equipo.id, { activo: false });
    onDeleted();
  };

  const estadoColor = { operativo: "#10B981", mantenimiento: "#F59E0B", fuera_de_servicio: "#EF4444" }[equipo.estado] || "#94A3B8";
  const estadoBg = { operativo: "#ECFDF5", mantenimiento: "#FFFBEB", fuera_de_servicio: "#FEF2F2" }[equipo.estado] || "#F8FAFC";

  const sinParches = ["monitor_multiparametros", "monitor_desfibrilador"].includes(equipo.tipo);

  // La pestaña "Repuestos" (gestión de repuestos críticos del vehículo) es
  // exclusiva del área Taller + Base del Sistema. Los perfiles de Salud no la
  // usan, ya que el inventario y reposición de insumos médicos se gestiona
  // en otro módulo.
  const puedeVerRepuestos = esRolTaller(user?.role) || user?.role === ROLES.SUPER_ADMIN;

  const navItems = [
    { key: "info", label: "Información", icon: Info },
    { key: "mantenimiento", label: "Mantenimiento Externo", icon: Wrench },
    { key: "inspecciones", label: "Mantenimiento Interno", icon: ClipboardCheck },
    ...(!esAmbulancia && !sinParches ? [{ key: "parches", label: "Parches", icon: Package }] : []),
    ...(esAmbulancia ? [
      { key: "taller", label: "Taller", icon: Hammer },
      ...(puedeVerRepuestos ? [{ key: "repuestos", label: "Repuestos", icon: Gauge }] : []),
      { key: "bitacora", label: "Bitácora", icon: BookOpen }
    ] : [])
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3"
      style={{ background: "rgba(15,23,42,0.55)", backdropFilter: "blur(6px)" }}>
      <div className="bg-white w-full max-w-4xl max-h-[94vh] flex flex-col overflow-hidden"
        style={{ borderRadius: "20px", boxShadow: "0 24px 60px rgba(0,0,0,0.22)" }}>

        {/* ── TOP HEADER ── */}
        <div style={{ background: "linear-gradient(135deg, #0F172A 0%, #1E3A5F 60%, #1D4ED8 100%)", borderRadius: "20px 20px 0 0" }}>
          <div className="px-6 pt-5 pb-4">
            {/* breadcrumb */}
            <div className="flex items-center gap-2 text-xs text-blue-300 mb-3">
              <span>Equipos</span>
              <span>›</span>
              <span className="text-white font-medium">{tipoLabel}</span>
            </div>
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1"
                    style={{ background: estadoBg, color: estadoColor }}>
                    <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: estadoColor }} />
                    {estado.label}
                  </span>
                  {equipo.patente && (
                    <span className="text-xs text-blue-200 font-medium">Patente: {equipo.patente}</span>
                  )}
                  <span className="text-xs text-blue-300 flex items-center gap-1">
                    <Hash className="w-3 h-3" />{equipo.numero_inventario}
                  </span>
                </div>
                <h2 className="text-2xl font-bold text-white" style={{ letterSpacing: "-0.03em" }}>
                  {tipoLabel} — {equipo.marca} {equipo.modelo}
                </h2>
              </div>
              <div className="flex items-center gap-2 ml-4">
                <button onClick={handleImprimirInforme}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all hover:bg-white/20"
                  style={{ border: "1px solid rgba(255,255,255,0.3)" }}>
                  <Printer className="w-3.5 h-3.5" /> Imprimir
                </button>
                <button onClick={onEdit}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all hover:bg-white/20"
                  style={{ border: "1px solid rgba(255,255,255,0.3)" }}>
                  <Edit className="w-3.5 h-3.5" /> Editar
                </button>
                {isAdmin && (
                  <button onClick={handleDelete} disabled={deleting}
                    className="px-3 py-2 rounded-xl text-sm font-semibold text-red-300 hover:bg-red-900/30 transition-all"
                    style={{ border: "1px solid rgba(239,68,68,0.3)" }}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
                <button onClick={onClose}
                  className="w-9 h-9 flex items-center justify-center rounded-xl text-blue-300 hover:bg-white/10 transition-all">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Nav tabs */}
            <div className="flex gap-1 mt-4">
              {navItems.map(item => {
                const ItemIcon = item.icon;
                const active = tab === item.key;
                return (
                  <button key={item.key} onClick={() => setTab(item.key)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-t-xl text-sm font-medium transition-all"
                    style={active
                      ? { background: "white", color: "#1D4ED8" }
                      : { background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.7)" }}>
                    <ItemIcon className="w-3.5 h-3.5" />
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── CONTENT ── */}
        <div className="flex-1 overflow-y-auto" style={{ background: "#F8FAFC" }}>
          <div className="p-6">
            {tab === "info" && <InfoTab equipo={equipo} />}
            {tab === "mantenimiento" && <MantenimientoTab equipo={equipo} actividades={actividades} user={user} onUpdated={reloadActividades} />}
            {tab === "inspecciones" && <InspeccionesTab equipo={equipo} actividades={actividades} user={user} onUpdated={reloadActividades} />}
            {tab === "parches" && <ParchesTab equipo={equipo} parches={parches} user={user} onUpdated={onActividadCreada} />}
            {tab === "taller" && <TallerTab equipo={equipo} />}
            {tab === "repuestos" && <RepuestosTab equipo={equipo} user={user} />}
            {tab === "bitacora" && <BitacoraTab equipo={equipo} user={user} />}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════
   INFO TAB
══════════════════════════════════════════════ */
function InfoTab({ equipo }) {
  const hoy = new Date();
  const ubicacion = resolverUbicacion(equipo.centro_principal, equipo.subsede);
  const esAmbulancia = equipo.tipo === "ambulancia";
  const [ultimaSemanal, setUltimaSemanal] = useState(null);

  useEffect(() => {
    if (!esAmbulancia) return;
    base44.entities.Actividad.filter({ equipo_id: equipo.id })
      .then(acts => {
        const semanales = acts
          .filter(a => a.tipo === "inspeccion_semanal")
          .sort((a, b) => new Date(b.created_date || b.fecha) - new Date(a.created_date || a.fecha));
        setUltimaSemanal(semanales[0] || null);
      })
      .catch(() => {});
  }, [equipo.id, esAmbulancia]);

  const semaforoDoc = (estado, fechaVence) => {
    if (!estado && !fechaVence) return { color: "#94A3B8", bg: "#F8FAFC", label: "Sin datos", barColor: "#CBD5E1" };
    const dias = fechaVence ? differenceInDays(parseISO(fechaVence), hoy) : null;
    if (estado === "vencida" || estado === "vencido" || (dias !== null && dias < 0))
      return { color: "#EF4444", bg: "#FEF2F2", label: "Vencido", barColor: "#EF4444" };
    if (dias !== null && dias <= 30) return { color: "#EF4444", bg: "#FEF2F2", label: `${dias}d restantes`, barColor: "#EF4444" };
    if (dias !== null && dias <= 90) return { color: "#F59E0B", bg: "#FFFBEB", label: `${dias}d restantes`, barColor: "#F59E0B" };
    if (estado === "en_gestion") return { color: "#2563EB", bg: "#EFF6FF", label: "En Gestión", barColor: "#2563EB" };
    return { color: "#10B981", bg: "#ECFDF5", label: "Al día", barColor: "#10B981" };
  };

  const batDias = equipo.fecha_vencimiento_bateria
    ? differenceInDays(parseISO(equipo.fecha_vencimiento_bateria), hoy)
    : null;

  return (
    <div className="space-y-5">
      {/* Image + location row */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {/* Image */}
        <div className="md:col-span-3 relative rounded-2xl overflow-hidden bg-slate-200"
          style={{ minHeight: 200, border: "1px solid #E2E8F0" }}>
          {equipo.foto_url ? (
            <img src={equipo.foto_url} alt="equipo" className="w-full h-full object-cover" style={{ minHeight: 200 }} />
          ) : (
            <div className="w-full flex items-center justify-center" style={{ minHeight: 200, background: "linear-gradient(135deg,#EFF6FF,#E0E7FF)" }}>
              <div className="text-center">
                {equipo.tipo === "ambulancia" ? <Car className="w-16 h-16 text-blue-200 mx-auto mb-2" /> : <Monitor className="w-16 h-16 text-blue-200 mx-auto mb-2" />}
                <p className="text-xs text-slate-400">Sin imagen registrada</p>
              </div>
            </div>
          )}
          <div className="absolute bottom-0 left-0 right-0 px-4 py-3"
            style={{ background: "linear-gradient(to top, rgba(0,0,0,0.6), transparent)" }}>
            <p className="text-xs text-white/70 uppercase tracking-widest mb-0.5">Registro Visual</p>
            <p className="text-white font-bold">{equipo.marca} {equipo.modelo}</p>
          </div>
        </div>

        {/* Right column */}
        <div className="md:col-span-2 flex flex-col gap-3">
          {/* Marca & modelo */}
          <div className="bg-white rounded-2xl p-4 flex-1" style={{ border: "1px solid #E2E8F0" }}>
            <div className="mb-3">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-widest mb-1">Marca</p>
              <p className="text-xl font-bold text-slate-900">{equipo.marca}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-400 uppercase tracking-widest mb-1">Modelo</p>
              <p className="text-xl font-bold text-slate-900">{equipo.modelo}</p>
            </div>
          </div>

          {/* Location card */}
          <div className="rounded-2xl p-4 relative overflow-hidden"
            style={{ background: "linear-gradient(135deg, #1D4ED8, #2563EB)" }}>
            <div className="absolute -right-4 -bottom-4 w-20 h-20 rounded-full opacity-20" style={{ background: "white" }} />
            <p className="text-xs text-blue-200 uppercase tracking-widest mb-1">Ubicación Actual</p>
            <p className="text-white font-bold text-base leading-tight">
              {ubicacion.centro}
              {ubicacion.subsede && <span className="block text-blue-200 text-sm font-medium">{ubicacion.subsede}</span>}
            </p>
            {equipo.ubicacion_especifica && (
              <p className="text-blue-200 text-xs mt-1.5 flex items-center gap-1">
                <MapPin className="w-3 h-3" />{equipo.ubicacion_especifica}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Legal docs (ambulancia) */}
      {esAmbulancia && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { label: "Permiso de Circulación", icon: Shield, estado: equipo.estado_permiso_circulacion, fecha: equipo.fecha_vencimiento_permiso_circulacion },
            { label: "Revisión Técnica", icon: CheckCircle, estado: equipo.estado_revision_tecnica, fecha: equipo.fecha_vencimiento_revision_tecnica }
          ].map(({ label, icon: DIcon, estado, fecha }) => {
            const s = semaforoDoc(estado, fecha);
            const dias = fecha ? differenceInDays(parseISO(fecha), hoy) : null;
            const stateLabel = { ok: "Validado", en_gestion: "Agendada", pendiente: "Pendiente", vencida: "Vencida", vencido: "Vencido" }[estado] || estado || "—";
            return (
              <div key={label} className="bg-white rounded-2xl p-5 relative overflow-hidden"
                style={{ border: "1px solid #E2E8F0", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
                <div className="absolute top-0 left-0 w-1 h-full rounded-l-2xl" style={{ background: s.barColor }} />
                <div className="flex items-start justify-between mb-3 ml-2">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${s.color}15` }}>
                    <DIcon className="w-5 h-5" style={{ color: s.color }} />
                  </div>
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ color: s.color, background: s.bg }}>
                    {s.label}
                  </span>
                </div>
                <p className="font-semibold text-slate-800 ml-2 mb-3">{label}</p>
                <div className="grid grid-cols-2 gap-2 ml-2">
                  <div>
                    <p className="text-xs text-slate-400 uppercase tracking-widest mb-0.5">Estado</p>
                    <p className="text-sm font-semibold text-slate-700">{stateLabel}</p>
                  </div>
                  {fecha && (
                    <div>
                      <p className="text-xs text-slate-400 uppercase tracking-widest mb-0.5">Vencimiento</p>
                      <p className="text-sm font-semibold" style={{ color: dias !== null && dias < 30 ? s.color : "#1E293B" }}>
                        {format(parseISO(fecha), "dd/MM/yyyy")}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* General info grid */}
      <div className="bg-white rounded-2xl p-5" style={{ border: "1px solid #E2E8F0" }}>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Datos del Equipo</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            ["N° Serie", equipo.numero_serie],
            ["Año Adquisición", equipo.anio_adquisicion],
            ["Fecha Fabricación", equipo.fecha_fabricacion ? format(parseISO(equipo.fecha_fabricacion), "dd/MM/yyyy") : null],
            ["País de Origen", equipo.pais_origen],
            ["Proveedor", equipo.proveedor],
            ["Responsable", equipo.responsable || equipo.conductor_responsable],
            ...(batDias !== null ? [["Batería vence", format(parseISO(equipo.fecha_vencimiento_bateria), "dd/MM/yyyy")]] : []),
            ...(equipo.patente ? [["Patente", equipo.patente]] : [])
          ].filter(([, v]) => v).map(([k, v]) => (
            <div key={k} className="p-3 rounded-xl" style={{ background: "#F8FAFC", border: "1px solid #E2E8F0" }}>
              <p className="text-xs font-medium text-slate-400 mb-0.5">{k}</p>
              <p className="text-sm font-semibold text-slate-800">{v}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Battery alert */}
      {batDias !== null && batDias <= 90 && (
        <div className="flex items-center gap-3 p-4 rounded-2xl"
          style={{ background: batDias < 0 ? "#FEF2F2" : "#FFFBEB", border: `1px solid ${batDias < 0 ? "#FECACA" : "#FDE68A"}` }}>
          <AlertTriangle className="w-5 h-5 flex-shrink-0" style={{ color: batDias < 0 ? "#EF4444" : "#F59E0B" }} />
          <p className="text-sm font-medium" style={{ color: batDias < 0 ? "#DC2626" : "#B45309" }}>
            Batería {batDias < 0 ? `vencida hace ${Math.abs(batDias)} días` : `vence en ${batDias} días`}
          </p>
        </div>
      )}

      {equipo.notas && (
        <div className="p-4 rounded-2xl text-sm text-blue-800" style={{ background: "#EFF6FF", border: "1px solid #BFDBFE" }}>
          <p className="text-xs font-bold text-blue-500 uppercase tracking-widest mb-1">Notas</p>
          {equipo.notas}
        </div>
      )}

      {/* Resumen última pauta semanal (solo ambulancias) */}
      {esAmbulancia && <ResumenUltimaSemanal actividad={ultimaSemanal} />}
    </div>
  );
}

function ResumenUltimaSemanal({ actividad }) {
  if (!actividad) {
    return (
      <div className="p-4 rounded-2xl" style={{ background: "#F8FAFC", border: "1px solid #E2E8F0" }}>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-2">
          <ClipboardCheck className="w-3.5 h-3.5" /> Última Pauta Semanal
        </p>
        <p className="text-sm text-slate-400 italic">Sin inspecciones semanales registradas.</p>
      </div>
    );
  }

  // Parsear observaciones: separadas por " | "
  const lineas = actividad.observaciones?.split(" | ").filter(Boolean) || [];

  const fallas = lineas.filter(l => l.includes("Fallas:"));
  const danos = lineas.filter(l => l.startsWith("Daños reportados:"));
  const kmLinea = lineas.find(l => l.startsWith("KM Inicial:"));
  const combustibleLinea = lineas.find(l => l.startsWith("Combustible:"));

  const kmValor = kmLinea?.replace("KM Inicial:", "").trim();
  const combustible = combustibleLinea?.replace("Combustible:", "").trim();
  const sinFallas = fallas.length === 0 && danos.length === 0;

  const resultColor = sinFallas ? "#16A34A" : "#DC2626";
  const resultBg = sinFallas ? "#F0FDF4" : "#FEF2F2";
  const resultBorder = sinFallas ? "#BBF7D0" : "#FECACA";
  const resultLabel = sinFallas ? "Sin fallas detectadas" : "Con observaciones";

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${resultBorder}` }}>
      {/* Header */}
      <div className="px-5 py-3.5 flex items-center justify-between"
        style={{ background: resultBg }}>
        <div className="flex items-center gap-2">
          <ClipboardCheck className="w-4 h-4 flex-shrink-0" style={{ color: resultColor }} />
          <p className="text-xs font-bold uppercase tracking-widest" style={{ color: resultColor }}>
            Última Pauta Semanal
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold px-2.5 py-1 rounded-full"
            style={{ background: "white", color: resultColor, border: `1px solid ${resultBorder}` }}>
            {resultLabel}
          </span>
          <span className="text-xs text-slate-400">
            {actividad.fecha}{actividad.usuario_nombre ? ` · ${actividad.usuario_nombre}` : ""}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="bg-white px-5 py-4 space-y-3">
        {/* KM y combustible */}
        <div className="flex items-center gap-4 flex-wrap">
          {kmValor && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: "#EFF6FF", border: "1px solid #BFDBFE" }}>
              <Gauge className="w-3.5 h-3.5 text-blue-500" />
              <span className="text-xs font-semibold text-blue-700">KM Inicial: {Number(kmValor).toLocaleString()}</span>
            </div>
          )}
          {combustible && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: "#FFFBEB", border: "1px solid #FDE68A" }}>
              <span className="text-xs font-bold text-amber-600">⛽ Combustible: {combustible}</span>
            </div>
          )}
          {sinFallas && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: "#F0FDF4", border: "1px solid #BBF7D0" }}>
              <CheckCircle className="w-3.5 h-3.5 text-green-500" />
              <span className="text-xs font-semibold text-green-700">Todos los ítems en orden</span>
            </div>
          )}
        </div>

        {/* Fallas */}
        {fallas.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-bold text-red-500 uppercase tracking-widest flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" /> Fallas detectadas
            </p>
            {fallas.map((f, i) => {
              // Extraer nombre de sección y lista de fallas
              const secMatch = f.match(/\[([^\]]+)\]\s*Fallas:\s*(.+)/);
              const seccion = secMatch?.[1] || "";
              const items = secMatch?.[2] || f;
              return (
                <div key={i} className="flex items-start gap-2 p-2.5 rounded-xl"
                  style={{ background: "#FFF5F5", border: "1px solid #FECACA" }}>
                  <span className="text-red-400 font-bold text-xs flex-shrink-0 mt-0.5">⚠</span>
                  <div>
                    {seccion && <p className="text-xs font-bold text-red-600 mb-0.5">{seccion}</p>}
                    <p className="text-xs text-red-700 leading-relaxed">{items}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Daños visuales */}
        {danos.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-bold text-red-500 uppercase tracking-widest flex items-center gap-1">
              <Car className="w-3.5 h-3.5" /> Daños visuales reportados
            </p>
            {danos.map((d, i) => {
              const txt = d.replace("Daños reportados:", "").trim();
              return (
                <div key={i} className="p-2.5 rounded-xl text-xs text-red-700 leading-relaxed"
                  style={{ background: "#FFF5F5", border: "1px solid #FECACA" }}>
                  {txt}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════
   MANTENIMIENTO TAB
══════════════════════════════════════════════ */
function MantenimientoTab({ equipo, actividades, user, onUpdated }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ tipo: "mantenimiento_preventivo", fecha: new Date().toISOString().split("T")[0], observaciones: "", usuario_nombre: user?.full_name || "" });
  const [saving, setSaving] = useState(false);

  const mantenimientos = actividades
    .filter(a => ["mantenimiento_preventivo", "mantenimiento_correctivo", "otros"].includes(a.tipo))
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

  const tipoLabel = { mantenimiento_preventivo: "Mantenimiento Preventivo", mantenimiento_correctivo: "Mantenimiento Correctivo", otros: "Otros" };
  const tipoColor = { mantenimiento_preventivo: "#2563EB", mantenimiento_correctivo: "#EF4444", otros: "#8B5CF6" };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    await base44.entities.Actividad.create({ ...form, equipo_id: equipo.id });
    setSaving(false);
    setShowForm(false);
    onUpdated();
  };

  return (
    <div className="space-y-5">
      <SectionHeader title="Historial de Mantenimiento" count={mantenimientos.length} onAdd={() => setShowForm(!showForm)} />

      {showForm && (
        <ActividadForm
          form={form} setForm={setForm} saving={saving} onSave={handleSave} onCancel={() => setShowForm(false)}
          showFileUpload
          tipoOptions={[
            { value: "mantenimiento_preventivo", label: "Mantenimiento Preventivo" },
            { value: "mantenimiento_correctivo", label: "Mantenimiento Correctivo" },
            { value: "otros", label: "Otros" }
          ]}
        />
      )}

      {/* Informe de Mantenimiento Externo */}
      <InformeExternoCard equipo={equipo} user={user} onUpdated={onUpdated} />

      {mantenimientos.length === 0
        ? <EmptyState icon={Wrench} text="Sin registros de mantenimiento" />
        : mantenimientos.map(act => <ActivityCard key={act.id} act={act} tipoLabel={tipoLabel} tipoColor={tipoColor} showArchivo />)
      }
    </div>
  );
}

/* ══════════════════════════════════════════════
   INSPECCIONES TAB
══════════════════════════════════════════════ */
function InspeccionesTab({ equipo, actividades, user, onUpdated }) {
  // null = cerrado, "selector" = eligiendo tipo, "diaria"|"semanal"|"anual" = pauta abierta
  const [pautaActiva, setPautaActiva] = useState(null);
  const [showImprimir, setShowImprimir] = useState(false);
  // Para pauta diaria: "inicio" | "termino"
  const [momentoDiario, setMomentoDiario] = useState(null);

  const inspecciones = actividades
    .filter(a => ["inspeccion", "error_calibracion", "inspeccion_semanal", "inspeccion_anual", "inspeccion_rutinaria", "incidente"].includes(a.tipo))
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

  const totalInsp = inspecciones.length;
  const cumplimiento = totalInsp === 0 ? 100 : Math.round((inspecciones.filter(i => ["inspeccion","inspeccion_semanal","inspeccion_anual"].includes(i.tipo)).length / totalInsp) * 100);

  const hoy = new Date();
  const fechaVence = equipo.fecha_vencimiento_revision_tecnica;
  const diasVence = fechaVence ? Math.ceil((new Date(fechaVence) - hoy) / (1000 * 60 * 60 * 24)) : null;
  const estadoCert = equipo.estado_revision_tecnica;
  const certBadge = {
    ok: { label: "VIGENTE", color: "#16A34A", bg: "#F0FDF4" },
    en_gestion: { label: "EN GESTIÓN", color: "#2563EB", bg: "#EFF6FF" },
    pendiente: { label: "PENDIENTE", color: "#D97706", bg: "#FFFBEB" },
    vencida: { label: "VENCIDA", color: "#DC2626", bg: "#FEF2F2" }
  }[estadoCert] || { label: "SIN DATOS", color: "#94A3B8", bg: "#F8FAFC" };

  const esAmbulancia = equipo.tipo === "ambulancia";

  // Pauta completada
  const handlePautaSuccess = (msg) => {
    setPautaActiva(null);
    setMomentoDiario(null);
    onUpdated && onUpdated();
  };

  // Configs de pautas
  const TIPOS_PAUTA = [
    { id: "diaria", label: "Pauta Diaria", desc: "Inspección completa al inicio o término de turno — 6 secciones", color: "#7C3AED", bg: "#F5F3FF", tipoActividad: "inspeccion_rutinaria" },
    { id: "semanal", label: "Pauta Semanal", desc: "Inspección completa: luces, motor, accesorios y documentos", color: "#2563EB", bg: "#EFF6FF", tipoActividad: "inspeccion_semanal" },
    { id: "anual", label: "Pauta Anual", desc: "Revisión técnica anual completa", color: "#059669", bg: "#F0FDF4", tipoActividad: "inspeccion_anual" },
  ];

  const pautaInfo = TIPOS_PAUTA.find(p => p.id === pautaActiva);
  const categoriaParaPlaceholder = { label: equipo.tipo?.replace(/_/g, " "), color: "#2563EB", bg: "#EFF6FF" };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-widest font-semibold">Gestión de Calidad y Seguridad</p>
          <h2 className="text-xl font-bold text-slate-900">Historial de Inspección</h2>
        </div>
        {!pautaActiva && (
          <div className="flex items-center gap-2">
            <button onClick={() => setShowImprimir(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold"
              style={{ background: "#F0FDF4", color: "#16A34A", border: "1px solid #BBF7D0" }}>
              <Printer className="w-4 h-4" /> Imprimir Historial
            </button>
            <button onClick={() => setPautaActiva("selector")}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white"
              style={{ background: "#2563EB" }}>
              <Plus className="w-4 h-4" /> Nuevo Reporte
            </button>
          </div>
        )}
      </div>

      {/* Selector de tipo de pauta */}
      {pautaActiva === "selector" && (
        <div className="bg-white rounded-2xl overflow-hidden" style={{ border: "1px solid #E2E8F0" }}>
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Seleccionar tipo de pauta</p>
              <p className="text-sm text-slate-600 mt-0.5">{equipo.marca} {equipo.modelo}</p>
            </div>
            <button onClick={() => setPautaActiva(null)} className="text-slate-400 hover:text-slate-600">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-4 space-y-2">
            {TIPOS_PAUTA.map(tp => (
              <button key={tp.id} onClick={() => setPautaActiva(tp.id)}
                className="w-full flex items-center gap-4 p-4 rounded-xl text-left transition-all hover:shadow-md"
                style={{ border: `1px solid ${tp.color}33`, background: tp.bg }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${tp.color}20` }}>
                  <ClipboardCheck className="w-5 h-5" style={{ color: tp.color }} />
                </div>
                <div className="flex-1">
                  <p className="font-bold text-slate-800">{tp.label}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{tp.desc}</p>
                </div>
                <ChevronDown className="w-4 h-4 text-slate-400 -rotate-90 flex-shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Pauta Diaria ambulancia → Selector de momento */}
      {pautaActiva === "diaria" && esAmbulancia && !momentoDiario && (
        <div className="space-y-3">
          <button onClick={() => setPautaActiva("selector")}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
            <ArrowLeft className="w-4 h-4" /> Volver
          </button>
          <div className="bg-white rounded-2xl overflow-hidden" style={{ border: "1px solid #E2E8F0" }}>
            <div className="px-5 py-4 border-b border-slate-100">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Seleccionar momento</p>
              <p className="text-sm text-slate-600 mt-0.5">¿Cuándo se realiza esta inspección?</p>
            </div>
            <div className="p-4 grid grid-cols-2 gap-3">
              <button onClick={() => setMomentoDiario("inicio")}
                className="flex flex-col items-center gap-3 p-5 rounded-xl text-left transition-all hover:shadow-md"
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
                className="flex flex-col items-center gap-3 p-5 rounded-xl text-left transition-all hover:shadow-md"
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
        </div>
      )}

      {/* Pauta Diaria ambulancia → Formulario por momento */}
      {pautaActiva === "diaria" && esAmbulancia && momentoDiario && (
        <div className="space-y-2">
          <button onClick={() => setMomentoDiario(null)}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-1">
            <ArrowLeft className="w-4 h-4" /> Volver
          </button>
          <PautaDiariaAmbulancia
            equipoFijo={equipo}
            equipos={[]}
            momento={momentoDiario}
            onSuccess={(result) => { setMomentoDiario(null); handlePautaSuccess(result); }}
          />
        </div>
      )}

      {/* Pauta Semanal ambulancia (formulario completo con SVG y checklist) */}
      {pautaActiva === "semanal" && esAmbulancia && (
        <div className="space-y-2">
          <button onClick={() => setPautaActiva("selector")}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-1">
            <ArrowLeft className="w-4 h-4" /> Volver
          </button>
          <PautaInspeccionSemanal
            equipos={[]}
            equipoFijo={equipo}
            onSuccess={handlePautaSuccess}
          />
        </div>
      )}

      {/* Pauta Semanal Monitor Desfibrilador */}
      {pautaActiva === "semanal" && equipo.tipo === "monitor_desfibrilador" && (
        <div className="space-y-2">
          <button onClick={() => setPautaActiva("selector")}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-1">
            <ArrowLeft className="w-4 h-4" /> Volver
          </button>
          <PautaSemanalDesfibrilador
            equipos={[]}
            equipoFijo={equipo}
            onSuccess={handlePautaSuccess}
          />
        </div>
      )}

      {/* Pauta Semanal Monitor Multiparámetros */}
      {pautaActiva === "semanal" && equipo.tipo === "monitor_multiparametros" && (
        <div className="space-y-2">
          <button onClick={() => setPautaActiva("selector")}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-1">
            <ArrowLeft className="w-4 h-4" /> Volver
          </button>
          <PautaSemanalMultiparametros
            equipos={[]}
            equipoFijo={equipo}
            onSuccess={handlePautaSuccess}
          />
        </div>
      )}

      {/* Pauta genérica (diaria/anual para no-ambulancia, o anual para ambulancia) */}
      {pautaActiva && pautaActiva !== "selector" &&
        !(pautaActiva === "diaria" && esAmbulancia) &&
        !(pautaActiva === "semanal" && esAmbulancia) &&
        !(pautaActiva === "semanal" && equipo.tipo === "monitor_desfibrilador") &&
        !(pautaActiva === "semanal" && equipo.tipo === "monitor_multiparametros") && (
        <div className="space-y-2">
          <button onClick={() => setPautaActiva("selector")}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-1">
            <ArrowLeft className="w-4 h-4" /> Volver
          </button>
          <PautaPlaceholder
            categoria={categoriaParaPlaceholder}
            pauta={pautaInfo}
            equipos={[]}
            loading={false}
            equipoFijo={equipo}
            onSuccess={handlePautaSuccess}
          />
        </div>
      )}

      {/* Resumen rápido */}
      {esAmbulancia && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Pautas Diarias", count: inspecciones.filter(i => i.tipo === "inspeccion_rutinaria" || i.tipo === "inspeccion").length, color: "#7C3AED", bg: "#F5F3FF" },
            { label: "Pautas Semanales", count: inspecciones.filter(i => i.tipo === "inspeccion_semanal").length, color: "#2563EB", bg: "#EFF6FF" },
            { label: "Pautas Anuales", count: inspecciones.filter(i => i.tipo === "inspeccion_anual").length, color: "#059669", bg: "#F0FDF4" },
          ].map(s => (
            <div key={s.label} className="rounded-2xl p-4 text-center" style={{ background: s.bg, border: `1px solid ${s.color}22` }}>
              <p className="text-2xl font-bold" style={{ color: s.color }}>{s.count}</p>
              <p className="text-xs font-semibold text-slate-500 mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Historial completo */}
      <div className="bg-white rounded-2xl p-5" style={{ border: "1px solid #E2E8F0" }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-slate-800">Historial de Inspecciones</h3>
          <span className="text-xs font-bold px-3 py-1 rounded-full"
            style={{ background: cumplimiento >= 90 ? "#DCFCE7" : "#FEF9C3", color: cumplimiento >= 90 ? "#16A34A" : "#A16207" }}>
            CUMPLIMIENTO: {cumplimiento}%
          </span>
        </div>
        {inspecciones.length === 0 ? (
          <EmptyState icon={ClipboardCheck} text="Sin registros de inspección" />
        ) : (
          <div className="space-y-2.5">
            {inspecciones.map(act => (
              <InspeccionCard key={act.id} act={act} />
            ))}
          </div>
        )}
      </div>

      {/* Certificación y documentos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl p-5" style={{ border: "1px solid #E2E8F0" }}>
          <h3 className="font-bold text-slate-800 mb-4">Certificación Anual</h3>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Vencimiento</span>
              <span className="font-semibold text-slate-800">
                {fechaVence ? format(parseISO(fechaVence), "dd MMM yyyy") : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Estado</span>
              <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ color: certBadge.color, background: certBadge.bg }}>
                {certBadge.label}
              </span>
            </div>
          </div>
          {diasVence !== null && diasVence <= 90 && (
            <div className="flex items-center gap-2 p-2.5 mt-3 rounded-xl text-xs"
              style={{ background: diasVence < 0 ? "#FEF2F2" : "#FFFBEB", color: diasVence < 0 ? "#DC2626" : "#B45309" }}>
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
              {diasVence < 0 ? `Vencida hace ${Math.abs(diasVence)} días` : `Vence en ${diasVence} días`}
            </div>
          )}
          <div className="mt-4 rounded-xl p-3 text-center" style={{ border: "2px dashed #CBD5E1", background: "#F8FAFC" }}>
            <Upload className="w-5 h-5 text-slate-400 mx-auto mb-1" />
            <p className="text-xs font-medium text-slate-600 mb-2">Subir certificado</p>
            <FileUploadButton label="Subir" color="#2563EB" />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5" style={{ border: "1px solid #E2E8F0" }}>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Documentos Técnicos</p>
          {equipo.orden_compra_url && (
            <a href={equipo.orden_compra_url} target="_blank" rel="noreferrer"
              className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors mb-3" style={{ border: "1px solid #E2E8F0" }}>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "#FEF2F2" }}>
                <FileText className="w-4 h-4 text-red-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">Orden de Compra</p>
                <p className="text-xs text-slate-400">Documento adjunto</p>
              </div>
              <ExternalLink className="w-4 h-4 text-slate-400 flex-shrink-0" />
            </a>
          )}
          <FileUploadButton label="Subir Documento" color="#2563EB" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" />
        </div>
      </div>

      {showImprimir && (
        <ImprimirHistorialModal
          equipo={equipo}
          actividades={actividades}
          onClose={() => setShowImprimir(false)}
        />
      )}
    </div>
  );
}

function InspeccionCard({ act }) {
  const [expanded, setExpanded] = useState(false);
  const [inspeccionData, setInspeccionData] = useState(null);
  const [loadingData, setLoadingData] = useState(false);

  const TIPO_CFG = {
    inspeccion_semanal:    { label: "Pauta Semanal",        icon: CheckCircle,   color: "#10B981", bg: "#F0FDF4" },
    inspeccion_anual:      { label: "Pauta Anual",          icon: CheckCircle,   color: "#2563EB", bg: "#EFF6FF" },
    inspeccion_rutinaria:  { label: "Pauta Diaria",         icon: CheckCircle,   color: "#7C3AED", bg: "#F5F3FF" },
    incidente:             { label: "Incidente",             icon: AlertTriangle, color: "#EF4444", bg: "#FEF2F2" },
    inspeccion:            { label: "Inspección",            icon: CheckCircle,   color: "#10B981", bg: "#F0FDF4" },
    error_calibracion:     { label: "Error de Calibración", icon: AlertTriangle, color: "#EF4444", bg: "#FEF2F2" },
  };
  const cfg = TIPO_CFG[act.tipo] || { label: act.tipo, icon: CheckCircle, color: "#94A3B8", bg: "#F8FAFC" };
  const CfgIcon = cfg.icon;

  const hora = act.created_date
    ? new Date(act.created_date).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })
    : "";

  const hasFallas = act.observaciones?.includes("Fallas:");
  const resultadoMatch = act.observaciones?.match(/Resultado:\s*(aprobado|observaciones|rechazado)/i);
  const resultadoLabel = resultadoMatch?.[1];
  const tieneDanos = act.observaciones?.includes("Daños reportados:");

  const resultBadge = hasFallas || resultadoLabel === "rechazado"
    ? { label: "Con fallas", color: "#DC2626", bg: "#FEF2F2" }
    : resultadoLabel === "observaciones"
    ? { label: "Con observaciones", color: "#D97706", bg: "#FFFBEB" }
    : act.observaciones
    ? { label: "Sin fallas", color: "#16A34A", bg: "#DCFCE7" }
    : null;

  const esSemanal = act.tipo === "inspeccion_semanal";
  const esDiaria = act.tipo === "inspeccion_rutinaria" || act.tipo === "inspeccion";

  const handleToggle = async () => {
    const next = !expanded;
    setExpanded(next);
    // Si es pauta semanal o diaria, buscar los datos completos del formulario
    if (next && (esSemanal || esDiaria) && !inspeccionData) {
      setLoadingData(true);
      try {
        const tipoFiltro = esSemanal ? "inspeccion_semanal" : "inspeccion_diaria";
        const pendientes = await base44.entities.InspeccionPendiente.filter({
          equipo_id: act.equipo_id,
          tipo_formulario: tipoFiltro,
        });
        const match = pendientes.find(p =>
          p.fecha === act.fecha && p.conductor === act.usuario_nombre
        ) || pendientes.find(p => p.fecha === act.fecha) || null;
        if (match?.datos_json) {
          setInspeccionData(JSON.parse(match.datos_json));
        }
      } catch (_) {}
      setLoadingData(false);
    }
  };

  return (
    <div className="rounded-xl overflow-hidden" style={{
      border: `1px solid ${hasFallas || resultadoLabel === "rechazado" ? "#FECACA" : resultadoLabel === "observaciones" ? "#FDE68A" : "#E2E8F0"}`,
      background: act.tipo === "incidente" ? "#FFF5F5" : "white"
    }}>
      {/* Header row */}
      <div className="flex items-start gap-3 p-3.5 cursor-pointer" onClick={handleToggle}>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: cfg.bg }}>
          <CfgIcon className="w-4 h-4" style={{ color: hasFallas ? "#EF4444" : cfg.color }} />
        </div>
        <div className="flex-1 min-w-0">
          {/* Tipo + badges */}
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <p className="font-bold text-slate-800 text-sm">{cfg.label}</p>
            {resultBadge && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: resultBadge.bg, color: resultBadge.color }}>
                {resultBadge.label}
              </span>
            )}
            {tieneDanos && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "#FEF2F2", color: "#DC2626" }}>
                Daños visuales
              </span>
            )}
          </div>
          {/* Conductor destacado */}
          {act.usuario_nombre && (
            <p className="text-base font-bold text-slate-800 flex items-center gap-1.5 mb-0.5">
              <User className="w-4 h-4 text-blue-400 flex-shrink-0" />
              {act.usuario_nombre}
            </p>
          )}
          {/* Fecha y hora */}
          <p className="text-xs text-slate-400">
            {act.fecha}{hora && ` · ${hora}`}
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {act.archivo_url && (
            <a href={act.archivo_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-blue-50 text-blue-400">
              <FileText className="w-4 h-4" />
            </a>
          )}
          <button className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400">
            <ChevronDown className="w-4 h-4" style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
          </button>
        </div>
      </div>

      {/* Detalle expandido */}
      {expanded && (
        <div className="border-t border-slate-100 px-4 py-3 space-y-3" style={{ background: "#FAFBFC" }}>
          {loadingData && (
            <p className="text-xs text-slate-400 text-center py-2">Cargando datos del formulario...</p>
          )}

          {/* Vista completa del formulario diario */}
          {esDiaria && inspeccionData && (
            <div className="space-y-2">
              {/* Momento */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold px-3 py-1.5 rounded-xl"
                  style={inspeccionData.momento === "inicio"
                    ? { background: "#EFF6FF", color: "#2563EB", border: "1px solid #BFDBFE" }
                    : { background: "#ECFDF5", color: "#059669", border: "1px solid #A7F3D0" }}>
                  {inspeccionData.momento === "inicio" ? "🌅 Inicio de Turno" : "🌆 Término de Turno"}
                </span>
                {inspeccionData.conductor && (
                  <span className="text-xs font-semibold text-slate-600 flex items-center gap-1">
                    <User className="w-3 h-3" /> {inspeccionData.conductor}
                  </span>
                )}
              </div>

              {/* Secciones */}
              {["exterior","interior","equipos_medicos","accesorios","limpieza","documentacion"].map(secId => {
                const LABELS = {
                  exterior: "Revisión Exterior", interior: "Revisión Interior",
                  equipos_medicos: "Equipos Médicos", accesorios: "Accesorios",
                  limpieza: "Limpieza Básica", documentacion: "Documentación"
                };
                const ICONS = {
                  exterior: "🚗", interior: "🔧", equipos_medicos: "🏥",
                  accesorios: "📦", limpieza: "🧹", documentacion: "📄"
                };
                const cl = inspeccionData.checklist || {};
                const claves = Object.keys(cl).filter(k => k.startsWith(`${secId}__`));
                const incorrectos = claves.filter(k => cl[k]?.estado === "incorrecto");
                return (
                  <div key={secId} className="rounded-xl overflow-hidden" style={{ border: "1px solid #E2E8F0" }}>
                    <div className="flex items-center justify-between px-3 py-2"
                      style={{ background: incorrectos.length > 0 ? "#FFF5F5" : "#F8FAFC" }}>
                      <span className="text-xs font-bold text-slate-600">{ICONS[secId]} {LABELS[secId]}</span>
                      {incorrectos.length > 0
                        ? <span className="text-xs font-bold text-red-600">{incorrectos.length} incorrecto(s)</span>
                        : <span className="text-xs text-green-600 font-semibold">✓ Todo correcto</span>
                      }
                    </div>
                    {incorrectos.length > 0 && (
                      <div className="px-3 py-2 space-y-1">
                        {incorrectos.map(k => (
                          <div key={k} className="text-xs flex items-start gap-1.5">
                            <span className="text-red-400 flex-shrink-0">✗</span>
                            <span className="font-semibold text-red-700">{k.replace(`${secId}__`, "")}</span>
                            {cl[k]?.obs && <span className="text-red-500"> — {cl[k].obs}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Observaciones generales */}
              {(inspeccionData.problemasDetectados || inspeccionData.accionesTomadas) && (
                <div className="rounded-xl p-3 space-y-1.5" style={{ background: "#FFFBEB", border: "1px solid #FDE68A" }}>
                  {inspeccionData.problemasDetectados && (
                    <p className="text-xs text-slate-700"><span className="font-bold text-amber-700">Problemas:</span> {inspeccionData.problemasDetectados}</p>
                  )}
                  {inspeccionData.accionesTomadas && (
                    <p className="text-xs text-slate-700"><span className="font-bold text-amber-700">Acciones:</span> {inspeccionData.accionesTomadas}</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Vista completa del formulario semanal */}
          {esSemanal && inspeccionData && (
            <div className="space-y-2">
              {/* Info conductor/km/combustible */}
              <div className="flex flex-wrap gap-2">
                {inspeccionData.km_inicial && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold"
                    style={{ background: "#EFF6FF", color: "#2563EB", border: "1px solid #BFDBFE" }}>
                    <Gauge className="w-3.5 h-3.5" /> KM Inicial: {Number(inspeccionData.km_inicial).toLocaleString()}
                  </div>
                )}
                {inspeccionData.combustible && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold"
                    style={{ background: "#FFFBEB", color: "#B45309", border: "1px solid #FDE68A" }}>
                    ⛽ Combustible: {inspeccionData.combustible}
                  </div>
                )}
              </div>

              {/* Checklist plano (Monitor Desfibrilador / Multiparámetros) */}
              {inspeccionData.checklist && (
                <ChecklistPlano data={inspeccionData.checklist} parches={inspeccionData.parches} descripcion={inspeccionData.descripcion} />
              )}

              {/* Observaciones (pautas semanales sin checklist almacenado) */}
              {!inspeccionData.checklist && act.observaciones && (
                <div className="space-y-1.5">
                  {act.observaciones.split(" | ").filter(Boolean).map((linea, i) => {
                    const isFalla = linea.includes("Fallas:");
                    return (
                      <div key={i} className="flex items-start gap-2 py-1 rounded-lg px-2"
                        style={{ background: isFalla ? "#FFF5F5" : "transparent", border: isFalla ? "1px solid #FECACA" : "none" }}>
                        <span className="flex-shrink-0 mt-0.5" style={{ color: isFalla ? "#EF4444" : "#94A3B8" }}>{isFalla ? "⚠" : "•"}</span>
                        <p className="text-xs leading-relaxed" style={{ color: isFalla ? "#DC2626" : "#475569" }}>{linea}</p>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Checklists ambulancia */}
              {!inspeccionData.checklist && ["luces", "motor", "accesorios", "documentos"].map(cat => {
                const data = inspeccionData[cat];
                if (!data) return null;
                const items = Object.entries(data);
                const malos = items.filter(([, v]) => v?.estado === "malo");
                const ICONS = { luces: "⚡", motor: "🔧", accesorios: "📦", documentos: "📄" };
                const NAMES = { luces: "Luces", motor: "Motor", accesorios: "Accesorios", documentos: "Documentos" };
                return (
                  <div key={cat} className="rounded-xl overflow-hidden" style={{ border: "1px solid #E2E8F0" }}>
                    <div className="flex items-center justify-between px-3 py-2" style={{ background: malos.length > 0 ? "#FFF5F5" : "#F8FAFC" }}>
                      <span className="text-xs font-bold text-slate-600">{ICONS[cat]} {NAMES[cat]}</span>
                      {malos.length > 0
                        ? <span className="text-xs font-bold text-red-600">{malos.length} falla(s)</span>
                        : <span className="text-xs text-green-600 font-semibold">✓ Todo OK</span>
                      }
                    </div>
                    {malos.length > 0 && (
                      <div className="px-3 py-2 space-y-1">
                        {malos.map(([item, v]) => (
                          <div key={item} className="text-xs flex items-start gap-1.5">
                            <span className="text-red-400 flex-shrink-0">✗</span>
                            <span className="font-semibold text-red-700">{item}</span>
                            {v.obs && <span className="text-red-500"> — {v.obs}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Daños visuales */}
              {(() => {
                const danos = inspeccionData.danos;
                if (!danos) return null;
                const lista = Object.entries(danos).filter(([, v]) => v?.marcado);
                if (lista.length === 0) return (
                  <div className="text-xs text-green-700 flex items-center gap-1.5 px-3 py-2 rounded-xl"
                    style={{ background: "#F0FDF4", border: "1px solid #BBF7D0" }}>
                    <CheckCircle className="w-3.5 h-3.5" /> Sin daños visuales
                  </div>
                );
                return (
                  <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #FECACA" }}>
                    <div className="px-3 py-2" style={{ background: "#FFF5F5" }}>
                      <span className="text-xs font-bold text-red-600">⚠ Daños Visuales ({lista.length})</span>
                    </div>
                    <div className="px-3 py-2 space-y-1.5">
                      {lista.map(([zoneId, v]) => (
                        <div key={zoneId} className="flex items-start gap-2 text-xs">
                          {v.foto_url && <img src={v.foto_url} alt="daño" className="w-12 h-12 object-cover rounded-lg flex-shrink-0" />}
                          <div>
                            <p className="font-bold text-red-700">{zoneId.replace(/_/g, " ")}</p>
                            <p className="text-slate-600">{v.descripcion}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Para otros tipos: observaciones simples */}
          {!esSemanal && act.observaciones && (
            <div className="space-y-1.5">
              {act.observaciones.split(" | ").filter(Boolean).map((linea, i) => {
                const isFalla = linea.includes("Fallas:");
                const isDano = linea.startsWith("Daños");
                return (
                  <div key={i} className="flex items-start gap-2 py-1 rounded-lg px-2"
                    style={{
                      background: isFalla || isDano ? "#FFF5F5" : "transparent",
                      border: isFalla || isDano ? "1px solid #FECACA" : "none"
                    }}>
                    <span className="flex-shrink-0 mt-0.5" style={{ color: isFalla || isDano ? "#EF4444" : "#94A3B8" }}>
                      {isFalla || isDano ? "⚠" : "•"}
                    </span>
                    <p className="text-xs leading-relaxed" style={{ color: isFalla || isDano ? "#DC2626" : "#475569" }}>
                      {linea}
                    </p>
                  </div>
                );
              })}
            </div>
          )}

          {/* Sin datos de formulario */}
          {(esSemanal || esDiaria) && !loadingData && !inspeccionData && (
            <p className="text-xs text-slate-400 italic text-center py-1">
              Datos detallados no disponibles para este registro.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════
   PARCHES TAB
══════════════════════════════════════════════ */
function ParchesTab({ equipo, parches, user, onUpdated }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ tipo: "adulto", cantidad: 1, lote: "", fecha_adquisicion: "", fecha_vencimiento: "" });
  const [saving, setSaving] = useState(false);
  const hoy = new Date();

  const TIPO_LABELS = { adulto: "Adulto", pediatrico: "Pediátrico", mixto: "Mixto" };
  const TIPO_DOT = { adulto: "#2563EB", pediatrico: "#9333EA", mixto: "#059669" };

  const getStyle = (p) => {
    const dias = differenceInDays(parseISO(p.fecha_vencimiento), hoy);
    if (dias < 0) return { bg: "#FEF2F2", border: "#FECACA", text: "#DC2626", label: "VENCIDO" };
    if (dias <= 30) return { bg: "#FFF7ED", border: "#FDBA74", text: "#EA580C", label: `${dias}d` };
    if (dias <= 90) return { bg: "#FFFBEB", border: "#FDE68A", text: "#D97706", label: `${dias}d` };
    return { bg: "#F0FDF4", border: "#86EFAC", text: "#16A34A", label: `${dias}d` };
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    setSaving(true);
    await base44.entities.Parche.create({ ...form, equipo_id: equipo.id, cantidad: Number(form.cantidad), activo: true });
    setSaving(false);
    setShowForm(false);
    onUpdated && onUpdated();
  };

  const handleDelete = async (id) => {
    if (!confirm("¿Eliminar este parche?")) return;
    await base44.entities.Parche.delete(id);
    onUpdated && onUpdated();
  };

  return (
    <div className="space-y-5">
      <SectionHeader title="Parches Registrados" count={parches.length} onAdd={() => setShowForm(!showForm)} addLabel="Agregar" />
      {showForm && (
        <div className="bg-white p-5 rounded-2xl space-y-3" style={{ border: "1px solid #E2E8F0" }}>
          <form onSubmit={handleAdd} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Tipo *", el: <select required className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" style={{ borderColor: "#E2E8F0" }} value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}><option value="adulto">Adulto</option><option value="pediatrico">Pediátrico</option><option value="mixto">Mixto</option></select> },
                { label: "Cantidad *", el: <input type="number" required min="1" className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" style={{ borderColor: "#E2E8F0" }} value={form.cantidad} onChange={e => setForm(f => ({ ...f, cantidad: e.target.value }))} /> },
                { label: "Vencimiento *", el: <input type="date" required className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" style={{ borderColor: "#E2E8F0" }} value={form.fecha_vencimiento} onChange={e => setForm(f => ({ ...f, fecha_vencimiento: e.target.value }))} /> },
                { label: "Lote", el: <input className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" style={{ borderColor: "#E2E8F0" }} value={form.lote} onChange={e => setForm(f => ({ ...f, lote: e.target.value }))} /> }
              ].map(({ label, el }) => (
                <div key={label}>
                  <label className="text-xs font-medium text-slate-600 block mb-1">{label}</label>
                  {el}
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: "#2563EB" }}>
                {saving ? "Guardando..." : "Agregar Parche"}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100">Cancelar</button>
            </div>
          </form>
        </div>
      )}
      {parches.length === 0 ? <EmptyState icon={Package} text="No hay parches registrados" /> : (
        <div className="space-y-2.5">
          {parches.map(p => {
            const s = getStyle(p);
            return (
              <div key={p.id} className="bg-white flex items-center justify-between p-4 rounded-xl"
                style={{ background: s.bg, border: `1px solid ${s.border}` }}>
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: TIPO_DOT[p.tipo] }} />
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{TIPO_LABELS[p.tipo]} — {p.cantidad} ud{p.cantidad > 1 ? "s" : ""}{p.lote && <span className="text-slate-400 font-normal"> · Lote {p.lote}</span>}</p>
                    <p className="text-xs text-slate-500">Vence: {format(parseISO(p.fecha_vencimiento), "dd/MM/yyyy")}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ color: s.text, background: "white", border: `1px solid ${s.border}` }}>{s.label}</span>
                  <button onClick={() => handleDelete(p.id)} className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-300 hover:text-red-400 hover:bg-red-50">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════
   INCIDENTES TAB (standalone)
══════════════════════════════════════════════ */
function IncidentesTab({ equipo, user }) {
  const [incidentes, setIncidentes] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingInc, setEditingInc] = useState(null);
  const [form, setForm] = useState({ fecha: new Date().toISOString().split("T")[0], observaciones: "", usuario_nombre: user?.full_name || "" });
  const [saving, setSaving] = useState(false);

  const load = () => base44.entities.Actividad.filter({ equipo_id: equipo.id })
    .then(acts => setIncidentes(acts.filter(a => a.tipo === "incidente").sort((a,b) => new Date(b.fecha)-new Date(a.fecha))));

  useEffect(() => { load(); }, [equipo.id]);

  const openNew = () => { setEditingInc(null); setForm({ fecha: new Date().toISOString().split("T")[0], observaciones: "", usuario_nombre: user?.full_name || "" }); setShowForm(true); };
  const openEdit = (inc) => { setEditingInc(inc); setForm({ fecha: inc.fecha, observaciones: inc.observaciones || "", usuario_nombre: inc.usuario_nombre || "" }); setShowForm(true); };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    if (editingInc) {
      await base44.entities.Actividad.update(editingInc.id, form);
    } else {
      await base44.entities.Actividad.create({ equipo_id: equipo.id, tipo: "incidente", ...form });
    }
    setSaving(false);
    setShowForm(false);
    setEditingInc(null);
    load();
  };

  const handleDelete = async (id) => {
    if (!confirm("¿Eliminar este incidente?")) return;
    await base44.entities.Actividad.delete(id);
    load();
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Incidentes</h2>
          <p className="text-xs text-slate-500 mt-0.5">{incidentes.length} registro(s)</p>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: "#EF4444" }}>
          <Plus className="w-4 h-4" /> Registrar Incidente
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSave} className="bg-white p-5 rounded-2xl space-y-3" style={{ border: "1px solid #FECACA", background: "#FFF5F5" }}>
          <p className="text-xs font-bold text-red-500 uppercase tracking-widest">{editingInc ? "Editar Incidente" : "Nuevo Incidente"}</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Fecha</label>
              <input type="date" required className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200" style={{ borderColor: "#FECACA" }}
                value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Responsable</label>
              <input className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200" style={{ borderColor: "#FECACA" }}
                value={form.usuario_nombre} onChange={e => setForm(f => ({ ...f, usuario_nombre: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Descripción del Incidente *</label>
            <textarea required rows={3} className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 resize-none" style={{ borderColor: "#FECACA" }}
              placeholder="Ej: Se pinchó un neumático en sector..." value={form.observaciones} onChange={e => setForm(f => ({ ...f, observaciones: e.target.value }))} />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: "#EF4444" }}>
              {saving ? "Guardando..." : editingInc ? "Guardar Cambios" : "Registrar"}
            </button>
            <button type="button" onClick={() => { setShowForm(false); setEditingInc(null); }} className="px-4 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100">Cancelar</button>
          </div>
        </form>
      )}

      {incidentes.length === 0 ? (
        <EmptyState icon={AlertTriangle} text="Sin incidentes registrados" />
      ) : (
        <div className="space-y-2.5">
          {incidentes.map(inc => (
            <div key={inc.id} className="bg-white flex items-start gap-3 p-4 rounded-2xl" style={{ border: "1px solid #FECACA" }}>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: "#FEF2F2" }}>
                <AlertTriangle className="w-4 h-4 text-red-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800">{inc.observaciones || "Sin descripción"}</p>
                <p className="text-xs text-slate-400 mt-0.5">{inc.fecha}{inc.usuario_nombre && ` • ${inc.usuario_nombre}`}</p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => openEdit(inc)} className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-500"><Edit className="w-4 h-4" /></button>
                <button onClick={() => handleDelete(inc.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════
   BITÁCORA TAB
══════════════════════════════════════════════ */
function BitacoraTab({ equipo, user }) {
  const isAdmin = user?.role === "admin";
  const [registros, setRegistros] = useState([]);
  const [incidentes, setIncidentes] = useState([]);
  const [showConductorForm, setShowConductorForm] = useState(false);
  const [showIncidenteForm, setShowIncidenteForm] = useState(false);
  const [addingIncForKm, setAddingIncForKm] = useState(null);
  const [form, setForm] = useState({ fecha: new Date().toISOString().split("T")[0], conductor: "", km_inicial: "", observaciones: "", incidente: "", tiene_incidente: false, tipo_incidente: "falla_mecanica", ambulancia_operativa: true });
  const [incDirectoForm, setIncDirectoForm] = useState({ fecha: new Date().toISOString().split("T")[0], tipo_incidente: "falla_mecanica", observaciones: "", usuario_nombre: user?.full_name || "", ambulancia_operativa: true });
  const [savingIncDirecto, setSavingIncDirecto] = useState(false);
  const [incForm, setIncForm] = useState({ observaciones: "", usuario_nombre: user?.full_name || "" });
  const [saving, setSaving] = useState(false);
  const [savingInc, setSavingInc] = useState(false);

  const load = async () => {
    const [km, acts] = await Promise.all([
      base44.entities.Kilometraje.filter({ equipo_id: equipo.id }),
      base44.entities.Actividad.filter({ equipo_id: equipo.id })
    ]);
    setRegistros(km.sort((a, b) => new Date(b.fecha) - new Date(a.fecha)));
    setIncidentes(acts.filter(a => a.tipo === "incidente").sort((a, b) => new Date(b.fecha) - new Date(a.fecha)));
  };

  useEffect(() => { load(); }, [equipo.id]);

  const handleSaveConductor = async (e) => {
    e.preventDefault();
    setSaving(true);
    const kmInicial = Number(form.km_inicial);
    const activo = registros.find(r => !r.km_final);
    if (activo) await base44.entities.Kilometraje.update(activo.id, { km_final: kmInicial });
    await base44.entities.Kilometraje.create({ equipo_id: equipo.id, fecha: form.fecha, conductor: form.conductor, valor_km: kmInicial, km_inicial: kmInicial, observaciones: form.observaciones });
    // Guardar incidente si fue indicado
    if (form.tiene_incidente && form.incidente.trim()) {
      await base44.functions.invoke('reportarIncidenteAmbulancia', {
        equipo_id: equipo.id,
        fecha: form.fecha,
        tipo_incidente: form.tipo_incidente,
        observaciones: form.incidente,
        usuario_nombre: form.conductor,
        ambulancia_operativa: form.ambulancia_operativa
      });
    }
    setSaving(false);
    setShowConductorForm(false);
    setForm({ fecha: new Date().toISOString().split("T")[0], conductor: "", km_inicial: "", observaciones: "", incidente: "", tiene_incidente: false });
    load();
  };

  const handleSaveIncidente = async (e) => {
    e.preventDefault();
    setSavingInc(true);
    const km = registros.find(r => r.id === addingIncForKm);
    await base44.entities.Actividad.create({ equipo_id: equipo.id, tipo: "incidente", fecha: km?.fecha || new Date().toISOString().split("T")[0], observaciones: incForm.observaciones, usuario_nombre: incForm.usuario_nombre || km?.conductor || "" });
    setSavingInc(false);
    setAddingIncForKm(null);
    setIncForm({ observaciones: "", usuario_nombre: user?.full_name || "" });
    load();
  };

  const handleSaveIncidenteDirecto = async (e) => {
    e.preventDefault();
    setSavingIncDirecto(true);
    await base44.functions.invoke('reportarIncidenteAmbulancia', {
      equipo_id: equipo.id,
      fecha: incDirectoForm.fecha,
      tipo_incidente: incDirectoForm.tipo_incidente,
      observaciones: incDirectoForm.observaciones,
      usuario_nombre: incDirectoForm.usuario_nombre,
      ambulancia_operativa: incDirectoForm.ambulancia_operativa
    });
    setSavingIncDirecto(false);
    setShowIncidenteForm(false);
    setIncDirectoForm({ fecha: new Date().toISOString().split("T")[0], tipo_incidente: "falla_mecanica", observaciones: "", usuario_nombre: user?.full_name || "", ambulancia_operativa: true });
    load();
  };

  const registroActivo = registros.find(r => !r.km_final);
  const estado = equipo.estado || "operativo";
  const estadoColor = { operativo: "#10B981", mantenimiento: "#F59E0B", fuera_de_servicio: "#EF4444" }[estado] || "#10B981";
  const estadoLabel = { operativo: "OPERATIVO", mantenimiento: "MANTENIMIENTO", fuera_de_servicio: "FUERA DE SERVICIO" }[estado] || "OPERATIVO";

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h2 className="text-2xl font-bold text-slate-900">Bitácora de Conductores</h2>
            <span className="flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full"
              style={{ background: `${estadoColor}18`, color: estadoColor }}>
              <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: estadoColor }} />
              {estadoLabel}
            </span>
          </div>
          <p className="text-sm text-slate-500">{equipo.marca} {equipo.modelo}{equipo.patente && ` • ${equipo.patente}`}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { setShowIncidenteForm(!showIncidenteForm); setShowConductorForm(false); }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold shadow-sm"
            style={{ background: showIncidenteForm ? "#FEE2E2" : "#FFF5F5", color: "#DC2626", border: "1px solid #FECACA" }}>
            <AlertTriangle className="w-4 h-4" /> Registrar Incidente
          </button>
          <button onClick={() => {
            const activo = registros.find(r => !r.km_final);
            const kmPrevio = activo ? (activo.km_final || activo.km_inicial || activo.valor_km || "") : "";
            setForm(f => ({ ...f, km_inicial: kmPrevio ? String(kmPrevio) : "" }));
            setShowConductorForm(!showConductorForm);
            setShowIncidenteForm(false);
          }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white shadow-sm"
            style={{ background: "#2563EB" }}>
            <User className="w-4 h-4" /> Asignar Conductor
          </button>
        </div>
      </div>

      {/* Conductor activo banner */}
      {registroActivo && (
        <div className="rounded-2xl p-5" style={{ background: "linear-gradient(135deg, #1D4ED8 0%, #2563EB 100%)" }}>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl flex items-center justify-center relative" style={{ background: "rgba(255,255,255,0.15)" }}>
                <User className="w-7 h-7 text-white" />
                <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center" style={{ background: "#10B981" }}>
                  <CheckCircle className="w-3 h-3 text-white" />
                </span>
              </div>
              <div>
                <p className="text-xs text-blue-200 uppercase tracking-widest font-semibold mb-0.5">Conductor Actual</p>
                <p className="text-xl font-bold text-white">{registroActivo.conductor || "Sin nombre"}</p>
                <p className="text-sm text-blue-200 mt-0.5 flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5" /> Desde: {registroActivo.fecha}
                  <Clock className="w-3.5 h-3.5 ml-1" /> Turno activo
                </p>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div className="text-center">
                <p className="text-xs text-blue-200 uppercase tracking-widest">KM Inicial</p>
                <p className="text-2xl font-bold text-white">{((registroActivo.km_inicial || registroActivo.valor_km) || 0).toLocaleString()}</p>
                <p className="text-xs text-blue-200">km</p>
              </div>
              {registroActivo.km_final && (
                <div className="text-center">
                  <p className="text-xs text-blue-200 uppercase tracking-widest">Distancia</p>
                  <p className="text-2xl font-bold text-white">{(registroActivo.km_final - (registroActivo.km_inicial || registroActivo.valor_km)).toLocaleString()}</p>
                  <p className="text-xs text-blue-200">km</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Formulario incidente directo */}
      {showIncidenteForm && (
        <form onSubmit={handleSaveIncidenteDirecto} className="bg-white p-5 rounded-2xl space-y-3" style={{ border: "1px solid #FECACA", background: "#FFF5F5" }}>
          <p className="text-xs font-bold text-red-500 uppercase tracking-widest">Registrar Incidente</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Tipo de Incidente *</label>
              <select required className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200" style={{ borderColor: "#FECACA" }}
                value={incDirectoForm.tipo_incidente} onChange={e => setIncDirectoForm(f => ({ ...f, tipo_incidente: e.target.value }))}>
                <option value="falla_mecanica">Falla Mecánica</option>
                <option value="accidente">Accidente</option>
                <option value="otros">Otros</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Fecha *</label>
              <input type="date" required className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200" style={{ borderColor: "#FECACA" }}
                value={incDirectoForm.fecha} onChange={e => setIncDirectoForm(f => ({ ...f, fecha: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Responsable</label>
            <input className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200" style={{ borderColor: "#FECACA" }}
              value={incDirectoForm.usuario_nombre} onChange={e => setIncDirectoForm(f => ({ ...f, usuario_nombre: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Descripción *</label>
            <textarea required rows={3} className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 resize-none" style={{ borderColor: "#FECACA" }}
              placeholder="Describe el incidente..." value={incDirectoForm.observaciones} onChange={e => setIncDirectoForm(f => ({ ...f, observaciones: e.target.value }))} />
          </div>
          <div className="flex items-center justify-between p-3 rounded-xl" style={{ background: incDirectoForm.ambulancia_operativa ? "#F0FDF4" : "#FEF2F2", border: `1px solid ${incDirectoForm.ambulancia_operativa ? "#86EFAC" : "#FECACA"}` }}>
            <div>
              <p className="text-xs font-semibold" style={{ color: incDirectoForm.ambulancia_operativa ? "#16A34A" : "#DC2626" }}>
                {incDirectoForm.ambulancia_operativa ? "✓ Ambulancia Operativa" : "✗ Ambulancia Fuera de Servicio"}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                {incDirectoForm.ambulancia_operativa ? "La ambulancia puede continuar en servicio" : "Se notificará a los administradores por correo"}
              </p>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={incDirectoForm.ambulancia_operativa} onChange={e => setIncDirectoForm(f => ({ ...f, ambulancia_operativa: e.target.checked }))} />
              <span className="text-xs font-medium text-slate-600">Operativa</span>
            </label>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={savingIncDirecto} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: "#EF4444" }}>
              {savingIncDirecto ? "Guardando..." : "Registrar Incidente"}
            </button>
            <button type="button" onClick={() => setShowIncidenteForm(false)} className="px-4 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100">Cancelar</button>
          </div>
        </form>
      )}

      {/* Formulario nuevo conductor */}
      {showConductorForm && (
        <form onSubmit={handleSaveConductor} className="bg-white p-5 rounded-2xl space-y-3" style={{ border: "1px solid #E2E8F0" }}>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Asignar Nuevo Conductor</p>
          {registroActivo && (
            <div className="flex items-center gap-2 text-xs p-3 rounded-xl" style={{ background: "#FFFBEB", border: "1px solid #FDE68A", color: "#B45309" }}>
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
              Se cerrará automáticamente el registro de <strong className="mx-1">{registroActivo.conductor}</strong> con KM final = KM inicial − 1
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Conductor *</label>
              <input required className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" style={{ borderColor: "#E2E8F0" }} placeholder="Nombre del conductor" value={form.conductor} onChange={e => setForm(f => ({ ...f, conductor: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">KM Inicial *</label>
              <input type="number" required className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" style={{ borderColor: "#E2E8F0" }} value={form.km_inicial} onChange={e => setForm(f => ({ ...f, km_inicial: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Fecha</label>
              <input type="date" className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" style={{ borderColor: "#E2E8F0" }} value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} />
            </div>
          </div>
          {/* Incidente opcional */}
          <div className="pt-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="rounded" checked={form.tiene_incidente} onChange={e => setForm(f => ({ ...f, tiene_incidente: e.target.checked, incidente: "", tipo_incidente: "falla_mecanica", ambulancia_operativa: true }))} />
              <span className="text-xs font-medium text-slate-600">Registrar incidente en este turno</span>
            </label>
            {form.tiene_incidente && (
              <div className="mt-3 space-y-3 p-4 rounded-xl" style={{ background: "#FFF5F5", border: "1px solid #FECACA" }}>
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Tipo de Incidente *</label>
                  <select required className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200" style={{ borderColor: "#FECACA" }}
                    value={form.tipo_incidente} onChange={e => setForm(f => ({ ...f, tipo_incidente: e.target.value }))}>
                    <option value="falla_mecanica">Falla Mecánica</option>
                    <option value="accidente">Accidente</option>
                    <option value="otros">Otros</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Descripción del Incidente *</label>
                  <textarea rows={2} required className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 resize-none" style={{ borderColor: "#FECACA" }}
                    placeholder="Describe el incidente ocurrido..." value={form.incidente} onChange={e => setForm(f => ({ ...f, incidente: e.target.value }))} />
                </div>
                <div className="flex items-center justify-between p-3 rounded-xl" style={{ background: form.ambulancia_operativa ? "#F0FDF4" : "#FEF2F2", border: `1px solid ${form.ambulancia_operativa ? "#86EFAC" : "#FECACA"}` }}>
                  <div>
                    <p className="text-xs font-semibold" style={{ color: form.ambulancia_operativa ? "#16A34A" : "#DC2626" }}>
                      {form.ambulancia_operativa ? "✓ Ambulancia Operativa" : "✗ Ambulancia Fuera de Servicio"}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {form.ambulancia_operativa ? "La ambulancia puede continuar en servicio" : "Se notificará a los administradores por correo"}
                    </p>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.ambulancia_operativa} onChange={e => setForm(f => ({ ...f, ambulancia_operativa: e.target.checked }))} />
                    <span className="text-xs font-medium text-slate-600">Operativa</span>
                  </label>
                </div>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: "#2563EB" }}>{saving ? "Guardando..." : "Confirmar Asignación"}</button>
            <button type="button" onClick={() => setShowConductorForm(false)} className="px-4 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100">Cancelar</button>
          </div>
        </form>
      )}

      {/* Tabla asignaciones recientes */}
      <div className="bg-white rounded-2xl overflow-hidden" style={{ border: "1px solid #E2E8F0" }}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Asignaciones Recientes</p>
        </div>
        {registros.length === 0 ? (
          <EmptyState icon={BookOpen} text="Sin registros en la bitácora" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-widest">Conductor</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-widest">Fecha</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-widest">KM Inicio</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-widest">KM Fin</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-widest">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {registros.map(r => {
                  const isActive = !r.km_final;
                  const kmIni = r.km_inicial || r.valor_km || 0;
                  const dist = r.km_final ? r.km_final - kmIni : null;
                  return (
                    <tr key={r.id} className={isActive ? "bg-blue-50" : "hover:bg-slate-50"}>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{ background: isActive ? "#DBEAFE" : "#F1F5F9" }}>
                            <User className="w-4 h-4" style={{ color: isActive ? "#2563EB" : "#94A3B8" }} />
                          </div>
                          <div>
                            <p className="font-semibold text-slate-900">{r.conductor || "Sin nombre"}</p>
                            {isActive
                              ? <p className="text-xs text-blue-500 font-medium">Turno activo</p>
                              : <p className="text-xs text-slate-400">Turno finalizado</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <p className="font-medium text-slate-700">{r.fecha}</p>
                      </td>
                      <td className="px-5 py-3.5 text-right font-semibold text-slate-800">{kmIni.toLocaleString()}</td>
                      <td className="px-5 py-3.5 text-right font-semibold text-slate-500">{r.km_final ? r.km_final.toLocaleString() : <span className="text-blue-400">activo</span>}</td>
                      <td className="px-5 py-3.5 text-right">
                        {dist !== null
                          ? <span className="px-2.5 py-1 rounded-full text-xs font-bold" style={{ background: "#EFF6FF", color: "#2563EB" }}>{dist.toLocaleString()} km</span>
                          : <span className="text-slate-300">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {registroActivo && (
          <div className="px-5 py-3 flex items-start gap-3" style={{ background: "#EFF6FF", borderTop: "1px solid #DBEAFE" }}>
            <Zap className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-blue-700">Traspaso Automático Activo</p>
              <p className="text-xs text-blue-500">Al asignar un nuevo conductor, el registro de <strong>{registroActivo.conductor}</strong> se cerrará automáticamente.</p>
            </div>
          </div>
        )}
      </div>

      {/* Incidentes listado */}
      {incidentes.length > 0 && (
        <div className="bg-white rounded-2xl overflow-hidden" style={{ border: "1px solid #FECACA" }}>
          <div className="px-5 py-3 border-b border-red-100">
            <p className="text-xs font-bold text-red-500 uppercase tracking-widest">Incidentes Registrados ({incidentes.length})</p>
          </div>
          <div className="divide-y divide-red-50">
            {incidentes.map(inc => (
              <div key={inc.id} className="flex items-start gap-3 px-5 py-3.5">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: "#FEF2F2" }}><AlertTriangle className="w-3.5 h-3.5 text-red-500" /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-800">{inc.observaciones}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{inc.fecha}{inc.usuario_nombre && ` • ${inc.usuario_nombre}`}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {addingIncForKm && (
        <form onSubmit={handleSaveIncidente} className="bg-white p-5 rounded-2xl space-y-3" style={{ border: "1px solid #FECACA", background: "#FFF5F5" }}>
          <p className="text-xs font-bold text-red-500 uppercase tracking-widest">Nuevo Incidente</p>
          <textarea required rows={3} className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 resize-none" style={{ borderColor: "#FECACA" }}
            placeholder="Describe el incidente..." value={incForm.observaciones} onChange={e => setIncForm(f => ({ ...f, observaciones: e.target.value }))} />
          <div className="flex gap-2">
            <button type="submit" disabled={savingInc} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: "#EF4444" }}>{savingInc ? "Guardando..." : "Registrar"}</button>
            <button type="button" onClick={() => setAddingIncForKm(null)} className="px-4 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100">Cancelar</button>
          </div>
        </form>
      )}
    </div>
  );
}

/* ── Shared helpers ── */
function SectionHeader({ title, count, onAdd, addLabel = "Registrar" }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h3 className="font-bold text-slate-900">{title}</h3>
        <p className="text-xs text-slate-400 mt-0.5">{count} registro(s)</p>
      </div>
      <button onClick={onAdd} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white hover:opacity-90 transition-all" style={{ background: "#2563EB" }}>
        <Plus className="w-3.5 h-3.5" /> {addLabel}
      </button>
    </div>
  );
}

function ActividadForm({ form, setForm, saving, onSave, onCancel, tipoOptions, showFileUpload }) {
  const fileRef = useRef();
  const [uploading, setUploading] = useState(false);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setForm(f => ({ ...f, archivo_url: file_url }));
    setUploading(false);
  };

  return (
    <div className="bg-white p-5 rounded-2xl space-y-3" style={{ border: "1px solid #E2E8F0" }}>
      <form onSubmit={onSave} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Tipo</label>
            <select className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" style={{ borderColor: "#E2E8F0" }}
              value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}>
              {tipoOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Fecha</label>
            <input type="date" required className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" style={{ borderColor: "#E2E8F0" }}
              value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">Responsable</label>
          <input className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" style={{ borderColor: "#E2E8F0" }}
            value={form.usuario_nombre} onChange={e => setForm(f => ({ ...f, usuario_nombre: e.target.value }))} />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">Observaciones</label>
          <textarea rows={2} className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none" style={{ borderColor: "#E2E8F0" }}
            value={form.observaciones} onChange={e => setForm(f => ({ ...f, observaciones: e.target.value }))} />
        </div>
        {showFileUpload && (
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Adjuntar Documento (opcional)</label>
            <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.jpg,.png" className="hidden" onChange={handleFile} />
            {form.archivo_url ? (
              <div className="flex items-center gap-2 p-3 rounded-xl" style={{ background: "#F0FDF4", border: "1px solid #BBF7D0" }}>
                <CheckCircle className="w-4 h-4 text-green-600" />
                <span className="text-xs text-green-700 font-medium flex-1">Archivo cargado</span>
                <a href={form.archivo_url} target="_blank" rel="noreferrer" className="text-xs text-green-700 underline flex items-center gap-1">Ver <ExternalLink className="w-3 h-3" /></a>
                <button type="button" onClick={() => setForm(f => ({ ...f, archivo_url: "" }))} className="text-slate-400 hover:text-red-400"><X className="w-3.5 h-3.5" /></button>
              </div>
            ) : (
              <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
                className="w-full flex items-center justify-center gap-2 p-3 rounded-xl text-sm font-medium"
                style={{ border: "2px dashed #CBD5E1", color: "#64748B", background: "#F8FAFC" }}>
                {uploading ? <><Loader2 className="w-4 h-4 animate-spin" /> Subiendo...</> : <><Upload className="w-4 h-4" /> Seleccionar documento</>}
              </button>
            )}
          </div>
        )}
        <div className="flex gap-2">
          <button type="submit" disabled={saving || uploading} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: "#2563EB" }}>
            {saving ? "Guardando..." : "Guardar"}
          </button>
          <button type="button" onClick={onCancel} className="px-4 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100">Cancelar</button>
        </div>
      </form>
    </div>
  );
}

function FileUploadButton({ label, color, accept = ".pdf,.doc,.docx" }) {
  const ref = useRef();
  const [uploading, setUploading] = useState(false);
  const [url, setUrl] = useState(null);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setUrl(file_url);
    setUploading(false);
  };

  return (
    <>
      <input ref={ref} type="file" accept={accept} className="hidden" onChange={handleFile} />
      {url ? (
        <a href={url} target="_blank" rel="noreferrer"
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold"
          style={{ color, border: `1px solid ${color}44`, background: `${color}10` }}>
          <ExternalLink className="w-3.5 h-3.5" /> Ver archivo
        </a>
      ) : (
        <button onClick={() => ref.current?.click()} disabled={uploading}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all"
          style={{ color, border: `1px solid ${color}44`, background: `${color}10` }}>
          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          {uploading ? "Subiendo..." : label}
        </button>
      )}
    </>
  );
}

function ActivityCard({ act, tipoLabel, tipoColor, showArchivo }) {
  const color = tipoColor[act.tipo] || "#64748B";
  const label = tipoLabel[act.tipo] || act.tipo;
  return (
    <div className="bg-white p-4 rounded-xl flex items-start gap-3" style={{ border: "1px solid #E2E8F0" }}>
      <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: color }} />
      <div className="flex-1">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-800">{label}</span>
          <span className="text-xs text-slate-400">{act.fecha}</span>
        </div>
        {act.observaciones && <p className="text-xs text-slate-500 mt-1">{act.observaciones}</p>}
        {act.usuario_nombre && <p className="text-xs text-slate-400 mt-1 flex items-center gap-1"><User className="w-3 h-3" />{act.usuario_nombre}</p>}
        {showArchivo && act.archivo_url && (
          <a href={act.archivo_url} target="_blank" rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline">
            <FileText className="w-3 h-3" /> Ver documento adjunto
          </a>
        )}
      </div>
    </div>
  );
}

function EmptyState({ icon: Icon, text }) {
  return (
    <div className="py-14 flex flex-col items-center gap-3">
      <Icon className="w-10 h-10 text-slate-200" />
      <p className="text-sm text-slate-400">{text}</p>
    </div>
  );
}

/* ══════════════════════════════════════════════
   INFORME EXTERNO CARD
══════════════════════════════════════════════ */
function InformeExternoCard({ equipo, user, onUpdated }) {
  const fileRef = useRef();
  const [uploading, setUploading] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [form, setForm] = useState({
    empresa: equipo.empresa_responsable_informe_externo || "",
    fecha: equipo.fecha_ultimo_informe_externo || new Date().toISOString().split("T")[0],
    resultado: equipo.resultado_ultimo_informe_externo || "aprobado",
    proxima: equipo.proxima_revision_anual || "",
  });
  const [archivoUrl, setArchivoUrl] = useState(equipo.url_ultimo_informe_externo || "");
  const [subiendoDrive, setSubiendoDrive] = useState(false);
  const [driveOk, setDriveOk] = useState(false);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setArchivoUrl(file_url);
    setUploading(false);
  };

  const handleGuardar = async () => {
    if (!archivoUrl) return;
    setGuardando(true);
    await base44.entities.Equipo.update(equipo.id, {
      fecha_ultimo_informe_externo: form.fecha,
      url_ultimo_informe_externo: archivoUrl,
      empresa_responsable_informe_externo: form.empresa,
      responsable_carga_informe_externo: user?.email || "",
      resultado_ultimo_informe_externo: form.resultado,
      // Esta es la fecha que dispara la alerta de certificación por vencer.
      proxima_revision_anual: form.proxima || null,
    });

    // Subir a Drive
    setSubiendoDrive(true);
    try {
      await base44.functions.invoke("subirInspeccionDrive", {
        tipo: "mantenimiento_externo",
        equipo_id: equipo.id,
      });
      setDriveOk(true);
    } catch (_) {}
    setSubiendoDrive(false);
    setGuardando(false);
    onUpdated && onUpdated();
  };

  return (
    <div className="bg-white p-5 rounded-2xl space-y-4" style={{ border: "1px solid #BBF7D0" }}>
      <div className="flex items-center gap-2 mb-1">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#DCFCE7" }}>
          <Wrench className="w-4 h-4 text-green-600" />
        </div>
        <div>
          <p className="text-xs font-bold text-green-600 uppercase tracking-widest">Informe de Mantenimiento Externo</p>
          <p className="text-xs text-slate-400">Se guardará en Google Drive automáticamente al registrar</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">Empresa Responsable</label>
          <input className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-200"
            style={{ borderColor: "#BBF7D0" }}
            placeholder="Nombre empresa o técnico"
            value={form.empresa} onChange={e => setForm(f => ({ ...f, empresa: e.target.value }))} />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">Fecha del Informe</label>
          <input type="date" className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-200"
            style={{ borderColor: "#BBF7D0" }}
            value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">Resultado</label>
          <select className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-200"
            style={{ borderColor: "#BBF7D0" }}
            value={form.resultado} onChange={e => setForm(f => ({ ...f, resultado: e.target.value }))}>
            <option value="aprobado">Aprobado</option>
            <option value="aprobado_con_observaciones">Aprobado con observaciones</option>
            <option value="rechazado">Rechazado</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">Próxima revisión</label>
          <input type="date" className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-200"
            style={{ borderColor: "#BBF7D0" }}
            value={form.proxima} onChange={e => setForm(f => ({ ...f, proxima: e.target.value }))} />
          <p className="text-[11px] text-slate-400 mt-1">Sin esta fecha el sistema no puede avisar que la certificación caduca.</p>
        </div>
      </div>

      <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" className="hidden" onChange={handleFile} />

      {archivoUrl ? (
        <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: "#F0FDF4", border: "1px solid #BBF7D0" }}>
          <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
          <span className="text-xs text-green-700 font-medium flex-1">Archivo listo</span>
          <a href={archivoUrl} target="_blank" rel="noreferrer" className="text-xs text-green-700 underline flex items-center gap-1">
            Ver <ExternalLink className="w-3 h-3" />
          </a>
          <button type="button" onClick={() => setArchivoUrl("")} className="text-slate-400 hover:text-red-400">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <button onClick={() => fileRef.current?.click()} disabled={uploading}
          className="w-full flex items-center justify-center gap-2 p-3 rounded-xl text-sm font-medium"
          style={{ border: "2px dashed #86EFAC", color: "#16A34A", background: "#F0FDF4" }}>
          {uploading ? <><Loader2 className="w-4 h-4 animate-spin" /> Subiendo archivo...</> : <><Upload className="w-4 h-4" /> Seleccionar PDF del Informe</>}
        </button>
      )}

      {driveOk && (
        <div className="flex items-center gap-2 p-2.5 rounded-xl text-xs font-semibold" style={{ background: "#EFF6FF", color: "#2563EB", border: "1px solid #BFDBFE" }}>
          <CheckCircle className="w-3.5 h-3.5" /> Guardado en Google Drive correctamente
        </div>
      )}

      <button
        onClick={handleGuardar}
        disabled={!archivoUrl || guardando || uploading}
        className="w-full py-2.5 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-50"
        style={{ background: "#16A34A" }}>
        {subiendoDrive ? <><Loader2 className="w-4 h-4 animate-spin" /> Sincronizando con Drive...</>
          : guardando ? "Guardando..."
          : <><FileText className="w-4 h-4" /> Registrar Informe y Subir a Drive</>}
      </button>

      {equipo.fecha_ultimo_informe_externo && (
        <div className="p-3 rounded-xl text-xs space-y-1" style={{ background: "#F8FAFC", border: "1px solid #E2E8F0" }}>
          <p className="font-bold text-slate-500 uppercase tracking-widest text-xs mb-1">Último Informe Registrado</p>
          <p className="text-slate-700"><span className="font-semibold">Fecha:</span> {equipo.fecha_ultimo_informe_externo.split("-").reverse().join("/")}</p>
          {equipo.empresa_responsable_informe_externo && <p className="text-slate-700"><span className="font-semibold">Empresa:</span> {equipo.empresa_responsable_informe_externo}</p>}
          {equipo.resultado_ultimo_informe_externo && <p className="text-slate-700"><span className="font-semibold">Resultado:</span> {equipo.resultado_ultimo_informe_externo.replace(/_/g, " ")}</p>}
          {equipo.proxima_revision_anual && <p className="text-slate-700"><span className="font-semibold">Próxima revisión:</span> {equipo.proxima_revision_anual.split("-").reverse().join("/")}</p>}
          {equipo.responsable_carga_informe_externo && <p className="text-slate-700"><span className="font-semibold">Cargado por:</span> {equipo.responsable_carga_informe_externo}</p>}
          {equipo.url_ultimo_informe_externo && (
            <a href={equipo.url_ultimo_informe_externo} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1 text-blue-600 font-semibold hover:underline mt-1">
              <ExternalLink className="w-3 h-3" /> Ver documento original
            </a>
          )}
        </div>
      )}
    </div>
  );
}