import { useState, useEffect, useMemo, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { CheckCircle, Bell, Plus, X, Loader2, Mail, Send, FileText, CalendarClock, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { esAdministrador } from "@/lib/roles";
import { getEffectiveNavRole } from "@/lib/roleSimulator";
import { esVehiculo } from "@/lib/centros";
import { ESTADOS_CERRADOS, rotuloEstado, puedeEnviarAlMonitor } from "@/lib/solicitudesMonitor";
import {
  AREA_SALUD, AREA_MOVILIZACION, TIPOS_MANUALES, rotuloAlerta, esAutomatica, areaDeAlerta, areasDelRol, alertasDelRol, puedeResolver,
} from "@/lib/alertas";
import { centrosDe } from "@/lib/prestamoEquipo";
import { avisarCambioEnPendientes } from "@/hooks/useContadoresMenu";
import SolicitudFormDetallado from "@/components/solicitudes/SolicitudFormDetallado";

// Las alertas: avisos automáticos por una fecha que vence (src/lib/alertas.js).
//
// Una alerta no es un pedido. La crea el sistema cada noche mirando las fechas
// de las fichas, y se cierra sola cuando la fecha se corrige. Acá cada área ve
// las suyas: Calidad las de los equipos médicos, Movilización las de vehículos
// y licencias. Si para resolverla hace falta que la Corporación compre o
// mantenga algo, desde la alerta se abre la solicitud al Monitor Corporativo,
// ya con el equipo y el motivo puestos.
//
// Antes esta pantalla tenía además una pestaña «Solicitudes» que repetía la
// pantalla Solicitudes con otros números: se quitó.

const NIVEL_CONFIG = {
  critica:     { color: "#dc2626", bg: "#fef2f2", border: "#fca5a5", label: "Vencida" },
  advertencia: { color: "#d97706", bg: "#fffbeb", border: "#fde68a", label: "Por vencer" },
  info:        { color: "#2563eb", bg: "#eff6ff", border: "#bfdbfe", label: "Informativa" },
};
const NIVEL_MANUAL = { critica: "Crítica", advertencia: "Advertencia", info: "Informativa" };
const PESO_NIVEL = { critica: 0, advertencia: 1, info: 2 };
const ROTULO_AREA = { [AREA_SALUD]: "Calidad", [AREA_MOVILIZACION]: "Movilización" };

// Quién puede abrir una solicitud desde una alerta de Calidad.
const ROLES_PIDEN = ["super_admin", "admin", "encargado_salud", "encargado_compras_salud", "user"];

const escapar = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** La solicitud que nace de una alerta, ya empezada: el formulario pide el resto. */
function semillaDeSolicitud(alerta) {
  const base = { equipo_id: alerta.equipo_id, alerta_id: alerta.id, descripcion: alerta.descripcion || "" };
  if (alerta.tipo?.startsWith("parche")) return { ...base, categoria: "compra_insumo", tipo: "cambio_parches_adulto", prioridad: alerta.nivel === "critica" ? "alta" : "media" };
  if (alerta.tipo?.startsWith("bateria")) return { ...base, categoria: "compra_insumo", tipo: "reemplazo_bateria", prioridad: alerta.nivel === "critica" ? "alta" : "media" };
  if (alerta.tipo === "equipo_fuera_servicio") return { ...base, categoria: "desperfecto_tecnico", operatividad: "fuera_de_servicio", prioridad: "critica" };
  return { ...base, categoria: "mantenimiento", tipo: alerta.tipo?.startsWith("certificacion") ? "revision_tecnica" : "mantenimiento_preventivo" };
}

export default function AlertasV2() {
  const { user } = useAuth();
  const role = getEffectiveNavRole(user?.role);
  const [alertas, setAlertas] = useState([]);
  const [equipos, setEquipos] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [solicitudes, setSolicitudes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState("activa");
  const [area, setArea] = useState("todas");
  const [showModal, setShowModal] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [resolviendo, setResolviendo] = useState(null);
  const [pidiendo, setPidiendo] = useState(null);

  const [form, setForm] = useState({
    tipo: "mantenimiento_requerido", nivel: "advertencia", descripcion: "", equipo_id: "", centro: "", destinatarios: [],
  });

  const cargar = useCallback(async () => {
    const [eqs, al, usrs, sols] = await Promise.all([
      base44.entities.Equipo.list("-created_date", 1000).catch(() => []),
      base44.entities.Alerta.list("-created_date", 500).catch(() => []),
      base44.entities.User.list("-created_date", 100).catch(() => []),
      base44.entities.Solicitud.list("-created_date", 300).catch(() => []),
    ]);
    setEquipos(eqs);
    setAlertas(al);
    setUsuarios(usrs);
    setSolicitudes(sols);
    setLoading(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const porId = useMemo(() => new Map(equipos.map(e => [e.id, e])), [equipos]);
  const areas = areasDelRol(role);
  const veAmbas = areas.length > 1;
  const isAdmin = esAdministrador(role);

  // Solo las del área de quien mira (y, para el Encargado, de sus centros).
  // Quien ve las dos áreas puede separarlas.
  const mias = useMemo(() => alertasDelRol(role, alertas, porId, centrosDe(user))
    .map(a => ({ ...a, _area: areaDeAlerta(a, porId.get(a.equipo_id)) }))
    .filter(a => area === "todas" || a._area === area),
  [alertas, porId, role, area, user]);

  const counts = {
    activa: mias.filter(a => a.estado === "activa").length,
    resuelta: mias.filter(a => a.estado === "resuelta").length,
    critica: mias.filter(a => a.estado === "activa" && a.nivel === "critica").length,
  };
  const filtradas = mias
    .filter(a => filtro === "todos" || a.estado === filtro)
    .sort((a, b) => (PESO_NIVEL[a.nivel] ?? 1) - (PESO_NIVEL[b.nivel] ?? 1));

  const handleResolver = async (alerta) => {
    setResolviendo(alerta.id);
    try {
      await base44.entities.Alerta.update(alerta.id, { estado: "resuelta", fecha_resolucion: new Date().toISOString().split("T")[0] });
      setAlertas(prev => prev.map(a => (a.id === alerta.id ? { ...a, estado: "resuelta" } : a)));
      avisarCambioEnPendientes();
    } catch {
      // El motivo ya lo mostró base44Client.
    } finally {
      setResolviendo(null);
    }
  };

  const handleCrearAlerta = async () => {
    if (!form.tipo || !form.descripcion.trim()) return;
    setGuardando(true);
    try {
      const equipo = porId.get(form.equipo_id);
      const nuevaAlerta = await base44.entities.Alerta.create({
        tipo: form.tipo,
        nivel: form.nivel,
        descripcion: form.descripcion.trim(),
        equipo_id: form.equipo_id || null,
        centro: equipo?.centro_principal || form.centro,
        subsede: equipo?.subsede || "",
        estado: "activa",
      });

      if (form.destinatarios.length > 0) {
        setEnviando(true);
        const equipoLabel = equipo ? `${equipo.marca} ${equipo.modelo}` : "Sistema";
        // Lo que escribe una persona va escapado: el correo es HTML.
        const body = `<h2 style="color:#1565c0">⚠️ Alerta: ${escapar(rotuloAlerta(form.tipo))}</h2>
<p><strong>Equipo:</strong> ${escapar(equipoLabel)}</p>
<p><strong>Descripción:</strong> ${escapar(form.descripcion.trim())}</p>
<p><strong>Nivel:</strong> ${escapar(NIVEL_MANUAL[form.nivel])}</p>
<br/><p style="color:#666;font-size:12px">Sistema de Gestión de Equipos – Corporación Municipal Panguipulli</p>`;
        await Promise.all(form.destinatarios.map(email =>
          base44.integrations.Core.SendEmail({ to: email, subject: `[Alerta] ${rotuloAlerta(form.tipo)}`, body }).catch(() => {})
        ));
        setEnviando(false);
      }

      setAlertas(prev => [nuevaAlerta, ...prev]);
      setForm({ tipo: "mantenimiento_requerido", nivel: "advertencia", descripcion: "", equipo_id: "", centro: "", destinatarios: [] });
      setShowModal(false);
      avisarCambioEnPendientes();
    } catch {
      // El aviso con el motivo lo da base44Client. Aca solo se suelta el
      // boton, que sin esto quedaba en "Guardando..." para siempre.
    } finally {
      setGuardando(false);
      setEnviando(false);
    }
  };

  const toggleDestinatario = (email) => {
    setForm(f => ({
      ...f,
      destinatarios: f.destinatarios.includes(email) ? f.destinatarios.filter(e => e !== email) : [...f.destinatarios, email],
    }));
  };

  if (loading) return <div className="flex items-center justify-center min-h-screen"><div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>;

  const chip = (activo) => `px-4 py-2 rounded-xl text-xs font-medium transition-all ${activo ? "text-white" : "bg-white text-slate-500 border border-slate-200"}`;
  const soloMovilizacion = !veAmbas && areas[0] === AREA_MOVILIZACION;

  return (
    <div className="min-h-screen" style={{ background: "#e8f4fd" }}>
      <div className="relative overflow-hidden px-4 sm:px-6 lg:px-10 pt-10 pb-8" style={{ background: "linear-gradient(135deg, #0f2d6b 0%, #1565c0 40%, #29b6f6 100%)" }}>
        <div className="relative max-w-5xl mx-auto flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(255,255,255,0.2)" }}>
              <Bell className="w-6 h-6 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-cyan-200 text-xs font-semibold uppercase tracking-widest">Vencimientos</p>
              <h1 className="text-3xl font-bold text-white">Alertas</h1>
              <p className="text-blue-100 text-sm mt-0.5">
                {soloMovilizacion ? "Revisión técnica, permiso de circulación, licencias y préstamos" : veAmbas ? "Avisos automáticos de todas las áreas" : "Parches, baterías y certificaciones de los equipos médicos"}
              </p>
            </div>
          </div>
          {isAdmin && (
            <button onClick={() => setShowModal(true)} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white border border-white/30" style={{ background: "rgba(255,255,255,0.2)" }}>
              <Plus className="w-4 h-4" /> Crear Alerta
            </button>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-10 pt-6 pb-10">
        <div className="flex items-start gap-2 rounded-2xl bg-white border border-slate-100 shadow px-4 py-3 mb-5 text-xs text-slate-600">
          <CalendarClock className="w-4 h-4 flex-shrink-0 mt-0.5 text-blue-500" />
          <p>
            El sistema revisa cada noche las fechas cargadas en las fichas. Una alerta <strong>se cierra sola</strong> cuando se corrige la fecha
            {soloMovilizacion ? " en Vehículos o en Choferes." : " en la ficha del equipo."}
            {!soloMovilizacion && " Si resolverla depende de la Corporación, usa «Pedir al Monitor»."}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-6">
          {[{ label: "Activas", count: counts.activa, color: "#dc2626" }, { label: "Vencidas", count: counts.critica, color: "#ea580c" }, { label: "Cerradas", count: counts.resuelta, color: "#16a34a" }].map(s => (
            <div key={s.label} className="bg-white rounded-2xl p-4 shadow border border-slate-100">
              <p className="text-2xl font-bold" style={{ color: s.color }}>{s.count}</p>
              <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="flex gap-2 mb-5 flex-wrap">
          {[{ key: "activa", label: `Activas (${counts.activa})` }, { key: "resuelta", label: `Cerradas (${counts.resuelta})` }, { key: "todos", label: "Todas" }].map(t => (
            <button key={t.key} onClick={() => setFiltro(t.key)} aria-pressed={filtro === t.key} className={chip(filtro === t.key)} style={filtro === t.key ? { background: "#1a2e4a" } : {}}>
              {t.label}
            </button>
          ))}
          {veAmbas && (
            <span className="flex gap-2 sm:ml-auto">
              {[{ key: "todas", label: "Todas las áreas" }, { key: AREA_SALUD, label: "Calidad" }, { key: AREA_MOVILIZACION, label: "Movilización" }].map(t => (
                <button key={t.key} onClick={() => setArea(t.key)} aria-pressed={area === t.key} className={chip(area === t.key)} style={area === t.key ? { background: "#4F46E5" } : {}}>
                  {t.label}
                </button>
              ))}
            </span>
          )}
        </div>

        <div className="space-y-3">
          {filtradas.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl shadow text-slate-400">
              <CheckCircle className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>{filtro === "activa" ? "No hay vencimientos por atender" : "No hay alertas en esta vista"}</p>
            </div>
          ) : filtradas.map(alerta => {
            const equipo = porId.get(alerta.equipo_id);
            const cfg = NIVEL_CONFIG[alerta.nivel] || NIVEL_CONFIG.advertencia;
            const automatica = esAutomatica(alerta);
            const deLaAlerta = solicitudes.filter(s => s.alerta_id === alerta.id);
            const abierta = deLaAlerta.find(s => !ESTADOS_CERRADOS.includes(s.estado));
            const ultima = abierta || deLaAlerta[0];
            const activa = alerta.estado === "activa";
            const puedePedir = activa && !abierta && alerta._area === AREA_SALUD && !!equipo && ROLES_PIDEN.includes(role);
            const dondeCorregir = alerta.chofer_id ? { to: "/Choferes", texto: "Corregir en Choferes" }
              : alerta._area === AREA_MOVILIZACION ? { to: "/Flota", texto: "Corregir en Vehículos" }
              : { to: "/Equipos2", texto: "Corregir en Equipos" };
            const puedeIr = alerta._area === AREA_MOVILIZACION
              ? ["super_admin", "encargado_movilizacion"].includes(role)
              : ROLES_PIDEN.includes(role);
            return (
              <div key={alerta.id} className="bg-white rounded-2xl shadow border p-4 sm:p-5" style={{ borderColor: cfg.border }}>
                <div className="flex items-start gap-3">
                  <div className="w-3 h-3 rounded-full flex-shrink-0 mt-1.5" style={{ background: cfg.color }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ color: cfg.color, background: cfg.bg }}>{rotuloAlerta(alerta.tipo)}</span>
                      {!automatica && <span className="text-xs text-slate-500">{NIVEL_MANUAL[alerta.nivel] || ""} · escrita a mano</span>}
                      {veAmbas && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{ROTULO_AREA[alerta._area]}</span>}
                      {ultima && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-indigo-50 text-indigo-700">
                          Solicitud {ultima.numero_solicitud || ""}: {rotuloEstado(ultima)}
                        </span>
                      )}
                    </div>
                    <p className="font-semibold text-slate-900 text-sm">
                      {equipo ? [equipo.marca, equipo.modelo].filter(Boolean).join(" ") : alerta.chofer_id ? "Chofer" : "Sin equipo asociado"}
                      {equipo && esVehiculo(equipo.tipo) && equipo.patente && <span className="text-slate-400 font-normal"> · {equipo.patente}</span>}
                      {equipo && !esVehiculo(equipo.tipo) && equipo.numero_inventario && <span className="text-slate-400 font-normal"> · Inv. {equipo.numero_inventario}</span>}
                    </p>
                    <p className="text-xs text-slate-600 break-words">{alerta.descripcion}</p>
                    <p className="text-xs text-slate-400">{[alerta.centro, alerta.subsede].filter(Boolean).join(" › ")}</p>

                    <div className="flex flex-wrap items-center gap-2 mt-3">
                      {puedePedir && (
                        <button onClick={() => setPidiendo(alerta)}
                          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white" style={{ background: "linear-gradient(135deg, #4F46E5, #312E81)" }}>
                          <FileText className="w-3.5 h-3.5" /> {puedeEnviarAlMonitor(role) ? "Pedir al Monitor" : "Pedir a mi Encargado"}
                        </button>
                      )}
                      {activa && automatica && puedeIr && (
                        <Link to={dondeCorregir.to} className="flex items-center gap-1 px-3.5 py-2 rounded-xl text-xs font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50">
                          {dondeCorregir.texto} <ChevronRight className="w-3.5 h-3.5" />
                        </Link>
                      )}
                      {puedeResolver(role, alerta, equipo) && (
                        <button onClick={() => handleResolver(alerta)} disabled={resolviendo === alerta.id}
                          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white disabled:opacity-60" style={{ background: "#16a34a" }}>
                          {resolviendo === alerta.id && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Marcar resuelta
                        </button>
                      )}
                      {!activa && (
                        <span className="flex items-center gap-1.5 text-xs text-green-600 font-medium px-3 py-2 bg-green-50 rounded-xl"><CheckCircle className="w-3.5 h-3.5" /> Cerrada</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Solicitud desde una alerta: el formulario completo, ya empezado */}
      {pidiendo && (
        <SolicitudFormDetallado
          equipos={equipos}
          user={user}
          role={role}
          inicial={semillaDeSolicitud(pidiendo)}
          onClose={() => setPidiendo(null)}
          onSaved={async () => { setPidiendo(null); await cargar(); avisarCambioEnPendientes(); }}
        />
      )}

      {/* Modal Crear Alerta */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-7 pt-7 pb-4 border-b border-slate-100 flex items-center justify-between" style={{ background: "linear-gradient(135deg, #1a2e4a, #1565c0)", borderRadius: "1.5rem 1.5rem 0 0" }}>
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2"><Plus className="w-5 h-5" /> Crear Alerta</h2>
                <p className="text-blue-200 text-xs mt-0.5">Un aviso escrito a mano. Se resuelve a mano.</p>
              </div>
              <button onClick={() => setShowModal(false)} aria-label="Cerrar"><X className="w-5 h-5 text-white/70 hover:text-white" /></button>
            </div>
            <div className="px-7 py-6 space-y-4">
              <div>
                <label htmlFor="al-tipo" className="text-xs font-semibold text-slate-600 block mb-2">Tipo de Problema</label>
                <select id="al-tipo" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}>
                  {TIPOS_MANUALES.map(t => <option key={t} value={t}>{rotuloAlerta(t)}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="al-nivel" className="text-xs font-semibold text-slate-600 block mb-2">Nivel de Urgencia</label>
                <select id="al-nivel" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" value={form.nivel} onChange={e => setForm(f => ({ ...f, nivel: e.target.value }))}>
                  <option value="critica">Crítica</option>
                  <option value="advertencia">Advertencia</option>
                  <option value="info">Informativa</option>
                </select>
              </div>
              <div>
                <label htmlFor="al-equipo" className="text-xs font-semibold text-slate-600 block mb-2">Equipo Afectado (opcional)</label>
                <select id="al-equipo" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" value={form.equipo_id} onChange={e => setForm(f => ({ ...f, equipo_id: e.target.value }))}>
                  <option value="">Sin equipo específico</option>
                  {equipos.map(e => <option key={e.id} value={e.id}>{e.marca} {e.modelo} – {e.numero_inventario}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="al-desc" className="text-xs font-semibold text-slate-600 block mb-2">Descripción *</label>
                <textarea id="al-desc" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none" rows={3} maxLength={1000} placeholder="Describe el problema o la alerta..." value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} />
              </div>

              <div>
                <p className="text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> Notificar por email (opcional)</p>
                {usuarios.length === 0 ? (
                  <p className="text-xs text-slate-400">No hay usuarios registrados</p>
                ) : (
                  <div className="space-y-2 max-h-40 overflow-y-auto border border-slate-100 rounded-xl p-3">
                    {usuarios.map(u => (
                      <label key={u.id} className="flex items-center gap-3 cursor-pointer">
                        <input type="checkbox" checked={form.destinatarios.includes(u.email)} onChange={() => toggleDestinatario(u.email)} className="rounded" />
                        <div>
                          <p className="text-sm font-medium text-slate-700">{u.full_name || u.email}</p>
                          <p className="text-xs text-slate-400">{u.email} · {u.role}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
                {form.destinatarios.length > 0 && (
                  <p className="text-xs text-blue-600 mt-1">{form.destinatarios.length} destinatario(s) seleccionado(s)</p>
                )}
              </div>
            </div>
            <div className="px-7 pb-7 flex gap-3">
              <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 rounded-xl text-sm font-medium text-slate-600 border border-slate-200 hover:bg-slate-50">Cancelar</button>
              <button
                onClick={handleCrearAlerta}
                disabled={guardando || !form.descripcion.trim()}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
                style={{ background: "linear-gradient(135deg, #1565c0, #0288d1)" }}
              >
                {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {enviando ? "Enviando..." : guardando ? "Guardando..." : "Crear y Notificar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
