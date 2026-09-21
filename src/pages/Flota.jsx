import { useState, useEffect, useCallback, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Truck, Plus, Search, RefreshCw, Lock, UserCheck, UserX, AlertTriangle } from "lucide-react";
import usePullToRefresh from "@/hooks/usePullToRefresh";
import { TIPOS_VEHICULO, TIPOS_VEHICULO_CORPORATIVO, ESTADOS_EQUIPO, TIPOS_EQUIPO, esVehiculo } from "@/lib/centros";
import EquipoCard from "@/components/equipos2/EquipoCard";
import EquipoFormModal from "@/components/equipos2/EquipoFormModal";
import EquipoDetalleModal from "@/components/equipos2/EquipoDetalleModal";
import { useAuth } from "@/lib/AuthContext";
import { isSimulandoActivo } from "@/lib/roleSimulator";
import AsignarChoferModal from "@/components/flota/AsignarChoferModal";
import { estadoLicencia } from "@/pages/Choferes";

// Las fichas de la flota, para el Encargado de Movilización.
//
// Por qué es una pantalla aparte de Equipos
// ─────────────────────────────────────────
// Equipos está organizada por CENTRO: un desfibrilador pertenece a un CESFAM
// y ahí se queda. La flota no funciona así — una camioneta se mueve entre
// centros, y el Encargado tiene que verla igual esté donde esté. Por eso acá
// no hay selector de centro: están todos los vehículos, siempre, y el centro
// es un dato más de la tarjeta.
//
// Quién edita qué
// ───────────────
// Los vehículos corporativos son de Movilización: los carga y los mantiene.
// La AMBULANCIA no. Su ficha es de Calidad, porque ahí viven las pautas y la
// información con la que el personal de salud identifica el equipo.
// Movilización la ve completa — la necesita para administrar la flota y para
// derivar al taller — pero en lectura. La regla vive en la base
// (migracion/13_flota.sql), no solo acá: esto es la versión visible de algo
// que la base ya impide.

const SOLO_CORPORATIVOS = "corporativos";
const SOLO_AMBULANCIAS = "ambulancias";

