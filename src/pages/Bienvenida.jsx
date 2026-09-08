import { useEffect, useState } from "react";
import { base44, MODO_SUPABASE } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { Loader2, Mail, Lock, Eye, EyeOff, LogIn, ShieldCheck, Info } from "lucide-react";

import fondo from "@/assets/login/fondo-panguipulli.jpg";
import logoAreaSalud from "@/assets/login/area-salud.png";
import cesfamPanguipulli from "@/assets/login/cesfam-panguipulli.png";
import cesfamConaripe from "@/assets/login/cesfam-conaripe.png";
import cesfamChoshuenco from "@/assets/login/cesfam-choshuenco.png";

// Los tres CESFAM de la comuna. Si mañana hay logo de un CECOSF o de la posta,
// se agrega aca y la fila se reacomoda sola.
const CENTROS = [
  { src: cesfamPanguipulli, alt: "CESFAM Panguipulli" },
  { src: cesfamConaripe, alt: "CESFAM Coñaripe" },
  { src: cesfamChoshuenco, alt: "CESFAM Choshuenco" },
];

const AZUL = "#1b63b0";
const AZUL_OSCURO = "#16549a";
const MARINO = "#0b2138";

function redirigirSegunRol(user) {
  window.location.replace(user?.role === "monitor_corporativo" ? "/MonitorCorporativo" : "/Dashboard");
}

