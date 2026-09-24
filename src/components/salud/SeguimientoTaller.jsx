import { Check } from "lucide-react";
import { PASOS_SALUD, seguimientoParaSalud } from "@/lib/agendaTaller";

// En qué va lo que Salud informó de un vehículo: los cinco pasos, el actual
// marcado, y una línea que dice cuándo deja de estar disponible y cuándo
// vuelve. Solo lectura: la decisión es de Movilización y del Taller.

const TONO = {
  ambar:   { texto: "#92400e", fondo: "#fffbeb", borde: "#fcd34d", punto: "#d97706" },
  azul:    { texto: "#1e3a8a", fondo: "#eff6ff", borde: "#93c5fd", punto: "#2563eb" },
  violeta: { texto: "#5b21b6", fondo: "#f5f3ff", borde: "#c4b5fd", punto: "#7c3aed" },
  verde:   { texto: "#166534", fondo: "#f0fdf4", borde: "#86efac", punto: "#16a34a" },
  gris:    { texto: "#334155", fondo: "#f8fafc", borde: "#cbd5e1", punto: "#64748b" },
};

export default function SeguimientoTaller({ solicitud, ot, compacto = false }) {
  const s = seguimientoParaSalud(solicitud, ot);
  const t = TONO[s.tono] || TONO.gris;

  return (
    <div className="rounded-xl border px-3.5 py-3 mt-2" style={{ background: t.fondo, borderColor: t.borde }}>
      {!compacto && !s.cerrado && (
        <ol className="flex items-center gap-1 mb-2" aria-label="Avance">
          {PASOS_SALUD.map((nombre, i) => {
            const hecho = i < s.paso || (i === s.paso && (s.hecho || i === PASOS_SALUD.length - 1));
            const actual = i === s.paso;
            return (
              <li key={nombre} className="flex items-center gap-1 flex-1 min-w-0">
                <span className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{
                    background: hecho ? t.punto : actual ? "white" : "#e2e8f0",
                    border: actual && !hecho ? `2px solid ${t.punto}` : "none",
                  }}>
                  {hecho && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                </span>
                <span className={`text-[10px] truncate hidden sm:inline ${actual ? "font-bold" : "text-slate-400"}`}
                  style={actual ? { color: t.texto } : undefined}>
                  {nombre}
                </span>
                {i < PASOS_SALUD.length - 1 && <span className="h-px flex-1 bg-slate-200 min-w-[6px]" />}
              </li>
            );
          })}
        </ol>
      )}
      <p className="text-xs font-semibold" style={{ color: t.texto }}>{s.titulo}</p>
      {s.detalle && <p className="text-xs mt-0.5" style={{ color: t.texto, opacity: 0.85 }}>{s.detalle}</p>}
      {ot?.numero_ot && <p className="text-[10px] text-slate-400 mt-1">{ot.numero_ot}</p>}
    </div>
  );
}
