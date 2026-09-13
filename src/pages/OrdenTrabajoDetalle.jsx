import { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useParams, useNavigate, Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  ArrowLeft, Wrench, Car, User, Clock, AlertTriangle, CheckCircle2,
  Calendar, ClipboardList, Save, Loader2, Edit3,
  Stethoscope, Lock, FileDown
} from "lucide-react";
import { generarPDFOrdenTrabajo } from "@/utils/generarPDFOrdenTrabajo";
import { normalizarTipoActivo, etiquetaTipoActivo } from "@/lib/centros";
import { PERMISOS } from "@/lib/permisos";
import LineaTiempo from "@/components/taller/LineaTiempo";
import RepuestosUtilizados from "@/components/taller/RepuestosUtilizados";
import ComentariosOT from "@/components/taller/ComentariosOT";
import ReporteAvance from "@/components/taller/ReporteAvance";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { isSimulandoActivo, getEffectiveNavRole, MENSAJE_BLOQUEO_SIMULACION } from "@/lib/roleSimulator";
import { etiquetaEquipo } from "@/utils/etiquetaEquipo";

// Convierte una fecha ISO a valor local para input datetime-local
function toLocalInput(fecha) {
  if (!fecha) return "";
  try {
    const d = new Date(fecha);
    if (isNaN(d.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch { return ""; }
}

const ESTADO_CFG = {
  pendiente: { label: "Pendiente", color: "#D97706", bg: "#FFFBEB" },
  asignada: { label: "Asignada", color: "#2563EB", bg: "#EFF6FF" },
  en_proceso: { label: "En Proceso", color: "#7C3AED", bg: "#F5F3FF" },
  pausada: { label: "Pausada", color: "#64748B", bg: "#F1F5F9" },
  en_revision: { label: "En Revisión", color: "#D97706", bg: "#FFFBEB" },
  completada: { label: "Completada", color: "#16A34A", bg: "#F0FDF4" },
  cancelada: { label: "Cancelada", color: "#DC2626", bg: "#FEF2F2" },
};

const PRIORIDAD_CFG = {
  alta: { label: "Alta", color: "#DC2626", bg: "#FEF2F2" },
  media: { label: "Media", color: "#D97706", bg: "#FFFBEB" },
  baja: { label: "Baja", color: "#2563EB", bg: "#EFF6FF" },
};

export default function OrdenTrabajoDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [ot, setOt] = useState(null);
  const [repuestos, setRepuestos] = useState([]);
  const [mecanicos, setMecanicos] = useState([]);
  const [loading, setLoading] = useState(true);

  // Campos editables
  const [diagnostico, setDiagnostico] = useState("");
  const [editDiag, setEditDiag] = useState(false);
  const [mecanicoSel, setMecanicoSel] = useState("");
  const [fechaHora, setFechaHora] = useState("");
  const [obsAsignacion, setObsAsignacion] = useState("");
  const [horasReales, setHorasReales] = useState("");
  const [manoObra, setManoObra] = useState("");
  const [notasCierre, setNotasCierre] = useState("");
  const [guardando, setGuardando] = useState(false);
  const { toast } = useToast();

  // Durante "Simular Rol" las escrituras están bloqueadas (solo lectura).
  // Se respeta el rol efectivo para mostrar/ocultar acciones según el perfil simulado.
  const effectiveRole = getEffectiveNavRole(user?.role);
  const simActivo = isSimulandoActivo();
  // El mecánico puede editar diagnóstico y repuestos, y reportar avances,
  // pero NO asignar mecánicos ni cerrar la OT con costos (eso es del Jefe de Taller).
  const canEdit = !simActivo && ["super_admin", "jefe_taller", "mecanico"].includes(effectiveRole);
  const esJefe = !simActivo && ["super_admin", "jefe_taller"].includes(effectiveRole);
  const esMecanico = !simActivo && effectiveRole === "mecanico";
  const canCerrar = esJefe;

  const fetchData = useCallback(async () => {
    const [rep, usersRes] = await Promise.all([
      base44.entities.Repuesto.list("-created_date", 200).catch(() => []),
      base44.functions.invoke("getUsuariosPorCentro").catch(() => ({ data: [] })),
    ]);
    setRepuestos(rep);
    const users = Array.isArray(usersRes?.data) ? usersRes.data : [];
    setMecanicos(users.filter(us => us.role === "mecanico"));
    const otData = await base44.entities.OrdenTrabajo.get(id).catch(() => null);
    setOt(otData);
    setDiagnostico(otData?.diagnostico || "");
    setMecanicoSel(otData?.mecanico_email || "");
    setFechaHora(toLocalInput(otData?.fecha_asignacion));
    setHorasReales(otData?.horas_reales || "");
    setManoObra(otData?.total_mano_obra || "");
    setNotasCierre(otData?.notas_cierre || "");
    setLoading(false);
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!ot) return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6">
      <AlertTriangle className="w-12 h-12 text-slate-300 mb-3" />
      <p className="text-slate-500 font-medium">Orden de trabajo no encontrada</p>
      <Link to={createPageUrl("Taller")} className="mt-4 text-sm text-blue-600 font-semibold">← Volver al Taller</Link>
    </div>
  );

  const estado = ESTADO_CFG[ot.estado] || ESTADO_CFG.pendiente;
  const prio = PRIORIDAD_CFG[ot.prioridad] || PRIORIDAD_CFG.media;

  const addTimeline = (evento, notas) => ({
    fecha: new Date().toISOString(),
    evento, usuario_email: user?.email, usuario_nombre: user?.full_name, notas,
  });

  const handleGuardarDiagnostico = async () => {
    setGuardando(true);
    try {
      await base44.entities.OrdenTrabajo.update(ot.id, { diagnostico });
      setOt({ ...ot, diagnostico });
      setEditDiag(false);
      toast({ title: "Diagnóstico guardado" });
    } catch (e) {
      toast({ title: "No se pudo guardar", description: e.message, variant: "destructive" });
    }
    setGuardando(false);
  };

  const handleAsignar = async () => {
    setGuardando(true);
    try {
      const mec = mecanicos.find(m => m.email === mecanicoSel);
      const fechaAsignacion = fechaHora ? new Date(fechaHora).toISOString() : (ot.fecha_asignacion || new Date().toISOString());
      const update = {
        mecanico_email: mecanicoSel || "",
        mecanico_nombre: mec?.full_name || "",
        estado: ot.estado === "pendiente" ? "asignada" : ot.estado,
        fecha_asignacion: fechaAsignacion,
        linea_tiempo: [...(ot.linea_tiempo || []), addTimeline("Mecánico asignado", obsAsignacion || mec?.full_name || "")],
      };
      await base44.entities.OrdenTrabajo.update(ot.id, update);
      setOt({ ...ot, ...update });
      setObsAsignacion("");
      toast({ title: "Asignación guardada", description: mec?.full_name ? `Mecánico: ${mec.full_name}` : "Sin asignar" });
    } catch (e) {
      toast({ title: "No se pudo guardar la asignación", description: e.message, variant: "destructive" });
    }
    setGuardando(false);
  };

  const handleCambiarEstado = async (nuevoEstado) => {
    if (nuevoEstado === "completada" && !canCerrar) return; // solo Jefe de Taller / Base del Sistema cierra la OT
    setGuardando(true);
    try {
      const update = {
        estado: nuevoEstado,
        linea_tiempo: [...(ot.linea_tiempo || []), addTimeline(`Estado: ${ESTADO_CFG[nuevoEstado].label}`, "")],
      };
      if (nuevoEstado === "en_proceso" && !ot.fecha_inicio) {
        update.fecha_inicio = new Date().toISOString().split("T")[0];
      }
      if (nuevoEstado === "completada") {
        update.fecha_fin = new Date().toISOString().split("T")[0];
        update.horas_reales = horasReales ? Number(horasReales) : ot.horas_reales;
        update.total_mano_obra = manoObra ? Number(manoObra) : ot.total_mano_obra;
        update.notas_cierre = notasCierre;
        update.total = (ot.total_repuestos || 0) + (manoObra ? Number(manoObra) : (ot.total_mano_obra || 0));

        // Al cerrar la OT se descuenta el stock real de cada repuesto reportado
        // por el mecánico (hasta este momento solo era un registro editable).
        for (const item of (ot.repuestos_utilizados || [])) {
          if (!item.repuesto_id) continue;
          try {
            const rep = await base44.entities.Repuesto.get(item.repuesto_id);
            if (rep) {
              await base44.entities.Repuesto.update(item.repuesto_id, {
                stock_actual: Math.max(0, (rep.stock_actual || 0) - Number(item.cantidad || 0)),
              });
            }
          } catch (_) { /* si un repuesto fue eliminado, no bloquea el cierre */ }
        }
      }
      await base44.entities.OrdenTrabajo.update(ot.id, update);
      setOt({ ...ot, ...update });
      toast({ title: `Estado: ${ESTADO_CFG[nuevoEstado].label}` });
    } catch (e) {
      toast({ title: "No se pudo cambiar el estado", description: e.message, variant: "destructive" });
    }
    setGuardando(false);
  };

  const handleGuardarManoObra = async () => {
    setGuardando(true);
    try {
      const mo = Number(manoObra) || 0;
      const totalRep = ot.total_repuestos || 0;
      await base44.entities.OrdenTrabajo.update(ot.id, {
        total_mano_obra: mo, total: totalRep + mo,
        horas_reales: horasReales ? Number(horasReales) : ot.horas_reales,
      });
      setOt({ ...ot, total_mano_obra: mo, total: totalRep + mo });
      toast({ title: "Cierre guardado" });
    } catch (e) {
      toast({ title: "No se pudo guardar el cierre", description: e.message, variant: "destructive" });
    }
    setGuardando(false);
  };

  const fmtFecha = (f) => f ? new Date(f).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" }) : "—";
  const fmtFechaHora = (f) => {
    if (!f) return "—";
    try {
      const d = new Date(f);
      if (isNaN(d.getTime())) return fmtFecha(f);
      return d.toLocaleString("es-CL", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch { return fmtFecha(f); }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="relative overflow-hidden px-4 lg:px-10 pt-5 lg:pt-10 pb-6 lg:pb-8"
        style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e293b 40%, #334155 100%)" }}>
        <div className="relative max-w-5xl mx-auto">
          <button onClick={() => navigate(createPageUrl("Taller"))}
            className="flex items-center gap-1 text-slate-300 hover:text-white text-sm font-medium mb-4">
            <ArrowLeft className="w-4 h-4" /> Taller
          </button>
          <div className="flex items-start gap-3 flex-wrap">
            <div className="w-11 h-11 lg:w-14 lg:h-14 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(255,255,255,0.15)" }}>
              <Wrench className="w-5 h-5 lg:w-7 lg:h-7 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h1 className="text-xl lg:text-3xl font-bold text-white">{ot.numero_ot}</h1>
                <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: estado.bg, color: estado.color }}>{estado.label}</span>
                <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: prio.bg, color: prio.color }}>Prioridad {prio.label}</span>
                {(() => {
                  const catOT = normalizarTipoActivo(ot.tipo_activo);
                  const estilo = {
                    salud: "bg-red-500/20 text-red-200",
                    corporativo: "bg-blue-500/20 text-blue-200",
                    externo: "bg-purple-500/20 text-purple-200",
                  }[catOT] || "bg-blue-500/20 text-blue-200";
                  return (
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${estilo}`}>{etiquetaTipoActivo(catOT)}</span>
                  );
                })()}
              </div>
              <div className="flex items-center gap-1.5">
                <Car className="w-4 h-4 text-slate-300" />
                <span className="text-sm font-semibold text-white">{etiquetaEquipo(ot.equipo_label, ot.patente)}</span>
              </div>
            </div>
            {ot.estado === "completada" && (
              <button onClick={() => generarPDFOrdenTrabajo(ot)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white flex-shrink-0"
                style={{ background: "rgba(255,255,255,0.15)" }}>
                <FileDown className="w-4 h-4" /> Descargar PDF
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 lg:px-10 mt-3 lg:mt-5 pb-10 space-y-4">
        {simActivo && (
          <div className="rounded-2xl px-4 py-3 flex items-center gap-2 text-sm font-semibold" style={{ background: "#F5F3FF", color: "#7C3AED" }}>
            <Lock className="w-4 h-4 flex-shrink-0" /> {MENSAJE_BLOQUEO_SIMULACION}
          </div>
        )}
        {/* Resumen costos */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-2xl p-4" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
            <p className="text-xs text-slate-400 mb-0.5">Repuestos</p>
            <p className="text-lg lg:text-xl font-bold text-violet-700">${(ot.total_repuestos || 0).toLocaleString("es-CL")}</p>
          </div>
          <div className="bg-white rounded-2xl p-4" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
            <p className="text-xs text-slate-400 mb-0.5">Mano de Obra</p>
            <p className="text-lg lg:text-xl font-bold text-slate-700">${(ot.total_mano_obra || 0).toLocaleString("es-CL")}</p>
          </div>
          <div className="rounded-2xl p-4" style={{ background: "#EFF6FF", boxShadow: "0 2px 8px rgba(37,99,235,0.12)" }}>
            <p className="text-xs text-blue-500 mb-0.5">Total</p>
            <p className="text-lg lg:text-xl font-bold text-blue-700">${(ot.total || 0).toLocaleString("es-CL")}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Columna principal */}
          <div className="lg:col-span-2 space-y-4">
            {/* Problema reportado */}
            <div className="bg-white rounded-2xl p-5" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
              <h3 className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-red-600" /> Problema Reportado
              </h3>
              <p className="text-sm text-slate-600 whitespace-pre-wrap">{ot.problema_reportado || "Sin descripción"}</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-slate-400">
                {ot.reportado_por_nombre && <span>Reportado por: <b className="text-slate-600">{ot.reportado_por_nombre}</b></span>}
                {ot.origen && <span>Origen: <b className="text-slate-600 capitalize">{ot.origen.replace(/_/g, " ")}</b></span>}
                <span>Creada: <b className="text-slate-600">{fmtFecha(ot.created_date)}</b></span>
              </div>
            </div>

            {/* Diagnóstico */}
            <div className="bg-white rounded-2xl p-5" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                  <Stethoscope className="w-4 h-4 text-blue-600" /> Diagnóstico Técnico
                </h3>
                {canEdit && !editDiag && (
                  <button onClick={() => setEditDiag(true)} className="text-xs font-bold text-blue-600 flex items-center gap-1">
                    <Edit3 className="w-3.5 h-3.5" /> Editar
                  </button>
                )}
              </div>
              {editDiag ? (
                <div className="space-y-2">
                  <textarea rows={3} value={diagnostico} onChange={e => setDiagnostico(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm resize-none"
                    placeholder="Diagnóstico del taller..." />
                  <div className="flex gap-2">
                    <button onClick={() => { setEditDiag(false); setDiagnostico(ot.diagnostico || ""); }}
                      className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-500 bg-slate-100">Cancelar</button>
                    <button onClick={handleGuardarDiagnostico} disabled={guardando}
                      className="px-4 py-2 rounded-lg text-xs font-bold text-white flex items-center gap-1" style={{ background: "#2563EB" }}>
                      {guardando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Guardar
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-600 whitespace-pre-wrap">{ot.diagnostico || "Sin diagnóstico registrado."}</p>
              )}
            </div>

            {/* Repuestos utilizizados */}
            <RepuestosUtilizados ot={ot} repuestosDisponibles={repuestos} onUpdate={fetchData} editable={canEdit && ot.estado !== "completada"} puedeComprar={!PERMISOS.compraDirectaSoloJefe || esJefe} />

            {/* Reporte de avance del mecánico */}
            {(esMecanico || esJefe) && (
              <ReporteAvance ot={ot} user={user} onActualizado={fetchData} />
            )}

            {/* Línea de tiempo */}
            <div className="bg-white rounded-2xl p-5" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
              <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-500" /> Línea de Tiempo
              </h3>
              <LineaTiempo eventos={ot.linea_tiempo || []} />
            </div>

            {/* Notas y consultas para coordinación entre roles */}
            <ComentariosOT ot={ot} />
          </div>

          {/* Columna lateral */}
          <div className="space-y-4">
            {/* Asignación mecánico — solo el Jefe de Taller la gestiona.
                Cuando ya hay un mecánico asignado se muestra un resumen simple
                en lugar del formulario editable. */}
            {esJefe && ot.mecanico_email ? (
              <div className="bg-white rounded-2xl p-5" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
                <h3 className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                  <User className="w-4 h-4 text-blue-600" /> Mecánico asignado
                </h3>
                <p className="text-sm font-semibold text-slate-800">{ot.mecanico_nombre || ot.mecanico_email}</p>
                <p className="text-xs text-slate-400 mt-1">Asignado el {fmtFechaHora(ot.fecha_asignacion)}</p>
              </div>
            ) : esJefe ? (
            <div className="bg-white rounded-2xl p-5" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
              <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                <User className="w-4 h-4 text-blue-600" /> Asignación
              </h3>
              <label className="text-xs text-slate-400 font-semibold">Mecánico asignado</label>
              <select value={mecanicoSel} onChange={e => setMecanicoSel(e.target.value)} disabled={!esJefe}
                className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white disabled:bg-slate-50">
                <option value="">Sin asignar</option>
                {mecanicos.map(m => (
                  <option key={m.id} value={m.email}>{m.full_name}</option>
                ))}
              </select>
              <label className="text-xs text-slate-400 font-semibold mt-3 block">Fecha y hora</label>
              <input type="datetime-local" value={fechaHora} onChange={e => setFechaHora(e.target.value)} disabled={!esJefe}
                className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2.5 text-sm disabled:bg-slate-50" />
              <label className="text-xs text-slate-400 font-semibold mt-3 block">Observaciones (opcional)</label>
              <textarea rows={2} value={obsAsignacion} onChange={e => setObsAsignacion(e.target.value)} disabled={!esJefe}
                placeholder="Comentarios para el mecánico..."
                className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2.5 text-sm resize-none disabled:bg-slate-50" />
              {esJefe && (
                <button onClick={handleAsignar} disabled={guardando}
                  className="w-full mt-3 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50 flex items-center justify-center gap-1"
                  style={{ background: "#2563EB" }}>
                  {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Guardar Asignación
                </button>
              )}
            </div>
            ) : null}

            {/* Fechas */}
            <div className="bg-white rounded-2xl p-5 space-y-2" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
              <h3 className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-slate-500" /> Fechas
              </h3>
              <div className="flex justify-between text-xs"><span className="text-slate-400">Asignación</span><span className="font-semibold text-slate-700">{fmtFechaHora(ot.fecha_asignacion)}</span></div>
              <div className="flex justify-between text-xs"><span className="text-slate-400">Inicio</span><span className="font-semibold text-slate-700">{fmtFecha(ot.fecha_inicio)}</span></div>
              <div className="flex justify-between text-xs"><span className="text-slate-400">Fin</span><span className="font-semibold text-slate-700">{fmtFecha(ot.fecha_fin)}</span></div>
            </div>

            {/* Cierre / Mano de obra */}
            <div className="bg-white rounded-2xl p-5" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
              <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-600" /> Cierre de OT
              </h3>
              <label className="text-xs text-slate-400 font-semibold">Horas reales</label>
              <input type="number" min="0" step="0.5" value={horasReales} onChange={e => setHorasReales(e.target.value)} disabled={!esJefe}
                className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2.5 text-sm disabled:bg-slate-50" />
              <label className="text-xs text-slate-400 font-semibold mt-3 block">Costo mano de obra ($)</label>
              <input type="number" min="0" value={manoObra} onChange={e => setManoObra(e.target.value)} disabled={!esJefe}
                className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2.5 text-sm disabled:bg-slate-50" />
              <label className="text-xs text-slate-400 font-semibold mt-3 block">Notas de cierre</label>
              <textarea rows={2} value={notasCierre} onChange={e => setNotasCierre(e.target.value)} disabled={!esJefe}
                className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2.5 text-sm resize-none disabled:bg-slate-50" />
              {esJefe && ot.estado !== "completada" && (
                <button onClick={handleGuardarManoObra} disabled={guardando}
                  className="w-full mt-3 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50 flex items-center justify-center gap-1"
                  style={{ background: "#16A34A" }}>
                  {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Guardar y Completar
                </button>
              )}
            </div>

            {/* Cambio de estado rápido — solo Jefe de Taller / super admin */}
            {esJefe && (
              <div className="bg-white rounded-2xl p-5" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
                <h3 className="text-sm font-bold text-slate-700 mb-3">Cambiar estado</h3>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(ESTADO_CFG).map(([k, v]) => (
                    <button key={k} onClick={() => handleCambiarEstado(k)}
                      disabled={guardando || ot.estado === k || (k === "completada" && !canCerrar)}
                      title={k === "completada" && !canCerrar ? "Solo Jefe de Taller puede cerrar la OT" : ""}
                      className="py-2 rounded-xl text-xs font-semibold disabled:opacity-40 transition-all"
                      style={{ background: ot.estado === k ? v.color : v.bg, color: ot.estado === k ? "white" : v.color }}>
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}