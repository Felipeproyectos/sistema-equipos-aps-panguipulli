import { useState, useEffect, useCallback, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { getCentrosEstructura } from "@/lib/centros";
import { Users as UsersIcon, Plus, Search, Stethoscope, Wrench, Shield, Building2 } from "lucide-react";
import usePullToRefresh from "@/hooks/usePullToRefresh";
import UsuarioCard from "@/components/usuarios/UsuarioCard";
import InviteUserModal from "@/components/usuarios/InviteUserModal";
import { ROLES, esRolSalud, esRolTaller, esSuperAdmin, rolesQuePuedeCrear, roleLabel } from "@/lib/roles";
import { useAuth } from "@/lib/AuthContext";
import { getEffectiveNavRole } from "@/lib/roleSimulator";

function getCentros(u) {
  const arr = Array.isArray(u.centros_asignados) ? u.centros_asignados : [];
  const legacy = u.centro_asignado ? [u.centro_asignado] : [];
  const principal = u.centro_principal ? [u.centro_principal] : [];
  return [...new Set([...principal, ...arr, ...legacy])].filter(Boolean);
}

function deriveArea(u) {
  if (u.area === "salud") return "salud";
  if (u.area === "taller") return "taller";
  if (u.area === "admin") return "admin";
  if (esRolTaller(u.role)) return "taller";
  if (u.role === ROLES.ADMIN || esSuperAdmin(u.role) || u.role === ROLES.MONITOR_CORPORATIVO) return "admin";
  if (esRolSalud(u.role)) return "salud";
  return "salud";
}

export default function Usuarios() {
  const { user: currentUser } = useAuth();
  const [usuarios, setUsuarios] = useState([]);
  const [centrosList, setCentrosList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("salud");
  const [centroFiltro, setCentroFiltro] = useState("todos");
  const [busqueda, setBusqueda] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const containerRef = useRef(null);

  const fetchData = useCallback(async () => {
    // Se usa una función de backend (asServiceRole + auth.me) porque la RLS
    // integrada de User solo permite listar a admins; los encargados de salud
    // quedaban en 0. La función aplica el scoping por rol/centro en el servidor.
    const [usersRes, centros] = await Promise.all([
      base44.functions.invoke('getUsuariosPorCentro').then(r => r.data || []).catch(() => []),
      getCentrosEstructura().catch(() => []),
    ]);
    setUsuarios(usersRes);
    setCentrosList(centros);
  }, []);

  useEffect(() => {
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  usePullToRefresh(fetchData, containerRef);

  // Acceso: super_admin (todos) · admin (solo Salud) · encargado_salud (solo su
  // centro, solo crea Usuario/Chofer) · jefe_taller (solo Taller, solo crea
  // Mecánico y Encargado Compras Taller).
  // Usar el rol efectivo (simulado si el admin/super_admin está probando)
  const effectiveRole = getEffectiveNavRole(currentUser?.role);
  const rolesConAcceso = [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.ENCARGADO_SALUD, ROLES.JEFE_TALLER];
  const canAccess = rolesConAcceso.includes(effectiveRole);
  const rolesCreables = rolesQuePuedeCrear(effectiveRole);
  const puedeInvitar = rolesCreables.length > 0;

  // Qué usuarios puede ver cada rol (además del control de acceso general):
  // - super_admin: todos
  // - admin: área salud completa
  // - encargado_salud: solo usuarios de su propio centro_principal
  // - jefe_taller: solo área taller
  const usuariosVisibles = usuarios.filter((u) => {
    // El super admin no se muestra a sí mismo en el listado de administradores
    if (esSuperAdmin(effectiveRole) && u.id === currentUser?.id) return false;
    if (esSuperAdmin(effectiveRole)) return true;
    if (effectiveRole === ROLES.ADMIN) return deriveArea(u) !== "taller";
    if (effectiveRole === ROLES.JEFE_TALLER) return deriveArea(u) === "taller";
    if (effectiveRole === ROLES.ENCARGADO_SALUD) {
      return deriveArea(u) === "salud" && getCentros(u).includes(currentUser.centro_principal);
    }
    return false;
  });

  // Clasificar usuarios por área derivada
  const porArea = (area) => usuariosVisibles.filter(u => deriveArea(u) === area);

  const tabsDisponibles = esSuperAdmin(effectiveRole)
    ? ["salud", "taller", "admin"]
    : effectiveRole === ROLES.ADMIN
    ? ["salud"]
    : effectiveRole === ROLES.ENCARGADO_SALUD
    ? ["salud"]
    : effectiveRole === ROLES.JEFE_TALLER
    ? ["taller"]
    : [];

  useEffect(() => {
    if (tabsDisponibles.length && !tabsDisponibles.includes(tab)) setTab(tabsDisponibles[0]);
     
  }, [currentUser]);

  const usuariosTab = porArea(tab);

  // Filtro por centro (solo aplica en tab salud)
  const filtrados = usuariosTab.filter(u => {
    const centrosU = getCentros(u);
    const matchCentro = tab !== "salud" || centroFiltro === "todos" || centrosU.includes(centroFiltro);
    const b = busqueda.toLowerCase();
    const matchBusqueda = !b || [u.full_name, u.email].some(v => (v || "").toLowerCase().includes(b));
    return matchCentro && matchBusqueda;
  });

  // Contar usuarios por centro para mostrar badges
  const usuariosSalud = porArea("salud");
  const countPorCentro = (nombre) => usuariosSalud.filter(u => getCentros(u).includes(nombre)).length;

  const handleUpdated = (id, update) => {
    setUsuarios(prev => prev.map(u => u.id === id ? { ...u, ...update } : u));
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

  const TABS = [
    { v: "salud", l: "Salud", icon: Stethoscope, color: "#059669", count: porArea("salud").length },
    { v: "taller", l: "Taller", icon: Wrench, color: "#ea580c", count: porArea("taller").length },
    { v: "admin", l: "Administración", icon: Shield, color: "#2563EB", count: porArea("admin").length },
  ].filter(t => tabsDisponibles.includes(t.v));

  return (
    <div ref={containerRef} className="min-h-screen bg-slate-50" style={{ overscrollBehavior: "none" }}>
      {/* Header */}
      <div className="relative overflow-hidden px-4 lg:px-10 pt-6 lg:pt-12 pb-6 lg:pb-8"
        style={{ background: "linear-gradient(135deg, #1e293b 0%, #334155 100%)" }}>
        <div className="relative max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(255,255,255,0.15)" }}>
              <UsersIcon className="w-5 h-5 lg:w-6 lg:h-6 text-white" />
            </div>
            <div>
              <p className="text-slate-300 text-[10px] lg:text-xs font-semibold uppercase tracking-widest hidden sm:block">{roleLabel(effectiveRole)}</p>
              <h1 className="text-xl lg:text-3xl font-bold text-white leading-tight">Gestión de Usuarios</h1>
              <p className="text-slate-400 text-xs lg:text-sm mt-0.5">{usuariosVisibles.length} usuarios visibles</p>
            </div>
          </div>
          {puedeInvitar && (
            <button
              onClick={() => setModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:scale-105 flex-shrink-0"
              style={{ background: "#2563EB" }}
            >
              <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Invitar</span>
            </button>
          )}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 lg:px-10 pb-10">
        {/* Tabs de área */}
        {TABS.length > 1 && (
          <div className="grid gap-2 mb-4 -mt-2" style={{ gridTemplateColumns: `repeat(${TABS.length}, minmax(0,1fr))` }}>
            {TABS.map(t => {
              const Icon = t.icon;
              const active = tab === t.v;
              return (
                <button
                  key={t.v}
                  onClick={() => { setTab(t.v); setCentroFiltro("todos"); }}
                  className="flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold transition-all"
                  style={active
                    ? { background: "white", color: t.color, boxShadow: "0 4px 14px rgba(0,0,0,0.08)" }
                    : { background: "rgba(255,255,255,0.5)", color: "#64748B" }}
                >
                  <Icon className="w-4 h-4" />
                  <span className="hidden sm:inline">{t.l}</span>
                  <span className="px-1.5 py-0.5 rounded-full text-xs font-bold" style={active ? { background: `${t.color}15`, color: t.color } : { background: "#E2E8F0", color: "#94A3B8" }}>
                    {t.count}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Buscador */}
        <div className="relative mb-4">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre o correo..."
            className="w-full bg-white rounded-xl pl-10 pr-4 py-2.5 text-sm border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        </div>

        {/* Filtro por centro (solo tab salud, y solo si el rol ve más de un centro) */}
        {tab === "salud" && esSuperAdmin(effectiveRole) || (tab === "salud" && effectiveRole === ROLES.ADMIN) ? (
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">
              <Building2 className="w-3.5 h-3.5" /> Filtrar por centro
            </div>
            <div className="flex gap-2 overflow-x-auto pb-2">
              <button
                onClick={() => setCentroFiltro("todos")}
                className="px-3.5 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all"
                style={centroFiltro === "todos" ? { background: "#1E293B", color: "white" } : { background: "white", color: "#64748B", border: "1px solid #E2E8F0" }}
              >
                Todos ({usuariosSalud.length})
              </button>
              {centrosList.map(c => (
                <button
                  key={c.nombre}
                  onClick={() => setCentroFiltro(c.nombre)}
                  className="px-3.5 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all"
                  style={centroFiltro === c.nombre ? { background: "#1E293B", color: "white" } : { background: "white", color: "#64748B", border: "1px solid #E2E8F0" }}
                >
                  {c.nombre} ({countPorCentro(c.nombre)})
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {/* Lista de usuarios */}
        {filtrados.length === 0 ? (
          <div className="bg-white rounded-2xl p-10 text-center">
            <UsersIcon className="w-10 h-10 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-400 text-sm">No hay usuarios en esta categoría.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {filtrados
              .slice()
              .sort((a, b) => {
                const prio = (u) => u.estado_acceso === "pendiente" ? 0 : u.estado_acceso === "rechazado" ? 1 : 2;
                if (prio(a) !== prio(b)) return prio(a) - prio(b);
                return (a.full_name || "").localeCompare(b.full_name || "");
              })
              .map(u => (
              <UsuarioCard key={u.id} usuario={u} currentUser={currentUser} onUpdated={handleUpdated} />
            ))}
          </div>
        )}
      </div>

      <InviteUserModal open={modalOpen} onClose={() => setModalOpen(false)} onInvited={fetchData} currentUser={currentUser} />
    </div>
  );
}