import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Wrench, Car, Clock, User, ChevronRight, Eye } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

const ESTADO_CFG = {
  pendiente: { label: "Pendiente", color: "#D97706", bg: "#FFFBEB", border: "#FDE68A" },
  asignada: { label: "Asignada", color: "#2563EB", bg: "#EFF6FF", border: "#BFDBFE" },
  en_proceso: { label: "En Proceso", color: "#7C3AED", bg: "#F5F3FF", border: "#DDD6FE" },
  pausada: { label: "Pausada", color: "#64748B", bg: "#F1F5F9", border: "#E2E8F0" },
  en_revision: { label: "En Revisión", color: "#D97706", bg: "#FFFBEB", border: "#FDE68A" },
  completada: { label: "Completada", color: "#16A34A", bg: "#F0FDF4", border: "#BBF7D0" },
  cancelada: { label: "Cancelada", color: "#DC2626", bg: "#FEF2F2", border: "#FECACA" },
};

const PRIORIDAD_CFG = {
  alta: { label: "Alta", color: "#DC2626", bg: "#FEF2F2" },
  media: { label: "Media", color: "#D97706", bg: "#FFFBEB" },
  baja: { label: "Baja", color: "#2563EB", bg: "#EFF6FF" },
};

export default function OrdenTrabajoCard({ ot, onActualizar, onEditar, puedeCerrar = false }) {
  const [expandida, setExpandida] = useState(false);
  const [cambiando, setCambiando] = useState(false);
  const navigate = useNavigate();
  const estado = ESTADO_CFG[ot.estado] || ESTADO_CFG.pendiente;
  const prio = PRIORIDAD_CFG[ot.prioridad] || PRIORIDAD_CFG.media;

  let tiempoAgo = "";
  try {
    tiempoAgo = ot.created_date
      ? formatDistanceToNow(new Date(ot.created_date), { addSuffix: true, locale: es })
      : "";
  } catch {}

  const cambiarEstado = async (nuevoEstado) => {
    setCambiando(true);
    try {
      const update = { estado: nuevoEstado, linea_tiempo: [...(ot.linea_tiempo || []), {
        fecha: new Date().toISOString(),
        evento: `Estado cambiado a ${ESTADO_CFG[nuevoEstado]?.label || nuevoEstado}`,
        notas: "",
      }] };
      if (nuevoEstado === "completada") update.fecha_fin = new Date().toISOString().split("T")[0];
      if (nuevoEstado === "en_proceso" && !ot.fecha_inicio) update.fecha_inicio = new Date().toISOString().split("T")[0];
      await base44.entities.OrdenTrabajo.update(ot.id, update);
      onActualizar();
    } catch (e) {
      console.error(e);
    }
    setCambiando(false);
  };

  return (
    <div className="bg-white rounded-2xl overflow-hidden transition-all"
      style={{ border: `1px solid ${estado.border}`, boxShadow: "0 2px 8px rgba(15,45,107,0.06)" }}>
      <div className="p-4 cursor-pointer" onClick={() => setExpandida(e => !e)}>
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: estado.bg }}>
            <Wrench className="w-5 h-5" style={{ color: estado.color }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <p className="font-bold text-slate-800 text-sm">{ot.numero_ot}</p>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: estado.bg, color: estado.color }}>{estado.label}</span>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: prio.bg, color: prio.color }}>{prio.label}</span>
              {ot.tipo_activo === "externo" && (
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700">Externo</span>
              )}
            </div>
            <div className="flex items-center gap-1.5 mb-1">
              <Car className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
              <span className="text-sm font-semibold text-blue-700 truncate">
                {ot.equipo_label}{ot.patente ? ` · ${ot.patente}` : ""}
              </span>
            </div>
            <p className="text-xs text-slate-600 line-clamp-1">{ot.problema_reportado || "Sin descripción"}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
              {ot.mecanico_nombre && (
                <div className="flex items-center gap-1">
                  <User className="w-3 h-3 text-slate-400" />
                  <span className="text-xs text-slate-500">{ot.mecanico_nombre}</span>
                </div>
              )}
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3 text-slate-400" />
                <span className="text-xs text-slate-500">{tiempoAgo}</span>
              </div>
            </div>
          </div>
          <ChevronRight className={`w-4 h-4 text-slate-300 flex-shrink-0 transition-transform ${expandida ? "rotate-90" : ""}`} />
        </div>
      </div>

      {expandida && (
        <div className="border-t border-slate-100 p-4 space-y-3" style={{ background: "#FAFBFC" }}>
          {ot.diagnostico && (
            <div className="p-3 rounded-xl bg-white" style={{ border: "1px solid #E2E8F0" }}>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Diagnóstico</p>
              <p className="text-xs text-slate-700">{ot.diagnostico}</p>
            </div>
          )}
          {(ot.total_repuestos > 0 || ot.total_mano_obra > 0) && (
            <div className="grid grid-cols-3 gap-2">
              <div className="p-2 rounded-lg bg-white text-center" style={{ border: "1px solid #E2E8F0" }}>
                <p className="text-xs text-slate-400">Repuestos</p>
                <p className="text-sm font-bold text-slate-700">${(ot.total_repuestos || 0).toLocaleString("es-CL")}</p>
              </div>
              <div className="p-2 rounded-lg bg-white text-center" style={{ border: "1px solid #E2E8F0" }}>
                <p className="text-xs text-slate-400">Mano de Obra</p>
                <p className="text-sm font-bold text-slate-700">${(ot.total_mano_obra || 0).toLocaleString("es-CL")}</p>
              </div>
              <div className="p-2 rounded-lg text-center" style={{ background: "#EFF6FF", border: "1px solid #BFDBFE" }}>
                <p className="text-xs text-blue-500">Total</p>
                <p className="text-sm font-bold text-blue-700">${(ot.total || 0).toLocaleString("es-CL")}</p>
              </div>
            </div>
          )}
          <div className="flex gap-2 flex-wrap">
            <select
              value={ot.estado}
              disabled={cambiando}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => cambiarEstado(e.target.value)}
              className="text-xs font-semibold px-3 py-2 rounded-xl border border-slate-200 bg-white"
            >
              {Object.entries(ESTADO_CFG).map(([k, v]) => (
                // Solo el Jefe de Taller puede cerrar la OT (marcarla como completada)
                <option key={k} value={k} disabled={k === "completada" && !puedeCerrar}>{v.label}</option>
              ))}
            </select>
            <button onClick={(e) => { e.stopPropagation(); navigate(createPageUrl(`OrdenTrabajoDetalle/${ot.id}`)); }}
              className="text-xs font-semibold px-3 py-2 rounded-xl flex items-center gap-1 text-white" style={{ background: "#0F172A" }}>
              <Eye className="w-3.5 h-3.5" /> Ver Detalle
            </button>
            <button onClick={(e) => { e.stopPropagation(); onEditar(ot); }}
              className="text-xs font-semibold px-3 py-2 rounded-xl text-white" style={{ background: "#2563EB" }}>
              Editar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}