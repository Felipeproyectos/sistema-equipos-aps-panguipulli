import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { X, Loader2, ArrowLeftRight, AlertTriangle, Wallet, CalendarClock } from "lucide-react";
import { getCentrosEstructura } from "@/lib/centros";

// Prestar un vehículo a otro centro, y devolverlo.
//
// Por qué el centro de costo es un campo y no una regla
// ─────────────────────────────────────────────────────
// Quién paga durante un préstamo no siempre es el mismo: a veces el que lo
// recibe, a veces el dueño lo sigue financiando, a veces lo asume un tercero.
// Se elige en cada préstamo y queda escrito, que es lo que después permite
// explicar por qué un gasto quedó donde quedó.
//
// Desde que se registra, las órdenes de trabajo de ese vehículo se cargan
// solas a ese centro — lo hace un disparador en la base, no esta pantalla
// (ver migracion/16_prestamos.sql), así que también vale para las órdenes que
// nacen en otro lado.
//
// Por qué no se cierra solo
// ─────────────────────────
// Al llegar la fecha acordada el préstamo NO se cierra: queda vigente hasta
// que alguien confirme que el vehículo volvió. Darlo por devuelto sin que
// conste empezaría a cargarle los gastos al centro equivocado.

export default function PrestamoModal({ equipo, prestamoVigente, onClose, onGuardado }) {
  const hoy = new Date().toISOString().split("T")[0];
  const [centros, setCentros] = useState([]);
  const [destino, setDestino] = useState("");
  const [quienPaga, setQuienPaga] = useState("");
  const [desde, setDesde] = useState(hoy);
  const [hastaPrevisto, setHastaPrevisto] = useState("");
  const [motivo, setMotivo] = useState("");
  const [devueltoEl, setDevueltoEl] = useState(hoy);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const origen = equipo.centro_principal || "";
  const etiqueta = [equipo.marca, equipo.modelo].filter(Boolean).join(" ")
    + (equipo.patente ? ` · ${equipo.patente}` : "");

  useEffect(() => {
    getCentrosEstructura()
      .then(cs => setCentros(cs.map(c => c.nombre).filter(n => n !== origen)))
      .catch(() => setCentros([]));
  }, [origen]);

  // Por defecto paga quien lo recibe, que es lo más habitual — pero se puede
  // cambiar, que es justamente el punto.
  useEffect(() => { if (destino && !quienPaga) setQuienPaga(destino); }, [destino, quienPaga]);

  const registrar = async () => {
    if (!destino) { setError("Elige a qué centro se presta."); return; }
    if (!quienPaga) { setError("Falta definir qué centro asume el costo."); return; }
    if (!desde) { setError("Falta la fecha desde la que se presta."); return; }
    if (hastaPrevisto && hastaPrevisto < desde) {
      setError("La fecha de devolución no puede ser anterior a la de salida."); return;
    }
    setError("");
    setGuardando(true);
    try {
      await base44.entities.PrestamoVehiculo.create({
        equipo_id: equipo.id,
        equipo_label: etiqueta,
        centro_origen: origen,
        centro_destino: destino,
        centro_costo: quienPaga,
        desde,
        hasta_previsto: hastaPrevisto || null,
        estado: "vigente",
        motivo: motivo.trim(),
      });
      onGuardado?.();
      onClose();
    } catch (e) {
      setError(e?.message || "No se pudo registrar el préstamo.");
      setGuardando(false);
    }
  };

  const devolver = async () => {
    if (!devueltoEl) { setError("Falta la fecha de devolución."); return; }
    setError("");
    setGuardando(true);
    try {
      await base44.entities.PrestamoVehiculo.update(prestamoVigente.id, {
        estado: "devuelto",
        devuelto_el: devueltoEl,
      });
      onGuardado?.();
      onClose();
    } catch (e) {
      setError(e?.message || "No se pudo registrar la devolución.");
      setGuardando(false);
    }
  };

  const atrasado = prestamoVigente?.hasta_previsto && prestamoVigente.hasta_previsto < hoy;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="px-6 pt-6 pb-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-slate-900 flex items-center gap-2">
              <ArrowLeftRight className="w-5 h-5 text-amber-700" />
              {prestamoVigente ? "Vehículo prestado" : "Prestar a otro centro"}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">{etiqueta}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {prestamoVigente ? (
            <>
              <div className={`rounded-2xl border p-4 ${atrasado ? "border-red-200 bg-red-50" : "border-slate-200 bg-slate-50"}`}>
                <Fila titulo="Está en" valor={prestamoVigente.centro_destino} />
                <Fila titulo="Salió de" valor={prestamoVigente.centro_origen || "—"} />
                <Fila titulo="Desde" valor={fecha(prestamoVigente.desde)} />
                <Fila titulo="Debía volver" valor={prestamoVigente.hasta_previsto
                  ? fecha(prestamoVigente.hasta_previsto) : "sin fecha acordada"} />
                <Fila titulo="Paga" valor={prestamoVigente.centro_costo} destacado />
                {prestamoVigente.motivo && <Fila titulo="Motivo" valor={prestamoVigente.motivo} />}
                {atrasado && (
                  <p className="flex items-start gap-2 text-sm text-red-800 mt-3 pt-3 border-t border-red-200">
                    <CalendarClock className="w-4 h-4 mt-0.5 shrink-0" />
                    Se pasó de la fecha acordada. Mientras siga abierto, los gastos
                    del vehículo se cargan a {prestamoVigente.centro_costo}.
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="pres-devuelto" className="text-xs font-semibold text-slate-600 block mb-1">
                  ¿Cuándo volvió? *
                </label>
                <input id="pres-devuelto" type="date" value={devueltoEl}
                  onChange={e => setDevueltoEl(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white
                             focus:outline-none focus:ring-2 focus:ring-amber-300" />
                <p className="text-xs text-slate-400 mt-1">
                  Desde esta fecha, los gastos vuelven a {origen || "su centro"}.
                </p>
              </div>
            </>
          ) : (
            <>
              <div>
                <label htmlFor="pres-destino" className="text-xs font-semibold text-slate-600 block mb-1">
                  ¿A qué centro se presta? *
                </label>
                <select id="pres-destino" value={destino} onChange={e => setDestino(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white
                             focus:outline-none focus:ring-2 focus:ring-amber-300">
                  <option value="">Seleccionar...</option>
                  {centros.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <p className="text-xs text-slate-400 mt-1">
                  Sale de {origen || "sin centro asignado"}.
                </p>
              </div>

              <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
                <label htmlFor="pres-paga" className="text-xs font-semibold text-amber-900 flex items-center gap-1.5 mb-2">
                  <Wallet className="w-4 h-4" /> ¿Qué centro asume el costo? *
                </label>
                <select id="pres-paga" value={quienPaga} onChange={e => setQuienPaga(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white
                             focus:outline-none focus:ring-2 focus:ring-amber-300">
                  <option value="">Seleccionar...</option>
                  {origen && <option value={origen}>{origen} (sigue pagando el dueño)</option>}
                  {centros.map(c => (
                    <option key={c} value={c}>{c}{c === destino ? " (quien lo recibe)" : ""}</option>
                  ))}
                </select>
                <p className="text-xs text-amber-800 mt-2">
                  Desde que registres el préstamo, las órdenes de trabajo de este
                  vehículo quedan cargadas a este centro. Las anteriores no se tocan.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="pres-desde" className="text-xs font-semibold text-slate-600 block mb-1">Desde *</label>
                  <input id="pres-desde" type="date" value={desde} onChange={e => setDesde(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white
                               focus:outline-none focus:ring-2 focus:ring-amber-300" />
                </div>
                <div>
                  <label htmlFor="pres-hasta" className="text-xs font-semibold text-slate-600 block mb-1">
                    Hasta (acordado)
                  </label>
                  <input id="pres-hasta" type="date" value={hastaPrevisto}
                    onChange={e => setHastaPrevisto(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white
                               focus:outline-none focus:ring-2 focus:ring-amber-300" />
                </div>
              </div>
              <p className="text-xs text-slate-400 -mt-2">
                Si pones fecha, te avisamos cuando se pase. El préstamo no se cierra
                solo: lo cierras tú cuando el vehículo vuelva.
              </p>

              <div>
                <label htmlFor="pres-motivo" className="text-xs font-semibold text-slate-600 block mb-1">
                  Motivo
                </label>
                <input id="pres-motivo" value={motivo} onChange={e => setMotivo(e.target.value)}
                  placeholder="Ej: su camioneta está en el taller."
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white
                             focus:outline-none focus:ring-2 focus:ring-amber-300" />
              </div>
            </>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
              <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium text-slate-600
                         border border-slate-200 hover:bg-slate-50">
              Cancelar
            </button>
            <button onClick={prestamoVigente ? devolver : registrar} disabled={guardando}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl
                         text-sm font-semibold text-white bg-amber-700 hover:bg-amber-800 disabled:opacity-60">
              {guardando && <Loader2 className="w-4 h-4 animate-spin" />}
              {guardando ? "Guardando..." : prestamoVigente ? "Registrar devolución" : "Registrar préstamo"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function fecha(v) {
  if (!v) return "—";
  const d = new Date(`${v}T00:00:00`);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString("es-CL");
}

function Fila({ titulo, valor, destacado }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1">
      <span className="text-sm text-slate-500 shrink-0">{titulo}</span>
      <span className={`text-sm text-right ${destacado ? "font-bold text-amber-900" : "font-semibold text-slate-800"}`}>
        {valor}
      </span>
    </div>
  );
}
