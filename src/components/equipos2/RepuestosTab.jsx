import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, Edit, Save, X, AlertTriangle, CheckCircle, Package, User } from "lucide-react";

const TIPOS_CONFIG = {
  neumaticos: { label: "Neumáticos", icon: "🛞", unit: "unidades" },
  frenos: { label: "Frenos", icon: "🔧", unit: "unidades" },
  bateria: { label: "Batería", icon: "🔋", unit: "unidades" },
  filtros: { label: "Filtros Aire/Aceite", icon: "💧", unit: "unidades" },
  sirena: { label: "Sirena", icon: "🚨", unit: "unidades" },
  luces: { label: "Luces", icon: "💡", unit: "unidades" }
};

const ESTADOS_CONFIG = {
  operativo: { label: "OPERATIVO", color: "#16A34A", bg: "#DCFCE7", barColor: "#16A34A" },
  excelente: { label: "EXCELENTE", color: "#2563EB", bg: "#DBEAFE", barColor: "#2563EB" },
  suficiente: { label: "SUFICIENTE", color: "#6366F1", bg: "#EEF2FF", barColor: "#6366F1" },
  revision_requerida: { label: "REVISIÓN REQUERIDA", color: "#EA580C", bg: "#FEF3C7", barColor: "#F59E0B" },
  critico: { label: "CRÍTICO", color: "#DC2626", bg: "#FEE2E2", barColor: "#EF4444" },
  agotado: { label: "AGOTADO", color: "#7F1D1D", bg: "#FEE2E2", barColor: "#EF4444" }
};

