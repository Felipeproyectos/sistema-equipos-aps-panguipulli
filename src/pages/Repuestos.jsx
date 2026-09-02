import { useState, useEffect, useCallback, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Package, Plus, RefreshCw, Search, AlertTriangle, UploadCloud, ShoppingCart } from "lucide-react";
import usePullToRefresh from "@/hooks/usePullToRefresh";
import RepuestoCard from "@/components/taller/RepuestoCard";
import RepuestoFormModal from "@/components/taller/RepuestoFormModal";
import CargaMasivaRepuestos from "@/components/taller/CargaMasivaRepuestos";
import ConsumoDirectoModal from "@/components/taller/ConsumoDirectoModal";
import HistorialSolicitudesModal from "@/components/taller/HistorialSolicitudesModal";
import { useAuth } from "@/lib/AuthContext";

const CATEGORIAS = [
  { value: "todos", label: "Todos" },
  { value: "neumaticos", label: "Neumáticos" },
  { value: "frenos", label: "Frenos" },
  { value: "bateria", label: "Batería" },
  { value: "filtros", label: "Filtros" },
  { value: "lubricantes", label: "Lubricantes" },
  { value: "electrico", label: "Eléctrico" },
  { value: "sirena", label: "Sirena" },
  { value: "luces", label: "Luces" },
  { value: "otros", label: "Otros" },
];

export default function Repuestos() {
  const { user } = useAuth();
  const [repuestos, setRepuestos] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState("todos");
  const [soloBajo, setSoloBajo] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [cargaMasivaOpen, setCargaMasivaOpen] = useState(false);
  const [editando, setEditando] = useState(null);
  const [consumoRepuesto, setConsumoRepuesto] = useState(null);
  const [solicitudesOpen, setSolicitudesOpen] = useState(false);
  const containerRef = useRef(null);

  const fetchData = useCallback(async () => {
    const [reps, provs] = await Promise.all([
      base44.entities.Repuesto.list("-created_date", 200).catch(() => []),
      base44.entities.Proveedor.list("-created_date", 200).catch(() => []),
    ]);
    setRepuestos(reps);
    setProveedores(provs);
  }, []);

  useEffect(() => {
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  const { refreshing } = usePullToRefresh(fetchData, containerRef);

  const filtrados = repuestos.filter(r => {
    const matchCat = filtro === "todos" || r.categoria === filtro;
    const matchBajo = !soloBajo || (r.stock_actual || 0) <= (r.stock_minimo || 0);
    const b = busqueda.toLowerCase();
    const matchBusq = !b || [r.nombre, r.codigo, r.marca_modelo_compat].some(v => (v || "").toLowerCase().includes(b));
    return matchCat && matchBajo && matchBusq;
  });

  const stockBajoCount = repuestos.filter(r => (r.stock_actual || 0) <= (r.stock_minimo || 0)).length;
  const valorTotal = repuestos.reduce((s, r) => s + (r.stock_actual || 0) * (r.precio_unitario || 0), 0);

  const handleEditar = (r) => { setEditando(r); setModalOpen(true); };
  const handleGuardar = () => { setEditando(null); setModalOpen(false); fetchData(); };

  return (
    <div ref={containerRef} className="min-h-screen bg-slate-50" style={{ overscrollBehavior: "none" }}>
      {refreshing && <div className="flex items-center justify-center py-3 lg:hidden"><RefreshCw className="w-5 h-5 text-blue-500 animate-spin" /></div>}

      <div className="relative overflow-hidden px-4 lg:px-10 pt-6 lg:pt-12 pb-6 lg:pb-8"
        style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e293b 40%, #334155 100%)" }}>
        <div className="relative max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(255,255,255,0.15)" }}>
              <Package className="w-5 h-5 lg:w-6 lg:h-6 text-white" />
            </div>
            <div>
              <p className="text-amber-300 text-[10px] lg:text-xs font-semibold uppercase tracking-widest hidden sm:block">Taller Mecánico</p>
              <h1 className="text-xl lg:text-4xl font-bold text-white leading-tight">Inventario de Repuestos</h1>
              <p className="text-slate-300 text-xs lg:text-sm mt-0.5">{repuestos.length} items · ${valorTotal.toLocaleString("es-CL")} en stock</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setSolicitudesOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:scale-105"
              style={{ background: "#D97706" }}>
              <ShoppingCart className="w-4 h-4" /> <span className="hidden sm:inline">Solicitud de Compra</span>
            </button>
            <button onClick={() => setCargaMasivaOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:scale-105"
              style={{ background: "#059669" }}>
              <UploadCloud className="w-4 h-4" /> <span className="hidden sm:inline">Carga Masiva</span>
            </button>
            <button onClick={() => { setEditando(null); setModalOpen(true); }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:scale-105"
              style={{ background: "#2563EB" }}>
              <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Nuevo</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 lg:px-10 pb-10">
        {/* Buscador + toggle stock bajo */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4 mt-4">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre, código, modelo..."
              className="w-full bg-white rounded-xl pl-10 pr-4 py-2.5 text-sm border border-slate-200" />
          </div>
          <button onClick={() => setSoloBajo(s => !s)}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold whitespace-nowrap transition-all"
            style={soloBajo ? { background: "#DC2626", color: "white" } : { background: "white", color: "#64748B", border: "1px solid #E2E8F0" }}>
            <AlertTriangle className="w-4 h-4" /> Stock bajo ({stockBajoCount})
          </button>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
          {CATEGORIAS.map(c => (
            <button key={c.value} onClick={() => setFiltro(c.value)}
              className="px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all"
              style={filtro === c.value ? { background: "#1E293B", color: "white" } : { background: "white", color: "#64748B", border: "1px solid #E2E8F0" }}>
              {c.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-16 text-slate-400 text-sm">Cargando...</div>
        ) : filtrados.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center" style={{ boxShadow: "0 4px 20px rgba(15,45,107,0.06)" }}>
            <Package className="w-12 h-12 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-400 text-sm">No hay repuestos que coincidan.</p>
            <button onClick={() => { setEditando(null); setModalOpen(true); }}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white" style={{ background: "#2563EB" }}>
              <Plus className="w-4 h-4" /> Registrar repuesto
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtrados.map(r => (
              <RepuestoCard key={r.id} repuesto={r} onEditar={handleEditar} onCambioStock={fetchData} user={user} onConsumo={(rep) => setConsumoRepuesto(rep)} />
            ))}
          </div>
        )}
      </div>

      <RepuestoFormModal open={modalOpen} onClose={() => { setModalOpen(false); setEditando(null); }} onGuardar={handleGuardar} editando={editando} proveedores={proveedores} />
      <CargaMasivaRepuestos open={cargaMasivaOpen} onClose={() => setCargaMasivaOpen(false)} onComplete={fetchData} proveedores={proveedores} />
      <ConsumoDirectoModal repuesto={consumoRepuesto} user={user} onClose={() => setConsumoRepuesto(null)} onConsumido={fetchData} />
      <HistorialSolicitudesModal open={solicitudesOpen} onClose={() => setSolicitudesOpen(false)} user={user} />
    </div>
  );
}