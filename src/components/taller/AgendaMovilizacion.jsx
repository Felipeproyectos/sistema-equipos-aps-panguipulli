import { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { CalendarClock, Loader2, Send } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { CITA, EVENTO, estadoCita, estaAbierta, eventoDeAgenda, textoCita } from "@/lib/agendaTaller";
import { etiquetaEquipo } from "@/utils/etiquetaEquipo";

// La mitad del Taller en la agenda con Movilización: el Jefe de Taller
// propone cuándo recibe el vehículo y cuándo lo devuelve. Movilización
// confirma o pide otra fecha desde "Solicitudes al Taller". Las reglas del ida
// y vuelta están en src/lib/agendaTaller.js.
//
// Para organizarse, al elegir el día se muestran los otros ingresos que el
// taller ya tiene agendados esa misma fecha.

function aInputLocal(fecha) {
  if (!fecha) return "";
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

const diaLocal = (fecha) => {
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export default function AgendaMovilizacion({ ot, puedeProponer, user, onGuardado }) {
  const { toast } = useToast();
  const cita = estadoCita(ot);
  const [ingreso, setIngreso] = useState(aInputLocal(ot.cita_fecha));
  const [entrega, setEntrega] = useState(ot.cita_entrega || "");
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [otras, setOtras] = useState([]);

  const editable = puedeProponer && estaAbierta(ot) && !ot.fecha_inicio;

  useEffect(() => {
    if (!editable) return;
    base44.entities.OrdenTrabajo.list("-created_date", 500)
      .then(ots => setOtras(ots.filter(o => o.id !== ot.id && o.cita_fecha && estaAbierta(o)
        && ["propuesta", "confirmada"].includes(o.cita_estado))))
      .catch(() => setOtras([]));
  }, [editable, ot.id]);

  const mismoDia = useMemo(() => {
    if (!ingreso) return [];
    const dia = ingreso.split("T")[0];
    return otras.filter(o => diaLocal(o.cita_fecha) === dia)
      .sort((a, b) => String(a.cita_fecha).localeCompare(String(b.cita_fecha)));
  }, [ingreso, otras]);

  if (!cita) return null;

  const proponer = async () => {
    if (!ingreso) { toast({ title: "Elige día y hora de ingreso", variant: "destructive" }); return; }
    const dia = ingreso.split("T")[0];
    if (entrega && entrega < dia) {
      toast({ title: "La entrega no puede ser antes del ingreso", variant: "destructive" });
      return;
    }
    setGuardando(true);
    try {
      const cita_fecha = new Date(ingreso).toISOString();
      const resumen = `Ingreso ${textoCita(cita_fecha)}${entrega ? ` · entrega ${textoCita(entrega, false)}` : ""}`;
      const update = {
        cita_estado: "propuesta",
        cita_fecha,
        cita_entrega: entrega || null,
        cita_nota: nota.trim(),
        linea_tiempo: [...(ot.linea_tiempo || []),
          eventoDeAgenda(user, EVENTO.propone, [resumen, nota.trim()].filter(Boolean).join(" — "))],
      };
      await base44.entities.OrdenTrabajo.update(ot.id, update);
      setNota("");
      onGuardado(update);
      toast({ title: "Fecha propuesta", description: "Movilización la verá en Solicitudes al Taller para confirmarla." });
    } catch (e) {
      toast({ title: "No se pudo proponer la fecha", description: e.message, variant: "destructive" });
    }
    setGuardando(false);
  };

  const cfg = CITA[cita];

  return (
    <div className="bg-white rounded-2xl p-5" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.05)", border: `1px solid ${cfg.borde}` }}>
      <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
        <CalendarClock className="w-4 h-4 text-amber-600" /> Agenda con Movilización
      </h3>

      <div className="rounded-xl px-3 py-2 text-xs font-semibold mb-3" style={{ background: cfg.fondo, color: cfg.color }}>
        {cfg.label}
        {(cita === "propuesta" || cita === "confirmada") && ot.cita_fecha && (
          <span className="block font-normal mt-0.5">
            Ingreso {textoCita(ot.cita_fecha)}{ot.cita_entrega && <> · entrega {textoCita(ot.cita_entrega, false)}</>}
          </span>
        )}
      </div>

      {ot.fecha_preferida && (
        <p className="text-xs text-slate-500 mb-2">
          Movilización puede llevarlo desde el <strong>{textoCita(ot.fecha_preferida, false)}</strong>.
        </p>
      )}
      {cita === "reagendar" && ot.cita_nota && (
        <p className="text-xs text-red-700 bg-red-50 rounded-lg px-3 py-2 mb-2">Motivo: “{ot.cita_nota}”</p>
      )}

      {editable && (
        <>
          <label className="text-xs text-slate-400 font-semibold block mt-2">Ingreso (día y hora)</label>
          <input type="datetime-local" value={ingreso} onChange={e => setIngreso(e.target.value)}
            min={ot.fecha_preferida ? `${ot.fecha_preferida}T00:00` : undefined}
            className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2.5 text-sm" />

          {mismoDia.length > 0 && (
            <div className="mt-2 text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-2">
              <p className="font-semibold text-slate-500 mb-1">Ese día el taller ya recibe:</p>
              {mismoDia.map(o => (
                <p key={o.id}>
                  {new Date(o.cita_fecha).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
                  {" · "}{o.numero_ot} — {etiquetaEquipo(o.equipo_label, o.patente)}
                  {o.cita_estado === "propuesta" && <span className="text-slate-400"> (por confirmar)</span>}
                </p>
              ))}
            </div>
          )}

          <label className="text-xs text-slate-400 font-semibold mt-3 block">Entrega estimada</label>
          <input type="date" value={entrega} onChange={e => setEntrega(e.target.value)}
            min={ingreso ? ingreso.split("T")[0] : undefined}
            className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2.5 text-sm" />

          <label className="text-xs text-slate-400 font-semibold mt-3 block">Indicaciones (opcional)</label>
          <textarea rows={2} value={nota} onChange={e => setNota(e.target.value)}
            placeholder="Ej: traerlo con estanque lleno y la carpeta de mantenciones"
            className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2.5 text-sm resize-none" />

          <button onClick={proponer} disabled={guardando}
            className="w-full mt-3 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50 flex items-center justify-center gap-1"
            style={{ background: "#b45309" }}>
            {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {cita === "propuesta" || cita === "confirmada" ? "Proponer otra fecha" : "Proponer fecha"}
          </button>
        </>
      )}
    </div>
  );
}
