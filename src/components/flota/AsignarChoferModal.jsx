import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { X, Loader2, IdCard, AlertTriangle, UserCheck, Ban } from "lucide-react";
import { ROLES } from "@/lib/roles";
import { estadoLicencia } from "@/pages/Choferes";

// Asignar un chofer a un vehículo.
//
// La regla de la licencia
// ───────────────────────
// Un chofer con la licencia vencida — o sin cargarla — no puede quedar a
// cargo de un vehículo. Acá sale de la lista de elegibles y se muestra por
// qué, pero la regla de verdad vive en la base: la policy de inserción llama
// a `licencia_vigente(chofer_id)` (ver migracion/15_asignaciones.sql). Esto
// es para que la persona entienda, no para impedir — una validación que solo
// está en el navegador se salta recargando.

export default function AsignarChoferModal({ equipo, asignacionActual, onClose, onGuardado }) {
  const [choferes, setChoferes] = useState([]);
  const [elegido, setElegido] = useState("");
  const [desde, setDesde] = useState(new Date().toISOString().split("T")[0]);
  const [observaciones, setObservaciones] = useState("");
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let vivo = true;
    (async () => {
      let gente = [];
      try {
        const res = await base44.functions.invoke("getUsuariosPorCentro");
        gente = Array.isArray(res?.data) ? res.data : [];
      } catch {
        gente = await base44.entities.User.list("full_name", 500).catch(() => []);
      }
      if (!vivo) return;
      setChoferes(gente.filter(u => u.role === ROLES.CHOFER)
        .map(c => ({ ...c, lic: estadoLicencia(c.licencia_vencimiento) })));
      setCargando(false);
    })();
    return () => { vivo = false; };
  }, []);

  const habilitados = choferes.filter(c => c.lic.clave === "vigente" || c.lic.clave === "por_vencer");
  const frenados = choferes.filter(c => c.lic.clave === "vencida" || c.lic.clave === "sin_datos");

  const etiqueta = [equipo.marca, equipo.modelo].filter(Boolean).join(" ")
    + (equipo.patente ? ` · ${equipo.patente}` : "");

  const guardar = async () => {
    if (!elegido) { setError("Elige un chofer."); return; }
    if (!desde) { setError("Falta la fecha desde la que queda a cargo."); return; }
    setError("");
    setGuardando(true);
    try {
      // Primero se cierra la que estaba: el índice único de la base solo
      // admite una asignación 'activa' por vehículo, así que al revés
      // fallaría.
      if (asignacionActual) {
        await base44.entities.AsignacionChofer.update(asignacionActual.id, {
          estado: "terminada",
          hasta: new Date().toISOString().split("T")[0],
        });
      }
      const c = choferes.find(x => x.id === elegido);
      await base44.entities.AsignacionChofer.create({
        chofer_id: c.id,
        chofer_email: c.email || "",
        chofer_nombre: c.full_name || c.email || "",
        equipo_id: equipo.id,
        equipo_label: etiqueta,
        desde,
        estado: "activa",
        observaciones: observaciones.trim(),
      });
      onGuardado?.();
      onClose();
    } catch (e) {
      setError(e?.message || "No se pudo guardar la asignación.");
      setGuardando(false);
    }
  };

  const liberar = async () => {
    if (!asignacionActual) return;
    setError("");
    setGuardando(true);
    try {
      await base44.entities.AsignacionChofer.update(asignacionActual.id, {
        estado: "terminada",
        hasta: new Date().toISOString().split("T")[0],
      });
      onGuardado?.();
      onClose();
    } catch (e) {
      setError(e?.message || "No se pudo liberar el vehículo.");
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="px-6 pt-6 pb-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-slate-900 flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-amber-700" />
              Asignar chofer
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">{etiqueta}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {asignacionActual && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
              <p className="text-sm text-slate-600">
                Hoy lo tiene a cargo <strong className="text-slate-800">{asignacionActual.chofer_nombre}</strong>
              </p>
              <button onClick={liberar} disabled={guardando}
                className="text-xs font-semibold text-slate-600 border border-slate-300 rounded-lg px-3 py-1.5
                           hover:bg-white disabled:opacity-60">
                Dejar sin chofer
              </button>
            </div>
          )}

          {cargando ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-amber-600 animate-spin" />
            </div>
          ) : choferes.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-6">
              Todavía no hay choferes registrados. Créalos desde la pantalla de Choferes.
            </p>
          ) : (
            <>
              <div>
                <p className="text-xs font-semibold text-slate-600 mb-2">
                  ¿Quién queda a cargo?
                </p>
                {habilitados.length === 0 ? (
                  <p className="text-sm text-slate-500 rounded-xl border border-slate-200 px-4 py-3">
                    Ningún chofer tiene la licencia vigente en este momento.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {habilitados.map(c => (
                      <button key={c.id} onClick={() => setElegido(c.id)}
                        className={`w-full text-left px-4 py-3 rounded-xl border transition-colors ${
                          elegido === c.id ? "border-amber-600 bg-amber-50"
                                           : "border-slate-200 hover:border-amber-300"}`}>
                        <p className={`text-sm font-semibold ${elegido === c.id ? "text-amber-900" : "text-slate-700"}`}>
                          {c.full_name || c.email}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                          <IdCard className="w-3 h-3" />
                          Licencia {c.licencia_numero}
                          {c.licencia_clase && ` · clase ${c.licencia_clase}`}
                          {c.lic.clave === "por_vencer" && (
                            <span className="text-amber-700 font-semibold"> · {c.lic.label}</span>
                          )}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {frenados.length > 0 && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                    <Ban className="w-3.5 h-3.5" /> No pueden quedar a cargo
                  </p>
                  <ul className="mt-2 space-y-1">
                    {frenados.map(c => (
                      <li key={c.id} className="text-xs text-slate-500">
                        <span className="text-slate-700">{c.full_name || c.email}</span>
                        {" — "}
                        {c.lic.clave === "vencida" ? c.lic.label : "no ha cargado su licencia"}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <label htmlFor="asig-desde" className="text-xs font-semibold text-slate-600 block mb-1">
                  Desde *
                </label>
                <input id="asig-desde" type="date" value={desde}
                  onChange={e => setDesde(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white
                             focus:outline-none focus:ring-2 focus:ring-amber-300" />
              </div>

              <div>
                <label htmlFor="asig-obs" className="text-xs font-semibold text-slate-600 block mb-1">
                  Observaciones
                </label>
                <textarea id="asig-obs" rows={2} value={observaciones}
                  onChange={e => setObservaciones(e.target.value)}
                  placeholder="Opcional. Ej: turno de mañana, reemplazo por vacaciones."
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
            <button onClick={guardar} disabled={guardando || cargando || !elegido}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl
                         text-sm font-semibold text-white bg-amber-700 hover:bg-amber-800 disabled:opacity-60">
              {guardando && <Loader2 className="w-4 h-4 animate-spin" />}
              {guardando ? "Guardando..." : "Asignar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
