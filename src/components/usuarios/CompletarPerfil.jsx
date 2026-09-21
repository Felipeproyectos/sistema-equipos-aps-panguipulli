import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { getCentrosEstructura } from "@/lib/centros";
import { Stethoscope, Wrench, Shield, Loader2, CheckCircle2, UserPlus, IdCard, AlertCircle } from "lucide-react";

import { esRolFlota, esChofer, esSuperAdmin, ROLES } from "@/lib/roles";

// Las clases de licencia municipal chilenas. A1-A5 son de transporte de
// pasajeros o carga; B es el automovil particular.
const CLASES_LICENCIA = ["A1", "A2", "A3", "A4", "A5", "B", "C", "D", "E", "F"];

export default function CompletarPerfil({ user, onCompleto }) {
  const [open, setOpen] = useState(false);
  const [area, setArea] = useState("salud");
  const [centros, setCentros] = useState([]);
  const [centrosList, setCentrosList] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [licencia, setLicencia] = useState({ numero: "", clase: "B", vence: "" });

  const soyChofer = esChofer(user?.role);

  useEffect(() => {
    if (!user?.email) return;
    // Mostrar si el usuario no tiene área asignada
    // Al chofer ademas se le pide la licencia: sin ella Movilizacion no puede
    // saber si esta habilitado para manejar, ni avisarle antes de que venza.
    const sinArea = !user.area || !["salud", "taller", "ambas"].includes(user.area);
    const sinLicencia = esChofer(user.role) && !user.licencia_vencimiento;
    if (sinArea || sinLicencia) {
      // Pre-derivar área desde el rol
      if (esRolFlota(user.role)) setArea("taller");
      else if (esSuperAdmin(user.role) || user.role === ROLES.ADMIN || user.role === ROLES.MONITOR_CORPORATIVO) setArea("ambas");
      else setArea("salud");
      setOpen(true);
      getCentrosEstructura().then(setCentrosList).catch(() => {});
    }
  }, [user]);

  if (!open) return null;

  const toggleCentro = (nombre) => {
    setCentros(prev => prev.includes(nombre) ? prev.filter(c => c !== nombre) : [...prev, nombre]);
  };

  const handleGuardar = async () => {
    if (area === "salud" && centros.length === 0) return;
    if (soyChofer) {
      if (!licencia.numero.trim()) { setError("Escribe el número de tu licencia."); return; }
      if (!licencia.vence) { setError("Falta la fecha de vencimiento de tu licencia."); return; }
    }
    setError("");
    setGuardando(true);
    try {
      const update = {
        area,
        centros_asignados: area === "salud" ? centros : [],
        centro_principal: area === "salud" ? (centros[0] || "") : "",
        ...(soyChofer ? {
          licencia_numero: licencia.numero.trim(),
          licencia_clase: licencia.clase,
          licencia_vencimiento: licencia.vence,
        } : {}),
      };
      // Por el servidor y no con auth.updateMe: la policy `usuario_escribe`
      // solo deja escribir en `usuario` a super_admin y admin, asi que
      // updateMe fallaba para todos los demas — y el error se perdia en un
      // console.error, dejando a la persona apretando "Guardar" sin que
      // pasara nada. El servidor escribe con la llave de servicio, y la
      // identidad la saca del token, no de lo que le manden.
      await base44.functions.invoke("gestionarAcceso", { accion: "mi_perfil", ...update });
      setDone(true);
      setTimeout(() => {
        setOpen(false);
        onCompleto?.();
      }, 1800);
    } catch (e) {
      setError(e?.message || "No se pudo guardar. Intenta de nuevo.");
    } finally {
      setGuardando(false);
    }
  };

  const AREA_OPTS = [
    { v: "salud", l: "Salud", icon: Stethoscope, color: "#059669" },
    { v: "taller", l: "Taller", icon: Wrench, color: "#ea580c" },
    { v: "ambas", l: "Administración", icon: Shield, color: "#2563EB" },
  ];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: "rgba(15,23,42,0.7)" }}>
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl max-h-[92vh] overflow-y-auto">
        {done ? (
          <div className="p-10 text-center">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-lg font-bold text-slate-800">¡Perfil completado!</h2>
            <p className="text-sm text-slate-500 mt-1">
              Tu información fue enviada. Un administrador la revisará y confirmará tu asignación definitiva.
            </p>
          </div>
        ) : (
          <>
            <div className="px-6 py-5 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "#EFF6FF" }}>
                  <UserPlus className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h2 className="font-bold text-slate-800">Completa tu perfil</h2>
                  <p className="text-xs text-slate-400">Bienvenido/a, {user.full_name || user.email}</p>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-5">
              <p className="text-sm text-slate-600">
                {soyChofer
                  ? <>Antes de empezar necesitamos los datos de tu <strong>licencia de conducir</strong>. Movilización te va a avisar cuando esté por vencer.</>
                  : <>Para acceder correctamente al sistema, necesitamos que confirmes tu <strong>área operativa</strong> y <strong>centro(s)</strong> de trabajo. Un administrador validará esta información.</>}
              </p>

              {/* Área */}
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Área</label>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {AREA_OPTS.map(opt => {
                    const Icon = opt.icon;
                    const active = area === opt.v;
                    return (
                      <button
                        key={opt.v}
                        onClick={() => { setArea(opt.v); setCentros([]); }}
                        className="flex flex-col items-center gap-1.5 py-3 rounded-xl transition-all"
                        style={active
                          ? { background: `${opt.color}15`, border: `2px solid ${opt.color}` }
                          : { background: "#F8FAFC", border: "2px solid transparent" }}
                      >
                        <Icon className="w-5 h-5" style={{ color: opt.color }} />
                        <span className="text-xs font-semibold" style={{ color: active ? opt.color : "#64748B" }}>{opt.l}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* La licencia, solo para el chofer. Es lo que decide si puede
                  manejar, y de su vencimiento sale la alerta a 60 dias. */}
              {soyChofer && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 space-y-3">
                  <p className="flex items-center gap-2 text-xs font-semibold text-amber-900 uppercase tracking-wide">
                    <IdCard className="w-4 h-4" /> Tu licencia de conducir
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label htmlFor="lic-numero" className="text-xs font-semibold text-slate-600 block mb-1">
                        Número de licencia <span className="text-red-500">*</span>
                      </label>
                      <input id="lic-numero" value={licencia.numero}
                        onChange={e => setLicencia(l => ({ ...l, numero: e.target.value }))}
                        placeholder="Como aparece en el documento"
                        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white
                                   focus:outline-none focus:ring-2 focus:ring-amber-300" />
                    </div>
                    <div>
                      <label htmlFor="lic-clase" className="text-xs font-semibold text-slate-600 block mb-1">Clase</label>
                      <select id="lic-clase" value={licencia.clase}
                        onChange={e => setLicencia(l => ({ ...l, clase: e.target.value }))}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white
                                   focus:outline-none focus:ring-2 focus:ring-amber-300">
                        {CLASES_LICENCIA.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="lic-vence" className="text-xs font-semibold text-slate-600 block mb-1">
                        Vence el <span className="text-red-500">*</span>
                      </label>
                      <input id="lic-vence" type="date" value={licencia.vence}
                        onChange={e => setLicencia(l => ({ ...l, vence: e.target.value }))}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white
                                   focus:outline-none focus:ring-2 focus:ring-amber-300" />
                    </div>
                  </div>
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                  <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              {/* Centros (solo salud) */}
              {area === "salud" && (
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Centro(s) de trabajo <span className="text-red-500">*</span>
                  </label>
                  <p className="text-xs text-slate-400 mt-0.5">Selecciona uno o más centros donde trabajas</p>
                  <div className="mt-2 max-h-44 overflow-y-auto border border-slate-200 rounded-xl p-2 space-y-0.5">
                    {centrosList.length === 0 && (
                      <p className="text-xs text-slate-400 text-center py-2">Cargando centros...</p>
                    )}
                    {centrosList.map(c => (
                      <label key={c.nombre} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer">
                        <input type="checkbox" checked={centros.includes(c.nombre)} onChange={() => toggleCentro(c.nombre)} className="w-4 h-4 rounded" />
                        <span className="text-sm text-slate-700">{c.nombre}</span>
                        {c.subsedes?.length > 0 && (
                          <span className="text-xs text-slate-400">({c.subsedes.length} subsedes)</span>
                        )}
                      </label>
                    ))}
                  </div>
                  {centros.length > 0 && (
                    <p className="text-xs text-slate-500 mt-1.5">Seleccionados: {centros.join(", ")}</p>
                  )}
                </div>
              )}

              {area === "taller" && (
                <div className="bg-orange-50 rounded-xl p-3">
                  <p className="text-xs text-orange-700">
                    Al confirmar, quedarás registrado en el área de <strong>Taller Mecánico</strong>. El administrador asignará tus permisos específicos.
                  </p>
                </div>
              )}
              {area === "ambas" && (
                <div className="bg-blue-50 rounded-xl p-3">
                  <p className="text-xs text-blue-700">
                    Al confirmar, quedarás registrado con acceso global de <strong>Administración</strong>. El administrador confirmará tu rol.
                  </p>
                </div>
              )}
            </div>

            <div className="sticky bottom-0 bg-white px-6 py-4 border-t border-slate-100 flex gap-2">
              <button onClick={() => setOpen(false)} disabled={guardando}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 disabled:opacity-50">
                Ahora no
              </button>
              <button
                onClick={handleGuardar}
                disabled={guardando || (area === "salud" && centros.length === 0)}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ background: "#2563EB" }}
              >
                {guardando ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</> : "Confirmar y enviar"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
