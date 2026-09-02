import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { AlertCircle, Wand2, Loader2, CheckCircle2, X } from "lucide-react";
import { esRolTaller, esSuperAdmin, ROLES } from "@/lib/roles";

const CENTRO_MIGRACION_DEFECTO = "CESFAM Panguipulli";

function getCentros(u) {
  const arr = Array.isArray(u.centros_asignados) ? u.centros_asignados : [];
  const legacy = u.centro_asignado ? [u.centro_asignado] : [];
  const principal = u.centro_principal ? [u.centro_principal] : [];
  return [...new Set([...principal, ...arr, ...legacy])].filter(Boolean);
}

function derivarArea(u) {
  if (esSuperAdmin(u.role) || u.role === ROLES.ADMIN || u.role === ROLES.MONITOR_CORPORATIVO) return "ambas";
  if (esRolTaller(u.role)) return "taller";
  return "salud";
}

// Detecta usuarios que requieren normalización:
// - Sin área válida o con datos de centro heredados (legacy) sin migrar.
// - Roles de Salud sin centro_principal asignado: se proponen migrar por
//   defecto a CESFAM Panguipulli (decisión de migración), a la espera de que
//   Base del Sistema reasigne manualmente el centro correcto de cada uno.
export function detectarPendientes(usuarios) {
  return usuarios.filter(u => {
    const areaValida = ["salud", "taller", "ambas"].includes(u.area);
    const centrosArr = Array.isArray(u.centros_asignados) ? u.centros_asignados : [];
    const tieneLegacy = !!u.centro_asignado && !centrosArr.includes(u.centro_asignado);
    const areaMala = u.area === "admin" || (u.area && !areaValida);
    const areaDerivada = derivarArea(u);
    const necesitaCentro = areaDerivada === "salud" && !u.centro_principal;
    return !u.area || areaMala || tieneLegacy || necesitaCentro;
  }).map(u => {
    const areaCorrecta = derivarArea(u);
    const centrosFinales = getCentros(u);
    const centroPrincipalFinal = u.centro_principal || centrosFinales[0] || (areaCorrecta === "salud" ? CENTRO_MIGRACION_DEFECTO : "");
    return {
      id: u.id,
      email: u.email,
      full_name: u.full_name,
      areaActual: u.area || "—",
      areaCorrecta,
      centroActual: u.centro_principal || "—",
      centroFinal: centroPrincipalFinal,
      cambios: {
        area: areaCorrecta,
        centros_asignados: centrosFinales,
        centro_asignado: null, // limpiar legacy
        centro_principal: areaCorrecta === "salud" ? centroPrincipalFinal : "",
      },
    };
  });
}

export default function NormalizarUsuarios({ usuarios, onCompleto }) {
  const [open, setOpen] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [resultado, setResultado] = useState(null);

  const pendientes = detectarPendientes(usuarios);

  if (pendientes.length === 0 && !open) return null;

  const ejecutar = async () => {
    setProcesando(true);
    let ok = 0, err = 0;
    for (const p of pendientes) {
      try {
        await base44.entities.User.update(p.id, p.cambios);
        ok++;
      } catch (e) {
        console.error("Error normalizando", p.email, e);
        err++;
      }
    }
    setProcesando(false);
    setResultado({ ok, err, total: pendientes.length });
    if (onCompleto) onCompleto();
  };

  return (
    <>
      {/* Banner de alerta */}
      {!open && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
              <AlertCircle className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-amber-800">{pendientes.length} usuario(s) requieren normalización</p>
              <p className="text-xs text-amber-600">Sin centro asignado (se propone {CENTRO_MIGRACION_DEFECTO} por defecto) o con datos heredados sin migrar</p>
            </div>
          </div>
          <button
            onClick={() => setOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white flex-shrink-0"
            style={{ background: "#D97706" }}
          >
            <Wand2 className="w-4 h-4" /> <span className="hidden sm:inline">Revisar</span>
          </button>
        </div>
      )}

      {/* Modal de revisión */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ background: "rgba(15,23,42,0.5)" }}>
          <div className="bg-white w-full sm:max-w-2xl rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="sticky top-0 bg-white px-6 py-4 border-b border-slate-100 flex items-center justify-between z-10">
              <h2 className="font-bold text-slate-800 flex items-center gap-2">
                <Wand2 className="w-5 h-5 text-amber-600" /> Normalizar Usuarios
              </h2>
              <button onClick={() => { if (!procesando) { setOpen(false); setResultado(null); } }} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {resultado ? (
                <div className="text-center py-6">
                  <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
                    <CheckCircle2 className="w-7 h-7 text-green-600" />
                  </div>
                  <p className="text-lg font-bold text-slate-800">Normalización completada</p>
                  <p className="text-sm text-slate-500 mt-1">
                    {resultado.ok} actualizado(s) correctamente
                    {resultado.err > 0 && ` · ${resultado.err} con error`}
                  </p>
                  <p className="text-xs text-slate-400 mt-3">
                    Recuerda reasignar manualmente el centro correcto de cada usuario desde su tarjeta cuando corresponda.
                  </p>
                  <button onClick={() => { setOpen(false); setResultado(null); }}
                    className="mt-4 px-6 py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: "#16A34A" }}>
                    Listo
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-sm text-slate-600">
                    Se actualizarán <strong>{pendientes.length}</strong> usuario(s), migrando datos heredados y asignando
                    <strong> {CENTRO_MIGRACION_DEFECTO}</strong> por defecto a quienes no tengan centro (podrás reasignarlos después):
                  </p>
                  <div className="max-h-72 overflow-y-auto space-y-2">
                    {pendientes.map(p => (
                      <div key={p.id} className="bg-slate-50 rounded-xl p-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-700 truncate">{p.full_name || p.email}</p>
                          <p className="text-xs text-slate-400 truncate">{p.email}</p>
                        </div>
                        <div className="flex items-center gap-2 text-xs flex-shrink-0">
                          <span className="text-slate-400 line-through">{p.centroActual}</span>
                          <span className="text-slate-300">→</span>
                          <span className="font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                            {p.centroFinal || "—"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {!resultado && (
              <div className="sticky bottom-0 bg-white px-6 py-4 border-t border-slate-100 flex gap-2">
                <button onClick={() => setOpen(false)} disabled={procesando}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 disabled:opacity-50">
                  Cancelar
                </button>
                <button onClick={ejecutar} disabled={procesando}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{ background: "#D97706" }}>
                  {procesando ? <><Loader2 className="w-4 h-4 animate-spin" /> Normalizando...</> : <><Wand2 className="w-4 h-4" /> Aplicar normalización</>}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
