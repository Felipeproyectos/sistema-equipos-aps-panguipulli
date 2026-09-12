import { useState, useEffect, useCallback, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Monitor, Plus, Search, Filter, RefreshCw } from "lucide-react";
import usePullToRefresh from "@/hooks/usePullToRefresh";
import { getCentrosEstructura, TIPOS_EQUIPO, ESTADOS_EQUIPO, resolverUbicacion } from "@/lib/centros";
import EquipoCard from "@/components/equipos2/EquipoCard";
import EquipoFormModal from "@/components/equipos2/EquipoFormModal";
import EquipoDetalleModal from "@/components/equipos2/EquipoDetalleModal";
import { useAuth } from "@/lib/AuthContext";

// Valor centinela: equipos que estan en el centro mismo, sin subsede.
const SIN_SUBSEDE = "__sin_subsede__";

export default function Equipos2() {
  const { user } = useAuth();
  const [equipos, setEquipos] = useState([]);
  const [parches, setParches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [centroSeleccionado, setCentroSeleccionado] = useState(null);
  const [subsedeSeleccionada, setSubsedeSeleccionada] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [showForm, setShowForm] = useState(false);
  const [equipoEditar, setEquipoEditar] = useState(null);
  const [equipoDetalle, setEquipoDetalle] = useState(null);
  const containerRef = useRef(null);

  const reload = useCallback(async () => {
    // Se usa una función de backend (asServiceRole + auth.me) en lugar de
    // Equipo.list()/Parche.list(), porque las plantillas RLS no resuelven
    // centro_principal (campo personalizado) para encargados de salud.
    try {
      const res = await base44.functions.invoke('getEquiposPorCentro');
      const data = res.data || {};
      setEquipos(data.equipos || []);
      setParches(data.parches || []);
    } catch (e) {
      // En modo "Simular Rol" (solo lectura) o ante error de red, la invocación
      // de funciones se bloquea: caemos a lectura directa de entidades para
      // que la página siga renderizando en lugar de romper.
      const [eqs, pchs] = await Promise.all([
        base44.entities.Equipo.list("-updated_date", 500).catch(() => []),
        base44.entities.Parche.list("-updated_date", 500).catch(() => []),
      ]);
      setEquipos(eqs);
      setParches(pchs);
    }
  }, []);

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, [reload]);

  const { refreshing } = usePullToRefresh(reload, containerRef);

  // Quien ve todos los centros. Antes esto era `user.role === "admin"`, un rol
  // que ningun usuario tiene: el selector de centro no lo veia nadie, ni el
  // super_admin. El resto ve solo sus centros_asignados.
  const veTodosLosCentros = ["super_admin", "admin", "monitor_corporativo"].includes(user?.role);
  const centrosAsignados = user?.centros_asignados?.length > 0 ? user.centros_asignados : null;
  const centrosPermitidos = veTodosLosCentros ? null : centrosAsignados;

  const [centrosEstructura, setCentrosEstructura] = useState([]);
  useEffect(() => { getCentrosEstructura().then(setCentrosEstructura); }, []);

  const centrosVisibles = veTodosLosCentros
    ? centrosEstructura
    : centrosEstructura.filter(c => centrosAsignados?.includes(c.nombre));

  // Con un solo centro asignado no se muestra el selector, pero igual hay que
  // fijarlo: si no, `centroSeleccionado` queda en null y el filtro por subsede
  // nunca aparece — que es justo el caso del encargado_salud.
  useEffect(() => {
    if (!centroSeleccionado && !veTodosLosCentros && centrosVisibles.length === 1) {
      setCentroSeleccionado(centrosVisibles[0].nombre);
    }
  }, [centrosVisibles, veTodosLosCentros, centroSeleccionado]);

  const centroSeleccionadoObj = centroSeleccionado
    ? centrosEstructura.find(c => c.nombre === centroSeleccionado)
    : null;
  const subsedesDelCentro = centroSeleccionadoObj?.subsedes || [];

  const elegirCentro = (nombre) => { setCentroSeleccionado(nombre); setSubsedeSeleccionada(null); };

  const equiposFiltrados = equipos.filter(e => {
    // Un equipo cargado con un CECOSF como centro principal pertenece al CESFAM
    // del que depende: se ubica ahí aunque su ficha todavía diga otra cosa.
    const ubic = resolverUbicacion(e.centro_principal, e.subsede);
    if (centrosPermitidos && !centrosPermitidos.includes(ubic.centro)) return false;
    if (centroSeleccionado) {
      const enCentro = ubic.centro === centroSeleccionado;
      const enSubsede = subsedesDelCentro.includes(ubic.subsede);
      if (!enCentro && !enSubsede) return false;
    }
    // SIN_SUBSEDE = el equipo esta en el centro base, no en una posta/CECOSF.
    if (subsedeSeleccionada === SIN_SUBSEDE) { if (ubic.subsede) return false; }
    else if (subsedeSeleccionada && ubic.subsede !== subsedeSeleccionada) return false;
    if (filtroEstado !== "todos" && e.estado !== filtroEstado) return false;
    if (filtroTipo !== "todos" && e.tipo !== filtroTipo) return false;
    if (busqueda) {
      const b = busqueda.toLowerCase();
      return (e.numero_inventario || "").toLowerCase().includes(b) ||
        (e.marca || "").toLowerCase().includes(b) ||
        (e.modelo || "").toLowerCase().includes(b) ||
        (ubic.subsede || "").toLowerCase().includes(b);
    }
    return true;
  });

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div ref={containerRef} className="min-h-screen" style={{ background: "#e8f4fd", overscrollBehavior: "none" }}>
      {refreshing && (
        <div className="flex items-center justify-center py-3 lg:hidden">
          <RefreshCw className="w-5 h-5 text-blue-500 animate-spin" />
        </div>
      )}
      {/* Header */}
      <div className="relative overflow-hidden px-6 lg:px-10 pt-10 pb-8" style={{ background: "linear-gradient(135deg, #0f2d6b 0%, #1565c0 40%, #29b6f6 100%)" }}>
        <div className="relative max-w-6xl mx-auto flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: "rgba(255,255,255,0.2)" }}>
              <Monitor className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-cyan-200 text-xs font-semibold uppercase tracking-widest">Inventario</p>
              <h1 className="text-3xl font-bold text-white">Equipos Médicos</h1>
              <p className="text-blue-100 text-sm mt-0.5">
                {centroSeleccionado ? centroSeleccionado : "Todos los centros"}
                {subsedeSeleccionada === SIN_SUBSEDE ? " › en el centro"
                  : subsedeSeleccionada ? ` › ${subsedeSeleccionada}` : ""}
                {" · "}{equiposFiltrados.length} equipo(s)
              </p>
            </div>
          </div>
          <button
            onClick={() => { setEquipoEditar(null); setShowForm(true); }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold shadow"
            style={{ background: "rgba(255,255,255,0.2)", color: "white", border: "1px solid rgba(255,255,255,0.3)" }}
          >
            <Plus className="w-4 h-4" /> Nuevo Equipo
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 lg:px-10 pt-6 pb-10">
        {/* Centro y subsede: los dos niveles de ubicacion. Se muestra cuando hay
            mas de un centro que elegir; con uno solo el selector seria ruido. */}
        {centrosVisibles.length > 1 && (
          <div className="bg-white rounded-2xl shadow p-5 mb-6">
            <p className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
              <Filter className="w-4 h-4 text-blue-500" /> Centro Principal
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => elegirCentro(null)}
                className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${!centroSeleccionado ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:border-blue-300"}`}
              >
                Todos
              </button>
              {centrosVisibles.map(c => (
                <button
                  key={c.nombre}
                  onClick={() => elegirCentro(c.nombre)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${centroSeleccionado === c.nombre ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:border-blue-300"}`}
                >
                  {c.nombre}
                </button>
              ))}
            </div>
          </div>
        )}

        {centroSeleccionado && subsedesDelCentro.length > 0 && (
          <div className="bg-white rounded-2xl shadow p-5 mb-6">
            <p className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
              <Filter className="w-4 h-4 text-cyan-500" /> Subsede de {centroSeleccionado}
            </p>
            <div className="flex flex-wrap gap-2">
              {[
                { valor: null, label: "Todas" },
                { valor: SIN_SUBSEDE, label: `En ${centroSeleccionado}` },
                ...subsedesDelCentro.map(s => ({ valor: s, label: s })),
              ].map(({ valor, label }) => (
                <button
                  key={label}
                  onClick={() => setSubsedeSeleccionada(valor)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${subsedeSeleccionada === valor ? "bg-cyan-600 text-white border-cyan-600" : "bg-white text-slate-600 border-slate-200 hover:border-cyan-300"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Filtros */}
        <div className="bg-white rounded-2xl shadow p-4 mb-6 flex flex-wrap gap-3 items-center">
          <div className="flex-1 min-w-48 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por inventario, marca, modelo..."
              className="w-full pl-10 pr-4 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-300"
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
            />
          </div>
          <select
            value={filtroEstado}
            onChange={e => setFiltroEstado(e.target.value)}
            className="px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-300"
          >
            <option value="todos">Todos los estados</option>
            {ESTADOS_EQUIPO.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
          </select>
          <select
            value={filtroTipo}
            onChange={e => setFiltroTipo(e.target.value)}
            className="px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-300"
          >
            <option value="todos">Todos los tipos</option>
            {TIPOS_EQUIPO.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>

        {/* Grid de equipos */}
        {equiposFiltrados.length === 0 ? (
          <div className="text-center py-20 text-slate-400 bg-white rounded-2xl shadow">
            <Monitor className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p className="text-lg font-medium">No se encontraron equipos</p>
            <p className="text-sm mt-1">Intenta cambiar los filtros o agrega un nuevo equipo</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {equiposFiltrados.map(equipo => (
              <EquipoCard
                key={equipo.id}
                equipo={equipo}
                parches={parches.filter(p => p.equipo_id === equipo.id && p.activo !== false)}
                onClick={() => setEquipoDetalle(equipo)}
                onEdit={() => { setEquipoEditar(equipo); setShowForm(true); }}
              />
            ))}
          </div>
        )}
      </div>

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
          onEdit={() => { setEquipoEditar(equipoDetalle); setEquipoDetalle(null); setShowForm(true); }}
          onDeleted={() => { setEquipoDetalle(null); reload(); }}
          user={user}
          onActividadCreada={reload}
        />
      )}
    </div>
  );
}