export default function Bienvenida() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);

  // ── Login por correo/clave (modo Supabase) ─────────────────────────────────
  const [email, setEmail] = useState("");
  const [clave, setClave] = useState("");
  const [verClave, setVerClave] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);
  // El enlace de "olvidaste tu clave" no manda correos: la reposicion la hace
  // el Departamento de Informatica a mano (ver DESPLIEGUE.md). Solo avisa.
  const [verAyudaClave, setVerAyudaClave] = useState(false);

  // Cambio de clave obligatorio (usuarios recién migrados, ver DESPLIEGUE.md)
  const [usuarioLogueado, setUsuarioLogueado] = useState(null);
  const [nuevaClave, setNuevaClave] = useState("");
  const [nuevaClave2, setNuevaClave2] = useState("");
  const [cambiandoClave, setCambiandoClave] = useState(false);
  const [errorClave, setErrorClave] = useState(null);

  useEffect(() => {
    base44.auth.isAuthenticated().then((authed) => {
      if (authed) {
        // Si hay sesión activa, verificar rol para redirigir al inicio correcto
        base44.auth.me().then((u) => {
          if (u) redirigirSegunRol(u);
          else setChecking(false); // sesión sin perfil enlazado: mostrar login
        }).catch(() => window.location.replace("/Dashboard"));
      } else {
        setChecking(false);
      }
    });
  }, [navigate]);

  const handleLogin = () => {
    // Modo local / Base44: la plataforma resuelve el ingreso.
    base44.auth.redirectToLogin("/Dashboard");
  };

  const handleEntrarConClave = async (e) => {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      const u = await base44.auth.entrarConClave(email.trim(), clave);
      if (!u) throw new Error("Tu cuenta no está vinculada a un perfil del sistema. Contacta al administrador.");
      if (u.force_password_reset) {
        setUsuarioLogueado(u);
      } else {
        redirigirSegunRol(u);
      }
    } catch (err) {
      setError(err.message || "Correo o clave incorrectos");
    } finally {
      setEnviando(false);
    }
  };

  const handleCambiarClave = async (e) => {
    e.preventDefault();
    setErrorClave(null);
    if (nuevaClave.length < 8) {
      setErrorClave("La clave debe tener al menos 8 caracteres");
      return;
    }
    if (nuevaClave !== nuevaClave2) {
      setErrorClave("Las claves no coinciden");
      return;
    }
    setCambiandoClave(true);
    try {
      await base44.auth.cambiarClave(nuevaClave);
      redirigirSegunRol(usuarioLogueado);
    } catch (err) {
      setErrorClave(err.message || "No se pudo cambiar la clave");
    } finally {
      setCambiandoClave(false);
    }
  };

  const fondoPantalla = {
    backgroundColor: "#0a1c2e",
    backgroundImage:
      "linear-gradient(180deg, rgba(7,20,34,0.60) 0%, rgba(7,20,34,0.45) 45%, rgba(7,20,34,0.80) 100%), url(" + fondo + ")",
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundAttachment: "fixed",
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={fondoPantalla}>
        <div className="w-8 h-8 border-4 border-white/30 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  const claseCampo =
    "w-full pl-12 pr-4 py-3.5 rounded-xl border-[1.5px] border-gray-200 bg-slate-50 text-[15px] text-slate-800 " +
    "placeholder:text-slate-400 transition focus:outline-none focus:bg-white focus:border-[#1b63b0] focus:ring-4 focus:ring-[#1b63b0]/15";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 py-7" style={fondoPantalla}>
      <main
        className="w-full grid md:grid-cols-[42fr_58fr] overflow-hidden bg-white"
        style={{ maxWidth: 1000, borderRadius: 22, boxShadow: "0 32px 80px rgba(3,14,26,0.5), 0 4px 14px rgba(3,14,26,0.3)" }}
      >
        {/* ── Panel institucional ── */}
        <aside
          className="relative flex md:flex-col items-center md:items-stretch md:justify-center gap-5 px-8 py-8 md:px-10 md:py-12 text-white"
          style={{ background: "linear-gradient(165deg, #123c66 0%, " + MARINO + " 62%, #081a2c 100%)" }}
        >
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(340px 280px at 88% 6%, rgba(255,255,255,0.10), transparent 70%), " +
                "radial-gradient(300px 300px at -10% 100%, rgba(74,163,63,0.22), transparent 70%)",
            }}
          />
          <div className="relative z-10 self-start bg-white rounded-2xl px-4 py-3 shadow-xl">
            <img src={logoAreaSalud} alt="Área Salud - Corporación Municipal de Panguipulli" className="h-16 md:h-24 w-auto block" />
          </div>
          <div className="relative z-10">
            <h1 className="text-[15px] leading-snug text-white/80 font-semibold m-0">
              Sistema de Gestión de
              <strong className="block text-white font-bold text-2xl md:text-[29px] leading-tight mt-0.5">Equipos Vitales</strong>
            </h1>
            <div className="rounded-sm my-3" style={{ width: 52, height: 3, background: "#f0a92b" }} />
            <p className="m-0 text-[15px] leading-snug text-white/75">
              Corporación Municipal
              <br />
              de Panguipulli
            </p>
          </div>
          <p className="relative z-10 hidden md:flex gap-3 items-start mt-6 text-[13.5px] leading-snug text-white/70">
            <ShieldCheck className="w-[18px] h-[18px] flex-none mt-0.5" style={{ color: "#4aa33f" }} />
            Sistema para la calidad y seguridad del paciente
          </p>
        </aside>

        {/* ── Panel de acceso ── */}
        <section className="flex flex-col px-7 py-8 md:px-11 md:pt-11 md:pb-7">
          {usuarioLogueado ? (
            <div>
              <h2 className="m-0 mb-1 text-2xl md:text-[27px] font-bold leading-tight" style={{ color: MARINO }}>
                Cambia tu clave
              </h2>
              <p className="m-0 mb-6 text-[15px] text-slate-500">Es tu primer ingreso: elige una clave nueva.</p>
              <form onSubmit={handleCambiarClave} className="flex flex-col gap-3.5">
                <label className="relative flex items-center">
                  <Lock className="absolute left-4 w-[19px] h-[19px] text-slate-400 pointer-events-none" />
                  <input
                    type="password"
                    placeholder="Nueva clave"
                    value={nuevaClave}
                    onChange={(e) => setNuevaClave(e.target.value)}
                    className={claseCampo}
                    autoComplete="new-password"
                    autoFocus
                    required
                  />
                </label>
                <label className="relative flex items-center">
                  <Lock className="absolute left-4 w-[19px] h-[19px] text-slate-400 pointer-events-none" />
                  <input
                    type="password"
                    placeholder="Repite la nueva clave"
                    value={nuevaClave2}
                    onChange={(e) => setNuevaClave2(e.target.value)}
                    className={claseCampo}
                    autoComplete="new-password"
                    required
                  />
                </label>
                <ul className="m-0 pl-5 text-[13px] leading-relaxed text-slate-500">
                  <li>Mínimo 8 caracteres</li>
                  <li>Distinta de la clave de entrega</li>
                </ul>
                {errorClave && <p className="m-0 text-red-500 text-[13px]">{errorClave}</p>}
                <button
                  type="submit"
                  disabled={cambiandoClave}
                  className="mt-1 flex items-center justify-center gap-2.5 py-3.5 rounded-xl font-semibold text-[16px] text-white transition hover:brightness-95 active:scale-[0.99] disabled:opacity-60"
                  style={{ background: AZUL, boxShadow: "0 8px 20px rgba(27,99,176,0.32)" }}
                >
                  {cambiandoClave && <Loader2 className="w-4 h-4 animate-spin" />}
                  Guardar y entrar
                </button>
              </form>
            </div>
          ) : (
            <div>
              <h2 className="m-0 mb-1 text-2xl md:text-[27px] font-bold leading-tight" style={{ color: MARINO }}>
                Bienvenido/a
              </h2>
              <p className="m-0 mb-6 text-[15px] text-slate-500">Inicia sesión para acceder al sistema</p>

              {MODO_SUPABASE ? (
                <form onSubmit={handleEntrarConClave} className="flex flex-col gap-3.5">
                  <label className="relative flex items-center">
                    <Mail className="absolute left-4 w-[19px] h-[19px] text-slate-400 pointer-events-none" />
                    <input
                      type="email"
                      placeholder="Correo"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={claseCampo}
                      autoComplete="username"
                      autoFocus
                      required
                    />
                  </label>

                  <label className="relative flex items-center">
                    <Lock className="absolute left-4 w-[19px] h-[19px] text-slate-400 pointer-events-none" />
                    <input
                      type={verClave ? "text" : "password"}
                      placeholder="Clave"
                      value={clave}
                      onChange={(e) => setClave(e.target.value)}
                      className={claseCampo + " pr-12"}
                      autoComplete="current-password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setVerClave((v) => !v)}
                      aria-label={verClave ? "Ocultar la clave" : "Mostrar la clave"}
                      className="absolute right-2 p-2 rounded-lg text-slate-400 hover:text-[#1b63b0] transition"
                    >
                      {verClave ? <EyeOff className="w-[19px] h-[19px]" /> : <Eye className="w-[19px] h-[19px]" />}
                    </button>
                  </label>

                  <button
                    type="button"
                    onClick={() => setVerAyudaClave((v) => !v)}
                    aria-expanded={verAyudaClave}
                    className="self-end text-[13.5px] font-semibold border-b border-transparent hover:border-current"
                    style={{ color: AZUL }}
                  >
                    ¿Olvidaste tu clave?
                  </button>

                  {verAyudaClave && (
                    <p
                      className="m-0 flex gap-2.5 items-start px-4 py-3 rounded-xl text-[13.5px] leading-snug"
                      style={{ color: "#1d4b7d", background: "#eaf2fa", border: "1px solid #cfe0f1" }}
                    >
                      <Info className="w-[17px] h-[17px] flex-none mt-0.5" style={{ color: AZUL }} />
                      Para restablecer tu clave, contáctate con el administrador del sistema — Departamento de Informática y
                      Telecomunicaciones.
                    </p>
                  )}

                  {error && <p className="m-0 text-red-500 text-[13px] text-center">{error}</p>}

                  <button
                    type="submit"
                    disabled={enviando}
                    className="mt-1 flex items-center justify-center gap-2.5 py-3.5 rounded-xl font-semibold text-[16px] text-white transition hover:brightness-95 active:scale-[0.99] disabled:opacity-60"
                    style={{ background: AZUL, boxShadow: "0 8px 20px rgba(27,99,176,0.32)" }}
                  >
                    {enviando ? <Loader2 className="w-[19px] h-[19px] animate-spin" /> : <LogIn className="w-[19px] h-[19px]" />}
                    Iniciar sesión
                  </button>
                </form>
              ) : (
                <button
                  onClick={handleLogin}
                  className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl font-semibold text-[16px] text-white transition hover:brightness-95 active:scale-[0.99]"
                  style={{ background: AZUL, boxShadow: "0 8px 20px rgba(27,99,176,0.32)" }}
                >
                  <LogIn className="w-[19px] h-[19px]" />
                  Iniciar sesión
                </button>
              )}
            </div>
          )}

          <p className="flex items-center gap-3 mt-6 mb-0 text-[12.5px] text-slate-400">
            <span className="flex-1 h-px bg-gray-200" />
            <span className="flex items-center gap-1.5 whitespace-nowrap">
              <Lock className="w-3.5 h-3.5" />
              Acceso exclusivo para personal autorizado
            </span>
            <span className="flex-1 h-px bg-gray-200" />
          </p>

          <div className="mt-auto pt-6">
            <p className="m-0 mb-3 text-center text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              Centros de salud de la comuna
            </p>
            <ul className="flex items-center justify-center gap-6 md:gap-8 m-0 p-0 list-none">
              {CENTROS.map((c) => (
                <li key={c.alt}>
                  <img src={c.src} alt={c.alt} title={c.alt} className="h-14 md:h-[74px] w-auto opacity-90 transition hover:opacity-100" />
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <p className="m-0 text-center text-[12.5px] leading-relaxed text-white/55" style={{ maxWidth: 520 }}>
        Elaborado por el Departamento de Informática y Telecomunicaciones
        <br />
        Corporación Municipal de Panguipulli © 2026
      </p>
    </div>
  );
}
