import { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Package, Plus, Loader2, CheckCircle2, XCircle, Clock, Wrench, Info } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import SolicitudRepuestoFormModal from "./SolicitudRepuestoFormModal";

const ESTADO_CFG = {
  pendiente: { label: "Pendiente", color: "#D97706", bg: "#FEF3C7", icon: Clock },
  aprobada: { label: "Aprobada", color: "#16A34A", bg: "#DCFCE7", icon: CheckCircle2 },
  rechazada: { label: "Rechazada", color: "#DC2626", bg: "#FEE2E2", icon: XCircle },
  comprada: { label: "Comprada", color: "#2563EB", bg: "#DBEAFE", icon: Package },
};

export default function SolicitudRepuestoModule({ user, ordenesActivas = [], requiereOT = false }) {
  const [solicitudes, setSolicitudes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [procesando, setProcesando] = useState(null);
  const { toast } = useToast();

  const fetch = useCallback(async () => {
    const list = await base44.entities.SolicitudRepuesto.list("-created_date", 50).catch(() => []);
    setSolicitudes(list);
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const puedeCrear = ["super_admin", "admin", "jefe_taller", "encargado_compras_taller", "mecanico"].includes(user?.role);
  const puedeAprobar = ["super_admin", "admin", "jefe_taller"].includes(user?.role);
  // El mecánico solo puede solicitar repuestos si tiene un vehículo en taller
  // (una OT activa asignada a él). Otros roles no tienen esta restricción.
  const tieneVehiculoEnTaller = !requiereOT || ordenesActivas.length > 0;

  const resolver = async (sol, estado) => {
    setProcesando(sol.id);
    try {
      const res = await base44.functions.invoke("aprobarSolicitudRepuesto", {
        solicitud_id: sol.id,
        estado,
        comentario: "",
      });
      const data = res.data || {};
      let title = `Solicitud ${estado === "aprobada" ? "aprobada" : "rechazada"}`;
      let description;
      if (estado === "aprobada" && data.deduccion) {
        const d = data.deduccion;
        if (d.no_encontrado) {
          description = `"${d.repuesto_nombre}" no se encontró en el inventario. Aprueba la compra por separado.`;
        } else if (d.insuficiente) {
          description = `Stock insuficiente. Descontado a ${d.nuevo_stock} (de ${d.stock_previo}). Reponer pronto.`;
        } else {
          description = `Descontado ${d.cantidad_descontada} de "${d.repuesto_nombre}". Stock: ${d.stock_previo} → ${d.nuevo_stock}.`;
        }
      }
      toast({ title, description });
      fetch();
    } catch (e) {
      toast({ title: "No se pudo procesar", description: e.message, variant: "destructive" });
    }
    setProcesando(null);
  };

  const pendientes = solicitudes.filter(s => s.estado === "pendiente").length;

  return (
    <div className="bg-white rounded-2xl shadow-lg overflow-hidden" style={{ boxShadow: "0 8px 32px rgba(15,45,107,0.08)" }}>
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between" style={{ background: "#F8FAFC" }}>
        <h2 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
          <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center">
            <Package className="w-4 h-4 text-amber-600" />
          </div>
          Solicitud de Repuestos
          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">{pendientes} pend.</span>
        </h2>
        {puedeCrear && tieneVehiculoEnTaller && (
          <button onClick={() => setModalOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white" style={{ background: "#D97706" }}>
            <Plus className="w-3.5 h-3.5" /> Nueva
          </button>
        )}
      </div>
      {requiereOT && !tieneVehiculoEnTaller && (
        <div className="px-5 py-4 flex items-start gap-3" style={{ background: "#FFF7ED", borderBottom: "1px solid #FED7AA" }}>
          <Info className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-amber-800">Sin vehículo en taller</p>
            <p className="text-xs text-amber-700 mt-0.5">Solo puedes solicitar repuestos cuando tengas una orden de trabajo activa asignada a ti. Cuando el Jefe de Taller te asigne una orden, aquí podrás pedir los repuestos necesarios.</p>
          </div>
        </div>
      )}
      {requiereOT && tieneVehiculoEnTaller && (
        <div className="px-5 py-2.5 flex items-center gap-2" style={{ background: "#F0FDF4", borderBottom: "1px solid #BBF7D0" }}>
          <Wrench className="w-4 h-4 text-green-600 flex-shrink-0" />
          <p className="text-xs text-green-700">
            Tienes <span className="font-bold">{ordenesActivas.length}</span> vehículo(s) en taller. Vincula tu solicitud a una orden.
          </p>
        </div>
      )}
      <div className="divide-y divide-slate-50 max-h-96 overflow-y-auto">
        {loading ? (
          <div className="px-5 py-8 text-center"><Loader2 className="w-6 h-6 text-slate-300 animate-spin mx-auto" /></div>
        ) : solicitudes.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-slate-400">No hay solicitudes de repuestos.</div>
        ) : solicitudes.map(sol => {
          const cfg = ESTADO_CFG[sol.estado] || ESTADO_CFG.pendiente;
          const Icon = cfg.icon;
          return (
            <div key={sol.id} className="px-5 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-800">{sol.repuesto_nombre}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{sol.cantidad} unid. · {sol.categoria} · {sol.urgencia}</p>
                  {sol.motivo && <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{sol.motivo}</p>}
                  <p className="text-xs text-slate-400 mt-0.5">Solicita: {sol.solicitante_nombre || sol.solicitante_email}</p>
                  {sol.orden_trabajo_label && <p className="text-xs text-blue-600 mt-0.5 font-medium">OT: {sol.orden_trabajo_label}</p>}
                  {sol.comentario_aprobador && <p className="text-xs text-slate-500 mt-0.5 italic">"{sol.comentario_aprobador}" — {sol.aprobador_nombre}</p>}
                </div>
                <span className="text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1 flex-shrink-0" style={{ background: cfg.bg, color: cfg.color }}>
                  <Icon className="w-3 h-3" /> {cfg.label}
                </span>
              </div>
              {sol.estado === "pendiente" && puedeAprobar && (
                <div className="flex gap-2 mt-2">
                  <button onClick={() => resolver(sol, "aprobada")} disabled={procesando === sol.id}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-white disabled:opacity-50" style={{ background: "#16A34A" }}>
                    {procesando === sol.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />} Aprobar
                  </button>
                  <button onClick={() => resolver(sol, "rechazada")} disabled={procesando === sol.id}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-white disabled:opacity-50" style={{ background: "#DC2626" }}>
                    <XCircle className="w-3 h-3" /> Rechazar
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <SolicitudRepuestoFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onGuardar={fetch}
        user={user}
        ordenesActivas={ordenesActivas}
        requiereOT={requiereOT}
      />
    </div>
  );
}