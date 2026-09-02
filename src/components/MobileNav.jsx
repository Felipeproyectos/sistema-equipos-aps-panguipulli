import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getNavItemsForRole } from "@/lib/navPermissions";
import { getEffectiveNavRole } from "@/lib/roleSimulator";
import { useAuth } from "@/lib/AuthContext";

export default function MobileNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const role = user?.role || null;

  // Solo forzamos un re-render cuando cambia la simulación de rol (el rol
  // real ya viene del contexto de autenticación, no hace falta re-pedirlo).
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    const h = () => forceUpdate(n => n + 1);
    window.addEventListener("role-simulator-change", h);
    return () => window.removeEventListener("role-simulator-change", h);
  }, []);

  const items = role === null ? [] : getNavItemsForRole(getEffectiveNavRole(role)).slice(0, 4);

  const handleTap = (e, item, isActive) => {
    e.preventDefault();
    if (isActive) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      navigate(item.path);
    }
  };

  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around bg-white border-t border-slate-100"
      style={{
        paddingBottom: "env(safe-area-inset-bottom)",
        height: "calc(64px + env(safe-area-inset-bottom))",
        userSelect: "none",
        boxShadow: "0 -4px 24px rgba(15,45,107,0.10)"
      }}
    >
      {items.map((item) => {
        const Icon = item.icon;
        const isActive =
          item.path === "/"
            ? location.pathname === "/"
            : location.pathname.startsWith(item.path);
        return (
          <a
            key={item.path}
            href={item.path}
            onClick={(e) => handleTap(e, item, isActive)}
            className="flex flex-col items-center justify-center flex-1 h-full gap-1 transition-all select-none relative"
            style={{ userSelect: "none", WebkitUserSelect: "none" }}
          >
            {isActive && (
              <span
                className="absolute top-0 left-1/2 -translate-x-1/2 w-10 rounded-b-full"
                style={{ height: 3, background: "#2563EB" }}
              />
            )}
            <div
              className="flex items-center justify-center rounded-2xl transition-all"
              style={{
                width: 42,
                height: 32,
                background: isActive ? "#EFF6FF" : "transparent",
              }}
            >
              <Icon
                className="w-5 h-5 transition-colors"
                style={{ color: isActive ? "#2563EB" : "#94A3B8" }}
              />
            </div>
            <span
              className="text-[10px] font-bold transition-colors"
              style={{ color: isActive ? "#2563EB" : "#94A3B8" }}
            >
              {item.label}
            </span>
          </a>
        );
      })}
    </nav>
  );
}