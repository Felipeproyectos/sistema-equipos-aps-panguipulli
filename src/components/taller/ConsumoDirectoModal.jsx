import { useState, useEffect } from "react";
import { Loader2, X, Truck, Package } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";

export default function ConsumoDirectoModal({ repuesto, user, onClose, onConsumido }) {
  const [cantidad, setCantidad] = useState(1);
  const [tipoVehiculo, setTipoVehiculo] = useState("corporativo");
  const [equipos, setEquipos] = useState([]);
  const [equipoId, setEquipoId] = useState("");
  const [patente, setPatente] = useState("");
  const [marcaModelo, setMarcaModelo] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingEquipos, setLoadingEquipos] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!repuesto) return;
    setCantidad(1);
    setTipoVehiculo("corporativo");
    setEquipoId("");
    setPatente("");
    setMarcaModelo("");
    setObservaciones("");
    setLoadingEquipos(true);
    base44.entities.Equipo.filter({ tipo: "ambulancia" }, "-created_date", 200)
      .then((list) => {
        const activos = (list || []).filter((e) => e.activo !== false);
        setEquipos(activos);
        if (activos.length > 0) setEquipoId(activos[0].id);
      })
      .catch(() => setEquipos([]))
      .finally(() => setLoadingEquipos(false));
  }, [repuesto]);

  if (!repuesto) return null;

  const stock = repuesto.stock_actual || 0;
  const cantNum = Number(cantidad) || 0;
  const valid = cantNum > 0 && cantNum <= stock && (
    tipoVehiculo === "corporativo" ? !!equipoId : !!(patente || marcaModelo)
  );

  const equipoLabel = (eq) => {
    const partes = [eq.marca, eq.modelo, eq.patente].filter(Boolean);
    return partes.join(" · ") || eq.numero_inventario || "Ambulancia";
  };

  const submit = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      const eq = equipos.find((e) => e.id === equipoId);
      const res = await base44.functions.invoke("registrarConsumoDirecto", {
        repuesto_id: repuesto.id,
        cantidad: cantNum,
        tipo_vehiculo: tipoVehiculo,
        equipo_id: tipoVehiculo === "corporativo" ? equipoId : "",
        equipo_label: tipoVehiculo === "corporativo" && eq ? equipoLabel(eq) : "",
        patente: tipoVehiculo === "externo" ? patente : "",
        marca_modelo: tipoVehiculo === "externo" ? marcaModelo : "",
        observaciones,
      });
      const d = res.data || {};
      toast({
        title: "Consumo registrado",
        description: `Descontado ${d.cantidad} de "${d.repuesto_nombre}". Stock: ${d.stock_previo} → ${d.nuevo_stock}. Asignado a ${d.vehiculo || "vehículo"}.`,
      });
      onConsumido();
      onClose();
    } catch (e) {
      toast({ title: "No se pudo registrar el consumo", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" style={{ background: "rgba(15,23,42,0.55)" }}>
      <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 sticky top-0 bg-white">
          <h3 className="font-bold text-slate-800 flex items-center gap-2"><Truck className="w-5 h-5 text-cyan-600" /> Consumo de Stock</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-4">
          {/* Repuesto */}
          <div className="bg-slate-50 rounded-2xl p-4 space-y-1">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-cyan-600" />
              <p className="font-bold text-slate-800">{repuesto.nombre}</p>
            </div>
            <p className="text-xs text-slate-500">Stock disponible: <span className="font-bold" style={{ color: stock <= (repuesto.stock_minimo || 0) ? "#DC2626" : "#16A34A" }}>{stock}</span> unid.</p>
          </div>

          {/* Cantidad */}
          <div>
            <label className="text-xs font-semibold text-slate-500">Cantidad a consumir</label>
            <input type="number" min="1" max={stock} value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300 bg-slate-50" />
            {cantNum > stock && <p className="text-xs text-red-500 mt-1">Supera el stock disponible.</p>}
          </div>

          {/* Tipo de vehículo */}
          <div>
            <label className="text-xs font-semibold text-slate-500">Vehículo</label>
            <div className="flex gap-2 mt-1">
              <button onClick={() => setTipoVehiculo("corporativo")}
                className="flex-1 py-2 rounded-xl text-sm font-bold transition-all"
                style={tipoVehiculo === "corporativo" ? { background: "#0891B2", color: "white" } : { background: "#F1F5F9", color: "#64748B" }}>
                Corporativo
              </button>
              <button onClick={() => setTipoVehiculo("externo")}
                className="flex-1 py-2 rounded-xl text-sm font-bold transition-all"
                style={tipoVehiculo === "externo" ? { background: "#0891B2", color: "white" } : { background: "#F1F5F9", color: "#64748B" }}>
                Externo
              </button>
            </div>
          </div>

          {/* Selector corporativo */}
          {tipoVehiculo === "corporativo" && (
            <div>
              <label className="text-xs font-semibold text-slate-500">Ambulancia / Vehículo corporativo</label>
              {loadingEquipos ? (
                <div className="flex items-center gap-2 text-sm text-slate-400 py-2"><Loader2 className="w-4 h-4 animate-spin" /> Cargando vehículos...</div>
              ) : equipos.length === 0 ? (
                <p className="text-xs text-slate-400 py-2">No hay vehículos corporativos disponibles.</p>
              ) : (
                <select value={equipoId} onChange={(e) => setEquipoId(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300 bg-slate-50">
                  {equipos.map((eq) => (
                    <option key={eq.id} value={eq.id}>{equipoLabel(eq)}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Externo */}
          {tipoVehiculo === "externo" && (
            <div className="space-y-2">
              <div>
                <label className="text-xs font-semibold text-slate-500">Patente</label>
                <input value={patente} onChange={(e) => setPatente(e.target.value)} placeholder="Ej. ABCD12"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300 bg-slate-50" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500">Marca / Modelo</label>
                <input value={marcaModelo} onChange={(e) => setMarcaModelo(e.target.value)} placeholder="Ej. Toyota Hilux"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300 bg-slate-50" />
              </div>
            </div>
          )}

          {/* Observaciones */}
          <div>
            <label className="text-xs font-semibold text-slate-500">Observaciones (opcional)</label>
            <textarea rows={2} value={observaciones} onChange={(e) => setObservaciones(e.target.value)}
              placeholder="Motivo del consumo directo..."
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300 bg-slate-50" />
          </div>
        </div>

        <div className="px-5 py-4 border-t border-slate-100 flex gap-2 sticky bottom-0 bg-white">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100">Cancelar</button>
          <button onClick={submit} disabled={!valid || saving}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50 flex items-center justify-center gap-1.5" style={{ background: "#0891B2" }}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Truck className="w-4 h-4" />} Consumir y asignar
          </button>
        </div>
      </div>
    </div>
  );
}