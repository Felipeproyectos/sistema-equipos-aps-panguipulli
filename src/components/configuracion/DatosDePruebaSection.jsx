import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { FlaskConical, Loader2, Trash2, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { isSimulandoActivo } from "@/lib/roleSimulator";
import { avisarCambioEnPendientes } from "@/hooks/useContadoresMenu";

// Borrar los datos de prueba (migraciones 19 y 22) sin abrir Supabase. Primero
// muestra qué se va a borrar; recién con eso a la vista se confirma. La regla
// de qué es "de prueba" vive en servidor/funciones/borrarDatosDePrueba.js.
export default function DatosDePruebaSection() {
  const { user } = useAuth();
  const [conteo, setConteo] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState("");

  if (user?.role !== "super_admin") return null;
  const soloLectura = isSimulandoActivo();

  const pedir = async (accion) => {
    setCargando(true);
    setError("");
    try {
      const r = await base44.functions.invoke("borrarDatosDePrueba", { accion });
      if (r?.data?.error) throw new Error(r.data.error);
      if (accion === "contar") { setConteo(r.data); setResultado(null); }
      else { setResultado(r.data); setConteo(null); avisarCambioEnPendientes(); }
    } catch (e) {
      setError(e.message || "No se pudo completar.");
    }
    setCargando(false);
  };

  const borrar = () => {
    if (!confirm(`¿Borrar ${conteo.total} filas de prueba? No se puede deshacer.`)) return;
    pedir("borrar");
  };

  return (
    <div className="bg-white rounded-3xl shadow-lg p-5 lg:p-8 space-y-4">
      <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
        <FlaskConical className="w-5 h-5 text-amber-600" /> Datos de prueba
      </h2>
      <p className="text-sm text-slate-500">
        Los vehículos, choferes, órdenes y solicitudes marcados <strong>[PRUEBA]</strong>. Se borran
        solo esos: todo lo real queda intacto, y la auditoría también.
      </p>

      {!conteo && !resultado && (
        <button onClick={() => pedir("contar")} disabled={cargando}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-700 border border-slate-200 hover:bg-slate-50 disabled:opacity-60">
          {cargando ? <Loader2 className="w-4 h-4 animate-spin" /> : <FlaskConical className="w-4 h-4" />}
          Ver qué datos de prueba hay
        </button>
      )}

      {conteo && (
        conteo.total === 0 ? (
          <p className="text-sm text-green-700 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" /> No quedan datos de prueba.
          </p>
        ) : (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-3">
            <ul className="text-sm text-amber-900 space-y-0.5">
              {conteo.resumen.filter(r => r.cuantos > 0).map(r => (
                <li key={r.que} className="flex justify-between gap-4">
                  <span>{r.que}</span><strong>{r.cuantos}</strong>
                </li>
              ))}
            </ul>
            {conteo.repuestosQueQuedan > 0 && (
              <p className="text-xs text-amber-800">
                {conteo.repuestosQueQuedan} solicitud(es) de repuesto apuntan a órdenes de prueba. No se borran:
                pueden tener una compra detrás. Revísalas en Aprobación de Solicitudes.
              </p>
            )}
            <div className="flex gap-2 flex-wrap">
              <button onClick={borrar} disabled={cargando || soloLectura}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-60">
                {cargando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Borrar {conteo.total} filas de prueba
              </button>
              <button onClick={() => setConteo(null)} className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-white">
                Cancelar
              </button>
            </div>
            {soloLectura && <p className="text-xs text-slate-500">Simulando un rol no se puede borrar.</p>}
          </div>
        )
      )}

      {resultado && (
        <p className={`text-sm flex items-center gap-2 ${resultado.ok ? "text-green-700" : "text-amber-800"}`}>
          <CheckCircle2 className="w-4 h-4" />
          {resultado.ok
            ? `Listo: se borraron ${resultado.total} filas de prueba.`
            : `Se borraron ${resultado.total} filas; ${resultado.fallidos.length} no se pudieron borrar.`}
        </p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
