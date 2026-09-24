import { X, UserCheck, Wrench, ArrowLeftRight, Plus, Pencil, CalendarRange } from "lucide-react";

// Qué le pasa a un vehículo en un día — o en los días que se marcaron de un
// arrastre — y qué se puede hacer al respecto.
//
// Es el paso que le faltaba al calendario: antes un clic siempre abría "nueva
// asignación", incluso sobre un día que ya estaba tomado, y para corregir algo
// había que irse a la ficha del vehículo. Acá se ve lo que hay y se cambia en
// el mismo lugar donde se está mirando.

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = ["enero","febrero","marzo","abril","mayo","junio",
               "julio","agosto","septiembre","octubre","noviembre","diciembre"];

function largo(iso) {
  const d = new Date(`${iso}T12:00:00`);
  return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`;
}

export const corta = (iso) => {
  if (!iso) return "—";
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("es-CL");
};

const ETIQUETA_TURNO = { completo: "todo el día", manana: "solo mañana", tarde: "solo tarde" };

export default function DiaFlotaModal({
  equipo, desde, hasta, asignaciones = [], prestamo, taller,
  soloLectura, onAsignar, onEditar, onClose,
}) {
  const unSoloDia = desde === hasta;
  const etiqueta = [equipo.marca, equipo.modelo].filter(Boolean).join(" ")
    + (equipo.patente ? ` · ${equipo.patente}` : "");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="px-6 pt-6 pb-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-slate-900 flex items-center gap-2">
              <CalendarRange className="w-5 h-5 text-amber-700" />
              {unSoloDia ? largo(desde) : `Del ${corta(desde)} al ${corta(hasta)}`}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">{etiqueta}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {taller && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
              <p className="text-sm text-red-900 flex items-start gap-2">
                <Wrench className="w-4 h-4 mt-0.5 shrink-0" />
                {taller.cita ? (
                  <span>
                    {taller.porConfirmar ? "El taller propone recibirlo" : "Tiene cita en el taller"} por{" "}
                    <strong>{taller.numero_ot}</strong> del {corta(taller.desde)} al {corta(taller.hasta)}.
                    {" "}{taller.porConfirmar
                      ? "Respóndela en Solicitudes al Taller."
                      : "Se puede programar igual, pero conviene saberlo."}
                  </span>
                ) : (
                  <span>
                    En el taller por <strong>{taller.numero_ot}</strong> desde el {corta(taller.desde)}
                    {taller.hasta ? `, hasta el ${corta(taller.hasta)}` : ", sin fecha de salida todavía"}.
                    {" "}Se puede programar igual, pero conviene saberlo.
                  </span>
                )}
              </p>
            </div>
          )}

          {prestamo && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-sm text-amber-900 flex items-start gap-2">
                <ArrowLeftRight className="w-4 h-4 mt-0.5 shrink-0" />
                <span>
                  Prestado a <strong>{prestamo.centro_destino}</strong> desde el {corta(prestamo.desde)}
                  {prestamo.hasta_previsto ? `, con devolución acordada el ${corta(prestamo.hasta_previsto)}` : ""}.
                </span>
              </p>
            </div>
          )}

          {asignaciones.length === 0 ? (
            <p className="text-sm text-slate-500 rounded-xl border border-slate-200 px-4 py-4 text-center">
              {unSoloDia ? "Este día el vehículo está libre." : "En estos días el vehículo está libre."}
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                {asignaciones.length === 1 ? "Quién lo tiene" : "Quiénes lo tienen"}
              </p>
              {asignaciones.map(a => (
                <div key={a.id}
                  className="rounded-xl border border-slate-200 px-4 py-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                      <UserCheck className="w-4 h-4 text-slate-400 shrink-0" />
                      {a.chofer_nombre || "Sin nombre"}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Del {corta(a.desde)} {a.hasta ? `al ${corta(a.hasta)}` : "en adelante (sin término)"}
                      {" · "}{ETIQUETA_TURNO[a.turno || "completo"]}
                    </p>
                    {(a.hora_salida || a.hora_regreso) && (
                      <p className="text-xs text-slate-400">{a.hora_salida || "—"} a {a.hora_regreso || "—"}</p>
                    )}
                    {a.destino && <p className="text-xs text-slate-500 mt-0.5">{a.destino}</p>}
                    {a.observaciones && <p className="text-xs text-slate-400 italic mt-0.5">{a.observaciones}</p>}
                  </div>
                  {!soloLectura && (
                    <button onClick={() => onEditar(a)}
                      className="shrink-0 flex items-center gap-1 text-xs font-semibold text-amber-700
                                 border border-amber-200 rounded-lg px-2.5 py-1.5 hover:bg-amber-50">
                      <Pencil className="w-3 h-3" /> Cambiar
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {!soloLectura && (
            <button onClick={() => onAsignar(desde, hasta)}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl
                         text-sm font-semibold text-white bg-amber-700 hover:bg-amber-800">
              <Plus className="w-4 h-4" />
              {asignaciones.length === 0 ? "Programar un chofer" : "Programar a alguien más"}
            </button>
          )}

          {!soloLectura && asignaciones.length > 0 && (
            <p className="text-xs text-slate-400">
              Se puede programar a otra persona en el mismo vehículo solo si toma
              el otro medio día. Si ya está tomado todo el día, la base lo va a
              rechazar y te va a decir con quién choca.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
