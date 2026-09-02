import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Activity, Play, Pause, Loader2, Send, CheckCircle2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

// Panel para que el mecánico registre su avance en la reparación.
// Cada reporte se agrega a la línea de tiempo de la OT.
export default function ReporteAvance({ ot, user, onActualizado }) {
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);
  const { toast } = useToast();

  const bloqueada = ot.estado === "completada" || ot.estado === "cancelada";

  const registrar = async (evento, notas, cambioEstado) => {
    setGuardando(true);
    try {
      const nuevoEvento = {
        fecha: new Date().toISOString(),
        evento,
        usuario_email: user?.email,
        usuario_nombre: user?.full_name,
        notas: notas || "",
      };
      const update = { linea_tiempo: [...(ot.linea_tiempo || []), nuevoEvento] };
      if (cambioEstado) {
        update.estado = cambioEstado;
        if (cambioEstado === "en_proceso" && !ot.fecha_inicio) {
          update.fecha_inicio = new Date().toISOString().split("T")[0];
        }
      }
      await base44.entities.OrdenTrabajo.update(ot.id, update);
      setNota("");
      toast({ title: "Avance registrado" });
      onActualizado?.();
    } catch (e) {
      toast({ title: "No se pudo registrar", description: e.message, variant: "destructive" });
    }
    setGuardando(false);
  };

  return (
    <div className="bg-white rounded-2xl p-5" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
      <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
        <Activity className="w-4 h-4 text-violet-600" /> Reporte de Avance
      </h3>

      {bloqueada ? (
        <p className="text-sm text-slate-400">La orden está {ot.estado === "completada" ? "completada" : "cancelada"}, no admite más reportes.</p>
      ) : (
        <>
          {/* Botones rápidos de estado de trabajo */}
          <div className="flex gap-2 mb-3">
            <button onClick={() => registrar("El mecánico comenzó a trabajar", nota, "en_proceso")}
              disabled={guardando || ot.estado === "en_proceso"}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold text-white disabled:opacity-40"
              style={{ background: "#7C3AED" }}>
              <Play className="w-3.5 h-3.5" /> Trabajando
            </button>
            <button onClick={() => registrar("Trabajo pausado", nota, "pausada")}
              disabled={guardando || ot.estado === "pausada"}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 disabled:opacity-40">
              <Pause className="w-3.5 h-3.5" /> Pausar
            </button>
          </div>

          {/* Nota de avance libre */}
          <label className="text-xs text-slate-400 font-semibold">Nota de avance</label>
          <textarea rows={3} value={nota} onChange={e => setNota(e.target.value)}
            placeholder="Ej: Se desmontó la rueda pinchada, esperando repuesto..."
            className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2.5 text-sm resize-none" />
          <button onClick={() => registrar("Avance reportado", nota)}
            disabled={guardando || !nota.trim()}
            className="w-full mt-2 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-40 flex items-center justify-center gap-1"
            style={{ background: "#2563EB" }}>
            {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Registrar avance
          </button>

          {/* El mecánico entrega la OT terminada; el cierre final lo hace el Jefe de Taller */}
          {ot.estado === "en_revision" ? (
            <p className="mt-3 text-xs font-semibold text-center rounded-xl px-3 py-2.5" style={{ background: "#FFFBEB", color: "#D97706" }}>
              Trabajo entregado. Pendiente de cierre por el Jefe de Taller.
            </p>
          ) : (
            <button onClick={() => registrar("Trabajo terminado — enviado a revisión del Jefe de Taller", nota, "en_revision")}
              disabled={guardando}
              className="w-full mt-3 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-40 flex items-center justify-center gap-1"
              style={{ background: "#16A34A" }}>
              {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Marcar como terminada
            </button>
          )}
        </>
      )}
    </div>
  );
}