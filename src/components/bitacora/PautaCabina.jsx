import { useRef, useState } from "react";
import { invokePublic } from "@/lib/publicFetch";
import {
  Loader2, AlertTriangle, Download, FileText, Camera, Paperclip, X, Send, Stethoscope,
} from "lucide-react";
import EquipoSelector from "./EquipoSelector";
import {
  FORMATOS, MAX_ARCHIVOS, MAX_MB, ACCEPT, TIPOS_ACEPTADOS, tipoDeArchivo, esImagen, tamanoLegible,
} from "@/lib/pautaCabina";

// Pauta de Cabina: se descarga el formato, se llena y se sube. Sirve igual en
// la página pública de pautas y en la ficha del vehículo (equipoFijo).

const COLOR = "#0E7490";
const FONDO = "#ECFEFF";
const MAX_TOTAL_MB = 20;

const hoyLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// Una foto del teléfono pesa 3 a 6 MB y no hace falta tanto para leer una
// hoja: se achica a 1800 px por lado, que se sigue leyendo bien.
async function achicarImagen(file) {
  if (!esImagen(file.type) || file.size < 600 * 1024) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const escala = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * escala);
    canvas.height = Math.round(bitmap.height * escala);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(r => canvas.toBlob(r, "image/jpeg", 0.82));
    if (!blob || blob.size >= file.size) return file;
    const nombre = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], nombre, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

const aBase64 = (file) => new Promise((resolve, reject) => {
  const lector = new FileReader();
  lector.onload = () => resolve(String(lector.result).split(",")[1] || "");
  lector.onerror = () => reject(new Error(`No se pudo leer ${file.name}`));
  lector.readAsDataURL(file);
});

