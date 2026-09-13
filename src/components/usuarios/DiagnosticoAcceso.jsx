import { useState } from "react";
import { base44 } from "@/api/base44Client";
import {
  ShieldAlert, ShieldCheck, Loader2, Wrench, KeyRound, X, Copy, Check, RefreshCw,
} from "lucide-react";
import { roleLabel } from "@/lib/roles";

// Una cuenta que funciona son dos cosas: la ficha en el sistema (rol, centro) y
// la cuenta de acceso (correo y clave). Cuando falta la segunda la persona
// simplemente no entra, y hasta ahora eso no se veía desde ninguna pantalla:
// había que mirar la base de datos. Este panel lo pone a la vista y lo arregla.

const PROBLEMA_TEXTO = {
  sin_cuenta_de_acceso: "No tiene cuenta de acceso — no puede entrar",
  sin_correo: "No tiene correo registrado",
  sin_rol: "No tiene rol asignado",
  rol_desconocido: "Su rol no existe en el sistema",
};

function Tarjeta({ valor, etiqueta, color, bg }) {
  return (
    <div className="rounded-2xl px-4 py-3" style={{ background: bg }}>
      <p className="text-2xl font-bold leading-none" style={{ color }}>{valor}</p>
      <p className="text-[11px] font-medium mt-1" style={{ color }}>{etiqueta}</p>
    </div>
  );
}

function ClaveEntregable({ clave }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(clave);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch { /* sin portapapeles: igual está a la vista */ }
  };
  return (
    <button onClick={copiar} type="button"
      className="inline-flex items-center gap-1.5 font-mono text-sm font-bold px-2.5 py-1 rounded-lg bg-white border border-green-200 text-slate-800">
      {clave}
      {copiado ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
    </button>
  );
}

