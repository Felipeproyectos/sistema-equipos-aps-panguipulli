import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { X, FileBarChart, Printer, Loader2, Check, CheckCheck } from "lucide-react";
import { generarInformeFinanciero } from "@/utils/generarInformeFinanciero";

export default function InformeFinancieroModal({ open, onClose, proveedores }) {
  const [seleccionados, setSeleccionados] = useState([]);
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const toggle = (id) => {
    setSeleccionados(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleTodos = () => {
    setSeleccionados(seleccionados.length === proveedores.length ? [] : proveedores.map(p => p.id));
  };

  const todosSeleccionados = seleccionados.length === proveedores.length && proveedores.length > 0;

  const handleGenerar = async () => {
    setLoading(true);
    try {
      const todas = await base44.entities.OrdenDeCompra.list("-created_date", 500);
      const enRango = (fecha) => {
        if (!fecha) return true;
        if (fechaDesde && fecha < fechaDesde) return false;
        if (fechaHasta && fecha > fechaHasta) return false;
        return true;
      };
      const filtradas = (todas || []).filter(o =>
        seleccionados.includes(o.proveedor_id) && enRango(o.fecha_emision)
      );
      const provsSel = proveedores.filter(p => seleccionados.includes(p.id));
      generarInformeFinanciero({
        proveedores: provsSel,
        ordenes: filtradas,
        fechaDesde,
        fechaHasta,
        esMulti: true,
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center" style={{ background: "rgba(15,23,42,0.5)" }}>
      <div className="bg-white w-full lg:max-w-xl rounded-t-3xl lg:rounded-3xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white px-6 py-4 border-b border-slate-100 flex items-center justify-between z-10">
          <div className="flex items-center gap-2">
            <FileBarChart className="w-5 h-5 text-blue-600 flex-shrink-0" />
            <div>
              <h2 className="font-bold text-slate-800 text-sm">Informe Financiero Consolidado</h2>
              <p className="text-xs text-slate-400">Costos por proveedor y rango de fechas</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Rango de fechas */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Desde</label>
              <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-300" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Hasta</label>
              <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-300" />
            </div>
          </div>

          {/* Selección de proveedores */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-slate-600">Proveedores a incluir</p>
              <button onClick={toggleTodos}
                className={`text-xs font-semibold px-3 py-1 rounded-lg flex items-center gap-1 transition-all ${todosSeleccionados ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500"}`}>
                {todosSeleccionados ? <><CheckCheck className="w-3 h-3" /> Quitar todos</> : <>Seleccionar todos</>}
              </button>
            </div>
            <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-2xl divide-y divide-slate-100">
              {proveedores.map((p) => {
                const sel = seleccionados.includes(p.id);
                return (
                  <button key={p.id} onClick={() => toggle(p.id)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-all ${sel ? "bg-blue-50" : "bg-white hover:bg-slate-50"}`}>
                    <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 ${sel ? "bg-blue-600 border-blue-600" : "border-slate-300"}`}>
                      {sel && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-700 truncate">{p.nombre}</p>
                      <p className="text-[11px] text-slate-400">{p.rubro || "Sin rubro"}{p.rut ? ` · ${p.rut}` : ""}</p>
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5">{seleccionados.length} de {proveedores.length} seleccionados</p>
          </div>
        </div>

        <div className="sticky bottom-0 bg-white px-6 py-4 border-t border-slate-100 flex gap-2">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl text-sm font-bold bg-slate-100 text-slate-600">
            Cancelar
          </button>
          <button onClick={handleGenerar} disabled={seleccionados.length === 0 || loading}
            className="flex-[2] py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-40"
            style={{ background: "linear-gradient(135deg,#1565c0,#0288d1)", color: "white" }}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
            {loading ? "Generando..." : "Generar Informe"}
          </button>
        </div>
      </div>
    </div>
  );
}