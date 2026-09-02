import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Package, Pencil, Trash2, Plus, Minus, AlertTriangle, FileText, Truck } from "lucide-react";

const CATEGORIA_CFG = {
  neumaticos: { color: "#7C3AED", bg: "#F5F3FF" },
  frenos: { color: "#DC2626", bg: "#FEF2F2" },
  bateria: { color: "#D97706", bg: "#FFFBEB" },
  filtros: { color: "#0891B2", bg: "#ECFEFF" },
  lubricantes: { color: "#059669", bg: "#ECFDF5" },
  electrico: { color: "#2563EB", bg: "#EFF6FF" },
  sirena: { color: "#DC2626", bg: "#FEF2F2" },
  luces: { color: "#F59E0B", bg: "#FFFBEB" },
  otros: { color: "#64748B", bg: "#F1F5F9" },
};

export default function RepuestoCard({ repuesto, onEditar, onCambioStock, user, onConsumo }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [ajustando, setAjustando] = useState(null);
  const cfg = CATEGORIA_CFG[repuesto.categoria] || CATEGORIA_CFG.otros;
  const stock = repuesto.stock_actual || 0;
  const minimo = repuesto.stock_minimo || 0;
  const stockBajo = stock <= minimo;
  const canConsumir = user && ['super_admin', 'admin', 'jefe_taller', 'encargado_compras_taller'].includes(user.role);

  const ajustarStock = async (delta) => {
    const nuevo = Math.max(0, stock + delta);
    setAjustando(delta);
    try {
      await base44.entities.Repuesto.update(repuesto.id, {
        stock_actual: nuevo,
        ultimo_reposicion: delta > 0 ? new Date().toISOString().split("T")[0] : repuesto.ultimo_reposicion,
      });
      onCambioStock();
    } catch (e) { console.error(e); }
    setAjustando(null);
  };

  return (
    <div className="bg-white rounded-2xl p-4 transition-all" style={{ border: `1px solid ${stockBajo ? "#FECACA" : "#E2E8F0"}`, boxShadow: "0 2px 8px rgba(15,45,107,0.05)" }}>
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 relative" style={{ background: cfg.bg }}>
          <Package className="w-5 h-5" style={{ color: cfg.color }} />
          {stockBajo && (
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center" style={{ background: "#DC2626" }}>
              <AlertTriangle className="w-2.5 h-2.5 text-white" />
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-bold text-slate-800 text-sm truncate">{repuesto.nombre}</p>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: cfg.bg, color: cfg.color }}>{repuesto.categoria}</span>
          </div>
          {repuesto.codigo && <p className="text-xs text-slate-400 mt-0.5">Código: {repuesto.codigo}</p>}
          {repuesto.marca_modelo_compat && <p className="text-xs text-slate-500 mt-0.5">{repuesto.marca_modelo_compat}</p>}
          {repuesto.proveedor_nombre && <p className="text-xs text-slate-400 mt-0.5">{repuesto.proveedor_nombre}</p>}
          {repuesto.ubicacion_bodega && <p className="text-xs text-slate-400 mt-0.5">📍 {repuesto.ubicacion_bodega}</p>}
          {(repuesto.numero_factura || repuesto.numero_orden_compra) && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {repuesto.numero_factura && (
                <a href={repuesto.factura_url} target="_blank" rel="noreferrer"
                  className="text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-1" style={{ background: "#EFF6FF", color: "#2563EB" }}>
                  <FileText className="w-3 h-3" /> Factura
                </a>
              )}
              {repuesto.numero_orden_compra && (
                <a href={repuesto.orden_compra_url} target="_blank" rel="noreferrer"
                  className="text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-1" style={{ background: "#F5F3FF", color: "#7C3AED" }}>
                  <FileText className="w-3 h-3" /> OC
                </a>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Control de stock */}
      <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={() => ajustarStock(-1)} disabled={ajustando !== null || stock === 0}
            className="w-7 h-7 rounded-lg flex items-center justify-center disabled:opacity-40" style={{ background: "#F1F5F9" }}>
            <Minus className="w-3.5 h-3.5 text-slate-600" />
          </button>
          <div className="text-center min-w-[60px]">
            <p className="text-xl font-bold" style={{ color: stockBajo ? "#DC2626" : "#16A34A" }}>{stock}</p>
            <p className="text-xs text-slate-400">mín. {minimo}</p>
          </div>
          <button onClick={() => ajustarStock(1)} disabled={ajustando !== null}
            className="w-7 h-7 rounded-lg flex items-center justify-center disabled:opacity-40" style={{ background: "#F1F5F9" }}>
            <Plus className="w-3.5 h-3.5 text-slate-600" />
          </button>
        </div>
        <p className="text-sm font-bold text-slate-700">${(repuesto.precio_unitario || 0).toLocaleString("es-CL")}</p>
      </div>

      {canConsumir && (
        <button onClick={() => onConsumo(repuesto)} disabled={stock === 0}
          className="w-full py-2 mb-2 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-1.5 disabled:opacity-50" style={{ background: "#0891B2" }}>
          <Truck className="w-3.5 h-3.5" /> Consumir y asignar a vehículo
        </button>
      )}
      <div className="flex gap-2 mt-2">
        <button onClick={() => onEditar(repuesto)} className="flex-1 py-2 rounded-xl text-xs font-bold text-blue-600 flex items-center justify-center gap-1.5" style={{ background: "#EFF6FF" }}>
          <Pencil className="w-3.5 h-3.5" /> Editar
        </button>
        {confirmDelete ? (
          <>
            <button onClick={() => base44.entities.Repuesto.update(repuesto.id, { activo: false }).then(onCambioStock)} className="flex-1 py-2 rounded-xl text-xs font-bold text-white" style={{ background: "#DC2626" }}>Confirmar</button>
            <button onClick={() => setConfirmDelete(false)} className="flex-1 py-2 rounded-xl text-xs font-bold bg-slate-100 text-slate-600">Cancelar</button>
          </>
        ) : (
          <button onClick={() => setConfirmDelete(true)} className="flex-1 py-2 rounded-xl text-xs font-bold text-red-600 flex items-center justify-center gap-1.5" style={{ background: "#FEF2F2" }}>
            <Trash2 className="w-3.5 h-3.5" /> Eliminar
          </button>
        )}
      </div>
    </div>
  );
}