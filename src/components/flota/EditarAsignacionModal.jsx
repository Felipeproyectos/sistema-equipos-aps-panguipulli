import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { X, Loader2, AlertTriangle, UserCheck, Ban, CalendarCheck } from "lucide-react";
import { TURNOS } from "@/lib/calendarioFlota";

// Cambiar una programación que ya existe: correrle las fechas, partirle el
// turno, ponerle destino, o sacarla del calendario.
//
// Por qué se puede mover algo que ya está
// ───────────────────────────────────────
// Porque la programación cambia todo el tiempo: el chofer se enferma, el
// vehículo entra al taller, la ronda se adelanta. Antes la única salida era
// terminar la asignación y crear otra, y eso borraba de la vista que ese
// vehículo había estado comprometido esos días.
//
// Si las fechas nuevas se pisan con otra programación del mismo vehículo, la
// base lo rechaza y devuelve un mensaje que dice con quién choca (el
// disparador `asignacion_sin_choque` de migracion/17_calendario.sql). Acá no
// se repite esa validación: una sola regla, en un solo lugar.
//
// Terminar y cancelar no son lo mismo
// ───────────────────────────────────
// Terminar es "hasta acá llegó": el chofer lo tuvo hasta hoy y queda escrito.
// Cancelar es "esto nunca pasó": se usa para una programación futura que se
// deshace. Distinguirlas importa porque la bitácora y los informes leen el
// historial de asignaciones, y una semana que sí se trabajó no puede
// desaparecer.

export default function EditarAsignacionModal({ asignacion, onClose, onGuardado }) {
  const hoy = new Date().toISOString().split("T")[0];
  const [desde, setDesde] = useState(asignacion.desde || hoy);
  const [hasta, setHasta] = useState(asignacion.hasta || "");
  const [turno, setTurno] = useState(asignacion.turno || "completo");
  const [horaSalida, setHoraSalida] = useState(asignacion.hora_salida || "");
  const [horaRegreso, setHoraRegreso] = useState(asignacion.hora_regreso || "");
  const [destino, setDestino] = useState(asignacion.destino || "");
  const [observaciones, setObservaciones] = useState(asignacion.observaciones || "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  // Una programación que todavía no empieza no se "termina": no hubo nada que
  // terminar. Se saca del calendario.
  const yaEmpezo = (asignacion.desde || hoy) <= hoy;

  const correr = async (cambios, alFallar) => {
    setError("");
    setGuardando(true);
    try {
      await base44.entities.AsignacionChofer.update(asignacion.id, cambios);
      onGuardado?.();
      onClose();
    } catch (e) {
      setError(e?.message || alFallar);
      setGuardando(false);
    }
  };

  const guardar = () => {
    if (!desde) { setError("Falta la fecha de inicio."); return; }
    if (hasta && hasta < desde) { setError("La fecha de término no puede ser anterior a la de inicio."); return; }
    correr({
      desde,
      hasta: hasta || null,
      turno,
      hora_salida: horaSalida || null,
      hora_regreso: horaRegreso || null,
      destino: destino.trim() || null,
      observaciones: observaciones.trim(),
    }, "No se pudo guardar el cambio.");
  };

  const terminar = () => correr(
    { estado: "terminada", hasta: hoy },
    "No se pudo terminar la asignación.");

  const cancelar = () => correr(
    { estado: "cancelada" },
    "No se pudo sacar la programación del calendario.");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="px-6 pt-6 pb-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-slate-900 flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-amber-700" />
              {asignacion.chofer_nombre || "Chofer"}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">{asignacion.equipo_label || "Vehículo"}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="ed-desde" className="text-xs font-semibold text-slate-600 block mb-1">Desde *</label>
              <input id="ed-desde" type="date" value={desde} onChange={e => setDesde(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white
                           focus:outline-none focus:ring-2 focus:ring-amber-300" />
            </div>
            <div>
              <label htmlFor="ed-hasta" className="text-xs font-semibold text-slate-600 block mb-1">Hasta</label>
              <input id="ed-hasta" type="date" value={hasta} onChange={e => setHasta(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white
                           focus:outline-none focus:ring-2 focus:ring-amber-300" />
            </div>
          </div>

          {!hasta && (
            <p className="text-xs text-slate-400 -mt-2">
              Sin fecha de término queda abierta, y no vas a poder programar
              a nadie más en este vehículo después.
            </p>
          )}

          <div>
            <label htmlFor="ed-turno" className="text-xs font-semibold text-slate-600 block mb-1">Turno</label>
            <select id="ed-turno" value={turno} onChange={e => setTurno(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white
                         focus:outline-none focus:ring-2 focus:ring-amber-300">
              {TURNOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            {turno !== "completo" && (
              <p className="text-xs text-slate-500 mt-1">
                Otro chofer puede tener el mismo vehículo en el otro medio día.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="ed-hsal" className="text-xs font-semibold text-slate-600 block mb-1">Sale</label>
              <input id="ed-hsal" type="time" value={horaSalida} onChange={e => setHoraSalida(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white
                           focus:outline-none focus:ring-2 focus:ring-amber-300" />
            </div>
            <div>
              <label htmlFor="ed-hreg" className="text-xs font-semibold text-slate-600 block mb-1">Vuelve</label>
              <input id="ed-hreg" type="time" value={horaRegreso} onChange={e => setHoraRegreso(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white
                           focus:outline-none focus:ring-2 focus:ring-amber-300" />
            </div>
          </div>

          <div>
            <label htmlFor="ed-destino" className="text-xs font-semibold text-slate-600 block mb-1">Destino</label>
            <input id="ed-destino" value={destino} onChange={e => setDestino(e.target.value)}
              placeholder="Ej: ronda rural Coñaripe."
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white
                         focus:outline-none focus:ring-2 focus:ring-amber-300" />
          </div>

          <div>
            <label htmlFor="ed-obs" className="text-xs font-semibold text-slate-600 block mb-1">Observaciones</label>
            <textarea id="ed-obs" rows={2} value={observaciones}
              onChange={e => setObservaciones(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white
                         focus:outline-none focus:ring-2 focus:ring-amber-300" />
          </div>

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
              Cerrar
            </button>
            <button onClick={guardar} disabled={guardando}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl
                         text-sm font-semibold text-white bg-amber-700 hover:bg-amber-800 disabled:opacity-60">
              {guardando && <Loader2 className="w-4 h-4 animate-spin" />}
              Guardar
            </button>
          </div>

          <div className="pt-3 border-t border-slate-100 flex gap-3">
            {yaEmpezo ? (
              <button onClick={terminar} disabled={guardando}
                className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold
                           text-slate-600 border border-slate-300 hover:bg-slate-50 disabled:opacity-60">
                <CalendarCheck className="w-3.5 h-3.5" /> Terminar hoy
              </button>
            ) : null}
            <button onClick={cancelar} disabled={guardando}
              className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold
                         text-red-700 border border-red-200 hover:bg-red-50 disabled:opacity-60">
              <Ban className="w-3.5 h-3.5" /> Sacar del calendario
            </button>
          </div>
          <p className="text-xs text-slate-400">
            {yaEmpezo
              ? "«Terminar hoy» deja constancia de que lo tuvo hasta hoy. «Sacar del calendario» la anula como si no hubiera pasado."
              : "Esta programación todavía no empieza, así que no hay nada que terminar: se saca del calendario."}
          </p>
        </div>
      </div>
    </div>
  );
}
