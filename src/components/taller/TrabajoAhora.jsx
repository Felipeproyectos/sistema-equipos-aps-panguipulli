import { Link } from "react-router-dom";
import { Car, ChevronRight, CalendarClock, Wrench } from "lucide-react";
import ReporteAvance from "@/components/taller/ReporteAvance";
import { estadoCita, textoCita } from "@/lib/agendaTaller";
import { etiquetaEquipo } from "@/utils/etiquetaEquipo";

// Lo primero que ve el mecánico: la orden en la que tiene que estar ahora,
// con los botones grandes para empezar, pausar o entregarla, y lo que viene
// después. Pensado para usarlo con el celular en la mano, en el box.
// El orden lo decide trabajoDelMecanico() en src/lib/paraHoy.js.

const ESTADO = {
  asignada: { label: "Por empezar", color: "#2563EB", bg: "#EFF6FF" },
  en_proceso: { label: "Trabajando", color: "#7C3AED", bg: "#F5F3FF" },
  pausada: { label: "Pausada", color: "#64748B", bg: "#F1F5F9" },
};
const PRIORIDAD = { alta: "#DC2626", media: "#D97706", baja: "#2563EB" };

export default function TrabajoAhora({ ahora, despues = [], user, onActualizado }) {
  if (!ahora) {
    return (
      <div className="bg-white rounded-2xl p-6 text-center" style={{ boxShadow: "0 4px 20px rgba(15,45,107,0.06)" }}>
        <Wrench className="w-10 h-10 text-slate-200 mx-auto mb-2" />
        <p className="font-semibold text-slate-600">No tienes órdenes asignadas por ahora.</p>
        <p className="text-sm text-slate-400 mt-1">Cuando el Jefe de Taller te asigne una, aparece acá.</p>
      </div>
    );
  }

  const est = ESTADO[ahora.estado] || ESTADO.asignada;
  const llega = !ahora.fecha_inicio && estadoCita(ahora) === "confirmada" && ahora.cita_fecha;

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: "0 8px 32px rgba(15,45,107,0.10)" }}>
        <div className="px-5 py-4" style={{ background: "linear-gradient(135deg, #1e293b 0%, #334155 100%)" }}>
          <p className="text-[11px] font-bold uppercase tracking-widest text-amber-300">Tu trabajo ahora</p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <p className="text-lg font-bold text-white">{ahora.numero_ot}</p>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: est.bg, color: est.color }}>{est.label}</span>
            <span className="text-xs font-bold text-white/80">● <span style={{ color: PRIORIDAD[ahora.prioridad] || "#fff" }}>Prioridad {ahora.prioridad || "media"}</span></span>
          </div>
          <p className="text-white/90 text-sm mt-1 flex items-center gap-1.5">
            <Car className="w-4 h-4" /> {etiquetaEquipo(ahora.equipo_label, ahora.patente)}
          </p>
        </div>
        <div className="px-5 py-4 space-y-2">
          <p className="text-sm text-slate-700">{ahora.problema_reportado || "Sin descripción"}</p>
          {ahora.diagnostico && (
            <p className="text-xs text-slate-500"><strong className="text-slate-600">Diagnóstico:</strong> {ahora.diagnostico}</p>
          )}
          {llega && (
            <p className="text-xs text-blue-700 bg-blue-50 rounded-lg px-3 py-2 flex items-center gap-1.5">
              <CalendarClock className="w-3.5 h-3.5" /> El vehículo llega el {textoCita(ahora.cita_fecha)}
              {ahora.cita_nota ? ` · ${ahora.cita_nota}` : ""}
            </p>
          )}
          <Link to={`/OrdenTrabajoDetalle/${ahora.id}`}
            className="inline-flex items-center gap-1 text-sm font-semibold text-blue-600">
            Abrir la orden completa (repuestos, fotos, comentarios) <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      <ReporteAvance ot={ahora} user={user} onActualizado={onActualizado} />

      {despues.length > 0 && (
        <div className="bg-white rounded-2xl p-4" style={{ boxShadow: "0 4px 20px rgba(15,45,107,0.06)" }}>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Después</p>
          <div className="divide-y divide-slate-100">
            {despues.slice(0, 5).map(o => (
              <Link key={o.id} to={`/OrdenTrabajoDetalle/${o.id}`} className="flex items-center gap-3 py-2.5">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: PRIORIDAD[o.prioridad] || "#94A3B8" }} />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-slate-800 truncate">{etiquetaEquipo(o.equipo_label, o.patente)}</span>
                  <span className="block text-xs text-slate-500 truncate">
                    {o.numero_ot} · {(ESTADO[o.estado] || ESTADO.asignada).label}
                    {!o.fecha_inicio && o.cita_fecha && estadoCita(o) === "confirmada" ? ` · llega ${textoCita(o.cita_fecha)}` : ""}
                  </span>
                </span>
                <ChevronRight className="w-4 h-4 text-slate-300" />
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
