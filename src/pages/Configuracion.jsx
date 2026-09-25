import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Upload, Loader2, Save, Settings, Users, Shield, Trash2, AlertTriangle, Car, ExternalLink, Copy, CheckCircle, Download, Building2 } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import GestionSedes from "@/components/configuracion/GestionSedes";
import BackupSection from "@/components/configuracion/BackupSection";
import DatosDePruebaSection from "@/components/configuracion/DatosDePruebaSection";
import ResumenDiarioSection from "@/components/configuracion/ResumenDiarioSection";
import { QRCodeSVG } from "qrcode.react";
import { useAuth } from "@/lib/AuthContext";
import { esAdministrador } from "@/lib/roles";

export default function Configuracion() {
  const { user } = useAuth();
  const [config, setConfig] = useState(null);
  const [form, setForm]     = useState({ nombre_app: "", subtitulo: "", logo_url: "" });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);

  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const init = async () => {
      // Este chequeo decía solo "admin", pero el de más abajo que decide si la
      // pantalla se muestra (y el menú que trae hasta acá) incluyen a Base del
      // Sistema. Resultado: entraba, y encontraba la lista de usuarios vacía y
      // la personalización sin cargar, porque los datos nunca se pedían.
      if (!esAdministrador(user?.role)) return;
      const configs = await base44.entities.AppConfig.list();
      if (configs.length > 0) {
        setConfig(configs[0]);
        setForm({ nombre_app: configs[0].nombre_app || "", subtitulo: configs[0].subtitulo || "", logo_url: configs[0].logo_url || "" });
      }
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
    try {
      if (config?.id) {
        await base44.entities.AppConfig.update(config.id, form);
      } else {
        const newConfig = await base44.entities.AppConfig.create(form);
        setConfig(newConfig);
      }
      setSaved(true);
      setTimeout(() => window.location.reload(), 1200);
    } catch {
      // El aviso con el motivo lo da base44Client. Aca solo se suelta el
      // boton, que sin esto quedaba en "Guardando..." para siempre.
    } finally {
      setSaving(false);
    }
  };

  if (!user) return <div className="flex items-center justify-center min-h-screen"><div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>;

  if (!esAdministrador(user?.role)) return (
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

        {/* Las cuentas se administran en Usuarios. Acá había una copia vieja
            (de Base44) que cambiaba roles y borraba fichas escribiendo directo
            en la base: se saltaba la matriz de quién crea a quién y, al borrar,
            dejaba la cuenta de acceso viva sin ficha. */}
        <div className="bg-white rounded-3xl shadow-lg p-5 lg:p-8 space-y-3">
          <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-500" /> Cuentas de acceso
          </h2>
          <p className="text-sm text-slate-500">
            Crear cuentas, cambiar roles o centros, suspender y eliminar se hace desde <strong>Usuarios</strong>,
            respetando quién puede asignar cada rol.
          </p>
          <Link to={createPageUrl("Usuarios")}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700">
            <Users className="w-4 h-4" /> Ir a Usuarios
          </Link>
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

        {/* Resumen diario de pendientes por correo */}
        <ResumenDiarioSection />

        {/* Datos de prueba (migraciones 19 y 22) */}
        <DatosDePruebaSection />

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