import { AlertCircle, CheckCircle, FileText, ExternalLink, Download } from "lucide-react";
import { tamanoLegible } from "@/lib/pautaCabina";

// Supabase descarga el archivo en vez de abrirlo si se le agrega ?download=.
function urlDescarga(url, nombre) {
  if (!/^https?:/.test(url)) return url;
  return `${url}${url.includes("?") ? "&" : "?"}download=${encodeURIComponent(nombre || "pauta")}`;
}

// Lo que el encargado necesita para aprobar una Pauta de Cabina: las dos
// respuestas arriba, en grande, y los archivos con Ver y Descargar.
export default function DetallePautaCabina({ cabina, observaciones }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {[
          { si: cabina.materialCaducado, siTxt: "Hay material caducado", noTxt: "Sin material caducado", color: "#B91C1C", bg: "#FEF2F2", border: "#FECACA" },
          { si: cabina.reponerMaterial, siTxt: "Hay que reponer material", noTxt: "No hay que reponer material", color: "#B45309", bg: "#FFFBEB", border: "#FDE68A" },
        ].map(a => (
          <div key={a.siTxt} className="rounded-xl px-3 py-2.5 text-sm font-bold flex items-center gap-2"
            style={a.si
              ? { background: a.bg, color: a.color, border: `1px solid ${a.border}` }
              : { background: "#F0FDF4", color: "#15803D", border: "1px solid #BBF7D0" }}>
            {a.si ? <AlertCircle className="w-4 h-4 flex-shrink-0" /> : <CheckCircle className="w-4 h-4 flex-shrink-0" />}
            {a.si ? a.siTxt : a.noTxt}
          </div>
        ))}
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Pauta subida</p>
        {cabina.archivos.length === 0 ? (
          <p className="text-xs text-slate-500">No hay archivos.</p>
        ) : cabina.archivos.map((a, i) => (
          <div key={`${a.url}-${i}`} className="flex items-center gap-2 bg-white rounded-xl px-3 py-2 text-sm" style={{ border: "1px solid #E2E8F0" }}>
            <FileText className="w-4 h-4 flex-shrink-0 text-cyan-700" />
            <span className="truncate flex-1 text-slate-700">{a.nombre || `Archivo ${i + 1}`}</span>
            {a.tamano ? <span className="text-xs text-slate-400 flex-shrink-0 hidden sm:inline">{tamanoLegible(a.tamano)}</span> : null}
            <a href={a.url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
              className="flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-lg flex-shrink-0"
              style={{ background: "#EFF6FF", color: "#1D4ED8" }}>
              <ExternalLink className="w-3.5 h-3.5" /> Ver
            </a>
            <a href={urlDescarga(a.url, a.nombre)} download={a.nombre || true} onClick={e => e.stopPropagation()}
              className="flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-lg flex-shrink-0"
              style={{ background: "#EFF6FF", color: "#1D4ED8" }}>
              <Download className="w-3.5 h-3.5" /> Descargar
            </a>
          </div>
        ))}
      </div>

      {observaciones && (
        <div className="space-y-1.5">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Observaciones</p>
          <div className="p-3 rounded-xl text-xs text-slate-700 bg-white" style={{ border: "1px solid #E2E8F0" }}>{observaciones}</div>
        </div>
      )}
    </div>
  );
}
