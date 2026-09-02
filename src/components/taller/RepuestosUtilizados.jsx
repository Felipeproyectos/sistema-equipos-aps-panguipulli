import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Package, Plus, X, Lock, ShoppingCart, Receipt, ImageIcon } from "lucide-react";
import CompraDirectaModal from "@/components/taller/CompraDirectaModal";

// Nota: los repuestos utilizados se registran aquí como "intención de uso"
// mientras la OT está abierta. El stock real (Repuesto.stock_actual) sólo se
// descuenta UNA vez, al cerrar la OT (ver OrdenTrabajoDetalle.jsx,
// handleCambiarEstado -> estado "completada"), para evitar descuentos
// duplicados o parciales mientras el mecánico sigue ajustando cantidades.
// `puedeComprar` va aparte de `editable` a proposito: el mecanico puede
// agregar repuestos a la OT, pero la compra directa mueve plata (precio,
// proveedor, boleta obligatoria) y segun el diseño de roles es del Jefe de
// Taller. Antes bastaba con `editable` y el mecanico la tenia habilitada.
export default function RepuestosUtilizados({ ot, repuestosDisponibles, onUpdate, editable, puedeComprar }) {
  const [agregando, setAgregando] = useState(false);
  const [repuestoId, setRepuestoId] = useState("");
  const [cantidad, setCantidad] = useState(1);
  const [modalCompra, setModalCompra] = useState(false);

  const items = ot.repuestos_utilizados || [];
  const cerrada = ot.estado === "completada";

  const handleAgregar = async () => {
    if (!repuestoId || cantidad <= 0) return;
    const rep = repuestosDisponibles.find(r => r.id === repuestoId);
    if (!rep) return;
    const nuevoItem = {
      repuesto_id: rep.id,
      nombre: rep.nombre,
      cantidad: Number(cantidad),
    };
    const nuevosItems = [...items, nuevoItem];
    await base44.entities.OrdenTrabajo.update(ot.id, { repuestos_utilizados: nuevosItems });
    setRepuestoId("");
    setCantidad(1);
    setAgregando(false);
    onUpdate?.();
  };

  const handleQuitar = async (idx) => {
    const nuevosItems = items.filter((_, i) => i !== idx);
    await base44.entities.OrdenTrabajo.update(ot.id, { repuestos_utilizados: nuevosItems });
    onUpdate?.();
  };

  return (
    <div className="bg-white rounded-2xl p-4 border border-slate-100">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
          <Package className="w-4 h-4 text-orange-500" /> Repuestos utilizados
        </h3>
        {cerrada && (
          <span className="text-xs font-semibold text-slate-400 flex items-center gap-1">
            <Lock className="w-3 h-3" /> OT cerrada · stock ya descontado
          </span>
        )}
        {editable && !cerrada && (
          <div className="flex items-center gap-3">
            {puedeComprar && (
              <button onClick={() => setModalCompra(true)} className="text-xs font-semibold flex items-center gap-1" style={{ color: "#F97316" }}>
                <ShoppingCart className="w-3.5 h-3.5" /> Compra
              </button>
            )}
            <button onClick={() => setAgregando(v => !v)} className="text-xs font-semibold text-orange-600 flex items-center gap-1">
              <Plus className="w-3.5 h-3.5" /> Agregar
            </button>
          </div>
        )}
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-slate-400">Sin repuestos registrados</p>
      ) : (
        <div className="space-y-1.5">
          {items.map((it, idx) => {
            const esCompra = it.tipo === "compra_directa";
            return (
              <div key={idx} className={`flex items-start justify-between rounded-lg px-3 py-2 ${esCompra ? "bg-orange-50 border border-orange-100" : "bg-slate-50"}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm text-slate-700 truncate">{it.descripcion || it.nombre}</span>
                    {esCompra && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5" style={{ background: "#FFEDD5", color: "#C2410C" }}>
                        <ShoppingCart className="w-2.5 h-2.5" /> COMPRA
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-xs font-semibold text-slate-500">x{it.cantidad}</span>
                    {esCompra && it.precio_total > 0 && (
                      <span className="text-xs font-bold" style={{ color: "#C2410C" }}>
                        ${it.precio_total.toLocaleString("es-CL")}
                      </span>
                    )}
                    {esCompra && (
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${it.estado_reembolso === "reembolsado" ? "bg-green-100 text-green-600" : "bg-amber-100 text-amber-600"}`}>
                        {it.estado_reembolso === "reembolsado" ? "Reembolsado" : "Reembolso pendiente"}
                      </span>
                    )}
                    {esCompra && (it.boleta_url || it.foto_repuesto_url) && (
                      <div className="flex items-center gap-1.5">
                        {it.boleta_url && (
                          <a href={it.boleta_url} target="_blank" rel="noreferrer" className="text-[11px] flex items-center gap-0.5 text-blue-500 hover:underline">
                            <Receipt className="w-3 h-3" /> Boleta
                          </a>
                        )}
                        {it.foto_repuesto_url && (
                          <a href={it.foto_repuesto_url} target="_blank" rel="noreferrer" className="text-[11px] flex items-center gap-0.5 text-blue-500 hover:underline">
                            <ImageIcon className="w-3 h-3" /> Foto
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                  {esCompra && it.pagado_por_nombre && (
                    <p className="text-[10px] text-slate-400 mt-0.5">Pagado por {it.pagado_por_nombre}{it.fecha_compra ? ` · ${it.fecha_compra}` : ""}</p>
                  )}
                </div>
                {editable && !cerrada && (
                  <button onClick={() => handleQuitar(idx)} className="text-slate-300 hover:text-red-400 flex-shrink-0 ml-2">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {agregando && editable && !cerrada && (
        <div className="mt-3 flex items-center gap-2">
          <select value={repuestoId} onChange={e => setRepuestoId(e.target.value)}
            className="flex-1 text-sm border border-slate-200 rounded-lg px-2 py-1.5">
            <option value="">Seleccionar repuesto...</option>
            {repuestosDisponibles.map(r => (
              <option key={r.id} value={r.id}>{r.nombre} (stock: {r.stock_actual ?? 0})</option>
            ))}
          </select>
          <input type="number" min="1" value={cantidad} onChange={e => setCantidad(e.target.value)}
            className="w-16 text-sm border border-slate-200 rounded-lg px-2 py-1.5" />
          <button onClick={handleAgregar} className="text-xs font-bold text-white bg-orange-500 rounded-lg px-3 py-1.5">
            Añadir
          </button>
        </div>
      )}

      {modalCompra && (
        <CompraDirectaModal
          ot={ot}
          onClose={() => setModalCompra(false)}
          onGuardado={() => { onUpdate?.(); setModalCompra(false); }}
        />
      )}
    </div>
  );
}