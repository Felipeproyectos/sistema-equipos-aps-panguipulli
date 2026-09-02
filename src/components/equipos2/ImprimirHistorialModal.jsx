import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, X, Printer, Calendar } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { generarPDFHistorialInspecciones } from "@/utils/generarPDFHistorialInspecciones";

const TIPOS_INSP = ["inspeccion", "error_calibracion", "inspeccion_semanal", "inspeccion_anual", "inspeccion_rutinaria", "incidente"];

export default function ImprimirHistorialModal({ equipo, actividades, onClose }) {
  const { toast } = useToast();
  // Por defecto: últimos 12 meses hasta hoy
  const hoy = new Date().toISOString().split("T")[0];
  const haceUnAnio = new Date();
  haceUnAnio.setFullYear(haceUnAnio.getFullYear() - 1);
  const [desde, setDesde] = useState(haceUnAnio.toISOString().split("T")[0]);
  const [hasta, setHasta] = useState(hoy);
  const [generando, setGenerando] = useState(false);

  const inspecciones = actividades
    .filter(a => TIPOS_INSP.includes(a.tipo))
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

  const enRango = inspecciones.filter(a => {
    if (!a.fecha) return false;
    if (desde && a.fecha < desde) return false;
    if (hasta && a.fecha > hasta) return false;
    return true;
  });

  const generar = async () => {
    setGenerando(true);
    try {
      // Traer InspeccionPendiente para obtener quién aprobó cada inspección
      const pendientes = await base44.entities.InspeccionPendiente.filter({ equipo_id: equipo.id });
      const items = enRango.map(act => {
        const esSemanal = act.tipo === "inspeccion_semanal";
        const esDiaria = act.tipo === "inspeccion_rutinaria" || act.tipo === "inspeccion";
        let pendiente = null;
        if (esSemanal || esDiaria) {
          const tipoFiltro = esSemanal ? "inspeccion_semanal" : "inspeccion_diaria";
          const cands = pendientes.filter(p => p.tipo_formulario === tipoFiltro);
          pendiente = cands.find(p => p.fecha === act.fecha && p.conductor === act.usuario_nombre)
            || cands.find(p => p.fecha === act.fecha)
            || null;
        }
        let datos = null;
        try { datos = pendiente?.datos_json ? JSON.parse(pendiente.datos_json) : null; } catch (_) {}

        const hasFallas = act.observaciones?.includes("Fallas:");
        const resultadoMatch = act.observaciones?.match(/Resultado:\s*(aprobado|observaciones|rechazado)/i);
        const resultadoLabel = resultadoMatch?.[1]?.toLowerCase();
        const resultado = hasFallas || resultadoLabel === "rechazado"
          ? "fallas"
          : resultadoLabel === "observaciones"
          ? "observaciones"
          : "ok";

        return {
          act,
          approver: pendiente?.revisor_nombre || "—",
          approverDate: pendiente?.fecha_revision || null,
          estadoRevision: pendiente?.estado || "pendiente",
          datos,
          resultado,
        };
      });

      generarPDFHistorialInspecciones({ equipo, items, fechaDesde: desde, fechaHasta: hasta });
      toast({ title: "PDF generado", description: `${items.length} inspección(es) en el rango.` });
      onClose();
    } catch (e) {
      toast({ title: "No se pudo generar", description: e.message, variant: "destructive" });
    }
    setGenerando(false);
  };

  const input = "w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-slate-50";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: "rgba(15,23,42,0.55)" }}>
      <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "#EFF6FF" }}>
              <Printer className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-sm">Imprimir Historial</h3>
              <p className="text-[11px] text-slate-500">Inspecciones con detalle y aprobación</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 flex items-center gap-1 mb-1"><Calendar className="w-3 h-3" /> Desde</label>
              <input type="date" className={input} value={desde} onChange={e => setDesde(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 flex items-center gap-1 mb-1"><Calendar className="w-3 h-3" /> Hasta</label>
              <input type="date" className={input} value={hasta} onChange={e => setHasta(e.target.value)} />
            </div>
          </div>
          <div className="rounded-xl p-3 flex items-center justify-between" style={{ background: "#F8FAFC", border: "1px solid #E2E8F0" }}>
            <span className="text-xs text-slate-500">Inspecciones en el rango</span>
            <span className="text-lg font-bold text-blue-600">{enRango.length}</span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            El documento incluirá fecha, tipo, quien inspeccionó, quien aprobó, resultado y el checklist detallado de cada pauta.
          </p>
        </div>
        <div className="px-5 py-4 border-t border-slate-100 flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100">Cancelar</button>
          <button onClick={generar} disabled={generando || enRango.length === 0}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50 flex items-center justify-center gap-1.5"
            style={{ background: "#2563EB" }}>
            {generando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />} Generar PDF
          </button>
        </div>
      </div>
    </div>
  );
}