export default function RepuestosTab({ equipo, user }) {
  const [repuestos, setRepuestos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newForm, setNewForm] = useState({ tipo: "neumaticos", marca_modelo: "", estado_label: "operativo", vida_util_pct: 100, stock_unidades: 0, ultimo_cambio: "", proximo_mantenimiento: "", notas: "" });

  useEffect(() => {
    loadRepuestos();
  }, [equipo.id]);

  const loadRepuestos = async () => {
    setLoading(true);
    const data = await base44.entities.RepuestoCritico.filter({ equipo_id: equipo.id }).catch(() => []);
    setRepuestos(data);
    setLoading(false);
  };

  const startEdit = (r) => {
    setEditingId(r.id);
    setEditForm({ ...r });
  };

  const cancelEdit = () => { setEditingId(null); setEditForm({}); };

  const saveEdit = async () => {
    setSaving(true);
    const ahora = new Date().toISOString();
    await base44.entities.RepuestoCritico.update(editingId, {
      ...editForm,
      modificado_por: user?.full_name || user?.email || "Usuario desconocido",
      fecha_modificacion: ahora
    });
    await loadRepuestos();
    setEditingId(null);
    setEditForm({});
    setSaving(false);
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    setSaving(true);
    const ahora = new Date().toISOString();
    await base44.entities.RepuestoCritico.create({
      ...newForm,
      equipo_id: equipo.id,
      modificado_por: user?.full_name || user?.email || "Usuario desconocido",
      fecha_modificacion: ahora
    });
    await loadRepuestos();
    setShowAddForm(false);
    setNewForm({ tipo: "neumaticos", marca_modelo: "", estado_label: "operativo", vida_util_pct: 100, stock_unidades: 0, ultimo_cambio: "", proximo_mantenimiento: "", notas: "" });
    setSaving(false);
  };

  const alertasCriticas = repuestos.filter(r => ["critico", "agotado", "revision_requerida"].includes(r.estado_label)).length;
  const stockSaludable = repuestos.length > 0
    ? Math.round(repuestos.filter(r => ["operativo", "excelente", "suficiente"].includes(r.estado_label)).length / repuestos.length * 100)
    : 0;

  if (loading) return <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-5">
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Alertas Críticas" value={alertasCriticas} icon={<AlertTriangle className="w-5 h-5 text-amber-500" />} barColor="#F59E0B" />
        <StatCard label="Stock Saludable" value={`${stockSaludable}%`} icon={<CheckCircle className="w-5 h-5 text-green-500" />} barColor="#10B981" />
        <StatCard label="Total Repuestos" value={repuestos.length} icon={<Package className="w-5 h-5 text-blue-500" />} barColor="#2563EB" />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-slate-900 text-lg" style={{ letterSpacing: "-0.02em" }}>Estado de Repuestos Críticos</h3>
          <p className="text-xs text-slate-400 mt-0.5">Supervisión de componentes esenciales del vehículo</p>
        </div>
        <button onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white"
          style={{ background: "#2563EB" }}>
          <Plus className="w-3.5 h-3.5" /> Nuevo Repuesto
        </button>
      </div>

      {/* Add form */}
      {showAddForm && (
        <form onSubmit={handleAdd} className="bg-white p-5 rounded-2xl space-y-3" style={{ border: "1px solid #E2E8F0" }}>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Registrar Nuevo Repuesto</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Tipo</label>
              <select className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" style={{ borderColor: "#E2E8F0" }}
                value={newForm.tipo} onChange={e => setNewForm(f => ({ ...f, tipo: e.target.value }))}>
                {Object.entries(TIPOS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Estado</label>
              <select className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" style={{ borderColor: "#E2E8F0" }}
                value={newForm.estado_label} onChange={e => setNewForm(f => ({ ...f, estado_label: e.target.value }))}>
                {Object.entries(ESTADOS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Marca / Modelo</label>
              <input className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" style={{ borderColor: "#E2E8F0" }}
                placeholder="Ej: Pirelli All-Season" value={newForm.marca_modelo} onChange={e => setNewForm(f => ({ ...f, marca_modelo: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Vida Útil (%)</label>
              <input type="number" min="0" max="100" className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" style={{ borderColor: "#E2E8F0" }}
                value={newForm.vida_util_pct} onChange={e => setNewForm(f => ({ ...f, vida_util_pct: Number(e.target.value) }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Stock (unidades)</label>
              <input type="number" min="0" className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" style={{ borderColor: "#E2E8F0" }}
                value={newForm.stock_unidades} onChange={e => setNewForm(f => ({ ...f, stock_unidades: Number(e.target.value) }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Último Cambio</label>
              <input className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" style={{ borderColor: "#E2E8F0" }}
                placeholder="Ej: Enero 2026" value={newForm.ultimo_cambio} onChange={e => setNewForm(f => ({ ...f, ultimo_cambio: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-slate-600 block mb-1">Próximo Mantenimiento</label>
              <input className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" style={{ borderColor: "#E2E8F0" }}
                placeholder="Ej: Junio 2026 / Cada 10.000 km" value={newForm.proximo_mantenimiento} onChange={e => setNewForm(f => ({ ...f, proximo_mantenimiento: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: "#2563EB" }}>
              {saving ? "Guardando..." : "Guardar Repuesto"}
            </button>
            <button type="button" onClick={() => setShowAddForm(false)} className="px-4 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100">Cancelar</button>
          </div>
        </form>
      )}

      {/* Repuesto cards */}
      {repuestos.length === 0 ? (
        <div className="py-14 flex flex-col items-center gap-3">
          <Package className="w-10 h-10 text-slate-200" />
          <p className="text-sm text-slate-400">Sin repuestos registrados. Agrega el primero.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {repuestos.map(r => (
            <RepuestoCard key={r.id} repuesto={r} isEditing={editingId === r.id}
              editForm={editForm} setEditForm={setEditForm}
              onEdit={() => startEdit(r)} onCancel={cancelEdit} onSave={saveEdit} saving={saving} />
          ))}
        </div>
      )}
    </div>
  );
}

function RepuestoCard({ repuesto: r, isEditing, editForm, setEditForm, onEdit, onCancel, onSave, saving }) {
  const tipo = TIPOS_CONFIG[r.tipo] || { label: r.tipo, icon: "🔩", unit: "unidades" };
  const estadoCfg = ESTADOS_CONFIG[isEditing ? editForm.estado_label : r.estado_label] || ESTADOS_CONFIG.operativo;
  const vidaPct = isEditing ? (editForm.vida_util_pct || 0) : (r.vida_util_pct || 0);
  const stockBajo = (r.stock_unidades || 0) <= 2 && !isEditing;

  return (
    <div className="bg-white rounded-2xl overflow-hidden" style={{ border: "1px solid #E2E8F0", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
      {/* Card header */}
      <div className="px-5 pt-4 pb-3 flex items-start justify-between" style={{ borderBottom: "1px solid #F1F5F9" }}>
        <div className="flex items-center gap-3">
          <span className="text-2xl">{tipo.icon}</span>
          <div>
            <div className="flex items-center gap-2">
              <p className="font-bold text-slate-900">{tipo.label}</p>
              {!isEditing && (
                <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ color: estadoCfg.color, background: estadoCfg.bg }}>
                  {estadoCfg.label}
                </span>
              )}
            </div>
            {!isEditing && r.marca_modelo && <p className="text-xs text-slate-400 mt-0.5">{r.marca_modelo}</p>}
          </div>
        </div>
        <div className="flex gap-1">
          {isEditing ? (
            <>
              <button onClick={onSave} disabled={saving}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold text-white"
                style={{ background: "#2563EB" }}>
                {saving ? "..." : <><Save className="w-3 h-3" /> Guardar</>}
              </button>
              <button onClick={onCancel} className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-500 hover:bg-slate-100">
                <X className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <button onClick={onEdit} className="p-1.5 rounded-xl text-slate-400 hover:bg-slate-100 transition-colors">
              <Edit className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="px-5 py-4 space-y-3">
        {isEditing ? (
          /* Edit mode */
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1">Estado</label>
                <select className="w-full border rounded-xl px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-200" style={{ borderColor: "#E2E8F0" }}
                  value={editForm.estado_label} onChange={e => setEditForm(f => ({ ...f, estado_label: e.target.value }))}>
                  {Object.entries(ESTADOS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1">Marca / Modelo</label>
                <input className="w-full border rounded-xl px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-200" style={{ borderColor: "#E2E8F0" }}
                  value={editForm.marca_modelo || ""} onChange={e => setEditForm(f => ({ ...f, marca_modelo: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1">Vida Útil (%)</label>
                <input type="number" min="0" max="100" className="w-full border rounded-xl px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-200" style={{ borderColor: "#E2E8F0" }}
                  value={editForm.vida_util_pct || 0} onChange={e => setEditForm(f => ({ ...f, vida_util_pct: Number(e.target.value) }))} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1">Stock (unidades)</label>
                <input type="number" min="0" className="w-full border rounded-xl px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-200" style={{ borderColor: "#E2E8F0" }}
                  value={editForm.stock_unidades || 0} onChange={e => setEditForm(f => ({ ...f, stock_unidades: Number(e.target.value) }))} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1">Último Cambio</label>
                <input className="w-full border rounded-xl px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-200" style={{ borderColor: "#E2E8F0" }}
                  placeholder="Ej: Enero 2026" value={editForm.ultimo_cambio || ""} onChange={e => setEditForm(f => ({ ...f, ultimo_cambio: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1">Próximo Mant.</label>
                <input className="w-full border rounded-xl px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-200" style={{ borderColor: "#E2E8F0" }}
                  placeholder="Ej: Junio 2026" value={editForm.proximo_mantenimiento || ""} onChange={e => setEditForm(f => ({ ...f, proximo_mantenimiento: e.target.value }))} />
              </div>
            </div>
            <div>
              {/* Live bar preview */}
              <p className="text-xs text-slate-400 mb-1">Vista previa vida útil: {editForm.vida_util_pct || 0}%</p>
              <div className="h-2 rounded-full" style={{ background: "#E2E8F0" }}>
                <div className="h-2 rounded-full transition-all" style={{ width: `${editForm.vida_util_pct || 0}%`, background: ESTADOS_CONFIG[editForm.estado_label]?.barColor || "#2563EB" }} />
              </div>
            </div>
          </div>
        ) : (
          /* View mode */
          <>
            {/* Vida útil bar */}
            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-slate-500">{vidaPct}% vida útil</span>
                <span className="font-medium" style={{ color: estadoCfg.barColor }}>Vida Estimada</span>
              </div>
              <div className="h-2.5 rounded-full" style={{ background: "#E2E8F0" }}>
                <div className="h-2.5 rounded-full transition-all duration-500" style={{ width: `${vidaPct}%`, background: estadoCfg.barColor }} />
              </div>
            </div>

            {/* Stock */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">Stock en Almacén</span>
              <span className={`text-sm font-bold ${stockBajo ? "text-red-600" : "text-slate-800"}`}>
                {String(r.stock_unidades || 0).padStart(2, "0")} Unidades
                {stockBajo && <span className="text-xs font-medium ml-1">(Bajo)</span>}
              </span>
            </div>

            {/* Último cambio / próximo */}
            {(r.ultimo_cambio || r.proximo_mantenimiento) && (
              <div className="grid grid-cols-2 gap-2 pt-1">
                {r.ultimo_cambio && (
                  <div className="p-2 rounded-xl" style={{ background: "#F8FAFC", border: "1px solid #E2E8F0" }}>
                    <p className="text-xs text-slate-400 mb-0.5">Último cambio</p>
                    <p className="text-xs font-semibold text-slate-700">{r.ultimo_cambio}</p>
                  </div>
                )}
                {r.proximo_mantenimiento && (
                  <div className="p-2 rounded-xl" style={{ background: "#FFF7ED", border: "1px solid #FDE68A" }}>
                    <p className="text-xs text-amber-600 mb-0.5">Próx. Agenda</p>
                    <p className="text-xs font-semibold text-amber-800">{r.proximo_mantenimiento}</p>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Audit footer */}
        {r.modificado_por && !isEditing && (
          <div className="flex items-center gap-1.5 pt-2 border-t" style={{ borderColor: "#F1F5F9" }}>
            <User className="w-3 h-3 text-slate-300 flex-shrink-0" />
            <p className="text-xs text-slate-400">
              Modificado por <span className="font-medium text-slate-500">{r.modificado_por}</span>
              {r.fecha_modificacion && (
                <> · {new Date(r.fecha_modificacion).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" })}</>
              )}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, barColor }) {
  return (
    <div className="bg-white p-4 rounded-2xl" style={{ border: "1px solid #E2E8F0", borderLeft: `3px solid ${barColor}` }}>
      <div className="flex items-start justify-between mb-1">
        <p className="text-xs text-slate-500">{label}</p>
        {icon}
      </div>
      <p className="text-2xl font-bold text-slate-900" style={{ letterSpacing: "-0.03em" }}>{value}</p>
    </div>
  );
}