import { useState } from "react";
import { Info, X, HelpCircle } from "lucide-react";

// Una línea de "qué se hace en esta pantalla", arriba de cada pantalla de
// Movilización.
//
// Las cinco pantallas de la flota se entienden una vez que se sabe para qué
// es cada una, pero no antes: "Movilización", "Vehículos", "Calendario"... no
// dicen por sí solas qué se hace ahí. Esto lo dice, y se cierra con
// "Entendido" una vez leído. Queda un enlace chico para volver a abrirlo.
//
// Lo recordado vive en el navegador (localStorage) y es solo una comodidad:
// si no se puede leer o guardar, la ayuda simplemente se muestra.

const leer = (k) => { try { return localStorage.getItem(k) === "1"; } catch { return false; } };
const guardar = (k, v) => { try { v ? localStorage.setItem(k, "1") : localStorage.removeItem(k); } catch { /* da igual */ } };

export default function AyudaPantalla({ clave, children }) {
  const k = `ayuda-flota:${clave}`;
  const [cerrada, setCerrada] = useState(() => leer(k));

  if (cerrada) {
    return (
      <button onClick={() => { guardar(k, false); setCerrada(false); }}
        className="mb-4 flex items-center gap-1.5 text-xs font-semibold text-amber-700 hover:text-amber-900">
        <HelpCircle className="w-3.5 h-3.5" /> ¿Cómo funciona esta pantalla?
      </button>
    );
  }

  return (
    <div className="mb-5 flex items-start gap-3 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3">
      <Info className="w-5 h-5 text-sky-600 shrink-0 mt-0.5" />
      <div className="flex-1 text-sm text-sky-900 leading-relaxed">{children}</div>
      <button onClick={() => { guardar(k, true); setCerrada(true); }}
        className="shrink-0 flex items-center gap-1 text-xs font-semibold text-sky-700 hover:text-sky-900 mt-0.5"
        aria-label="Entendido, ocultar la ayuda">
        Entendido <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
