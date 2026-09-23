import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { AlertCircle, Wand2, Loader2, CheckCircle2, X, ArrowRight, MapPin } from "lucide-react";
import { areaDeRol, areaDesalineada, roleLabel } from "@/lib/roles";

// Cuentas con datos que las ponen en el lugar equivocado, y su arreglo.
//
// Detecta dos cosas, y solo esas dos:
//
//  1. Área desalineada: `usuario.area` dice una cosa y el rol otra. La
//     pantalla de Usuarios mira el área antes que el rol, así que un chofer
//     con area 'salud' aparece en la pestaña Salud y no donde se lo busca.
//     Manda el rol: lo asigna quien administra y es lo que decide permisos.
//  2. Centro heredado sin migrar: `centro_asignado` (el campo de Base44) con
//     un centro que no está en `centros_asignados`.
//
// Lo que NO hace, a propósito:
//  - No marca a quien no tiene área. Sin área todas las pantallas caen al
//    rol, que es lo correcto, y las cuentas nuevas nacen así: marcarlas dejaba
//    el aviso encendido para siempre.
//  - No inventa un centro. Una versión anterior le ponía "CESFAM
//    Panguipulli" a todo el que no tuviera, y el centro decide qué equipos ve
//    un Encargado de Salud: adivinarlo es darle acceso a lo de otro. A esas
//    cuentas solo se las lista, para asignarlas a mano desde su tarjeta.

function getCentros(u) {
  const arr = Array.isArray(u.centros_asignados) ? u.centros_asignados : [];
  const legacy = u.centro_asignado ? [u.centro_asignado] : [];
  const principal = u.centro_principal ? [u.centro_principal] : [];
  return [...new Set([...principal, ...arr, ...legacy])].filter(Boolean);
}

function tieneCentroHeredado(u) {
  const arr = Array.isArray(u.centros_asignados) ? u.centros_asignados : [];
  return !!u.centro_asignado && !arr.includes(u.centro_asignado);
}

const NOMBRE_AREA = { salud: "Salud", taller: "Taller", ambas: "Administración", admin: "Administración" };

/** Las cuentas a corregir, cada una con el cambio mínimo que necesita. */
export function detectarPendientes(usuarios) {
  return usuarios
    .filter(u => areaDesalineada(u) || tieneCentroHeredado(u))
    .map(u => {
      const cambios = {};
      const motivos = [];
      if (areaDesalineada(u)) {
        cambios.area = areaDeRol(u.role);
        motivos.push({ tipo: "area", de: NOMBRE_AREA[u.area] || u.area, a: NOMBRE_AREA[cambios.area] });
      }
      if (tieneCentroHeredado(u)) {
        const centros = getCentros(u);
        cambios.centros_asignados = centros;
        cambios.centro_asignado = null;
        if (!u.centro_principal && areaDeRol(u.role) === "salud") cambios.centro_principal = centros[0];
        motivos.push({ tipo: "centro", de: u.centro_asignado });
      }
      return { id: u.id, email: u.email, full_name: u.full_name, role: u.role, cambios, motivos };
    });
}

/** Cuentas de Salud sin ningún centro: no se arreglan solas, se listan. */
export function detectarSinCentro(usuarios) {
  return usuarios.filter(u => areaDeRol(u.role) === "salud" && getCentros(u).length === 0);
}

