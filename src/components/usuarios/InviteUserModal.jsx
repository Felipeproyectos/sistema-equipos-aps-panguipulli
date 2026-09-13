import { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { getCentrosEstructura } from "@/lib/centros";
import { X, Loader2, Copy, Check, UserPlus } from "lucide-react";
import { ROLES, rolesQuePuedeCrear, roleLabel, esRolSalud } from "@/lib/roles";

export default function InviteUserModal({ open, onClose, onInvited, currentUser }) {
  const [email, setEmail] = useState("");
  const [nombre, setNombre] = useState("");
  const [role, setRole] = useState("");
  const [creada, setCreada] = useState(null);   // { email, clave, correo_enviado }
  const [copiado, setCopiado] = useState(false);
  const [centrosList, setCentrosList] = useState([]);
  const [centroSel, setCentroSel] = useState([]);
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const rolesDisponibles = useMemo(
    () => rolesQuePuedeCrear(currentUser?.role).map((r) => ({ value: r, label: roleLabel(r) })),
    [currentUser?.role]
  );

  useEffect(() => {
    if (open) getCentrosEstructura().then(setCentrosList).catch(() => {});
  }, [open]);

  useEffect(() => {
    if (open && rolesDisponibles.length > 0 && !rolesDisponibles.find((r) => r.value === role)) {
      setRole(rolesDisponibles[0].value);
    }
    if (open) { setCentroSel([]); setCreada(null); setMsg(""); setError(""); }
     
  }, [open, currentUser?.role]);

  if (!open) return null;

  // Encargado Salud solo invita Usuario/Chofer dentro de su propio centro:
  // el centro queda fijo, no seleccionable.
  const centroFijo = currentUser?.role === ROLES.ENCARGADO_SALUD ? currentUser?.centro_principal : null;
  const mostrarSelectorCentro = esRolSalud(role) && role !== ROLES.USER ? true : esRolSalud(role) && !centroFijo;

  const puedeInvitar = email.trim() && role && (!mostrarSelectorCentro || centroFijo || centroSel.length > 0);

  const handleInvite = async () => {
    setError("");
    setMsg("");
    if (!email.trim()) { setError("Ingresa un correo válido"); return; }
    if (!rolesDisponibles.find((r) => r.value === role)) { setError("No tienes permiso para asignar ese rol"); return; }
    if (mostrarSelectorCentro && !centroFijo && centroSel.length === 0) {
      setError("Debes asignar al menos un centro (CESFAM) para este rol"); return;
    }
    setEnviando(true);
    try {
      const correo = email.trim().toLowerCase();
      const centroInfo = centroFijo || centroSel[0] || "";
      // Antes esto llamaba a base44.users.inviteUser, que dejó de existir al
      // migrar a Supabase: la invitación fallaba y quedaba una fila de
      // InvitacionPendiente que nadie aplicaba nunca. Ahora la cuenta se crea
      // completa de una vez —ficha + acceso + clave temporal— y el correo con
      // la clave sale por el servidor.
      const r = await base44.users.crear({
        email: correo,
        full_name: nombre.trim(),
        role,
        centro_principal: centroInfo,
      });
      setCreada({ email: correo, clave: r.clave_temporal, correo_enviado: r.correo_enviado });
      setEmail("");
      setNombre("");
      setCentroSel([]);
      if (onInvited) onInvited();
    } catch (e) {
      setError(e?.data?.error || e?.message || "No se pudo crear la cuenta");
    } finally {
      setEnviando(false);
    }
  };

  const copiarClave = async () => {
    try {
      await navigator.clipboard.writeText(creada.clave);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch { /* sin permiso de portapapeles: la clave está a la vista igual */ }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ background: "rgba(15,23,42,0.5)" }}>
      <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-white px-6 py-4 border-b border-slate-100 flex items-center justify-between z-10">
          <h2 className="font-bold text-slate-800 flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-blue-600" /> Nueva Cuenta de Acceso
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {rolesDisponibles.length === 0 ? (
            <p className="text-sm text-slate-500 bg-slate-50 rounded-xl p-4 text-center">
              Tu rol no tiene permiso para invitar nuevas cuentas.
            </p>
          ) : (
            <>
              {/* Nombre */}
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Nombre completo</label>
                <input
                  type="text"
                  value={nombre}
                  onChange={e => setNombre(e.target.value)}
                  placeholder="Nombre y apellido"
                  className="mt-1 w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </div>

              {/* Email */}
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Correo electrónico</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="correo@ejemplo.com"
                  className="mt-1 w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </div>

              {/* Rol — solo se ofrecen los roles que este usuario puede crear */}
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Rol</label>
                <select
                  value={role}
                  onChange={e => setRole(e.target.value)}
                  className="mt-1 w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
                >
                  {rolesDisponibles.map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>

              {/* Centro fijo (Encargado Salud invitando Usuario/Chofer) */}
              {centroFijo && (
                <div className="bg-blue-50 rounded-xl p-3">
                  <p className="text-xs text-blue-700">Quedará asignado a tu mismo centro: <strong>{centroFijo}</strong></p>
                </div>
              )}

              {/* Selector de centro (Admin/Super Admin invitando roles de Salud) */}
              {mostrarSelectorCentro && !centroFijo && (
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Centro (CESFAM) principal <span className="text-red-500">*</span>
                  </label>
                  <div className="mt-1 max-h-44 overflow-y-auto border border-slate-200 rounded-xl p-2 space-y-1">
                    {centrosList.length === 0 && (
                      <p className="text-xs text-slate-400 text-center py-2">Cargando centros...</p>
                    )}
                    {centrosList.map(c => (
                      <label key={c.nombre} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer">
                        <input
                          type="radio"
                          name="centro-principal"
                          checked={centroSel[0] === c.nombre}
                          onChange={() => setCentroSel([c.nombre])}
                          className="w-4 h-4"
                        />
                        <span className="text-sm text-slate-700">{c.nombre}</span>
                        {c.subsedes?.length > 0 && (
                          <span className="text-xs text-slate-400">({c.subsedes.length} subsedes)</span>
                        )}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Sin esto el botón queda gris y nadie sabe por qué. */}
              {!puedeInvitar && !creada && (
                <p className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
                  Falta {!email.trim() ? "escribir el correo" : "elegir el centro (CESFAM) principal"} para poder crear la cuenta.
                </p>
              )}

              {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
              {msg && <p className="text-xs text-green-600 bg-green-50 rounded-lg px-3 py-2">{msg}</p>}

              {/* La clave temporal se muestra una sola vez: si el correo no
                  salió, es la única forma de entregarla. */}
              {creada && (
                <div className="rounded-xl border border-green-200 bg-green-50 p-4 space-y-3">
                  <p className="text-sm font-bold text-green-800">Cuenta creada para {creada.email}</p>
                  <div className="bg-white rounded-lg border border-green-200 px-3 py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Clave temporal</p>
                      <p className="font-mono text-lg font-bold text-slate-800 truncate">{creada.clave}</p>
                    </div>
                    <button onClick={copiarClave} type="button"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold flex-shrink-0 bg-slate-100 text-slate-700">
                      {copiado ? <><Check className="w-3.5 h-3.5" /> Copiada</> : <><Copy className="w-3.5 h-3.5" /> Copiar</>}
                    </button>
                  </div>
                  <p className="text-xs text-green-700">
                    {creada.correo_enviado
                      ? "Le enviamos la clave por correo. Al entrar deberá cambiarla."
                      : "El correo no pudo enviarse: anota esta clave y entrégasela. No volverá a mostrarse."}
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        <div className="sticky bottom-0 bg-white px-6 py-4 border-t border-slate-100 flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100">
            Cerrar
          </button>
          {rolesDisponibles.length > 0 && (
            <button
              onClick={handleInvite}
              disabled={!puedeInvitar || enviando}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ background: "#2563EB" }}
            >
              {enviando ? <><Loader2 className="w-4 h-4 animate-spin" /> Creando...</> : "Crear cuenta"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}