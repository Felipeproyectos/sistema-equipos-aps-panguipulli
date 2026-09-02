import { useEffect, useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { ScrollText, ShieldCheck, ShieldX, Clock, Monitor, User, LogIn, History } from "lucide-react";
import { ROLES, roleLabel } from "@/lib/roles";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useAuth } from "@/lib/AuthContext";

const RESULTADO_CONFIG = {
  exitoso: { label: "Ingreso exitoso", color: "#16A34A", bg: "#F0FDF4", border: "#BBF7D0", icon: ShieldCheck },
  no_autorizado: { label: "No autorizado", color: "#DC2626", bg: "#FEF2F2", border: "#FECACA", icon: ShieldX },
  rechazado: { label: "Rechazado", color: "#DC2626", bg: "#FEF2F2", border: "#FECACA", icon: ShieldX },
  bloqueado: { label: "Bloqueado", color: "#B91C1C", bg: "#FEF2F2", border: "#FCA5A5", icon: ShieldX },
  pendiente: { label: "Pendiente", color: "#CA8A04", bg: "#FEFCE8", border: "#FEF08A", icon: Clock },
};

const ACCION_CONFIG = {
  crear: { label: "Creó", color: "#16A34A", bg: "#F0FDF4" },
  editar: { label: "Editó", color: "#2563EB", bg: "#EFF6FF" },
  eliminar: { label: "Eliminó", color: "#DC2626", bg: "#FEF2F2" },
};

export default function Auditoria() {
  const { user } = useAuth();
  const [tab, setTab] = useState("ingresos");
  const [accesos, setAccesos] = useState([]);
  const [acciones, setAcciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroResultado, setFiltroResultado] = useState("todos");
  const [filtroRol, setFiltroRol] = useState("todos");

  useEffect(() => {
    Promise.all([
      base44.entities.AccesoNoAutorizado.list("-fecha_intento", 200),
      base44.entities.Historial.list("-fecha", 200),
    ]).then(([a, h]) => {
      setAccesos(a || []);
      setAcciones(h || []);
    }).finally(() => setLoading(false));
  }, []);

  const esBase = user?.role === ROLES.SUPER_ADMIN;

  const accesosFiltrados = useMemo(
    () => filtroResultado === "todos" ? accesos : accesos.filter(a => (a.resultado || "no_autorizado") === filtroResultado),
    [accesos, filtroResultado]
  );

  const accionesFiltradas = useMemo(
    () => filtroRol === "todos" ? acciones : acciones.filter(a => (a.usuario_rol || "") === filtroRol),
    [acciones, filtroRol]
  );

  const conteoPorRol = useMemo(() => {
    const map = {};
    acciones.forEach(a => { const r = a.usuario_rol || "sin_rol"; map[r] = (map[r] || 0) + 1; });
    return map;
  }, [acciones]);

  if (!loading && !esBase) {
    return (
      <div className="flex items-center justify-center min-h-screen px-6">
        <div className="text-center">
          <ShieldX className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">Acceso restringido</p>
          <p className="text-slate-400 text-sm mt-1">El módulo de auditoría es exclusivo de Base del Sistema.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: "linear-gradient(135deg, #6366f1, #4f46e5)" }}>
          <ScrollText className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-800">Auditoría del Sistema</h1>
          <p className="text-sm text-slate-500">Quién ingresa al sistema y qué hace cada perfil</p>
        </div>
      </div>

      <div className="flex gap-2 mb-5">
        <TabButton active={tab === "ingresos"} onClick={() => setTab("ingresos")} icon={LogIn} label="Ingresos al Sistema" count={accesos.length} />
        <TabButton active={tab === "acciones"} onClick={() => setTab("acciones")} icon={History} label="Acciones por Perfil" count={acciones.length} />
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
        </div>
      ) : tab === "ingresos" ? (
        <IngresosTab accesos={accesosFiltrados} filtro={filtroResultado} setFiltro={setFiltroResultado} />
      ) : (
        <AccionesTab acciones={accionesFiltradas} filtro={filtroRol} setFiltro={setFiltroRol} conteoPorRol={conteoPorRol} />
      )}
    </div>
  );
}

