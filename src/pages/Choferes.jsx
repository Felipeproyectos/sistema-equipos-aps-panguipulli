import { useState, useEffect, useCallback, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { IdCard, UserPlus, Search, RefreshCw, AlertTriangle, CheckCircle2, Clock, HelpCircle } from "lucide-react";
import usePullToRefresh from "@/hooks/usePullToRefresh";
import InviteUserModal from "@/components/usuarios/InviteUserModal";
import { useAuth } from "@/lib/AuthContext";
import { isSimulandoActivo } from "@/lib/roleSimulator";
import { ROLES } from "@/lib/roles";
import AyudaPantalla from "@/components/flota/AyudaPantalla";

// Los choferes de la flota, para el Encargado de Movilización.
//
// Qué resuelve
// ────────────
// Saber quién está habilitado para manejar. La licencia de conducir vence, y
// hasta hoy nadie llevaba la cuenta: el sistema sabía los vencimientos del
// vehículo — revisión técnica, permiso de circulación — pero no los de la
// persona que lo maneja.
//
// Quién carga los datos
// ─────────────────────
// El chofer, no el Encargado. Movilización crea la cuenta; la primera vez que
// el chofer entra, el sistema le pide su licencia y no lo deja pasar sin ella
// (ver CompletarPerfil). Así el dato viene de quien tiene el documento en la
// mano, y el Encargado no transcribe.
//
// El aviso
// ────────
// La tarea de las 03:00 revisa las licencias junto con los demás vencimientos
// y crea la alerta 60 días antes. Esta pantalla muestra lo mismo, pero sin
// esperar a mañana.

const DIAS_AVISO = 60;

/** Estado de la licencia de una persona, a hoy. */
// Desde esta pantalla solo se crean choferes, sea quien sea el que la abre.
const CHOFER_SOLO = ["chofer"];

export function estadoLicencia(vencimiento, hoy = new Date()) {
  if (!vencimiento) return { clave: "sin_datos", label: "Sin cargar", dias: null };
  const fecha = new Date(`${vencimiento}T00:00:00`);
  if (Number.isNaN(fecha.getTime())) return { clave: "sin_datos", label: "Sin cargar", dias: null };
  const dias = Math.floor((fecha - new Date(hoy.toDateString())) / 86400000);
  if (dias < 0) return { clave: "vencida", label: `Vencida hace ${Math.abs(dias)} días`, dias };
  if (dias <= DIAS_AVISO) return { clave: "por_vencer", label: `Vence en ${dias} días`, dias };
  return { clave: "vigente", label: "Vigente", dias };
}

const COLOR = {
  vencida:    { texto: "#b91c1c", fondo: "#fef2f2", borde: "#fecaca", icon: AlertTriangle },
  por_vencer: { texto: "#b45309", fondo: "#fffbeb", borde: "#fde68a", icon: Clock },
  vigente:    { texto: "#15803d", fondo: "#f0fdf4", borde: "#bbf7d0", icon: CheckCircle2 },
  sin_datos:  { texto: "#64748b", fondo: "#f8fafc", borde: "#e2e8f0", icon: HelpCircle },
};

const ORDEN = { vencida: 0, por_vencer: 1, sin_datos: 2, vigente: 3 };

export default function Choferes() {
  const { user } = useAuth();
  const [choferes, setChoferes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [invitando, setInvitando] = useState(false);
  const containerRef = useRef(null);

  const soloLectura = isSimulandoActivo();

  const cargar = useCallback(async () => {
    let gente = [];
    try {
      const res = await base44.functions.invoke("getUsuariosPorCentro");
      gente = Array.isArray(res?.data) ? res.data : [];
    } catch {
      // Simulando rol las funciones están bloqueadas; se cae a lectura directa.
      gente = await base44.entities.User.list("full_name", 500).catch(() => []);
    }
    setChoferes(gente.filter(u => u.role === ROLES.CHOFER));
  }, []);

  useEffect(() => { cargar().finally(() => setLoading(false)); }, [cargar]);
  const { refreshing } = usePullToRefresh(cargar, containerRef);

  const conEstado = choferes
    .map(c => ({ ...c, lic: estadoLicencia(c.licencia_vencimiento) }))
    .sort((a, b) => (ORDEN[a.lic.clave] - ORDEN[b.lic.clave])
      || (a.full_name || "").localeCompare(b.full_name || ""));

  const visibles = busqueda
    ? conEstado.filter(c => [c.full_name, c.email, c.licencia_numero]
        .some(v => (v || "").toLowerCase().includes(busqueda.toLowerCase())))
    : conEstado;

  const cuantos = (clave) => conEstado.filter(c => c.lic.clave === clave).length;
  const porAtender = cuantos("vencida") + cuantos("por_vencer");

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div ref={containerRef} className="min-h-screen bg-slate-50" style={{ overscrollBehavior: "none" }}>
      {refreshing && (
        <div className="flex items-center justify-center py-3 lg:hidden">
          <RefreshCw className="w-5 h-5 text-amber-500 animate-spin" />
        </div>
      )}

      <div className="relative overflow-hidden px-4 lg:px-10 pt-6 lg:pt-10 pb-6 lg:pb-8"
        style={{ background: "linear-gradient(135deg, #451a03 0%, #92400e 45%, #d97706 100%)" }}>
        <div className="relative max-w-5xl mx-auto flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
              style={{ background: "rgba(255,255,255,0.2)" }}>
              <IdCard className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-amber-200 text-xs font-semibold uppercase tracking-widest">Flota</p>
              <h1 className="text-2xl lg:text-3xl font-bold text-white">Choferes</h1>
              <p className="text-amber-100 text-sm mt-0.5">
                {choferes.length} {choferes.length === 1 ? "chofer" : "choferes"}
                {porAtender > 0 && ` · ${porAtender} con la licencia por atender`}
              </p>
            </div>
          </div>
          {!soloLectura && (
            <button onClick={() => setInvitando(true)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold shadow"
              style={{ background: "rgba(255,255,255,0.2)", color: "white", border: "1px solid rgba(255,255,255,0.3)" }}>
              <UserPlus className="w-4 h-4" /> Nuevo chofer
            </button>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 lg:px-10 pt-5 pb-10">
        <AyudaPantalla clave="choferes">
          Las cuentas de los choferes y el estado de su licencia. Con <strong>Nuevo chofer</strong> creas
          la cuenta y te da una clave para entregarle; al entrar por primera vez, el chofer carga
          su licencia. Sin licencia vigente no se le puede asignar un vehículo.
        </AyudaPantalla>
        {porAtender > 0 && (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 mb-5">
            <AlertTriangle className="w-5 h-5 text-amber-700 mt-0.5 shrink-0" />
            <p className="text-sm text-amber-900">
              {cuantos("vencida") > 0 && (
                <><strong>{cuantos("vencida")}</strong> con la licencia vencida. </>
              )}
              {cuantos("por_vencer") > 0 && (
                <><strong>{cuantos("por_vencer")}</strong> por vencer dentro de {DIAS_AVISO} días. </>
              )}
              Avísales para que la renueven.
            </p>
          </div>
        )}

        <div className="relative mb-5">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
            placeholder="Nombre, correo o número de licencia..."
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 text-sm bg-white
                       focus:outline-none focus:ring-2 focus:ring-amber-300" />
        </div>

        {visibles.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-14 text-center">
            <IdCard className="w-12 h-12 mx-auto text-slate-200 mb-3" />
            <p className="text-slate-500 font-medium">
              {choferes.length === 0
                ? "Todavía no hay choferes registrados."
                : "Ningún chofer coincide con lo que buscas."}
            </p>
            {choferes.length === 0 && !soloLectura && (
              <p className="text-sm text-slate-400 mt-1">
                Con «Nuevo chofer» creas la cuenta. Él carga su licencia al entrar.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {visibles.map(c => {
              const col = COLOR[c.lic.clave];
              const Icono = col.icon;
              return (
                <div key={c.id} className="bg-white rounded-2xl border border-slate-200 p-5
                                           flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0
                                    text-sm font-bold text-amber-800 bg-amber-50">
                      {(c.full_name || c.email || "?").charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-slate-800">{c.full_name || "Sin nombre"}</p>
                      <p className="text-xs text-slate-400">{c.email}</p>
                      <p className="text-sm text-slate-500 mt-1">
                        {c.licencia_numero
                          ? <>Licencia {c.licencia_numero}
                              {c.licencia_clase && <span className="text-slate-400"> · clase {c.licencia_clase}</span>}</>
                          : <span className="text-slate-400">Aún no carga su licencia</span>}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold border"
                      style={{ color: col.texto, background: col.fondo, borderColor: col.borde }}>
                      <Icono className="w-3.5 h-3.5" />
                      {c.lic.label}
                    </span>
                    {c.licencia_vencimiento && (
                      <p className="text-xs text-slate-400 mt-1.5">
                        vence el {new Date(`${c.licencia_vencimiento}T00:00:00`).toLocaleDateString("es-CL")}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <InviteUserModal
        open={invitando}
        onClose={() => setInvitando(false)}
        onInvited={cargar}
        currentUser={user}
        rolesPermitidos={CHOFER_SOLO}
        titulo="Nuevo chofer"
      />
    </div>
  );
}
