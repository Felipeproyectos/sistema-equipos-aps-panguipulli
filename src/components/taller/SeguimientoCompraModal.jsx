import { useState } from "react";
import { base44 } from "@/api/base44Client";
import {
  X, ShoppingCart, Warehouse, CheckCircle2, MessageSquare, User,
  Loader2, Send, Package, Wrench,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { agregarEventoCompra } from "@/utils/compraTimeline";
import EjecutarCompraModal from "./EjecutarCompraModal";

const ESTADO = {
  aprobada: { label: "Pendiente de Compra", color: "#D97706", bg: "#FEF3C7" },
  comprada: { label: "Comprada", color: "#2563EB", bg: "#DBEAFE" },
  recibida: { label: "Recibida en Bodega", color: "#16A34A", bg: "#DCFCE7" },
  pendiente: { label: "Pendiente de Aprobación", color: "#D97706", bg: "#FEF3C7" },
  rechazada: { label: "Rechazada", color: "#DC2626", bg: "#FEE2E2" },
};

function iconoEvento(evento) {
  if (!evento) return MessageSquare;
  if (evento.startsWith("Compra")) return ShoppingCart;
  if (evento.startsWith("Recibida")) return Warehouse;
  if (evento.startsWith("Solicitud")) return CheckCircle2;
  return MessageSquare;
}

function fmtFecha(fecha) {
  if (!fecha) return "";
  try {
    return new Date(fecha).toLocaleString("es-CL", {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return fecha;
  }
}

export default function SeguimientoCompraModal({ solicitud, user, onClose, onActualizado, readOnly = false, entityName = "SolicitudRepuesto" }) {
  const [reporte, setReporte] = useState("");
  const [saving, setSaving] = useState(false);
  const [subComprar, setSubComprar] = useState(false);
  const { toast } = useToast();

  if (!solicitud) return null;

  const estado = ESTADO[solicitud.estado] || ESTADO.aprobada;
  const eventos = Array.isArray(solicitud.linea_tiempo) ? solicitud.linea_tiempo : [];
  const ordenados = [...eventos].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  const esRecibida = solicitud.estado === "recibida";
  const esAprobada = solicitud.estado === "aprobada";
  const esComprada = solicitud.estado === "comprada";

  const stages = [
    { label: "Aprobada", reached: ["aprobada", "comprada", "recibida"].includes(solicitud.estado), color: "#D97706" },
    { label: "Comprada", reached: ["comprada", "recibida"].includes(solicitud.estado), color: "#2563EB" },
    { label: "Recibida", reached: esRecibida, color: "#16A34A" },
  ];

  const agregarReporte = async () => {
    if (!reporte.trim()) return;
    setSaving(true);
    try {
      await agregarEventoCompra(solicitud.id, "Reporte de avance", reporte.trim(), user, entityName);
      setReporte("");
      toast({ title: "Reporte agregado al seguimiento" });
      onActualizado();
    } catch (e) {
      toast({ title: "No se pudo agregar", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const registrarRecepcion = async () => {
    setSaving(true);
    try {
      await base44.entities[entityName].update(solicitud.id, {
        estado: "recibida",
        fecha_recepcion_bodega: new Date().toISOString().split("T")[0],
        recibido_por_email: user?.email,
        recibido_por_nombre: user?.full_name,
      });
      await agregarEventoCompra(solicitud.id, "Recibida en bodega", "", user, entityName).catch(() => {});
      toast({ title: "Recepción registrada", description: `"${solicitud.repuesto_nombre}" llegó a bodega.` });
      onActualizado();
    } catch (e) {
      toast({ title: "No se pudo registrar", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" style={{ background: "rgba(15,23,42,0.55)" }}>
      <div className="bg-white rounded-3xl w-full max-w-lg max-h-[92vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: estado.bg, color: estado.color }}>
                {estado.label}
              </span>
              <span className="text-[11px] text-slate-400">{solicitud.numero_solicitud}</span>
            </div>
            <h3 className="font-bold text-slate-800 leading-tight">{solicitud.repuesto_nombre}</h3>
            <p className="text-xs text-slate-500 mt-0.5">{solicitud.cantidad} unid. · {solicitud.categoria}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 flex-shrink-0"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Stepper */}
          <div className="flex items-center">
            {stages.map((s, i) => (
              <div key={s.label} className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center gap-1 flex-shrink-0">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold"
                    style={s.reached ? { background: s.color, color: "white" } : { background: "#F1F5F9", color: "#94A3B8" }}>
                    {s.reached ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
                  </div>
                  <span className="text-[10px] font-medium" style={{ color: s.reached ? s.color : "#94A3B8" }}>{s.label}</span>
                </div>
                {i < stages.length - 1 && (
                  <div className="flex-1 h-0.5 mx-1 -mt-4" style={{ background: stages[i + 1].reached ? s.color : "#E2E8F0" }} />
                )}
              </div>
            ))}
          </div>

          {/* Info del repuesto */}
          <div className="bg-slate-50 rounded-2xl p-3 space-y-1.5 text-xs text-slate-600" style={{ border: "1px solid #E2E8F0" }}>
            <p className="flex items-center gap-1.5"><User className="w-3.5 h-3.5 text-slate-400" /> Solicitante: <strong className="text-slate-700">{solicitud.solicitante_nombre || solicitud.solicitante_email}</strong></p>
            {solicitud.orden_trabajo_label && <p className="flex items-center gap-1.5"><Wrench className="w-3.5 h-3.5 text-slate-400" /> OT: <strong className="text-slate-700">{solicitud.orden_trabajo_label}</strong></p>}
            {solicitud.motivo && <p className="italic text-slate-500">"{solicitud.motivo}"</p>}
            {esComprada && (solicitud.proveedor_compra_nombre || solicitud.precio_total_compra > 0) && (
              <div className="pt-1.5 mt-1.5 border-t border-slate-200 space-y-1">
                {solicitud.proveedor_compra_nombre && <p className="flex items-center gap-1.5"><ShoppingCart className="w-3.5 h-3.5 text-blue-400" /> Proveedor: <strong className="text-slate-700">{solicitud.proveedor_compra_nombre}</strong></p>}
                {solicitud.precio_total_compra > 0 && <p className="flex items-center gap-1.5"><Package className="w-3.5 h-3.5 text-blue-400" /> Total: <strong className="text-slate-700">${solicitud.precio_total_compra.toLocaleString("es-CL")}</strong></p>}
              </div>
            )}
          </div>

          {/* Línea de tiempo */}
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Seguimiento</p>
            {ordenados.length === 0 ? (
              <div className="text-center py-6">
                <MessageSquare className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                <p className="text-xs text-slate-400">Sin reportes aún. Agrega un reporte de avance para iniciar el seguimiento.</p>
              </div>
            ) : (
              <div className="relative pl-1">
                <div className="absolute left-4 top-2 bottom-2 w-px bg-slate-200" />
                <div className="space-y-3">
                  {ordenados.map((ev, i) => {
                    const Icon = iconoEvento(ev.evento);
                    return (
                      <div key={i} className="relative flex items-start gap-3">
                        <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center flex-shrink-0 z-10" style={{ border: "2px solid #E2E8F0" }}>
                          <Icon className="w-3.5 h-3.5 text-slate-500" />
                        </div>
                        <div className="flex-1 min-w-0 pb-1">
                          <p className="text-sm font-semibold text-slate-700">{ev.evento}</p>
                          <div className="flex flex-wrap gap-x-3">
                            <span className="text-[11px] text-slate-400">{fmtFecha(ev.fecha)}</span>
                            {ev.usuario_nombre && (
                              <span className="text-[11px] text-slate-500 flex items-center gap-0.5"><User className="w-3 h-3" /> {ev.usuario_nombre}</span>
                            )}
                          </div>
                          {ev.notas && <p className="text-xs text-slate-600 mt-1 bg-slate-50 rounded-lg px-2.5 py-1.5">{ev.notas}</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Agregar reporte */}
          {!esRecibida && !readOnly && (
            <div className="bg-amber-50 rounded-2xl p-3" style={{ border: "1px solid #FDE68A" }}>
              <label className="text-xs font-semibold text-amber-700 block mb-1.5">Agregar reporte de avance</label>
              <div className="flex gap-2">
                <input
                  value={reporte}
                  onChange={e => setReporte(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") agregarReporte(); }}
                  placeholder="Ej. Cotización solicitada al proveedor, en espera de respuesta…"
                  className="flex-1 border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white"
                  style={{ borderColor: "#FDE68A" }}
                />
                <button onClick={agregarReporte} disabled={saving || !reporte.trim()}
                  className="px-3 rounded-xl text-sm font-bold text-white disabled:opacity-50 flex items-center gap-1.5" style={{ background: "#D97706" }}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Acciones según estado */}
        <div className="px-5 py-4 border-t border-slate-100 flex gap-2">
          {esAprobada && !readOnly && (
            <button onClick={() => setSubComprar(true)}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-1.5" style={{ background: "#2563EB" }}>
              <ShoppingCart className="w-4 h-4" /> Ejecutar Compra
            </button>
          )}
          {esComprada && !readOnly && (
            <button onClick={registrarRecepcion} disabled={saving}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-1.5 disabled:opacity-50" style={{ background: "#16A34A" }}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Warehouse className="w-4 h-4" />} Registrar Recepción
            </button>
          )}
          {esRecibida && (
            <div className="flex-1 py-2.5 rounded-xl text-sm font-bold text-green-700 flex items-center justify-center gap-1.5" style={{ background: "#DCFCE7" }}>
              <CheckCircle2 className="w-4 h-4" /> Compra completada
            </div>
          )}
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100">Cerrar</button>
        </div>
      </div>

      {subComprar && (
        <EjecutarCompraModal
          solicitud={solicitud}
          user={user}
          onClose={() => setSubComprar(false)}
          onGuardado={() => { setSubComprar(false); onActualizado(); }}
          entityName={entityName}
        />
      )}
    </div>
  );
}