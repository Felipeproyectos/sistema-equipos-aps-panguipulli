import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { getCentrosEstructura } from "@/lib/centros";
import {
  Users as UsersIcon, Plus, Search, Stethoscope, Wrench, Shield, Truck, UserX, ShieldCheck, AlertTriangle, X,
} from "lucide-react";
import usePullToRefresh from "@/hooks/usePullToRefresh";
import UsuarioCard from "@/components/usuarios/UsuarioCard";
import InviteUserModal from "@/components/usuarios/InviteUserModal";
import DiagnosticoAcceso from "@/components/usuarios/DiagnosticoAcceso";
import NormalizarUsuarios from "@/components/usuarios/NormalizarUsuarios";
import { ROLES, rolesQuePuedeCrear, roleLabel } from "@/lib/roles";
import { AREAS, areaDeUsuario, centrosDe, coincide, gruposPorRol, pendientesDe, visiblesPara } from "@/lib/organizacionUsuarios";
import { useAuth } from "@/lib/AuthContext";
import { getEffectiveNavRole, isSimulandoActivo } from "@/lib/roleSimulator";

// Gestión de Usuarios, ordenada por área de trabajo y, dentro de cada área,
// por rol con lo que hace cada uno (src/lib/organizacionUsuarios.js). Manda el
// rol: una cuenta aparece donde sus permisos dicen que trabaja.

const ICONOS = { direccion: Shield, salud: Stethoscope, movilizacion: Truck, taller: Wrench, sin_rol: UserX };
const sombra = { boxShadow: "0 4px 14px rgba(15,23,42,0.06)" };

