import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Hammer, Loader2, Wrench, User, Calendar, AlertCircle, CheckCircle2, Clock, Pause, Eye } from "lucide-react";
import { format, parseISO } from "date-fns";
import { Link } from "react-router-dom";

const ESTADOS = {
  pendiente: { label: "Pendiente", color: "#64748B", bg: "#F1F5F9", icon: Clock },
  asignada: { label: "Asignada", color: "#2563EB", bg: "#EFF6FF", icon: User },
  en_proceso: { label: "En Proceso", color: "#2563EB", bg: "#EFF6FF", icon: Wrench },
  pausada: { label: "Pausada", color: "#F59E0B", bg: "#FFFBEB", icon: Pause },
  en_revision: { label: "En Revisión", color: "#8B5CF6", bg: "#F5F3FF", icon: Eye },
  completada: { label: "Completada", color: "#16A34A", bg: "#F0FDF4", icon: CheckCircle2 },
  cancelada: { label: "Cancelada", color: "#EF4444", bg: "#FEF2F2", icon: AlertCircle },
};

const PRIORIDAD = {
  alta: { label: "Alta", color: "#EF4444" },
  media: { label: "Media", color: "#F59E0B" },
  baja: { label: "Baja", color: "#64748B" },
};

export default function TallerTab({ equipo }) {
  const [ordenes, setOrdenes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!equipo?.id) return;
    setLoading(true);
    base44.entities.OrdenTrabajo.filter({ equipo_id: equipo.id }, "-created_date", 100)
      .then(setOrdenes)
      .catch(() => setOrdenes([]))
      .finally(() => setLoading(false));
  }, [equipo?.id]);

  const stats = {
    total: ordenes.length,
    activas: ordenes.filter(o => ["asignada", "en_proceso", "pausada", "en_revision", "pendiente"].includes(o.estado)).length,
    completadas: ordenes.filter(o => o.estado === "completada").length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-7 h-7 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Hammer className="w-4 h-4 text-blue-600" />
          <h3 className="text-base font-bold text-slate-800">Historial de Taller</h3>
        </div>
        <p className="text-xs text-slate-500">
          Trabajos de mantenimiento realizados por el equipo de taller mecánico a este vehículo.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard value={stats.total} label="OTs Totales" color="#7C3AED" />
        <StatCard value={stats.activas} label="En Proceso" color="#2563EB" />
        <StatCard value={stats.completadas} label="Completadas" color="#16A34A" />
      </div>

      {/* List */}
      {ordenes.length === 0 ? (
        <div className="text-center py-12 bg-slate-50 rounded-xl">
          <Wrench className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-400">Sin órdenes de trabajo registradas</p>
          <p className="text-xs text-slate-400 mt-1">Cuando el taller cree una OT para este vehículo, aparecerá aquí.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-slate-700">Órdenes de Trabajo</h4>
          </div>
          {ordenes.map(ot => (
            <OTCard key={ot.id} ot={ot} />
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ value, label, color }) {
  return (
    <div className="bg-white rounded-xl p-3 text-center" style={{ border: "1px solid #E2E8F0" }}>
      <p className="text-2xl font-bold" style={{ color }}>{value}</p>
      <p className="text-[11px] text-slate-500 font-medium mt-0.5">{label}</p>
    </div>
  );
}

function OTCard({ ot }) {
  const [expanded, setExpanded] = useState(false);
  const est = ESTADOS[ot.estado] || ESTADOS.pendiente;
  const pri = PRIORIDAD[ot.prioridad] || PRIORIDAD.media;
  const EstIcon = est.icon;

  const fechaCreada = ot.created_date ? format(parseISO(ot.created_date), "dd/MM/yyyy") : "—";
  const fechaInicio = ot.fecha_inicio ? format(parseISO(ot.fecha_inicio), "dd/MM/yyyy") : null;
  const fechaFin = ot.fecha_fin ? format(parseISO(ot.fecha_fin), "dd/MM/yyyy") : null;

  return (
    <div className="bg-white rounded-xl overflow-hidden" style={{ border: "1px solid #E2E8F0" }}>
      {/* Header row */}
      <button onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-3 text-left hover:bg-slate-50 transition-colors">
        <div className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center" style={{ background: est.bg }}>
          <EstIcon className="w-4 h-4" style={{ color: est.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-slate-800">{ot.numero_ot}</span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: est.bg, color: est.color }}>
              {est.label}
            </span>
            <span className="text-[10px] font-semibold" style={{ color: pri.color }}>● {pri.label}</span>
          </div>
          <p className="text-xs text-slate-500 truncate mt-0.5">{ot.problema_reportado || "Sin descripción"}</p>
          <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-1">
            <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{fechaCreada}</span>
            {ot.mecanico_nombre && <span className="flex items-center gap-1"><User className="w-3 h-3" />{ot.mecanico_nombre}</span>}
          </div>
        </div>
        <ChevronIcon expanded={expanded} />
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t border-slate-100 space-y-2.5">
          {ot.diagnostico && (
            <div>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Diagnóstico</p>
              <p className="text-xs text-slate-700 mt-0.5">{ot.diagnostico}</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            {fechaInicio && <Field label="Fecha Inicio" value={fechaInicio} />}
            {fechaFin && <Field label="Fecha Fin" value={fechaFin} />}
            {ot.supervisor_nombre && <Field label="Supervisor" value={ot.supervisor_nombre} />}
            {ot.total > 0 && <Field label="Total" value={`$${ot.total.toLocaleString("es-CL")}`} />}
          </div>
          {ot.linea_tiempo && ot.linea_tiempo.length > 0 && (
            <div>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Línea de Tiempo</p>
              <div className="space-y-1.5">
                {ot.linea_tiempo.slice(-5).map((ev, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 flex-shrink-0" />
                    <div>
                      <span className="text-slate-600 font-medium">{ev.evento}</span>
                      {ev.notas && <span className="text-slate-400"> — {ev.notas}</span>}
                      <span className="text-slate-400 block text-[10px]">
                        {ev.fecha ? format(parseISO(ev.fecha), "dd/MM/yyyy HH:mm") : ""} {ev.usuario_nombre ? `· ${ev.usuario_nombre}` : ""}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <Link to={`/OrdenTrabajoDetalle/${ot.id}`}
            className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 mt-1">
            Ver detalle completo →
          </Link>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div>
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{label}</p>
      <p className="text-xs text-slate-700 font-medium">{value}</p>
    </div>
  );
}

function ChevronIcon({ expanded }) {
  return (
    <svg className="w-4 h-4 text-slate-400 flex-shrink-0 transition-transform" style={{ transform: expanded ? "rotate(180deg)" : "" }}
      fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}