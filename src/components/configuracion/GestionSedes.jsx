import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Building2, Plus, Trash2, Edit2, Check, X, ChevronDown, ChevronUp, Loader2 } from "lucide-react";

export default function GestionSedes() {
  const [sedes, setSedes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Estado para nueva sede
  const [nuevaSede, setNuevaSede] = useState("");
  const [showNuevaSede, setShowNuevaSede] = useState(false);

  // Estado de edición de sede
  const [editingSedeId, setEditingSedeId] = useState(null);
  const [editingSedeNombre, setEditingSedeNombre] = useState("");

  // Estado para nueva subsede por sede
  const [nuevaSubsede, setNuevaSubsede] = useState({});
  const [showNuevaSubsede, setShowNuevaSubsede] = useState({});
  const [expandedSedes, setExpandedSedes] = useState({});

  useEffect(() => {
    cargarSedes();
  }, []);

  const cargarSedes = async () => {
    setLoading(true);
    const centros = await base44.entities.Centro.list().catch(() => []);
    if (centros.length > 0) {
      setSedes(centros);
    } else {
      // Cargar desde lib/centros.js como datos iniciales
      const { CENTROS_ESTRUCTURA } = await import("@/lib/centros");
      // Crear registros en BD a partir de los datos estáticos
      const creados = await Promise.all(
        CENTROS_ESTRUCTURA.map(c =>
          base44.entities.Centro.create({ nombre: c.nombre, tipo: "CESFAM", sucursales: c.subsedes })
        )
      );
      setSedes(creados);
    }
    setLoading(false);
  };

  const handleAgregarSede = async () => {
    if (!nuevaSede.trim()) return;
    setSaving(true);
    const nueva = await base44.entities.Centro.create({ nombre: nuevaSede.trim(), tipo: "CESFAM", sucursales: [] });
    setSedes(prev => [...prev, nueva]);
    setNuevaSede("");
    setShowNuevaSede(false);
    setSaving(false);
  };

  const handleEliminarSede = async (id) => {
    await base44.entities.Centro.delete(id);
    setSedes(prev => prev.filter(s => s.id !== id));
  };

  const handleGuardarNombreSede = async (sede) => {
    if (!editingSedeNombre.trim()) return;
    await base44.entities.Centro.update(sede.id, { nombre: editingSedeNombre.trim() });
    setSedes(prev => prev.map(s => s.id === sede.id ? { ...s, nombre: editingSedeNombre.trim() } : s));
    setEditingSedeId(null);
  };

  const handleAgregarSubsede = async (sede) => {
    const nombre = nuevaSubsede[sede.id]?.trim();
    if (!nombre) return;
    const actualizadas = [...(sede.sucursales || []), nombre];
    await base44.entities.Centro.update(sede.id, { sucursales: actualizadas });
    setSedes(prev => prev.map(s => s.id === sede.id ? { ...s, sucursales: actualizadas } : s));
    setNuevaSubsede(prev => ({ ...prev, [sede.id]: "" }));
    setShowNuevaSubsede(prev => ({ ...prev, [sede.id]: false }));
  };

  const handleEliminarSubsede = async (sede, subsede) => {
    const actualizadas = (sede.sucursales || []).filter(s => s !== subsede);
    await base44.entities.Centro.update(sede.id, { sucursales: actualizadas });
    setSedes(prev => prev.map(s => s.id === sede.id ? { ...s, sucursales: actualizadas } : s));
  };

  if (loading) return (
    <div className="flex items-center justify-center py-10">
      <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
    </div>
  );

  const inputCls = "border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white";

  return (
    <div className="space-y-4">
      {sedes.map(sede => (
        <div key={sede.id} className="border border-slate-200 rounded-2xl overflow-hidden">
          {/* Cabecera de sede */}
          <div className="flex items-center justify-between p-4 bg-slate-50">
            {editingSedeId === sede.id ? (
              <div className="flex items-center gap-2 flex-1">
                <input
                  autoFocus
                  value={editingSedeNombre}
                  onChange={e => setEditingSedeNombre(e.target.value)}
                  className={`${inputCls} flex-1`}
                  onKeyDown={e => e.key === "Enter" && handleGuardarNombreSede(sede)}
                />
                <button onClick={() => handleGuardarNombreSede(sede)} className="p-1.5 rounded-lg bg-green-100 text-green-700 hover:bg-green-200"><Check className="w-4 h-4" /></button>
                <button onClick={() => setEditingSedeId(null)} className="p-1.5 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200"><X className="w-4 h-4" /></button>
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <Building2 className="w-4 h-4 text-blue-500 flex-shrink-0" />
                <span className="font-semibold text-slate-800 text-sm truncate">{sede.nombre}</span>
                <span className="text-xs text-slate-400">({(sede.sucursales || []).length} subsedes)</span>
              </div>
            )}
            {editingSedeId !== sede.id && (
              <div className="flex items-center gap-1 ml-2">
                <button
                  onClick={() => { setEditingSedeId(sede.id); setEditingSedeNombre(sede.nombre); }}
                  className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-600"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setExpandedSedes(prev => ({ ...prev, [sede.id]: !prev[sede.id] }))}
                  className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-600"
                >
                  {expandedSedes[sede.id] ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={() => handleEliminarSede(sede.id)}
                  className="p-1.5 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-500"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Lista de subsedes (expandible) */}
          {expandedSedes[sede.id] && (
            <div className="px-4 py-3 space-y-2 border-t border-slate-100">
              {(sede.sucursales || []).length === 0 && (
                <p className="text-xs text-slate-400 italic py-1">Sin subsedes registradas</p>
              )}
              {(sede.sucursales || []).map(sub => (
                <div key={sub} className="flex items-center justify-between py-1.5 px-3 rounded-xl bg-white border border-slate-100">
                  <span className="text-sm text-slate-700">{sub}</span>
                  <button
                    onClick={() => handleEliminarSubsede(sede, sub)}
                    className="p-1 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-500"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}

              {/* Agregar subsede */}
              {showNuevaSubsede[sede.id] ? (
                <div className="flex items-center gap-2 mt-2">
                  <input
                    autoFocus
                    placeholder="Nombre de la subsede..."
                    value={nuevaSubsede[sede.id] || ""}
                    onChange={e => setNuevaSubsede(prev => ({ ...prev, [sede.id]: e.target.value }))}
                    className={`${inputCls} flex-1`}
                    onKeyDown={e => e.key === "Enter" && handleAgregarSubsede(sede)}
                  />
                  <button onClick={() => handleAgregarSubsede(sede)} className="p-1.5 rounded-lg bg-green-100 text-green-700 hover:bg-green-200"><Check className="w-4 h-4" /></button>
                  <button onClick={() => setShowNuevaSubsede(prev => ({ ...prev, [sede.id]: false }))} className="p-1.5 rounded-lg bg-slate-100 text-slate-500"><X className="w-4 h-4" /></button>
                </div>
              ) : (
                <button
                  onClick={() => setShowNuevaSubsede(prev => ({ ...prev, [sede.id]: true }))}
                  className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium mt-1 px-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Agregar subsede
                </button>
              )}
            </div>
          )}
        </div>
      ))}

      {/* Agregar nueva sede */}
      {showNuevaSede ? (
        <div className="flex items-center gap-2 p-4 border border-dashed border-blue-300 rounded-2xl bg-blue-50">
          <input
            autoFocus
            placeholder="Nombre de la sede principal..."
            value={nuevaSede}
            onChange={e => setNuevaSede(e.target.value)}
            className={`${inputCls} flex-1`}
            onKeyDown={e => e.key === "Enter" && handleAgregarSede()}
          />
          <button onClick={handleAgregarSede} disabled={saving} className="p-1.5 rounded-lg bg-green-100 text-green-700 hover:bg-green-200">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          </button>
          <button onClick={() => { setShowNuevaSede(false); setNuevaSede(""); }} className="p-1.5 rounded-lg bg-slate-100 text-slate-500"><X className="w-4 h-4" /></button>
        </div>
      ) : (
        <button
          onClick={() => setShowNuevaSede(true)}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed border-slate-200 text-sm font-medium text-slate-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
        >
          <Plus className="w-4 h-4" /> Agregar sede principal
        </button>
      )}
    </div>
  );
}