export default function DiagnosticoAcceso({ onClose, onCambios }) {
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [reparando, setReparando] = useState(false);
  const [reparados, setReparados] = useState(null);
  const [restableciendo, setRestableciendo] = useState("");
  const [claves, setClaves] = useState({});   // email -> clave temporal
  const [error, setError] = useState("");

  const revisar = async () => {
    setError(""); setCargando(true); setReparados(null);
    try {
      setDatos(await base44.users.diagnostico());
    } catch (e) {
      setError(e?.data?.error || e?.message || "No se pudo revisar el acceso");
    }
    setCargando(false);
  };

  const repararTodo = async () => {
    setError(""); setReparando(true);
    try {
      const r = await base44.users.reparar();
      setReparados(r.reparados || []);
      await revisar();
      if (onCambios) onCambios();
    } catch (e) {
      setError(e?.data?.error || e?.message || "No se pudieron crear las cuentas");
    }
    setReparando(false);
  };

  const restablecer = async (email) => {
    setError(""); setRestableciendo(email);
    try {
      const r = await base44.users.restablecerClave(email);
      setClaves((prev) => ({ ...prev, [email]: r.clave_temporal }));
    } catch (e) {
      setError(e?.data?.error || e?.message || "No se pudo restablecer la clave");
    }
    setRestableciendo("");
  };

  const sinAcceso = (datos?.usuarios || []).filter((u) => !u.puede_entrar);
  const conAcceso = (datos?.usuarios || []).filter((u) => u.puede_entrar);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ background: "rgba(15,23,42,0.5)" }}>
      <div className="bg-white w-full sm:max-w-3xl rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[92vh] flex flex-col">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
          <h2 className="font-bold text-slate-800 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-blue-600" /> Revisión de Acceso
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Cerrar">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto">
          {!datos && !cargando && (
            <div className="text-center py-8">
              <ShieldCheck className="w-12 h-12 text-slate-200 mx-auto mb-3" />
              <p className="text-sm text-slate-600 mb-1 font-semibold">¿Quién puede entrar al sistema?</p>
              <p className="text-xs text-slate-400 max-w-md mx-auto mb-5">
                Compara la lista de personas con las cuentas de acceso reales y muestra
                a quién le falta poder entrar. No cambia nada hasta que lo pidas.
              </p>
              <button onClick={revisar} className="px-5 py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: "#2563EB" }}>
                Revisar ahora
              </button>
            </div>
          )}

          {cargando && (
            <div className="flex items-center justify-center gap-2 py-10 text-slate-500 text-sm">
              <Loader2 className="w-5 h-5 animate-spin" /> Revisando cuentas…
            </div>
          )}

          {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

          {datos && !cargando && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Tarjeta valor={datos.resumen.total} etiqueta="Personas" color="#334155" bg="#f1f5f9" />
                <Tarjeta valor={datos.resumen.pueden_entrar} etiqueta="Pueden entrar" color="#15803d" bg="#dcfce7" />
                <Tarjeta valor={datos.resumen.sin_cuenta} etiqueta="Sin cuenta de acceso" color="#b91c1c" bg="#fee2e2" />
                <Tarjeta valor={datos.resumen.cuentas_ajenas} etiqueta="Cuentas de otro sistema" color="#64748b" bg="#f1f5f9" />
              </div>

              {datos.resumen.sin_cuenta > 0 && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
                  <ShieldAlert className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-bold text-amber-900">
                      {datos.resumen.sin_cuenta} persona{datos.resumen.sin_cuenta === 1 ? "" : "s"} no puede{datos.resumen.sin_cuenta === 1 ? "" : "n"} entrar
                    </p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      Tienen ficha en el sistema pero les falta la cuenta de acceso. Se les puede
                      crear a todas de una vez, con una clave temporal que deberán cambiar al entrar.
                    </p>
                    <button onClick={repararTodo} disabled={reparando}
                      className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white disabled:opacity-50"
                      style={{ background: "#D97706" }}>
                      {reparando ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Creando cuentas…</>
                                 : <><Wrench className="w-3.5 h-3.5" /> Crear las cuentas que faltan</>}
                    </button>
                  </div>
                </div>
              )}

              {reparados && reparados.length > 0 && (
                <div className="rounded-2xl border border-green-200 bg-green-50 p-4">
                  <p className="text-sm font-bold text-green-800 mb-2">
                    {reparados.length} cuenta{reparados.length === 1 ? "" : "s"} creada{reparados.length === 1 ? "" : "s"}
                  </p>
                  <p className="text-xs text-green-700 mb-3">
                    Anota estas claves ahora: no vuelven a mostrarse. A quien recibió el correo
                    igual le llegó la suya.
                  </p>
                  <div className="space-y-1.5 max-h-52 overflow-y-auto">
                    {reparados.map((r) => (
                      <div key={r.email} className="flex items-center justify-between gap-3 text-xs bg-white rounded-lg px-3 py-2 border border-green-100">
                        <span className="truncate text-slate-700">{r.full_name || r.email}</span>
                        {r.error
                          ? <span className="text-red-600 flex-shrink-0">{r.error}</span>
                          : <ClaveEntregable clave={r.clave_temporal} />}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {sinAcceso.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Con problemas</h3>
                  <div className="space-y-2">
                    {sinAcceso.map((u) => (
                      <div key={u.id} className="rounded-xl border border-red-100 bg-red-50/50 px-3 py-2.5">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-800 truncate">{u.full_name || u.email || "Sin nombre"}</p>
                            <p className="text-[11px] text-slate-500 truncate">
                              {u.email || "sin correo"} · {roleLabel(u.role)}{u.centro_principal ? ` · ${u.centro_principal}` : ""}
                            </p>
                          </div>
                          {u.email && (
                            <button onClick={() => restablecer(u.email)} disabled={restableciendo === u.email}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold flex-shrink-0 bg-white border border-slate-200 text-slate-700 disabled:opacity-50">
                              {restableciendo === u.email ? <Loader2 className="w-3 h-3 animate-spin" /> : <KeyRound className="w-3 h-3" />}
                              Dar acceso
                            </button>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {u.problemas.map((p) => (
                            <span key={p} className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                              {PROBLEMA_TEXTO[p] || p}
                            </span>
                          ))}
                        </div>
                        {claves[u.email] && (
                          <p className="mt-2 text-[11px] text-green-700 flex items-center gap-2">
                            Clave temporal: <ClaveEntregable clave={claves[u.email]} />
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* El proyecto de Supabase está compartido con otra aplicación de la
                  Corporación, así que casi todas estas cuentas son de allá y no
                  son un problema: nunca intentan entrar acá. Se muestran plegadas
                  y en gris, no como alarma — solo importan si reconoces a alguien
                  que SÍ debería trabajar en gestión. */}
              {datos.cuentas_ajenas.length > 0 && (
                <details className="rounded-xl border border-slate-100">
                  <summary className="cursor-pointer px-3 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Cuentas de otro sistema ({datos.cuentas_ajenas.length})
                  </summary>
                  <div className="px-3 pb-3">
                    <p className="text-[11px] text-slate-400 mb-2">
                      Tienen cuenta en este proyecto de Supabase pero no ficha en gestión:
                      son de la otra aplicación que comparte el proyecto. Solo actúa si
                      reconoces a alguien que sí debería entrar acá — en ese caso créale
                      la ficha con el mismo correo.
                    </p>
                    <div className="space-y-1.5 max-h-52 overflow-y-auto">
                      {datos.cuentas_ajenas.map((c) => (
                        <div key={c.email} className="text-xs bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 text-slate-600">
                          {c.email}
                        </div>
                      ))}
                    </div>
                  </div>
                </details>
              )}

              <div>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Pueden entrar ({conAcceso.length})
                </h3>
                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {conAcceso.map((u) => (
                    <div key={u.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-sm text-slate-800 truncate">{u.full_name || u.email}</p>
                        <p className="text-[11px] text-slate-400 truncate">
                          {u.email} · {roleLabel(u.role)}
                          {u.debe_cambiar_clave ? " · debe cambiar su clave" : ""}
                          {u.ultimo_ingreso ? "" : " · nunca ha entrado"}
                        </p>
                      </div>
                      <button onClick={() => restablecer(u.email)} disabled={restableciendo === u.email}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold flex-shrink-0 bg-slate-50 border border-slate-200 text-slate-600 disabled:opacity-50">
                        {restableciendo === u.email ? <Loader2 className="w-3 h-3 animate-spin" /> : <KeyRound className="w-3 h-3" />}
                        Clave nueva
                      </button>
                    </div>
                  ))}
                  {conAcceso.map((u) => claves[u.email] && (
                    <p key={`c-${u.id}`} className="text-[11px] text-green-700 flex items-center gap-2 px-3">
                      {u.email}: <ClaveEntregable clave={claves[u.email]} />
                    </p>
                  ))}
                </div>
              </div>

              <button onClick={revisar} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100">
                <RefreshCw className="w-4 h-4" /> Volver a revisar
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
