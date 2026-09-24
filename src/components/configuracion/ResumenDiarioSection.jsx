import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Mail, Loader2, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";

// El resumen de la mañana por correo (servidor/funciones/resumenDiarioPendientes.js):
// qué es, cuándo llega, y un botón para que Base del Sistema reciba el suyo
// ahora y vea cómo le llega a los demás — sin mandárselo a nadie más.
export default function ResumenDiarioSection() {
  const { user } = useAuth();
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState("");
  const [error, setError] = useState("");

  if (user?.role !== "super_admin") return null;

  const probar = async () => {
    setEnviando(true);
    setError("");
    setResultado("");
    try {
      const r = await base44.functions.invoke("resumenDiarioPendientes", { soloAmi: true });
      const d = r?.data || {};
      if (d.error) throw new Error(d.error);
      if (d.fallidos?.length) throw new Error(d.fallidos[0]);
      setResultado(d.enviados
        ? `Listo: te llegó a ${user.email}.`
        : "No tienes nada pendiente hoy, así que no se manda correo (igual que para el resto).");
    } catch (e) {
      setError(e.message || "No se pudo enviar.");
    }
    setEnviando(false);
  };

  return (
    <div className="bg-white rounded-3xl shadow-lg p-5 lg:p-8 space-y-4">
      <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
        <Mail className="w-5 h-5 text-blue-500" /> Resumen diario por correo
      </h2>
      <p className="text-sm text-slate-500">
        De lunes a viernes a las 08:00, cada persona recibe lo que la espera en el sistema: los mismos
        números que ve en su menú, con un enlace a cada pantalla. Solo llega a quien tiene algo pendiente.
      </p>
      <button onClick={probar} disabled={enviando}
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-700 border border-slate-200 hover:bg-slate-50 disabled:opacity-60">
        {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
        Enviarme el mío ahora
      </button>
      {resultado && <p className="text-sm text-green-700 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> {resultado}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
