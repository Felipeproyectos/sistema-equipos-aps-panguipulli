import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { AlertTriangle, CheckCircle, Clock, Send, Loader2, Mail, X, ChevronDown, Users, Zap } from "lucide-react";
import { differenceInDays, parseISO, format } from "date-fns";

export default function Alertas() {
  const [parches, setParches] = useState([]);
  const [equipos, setEquipos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState("todos");
  const [enviando, setEnviando] = useState(false);
  const [mensajeEnvio, setMensajeEnvio] = useState("");
  const [showNotifModal, setShowNotifModal] = useState(false);
  const [centros, setCentros] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [modoNotif, setModoNotif] = useState("masiva"); // 'masiva' | 'individual'
  const [cesfamSeleccionado, setCesfamSeleccionado] = useState("");
  const [emailManual, setEmailManual] = useState("");
  const [emailsExtra, setEmailsExtra] = useState([]);

  useEffect(() => {
    Promise.all([
      base44.entities.Equipo.filter({ tipo: "dea" }),
      base44.entities.Parche.list(),
      base44.entities.Centro.list().catch(() => []),
      base44.entities.User.list().catch(() => [])
    ]).then(([equipos, parches, centros, usuarios]) => {
      setEquipos(equipos);
      setParches(parches);
      setCentros(centros);
      setUsuarios(usuarios);
      setLoading(false);
    });
  }, []);

  const hoy = new Date();

  const addEmailExtra = () => {
    const e = emailManual.trim().toLowerCase();
    if (!e || !e.includes('@') || emailsExtra.includes(e)) return;
    setEmailsExtra(prev => [...prev, e]);
    setEmailManual("");
  };

  const handleEnviarAlertas = async (cesfamFiltro = null) => {
    setEnviando(true);
    setMensajeEnvio("");
    setShowNotifModal(false);
    const payload = {
      ...(cesfamFiltro ? { cesfam: cesfamFiltro } : {}),
      ...(emailsExtra.length > 0 ? { emails_extra: emailsExtra } : {})
    };
    const res = await base44.functions.invoke('enviarAlertasCESFAM', payload);
    const enviados = res.data?.enviados ?? 0;
    setMensajeEnvio(enviados > 0 ? `✅ Alertas enviadas a ${enviados} correo(s)` : '⚠️ No se encontraron destinatarios configurados');
    setEmailsExtra([]);
    setEnviando(false);
  };

  const getEstadoParche = (p) => {
    const dias = differenceInDays(parseISO(p.fecha_vencimiento), hoy);
    if (dias < 0) return { tipo: "vencido", dias, label: "Vencido", color: "text-red-700 bg-red-50 border-red-200", dot: "bg-red-500", icon: AlertTriangle };
    if (dias <= 30) return { tipo: "critico", dias, label: `Vence en ${dias} días`, color: "text-red-600 bg-red-50 border-red-100", dot: "bg-red-400", icon: AlertTriangle };
    if (dias <= 90) return { tipo: "proximo", dias, label: `Vence en ${dias} días`, color: "text-amber-700 bg-amber-50 border-amber-200", dot: "bg-amber-400", icon: Clock };
    return { tipo: "ok", dias, label: `Vigente — ${dias} días`, color: "text-green-700 bg-green-50 border-green-200", dot: "bg-green-400", icon: CheckCircle };
  };

  const parchesConEstado = parches
    .filter(p => p.fecha_vencimiento)
    .map(p => ({ ...p, estado: getEstadoParche(p) }))
    .sort((a, b) => a.estado.dias - b.estado.dias);

  const filtrados = filtro === "todos"
    ? parchesConEstado
    : parchesConEstado.filter(p => p.estado.tipo === filtro);

  const counts = {
    vencido: parchesConEstado.filter(p => p.estado.tipo === "vencido").length,
    critico: parchesConEstado.filter(p => p.estado.tipo === "critico").length,
    proximo: parchesConEstado.filter(p => p.estado.tipo === "proximo").length,
    ok: parchesConEstado.filter(p => p.estado.tipo === "ok").length,
  };

  const tabs = [
    { key: "todos", label: "Todos", count: parchesConEstado.length },
    { key: "vencido", label: "Vencidos", count: counts.vencido },
    { key: "critico", label: "Críticos (≤30d)", count: counts.critico },
    { key: "proximo", label: "Próximos (≤90d)", count: counts.proximo },
    { key: "ok", label: "Vigentes", count: counts.ok },
  ];

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen" style={{ background: "#e8f4fd" }}>
      {/* Header */}
      <div className="relative overflow-hidden px-6 lg:px-10 pt-10 pb-8" style={{ background: "linear-gradient(135deg, #0f2d6b 0%, #1565c0 40%, #29b6f6 100%)" }}>
        <div className="absolute right-8 top-1/2 -translate-y-1/2 w-56 h-56 rounded-full opacity-20 border-4 border-white" />
        <div className="absolute right-4 bottom-0 w-72 h-72 rounded-full opacity-10" style={{ background: "radial-gradient(circle, #29b6f6 0%, transparent 70%)" }} />
        <div className="relative max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: "rgba(255,255,255,0.2)" }}>
              <AlertTriangle className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-cyan-200 text-xs font-semibold uppercase tracking-widest">Monitoreo</p>
              <h1 className="text-3xl font-bold text-white">Alertas de Vencimiento</h1>
              <p className="text-blue-100 text-sm mt-0.5">Control de vencimiento de parches por equipo</p>
            </div>
          </div>
          <div>
            <button
              onClick={() => setShowNotifModal(true)}
              disabled={enviando}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold shadow-sm disabled:opacity-60"
              style={{ background: "rgba(255,255,255,0.2)", color: "white", border: "1px solid rgba(255,255,255,0.3)" }}
            >
              {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
              {enviando ? "Enviando..." : "Notificar por Email"}
              {!enviando && <ChevronDown className="w-3.5 h-3.5 opacity-70" />}
            </button>
            {mensajeEnvio && (
              <div className={`mt-2 px-4 py-2 rounded-xl text-xs font-medium inline-flex items-center gap-2 ${mensajeEnvio.startsWith('✅') ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                {mensajeEnvio}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 lg:px-10 pt-6 pb-10">
      <div className="mb-0">

      {/* Modal de Notificación */}
      {showNotifModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-7 pt-7 pb-4 border-b border-slate-100 flex items-center justify-between" style={{ background: "linear-gradient(135deg, #0f2d6b, #1565c0)" }}>
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2"><Mail className="w-5 h-5" /> Enviar Notificaciones</h2>
                <p className="text-blue-200 text-xs mt-0.5">Selecciona el modo de envío</p>
              </div>
              <button onClick={() => setShowNotifModal(false)}><X className="w-5 h-5 text-white/70 hover:text-white" /></button>
            </div>
            <div className="px-7 py-6 space-y-4">
              {/* Modo de envío */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setModoNotif('masiva')}
                  className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all ${
                    modoNotif === 'masiva' ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <Zap className={`w-6 h-6 ${modoNotif === 'masiva' ? 'text-blue-600' : 'text-slate-400'}`} />
                  <span className={`text-sm font-semibold ${modoNotif === 'masiva' ? 'text-blue-700' : 'text-slate-600'}`}>Masiva</span>
                  <span className="text-xs text-slate-400 text-center">Todos los CESFAM con alertas</span>
                </button>
                <button
                  onClick={() => setModoNotif('individual')}
                  className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all ${
                    modoNotif === 'individual' ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <Users className={`w-6 h-6 ${modoNotif === 'individual' ? 'text-blue-600' : 'text-slate-400'}`} />
                  <span className={`text-sm font-semibold ${modoNotif === 'individual' ? 'text-blue-700' : 'text-slate-600'}`}>Individual</span>
                  <span className="text-xs text-slate-400 text-center">Seleccionar CESFAM específico</span>
                </button>
              </div>

              {/* Selección individual */}
              {modoNotif === 'individual' && (
                <div>
                  <label className="text-xs font-semibold text-slate-600 mb-2 block">Seleccionar Centro</label>
                  {centros.filter(c => c.emails_contacto?.length).length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-3 bg-slate-50 rounded-xl">No hay centros con correos configurados.<br/>Ve a Centros de Salud para agregarlos.</p>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {centros.filter(c => c.emails_contacto?.length).map(c => (
                        <button
                          key={c.id}
                          onClick={() => setCesfamSeleccionado(c.nombre)}
                          className={`w-full flex items-start gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                            cesfamSeleccionado === c.nombre ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <Mail className={`w-4 h-4 mt-0.5 flex-shrink-0 ${cesfamSeleccionado === c.nombre ? 'text-blue-600' : 'text-slate-400'}`} />
                          <div>
                            <p className={`text-sm font-semibold ${cesfamSeleccionado === c.nombre ? 'text-blue-700' : 'text-slate-700'}`}>{c.nombre}</p>
                            <p className="text-xs text-slate-400">{c.emails_contacto?.join(', ')}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Correos extra - usuarios del sistema + manual */}
              <div className="border-t border-slate-100 pt-4">
                <label className="text-xs font-semibold text-slate-600 mb-2 block">Destinatarios adicionales (opcional)</label>
                
                {/* Usuarios del sistema */}
                {usuarios.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs text-slate-400 mb-2">Usuarios del sistema:</p>
                    <div className="flex flex-wrap gap-2">
                      {usuarios.map(u => {
                        const email = u.email;
                        const selected = emailsExtra.includes(email);
                        return (
                          <button
                            key={u.id}
                            onClick={() => {
                              if (selected) {
                                setEmailsExtra(prev => prev.filter(x => x !== email));
                              } else {
                                setEmailsExtra(prev => [...prev, email]);
                              }
                            }}
                            className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full border transition-all ${
                              selected
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-blue-300'
                            }`}
                          >
                            <Mail className="w-3 h-3" />
                            <span className="font-medium">{u.full_name || email}</span>
                            {selected && <X className="w-3 h-3" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Correo manual */}
                <div className="flex gap-2">
                  <input
                    type="email"
                    className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-slate-50"
                    placeholder="Agregar correo manual..."
                    value={emailManual}
                    onChange={e => setEmailManual(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addEmailExtra()}
                  />
                  <button
                    onClick={addEmailExtra}
                    className="px-3 py-2 rounded-xl text-sm font-semibold text-white"
                    style={{ background: '#1565c0' }}
                  >Agregar</button>
                </div>
                {emailsExtra.filter(e => !usuarios.find(u => u.email === e)).length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {emailsExtra.filter(e => !usuarios.find(u => u.email === e)).map(e => (
                      <span key={e} className="flex items-center gap-1.5 bg-blue-50 text-blue-700 text-xs px-2.5 py-1 rounded-full border border-blue-200">
                        <Mail className="w-3 h-3" />{e}
                        <button onClick={() => setEmailsExtra(prev => prev.filter(x => x !== e))}><X className="w-3 h-3 hover:text-red-500" /></button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Resumen */}
              {modoNotif === 'masiva' && (
                <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
                  <p className="text-xs text-blue-700">Se notificará a los correos configurados en <strong>{centros.filter(c => c.emails_contacto?.length).length} centro(s)</strong>{emailsExtra.length > 0 ? ` + ${emailsExtra.length} correo(s) manual(es)` : ''}.</p>
                </div>
              )}
            </div>
            <div className="px-7 pb-7 flex gap-3">
              <button onClick={() => setShowNotifModal(false)} className="flex-1 py-2.5 rounded-xl text-sm font-medium text-slate-600 border border-slate-200 hover:bg-slate-50">Cancelar</button>
              <button
                onClick={() => handleEnviarAlertas(modoNotif === 'individual' ? cesfamSeleccionado : null)}
                disabled={enviando || (modoNotif === 'individual' && !cesfamSeleccionado)}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
                style={{ background: "linear-gradient(135deg, #1565c0, #0288d1)" }}
              >
                {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Enviar Alerta
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-3xl shadow-lg p-6">
      {/* Resumen */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        {[
          { label: "Vencidos", count: counts.vencido, color: "#e63946", bg: "#fff1f2" },
          { label: "Críticos", count: counts.critico, color: "#f97316", bg: "#fff7ed" },
          { label: "Próximos", count: counts.proximo, color: "#f59e0b", bg: "#fffbeb" },
          { label: "Vigentes", count: counts.ok, color: "#10b981", bg: "#ecfdf5" },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
            <p className="text-2xl font-bold" style={{ color: s.color }}>{s.count}</p>
            <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setFiltro(t.key)}
            className={`px-4 py-2 rounded-xl text-xs font-medium transition-all ${filtro === t.key ? "text-white shadow-sm" : "bg-white text-slate-500 border border-slate-200 hover:border-slate-300"}`}
            style={filtro === t.key ? { background: "#1a2e4a" } : {}}
          >
            {t.label} {t.count > 0 && <span className="ml-1 opacity-70">({t.count})</span>}
          </button>
        ))}
      </div>

      {/* Lista */}
      <div className="space-y-3">
        {filtrados.map(p => {
          const equipo = equipos.find(e => e.id === p.equipo_id);
          const Icon = p.estado.icon;
          return (
            <div key={p.id} className={`flex items-center justify-between bg-white rounded-2xl border p-5 shadow-sm ${p.estado.color.split(" ").filter(c => c.startsWith("border")).join(" ")}`}>
              <div className="flex items-center gap-4">
                <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${p.estado.dot}`} />
                <div>
                  <p className="font-semibold text-slate-900 text-sm">{equipo?.marca} {equipo?.modelo}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {equipo?.establecimiento} · Parches {p.tipo} · {p.cantidad} ud{p.cantidad > 1 ? "s" : ""}
                    {p.lote ? ` · Lote ${p.lote}` : ""}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Vencimiento: {format(parseISO(p.fecha_vencimiento), "dd/MM/yyyy")}
                  </p>
                </div>
              </div>
              <div className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full ${p.estado.color}`}>
                <Icon className="w-3.5 h-3.5" />
                {p.estado.label}
              </div>
            </div>
          );
        })}
        {filtrados.length === 0 && (
          <div className="text-center py-16 text-slate-400">
            <CheckCircle className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>No hay parches en esta categoría</p>
          </div>
        )}
      </div>
      </div>
      </div>
      </div>
    </div>
  );
}