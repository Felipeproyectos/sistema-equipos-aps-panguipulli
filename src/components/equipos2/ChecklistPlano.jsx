import { CheckCircle, X, AlertTriangle } from "lucide-react";

// Renderiza un checklist "plano" (ítem → estado) usado por las pautas
// semanales de Monitor Desfibrilador y Monitor Multiparámetros.
// Soporta dos formatos de datos:
//   - { item: { estado: "ok"|"malo"|"na", obs } }  (desfibrilador)
//   - { item: "ok"|"malo"|"na"|"" }                (multiparámetros)
const PARCHES_LABELS = {
  parches_adulto: "Parches Adulto",
  parches_pediatrico: "Parches Pediátrico",
  parches_mixto: "Parches Mixto",
};

export default function ChecklistPlano({ data, parches, descripcion }) {
  const entries = Object.entries(data || {}).filter(([, v]) => {
    const estado = typeof v === "string" ? v : v?.estado;
    return !!estado;
  });
  const malos = entries.filter(([, v]) => (typeof v === "string" ? v : v?.estado) === "malo");

  const parchesEntries = Object.entries(parches || {}).filter(([, v]) => {
    const estado = typeof v === "string" ? v : v?.estado;
    return !!estado;
  });
  const parchesMalos = parchesEntries.filter(([, v]) => (typeof v === "string" ? v : v?.estado) === "malo");

  return (
    <div className="space-y-2">
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #E2E8F0" }}>
        <div className="flex items-center justify-between px-3 py-2" style={{ background: malos.length > 0 ? "#FFF5F5" : "#F8FAFC" }}>
          <span className="text-xs font-bold text-slate-600">📋 Checklist Semanal</span>
          {malos.length > 0
            ? <span className="text-xs font-bold text-red-600">{malos.length} falla(s)</span>
            : <span className="text-xs text-green-600 font-semibold">✓ Todo OK</span>}
        </div>
        <div className="px-3 py-2 space-y-1">
          {entries.map(([item, v]) => {
            const estado = typeof v === "string" ? v : v?.estado;
            const obs = typeof v === "string" ? "" : v?.obs;
            const isMalo = estado === "malo";
            const isOk = estado === "ok";
            const isNa = estado === "na";
            return (
              <div key={item} className="flex items-start gap-2 text-xs py-1">
                <span className="flex-shrink-0 mt-0.5">
                  {isOk
                    ? <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                    : isMalo
                    ? <X className="w-3.5 h-3.5 text-red-500" />
                    : <span className="text-[10px] font-bold text-slate-400 inline-block w-3.5 text-center">N/A</span>}
                </span>
                <div className="flex-1">
                  <span className={isMalo ? "font-semibold text-red-700" : "text-slate-700"}>{item}</span>
                  {obs && <span className="text-slate-500"> — {obs}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {parchesEntries.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #E2E8F0" }}>
          <div className="flex items-center justify-between px-3 py-2" style={{ background: parchesMalos.length > 0 ? "#FFF5F5" : "#F8FAFC" }}>
            <span className="text-xs font-bold text-slate-600">🔌 Electrodos / Parches</span>
            {parchesMalos.length > 0
              ? <span className="text-xs font-bold text-red-600">{parchesMalos.length} falla(s)</span>
              : <span className="text-xs text-green-600 font-semibold">✓ Todo OK</span>}
          </div>
          <div className="px-3 py-2 space-y-1">
            {parchesEntries.map(([key, v]) => {
              const estado = typeof v === "string" ? v : v?.estado;
              const obs = typeof v === "string" ? "" : v?.obs;
              const isMalo = estado === "malo";
              const isOk = estado === "ok";
              const label = PARCHES_LABELS[key] || key;
              return (
                <div key={key} className="flex items-start gap-2 text-xs py-1">
                  <span className="flex-shrink-0 mt-0.5">
                    {isOk
                      ? <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                      : isMalo
                      ? <X className="w-3.5 h-3.5 text-red-500" />
                      : <span className="text-[10px] font-bold text-slate-400 inline-block w-3.5 text-center">N/A</span>}
                  </span>
                  <div className="flex-1">
                    <span className={isMalo ? "font-semibold text-red-700" : "text-slate-700"}>{label}</span>
                    {obs && <span className="text-slate-500"> — {obs}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {descripcion && (
        <div className="rounded-xl p-3" style={{ background: "#FFFBEB", border: "1px solid #FDE68A" }}>
          <p className="text-xs font-bold text-amber-700 uppercase tracking-widest flex items-center gap-1 mb-1">
            <AlertTriangle className="w-3.5 h-3.5" /> Descripción
          </p>
          <p className="text-xs text-slate-700 leading-relaxed">{descripcion}</p>
        </div>
      )}
    </div>
  );
}