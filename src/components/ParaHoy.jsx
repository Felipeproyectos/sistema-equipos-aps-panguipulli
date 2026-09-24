import { Link } from "react-router-dom";
import {
  ArrowRight, AlertTriangle, Bell, CalendarClock, CheckCircle2, ClipboardCheck, ClipboardList,
  Clock, Heart, Package, PauseCircle, UserX, Wrench, XCircle,
} from "lucide-react";
import { createPageUrl } from "@/utils";

// La lista "Para hoy" de una pantalla de inicio: cada aviso con su botón. Las
// reglas de qué se avisa viven en src/lib/paraHoy.js; esto solo las dibuja.
// Mismo aspecto que el Panel de Flota, para que las tres áreas se lean igual.

const TONO = {
  rojo:  { borde: "#fecaca", fondo: "#fef2f2", texto: "#991b1b", icono: "#dc2626", boton: "#b91c1c" },
  ambar: { borde: "#fde68a", fondo: "#fffbeb", texto: "#92400e", icono: "#d97706", boton: "#b45309" },
  azul:  { borde: "#bfdbfe", fondo: "#eff6ff", texto: "#1e3a8a", icono: "#2563eb", boton: "#1d4ed8" },
  verde: { borde: "#bbf7d0", fondo: "#f0fdf4", texto: "#166534", icono: "#16a34a", boton: "#15803d" },
  gris:  { borde: "#e2e8f0", fondo: "#f8fafc", texto: "#334155", icono: "#64748b", boton: "#475569" },
};

const ICONO = {
  parche: Heart, fuera: XCircle, taller: Wrench, cita: CalendarClock, bitacora: ClipboardCheck,
  solicitud: ClipboardList, alerta: Bell, listo: CheckCircle2,
  atraso: Clock, agenda: CalendarClock, revision: ClipboardCheck, mecanico: UserX,
  repuesto: Package, ingreso: CalendarClock, pausa: PauseCircle,
};

export default function ParaHoy({ avisos, titulo = "Para hoy", vacio = "Nada pendiente. Todo al día.", onAccion }) {
  return (
    <section>
      <h2 className="text-lg font-bold text-slate-800">{titulo}</h2>
      <p className="text-sm text-slate-500 mb-3">Lo que necesita tu atención, de lo más urgente a lo menos.</p>
      {avisos.length === 0 ? (
        <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 flex items-center gap-3 text-sm text-green-800">
          <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" /> {vacio}
        </div>
      ) : (
        <div className="space-y-2">
          {avisos.map((a, i) => {
            const t = TONO[a.tono] || TONO.gris;
            const Icono = ICONO[a.clave] || AlertTriangle;
            const boton = (
              <>
                {a.accion} <ArrowRight className="w-3.5 h-3.5" />
              </>
            );
            const claseBoton = "shrink-0 flex items-center gap-1 px-3.5 py-2 rounded-xl text-xs font-bold text-white";
            return (
              <div key={`${a.clave}-${i}`} className="rounded-2xl border px-4 py-3 flex items-center gap-3 flex-wrap sm:flex-nowrap"
                style={{ background: t.fondo, borderColor: t.borde }}>
                <Icono className="w-5 h-5 flex-shrink-0" style={{ color: t.icono }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold" style={{ color: t.texto }}>{a.titulo}</p>
                  {a.detalle && <p className="text-xs mt-0.5 sm:truncate" style={{ color: t.texto, opacity: 0.85 }}>{a.detalle}</p>}
                </div>
                {a.accion && (onAccion
                  ? <button type="button" onClick={() => onAccion(a)} className={claseBoton} style={{ background: t.boton }}>{boton}</button>
                  : <Link to={createPageUrl(a.pagina)} className={claseBoton} style={{ background: t.boton }}>{boton}</Link>)}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
