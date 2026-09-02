import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { getCentrosEstructura } from "@/lib/centros";
import { Stethoscope, Wrench, Shield, Loader2, CheckCircle2, UserPlus } from "lucide-react";

import { esRolTaller, esSuperAdmin, ROLES } from "@/lib/roles";

export default function CompletarPerfil({ user, onCompleto }) {
  const [open, setOpen] = useState(false);
  const [area, setArea] = useState("salud");
  const [centros, setCentros] = useState([]);
  const [centrosList, setCentrosList] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!user?.email) return;
    // Mostrar si el usuario no tiene área asignada
    const sinArea = !user.area || !["salud", "taller", "ambas"].includes(user.area);
    if (sinArea) {
      // Pre-derivar área desde el rol
      if (esRolTaller(user.role)) setArea("taller");
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
    setGuardando(true);
    try {
      const update = {
        area,
        centros_asignados: area === "salud" ? centros : [],
        centro_principal: area === "salud" ? (centros[0] || "") : "",
      };
      await base44.auth.updateMe(update);
      setDone(true);
      setTimeout(() => {
        setOpen(false);
        onCompleto?.();
      }, 1800);
    } catch (e) {
      console.error(e);
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
                Para acceder correctamente al sistema, necesitamos que confirmes tu <strong>área operativa</strong> y <strong>centro(s)</strong> de trabajo. Un administrador validará esta información.
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