function TabButton({ active, onClick, icon: Icon, label, count }) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${active ? "text-white shadow-sm" : "bg-white text-slate-500 border border-slate-200 hover:bg-slate-50"}`}
      style={active ? { background: "linear-gradient(135deg, #6366f1, #4f46e5)" } : {}}>
      <Icon className="w-4 h-4" />
      {label}
      <span className={`ml-1 text-xs px-2 py-0.5 rounded-full ${active ? "bg-white/20" : "bg-slate-100"}`}>{count}</span>
    </button>
  );
}

function IngresosTab({ accesos, filtro, setFiltro }) {
  const resultados = ["todos", "exitoso", "no_autorizado", "rechazado", "bloqueado", "pendiente"];
  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4">
        {resultados.map(r => (
          <button key={r} onClick={() => setFiltro(r)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${filtro === r ? "text-white" : "bg-white text-slate-500 border border-slate-200 hover:bg-slate-50"}`}
            style={filtro === r ? { background: "#4f46e5" } : {}}>
            {r === "todos" ? "Todos" : RESULTADO_CONFIG[r]?.label || r}
          </button>
        ))}
      </div>

      {accesos.length === 0 ? (
        <EmptyState icon={LogIn} text="Sin registros de ingreso" />
      ) : (
        <div className="space-y-2">
          {accesos.map(a => {
            const res = RESULTADO_CONFIG[a.resultado || "no_autorizado"] || RESULTADO_CONFIG.no_autorizado;
            const ResIcon = res.icon;
            return (
              <div key={a.id} className="bg-white rounded-xl p-4 flex items-start gap-3 border border-slate-100">
                <div className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center"
                  style={{ background: res.bg, border: `1px solid ${res.border}` }}>
                  <ResIcon className="w-4 h-4" style={{ color: res.color }} />
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-slate-700">{a.usuario_nombre || a.email}</span>
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full"
                      style={{ background: res.bg, color: res.color, border: `1px solid ${res.border}` }}>
                      {res.label}
                    </span>
                    {a.rol && a.rol !== "user" && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{roleLabel(a.rol)}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-3 h-3 text-slate-400" />
                    <span className="text-xs text-slate-400">
                      {a.fecha_intento ? format(new Date(a.fecha_intento), "d MMM yyyy · HH:mm", { locale: es }) : "—"}
                    </span>
                  </div>
                  {a.user_agent && (
                    <div className="flex items-center gap-2">
                      <Monitor className="w-3 h-3 text-slate-400" />
                      <span className="text-xs text-slate-400 truncate">{a.user_agent}</span>
                    </div>
                  )}
                  {a.notas && <p className="text-xs text-slate-400 italic">{a.notas}</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AccionesTab({ acciones, filtro, setFiltro, conteoPorRol }) {
  const roles = ["todos", ...Object.values(ROLES)];
  return (
    <div>
      {Object.keys(conteoPorRol).length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 mb-4">
          {Object.entries(conteoPorRol).map(([rol, count]) => (
            <div key={rol} className="bg-white rounded-xl p-3 border border-slate-100">
              <p className="text-xs text-slate-400">{rol === "sin_rol" ? "Sin rol" : roleLabel(rol)}</p>
              <p className="text-lg font-bold text-slate-700">{count}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-4">
        {roles.map(r => (
          <button key={r} onClick={() => setFiltro(r)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${filtro === r ? "text-white" : "bg-white text-slate-500 border border-slate-200 hover:bg-slate-50"}`}
            style={filtro === r ? { background: "#4f46e5" } : {}}>
            {r === "todos" ? "Todos los perfiles" : roleLabel(r)}
          </button>
        ))}
      </div>

      {acciones.length === 0 ? (
        <EmptyState icon={History} text="Sin acciones registradas" />
      ) : (
        <div className="space-y-2">
          {acciones.map(a => {
            const acc = ACCION_CONFIG[a.accion] || { label: a.accion, color: "#64748b", bg: "#F8FAFC" };
            return (
              <div key={a.id} className="bg-white rounded-xl p-4 flex items-start gap-3 border border-slate-100">
                <div className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center" style={{ background: acc.bg }}>
                  <User className="w-4 h-4" style={{ color: acc.color }} />
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <p className="text-sm text-slate-700">{a.descripcion || `${a.accion} en ${a.entidad}`}</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    {a.accion && (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: acc.bg, color: acc.color }}>{acc.label}</span>
                    )}
                    {a.usuario_rol && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{roleLabel(a.usuario_rol)}</span>
                    )}
                    <span className="text-xs text-slate-400">{a.usuario_nombre || a.usuario_email}</span>
                    <Clock className="w-3 h-3 text-slate-400" />
                    <span className="text-xs text-slate-400">
                      {a.fecha ? format(new Date(a.fecha), "d MMM yyyy · HH:mm", { locale: es }) : "—"}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EmptyState({ icon: Icon, text }) {
  return (
    <div className="text-center py-16 text-slate-400">
      <Icon className="w-12 h-12 mx-auto mb-3 opacity-30" />
      <p className="font-medium">{text}</p>
    </div>
  );
}