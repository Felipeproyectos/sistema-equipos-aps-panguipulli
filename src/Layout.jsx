import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { Heart, Menu, X, LogOut } from "lucide-react";
import { getNavItemsForRole } from "@/lib/navPermissions";
import MobileNav from "@/components/MobileNav";
import RoleSimulator from "@/components/RoleSimulator";
import { getEffectiveNavRole } from "@/lib/roleSimulator";
import useDarkMode from "@/hooks/useDarkMode";
import { roleLabel } from "@/lib/roles";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import useInactivityLogout from "@/hooks/useInactivityLogout";

export default function Layout({ children, currentPageName }) {
  // El usuario ya se obtiene una sola vez en AuthContext (a nivel de App),
  // antes de que Layout llegue a montarse. Reutilizarlo aquí evita una
  // segunda llamada de red idéntica en cada navegación.
  const { user, isLoadingAuth: userLoading } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [appConfig, setAppConfig] = useState(null);
  const location = useLocation();
  useDarkMode();
  const { toast } = useToast();

  // Cierre automático de sesión tras 30 minutos de inactividad.
  useInactivityLogout(() => {
    toast({
      title: "Sesión cerrada por inactividad",
      description: "Tu sesión se cerró automáticamente tras 5 minutos sin actividad.",
      variant: "destructive"
    });
    setTimeout(() => base44.auth.logout(), 1200);
  });

  useEffect(() => {
    base44.entities.AppConfig.list().then((list) => {
      if (list.length > 0) setAppConfig(list[0]);
    }).catch(() => {});
  }, []);

  const effectiveRole = getEffectiveNavRole(user?.role);
  const visibleItems = userLoading ? [] : getNavItemsForRole(effectiveRole);
  const navigate = useNavigate();

  // Redirigir al Monitor Corporativo a usuarios con rol exclusivo de visualización
  // (solo aplica al rol real, no a la simulación del super_admin)
  useEffect(() => {
    if (user?.role === "monitor_corporativo" && currentPageName !== "MonitorCorporativo") {
      navigate("/MonitorCorporativo", { replace: true });
    }
  }, [user, currentPageName, navigate]);

  // Escuchar cambios del simulador para refrescar la nav
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    const h = () => forceUpdate(n => n + 1);
    window.addEventListener("role-simulator-change", h);
    return () => window.removeEventListener("role-simulator-change", h);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 flex" style={{ fontFamily: "'Inter', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        :root {
          --primary: #3b82f6;
          --accent: #e63946;
          --accent-light: #fff1f2;
        }
        .nav-link { transition: all 0.2s ease; }
        .nav-link:hover { background: rgba(255,255,255,0.15); }
        .nav-link.active { background: rgba(255,255,255,0.25); border-left: 3px solid #ffffff; }
      `}</style>

      {/* Sidebar Desktop */}
      <aside className="hidden lg:flex flex-col w-64 min-h-screen" style={{ background: "linear-gradient(180deg, #3b82f6 0%, #2563eb 100%)" }}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-6 py-7 border-b border-white/10">
          <div className="flex items-center justify-center overflow-hidden flex-shrink-0" style={appConfig?.logo_url ? { width: 64, height: 64 } : { width: 36, height: 36, background: "rgba(255,255,255,0.2)", borderRadius: 12 }}>
            {appConfig?.logo_url ?
            <img src={appConfig.logo_url} alt="logo" className="w-full h-full object-contain" /> :
            <Heart className="w-5 h-5 text-white" />
            }
          </div>
          <div>
            <p className="text-white font-semibold text-sm leading-none">{appConfig?.nombre_app || "Sistema de Gestión de Equipos"}</p>
            <p className="text-white/40 text-xs mt-0.5">{appConfig?.subtitulo || "Sistema de Gestión de Equipos"}</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-6 space-y-1">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentPageName === item.page;
            return (
              <Link
                key={item.page}
                to={createPageUrl(item.page)}
                className={`nav-link flex items-center gap-3 px-4 py-2.5 rounded-lg ${isActive ? "active" : ""}`}>

                <Icon className={`w-5 h-5 ${isActive ? "text-white" : "text-white/90"}`} />
                <span className={`text-base font-semibold ${isActive ? "text-white" : "text-white/95"}`}>{item.label}</span>
              </Link>);

          })}
        </nav>

        {/* User */}
        {user &&
        <div className="px-4 py-5 border-t border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: "rgba(255,255,255,0.2)" }}>
                {user.full_name?.charAt(0) || user.email?.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-xs font-medium truncate">{user.full_name || user.email}</p>
                <p className="text-white/40 text-xs">{roleLabel(user.role)}</p>
              </div>
              <button onClick={() => base44.auth.logout()} className="text-white/30 hover:text-white/70 transition-colors">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        }
      </aside>

      {/* Mobile Header */}
      <div className="px-4 py-4 lg:hidden fixed top-0 left-0 right-0 z-50 flex items-center justify-between" style={{ background: "linear-gradient(90deg, #3b82f6 0%, #2563eb 100%)", paddingTop: "calc(1rem + env(safe-area-inset-top))", userSelect: "none" }}>
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center overflow-hidden" style={appConfig?.logo_url ? { width: 56, height: 56 } : { width: 28, height: 28, background: "rgba(255,255,255,0.2)", borderRadius: 8 }}>
            {appConfig?.logo_url ?
            <img src={appConfig.logo_url} alt="logo" className="w-full h-full object-contain" /> :
            <Heart className="w-4 h-4 text-white" />
            }
          </div>
          <span className="text-white font-semibold text-sm">{appConfig?.nombre_app || "Sistema de Gestión de Equipos"}</span>
        </div>
        <button onClick={() => setMenuOpen(!menuOpen)} className="text-white">
          {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile Menu */}
      {menuOpen &&
      <div className="lg:hidden fixed inset-0 z-40 pt-16" style={{ background: "linear-gradient(180deg, #3b82f6 0%, #2563eb 100%)" }}>
          <nav className="px-4 py-4 space-y-1">
            {visibleItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentPageName === item.page;
            return (
              <Link
                key={item.page}
                to={createPageUrl(item.page)}
                onClick={() => setMenuOpen(false)}
                className={`nav-link flex items-center gap-3 px-4 py-3 rounded-lg ${isActive ? "active" : ""}`}>

                  <Icon className={`w-5 h-5 ${isActive ? "text-white" : "text-white/90"}`} />
                  <span className={`text-base font-semibold ${isActive ? "text-white" : "text-white/95"}`}>{item.label}</span>
                </Link>);

          })}
          </nav>
        </div>
      }

      {/* Main */}
      <main className="flex-1 overflow-auto" style={{ overscrollBehavior: "none", WebkitOverflowScrolling: "touch" }}>
        <div className="lg:hidden h-16" />
        {children}
        {/* Bottom padding so content isn't hidden behind mobile nav */}
        <div className="lg:hidden" style={{ height: "calc(56px + env(safe-area-inset-bottom))" }} />
      </main>

      <MobileNav />
      <RoleSimulator />
    </div>);

}