function SiNo({ value, onChange }) {
  const opcion = (v, texto, activo) => (
    <button type="button" onClick={() => onChange(v)}
      className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all"
      style={value === v ? activo : { background: "white", color: "#64748B", border: "1px solid #E2E8F0" }}>
      {texto}
    </button>
  );
  return (
    <div className="flex gap-2">
      {opcion(true, "Sí", { background: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA" })}
      {opcion(false, "No", { background: "#F0FDF4", color: "#16A34A", border: "1px solid #BBF7D0" })}
    </div>
  );
}

export default function PautaCabina({ equipos = [], equipoFijo, loading, onSuccess }) {
  const [equipoId, setEquipoId] = useState(equipoFijo?.id || "");
  const [fecha, setFecha] = useState(hoyLocal());
  const [nombre, setNombre] = useState("");
  const [caducado, setCaducado] = useState(null);
  const [reponer, setReponer] = useState(null);
  const [archivos, setArchivos] = useState([]);
  const [observaciones, setObservaciones] = useState("");
  const [preparando, setPreparando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const inputArchivo = useRef(null);
  const inputCamara = useRef(null);

  const equipo = equipoFijo || equipos.find(e => e.id === equipoId);

  const agregar = async (lista) => {
    const nuevos = Array.from(lista || []);
    if (!nuevos.length) return;
    setError("");
    if (archivos.length + nuevos.length > MAX_ARCHIVOS) {
      setError(`Se pueden subir hasta ${MAX_ARCHIVOS} archivos.`);
      return;
    }
    setPreparando(true);
    const listos = [];
    for (const original of nuevos) {
      const tipo = tipoDeArchivo(original.name, original.type);
      if (!TIPOS_ACEPTADOS.includes(tipo)) {
        setError(`«${original.name}» no es PDF, Word ni foto.`);
        continue;
      }
      const file = await achicarImagen(original);
      if (file.size > MAX_MB * 1024 * 1024) {
        setError(`«${original.name}» pesa más de ${MAX_MB} MB.`);
        continue;
      }
      listos.push({ file, tipo: tipoDeArchivo(file.name, file.type), clave: `${Date.now()}-${Math.random()}` });
    }
    setArchivos(prev => [...prev, ...listos]);
    setPreparando(false);
  };

  const quitar = (clave) => setArchivos(prev => prev.filter(a => a.clave !== clave));

  const enviar = async (e) => {
    e.preventDefault();
    const nombreLimpio = nombre.trim();
    if (!equipo) return setError("Elige la ambulancia.");
    if (!fecha) return setError("Indica la fecha de revisión.");
    if (!nombreLimpio) return setError("Escribe tu nombre.");
    if (caducado === null || reponer === null) return setError("Responde las dos preguntas: material caducado y reponer material.");
    if (!archivos.length) return setError("Adjunta la pauta completada (archivo o fotos).");
    const total = archivos.reduce((s, a) => s + a.file.size, 0);
    if (total > MAX_TOTAL_MB * 1024 * 1024) return setError(`Entre todos los archivos no pueden pasar de ${MAX_TOTAL_MB} MB.`);

    setError("");
    setEnviando(true);
    try {
      const adjuntos = await Promise.all(archivos.map(async a => ({
        nombre: a.file.name, tipo: a.tipo, base64: await aBase64(a.file),
      })));
      await invokePublic("subirPautaCabina", {
        equipo_id: equipo.id,
        fecha,
        nombre: nombreLimpio,
        material_caducado: caducado,
        reponer_material: reponer,
        observaciones: observaciones.trim(),
        archivos: adjuntos,
      });
      onSuccess && onSuccess({ nombre: nombreLimpio, equipo });
    } catch (err) {
      setError(err?.data?.error || err?.message || "No se pudo enviar la pauta. Intenta de nuevo.");
    }
    setEnviando(false);
  };

  const inputCls = "w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-200 bg-slate-50";
  const labelCls = "block text-xs font-semibold text-slate-600 mb-1.5";
  const paso = (n, texto) => (
    <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800 mb-2">
      <span className="w-6 h-6 rounded-full text-white text-xs flex items-center justify-center" style={{ background: COLOR }}>{n}</span>
      {texto}
    </h3>
  );

  return (
    <form onSubmit={enviar} className="bg-white rounded-3xl shadow-2xl overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: FONDO }}>
          <Stethoscope className="w-5 h-5" style={{ color: COLOR }} />
        </div>
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Pauta de Cabina · Ambulancia</p>
          <p className="font-bold text-slate-800">Revisión de insumos de la cabina</p>
        </div>
      </div>

      {/* 1. El formato */}
      <div className="px-6 py-5 border-b border-slate-100">
        {paso(1, "Descarga el formato")}
        <p className="text-xs text-slate-500 mb-3 leading-relaxed">
          Es el formato «Revisión Ambulancia». Llénalo en el computador o imprímelo y llénalo a mano.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <a href={FORMATOS.word} download
            className="rounded-xl p-3 text-center text-sm font-bold flex flex-col items-center gap-0.5"
            style={{ background: "#EFF6FF", color: "#1D4ED8", border: "1px solid #BFDBFE" }}>
            <span className="flex items-center gap-1.5"><Download className="w-4 h-4" /> Word</span>
            <span className="text-[11px] font-medium opacity-80">para llenar en el PC</span>
          </a>
          <a href={FORMATOS.pdf} download
            className="rounded-xl p-3 text-center text-sm font-bold flex flex-col items-center gap-0.5"
            style={{ background: "#FEF2F2", color: "#B91C1C", border: "1px solid #FECACA" }}>
            <span className="flex items-center gap-1.5"><Download className="w-4 h-4" /> PDF</span>
            <span className="text-[11px] font-medium opacity-80">para imprimir</span>
          </a>
        </div>
      </div>

      {/* 2. Subirla */}
      <div className="px-6 py-5 space-y-4">
        {paso(2, "Sube la pauta completada")}

        {!equipoFijo && (
          <div>
            <label className={labelCls}>Ambulancia *</label>
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-slate-400 py-3"><Loader2 className="w-4 h-4 animate-spin" /> Cargando ambulancias...</div>
            ) : (
              <EquipoSelector equipos={equipos} value={equipoId} onChange={setEquipoId} placeholder="Selecciona la ambulancia..." />
            )}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Fecha de revisión *</label>
            <input type="date" className={inputCls} value={fecha} max={hoyLocal()} onChange={e => setFecha(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Tu nombre *</label>
            <input className={inputCls} value={nombre} maxLength={120} placeholder="Nombre y apellido"
              onChange={e => setNombre(e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>¿Hay material caducado? *</label>
            <SiNo value={caducado} onChange={setCaducado} />
          </div>
          <div>
            <label className={labelCls}>¿Hay que reponer material? *</label>
            <SiNo value={reponer} onChange={setReponer} />
          </div>
        </div>

        <div>
          <label className={labelCls}>Archivo de la pauta *</label>
          <div className="rounded-2xl p-4 text-center" style={{ border: "2px dashed #CBD5E1", background: "#F8FAFC" }}>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => inputCamara.current?.click()} disabled={preparando || archivos.length >= MAX_ARCHIVOS}
                className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-bold disabled:opacity-40"
                style={{ background: FONDO, color: COLOR, border: "1px solid #A5F3FC" }}>
                <Camera className="w-4 h-4" /> Tomar foto
              </button>
              <button type="button" onClick={() => inputArchivo.current?.click()} disabled={preparando || archivos.length >= MAX_ARCHIVOS}
                className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-bold disabled:opacity-40"
                style={{ background: "white", color: "#334155", border: "1px solid #E2E8F0" }}>
                <Paperclip className="w-4 h-4" /> Elegir archivo
              </button>
            </div>
            <p className="text-[11px] text-slate-400 mt-2">PDF, Word o fotos · hasta {MAX_ARCHIVOS} archivos de {MAX_MB} MB</p>
            <input ref={inputCamara} type="file" accept="image/*" capture="environment" className="hidden"
              onChange={e => { agregar(e.target.files); e.target.value = ""; }} />
            <input ref={inputArchivo} type="file" accept={ACCEPT} multiple className="hidden"
              onChange={e => { agregar(e.target.files); e.target.value = ""; }} />
          </div>
          {preparando && (
            <p className="flex items-center gap-2 text-xs text-slate-500 mt-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Preparando archivo...</p>
          )}
          {archivos.length > 0 && (
            <div className="space-y-1.5 mt-2">
              {archivos.map(a => (
                <div key={a.clave} className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm bg-slate-50" style={{ border: "1px solid #E2E8F0" }}>
                  <FileText className="w-4 h-4 flex-shrink-0" style={{ color: COLOR }} />
                  <span className="truncate flex-1 text-slate-700">{a.file.name}</span>
                  <span className="text-xs text-slate-400 flex-shrink-0">{tamanoLegible(a.file.size)}</span>
                  <button type="button" onClick={() => quitar(a.clave)} className="text-slate-400 hover:text-red-500 flex-shrink-0" title="Quitar">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className={labelCls}>Observaciones (opcional)</label>
          <textarea rows={2} className={`${inputCls} resize-none`} value={observaciones} maxLength={1000}
            placeholder="Ej: faltan 2 cánulas n° 18, vencieron los parches DEA pediátricos..."
            onChange={e => setObservaciones(e.target.value)} />
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-xl text-sm" style={{ background: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA" }}>
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />{error}
          </div>
        )}

        <button type="submit" disabled={enviando || preparando}
          className="w-full py-3.5 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-60"
          style={{ background: COLOR }}>
          {enviando ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</> : <><Send className="w-4 h-4" /> Enviar pauta</>}
        </button>
      </div>
    </form>
  );
}
