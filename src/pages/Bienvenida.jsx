import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";

export default function Bienvenida() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [logoUrl, setLogoUrl] = useState(null);

  useEffect(() => {
    base44.entities.AppConfig.list().then((list) => {
      if (list.length > 0 && list[0].logo_url) setLogoUrl(list[0].logo_url);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    base44.auth.isAuthenticated().then((authed) => {
      if (authed) {
        // Si hay sesión activa, verificar rol para redirigir al inicio correcto
        base44.auth.me().then((u) => {
          if (u?.role === "monitor_corporativo") {
            window.location.replace("/MonitorCorporativo");
          } else {
            window.location.replace("/Dashboard");
          }
        }).catch(() => window.location.replace("/Dashboard"));
      } else {
        setChecking(false);
      }
    });
  }, [navigate]);

  const handleLogin = () => {
    // Tras login, redirigir según rol (el Layout ajustará si es monitor_corporativo)
    base44.auth.redirectToLogin("/Dashboard");
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "linear-gradient(135deg, #1a3a5c 0%, #0d2137 100%)" }}>
        <div className="w-8 h-8 border-4 border-white/30 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden"
      style={{ background: "linear-gradient(135deg, #1a3a5c 0%, #0d2137 100%)" }}
    >
      <div className="absolute top-0 left-0 w-96 h-96 rounded-full" style={{ background: "rgba(255,255,255,0.08)", transform: "translate(-40%, -40%)" }} />
      <div className="absolute bottom-0 right-0 w-96 h-96 rounded-full" style={{ background: "rgba(255,255,255,0.08)", transform: "translate(40%, 40%)" }} />

      <div className="relative z-10 flex flex-col items-center w-full px-4" style={{ maxWidth: 420 }}>
        <div
          className="bg-white w-full flex flex-col items-center px-10 py-10 gap-5"
          style={{ borderRadius: 24, boxShadow: "0 20px 60px rgba(0,0,0,0.35), 0 4px 16px rgba(0,0,0,0.15)" }}
        >
          <div className="flex items-center justify-center" style={{ width: 100, height: 100 }}>
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="w-full h-full object-contain" onError={(e) => { e.target.style.display = "none"; }} />
            ) : (
              <div style={{ fontSize: 40 }}>🏥</div>
            )}
          </div>

          <div className="text-center">
            <h1 className="font-bold tracking-tight mb-1" style={{ color: "#1a3a5c", fontSize: 18 }}>
              Sistema de Gestión de Equipo Vitales - Corporación Municipal Panguipulli
            </h1>
            <p className="text-gray-500 text-sm">Sistema para calidad y seguridad del paciente</p>
          </div>

          <div className="w-full h-px bg-gray-100" />

          <div className="text-center">
            <h2 className="text-gray-700 text-base font-medium">Bienvenido/a</h2>
            <p className="text-gray-400 text-sm mt-0.5">Inicia sesión para acceder al sistema</p>
          </div>

          <button
            onClick={handleLogin}
            className="w-full flex items-center justify-center gap-3 py-3 px-6 rounded-xl font-semibold text-white transition-all duration-200 hover:opacity-90 active:scale-95"
            style={{ background: "#1a3a5c", boxShadow: "0 4px 14px rgba(26,58,92,0.4)" }}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#ffffff"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#ffffff"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#ffffff"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#ffffff"/>
            </svg>
            Iniciar Sesión con Google
          </button>

          <div className="w-full flex items-center gap-3">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-gray-400 text-xs">o</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          <button
            onClick={handleLogin}
            className="w-full flex items-center justify-center gap-3 py-3 px-6 rounded-xl font-semibold text-white transition-all duration-200 hover:opacity-90 active:scale-95"
            style={{ background: "#1a3a5c", boxShadow: "0 4px 14px rgba(26,58,92,0.4)" }}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            Iniciar Sesión con Correo
          </button>

          <div className="flex items-center gap-2 text-xs text-gray-400">
            <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            Acceso exclusivo para personal autorizado
          </div>
        </div>

        <p className="mt-6 text-center" style={{ color: "rgba(147,197,253,0.7)", fontSize: 12 }}>
          Elaborado por Departamento de Informática - Corporación Municipal Panguipulli © 2026
        </p>
      </div>
    </div>
  );
}