export default function NormalizarUsuarios({ usuarios, onCompleto }) {
  const [open, setOpen] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [resultado, setResultado] = useState(null);

  const pendientes = detectarPendientes(usuarios);
  const sinCentro = detectarSinCentro(usuarios);

  if (pendientes.length === 0 && sinCentro.length === 0 && !open) return null;

  const ejecutar = async () => {
    setProcesando(true);
    let ok = 0;
    const fallidos = [];
    for (const p of pendientes) {
      try {
        await base44.entities.User.update(p.id, p.cambios);
        ok++;
      } catch (e) {
        fallidos.push(`${p.full_name || p.email}: ${e?.message || "error"}`);
      }
    }
    setProcesando(false);
    setResultado({ ok, fallidos, total: pendientes.length });
    onCompleto?.();
  };

  const cerrar = () => { if (!procesando) { setOpen(false); setResultado(null); } };

  return (
    <>
      {!open && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
              <AlertCircle className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-amber-800">
                {pendientes.length > 0
                  ? `${pendientes.length} ${pendientes.length === 1 ? "cuenta quedó" : "cuentas quedaron"} en el lugar equivocado`
                  : `${sinCentro.length} ${sinCentro.length === 1 ? "cuenta de Salud no tiene" : "cuentas de Salud no tienen"} centro`}
              </p>
              <p className="text-xs text-amber-700">
                {pendientes.length > 0
                  ? "El área guardada no corresponde a su rol, o tienen un centro heredado sin migrar."
                  : "Sin centro no ven ningún equipo. Hay que asignárselo desde su tarjeta."}
              </p>
            </div>
          </div>
          <button onClick={() => setOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white flex-shrink-0"
            style={{ background: "#D97706" }}>
            <Wand2 className="w-4 h-4" /> <span className="hidden sm:inline">Ordenar</span>
          </button>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ background: "rgba(15,23,42,0.5)" }}>
          <div className="bg-white w-full sm:max-w-2xl rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="sticky top-0 bg-white px-6 py-4 border-b border-slate-100 flex items-center justify-between z-10">
              <h2 className="font-bold text-slate-800 flex items-center gap-2">
                <Wand2 className="w-5 h-5 text-amber-600" /> Ordenar cuentas
              </h2>
              <button onClick={cerrar} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {resultado ? (
                <div className="text-center py-6">
                  <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
                    <CheckCircle2 className="w-7 h-7 text-green-600" />
                  </div>
                  <p className="text-lg font-bold text-slate-800">Listo</p>
                  <p className="text-sm text-slate-500 mt-1">
                    {resultado.ok} de {resultado.total} {resultado.total === 1 ? "cuenta corregida" : "cuentas corregidas"}
                  </p>
                  {resultado.fallidos.length > 0 && (
                    <div className="mt-3 text-left rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                      <p className="text-xs font-semibold text-red-800 mb-1">No se pudieron corregir:</p>
                      {resultado.fallidos.map(f => <p key={f} className="text-xs text-red-700">{f}</p>)}
                    </div>
                  )}
                  <button onClick={cerrar}
                    className="mt-4 px-6 py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: "#16A34A" }}>
                    Cerrar
                  </button>
                </div>
              ) : (
                <>
                  {pendientes.length > 0 && (
                    <div>
                      <p className="text-sm text-slate-600 mb-3">
                        Se corrigen <strong>{pendientes.length}</strong>. Solo cambia lo que se lista: el rol, el
                        nombre y los permisos quedan igual.
                      </p>
                      <div className="max-h-72 overflow-y-auto space-y-2">
                        {pendientes.map(p => (
                          <div key={p.id} className="bg-slate-50 rounded-xl p-3">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-semibold text-slate-700 truncate">{p.full_name || p.email}</p>
                              <span className="text-[11px] text-slate-500 flex-shrink-0">{roleLabel(p.role)}</span>
                            </div>
                            {p.motivos.map(m => m.tipo === "area" ? (
                              <p key={m.tipo} className="flex items-center gap-1.5 text-xs text-slate-500 mt-1">
                                Pestaña:
                                <span className="line-through text-slate-400">{m.de}</span>
                                <ArrowRight className="w-3 h-3 text-slate-300" />
                                <span className="font-semibold text-amber-700">{m.a}</span>
                              </p>
                            ) : (
                              // El centro heredado no se pierde: se pasa a la lista
                              // de centros que usa el sistema de ahora.
                              <p key={m.tipo} className="text-xs text-slate-500 mt-1">
                                Centro heredado <span className="font-semibold text-slate-700">{m.de}</span>
                                {" "}<span className="text-amber-700">se agrega a sus centros</span>
                              </p>
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {sinCentro.length > 0 && (
                    <div className="rounded-xl border border-slate-200 p-4">
                      <p className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-slate-400" />
                        Sin centro — hay que asignarlo a mano
                      </p>
                      <p className="text-xs text-slate-500 mt-1 mb-2">
                        Esto no se arregla solo: el centro decide qué equipos ve cada uno, y adivinarlo
                        sería darle acceso a lo de otro CESFAM. Ábrelas desde su tarjeta y elige el centro.
                      </p>
                      <ul className="space-y-1">
                        {sinCentro.map(u => (
                          <li key={u.id} className="text-xs text-slate-600">
                            {u.full_name || u.email} <span className="text-slate-400">· {roleLabel(u.role)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </div>

            {!resultado && (
              <div className="sticky bottom-0 bg-white px-6 py-4 border-t border-slate-100 flex gap-2">
                <button onClick={cerrar} disabled={procesando}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 disabled:opacity-50">
                  {pendientes.length > 0 ? "Cancelar" : "Cerrar"}
                </button>
                {pendientes.length > 0 && (
                  <button onClick={ejecutar} disabled={procesando}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50 flex items-center justify-center gap-2"
                    style={{ background: "#D97706" }}>
                    {procesando
                      ? <><Loader2 className="w-4 h-4 animate-spin" /> Corrigiendo...</>
                      : <><Wand2 className="w-4 h-4" /> Corregir {pendientes.length}</>}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