export default function Flota() {
  const { user } = useAuth();
  const [equipos, setEquipos] = useState([]);
  const [parches, setParches] = useState([]);
  const [asignaciones, setAsignaciones] = useState([]);
  const [choferes, setChoferes] = useState([]);
  const [asignando, setAsignando] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("todos");
  // Dos filtros distintos y por eso dos estados: el grupo (corporativos /
  // ambulancias) y el tipo exacto. Compartiendo uno, elegir "Corporativos"
  // dejaba al desplegable de tipo mostrando un valor que no es opcion suya.
  const [filtroGrupo, setFiltroGrupo] = useState("todos");
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [showForm, setShowForm] = useState(false);
  const [equipoEditar, setEquipoEditar] = useState(null);
  const [equipoDetalle, setEquipoDetalle] = useState(null);
  const containerRef = useRef(null);

  const soloLectura = isSimulandoActivo();

  const reload = useCallback(async () => {
    // Las asignaciones vigentes y los choferes, para poder decir en cada
    // tarjeta quien tiene el vehiculo a cargo y si su licencia sigue al dia.
    base44.entities.AsignacionChofer.filter({ estado: "activa" }, "-created_date", 500)
      .then(setAsignaciones).catch(() => setAsignaciones([]));
    base44.functions.invoke("getUsuariosPorCentro")
      .then(r => setChoferes((Array.isArray(r?.data) ? r.data : []).filter(u => u.role === "chofer")))
      .catch(() => base44.entities.User.list("full_name", 500)
        .then(us => setChoferes(us.filter(u => u.role === "chofer"))).catch(() => setChoferes([])));
    try {
      const res = await base44.functions.invoke("getEquiposPorCentro");
      const data = res.data || {};
      setEquipos((data.equipos || []).filter(e => esVehiculo(e.tipo)));
      setParches(data.parches || []);
    } catch {
      // Simulando rol la invocación de funciones está bloqueada; se cae a
      // lectura directa para que la pantalla siga mostrándose.
      const [eqs, pchs] = await Promise.all([
        base44.entities.Equipo.list("-updated_date", 500).catch(() => []),
        base44.entities.Parche.list("-updated_date", 500).catch(() => []),
      ]);
      setEquipos(eqs.filter(e => esVehiculo(e.tipo)));
      setParches(pchs);
    }
  }, []);

  useEffect(() => { reload().finally(() => setLoading(false)); }, [reload]);
  const { refreshing } = usePullToRefresh(reload, containerRef);

  /** ¿Esta ficha la mantiene Movilización? La ambulancia es de Calidad. */
  const puedeEditar = (eq) => !soloLectura && TIPOS_VEHICULO_CORPORATIVO.includes(eq.tipo);

  const asignacionDe = (eq) => asignaciones.find(a => a.equipo_id === eq.id) || null;

  /** Estado de la licencia de quien tiene el vehículo a cargo, si hay alguien.
   *  Se mira ACÁ y no solo al asignar: una licencia puede vencer despues, con
   *  la asignacion ya hecha, y eso es justo lo que hay que ver a tiempo. */
  const licenciaDelAsignado = (eq) => {
    const a = asignacionDe(eq);
    if (!a) return null;
    const c = choferes.find(x => x.id === a.chofer_id);
    return c ? estadoLicencia(c.licencia_vencimiento) : null;
  };

  const visibles = equipos.filter(e => {
    if (filtroGrupo === SOLO_CORPORATIVOS && !TIPOS_VEHICULO_CORPORATIVO.includes(e.tipo)) return false;
    if (filtroGrupo === SOLO_AMBULANCIAS && e.tipo !== "ambulancia") return false;
    if (filtroTipo !== "todos" && e.tipo !== filtroTipo) return false;
    if (filtroEstado !== "todos" && e.estado !== filtroEstado) return false;
    if (busqueda) {
      const b = busqueda.toLowerCase();
      return [e.patente, e.marca, e.modelo, e.numero_inventario, e.centro_principal]
        .some(v => (v || "").toLowerCase().includes(b));
    }
    return true;
  });

  const cuantas = (fn) => equipos.filter(fn).length;

  const conLicenciaCaida = equipos.filter(e => {
    const lic = licenciaDelAsignado(e);
    return lic && (lic.clave === "vencida" || lic.clave === "sin_datos");
  });

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
        <div className="relative max-w-6xl mx-auto flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
              style={{ background: "rgba(255,255,255,0.2)" }}>
              <Truck className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-amber-200 text-xs font-semibold uppercase tracking-widest">Flota</p>
              <h1 className="text-2xl lg:text-3xl font-bold text-white">Vehículos</h1>
              <p className="text-amber-100 text-sm mt-0.5">
                {cuantas(e => TIPOS_VEHICULO_CORPORATIVO.includes(e.tipo))} corporativos ·{" "}
                {(() => { const n = cuantas(e => e.tipo === "ambulancia");
                          return `${n} ${n === 1 ? "ambulancia" : "ambulancias"}`; })()}
              </p>
            </div>
          </div>
          {!soloLectura && (
            <button onClick={() => { setEquipoEditar(null); setShowForm(true); }}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold shadow"
              style={{ background: "rgba(255,255,255,0.2)", color: "white", border: "1px solid rgba(255,255,255,0.3)" }}>
              <Plus className="w-4 h-4" /> Nuevo vehículo
            </button>
          )}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 lg:px-10 pt-5 pb-10">
        {/* Un chofer puede quedar con la licencia vencida DESPUES de que se le
            asigno el vehiculo. El sistema no deshace la asignacion solo — eso
            dejaria un turno sin cubrir sin que nadie se entere — pero tampoco
            se queda callado. */}
        {conLicenciaCaida.length > 0 && (
          <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 mb-5">
            <AlertTriangle className="w-5 h-5 text-red-700 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm text-red-900">
                <strong>{conLicenciaCaida.length}</strong>{" "}
                {conLicenciaCaida.length === 1 ? "vehículo está asignado" : "vehículos están asignados"}
                {" "}a alguien que hoy no puede conducir.
              </p>
              <p className="text-xs text-red-700 mt-1">
                {conLicenciaCaida.map(e => e.patente || `${e.marca} ${e.modelo}`).join(" · ")}
                {" "}— la asignación sigue en pie hasta que la cambies.
              </p>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2 mb-5">
          {[
            { v: "todos", label: "Todos" },
            { v: SOLO_CORPORATIVOS, label: "Corporativos" },
            { v: SOLO_AMBULANCIAS, label: "Ambulancias" },
          ].map(f => (
            <button key={f.v} onClick={() => { setFiltroGrupo(f.v); setFiltroTipo("todos"); }}
              className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-colors ${
                filtroGrupo === f.v ? "bg-amber-700 text-white border-amber-700"
                                    : "bg-white text-slate-600 border-slate-200 hover:border-amber-300"}`}>
              {f.label}
            </button>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mb-5">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
              placeholder="Patente, marca, modelo o centro..."
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 text-sm bg-white
                         focus:outline-none focus:ring-2 focus:ring-amber-300" />
          </div>
          <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}
            className="px-3 py-2.5 rounded-xl border border-slate-200 text-sm bg-white
                       focus:outline-none focus:ring-2 focus:ring-amber-300">
            <option value="todos">Todos los estados</option>
            {ESTADOS_EQUIPO.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
          </select>
          <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}
            className="px-3 py-2.5 rounded-xl border border-slate-200 text-sm bg-white
                       focus:outline-none focus:ring-2 focus:ring-amber-300">
            <option value="todos">Todos los tipos</option>
            {TIPOS_EQUIPO.filter(t => TIPOS_VEHICULO.includes(t.value))
              .map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>

        {visibles.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-14 text-center">
            <Truck className="w-12 h-12 mx-auto text-slate-200 mb-3" />
            <p className="text-slate-500 font-medium">
              {equipos.length === 0
                ? "Todavía no hay vehículos cargados."
                : "Ningún vehículo coincide con lo que buscas."}
            </p>
            {equipos.length === 0 && !soloLectura && (
              <p className="text-sm text-slate-400 mt-1">
                Con «Nuevo vehículo» cargas la primera ficha.
              </p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {visibles.map(eq => (
              <div key={eq.id}>
                <EquipoCard
                  equipo={eq}
                  parches={parches.filter(p => p.equipo_id === eq.id && p.activo !== false)}
                  onClick={() => setEquipoDetalle(eq)}
                  onEdit={puedeEditar(eq)
                    ? () => { setEquipoEditar(eq); setShowForm(true); }
                    : undefined}
                />
                {/* Quien lo tiene a cargo. Va debajo de la tarjeta y no dentro
                    para no tocar EquipoCard, que Equipos comparte. */}
                {(() => {
                  const a = asignacionDe(eq);
                  const lic = licenciaDelAsignado(eq);
                  const problema = lic && (lic.clave === "vencida" || lic.clave === "sin_datos");
                  return (
                    <div className="mt-1.5 flex items-center justify-between gap-2 px-1">
                      <p className={`flex items-center gap-1.5 text-[11px] min-w-0 ${
                        problema ? "text-red-600 font-semibold" : "text-slate-400"}`}>
                        {a
                          ? <>{problema ? <AlertTriangle className="w-3 h-3 shrink-0" />
                                        : <UserCheck className="w-3 h-3 shrink-0" />}
                              <span className="truncate">{a.chofer_nombre}</span>
                              {problema && <span className="shrink-0">· {lic.clave === "vencida" ? "licencia vencida" : "sin licencia"}</span>}</>
                          : <><UserX className="w-3 h-3 shrink-0" /> Sin chofer asignado</>}
                      </p>
                      {!soloLectura && (
                        <button onClick={() => setAsignando({ equipo: eq, actual: a })}
                          className="text-[11px] font-semibold text-amber-700 hover:text-amber-900 shrink-0">
                          {a ? "Cambiar" : "Asignar"}
                        </button>
                      )}
                    </div>
                  );
                })()}

                {eq.tipo === "ambulancia" && (
                  <p className="flex items-center justify-center gap-1.5 mt-1 text-[11px] text-slate-400">
                    <Lock className="w-3 h-3" />
                    Su ficha la mantiene Calidad
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {asignando && (
        <AsignarChoferModal
          equipo={asignando.equipo}
          asignacionActual={asignando.actual}
          onClose={() => setAsignando(null)}
          onGuardado={reload}
        />
      )}

      {showForm && (
        <EquipoFormModal
          equipo={equipoEditar}
          onClose={() => { setShowForm(false); setEquipoEditar(null); }}
          onSaved={() => { setShowForm(false); setEquipoEditar(null); reload(); }}
          user={user}
        />
      )}
      {equipoDetalle && (
        <EquipoDetalleModal
          equipo={equipoDetalle}
          parches={parches.filter(p => p.equipo_id === equipoDetalle.id)}
          onClose={() => setEquipoDetalle(null)}
          onEdit={puedeEditar(equipoDetalle)
            ? () => { setEquipoEditar(equipoDetalle); setEquipoDetalle(null); setShowForm(true); }
            : undefined}
          onDeleted={() => { setEquipoDetalle(null); reload(); }}
          user={user}
          onActividadCreada={reload}
        />
      )}
    </div>
  );
}