export default function Usuarios() {
  const { user: currentUser } = useAuth();
  const [usuarios, setUsuarios] = useState([]);
  const [centrosList, setCentrosList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [area, setArea] = useState(null);
  const [rolFiltro, setRolFiltro] = useState("todos");
  const [centroFiltro, setCentroFiltro] = useState("todos");
  const [soloPendientes, setSoloPendientes] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [diagOpen, setDiagOpen] = useState(false);
  const containerRef = useRef(null);

  const fetchData = useCallback(async () => {
    // Por el servidor (getUsuariosPorCentro): la RLS de `usuario` solo deja
    // listar a la administración, y el servidor aplica el alcance de cada rol.
    const [usersRes, centros] = await Promise.all([
      base44.functions.invoke("getUsuariosPorCentro").then(r => r.data || []).catch(() => []),
      getCentrosEstructura().catch(() => []),
    ]);
    setUsuarios(usersRes);
    setCentrosList(centros);
  }, []);

  useEffect(() => { fetchData().finally(() => setLoading(false)); }, [fetchData]);
  usePullToRefresh(fetchData, containerRef);

  // Rol efectivo: con "Simular Rol" se ve lo que ve ese perfil.
  const effectiveRole = getEffectiveNavRole(currentUser?.role);
  const canAccess = [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.ENCARGADO_SALUD, ROLES.JEFE_TALLER].includes(effectiveRole);
  const puedeInvitar = rolesQuePuedeCrear(effectiveRole).length > 0;
  const puedeAdministrarAcceso = [ROLES.SUPER_ADMIN, ROLES.ADMIN].includes(effectiveRole);

  const visibles = useMemo(() => visiblesPara(usuarios, currentUser, effectiveRole), [usuarios, currentUser, effectiveRole]);
  const areas = useMemo(() => AREAS
    .map(a => ({ ...a, usuarios: visibles.filter(u => areaDeUsuario(u) === a.clave) }))
    .filter(a => a.usuarios.length || (a.clave !== "sin_rol" && effectiveRole === ROLES.SUPER_ADMIN)),
  [visibles, effectiveRole]);
  const conPendientes = visibles.filter(u => pendientesDe(u).length);

  // Se abre en el área con más cuentas: es donde más se trabaja.
  const masPoblada = [...areas].filter(a => a.clave !== "sin_rol").sort((x, y) => y.usuarios.length - x.usuarios.length)[0] || areas[0];
  const activa = area && areas.some(a => a.clave === area) ? area : masPoblada?.clave;
  const buscando = busqueda.trim().length > 0;

  const filtrar = (lista) => lista.filter(u =>
    coincide(u, busqueda)
    && (rolFiltro === "todos" || u.role === rolFiltro)
    && (centroFiltro === "todos" || centrosDe(u).includes(centroFiltro))
    && (!soloPendientes || pendientesDe(u).length));

  // Buscando se recorren todas las áreas; si no, solo la elegida.
  const secciones = (buscando || soloPendientes ? areas : areas.filter(a => a.clave === activa))
    .map(a => ({ ...a, grupos: gruposPorRol(filtrar(a.usuarios), a.clave) }))
    .filter(a => a.grupos.length);
  const areaActiva = areas.find(a => a.clave === activa);
  const centrosDelArea = [...new Set((areaActiva?.usuarios || []).flatMap(centrosDe))].sort();
  const totalMostrado = secciones.reduce((n, a) => n + a.grupos.reduce((m, g) => m + g.usuarios.length, 0), 0);

  const elegirArea = (clave) => { setArea(clave); setRolFiltro("todos"); setCentroFiltro("todos"); };

  // `update === null`: la ficha se eliminó y sale de la lista.
  const handleUpdated = (id, update) => {
    if (update === null) { setUsuarios(prev => prev.filter(u => u.id !== id)); return; }
    setUsuarios(prev => prev.map(u => (u.id === id ? { ...u, ...update } : u)));
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!canAccess) return (
    <div className="flex items-center justify-center min-h-screen px-6">
      <div className="text-center">
        <Shield className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-500 font-medium">Acceso restringido</p>
        <p className="text-slate-400 text-sm mt-1">No tienes permiso para gestionar cuentas</p>
      </div>
    </div>
  );

  return (
    <div ref={containerRef} className="min-h-screen bg-slate-50" style={{ overscrollBehavior: "none" }}>
      <div className="relative overflow-hidden px-4 lg:px-10 pt-6 lg:pt-12 pb-6 lg:pb-8" style={{ background: "linear-gradient(135deg, #1e293b 0%, #334155 100%)" }}>
        <div className="relative max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(255,255,255,0.15)" }}>
              <UsersIcon className="w-5 h-5 lg:w-6 lg:h-6 text-white" />
            </div>
            <div>
              <p className="text-slate-300 text-[10px] lg:text-xs font-semibold uppercase tracking-widest hidden sm:block">{roleLabel(effectiveRole)}</p>
              <h1 className="text-xl lg:text-3xl font-bold text-white leading-tight">Gestión de Usuarios</h1>
              <p className="text-slate-400 text-xs lg:text-sm mt-0.5">
                {visibles.length} cuentas · {areas.filter(a => a.usuarios.length).length} áreas
                {conPendientes.length > 0 && <> · <span className="text-amber-300">{conPendientes.length} con datos pendientes</span></>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {puedeAdministrarAcceso && (
              <button onClick={() => setDiagOpen(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold"
                style={{ background: "rgba(255,255,255,0.15)", color: "white", border: "1px solid rgba(255,255,255,0.25)" }}>
                <ShieldCheck className="w-4 h-4" /> <span className="hidden sm:inline">Revisar acceso</span>
              </button>
            )}
            {puedeInvitar && (
              <button onClick={() => setModalOpen(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: "#2563EB" }}>
                <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Nueva cuenta</span>
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 lg:px-10 pt-4 lg:pt-6 pb-10 space-y-4">
        {/* Cuentas con el área guardada distinta de la de su rol. No mientras
            se simula otro rol: ahí las escrituras están bloqueadas. */}
        {puedeAdministrarAcceso && !isSimulandoActivo() && (
          <NormalizarUsuarios usuarios={visibles} onCompleto={fetchData} currentUser={currentUser} />
        )}

        {/* Las áreas: cuántas cuentas y de qué rol */}
        {areas.length > 1 && (
          <div className={`grid grid-cols-1 sm:grid-cols-2 gap-3 ${areas.length >= 5 ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}>
            {areas.map(a => {
              const Icono = ICONOS[a.clave];
              const sel = !buscando && !soloPendientes && a.clave === activa;
              const porRol = gruposPorRol(a.usuarios, a.clave);
              return (
                <button key={a.clave} type="button" onClick={() => { elegirArea(a.clave); setBusqueda(""); setSoloPendientes(false); }}
                  aria-pressed={sel}
                  className="text-left bg-white rounded-2xl p-4 border-2 transition-all hover:-translate-y-0.5"
                  style={{ ...sombra, borderColor: sel ? a.color : "transparent" }}>
                  <div className="flex items-center gap-2">
                    <span className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${a.color}15` }}>
                      <Icono className="w-4 h-4" style={{ color: a.color }} />
                    </span>
                    <span className="font-bold text-slate-800 text-sm leading-tight flex-1">{a.titulo}</span>
                    <span className="text-xl font-bold" style={{ color: a.color }}>{a.usuarios.length}</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-2 leading-snug">
                    {porRol.length ? porRol.map(g => `${g.usuarios.length} ${g.etiqueta}`).join(" · ") : "Sin cuentas todavía"}
                  </p>
                </button>
              );
            })}
          </div>
        )}

        {/* Buscar y filtrar */}
        <div className="bg-white rounded-2xl p-3 space-y-3" style={sombra}>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
                placeholder="Buscar en todas las áreas: nombre, correo, rol o centro..."
                className="w-full bg-white rounded-xl pl-10 pr-9 py-2.5 text-sm border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300" />
              {buscando && (
                <button type="button" onClick={() => setBusqueda("")} aria-label="Limpiar búsqueda" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"><X className="w-4 h-4" /></button>
              )}
            </div>
            {!buscando && !soloPendientes && centrosDelArea.length > 1 && (
              <select value={centroFiltro} onChange={e => setCentroFiltro(e.target.value)} className="bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm">
                <option value="todos">Todos los centros</option>
                {(centrosList.length ? centrosList.map(c => c.nombre).filter(n => centrosDelArea.includes(n)) : centrosDelArea)
                  .map(c => <option key={c} value={c}>{c} ({areaActiva.usuarios.filter(u => centrosDe(u).includes(c)).length})</option>)}
              </select>
            )}
            {conPendientes.length > 0 && (
              <button type="button" onClick={() => setSoloPendientes(s => !s)} aria-pressed={soloPendientes}
                className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-semibold border"
                style={soloPendientes ? { background: "#fffbeb", borderColor: "#f59e0b", color: "#92400e" } : { background: "white", borderColor: "#e2e8f0", color: "#64748b" }}>
                <AlertTriangle className="w-4 h-4" /> Datos pendientes ({conPendientes.length})
              </button>
            )}
          </div>
          {!buscando && !soloPendientes && areaActiva && gruposPorRol(areaActiva.usuarios, activa).length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-0.5">
              {[{ role: "todos", etiqueta: "Todos los roles", n: areaActiva.usuarios.length },
                ...gruposPorRol(areaActiva.usuarios, activa).map(g => ({ role: g.role, etiqueta: g.etiqueta, n: g.usuarios.length }))].map(r => (
                <button key={r.role} type="button" onClick={() => setRolFiltro(r.role)} aria-pressed={rolFiltro === r.role}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap flex-shrink-0"
                  style={rolFiltro === r.role ? { background: areaActiva.color, color: "white" } : { background: "#f8fafc", color: "#475569", border: "1px solid #e2e8f0" }}>
                  {r.etiqueta} ({r.n})
                </button>
              ))}
            </div>
          )}
          {(buscando || soloPendientes) && (
            <p className="text-xs text-slate-500 px-1">
              {totalMostrado} {totalMostrado === 1 ? "cuenta" : "cuentas"} {buscando ? `para «${busqueda.trim()}»` : "con datos pendientes"} en todas las áreas
            </p>
          )}
        </div>

        {/* Las cuentas, por área y rol */}
        {secciones.length === 0 ? (
          <div className="bg-white rounded-2xl p-10 text-center" style={sombra}>
            <UsersIcon className="w-10 h-10 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-400 text-sm">{buscando ? "Ninguna cuenta coincide con la búsqueda." : "No hay cuentas en esta área."}</p>
            {areaActiva && !buscando && <p className="text-slate-400 text-xs mt-1">{areaActiva.descripcion}</p>}
          </div>
        ) : secciones.map(a => (
          <section key={a.clave} className="space-y-3">
            {(buscando || soloPendientes) ? (
              <h2 className="text-sm font-bold uppercase tracking-wide pt-1" style={{ color: a.color }}>{a.titulo}</h2>
            ) : (
              <p className="text-xs text-slate-500 px-1">{a.descripcion}</p>
            )}
            {a.grupos.map(g => (
              <div key={g.role || "sin_rol"} className="bg-white/60 rounded-2xl border border-slate-100 p-3">
                <div className="flex items-start gap-2 px-1 mb-2.5">
                  <span className="w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: a.color }} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-800">{g.etiqueta} <span className="text-slate-400 font-semibold">({g.usuarios.length})</span></p>
                    {g.queHace && <p className="text-xs text-slate-500 leading-snug">{g.queHace}</p>}
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {g.usuarios.map(u => (
                    <UsuarioCard key={u.id} usuario={u} currentUser={currentUser} onUpdated={handleUpdated} pendientes={pendientesDe(u)} />
                  ))}
                </div>
              </div>
            ))}
          </section>
        ))}
      </div>

      <InviteUserModal open={modalOpen} onClose={() => setModalOpen(false)} onInvited={fetchData} currentUser={currentUser} />
      {diagOpen && <DiagnosticoAcceso onClose={() => setDiagOpen(false)} onCambios={fetchData} />}
    </div>
  );
}
