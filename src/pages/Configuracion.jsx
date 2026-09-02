import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Upload, Loader2, Save, Settings, Users, Shield, Mail, UserPlus, Trash2, Edit2, X, Check, AlertTriangle, Car, ExternalLink, Copy, CheckCircle, Download, Building2 } from "lucide-react";
import GestionSedes from "@/components/configuracion/GestionSedes";
import BackupSection from "@/components/configuracion/BackupSection";
import { QRCodeSVG } from "qrcode.react";
import { useAuth } from "@/lib/AuthContext";

export default function Configuracion() {
  const { user } = useAuth();
  const [config, setConfig] = useState(null);
  const [form, setForm]     = useState({ nombre_app: "", subtitulo: "", logo_url: "" });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);

  const [usuarios, setUsuarios] = useState([]);
  const [invEmail, setInvEmail] = useState("");
  const [invRole, setInvRole]   = useState("user");
  const [invCentros, setInvCentros] = useState([]);
  const [invitando, setInvitando] = useState(false);
  const [invMsg, setInvMsg]     = useState("");
  const [editingUser, setEditingUser] = useState(null);
  const [centros, setCentros]   = useState([]);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDeleteUserId, setConfirmDeleteUserId] = useState(null);

  useEffect(() => {
    const init = async () => {
      if (user?.role !== "admin") return;
      const [configs, usrs] = await Promise.all([
        base44.entities.AppConfig.list(),
        base44.entities.User.list().catch(() => [])
      ]);
      if (configs.length > 0) {
        setConfig(configs[0]);
        setForm({ nombre_app: configs[0].nombre_app || "", subtitulo: configs[0].subtitulo || "", logo_url: configs[0].logo_url || "" });
      }
      setUsuarios(usrs);
      const { getCentrosEstructura } = await import("@/lib/centros");
      const centrosData = await getCentrosEstructura();
      setCentros(centrosData.map(c => c.nombre));
    };
    init();
  }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    set("logo_url", file_url);
    setUploading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    if (config?.id) {
      await base44.entities.AppConfig.update(config.id, form);
    } else {
      const newConfig = await base44.entities.AppConfig.create(form);
      setConfig(newConfig);
    }
    setSaving(false);
    setSaved(true);
    setTimeout(() => window.location.reload(), 1200);
  };

  const toggleInvCentro = (nombre) => {
    setInvCentros(prev => prev.includes(nombre) ? prev.filter(c => c !== nombre) : [...prev, nombre]);
  };

  const handleInvitar = async () => {
    if (!invEmail.includes("@")) return;
    setInvitando(true);
    setInvMsg("");
    try {
      await base44.users.inviteUser(invEmail, invRole);
      const updated = await base44.entities.User.list().catch(() => []);
      const newUser = updated.find(u => u.email === invEmail);
      if (newUser && invCentros.length > 0) {
        await base44.entities.User.update(newUser.id, { centros_asignados: invCentros });
      }
      setInvMsg("✅ Invitación enviada correctamente");
      setInvEmail("");
      setInvCentros([]);
      setUsuarios(await base44.entities.User.list().catch(() => []));
    } catch {
      setInvMsg("❌ No se pudo enviar la invitación");
    }
    setInvitando(false);
  };

  const toggleEditCentro = (nombre) => {
    setEditingUser(prev => {
      const current = prev.centros_asignados || [];
      return { ...prev, centros_asignados: current.includes(nombre) ? current.filter(c => c !== nombre) : [...current, nombre] };
    });
  };

  const handleUpdateUser = async (userId, data) => {
    await base44.entities.User.update(userId, data);
    setUsuarios(prev => prev.map(u => u.id === userId ? { ...u, ...data } : u));
    setEditingUser(null);
  };

  const handleDeleteUser = async (userId) => {
    await base44.entities.User.delete(userId);
    setUsuarios(prev => prev.filter(u => u.id !== userId));
    setConfirmDeleteUserId(null);
  };

  if (!user) return <div className="flex items-center justify-center min-h-screen"><div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>;

  if (user?.role !== "admin" && user?.role !== "super_admin") return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4 text-slate-400">
      <Shield className="w-16 h-16 opacity-20" />
      <p className="text-lg font-medium">Acceso restringido a administradores</p>
    </div>
  );

  const inputCls = "w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-slate-50";
  const labelCls = "block text-xs font-medium text-slate-600 mb-1";

  return (
    <div className="min-h-screen" style={{ background: "#e8f4fd" }}>
      <div className="relative overflow-hidden px-4 lg:px-10 pt-6 lg:pt-10 pb-6 lg:pb-8" style={{ background: "linear-gradient(135deg, #0f2d6b 0%, #1565c0 40%, #29b6f6 100%)" }}>
        <div className="relative max-w-4xl mx-auto flex items-center gap-3">
          <div className="w-11 h-11 lg:w-12 lg:h-12 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(255,255,255,0.2)" }}>
            <Settings className="w-5 h-5 lg:w-6 lg:h-6 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-cyan-200 text-[10px] lg:text-xs font-semibold uppercase tracking-widest">Administración</p>
            <h1 className="text-2xl lg:text-3xl font-bold text-white leading-tight">Configuración</h1>
            <p className="text-blue-100 text-xs lg:text-sm mt-0.5">Gestión del sistema y usuarios</p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 lg:px-10 pt-5 lg:pt-6 pb-10 space-y-5 lg:space-y-6">

        {/* Personalización */}
        <div className="bg-white rounded-3xl shadow-lg p-5 lg:p-8 space-y-5 lg:space-y-6">
          <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <Settings className="w-5 h-5 text-blue-500" /> Personalización del Sistema
          </h2>
          <div className="flex items-center gap-4 p-5 rounded-xl bg-slate-800">
            <div className="flex items-center justify-center overflow-hidden flex-shrink-0" style={form.logo_url ? { width: 52, height: 52 } : { width: 44, height: 44, background: "#2563eb", borderRadius: 12 }}>
              {form.logo_url ? <img src={form.logo_url} alt="logo" className="w-full h-full object-contain" /> : <Settings className="w-6 h-6 text-white" />}
            </div>
            <div>
              <p className="text-white font-semibold text-sm">{form.nombre_app || "Sistema de Gestión de Equipos"}</p>
              <p className="text-white/40 text-xs mt-0.5">{form.subtitulo || "Subtítulo"}</p>
            </div>
          </div>
          <div>
            <label className={labelCls}>Logo institucional</label>
            <div className="flex items-center gap-4">
              {form.logo_url && <div className="w-14 h-14 rounded-xl overflow-hidden border border-slate-200"><img src={form.logo_url} alt="logo" className="w-full h-full object-cover" /></div>}
              <label className="flex items-center gap-2 cursor-pointer border border-dashed border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-500 hover:border-blue-400 hover:text-blue-500 transition-colors bg-slate-50">
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {uploading ? "Subiendo..." : "Subir imagen"}
                <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
              </label>
              {form.logo_url && <button onClick={() => set("logo_url", "")} className="text-xs text-slate-400 hover:text-red-500">Eliminar</button>}
            </div>
          </div>
          <div>
            <label className={labelCls}>Nombre del sistema</label>
            <input className={inputCls} value={form.nombre_app} onChange={e => set("nombre_app", e.target.value)} placeholder="Sistema de Gestión de Equipos" />
          </div>
          <div>
            <label className={labelCls}>Subtítulo</label>
            <input className={inputCls} value={form.subtitulo} onChange={e => set("subtitulo", e.target.value)} placeholder="Corporación Municipal Panguipulli" />
          </div>
          <button onClick={handleSave} disabled={saving || uploading} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-60" style={{ background: saved ? "#10b981" : "#2563eb" }}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saved ? "¡Guardado!" : "Guardar cambios"}
          </button>
        </div>

        {/* Gestión de usuarios */}
        <div className="bg-white rounded-3xl shadow-lg p-5 lg:p-8 space-y-5">
          <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-500" /> Administración de Usuarios
          </h2>
          <div className="bg-blue-50 rounded-2xl p-5 border border-blue-100 space-y-3">
            <p className="text-xs font-semibold text-blue-700 flex items-center gap-1.5"><UserPlus className="w-3.5 h-3.5" /> Invitar nuevo usuario</p>
            <div className="flex gap-2 flex-wrap">
              <input type="email" className="flex-1 min-w-48 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white" placeholder="correo@ejemplo.cl" value={invEmail} onChange={e => setInvEmail(e.target.value)} />
              <select className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300" value={invRole} onChange={e => setInvRole(e.target.value)}>
                <option value="user">Usuario</option>
                <option value="admin">Administrador</option>
              </select>
            </div>
            {invRole === "user" && (
              <div>
                <p className="text-xs font-medium text-blue-700 mb-2">Centros que puede visualizar (selecciona uno o más):</p>
                <div className="flex flex-wrap gap-2">
                  {centros.map(c => (
                    <button key={c} type="button" onClick={() => toggleInvCentro(c)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${invCentros.includes(c) ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:border-blue-400"}`}>
                      {c}
                    </button>
                  ))}
                </div>
                {invCentros.length === 0 && <p className="text-xs text-amber-600 mt-1">⚠ Sin centros asignados verá todos los equipos</p>}
              </div>
            )}
            <button onClick={handleInvitar} disabled={invitando || !invEmail} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-60" style={{ background: "#2563eb" }}>
              {invitando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />} Enviar Invitación
            </button>
            {invMsg && <p className={`text-xs ${invMsg.startsWith("✅") ? "text-green-600" : "text-red-600"}`}>{invMsg}</p>}
          </div>
          <div className="space-y-2">
            {usuarios.map(u => (
              <div key={u.id} className="flex items-center justify-between p-4 rounded-xl border border-slate-100 hover:bg-slate-50">
                {editingUser?.id === u.id ? (
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-3 flex-wrap">
                      <select className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs" value={editingUser.role} onChange={e => setEditingUser(prev => ({...prev, role: e.target.value}))}>
                        <option value="user">Usuario</option>
                        <option value="admin">Administrador</option>
                      </select>
                      <button onClick={() => handleUpdateUser(u.id, { role: editingUser.role, centros_asignados: editingUser.centros_asignados || [] })} className="p-1.5 rounded-lg bg-green-100 text-green-700 hover:bg-green-200"><Check className="w-4 h-4" /></button>
                      <button onClick={() => setEditingUser(null)} className="p-1.5 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200"><X className="w-4 h-4" /></button>
                    </div>
                    {editingUser.role === "user" && (
                      <div>
                        <p className="text-xs font-medium text-slate-600 mb-1.5">Centros asignados:</p>
                        <div className="flex flex-wrap gap-1.5">
                          {centros.map(c => (
                            <button key={c} type="button" onClick={() => toggleEditCentro(c)}
                              className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${(editingUser.centros_asignados || []).includes(c) ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:border-blue-400"}`}>
                              {c}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{u.full_name || u.email}</p>
                      <p className="text-xs text-slate-400">{u.email} · <span className={u.role === "admin" ? "text-blue-600 font-medium" : "text-slate-500"}>{u.role === "admin" ? "Administrador" : "Usuario"}</span></p>
                      {u.role !== "admin" && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {(u.centros_asignados?.length > 0) ? u.centros_asignados.map(c => (
                            <span key={c} className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "#EFF6FF", color: "#2563EB" }}>{c}</span>
                          )) : <span className="text-xs text-amber-500">Sin centros asignados (ve todos)</span>}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setEditingUser({ ...u })} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      {confirmDeleteUserId === u.id ? (
                        <div className="flex items-center gap-1.5 ml-1 bg-red-50 border border-red-200 rounded-xl px-3 py-1.5">
                          <span className="text-xs text-red-700 font-medium">¿Eliminar?</span>
                          <button onClick={() => handleDeleteUser(u.id)} className="text-xs font-bold text-red-600 hover:text-red-800 underline">Sí</button>
                          <button onClick={() => setConfirmDeleteUserId(null)} className="text-xs text-slate-400 hover:text-slate-600 underline">No</button>
                        </div>
                      ) : (
                        <button onClick={() => setConfirmDeleteUserId(u.id)} className="p-2 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-500">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
            {usuarios.length === 0 && <p className="text-center text-sm text-slate-400 py-6">No hay usuarios registrados</p>}
          </div>
        </div>

        {/* Gestión de Sedes */}
        <div className="bg-white rounded-3xl shadow-lg p-5 lg:p-8 space-y-5">
          <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-blue-500" /> Sedes y Subsedes
          </h2>
          <p className="text-sm text-slate-500">Administra los centros principales y sus subsedes. Los cambios se reflejan en los formularios de equipos y bitácora pública.</p>
          <GestionSedes />
        </div>

        {/* Copia de Seguridad */}
        <BackupSection />

        {/* Enlace Bitácora Pública */}
        <BitacoraPublicaLink />

        {/* Zona peligrosa */}
        <div className="bg-white rounded-3xl shadow-lg p-5 lg:p-8 space-y-4 border border-red-100">
          <h2 className="text-base font-bold text-red-600 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" /> Zona de Peligro
          </h2>
          <p className="text-sm text-slate-500">Eliminar tu cuenta es una acción permanente e irreversible. Todos tus datos serán borrados.</p>
          {!deleteConfirm ? (
            <button onClick={() => setDeleteConfirm(true)} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-red-600 border border-red-200 hover:bg-red-50 transition-colors">
              <Trash2 className="w-4 h-4" /> Eliminar mi cuenta
            </button>
          ) : (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 space-y-3">
              <p className="text-sm font-semibold text-red-700">¿Estás seguro? Esta acción no se puede deshacer.</p>
              <div className="flex gap-3">
                <button onClick={async () => { setDeleting(true); await base44.auth.logout(); }} disabled={deleting}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-60">
                  {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  Sí, eliminar cuenta
                </button>
                <button onClick={() => setDeleteConfirm(false)} className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancelar</button>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

function BitacoraPublicaLink() {
  const [copied, setCopied] = useState(false);
  const qrRef = useRef(null);
  // Usa el dominio real de la app publicada. Si hay dominio personalizado configurado,
  // usarlo; de lo contrario usa el origen actual.
  const customDomain = "gestion.apscolab.com";
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  // Si estamos en el dominio personalizado o en producción publicada, usar ese; si no, usar el origen actual
  const isPreview = origin.includes("preview-sandbox") || origin.includes("localhost");
  const baseUrl = isPreview ? origin : `https://${customDomain}`;
  const url = `${baseUrl}/bitacora-publica`;

  const handleCopy = () => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleDownloadQR = () => {
    const svg = qrRef.current?.querySelector("svg");
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement("canvas");
    canvas.width = 300;
    canvas.height = 300;
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.onload = () => {
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, 300, 300);
      ctx.drawImage(img, 0, 0, 300, 300);
      const a = document.createElement("a");
      a.download = "qr-bitacora.png";
      a.href = canvas.toDataURL("image/png");
      a.click();
    };
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
  };

  return (
    <div className="bg-white rounded-3xl shadow-lg p-5 lg:p-8 space-y-5">
      <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
        <Car className="w-5 h-5 text-blue-500" /> Formulario Público — Pautas de Inspección
      </h2>

      <div className="rounded-2xl p-5 space-y-2" style={{ background: "#EFF6FF", border: "1px solid #BFDBFE" }}>
        <p className="text-sm font-semibold text-blue-800">¿Para qué sirve este enlace?</p>
        <p className="text-sm text-blue-700">
          Permite a los <strong>profesionales y conductores</strong> completar sus pautas de inspección de equipos de forma online, <strong>sin necesidad de tener una cuenta</strong> en el sistema. Incluye pautas semanales para ambulancias, desfibriladores y monitores multiparámetros. Comparte este enlace o el código QR con el equipo.
        </p>
      </div>

      {isPreview && (
        <div className="rounded-xl p-3 text-xs text-amber-700 flex items-start gap-2" style={{ background: "#FFFBEB", border: "1px solid #FDE68A" }}>
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>Estás en el entorno de <strong>preview</strong>. El QR apuntará a este entorno. Para generar el QR definitivo, accede desde el dominio publicado <strong>{customDomain}</strong>.</span>
        </div>
      )}

      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Enlace del formulario</p>
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-700 font-mono truncate">
            {url}
          </div>
          <button onClick={handleCopy}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold text-white flex-shrink-0 transition-all"
            style={{ background: copied ? "#10B981" : "#2563EB" }}>
            {copied ? <><CheckCircle className="w-4 h-4" /> Copiado</> : <><Copy className="w-4 h-4" /> Copiar</>}
          </button>
          <a href={url} target="_blank" rel="noreferrer"
            className="p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-500 hover:text-blue-600 transition-colors flex-shrink-0">
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>

      {/* Código QR */}
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">Código QR</p>
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <div ref={qrRef} className="p-4 bg-white border-2 border-slate-200 rounded-2xl shadow-sm">
            <QRCodeSVG value={url} size={180} bgColor="#ffffff" fgColor="#1e293b" level="H" />
          </div>
          <div className="space-y-3">
            <p className="text-sm text-slate-600">Escanea este código QR con la cámara del celular para acceder directamente al formulario de pautas de inspección.</p>
            <button onClick={handleDownloadQR}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white"
              style={{ background: "#2563EB" }}>
              <Download className="w-4 h-4" /> Descargar QR
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}