import { useState } from "react";
import { ChevronDown, ChevronUp, MapPin, CheckCircle } from "lucide-react";

/**
 * Selector visual de equipos que muestra marca/modelo + ubicación completa
 * en tarjetas desplegables, en lugar del <select> nativo que trunca el texto.
 */
export default function EquipoSelector({ equipos, value, onChange, placeholder = "Selecciona un equipo..." }) {
  const [open, setOpen] = useState(false);
  const selected = equipos.find(e => e.id === value);

  const ubicacion = (eq) => {
    const partes = [eq.centro_principal, eq.subsede, eq.ubicacion_especifica].filter(Boolean);
    return partes.join(" › ");
  };

  const label = (eq) => {
    let base = `${eq.marca} ${eq.modelo}`;
    if (eq.patente) base += ` — ${eq.patente}`;
    return base;
  };

  return (
    <div className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between border border-slate-200 rounded-xl px-4 py-3 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-300 text-left"
        style={selected ? { borderColor: "#93C5FD", background: "#EFF6FF" } : {}}
      >
        {selected ? (
          <div className="min-w-0">
            <p className="font-semibold text-slate-800 truncate">{label(selected)}</p>
            <p className="text-xs text-blue-600 flex items-center gap-1 mt-0.5">
              <MapPin className="w-3 h-3 flex-shrink-0" />
              {ubicacion(selected)}
            </p>
          </div>
        ) : (
          <span className="text-slate-400">{placeholder}</span>
        )}
        {open
          ? <ChevronUp className="w-4 h-4 text-slate-400 flex-shrink-0 ml-2" />
          : <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0 ml-2" />
        }
      </button>

      {/* Dropdown list */}
      {open && (
        <div
          className="absolute z-50 w-full mt-1 rounded-2xl overflow-hidden"
          style={{ border: "1px solid #E2E8F0", boxShadow: "0 8px 30px rgba(0,0,0,0.12)", background: "white", maxHeight: 320, overflowY: "auto" }}
        >
          {equipos.map(eq => {
            const isSelected = eq.id === value;
            return (
              <button
                key={eq.id}
                type="button"
                onClick={() => { onChange(eq.id); setOpen(false); }}
                className="w-full flex items-start gap-3 px-4 py-3.5 text-left transition-colors"
                style={{
                  borderBottom: "1px solid #F1F5F9",
                  background: isSelected ? "#EFF6FF" : "white",
                }}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800">{label(eq)}</p>
                  <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                    <MapPin className="w-3 h-3 flex-shrink-0 text-blue-400" />
                    {ubicacion(eq)}
                  </p>
                </div>
                {isSelected && <CheckCircle className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}