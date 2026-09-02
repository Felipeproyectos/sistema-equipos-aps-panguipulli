import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { CheckCircle, Bell, Plus, X, Loader2, Mail, Send, ClipboardList, FileText } from "lucide-react";
import { differenceInDays, parseISO } from "date-fns";
import { useAuth } from "@/lib/AuthContext";

const NIVEL_CONFIG = {
  critica:    { color: "#dc2626", bg: "#fef2f2", border: "#fca5a5", label: "Crítica" },
  advertencia:{ color: "#d97706", bg: "#fffbeb", border: "#fde68a", label: "Advertencia" },
  info:       { color: "#2563eb", bg: "#eff6ff", border: "#bfdbfe", label: "Info" }
};

const TIPOS_ALERTA = [
  { value: "mantenimiento_requerido", label: "Mantenimiento Requerido" },
  { value: "equipo_fuera_servicio",   label: "Equipo Fuera de Servicio" },
  { value: "parche_vencido",          label: "Parche Vencido" },
  { value: "parche_por_vencer",       label: "Parche por Vencer" },
  { value: "bateria_vencida",         label: "Batería Vencida" },
  { value: "bateria_por_vencer",      label: "Batería por Vencer" },
];

export default function AlertasV2() {
  const { user } = useAuth();
  const [alertas, setAlertas] = useState([]);
  const [equipos, setEquipos] = useState([]);
  const [parches, setParches] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro]   = useState("activa");
  const [showModal, setShowModal] = useState(false);
  const [enviando, setEnviando]   = useState(false);
  const [guardando, setGuardando] = useState(false);

  const [seccion, setSeccion] = useState("alertas"); // 'alertas' | 'solicitudes'
  const [solicitudes, setSolicitudes] = useState([]);
  const [gestionando, setGestionando] = useState(null);
  const [respuestaAdmin, setRespuestaAdmin] = useState("");
  const [nuevoEstado, setNuevoEstado] = useState("");
  const [guardandoSol, setGuardandoSol] = useState(false);
  const [alertaParaSolicitud, setAlertaParaSolicitud] = useState(null);
  const [formSol, setFormSol] = useState({ tipo: "", observaciones: "" });
  const [guardandoSolRapida, setGuardandoSolRapida] = useState(false);

  const [form, setForm] = useState({
    tipo: "mantenimiento_requerido",
    nivel: "advertencia",
    descripcion: "",
    equipo_id: "",
    centro: "",
    destinatarios: []
  });

  useEffect(() => {
    const init = async () => {
      const [eqs, pa, al, usrs, sols] = await Promise.all([
        base44.entities.Equipo.list('-created_date', 500),
        base44.entities.Parche.list('-created_date', 2000),
        base44.entities.Alerta.list('-created_date', 500),
        base44.entities.User.list('-created_date', 100).catch(() => []),
        base44.entities.Solicitud.list("-created_date", 200).catch(() => [])
      ]);
      setEquipos(eqs);
      setParches(pa);
      setUsuarios(usrs);
      setAlertas(al);
      setSolicitudes(sols);
      setLoading(false);
    };
    init();
  }, []);

  // Las alertas automáticas de vencimiento ahora se generan vía automatización
  // programada (función generarAlertasAutomaticas, 1 vez al día) con dedup
  // server-side. Se elimina la generación client-side que causaba thundering
  // herd y alertas duplicadas con múltiples usuarios.



  const handleResolver = async (alerta) => {
    await base44.entities.Alerta.update(alerta.id, { estado: "resuelta", fecha_resolucion: new Date().toISOString().split("T")[0] });
    setAlertas(prev => prev.map(a => a.id === alerta.id ? { ...a, estado: "resuelta" } : a));
  };

  const handleCrearAlerta = async () => {
    if (!form.tipo || !form.descripcion) return;
    setGuardando(true);
    const equipo = equipos.find(e => e.id === form.equipo_id);
    const nuevaAlerta = await base44.entities.Alerta.create({
      tipo: form.tipo,
      nivel: form.nivel,
      descripcion: form.descripcion,
      equipo_id: form.equipo_id || null,
      centro: equipo?.centro_principal || form.centro,
      subsede: equipo?.subsede || "",
      estado: "activa"
    });

    // Enviar emails a destinatarios seleccionados
    if (form.destinatarios.length > 0) {
      setEnviando(true);
      const equipoLabel = equipo ? `${equipo.marca} ${equipo.modelo}` : "Sistema";
      const body = `<h2 style="color:#1565c0">⚠️ Alerta: ${TIPOS_ALERTA.find(t=>t.value===form.tipo)?.label}</h2>
<p><strong>Equipo:</strong> ${equipoLabel}</p>
<p><strong>Descripción:</strong> ${form.descripcion}</p>
<p><strong>Nivel:</strong> ${NIVEL_CONFIG[form.nivel]?.label}</p>
<br/><p style="color:#666;font-size:12px">Sistema de Gestión de Equipos – Corporación Municipal Panguipulli</p>`;
      await Promise.all(form.destinatarios.map(email =>
        base44.integrations.Core.SendEmail({ to: email, subject: `[Alerta] ${TIPOS_ALERTA.find(t=>t.value===form.tipo)?.label}`, body }).catch(() => {})
      ));
      setEnviando(false);
    }

    setAlertas(prev => [nuevaAlerta, ...prev]);
    setForm({ tipo: "mantenimiento_requerido", nivel: "advertencia", descripcion: "", equipo_id: "", centro: "", destinatarios: [] });
    setShowModal(false);
    setGuardando(false);
  };

  const toggleDestinatario = (email) => {
    setForm(f => ({
      ...f,
      destinatarios: f.destinatarios.includes(email) ? f.destinatarios.filter(e => e !== email) : [...f.destinatarios, email]
    }));
  };

  const handleGestionarSolicitud = async () => {
    if (!gestionando) return;
    setGuardandoSol(true);
    await base44.entities.Solicitud.update(gestionando.id, { estado: nuevoEstado, respuesta_admin: respuestaAdmin });
    // Si se finaliza la solicitud, resolver la alerta asociada automáticamente
    if (nuevoEstado === "finalizada" && gestionando.alerta_id) {
      await base44.entities.Alerta.update(gestionando.alerta_id, { estado: "resuelta", fecha_resolucion: new Date().toISOString().split("T")[0] });
      setAlertas(prev => prev.map(a => a.id === gestionando.alerta_id ? { ...a, estado: "resuelta" } : a));
    }
    setSolicitudes(prev => prev.map(s => s.id === gestionando.id ? { ...s, estado: nuevoEstado, respuesta_admin: respuestaAdmin } : s));
    setGestionando(null);
    setGuardandoSol(false);
  };

  const handleCrearSolicitudRapida = async () => {
    if (!alertaParaSolicitud || !formSol.tipo) return;
    setGuardandoSolRapida(true);
    const equipo = equipos.find(e => e.id === alertaParaSolicitud.equipo_id);
    const nueva = await base44.entities.Solicitud.create({
      equipo_id: alertaParaSolicitud.equipo_id || "",
      tipo: formSol.tipo,
      fecha: new Date().toISOString().split("T")[0],
      observaciones: formSol.observaciones,
      centro: alertaParaSolicitud.centro || equipo?.centro_principal || "",
      estado: "pendiente",
      alerta_id: alertaParaSolicitud.id,
      usuario_email: user?.email || "",
      usuario_nombre: user?.full_name || user?.email || ""
    });
    setSolicitudes(prev => [nueva, ...prev]);
    setAlertaParaSolicitud(null);
    setFormSol({ tipo: "", observaciones: "" });
    setGuardandoSolRapida(false);
  };

  const ESTADO_SOL = {
    pendiente:   { label: "Pendiente",   color: "#d97706", bg: "#fffbeb" },
    en_proceso:  { label: "En Proceso",  color: "#2563eb", bg: "#eff6ff" },
    finalizada:  { label: "Finalizada",  color: "#16a34a", bg: "#f0fdf4" },
  };

  const isAdmin = user?.role === "admin";
  // Usuarios normales solo ven sus propias solicitudes
  const solicitudesVisibles = isAdmin ? solicitudes : solicitudes.filter(s => s.usuario_email === user?.email);
  const filtradas = alertas.filter(a => filtro === "todos" ? true : a.estado === filtro)
    .sort((a, b) => ({ critica: 0, advertencia: 1, info: 2 }[a.nivel] || 1) - ({ critica: 0, advertencia: 1, info: 2 }[b.nivel] || 1));
  const counts = { activa: alertas.filter(a => a.estado === "activa").length, resuelta: alertas.filter(a => a.estado === "resuelta").length, critica: alertas.filter(a => a.estado === "activa" && a.nivel === "critica").length };

  if (loading) return <div className="flex items-center justify-center min-h-screen"><div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="min-h-screen" style={{ background: "#e8f4fd" }}>
      <div className="relative overflow-hidden px-6 lg:px-10 pt-10 pb-8" style={{ background: "linear-gradient(135deg, #0f2d6b 0%, #1565c0 40%, #29b6f6 100%)" }}>
        <div className="relative max-w-5xl mx-auto flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: "rgba(255,255,255,0.2)" }}>
              <Bell className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-cyan-200 text-xs font-semibold uppercase tracking-widest">Sistema</p>
              <h1 className="text-3xl font-bold text-white">Alertas</h1>
              <p className="text-blue-100 text-sm mt-0.5">{counts.critica} crítica(s) activa(s)</p>
            </div>
          </div>
          {isAdmin && (
            <button onClick={() => setShowModal(true)} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white border border-white/30" style={{ background: "rgba(255,255,255,0.2)" }}>
              <Plus className="w-4 h-4" /> Crear Alerta
            </button>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 lg:px-10 pt-6 pb-10">
        {/* Tabs principales */}
        <div className="flex gap-2 mb-6">
          <button onClick={() => setSeccion("alertas")} className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${seccion === "alertas" ? "text-white shadow" : "bg-white text-slate-600 border border-slate-200"}`} style={seccion === "alertas" ? { background: "#1a2e4a" } : {}}>
            <Bell className="w-4 h-4" /> Alertas
            {counts.activa > 0 && <span className="ml-1 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5">{counts.activa}</span>}
          </button>
          <button onClick={() => setSeccion("solicitudes")} className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${seccion === "solicitudes" ? "text-white shadow" : "bg-white text-slate-600 border border-slate-200"}`} style={seccion === "solicitudes" ? { background: "#1a2e4a" } : {}}>
            <ClipboardList className="w-4 h-4" /> Solicitudes
            {solicitudes.filter(s => s.estado === "pendiente").length > 0 && <span className="ml-1 bg-amber-500 text-white text-xs rounded-full px-1.5 py-0.5">{solicitudes.filter(s => s.estado === "pendiente").length}</span>}
          </button>
        </div>

        {seccion === "alertas" && (<>
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[{ label: "Activas", count: counts.activa, color: "#dc2626" }, { label: "Críticas", count: counts.critica, color: "#ea580c" }, { label: "Resueltas", count: counts.resuelta, color: "#16a34a" }].map(s => (
            <div key={s.label} className="bg-white rounded-2xl p-4 shadow border border-slate-100">
              <p className="text-2xl font-bold" style={{ color: s.color }}>{s.count}</p>
              <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="flex gap-2 mb-5">
          {[{ key: "activa", label: "Activas", count: counts.activa }, { key: "resuelta", label: "Resueltas", count: counts.resuelta }, { key: "todos", label: "Todas" }].map(t => (
            <button key={t.key} onClick={() => setFiltro(t.key)} className={`px-4 py-2 rounded-xl text-xs font-medium transition-all ${filtro === t.key ? "text-white" : "bg-white text-slate-500 border border-slate-200"}`} style={filtro === t.key ? { background: "#1a2e4a" } : {}}>
              {t.label}{t.count !== undefined ? ` (${t.count})` : ""}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          {filtradas.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl shadow text-slate-400">
              <CheckCircle className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>No hay alertas en esta categoría</p>
            </div>
          ) : filtradas.map(alerta => {
            const equipo = equipos.find(e => e.id === alerta.equipo_id);
            const cfg = NIVEL_CONFIG[alerta.nivel] || NIVEL_CONFIG.advertencia;
            const solAsociada = solicitudes.find(s => s.alerta_id === alerta.id);
            return (
              <div key={alerta.id} className="bg-white rounded-2xl shadow border p-5" style={{ borderColor: cfg.border }}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-4">
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: cfg.color }} />
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ color: cfg.color, background: cfg.bg }}>{TIPOS_ALERTA.find(t=>t.value===alerta.tipo)?.label || alerta.tipo}</span>
                        <span className="text-xs text-slate-400">{cfg.label}</span>
                        {solAsociada && (
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: ESTADO_SOL[solAsociada.estado]?.bg, color: ESTADO_SOL[solAsociada.estado]?.color }}>
                            Solicitud: {ESTADO_SOL[solAsociada.estado]?.label}
                          </span>
                        )}
                      </div>
                      <p className="font-semibold text-slate-900 text-sm">{equipo ? `${equipo.marca} ${equipo.modelo}` : "Sin equipo asociado"}</p>
                      <p className="text-xs text-slate-500">{alerta.descripcion}</p>
                      <p className="text-xs text-slate-400">{alerta.centro}{alerta.subsede ? ` › ${alerta.subsede}` : ""}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {alerta.estado === "activa" && !solAsociada && (
                      <button onClick={() => { setAlertaParaSolicitud(alerta); setFormSol({ tipo: alerta.tipo === "parche_vencido" || alerta.tipo === "parche_por_vencer" ? "cambio_parches_adulto" : alerta.tipo === "bateria_vencida" || alerta.tipo === "bateria_por_vencer" ? "reemplazo_bateria" : "mantenimiento_preventivo", observaciones: alerta.descripcion }); }} className="px-3 py-2 rounded-xl text-xs font-semibold border border-blue-200 text-blue-600 bg-blue-50 hover:bg-blue-100">
                        <FileText className="w-3.5 h-3.5 inline mr-1" />Solicitar
                      </button>
                    )}
                    {alerta.estado === "activa" && isAdmin ? (
                      <button onClick={() => handleResolver(alerta)} className="px-4 py-2 rounded-xl text-xs font-semibold text-white" style={{ background: "#16a34a" }}>Resolver</button>
                    ) : alerta.estado === "resuelta" ? (
                      <span className="flex items-center gap-1.5 text-xs text-green-600 font-medium px-3 py-2 bg-green-50 rounded-xl"><CheckCircle className="w-3.5 h-3.5" /> Resuelta</span>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        </>)}

        {seccion === "solicitudes" && (
          <div className="space-y-3">
            {!isAdmin && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-700">
                Mostrando solo tus solicitudes. Los administradores gestionan y responden cada requerimiento.
              </div>
            )}
            {solicitudesVisibles.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-2xl shadow text-slate-400">
                <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>{isAdmin ? "No hay solicitudes registradas" : "Aún no tienes solicitudes"}</p>
              </div>
            ) : solicitudesVisibles.map(sol => {
              const equipo = equipos.find(e => e.id === sol.equipo_id);
              const est = ESTADO_SOL[sol.estado] || ESTADO_SOL.pendiente;
              return (
                <div key={sol.id} className="bg-white rounded-2xl shadow border border-slate-100 p-5 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ color: est.color, background: est.bg }}>{est.label}</span>
                      <span className="text-xs text-slate-500 truncate">{sol.tipo?.replace(/_/g, " ")}</span>
                      {sol.alerta_id && <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200">Desde alerta</span>}
                    </div>
                    <p className="font-semibold text-slate-900 text-sm">{equipo ? `${equipo.marca} ${equipo.modelo}` : "Sin equipo"}</p>
                    <p className="text-xs text-slate-500">{sol.centro}</p>
                    {isAdmin && <p className="text-xs text-slate-400">Solicitante: {sol.usuario_nombre || sol.usuario_email}</p>}
                    {sol.observaciones && <p className="text-xs text-slate-400 mt-0.5 truncate">{sol.observaciones}</p>}
                    {sol.respuesta_admin && <p className="text-xs text-blue-600 mt-1 bg-blue-50 rounded-lg px-2 py-1">↳ Admin: {sol.respuesta_admin}</p>}
                  </div>
                  {isAdmin && (
                    <button onClick={() => { setGestionando(sol); setNuevoEstado(sol.estado); setRespuestaAdmin(sol.respuesta_admin || ""); }} className="flex-shrink-0 px-4 py-2 rounded-xl text-xs font-semibold text-white" style={{ background: "#1565c0" }}>Gestionar</button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal Crear Solicitud desde Alerta */}
      {alertaParaSolicitud && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md">
            <div className="px-7 pt-7 pb-4 border-b border-slate-100 flex items-center justify-between" style={{ background: "linear-gradient(135deg, #1a2e4a, #1565c0)", borderRadius: "1.5rem 1.5rem 0 0" }}>
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2"><FileText className="w-5 h-5" /> Nueva Solicitud</h2>
                <p className="text-blue-200 text-xs mt-0.5">Desde alerta: {TIPOS_ALERTA.find(t=>t.value===alertaParaSolicitud.tipo)?.label}</p>
              </div>
              <button onClick={() => setAlertaParaSolicitud(null)}><X className="w-5 h-5 text-white/70 hover:text-white" /></button>
            </div>
            <div className="px-7 py-5 space-y-4">
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-xs font-semibold text-slate-500 mb-1">Equipo</p>
                <p className="text-sm font-medium text-slate-800">{equipos.find(e => e.id === alertaParaSolicitud.equipo_id) ? `${equipos.find(e => e.id === alertaParaSolicitud.equipo_id).marca} ${equipos.find(e => e.id === alertaParaSolicitud.equipo_id).modelo}` : "Sin equipo"}</p>
                <p className="text-xs text-slate-500">{alertaParaSolicitud.centro}</p>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-2">Tipo de Solicitud *</label>
                <select className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm" value={formSol.tipo} onChange={e => setFormSol(f => ({...f, tipo: e.target.value}))}>
                  <option value="cambio_parches_adulto">Reposición Parches Adulto</option>
                  <option value="cambio_parches_pediatrico">Reposición Parches Pediátrico</option>
                  <option value="reemplazo_bateria">Reemplazo de Batería</option>
                  <option value="mantenimiento_preventivo">Mantenimiento Preventivo</option>
                  <option value="mantenimiento_correctivo">Reparación / Mantenimiento Correctivo</option>
                  <option value="revision_tecnica">Revisión Técnica</option>
                  <option value="otros">Otros</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-2">Observaciones</label>
                <textarea rows={3} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" value={formSol.observaciones} onChange={e => setFormSol(f => ({...f, observaciones: e.target.value}))} placeholder="Describe el requerimiento..." />
              </div>
              <div className="flex gap-3">
                <button onClick={() => setAlertaParaSolicitud(null)} className="flex-1 py-2.5 rounded-xl text-sm font-medium text-slate-600 border border-slate-200">Cancelar</button>
                <button onClick={handleCrearSolicitudRapida} disabled={guardandoSolRapida || !formSol.tipo} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60" style={{ background: "#1565c0" }}>
                  {guardandoSolRapida ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {guardandoSolRapida ? "Guardando..." : "Crear Solicitud"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Gestionar Solicitud (solo admin) */}
      {gestionando && isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md">
            <div className="px-7 pt-7 pb-4 border-b border-slate-100 flex items-center justify-between" style={{ background: "linear-gradient(135deg, #1a2e4a, #1565c0)", borderRadius: "1.5rem 1.5rem 0 0" }}>
              <h2 className="text-lg font-bold text-white">Gestionar Solicitud</h2>
              <button onClick={() => setGestionando(null)}><X className="w-5 h-5 text-white/70 hover:text-white" /></button>
            </div>
            <div className="px-7 py-5 space-y-4">
              <div className="bg-slate-50 rounded-xl p-3 text-sm text-slate-700">
                <p className="font-semibold">{gestionando.tipo?.replace(/_/g, " ")}</p>
                <p className="text-xs text-slate-500 mt-0.5">{gestionando.centro} · Solicitante: {gestionando.usuario_nombre || gestionando.usuario_email}</p>
                {gestionando.observaciones && <p className="text-xs text-slate-400 mt-1">{gestionando.observaciones}</p>}
                {gestionando.alerta_id && <p className="text-xs text-amber-600 mt-1">⚠ Solicitud vinculada a una alerta — al finalizar se resolverá automáticamente</p>}
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-2">Estado</label>
                <select className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm" value={nuevoEstado} onChange={e => setNuevoEstado(e.target.value)}>
                  <option value="pendiente">Pendiente</option>
                  <option value="en_proceso">En Proceso</option>
                  <option value="finalizada">Finalizada</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-2">Respuesta / Comentario</label>
                <textarea rows={3} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" value={respuestaAdmin} onChange={e => setRespuestaAdmin(e.target.value)} placeholder="Escribe una respuesta..." />
              </div>
              <div className="flex gap-3">
                <button onClick={() => setGestionando(null)} className="flex-1 py-2.5 rounded-xl text-sm font-medium text-slate-600 border border-slate-200">Cancelar</button>
                <button onClick={handleGestionarSolicitud} disabled={guardandoSol} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60" style={{ background: "#1565c0" }}>
                  {guardandoSol ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {guardandoSol ? "Guardando..." : "Guardar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Crear Alerta */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-7 pt-7 pb-4 border-b border-slate-100 flex items-center justify-between" style={{ background: "linear-gradient(135deg, #1a2e4a, #1565c0)", borderRadius: "1.5rem 1.5rem 0 0" }}>
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2"><Plus className="w-5 h-5" /> Crear Alerta</h2>
                <p className="text-blue-200 text-xs mt-0.5">Notifica a los usuarios sobre un problema</p>
              </div>
              <button onClick={() => setShowModal(false)}><X className="w-5 h-5 text-white/70 hover:text-white" /></button>
            </div>
            <div className="px-7 py-6 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-2">Tipo de Problema</label>
                <select className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" value={form.tipo} onChange={e => setForm(f=>({...f, tipo: e.target.value}))}>
                  {TIPOS_ALERTA.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-2">Nivel de Urgencia</label>
                <select className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" value={form.nivel} onChange={e => setForm(f=>({...f, nivel: e.target.value}))}>
                  <option value="critica">Crítica</option>
                  <option value="advertencia">Advertencia</option>
                  <option value="info">Informativa</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-2">Equipo Afectado (opcional)</label>
                <select className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" value={form.equipo_id} onChange={e => setForm(f=>({...f, equipo_id: e.target.value}))}>
                  <option value="">Sin equipo específico</option>
                  {equipos.map(e => <option key={e.id} value={e.id}>{e.marca} {e.modelo} – {e.numero_inventario}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-2">Descripción *</label>
                <textarea className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none" rows={3} placeholder="Describe el problema o la alerta..." value={form.descripcion} onChange={e => setForm(f=>({...f, descripcion: e.target.value}))} />
              </div>

              {/* Destinatarios */}
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-2 flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> Notificar por email (opcional)</label>
                {usuarios.length === 0 ? (
                  <p className="text-xs text-slate-400">No hay usuarios registrados</p>
                ) : (
                  <div className="space-y-2 max-h-40 overflow-y-auto border border-slate-100 rounded-xl p-3">
                    {usuarios.map(u => {
                      const sel = form.destinatarios.includes(u.email);
                      return (
                        <label key={u.id} className="flex items-center gap-3 cursor-pointer">
                          <input type="checkbox" checked={sel} onChange={() => toggleDestinatario(u.email)} className="rounded" />
                          <div>
                            <p className="text-sm font-medium text-slate-700">{u.full_name || u.email}</p>
                            <p className="text-xs text-slate-400">{u.email} · {u.role}</p>
                          </div>
                        </label>
                      );
                    })}
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
                disabled={guardando || !form.descripcion}
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