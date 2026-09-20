import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { X, Route, Loader2, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";

// El aviso de Calidad hacia Movilización.
//
// Calidad no le habla al Taller: si detecta un problema en un vehículo, se lo
// informa al Encargado de Movilización, que decide si va al taller y con qué
// prioridad. Este botón es esa puerta, puesto en la ficha del vehículo, que es
// donde la persona está mirando cuando se da cuenta del problema.
//
// Por dentro crea una `solicitud`, que es el mismo registro que ya existía —
// lo que no existía era alguien del otro lado que la recibiera.

const MOTIVOS = [
  { value: "mantenimiento_correctivo", label: "Algo está fallando",
    ayuda: "Frenos, motor, luces, ruidos — algo que necesita reparación" },
  { value: "mantenimiento_preventivo", label: "Le toca mantención",
    ayuda: "Mantención programada o por kilometraje" },
  { value: "revision_tecnica", label: "Revisión técnica o permiso",
    ayuda: "Documentos por vencer o vencidos" },
];

export default function InformarMovilizacion({ equipo, onClose, onEnviado }) {
  const { user } = useAuth();
  const [motivo, setMotivo] = useState("mantenimiento_correctivo");
  const [detalle, setDetalle] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [listo, setListo] = useState(false);
  const [error, setError] = useState("");

  const enviar = async () => {
    if (!detalle.trim()) {
      setError("Cuéntale a Movilización qué está pasando con el vehículo.");
      return;
    }
    setError("");
    setEnviando(true);
    try {
      await base44.entities.Solicitud.create({
        equipo_id: equipo.id,
        tipo: motivo,
        fecha: new Date().toISOString().split("T")[0],
        usuario_email: user?.email || "",
        usuario_nombre: user?.full_name || user?.email || "",
        centro: equipo.centro_principal || "",
        estado: "pendiente",
        observaciones: detalle.trim(),
      });
      setListo(true);
      onEnviado?.();
    } catch {
      // El motivo lo muestra base44Client; acá solo se suelta el botón.
      setEnviando(false);
    }
  };

  const etiqueta = `${equipo.marca || ""} ${equipo.modelo || ""}`.trim() || "este vehículo";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="px-6 pt-6 pb-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-bold text-slate-900 flex items-center gap-2">
            <Route className="w-5 h-5 text-amber-700" />
            Informar a Movilización
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {listo ? (
          <div className="px-6 py-10 text-center">
            <CheckCircle2 className="w-12 h-12 mx-auto text-green-600 mb-3" />
            <p className="font-semibold text-slate-800">Avisado</p>
            <p className="text-sm text-slate-500 mt-1 max-w-xs mx-auto">
              Movilización lo va a revisar y decidir si el vehículo entra al
              taller. Puedes seguirlo desde Solicitudes.
            </p>
            <button onClick={onClose}
              className="mt-6 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-slate-800 hover:bg-slate-900">
              Listo
            </button>
          </div>
        ) : (
          <div className="px-6 py-5 space-y-4">
            <p className="text-sm text-slate-500">
              Sobre <span className="font-semibold text-slate-700">{etiqueta}</span>
              {equipo.patente && <span className="text-slate-500"> · {equipo.patente}</span>}
            </p>

            <div className="space-y-2">
              {MOTIVOS.map(m => (
                <button key={m.value} onClick={() => setMotivo(m.value)}
                  className={`w-full text-left px-4 py-3 rounded-xl border transition-colors ${
                    motivo === m.value
                      ? "border-amber-600 bg-amber-50"
                      : "border-slate-200 hover:border-amber-300"}`}>
                  <p className={`text-sm font-semibold ${motivo === m.value ? "text-amber-900" : "text-slate-700"}`}>
                    {m.label}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">{m.ayuda}</p>
                </button>
              ))}
            </div>

            <div>
              <label htmlFor="detalle-movilizacion" className="text-xs font-semibold text-slate-600 block mb-1">
                ¿Qué está pasando? *
              </label>
              <textarea id="detalle-movilizacion" rows={4} value={detalle}
                onChange={e => setDetalle(e.target.value)}
                placeholder="Ej: al frenar tira hacia la derecha y se escucha un chirrido."
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-amber-300" />
            </div>

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button onClick={onClose}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium text-slate-600 border border-slate-200 hover:bg-slate-50">
                Cancelar
              </button>
              <button onClick={enviar} disabled={enviando}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white bg-amber-700 hover:bg-amber-800 disabled:opacity-60">
                {enviando && <Loader2 className="w-4 h-4 animate-spin" />}
                {enviando ? "Enviando..." : "Informar"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
