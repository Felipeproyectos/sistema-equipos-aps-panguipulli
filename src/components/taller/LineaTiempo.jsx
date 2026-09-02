import { Clock, User, Wrench, CheckCircle2, FileText } from "lucide-react";

function fmtFecha(fecha) {
  if (!fecha) return "";
  try {
    const d = new Date(fecha);
    return d.toLocaleString("es-CL", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return fecha;
  }
}

const ICONO_EVENTO = {
  creada: Wrench,
  asignada: User,
  iniciada: Clock,
  completada: CheckCircle2,
  pausada: Clock,
  repuesto: FileText,
};

export default function LineaTiempo({ eventos = [] }) {
  const ordenados = [...eventos].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

  if (ordenados.length === 0) {
    return (
      <div className="text-center py-6">
        <Clock className="w-8 h-8 text-slate-200 mx-auto mb-2" />
        <p className="text-xs text-slate-400">Sin eventos registrados</p>
      </div>
    );
  }

  return (
    <div className="relative pl-2">
      <div className="absolute left-5 top-2 bottom-2 w-px bg-slate-200" />
      <div className="space-y-3">
        {ordenados.map((ev, i) => {
          const Icon = ICONO_EVENTO[ev.evento?.toLowerCase()?.split(" ")[0]] || Clock;
          return (
            <div key={i} className="relative flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-white border-2 border-slate-200 flex items-center justify-center flex-shrink-0 z-10">
                <Icon className="w-3.5 h-3.5 text-slate-500" />
              </div>
              <div className="flex-1 min-w-0 pb-1">
                <p className="text-sm font-semibold text-slate-700">{ev.evento}</p>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                  <span className="text-xs text-slate-400">{fmtFecha(ev.fecha)}</span>
                  {ev.usuario_nombre && (
                    <span className="text-xs text-slate-500 flex items-center gap-0.5">
                      <User className="w-3 h-3" /> {ev.usuario_nombre}
                    </span>
                  )}
                </div>
                {ev.notas && <p className="text-xs text-slate-500 mt-1">{ev.notas}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}