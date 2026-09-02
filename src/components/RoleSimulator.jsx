import { useState, useEffect } from "react";
import { Users, X, ChevronUp, Eye, EyeOff, Lock } from "lucide-react";
import { getSimulatedRole, setSimulatedRole, clearSimulatedRole, ALL_ROLES } from "@/lib/roleSimulator";
import { ROLES, roleLabel } from "@/lib/roles";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";

export default function RoleSimulator() {
  const { user } = useAuth();
  const [simRole, setSimRole] = useState(getSimulatedRole());
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const handler = (e) => setSimRole(e.detail);
    window.addEventListener("role-simulator-change", handler);
    return () => window.removeEventListener("role-simulator-change", handler);
  }, []);

  // Exclusivo de Base del Sistema (super_admin). Nadie más ve este control,
  // ni siquiera Administrador.
  if (!user || user.role !== ROLES.SUPER_ADMIN) return null;

  const selectRole = (role) => {
    const ok = setSimulatedRole(role, user.role);
    if (!ok) return;
    setSimRole(role);
    setOpen(false);
    if (location.pathname !== "/") {
      navigate("/");
    } else {
      window.location.reload();
    }
  };

  const clearSim = () => {
    clearSimulatedRole();
    setSimRole(null);
    setOpen(false);
    navigate("/");
    window.location.reload();
  };

  const activeRole = simRole ? { value: simRole, label: roleLabel(simRole) } : null;

  return (
    <div className="fixed bottom-20 lg:bottom-4 right-4 z-[70]">
      {open ? (
        <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-72 overflow-hidden" style={{ animation: "slideUp 0.2s ease" }}>
          <div className="px-4 py-3 flex items-center justify-between" style={{ background: "#1E293B" }}>
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-white" />
              <span className="text-white text-sm font-bold">Simular Rol</span>
            </div>
            <button onClick={() => setOpen(false)} className="text-white/70 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-2 max-h-80 overflow-y-auto">
            <button
              onClick={clearSim}
              className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <EyeOff className="w-4 h-4" /> Mi rol real (Base del Sistema)
            </button>
            <div className="h-px bg-slate-100 my-1" />
            {ALL_ROLES.map(r => (
              <button
                key={r.value}
                onClick={() => selectRole(r.value)}
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors"
                style={simRole === r.value
                  ? { background: "#EFF6FF", color: "#2563EB" }
                  : { color: "#475569" }}
              >
                <span className="w-2 h-2 rounded-full" style={{ background: simRole === r.value ? "#2563EB" : "#CBD5E1" }} />
                {r.label}
                {simRole === r.value && <span className="ml-auto text-xs font-bold">●</span>}
              </button>
            ))}
          </div>
          <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100 flex items-start gap-1.5">
            <Lock className="w-3 h-3 text-slate-400 mt-0.5 flex-shrink-0" />
            <p className="text-[10px] text-slate-400 leading-tight">
              Modo solo lectura: mientras simulas un rol, cualquier intento de crear, editar o eliminar queda bloqueado.
            </p>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 px-4 py-3 rounded-full shadow-lg text-white font-bold text-sm transition-all hover:scale-105"
          style={{ background: activeRole ? "#7C3AED" : "#1E293B" }}
        >
          <Users className="w-4 h-4" />
          <span className="hidden sm:inline">{activeRole ? `Viendo como: ${activeRole.label}` : "Simular Rol"}</span>
          <span className="sm:hidden">{activeRole ? activeRole.label.split(" ")[0] : "Rol"}</span>
          <ChevronUp className="w-3 h-3" />
        </button>
      )}
      <style>{`@keyframes slideUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
  );
}
