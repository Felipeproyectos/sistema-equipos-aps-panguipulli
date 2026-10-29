import { useState } from "react";
import { X, Upload, Download, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { mensajeDeError } from "@/lib/mensajesDeError";
import { leerPlanilla, rotuloVehiculo, rotuloPago, pesos } from "@/lib/unidadControl";
import { leerArchivoPlanilla, descargarPlantilla } from "@/utils/planillaUnidadControl";

// Subir lo que la Unidad de Control ya tiene en planillas. Tres pasos:
// elegir el archivo, ver fila por fila qué se va a guardar y qué no (con el
// motivo), y guardar. Cada fila se guarda por separado: si la base rechaza
// una (por ejemplo, un kilometraje menor que el anterior), las demás quedan y
// se informa cuál falló.

export default function ImportarPlanilla({ vehiculos = [], onClose, onSaved }) {
  const [tipo, setTipo] = useState("carga");
  const [leyendo, setLeyendo] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(null);
  const porId = new Map(vehiculos.map(v => [v.id, v]));

  const elegir = async (archivo) => {
    setError(""); setResultado(null); setGuardado(null);
    if (!archivo) return;
    setLeyendo(true);
    try {
      const filas = await leerArchivoPlanilla(archivo);
      setResultado({ nombre: archivo.name, ...leerPlanilla(filas, vehiculos, tipo) });
    } catch (e) {
      setError(e.message || "No se pudo leer la planilla.");
    } finally {
      setLeyendo(false);
    }
  };

  const guardar = async () => {
    setGuardando(true);
    const entidad = tipo === "pago" ? base44.entities.PagoVehiculo : base44.entities.CargaCombustible;
    // En orden de fecha: así el kilometraje de cada carga se compara con la anterior ya guardada.
    const lista = [...resultado.registros].sort((a, b) => String(a.fecha || a.fecha_pago || "").localeCompare(String(b.fecha || b.fecha_pago || "")) || (a.km ?? 0) - (b.km ?? 0));
    const ok = [];
    const fallidas = [];
    for (const r of lista) {
      const { _fila, ...datos } = r;
      try {
        await entidad.create(datos);
        ok.push(_fila);
      } catch (e) {
        fallidas.push({ fila: _fila, motivo: mensajeDeError(e, "guardar la fila") });
      }
    }
    setGuardado({ ok: ok.length, fallidas });
    setGuardando(false);
    if (ok.length) onSaved?.();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white sm:rounded-3xl rounded-t-3xl shadow-2xl w-full max-w-3xl max-h-[94vh] overflow-y-auto">
        <div className="sticky top-0 z-10 bg-white px-5 sm:px-7 pt-6 pb-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Cargar desde planilla</h2>
            <p className="text-xs text-slate-500">Excel (.xlsx) o CSV. Antes de guardar se muestra qué entra y qué no.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar"><X className="w-5 h-5 text-slate-400" /></button>
        </div>

        <div className="px-5 sm:px-7 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {[{ v: "carga", t: "Cargas de combustible" }, { v: "pago", t: "Pagos y gastos" }].map(o => (
              <button key={o.v} type="button" onClick={() => { setTipo(o.v); setResultado(null); setGuardado(null); }} aria-pressed={tipo === o.v}
                className="rounded-xl border-2 px-3 py-2 text-sm font-semibold"
                style={{ borderColor: tipo === o.v ? "#0f766e" : "#e2e8f0", background: tipo === o.v ? "#f0fdfa" : "white", color: "#134e4a" }}>
                {o.t}
              </button>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <button type="button" onClick={() => descargarPlantilla(tipo)}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border border-slate-200 text-slate-700">
              <Download className="w-4 h-4" /> Descargar plantilla
            </button>
            <label className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white cursor-pointer" style={{ background: "#0f766e" }}>
              {leyendo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Elegir planilla
              <input type="file" accept=".xlsx,.csv" className="hidden" onChange={e => { elegir(e.target.files?.[0] || null); e.target.value = ""; }} />
            </label>
          </div>
          <p className="text-[11px] text-slate-400">También sirve su propia planilla: se reconocen columnas como Fecha, Patente/PPU, Km, Litros/Lts, Total/Monto, Servicentro, Folio, Forma de pago.</p>

          {error && <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          {resultado && !guardado && (
            <>
              <div className="flex flex-wrap gap-2 text-sm">
                <span className="px-3 py-1 rounded-full bg-green-50 text-green-700 font-semibold">{resultado.registros.length} filas listas</span>
                <span className="px-3 py-1 rounded-full bg-red-50 text-red-700 font-semibold">{resultado.errores.length} con errores</span>
                <span className="text-slate-400 self-center text-xs">{resultado.nombre}</span>
              </div>
              {resultado.errores.length > 0 && (
                <ul className="rounded-xl border border-red-100 bg-red-50/50 p-3 text-xs text-red-800 space-y-0.5 max-h-40 overflow-y-auto">
                  {resultado.errores.map((e, i) => <li key={i}><strong>Fila {e.fila}:</strong> {e.motivo}</li>)}
                </ul>
              )}
              {resultado.registros.length > 0 && (
                <div className="overflow-x-auto rounded-xl border border-slate-100 max-h-72">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-slate-500 sticky top-0">
                      <tr>
                        <th className="text-left px-2 py-1.5">Fila</th><th className="text-left px-2 py-1.5">Fecha</th><th className="text-left px-2 py-1.5">Vehículo</th>
                        <th className="text-left px-2 py-1.5">{tipo === "pago" ? "Tipo" : "Litros"}</th><th className="text-right px-2 py-1.5">Monto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resultado.registros.map(r => (
                        <tr key={r._fila} className="border-t border-slate-50">
                          <td className="px-2 py-1 text-slate-400">{r._fila}</td>
                          <td className="px-2 py-1">{r.fecha || r.fecha_pago || r.vence_pago}</td>
                          <td className="px-2 py-1">{rotuloVehiculo(porId.get(r.equipo_id))}</td>
                          <td className="px-2 py-1">{tipo === "pago" ? rotuloPago(r) : `${r.litros} L`}</td>
                          <td className="px-2 py-1 text-right">{pesos(r.monto)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <button type="button" disabled={!resultado.registros.length || guardando} onClick={guardar}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: "#0f766e" }}>
                {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Guardar {resultado.registros.length} {resultado.registros.length === 1 ? "fila" : "filas"}
              </button>
            </>
          )}

          {guardado && (
            <div className="space-y-2">
              <p className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
                <CheckCircle2 className="w-4 h-4" /> Se guardaron {guardado.ok} {guardado.ok === 1 ? "fila" : "filas"}.
              </p>
              {guardado.fallidas.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  <p className="flex items-center gap-1.5 font-bold mb-1"><AlertTriangle className="w-4 h-4" /> {guardado.fallidas.length} no se guardaron:</p>
                  <ul className="space-y-0.5">{guardado.fallidas.map((f, i) => <li key={i}><strong>Fila {f.fila}:</strong> {f.motivo}</li>)}</ul>
                </div>
              )}
              <button type="button" onClick={onClose} className="w-full py-2.5 rounded-xl text-sm font-semibold border border-slate-200 text-slate-700">Cerrar</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
