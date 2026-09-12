import { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { X, Wrench, Car, Building2, HeartPulse } from "lucide-react";
import {
  TIPOS_VEHICULO_SALUD,
  TIPOS_VEHICULO_CORPORATIVO,
  categoriaActivoPorTipo,
  normalizarTipoActivo,
} from "@/lib/centros";

const CATEGORIAS = [
  {
    value: "salud",
    label: "Salud",
    ayuda: "Ambulancias de la red asistencial",
    icon: HeartPulse,
    activo: "bg-red-600 text-white",
    tipos: TIPOS_VEHICULO_SALUD,
  },
  {
    value: "corporativo",
    label: "Corporativo",
    ayuda: "Camionetas, furgones y camiones 3/4",
    icon: Building2,
    activo: "bg-blue-600 text-white",
    tipos: TIPOS_VEHICULO_CORPORATIVO,
  },
  {
    value: "externo",
    label: "Externo",
    ayuda: "Vehículo de otra entidad",
    icon: Car,
    activo: "bg-purple-600 text-white",
    tipos: [],
  },
];

export default function OrdenTrabajoFormModal({ open, onClose, onGuardar, equipos, editando, user }) {
  const [form, setForm] = useState({
    tipo_activo: "salud",
    equipo_id: "",
    equipo_label: "",
    patente: "",
    marca_modelo: "",
    problema_reportado: "",
    diagnostico: "",
    prioridad: "media",
    origen: "solicitud_directa",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (editando) {
      const equipoOT = (equipos || []).find(e => e.id === editando.equipo_id);
      setForm({
        tipo_activo: normalizarTipoActivo(editando.tipo_activo, equipoOT),
        equipo_id: editando.equipo_id || "",
        equipo_label: editando.equipo_label || "",
        patente: editando.patente || "",
        marca_modelo: editando.marca_modelo || "",
        problema_reportado: editando.problema_reportado || "",
        diagnostico: editando.diagnostico || "",
        prioridad: editando.prioridad || "media",
        origen: editando.origen || "solicitud_directa",
      });
    } else {
      setForm({
        tipo_activo: "salud", equipo_id: "", equipo_label: "",
        patente: "", marca_modelo: "", problema_reportado: "",
        diagnostico: "", prioridad: "media", origen: "solicitud_directa",
      });
    }
    setError("");
  }, [editando, open, equipos]);

  const categoria = CATEGORIAS.find(c => c.value === form.tipo_activo) || CATEGORIAS[0];
  const esExterno = form.tipo_activo === "externo";

  const equiposFiltrados = useMemo(
    () => (equipos || []).filter(e => categoriaActivoPorTipo(e.tipo) === form.tipo_activo),
    [equipos, form.tipo_activo]
  );

  if (!open) return null;

  const cambiarCategoria = (valor) => {
    setForm(f => {
      if (f.tipo_activo === valor) return f;
      return {
        ...f,
        tipo_activo: valor,
        equipo_id: "",
        equipo_label: "",
        patente: "",
        marca_modelo: "",
      };
    });
    setError("");
  };

  const handleEquipoChange = (id) => {
    const eq = (equipos || []).find(e => e.id === id);
    setForm(f => ({
      ...f,
      equipo_id: id,
      equipo_label: eq ? `${eq.marca} ${eq.modelo}${eq.patente ? ` · ${eq.patente}` : ""}` : "",
      patente: eq?.patente || "",
      marca_modelo: eq ? `${eq.marca} ${eq.modelo}` : "",
    }));
  };

  const handleSubmit = async () => {
    if (!form.problema_reportado.trim()) { setError("Debe describir el problema reportado."); return; }
    if (!esExterno && !form.equipo_id) {
      setError(form.tipo_activo === "salud"
        ? "Seleccione una ambulancia."
        : "Seleccione un vehículo corporativo.");
      return;
    }
    if (esExterno && !form.patente.trim()) { setError("Ingrese la patente del activo externo."); return; }

    setSaving(true);
    try {
      const numero_ot = editando?.numero_ot || `OT-${new Date().getFullYear()}-${Date.now().toString().slice(-5)}`;
      const label = esExterno
        ? `${form.marca_modelo || "Vehículo externo"} · ${form.patente}`
        : form.equipo_label;

      const base = {
        ...form,
        equipo_label: label,
        numero_ot,
        reportado_por_email: user?.email,
        reportado_por_nombre: user?.full_name,
      };

      if (editando) {
        await base44.entities.OrdenTrabajo.update(editando.id, {
          tipo_activo: form.tipo_activo,
          problema_reportado: form.problema_reportado,
          diagnostico: form.diagnostico,
          prioridad: form.prioridad,
          equipo_label: label,
          patente: form.patente,
          marca_modelo: form.marca_modelo,
        });
      } else {
        base.estado = "pendiente";
        base.linea_tiempo = [{
          fecha: new Date().toISOString(),
          evento: "Orden de trabajo creada",
          usuario_email: user?.email,
          usuario_nombre: user?.full_name,
          notas: form.problema_reportado,
        }];
        await base44.entities.OrdenTrabajo.create(base);
      }
      onGuardar();
      onClose();
    } catch (e) {
      setError(e.message || "Error al guardar");
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center" style={{ background: "rgba(15,23,42,0.5)" }}>
      <div className="bg-white w-full lg:max-w-lg rounded-t-3xl lg:rounded-3xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-bold text-slate-800 flex items-center gap-2">
            <Wrench className="w-5 h-5 text-blue-600" />
            {editando ? `Editar ${editando.numero_ot}` : "Nueva Orden de Trabajo"}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-4">
          {/* Tipo de activo */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">Tipo de Activo</label>
            <div className="grid grid-cols-3 gap-2">
              {CATEGORIAS.map(cat => {
                const Icon = cat.icon;
                const activa = form.tipo_activo === cat.value;
                return (
                  <button key={cat.value} onClick={() => cambiarCategoria(cat.value)}
                    className={`py-3 px-2 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 transition-all ${activa ? cat.activo : "bg-slate-100 text-slate-600"}`}>
                    <Icon className="w-4 h-4 flex-shrink-0" /> {cat.label}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5">{categoria.ayuda}</p>
          </div>

          {/* Selector de equipo */}
          {!esExterno ? (
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">
                {form.tipo_activo === "salud" ? "Ambulancia" : "Equipo / Vehículo"}
              </label>
              <select value={form.equipo_id} onChange={e => handleEquipoChange(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm">
                <option value="">Seleccionar equipo...</option>
                {equiposFiltrados.map(eq => (
                  <option key={eq.id} value={eq.id}>
                    {eq.marca} {eq.modelo}{eq.patente ? ` · ${eq.patente}` : ""}{eq.centro_principal ? ` (${eq.centro_principal})` : ""}
                  </option>
                ))}
              </select>
              {equiposFiltrados.length === 0 && (
                <p className="text-[11px] text-amber-600 font-semibold mt-1.5">
                  No hay vehículos registrados en esta categoría. Regístrelos en el módulo Equipos.
                </p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">Patente</label>
                <input value={form.patente} onChange={e => setForm(f => ({ ...f, patente: e.target.value }))}
                  placeholder="XX-XX-XX" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm uppercase" />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">Marca / Modelo</label>
                <input value={form.marca_modelo} onChange={e => setForm(f => ({ ...f, marca_modelo: e.target.value }))}
                  placeholder="Ej: Toyota Hilux" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm" />
              </div>
            </div>
          )}

          {/* Prioridad */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">Prioridad</label>
            <div className="grid grid-cols-3 gap-2">
              {["alta", "media", "baja"].map(p => {
                const cfg = { alta: "#DC2626", media: "#D97706", baja: "#2563EB" }[p];
                return (
                  <button key={p} onClick={() => setForm(f => ({ ...f, prioridad: p }))}
                    className={`py-2.5 rounded-xl text-sm font-semibold capitalize transition-all ${form.prioridad === p ? "text-white" : "bg-slate-100 text-slate-600"}`}
                    style={form.prioridad === p ? { background: cfg } : {}}>
                    {p}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Problema reportado */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">Problema Reportado *</label>
            <textarea rows={3} value={form.problema_reportado} onChange={e => setForm(f => ({ ...f, problema_reportado: e.target.value }))}
              placeholder="Describa el problema o falla detectada..."
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm resize-none" />
          </div>

          {/* Diagnóstico (solo editar) */}
          {editando && (
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">Diagnóstico Técnico</label>
              <textarea rows={2} value={form.diagnostico} onChange={e => setForm(f => ({ ...f, diagnostico: e.target.value }))}
                placeholder="Diagnóstico del taller..."
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm resize-none" />
            </div>
          )}

          {error && (
            <div className="text-xs text-red-600 font-semibold bg-red-50 rounded-xl px-3 py-2">{error}</div>
          )}
        </div>

        <div className="sticky bottom-0 bg-white px-6 py-4 border-t border-slate-100 flex gap-2">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl text-sm font-bold bg-slate-100 text-slate-600">Cancelar</button>
          <button onClick={handleSubmit} disabled={saving}
            className="flex-1 py-3 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-50"
            style={{ background: "#2563EB" }}>
            {saving ? "Guardando..." : (editando ? "Guardar Cambios" : "Crear Orden")}
          </button>
        </div>
      </div>
    </div>
  );
}
