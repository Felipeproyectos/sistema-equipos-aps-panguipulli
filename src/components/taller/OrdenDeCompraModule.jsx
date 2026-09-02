import { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { ShoppingCart, Plus, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import OrdenDeCompraFormModal from "./OrdenDeCompraFormModal";

const ESTADO_CFG = {
  borrador: { label: "Borrador", color: "#64748B", bg: "#F1F5F9" },
  emitida: { label: "Emitida", color: "#2563EB", bg: "#DBEAFE" },
  recibida: { label: "Recibida", color: "#16A34A", bg: "#DCFCE7" },
  cancelada: { label: "Cancelada", color: "#DC2626", bg: "#FEE2E2" },
};

export default function OrdenDeCompraModule({ user }) {
  const [ordenes, setOrdenes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const { toast } = useToast();

  const fetch = useCallback(async () => {
    const list = await base44.entities.OrdenDeCompra.list("-created_date", 50).catch(() => []);
    setOrdenes(list);
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const puedeCrear = ["super_admin", "admin", "jefe_taller", "encargado_compras_taller", "mecanico"].includes(user?.role);
  const puedeEditar = ["super_admin", "admin", "jefe_taller", "encargado_compras_taller"].includes(user?.role);

  const cambiarEstado = async (oc, estado) => {
    try {
      await base44.entities.OrdenDeCompra.update(oc.id, { estado });
      toast({ title: `OC marcada como ${ESTADO_CFG[estado]?.label || estado}` });
      fetch();
    } catch (e) {
      toast({ title: "No se pudo actualizar", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-lg overflow-hidden" style={{ boxShadow: "0 8px 32px rgba(15,45,107,0.08)" }}>
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between" style={{ background: "#F8FAFC" }}>
        <h2 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
          <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center">
            <ShoppingCart className="w-4 h-4 text-blue-600" />
          </div>
          Órdenes de Compra
          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">{ordenes.length}</span>
        </h2>
        {puedeCrear && (
          <button onClick={() => setModalOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white" style={{ background: "#2563EB" }}>
            <Plus className="w-3.5 h-3.5" /> Nueva OC
          </button>
        )}
      </div>
      <div className="divide-y divide-slate-50 max-h-96 overflow-y-auto">
        {loading ? (
          <div className="px-5 py-8 text-center"><Loader2 className="w-6 h-6 text-slate-300 animate-spin mx-auto" /></div>
        ) : ordenes.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-slate-400">No hay órdenes de compra.</div>
        ) : ordenes.map(oc => {
          const cfg = ESTADO_CFG[oc.estado] || ESTADO_CFG.emitida;
          const nItems = (oc.items || []).length;
          return (
            <div key={oc.id} className="px-5 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-800">{oc.numero_oc}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{oc.proveedor_nombre || "Sin proveedor"} · {nItems} ítem{nItems !== 1 ? "s" : ""}</p>
                  {oc.fecha_entrega_estimada && <p className="text-xs text-slate-400 mt-0.5">Entrega est.: {oc.fecha_entrega_estimada}</p>}
                  <p className="text-xs text-slate-400 mt-0.5">Crea: {oc.creado_por_nombre || oc.creado_por_email}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <span className="text-xs font-bold px-2 py-1 rounded-full" style={{ background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                  <p className="text-sm font-bold text-slate-700 mt-1">${(oc.total || 0).toLocaleString("es-CL")}</p>
                </div>
              </div>
              {puedeEditar && oc.estado === "emitida" && (
                <button onClick={() => cambiarEstado(oc, "recibida")} className="mt-2 px-3 py-1 rounded-lg text-xs font-bold text-white" style={{ background: "#16A34A" }}>Marcar recibida</button>
              )}
            </div>
          );
        })}
      </div>
      <OrdenDeCompraFormModal open={modalOpen} onClose={() => setModalOpen(false)} onGuardar={fetch} user={user} />
    </div>
  );
}