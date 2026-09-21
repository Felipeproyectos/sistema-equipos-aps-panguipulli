import { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { X, Loader2, AlertTriangle, Route, Fuel, ArrowLeftRight, Info } from "lucide-react";
import { validarSalida, ultimoKm, aNumero, etiquetaPrestamo } from "@/lib/bitacoraFlota";

// Registrar una salida, y cerrarla al volver.
//
// Son dos momentos distintos del mismo papel, y por eso es un solo modal: al
// salir se anota el odómetro y a dónde se va; al volver, el odómetro de
// llegada y lo que se cargó de combustible. Partirlo en dos pantallas obliga
// a buscar la fila otra vez.
//
// El préstamo no se elige acá. Si el vehículo estaba cedido ese día, lo pone
// la base al guardar (ver migracion/18_bitacora_flota.sql) y queda congelado:
// cuando el vehículo vuelva a su centro, esta salida tiene que seguir
// diciendo que ese día estaba en el otro.

const horaAhora = () => new Date().toTimeString().slice(0, 5);

export default function SalidaModal({
  registro,          // si viene, se está cerrando o corrigiendo una salida
  equipos = [],      // vehículos entre los que se puede elegir
  choferes = [],     // si viene con gente, el que registra elige por quién
  chofer,            // { id, nombre } cuando el que registra es el propio chofer
  registros = [],    // lo ya registrado, para proponer el odómetro
  onClose, onGuardado,
}) {
  const hoy = new Date().toISOString().split("T")[0];
  const cerrando = !!registro && registro.estado === "en_ruta";

  const [equipoId, setEquipoId] = useState(registro?.equipo_id || equipos[0]?.id || "");
  const [choferId, setChoferId] = useState(registro?.chofer_id || chofer?.id || choferes[0]?.id || "");
  const [fecha, setFecha] = useState(registro?.fecha || hoy);
  const [horaSalida, setHoraSalida] = useState(registro?.hora_salida || horaAhora());
  const [horaRegreso, setHoraRegreso] = useState(registro?.hora_regreso || (cerrando ? horaAhora() : ""));
  const [kmSalida, setKmSalida] = useState(registro?.km_salida ?? "");
  const [kmRegreso, setKmRegreso] = useState(registro?.km_regreso ?? "");
  const [destino, setDestino] = useState(registro?.destino || "");
  const [motivo, setMotivo] = useState(registro?.motivo || "");
  const [litros, setLitros] = useState(registro?.combustible_litros ?? "");
  const [monto, setMonto] = useState(registro?.combustible_monto ?? "");
  const [observaciones, setObservaciones] = useState(registro?.observaciones || "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const ultimo = useMemo(() => ultimoKm(registros, equipoId), [registros, equipoId]);

  // El odómetro propuesto es el último que consta. Se puede cambiar — es una
  // propuesta, no un dato: el vehículo pudo haber andado sin que nadie anotara.
  const kmSalidaMostrado = kmSalida === "" && !registro && ultimo !== null ? String(ultimo) : kmSalida;

  // Los vehículos pueden llegar como fichas completas (Movilización, que lee
  // `equipo`) o como el rótulo que ya trae la asignación (el chofer, que no
  // siempre puede leer la ficha del vehículo que maneja).
  const rotulo = (v) => v?.label
    || ([v?.marca, v?.modelo].filter(Boolean).join(" ") + (v?.patente ? ` · ${v.patente}` : "")).trim();
  const eq = equipos.find(e => e.id === equipoId);
  const etiqueta = registro?.equipo_label || rotulo(eq) || "";

  const base = {
    equipo_id: equipoId,
    fecha,
    km_salida: kmSalidaMostrado,
    km_regreso: kmRegreso,
  };
  const { error: errorRegla, aviso } = validarSalida(base, { ultimo, hoy });

  const guardar = async (cerrar) => {
    if (!choferId) { setError("Falta decir quién condujo."); return; }
    if (errorRegla) { setError(errorRegla); return; }
    if (cerrar && kmRegreso === "") { setError("Para cerrar la salida falta el kilometraje de regreso."); return; }
    setError("");
    setGuardando(true);
    const c = choferes.find(x => x.id === choferId);
    const datos = {
      equipo_id: equipoId,
      equipo_label: etiqueta,
      chofer_id: choferId,
      chofer_nombre: c ? (c.full_name || c.email) : (chofer?.nombre || registro?.chofer_nombre || ""),
      fecha,
      hora_salida: horaSalida || null,
      hora_regreso: horaRegreso || null,
      km_salida: aNumero(kmSalidaMostrado),
      km_regreso: aNumero(kmRegreso),
      destino: destino.trim() || null,
      motivo: motivo.trim() || null,
      combustible_litros: aNumero(litros),
      combustible_monto: aNumero(monto),
      observaciones: observaciones.trim() || null,
      estado: cerrar ? "cerrada" : (registro?.estado || "en_ruta"),
    };
    try {
      if (registro) await base44.entities.BitacoraFlota.update(registro.id, datos);
      else await base44.entities.BitacoraFlota.create(datos);
      onGuardado?.();
      onClose();
    } catch (e) {
      setError(e?.message || "No se pudo guardar la salida.");
      setGuardando(false);
    }
  };

  const prestamo = etiquetaPrestamo(registro);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="px-6 pt-6 pb-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-slate-900 flex items-center gap-2">
              <Route className="w-5 h-5 text-amber-700" />
              {cerrando ? "Registrar el regreso" : registro ? "Corregir la salida" : "Registrar salida"}
            </h2>
            {etiqueta && <p className="text-xs text-slate-400 mt-0.5">{etiqueta}</p>}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {prestamo && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-sm text-amber-900 flex items-start gap-2">
                <ArrowLeftRight className="w-4 h-4 mt-0.5 shrink-0" />
                {prestamo}
              </p>
            </div>
          )}

          {!registro && equipos.length === 0 && (
            <p className="text-sm text-slate-500 rounded-xl border border-slate-200 px-4 py-3">
              No hay vehículos a los que registrarle una salida.
            </p>
          )}

          {!registro && equipos.length > 1 && (
            <div>
              <label htmlFor="sal-equipo" className="text-xs font-semibold text-slate-600 block mb-1">
                Vehículo *
              </label>
              <select id="sal-equipo" value={equipoId} onChange={e => setEquipoId(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white
                           focus:outline-none focus:ring-2 focus:ring-amber-300">
                {equipos.map(v => (
                  <option key={v.id} value={v.id}>{rotulo(v) || "Vehículo"}</option>
                ))}
              </select>
            </div>
          )}

          {!registro && choferes.length > 0 && (
            <div>
              <label htmlFor="sal-chofer" className="text-xs font-semibold text-slate-600 block mb-1">
                ¿Quién condujo? *
              </label>
              <select id="sal-chofer" value={choferId} onChange={e => setChoferId(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white
                           focus:outline-none focus:ring-2 focus:ring-amber-300">
                {choferes.map(c => (
                  <option key={c.id} value={c.id}>{c.full_name || c.email}</option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label htmlFor="sal-fecha" className="text-xs font-semibold text-slate-600 block mb-1">Día *</label>
              <input id="sal-fecha" type="date" value={fecha} max={hoy}
                onChange={e => setFecha(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white
                           focus:outline-none focus:ring-2 focus:ring-amber-300" />
            </div>
            <div>
              <label htmlFor="sal-hsal" className="text-xs font-semibold text-slate-600 block mb-1">Salió</label>
              <input id="sal-hsal" type="time" value={horaSalida}
                onChange={e => setHoraSalida(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white
                           focus:outline-none focus:ring-2 focus:ring-amber-300" />
            </div>
            <div>
              <label htmlFor="sal-hreg" className="text-xs font-semibold text-slate-600 block mb-1">Volvió</label>
              <input id="sal-hreg" type="time" value={horaRegreso}
                onChange={e => setHoraRegreso(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white
                           focus:outline-none focus:ring-2 focus:ring-amber-300" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="sal-kms" className="text-xs font-semibold text-slate-600 block mb-1">
                Kilómetros al salir
              </label>
              <input id="sal-kms" type="number" inputMode="numeric" value={kmSalidaMostrado}
                onChange={e => setKmSalida(e.target.value)} placeholder="Odómetro"
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white
                           focus:outline-none focus:ring-2 focus:ring-amber-300" />
            </div>
            <div>
              <label htmlFor="sal-kmr" className="text-xs font-semibold text-slate-600 block mb-1">
                Kilómetros al volver
              </label>
              <input id="sal-kmr" type="number" inputMode="numeric" value={kmRegreso}
                onChange={e => setKmRegreso(e.target.value)} placeholder="Al regresar"
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white
                           focus:outline-none focus:ring-2 focus:ring-amber-300" />
            </div>
          </div>

          {ultimo !== null && !registro && (
            <p className="text-xs text-slate-400 -mt-2 flex items-start gap-1.5">
              <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              El último kilometraje que consta de este vehículo es {ultimo.toLocaleString("es-CL")} km.
            </p>
          )}

          <div>
            <label htmlFor="sal-destino" className="text-xs font-semibold text-slate-600 block mb-1">Destino</label>
            <input id="sal-destino" value={destino} onChange={e => setDestino(e.target.value)}
              placeholder="Ej: Coñaripe, ronda rural."
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white
                         focus:outline-none focus:ring-2 focus:ring-amber-300" />
          </div>

          <div>
            <label htmlFor="sal-motivo" className="text-xs font-semibold text-slate-600 block mb-1">Motivo</label>
            <input id="sal-motivo" value={motivo} onChange={e => setMotivo(e.target.value)}
              placeholder="Ej: traslado de pacientes, retiro de insumos."
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white
                         focus:outline-none focus:ring-2 focus:ring-amber-300" />
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <p className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
              <Fuel className="w-3.5 h-3.5" /> Combustible cargado en esta salida
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="sal-litros" className="text-xs text-slate-500 block mb-1">Litros</label>
                <input id="sal-litros" type="number" inputMode="decimal" value={litros}
                  onChange={e => setLitros(e.target.value)} placeholder="Opcional"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white
                             focus:outline-none focus:ring-2 focus:ring-amber-300" />
              </div>
              <div>
                <label htmlFor="sal-monto" className="text-xs text-slate-500 block mb-1">Monto ($)</label>
                <input id="sal-monto" type="number" inputMode="numeric" value={monto}
                  onChange={e => setMonto(e.target.value)} placeholder="Opcional"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white
                             focus:outline-none focus:ring-2 focus:ring-amber-300" />
              </div>
            </div>
          </div>

          <div>
            <label htmlFor="sal-obs" className="text-xs font-semibold text-slate-600 block mb-1">
              Observaciones
            </label>
            <textarea id="sal-obs" rows={2} value={observaciones}
              onChange={e => setObservaciones(e.target.value)}
              placeholder="Opcional. Ej: se sintió un ruido en el tren delantero."
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white
                         focus:outline-none focus:ring-2 focus:ring-amber-300" />
          </div>

          {/* El aviso no frena: un kilometraje más bajo que el último puede ser
              real, y el que está corrigiendo un dato mal anotado es justamente
              el que necesita poder guardar. */}
          {aviso && !errorRegla && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-sm text-amber-800">{aviso}</p>
            </div>
          )}

          {(error || errorRegla) && (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
              <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
              <p className="text-sm text-red-700">{error || errorRegla}</p>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium text-slate-600
                         border border-slate-200 hover:bg-slate-50">
              Cancelar
            </button>
            {/* Guardar sin cerrar deja la salida en ruta: el vehículo se fue y
                todavía no vuelve, que es un estado real y hay que poder
                dejarlo escrito. */}
            {(!registro || cerrando) && (
              <button onClick={() => guardar(false)} disabled={guardando || !!errorRegla}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl
                           text-sm font-semibold text-amber-800 border border-amber-300
                           hover:bg-amber-50 disabled:opacity-60">
                {guardando && <Loader2 className="w-4 h-4 animate-spin" />}
                {registro ? "Guardar sin cerrar" : "Salió"}
              </button>
            )}
            <button onClick={() => guardar(true)} disabled={guardando || !!errorRegla}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl
                         text-sm font-semibold text-white bg-amber-700 hover:bg-amber-800 disabled:opacity-60">
              {guardando && <Loader2 className="w-4 h-4 animate-spin" />}
              {registro && !cerrando ? "Guardar" : "Ya volvió"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
