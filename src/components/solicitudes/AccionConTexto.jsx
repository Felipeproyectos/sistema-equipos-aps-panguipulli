import { useState } from "react";
import { X, Loader2 } from "lucide-react";

// Una acción sobre una solicitud que exige dejar algo por escrito: la
// resolución del Monitor, por qué la devuelve, o cómo la cerró el centro.
// La usan las dos bandejas (Solicitudes y Solicitudes de Centros).
//
//   accion: { etiqueta, campoTexto } (de accionesPara, en solicitudesMonitor.js)
//   onConfirmar(nota) hace el guardado; mientras corre, `ocupado` va en true.
export default function AccionConTexto({ solicitud, accion, ocupado, onCerrar, onConfirmar, pie, color = "#4F46E5" }) {
  const [nota, setNota] = useState("");
  const [aviso, setAviso] = useState("");
  const confirmar = async () => {
    if (nota.trim().length < 10) {
      setAviso("Escribe al menos 10 caracteres: queda en el historial de la solicitud.");
      return;
    }
    setAviso("");
    await onConfirmar(nota);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white sm:rounded-3xl rounded-t-3xl shadow-2xl w-full max-w-md">
        <div className="px-6 pt-6 pb-3 border-b border-slate-100 flex items-center justify-between">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-slate-900">{accion.etiqueta}</h2>
            <p className="text-xs text-slate-500 truncate">{[solicitud.numero_solicitud, solicitud.centro].filter(Boolean).join(" · ")}</p>
          </div>
          <button type="button" onClick={onCerrar} aria-label="Cerrar"><X className="w-5 h-5 text-slate-400" /></button>
        </div>
        <div className="px-6 py-5 space-y-3">
          <label htmlFor="accion-nota" className="text-xs font-semibold text-slate-600 block">{accion.campoTexto} *</label>
          <textarea id="accion-nota" rows={5} value={nota} onChange={e => setNota(e.target.value)} maxLength={4000} autoFocus
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
          {pie && <p className="text-[11px] text-slate-400">{pie}</p>}
          {aviso && <p role="alert" className="text-xs text-red-600">{aviso}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onCerrar} className="flex-1 py-2.5 rounded-xl text-sm font-medium text-slate-600 border border-slate-200">Cancelar</button>
            <button type="button" onClick={confirmar} disabled={ocupado}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60" style={{ background: color }}>
              {ocupado && <Loader2 className="w-4 h-4 animate-spin" />} Confirmar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
