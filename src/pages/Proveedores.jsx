import { useState, useEffect, useCallback, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Building2, Plus, RefreshCw, Search, FileBarChart } from "lucide-react";
import usePullToRefresh from "@/hooks/usePullToRefresh";
import ProveedorCard from "@/components/taller/ProveedorCard";
import ProveedorFormModal from "@/components/taller/ProveedorFormModal";
import ProveedorHistorialModal from "@/components/taller/ProveedorHistorialModal";
import InformeFinancieroModal from "@/components/taller/InformeFinancieroModal";

const RUBROS = [
  { value: "todos", label: "Todos" },
  { value: "repuestos", label: "Repuestos" },
  { value: "neumaticos", label: "Neumáticos" },
  { value: "lubricantes", label: "Lubricantes" },
  { value: "servicio_tecnico", label: "Servicio Técnico" },
  { value: "otros", label: "Otros" },
];

export default function Proveedores() {
  const [proveedores, setProveedores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState("todos");
  const [busqueda, setBusqueda] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState(null);
  const [historialProveedor, setHistorialProveedor] = useState(null);
  const [informeOpen, setInformeOpen] = useState(false);
  const containerRef = useRef(null);

  const fetchData = useCallback(async () => {
    const data = await base44.entities.Proveedor.list("-created_date", 100).catch(() => []);
    setProveedores(data);
  }, []);

  useEffect(() => {
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  const { refreshing } = usePullToRefresh(fetchData, containerRef);

  const filtrados = proveedores.filter(p => {
    const matchRubro = filtro === "todos" || p.rubro === filtro;
    const b = busqueda.toLowerCase();
    const matchBusqueda = !b || [p.nombre, p.contacto_nombre, p.telefono, p.email, p.rut].some(v => (v || "").toLowerCase().includes(b));
    return matchRubro && matchBusqueda;
  });

  const handleEditar = (p) => { setEditando(p); setModalOpen(true); };
  const handleEliminar = async (p) => {
    await base44.entities.Proveedor.delete(p.id);
    fetchData();
  };
  const handleGuardar = () => { setEditando(null); setModalOpen(false); fetchData(); };

  return (
    <div ref={containerRef} className="min-h-screen bg-slate-50" style={{ overscrollBehavior: "none" }}>
      {refreshing && <div className="flex items-center justify-center py-3 lg:hidden"><RefreshCw className="w-5 h-5 text-blue-500 animate-spin" /></div>}

      <div className="relative overflow-hidden px-4 lg:px-10 pt-6 lg:pt-12 pb-6 lg:pb-8"
        style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e293b 40%, #334155 100%)" }}>
        <div className="relative max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(255,255,255,0.15)" }}>
              <Building2 className="w-5 h-5 lg:w-6 lg:h-6 text-white" />
            </div>
            <div>
              <p className="text-amber-300 text-[10px] lg:text-xs font-semibold uppercase tracking-widest hidden sm:block">Taller Mecánico</p>
              <h1 className="text-xl lg:text-4xl font-bold text-white leading-tight">Proveedores</h1>
              <p className="text-slate-300 text-xs lg:text-sm mt-0.5">{proveedores.length} registrados</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setInformeOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:scale-105"
              style={{ background: "rgba(255,255,255,0.15)" }}>
              <FileBarChart className="w-4 h-4" /> <span className="hidden sm:inline">Informe</span>
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
        {/* Buscador y filtros */}
        <div className="flex flex-col sm:flex-row gap-3 mb-5 mt-4">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre, RUT, contacto..."
              className="w-full bg-white rounded-xl pl-10 pr-4 py-2.5 text-sm border border-slate-200" />
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
          {RUBROS.map(r => (
            <button key={r.value} onClick={() => setFiltro(r.value)}
              className="px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all"
              style={filtro === r.value ? { background: "#1E293B", color: "white" } : { background: "white", color: "#64748B", border: "1px solid #E2E8F0" }}>
              {r.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-16 text-slate-400 text-sm">Cargando...</div>
        ) : filtrados.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center" style={{ boxShadow: "0 4px 20px rgba(15,45,107,0.06)" }}>
            <Building2 className="w-12 h-12 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-400 text-sm">No hay proveedores que coincidan.</p>
            <button onClick={() => { setEditando(null); setModalOpen(true); }}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white" style={{ background: "#2563EB" }}>
              <Plus className="w-4 h-4" /> Registrar proveedor
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtrados.map(p => (
              <ProveedorCard key={p.id} proveedor={p} onEditar={handleEditar} onDelete={handleEliminar} onHistorial={setHistorialProveedor} />
            ))}
          </div>
        )}
      </div>

      <ProveedorFormModal open={modalOpen} onClose={() => { setModalOpen(false); setEditando(null); }} onGuardar={handleGuardar} editando={editando} />
      <ProveedorHistorialModal open={!!historialProveedor} proveedor={historialProveedor} onClose={() => setHistorialProveedor(null)} />
      <InformeFinancieroModal open={informeOpen} onClose={() => setInformeOpen(false)} proveedores={proveedores} />
    </div>
  );
}