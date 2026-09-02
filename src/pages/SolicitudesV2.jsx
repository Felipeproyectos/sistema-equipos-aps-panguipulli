import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { ClipboardList, Plus, Search, Loader2, X } from "lucide-react";
import { TIPOS_SOLICITUD, CENTROS_ESTRUCTURA } from "@/lib/centros";
import NativePicker from "@/components/NativePicker";
import { useAuth } from "@/lib/AuthContext";

const ESTADO_CONFIG = {
  pendiente: { label: "Pendiente", color: "#d97706", bg: "#fffbeb" },
  en_proceso: { label: "En Proceso", color: "#2563eb", bg: "#eff6ff" },
  finalizada: { label: "Finalizada", color: "#16a34a", bg: "#f0fdf4" }
};

export default function SolicitudesV2() {
  const { user } = useAuth();
  const [solicitudes, setSolicitudes] = useState([]);
  const [equipos, setEquipos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [busqueda, setBusqueda] = useState("");
  const [editando, setEditando] = useState(null);

  useEffect(() => {
    Promise.all([
      base44.entities.Solicitud.list("-fecha", 200),
      base44.entities.Equipo.list("-created_date", 500)
    ]).then(([sol, eq]) => {
      setSolicitudes(sol);
      setEquipos(eq);
      setLoading(false);
    });
  }, []);

  const reload = () => base44.entities.Solicitud.list("-fecha", 200).then(setSolicitudes);

  // Optimistic update helper for status changes
  const optimisticUpdate = (id, data) => {
    setSolicitudes(prev => prev.map(s => s.id === id ? { ...s, ...data } : s));
  };

  // "Gestiona" (ve todas + puede resolver): Base del Sistema, Administrador,
  // Encargado Salud y Encargado Compras Salud. El resto (Usuario/Chofer) solo
  // ve y gestiona sus propias solicitudes.
  const isAdmin = ["super_admin", "admin", "encargado_salud", "encargado_compras_salud"].includes(user?.role);
  const solicitudesFiltradas = isAdmin ? solicitudes : solicitudes.filter(s => s.usuario_email === user?.email);

  const filtradas = solicitudesFiltradas.filter(s => {
    if (filtroEstado !== "todos" && s.estado !== filtroEstado) return false;
    if (busqueda) {
      const eq = equipos.find(e => e.id === s.equipo_id);
      const b = busqueda.toLowerCase();
      return (eq?.marca || "").toLowerCase().includes(b) || (s.observaciones || "").toLowerCase().includes(b) || (s.usuario_nombre || "").toLowerCase().includes(b);
    }
    return true;
  });

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen" style={{ background: "#e8f4fd" }}>
      <div className="relative overflow-hidden px-6 lg:px-10 pt-10 pb-8" style={{ background: "linear-gradient(135deg, #0f2d6b 0%, #1565c0 40%, #29b6f6 100%)" }}>
        <div className="relative max-w-5xl mx-auto flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: "rgba(255,255,255,0.2)" }}>
              <ClipboardList className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-cyan-200 text-xs font-semibold uppercase tracking-widest">Gestión</p>
              <h1 className="text-3xl font-bold text-white">Solicitudes</h1>
              <p className="text-blue-100 text-sm mt-0.5">{solicitudes.filter(s => s.estado === "pendiente").length} pendiente(s)</p>
            </div>
          </div>
          <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold" style={{ background: "rgba(255,255,255,0.2)", color: "white", border: "1px solid rgba(255,255,255,0.3)" }}>
            <Plus className="w-4 h-4" /> Nueva Solicitud
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 lg:px-10 pt-6 pb-10">
        {/* Resumen */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {Object.entries(ESTADO_CONFIG).map(([k, v]) => (
            <div key={k} className="bg-white rounded-2xl p-4 shadow border border-slate-100">
              <p className="text-2xl font-bold" style={{ color: v.color }}>{solicitudes.filter(s => s.estado === k).length}</p>
              <p className="text-xs text-slate-500 mt-0.5">{v.label}</p>
            </div>
          ))}
        </div>

        {/* Filtros */}
        <div className="bg-white rounded-2xl shadow p-4 mb-6 flex flex-wrap gap-3 items-center">
          <div className="flex-1 min-w-48 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input type="text" placeholder="Buscar..." className="w-full pl-10 pr-4 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-300" value={busqueda} onChange={e => setBusqueda(e.target.value)} />
          </div>
          <div className="flex gap-2 flex-wrap">
            {[{ key: "todos", label: "Todas" }, ...Object.entries(ESTADO_CONFIG).map(([k, v]) => ({ key: k, label: v.label }))].map(t => (
              <button key={t.key} onClick={() => setFiltroEstado(t.key)}
                className={`px-4 py-2 rounded-xl text-xs font-medium transition-all ${filtroEstado === t.key ? "text-white" : "bg-white text-slate-500 border border-slate-200"}`}
                style={filtroEstado === t.key ? { background: "#1a2e4a" } : {}}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Lista */}
        <div className="space-y-3">
          {filtradas.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl shadow text-slate-400">
              <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p>No hay solicitudes</p>
            </div>
          ) : filtradas.map(sol => {
            const equipo = equipos.find(e => e.id === sol.equipo_id);
            const tipoLabel = TIPOS_SOLICITUD.find(t => t.value === sol.tipo)?.label || sol.tipo;
            const cfg = ESTADO_CONFIG[sol.estado] || ESTADO_CONFIG.pendiente;
            return (
              <div key={sol.id} className="bg-white rounded-2xl shadow border border-slate-100 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ color: cfg.color, background: cfg.bg }}>{cfg.label}</span>
                      <span className="text-xs text-slate-500">{tipoLabel}</span>
                    </div>
                    <p className="font-semibold text-slate-900 text-sm">
                      {equipo ? `${equipo.marca} ${equipo.modelo}` : "Equipo desconocido"}
                      {equipo?.numero_inventario && <span className="text-slate-400 font-normal ml-1">· Inv.{equipo.numero_inventario}</span>}
                    </p>
                    <p className="text-xs text-slate-500">
                      {equipo?.centro_principal || sol.centro}
                      {equipo?.subsede && ` · ${equipo.subsede}`}
                      {equipo?.ubicacion_especifica && ` · ${equipo.ubicacion_especifica}`}
                      {" · "}{sol.fecha}
                    </p>
                    {isAdmin && sol.usuario_nombre && <p className="text-xs text-slate-400">Solicitante: {sol.usuario_nombre}</p>}
                    {sol.alerta_id && <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200 inline-block mt-1">Desde alerta</span>}
                    {sol.observaciones && <p className="text-xs text-slate-500 mt-1">{sol.observaciones}</p>}
                    {sol.respuesta_admin && (
                      <p className="text-xs text-blue-600 mt-1 bg-blue-50 rounded-lg px-2 py-1">Resp: {sol.respuesta_admin}</p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5 flex-shrink-0">
                    {isAdmin && sol.estado !== "finalizada" && (
                      <button onClick={() => setEditando(sol)} className="px-3 py-1.5 rounded-xl text-xs font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50">
                        Gestionar
                      </button>
                    )}
                    {/* El propio solicitante puede cancelar mientras siga "pendiente" */}
                    {sol.usuario_email === user?.email && sol.estado === "pendiente" && (
                      <button
                        onClick={async () => {
                          if (!confirm("¿Cancelar esta solicitud?")) return;
                          await base44.entities.Solicitud.delete(sol.id);
                          setSolicitudes(prev => prev.filter(s => s.id !== sol.id));
                        }}
                        className="px-3 py-1.5 rounded-xl text-xs font-semibold border border-red-200 text-red-600 hover:bg-red-50"
                      >
                        Cancelar
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {showForm && (
        <SolicitudForm
          equipos={equipos}
          user={user}
          onClose={() => setShowForm(false)}
          onOptimistic={(data) => setSolicitudes(prev => [{ id: `temp-${Date.now()}`, ...data }, ...prev])}
          onSaved={() => { setShowForm(false); reload(); }}
        />
      )}
      {editando && (
        <GestionarModal
          solicitud={editando}
          onClose={() => setEditando(null)}
          onOptimistic={(data) => optimisticUpdate(editando.id, data)}
          onSaved={() => { setEditando(null); reload(); }}
        />
      )}
    </div>
  );
}

// Tipos de solicitud según tipo de equipo (basado en insumos y consumibles reales)
const TIPOS_POR_EQUIPO = {
  dea: [
    { value: "cambio_parches_adulto",      label: "Reposición Parches / Electrodos Adulto" },
    { value: "cambio_parches_pediatrico",   label: "Reposición Parches / Electrodos Pediátrico" },
    { value: "reemplazo_bateria",           label: "Reemplazo de Batería" },
    { value: "mantenimiento_preventivo",    label: "Mantenimiento Preventivo" },
    { value: "revision_tecnica",            label: "Revisión Técnica" },
    { value: "limpieza_desinfeccion",        label: "Limpieza y Desinfección" },
    { value: "mantenimiento_correctivo",    label: "Reparación / Mantenimiento Correctivo" },
    { value: "otros",                       label: "Otros" },
  ],
  monitor_desfibrilador: [
    { value: "cambio_electrodos_adulto",    label: "Reposición Electrodos Adulto" },
    { value: "cambio_electrodos_pediatrico",label: "Reposición Electrodos Pediátrico" },
    { value: "reemplazo_bateria",           label: "Reemplazo de Batería" },
    { value: "reposicion_papel",            label: "Reposición Papel de Registro" },
    { value: "cables_ecg",                  label: "Reposición Cables ECG" },
    { value: "calibracion",                 label: "Calibración de Parámetros" },
    { value: "mantenimiento_preventivo",    label: "Mantenimiento Preventivo" },
    { value: "revision_tecnica",            label: "Revisión Técnica" },
    { value: "mantenimiento_correctivo",    label: "Reparación / Mantenimiento Correctivo" },
    { value: "compra_repuestos",            label: "Compra de Repuestos / Accesorios" },
    { value: "otros",                       label: "Otros" },
  ],
  monitor_multiparametros: [
    { value: "sensor_spo2",                 label: "Reposición Sensor SpO2 (saturación)" },
    { value: "manguito_presion",            label: "Reposición Manguito NIBP (presión)" },
    { value: "cables_ecg",                  label: "Reposición Cables ECG / Electrodos" },
    { value: "sensor_temperatura",          label: "Reposición Sensor de Temperatura" },
    { value: "calibracion",                 label: "Calibración de Parámetros" },
    { value: "reemplazo_bateria",           label: "Reemplazo de Batería" },
    { value: "mantenimiento_preventivo",    label: "Mantenimiento Preventivo" },
    { value: "revision_tecnica",            label: "Revisión Técnica" },
    { value: "mantenimiento_correctivo",    label: "Reparación / Mantenimiento Correctivo" },
    { value: "compra_repuestos",            label: "Compra de Repuestos / Accesorios" },
    { value: "otros",                       label: "Otros" },
  ],
  ambulancia: [
    { value: "cambio_aceite",               label: "Cambio de Aceite y Filtros" },
    { value: "bateria_vehiculo",             label: "Reemplazo Batería Vehículo" },
    { value: "neumaticos",                   label: "Cambio / Revisión Neumáticos" },
    { value: "luces",                        label: "Revisión / Cambio de Luces" },
    { value: "equipamiento_interno",         label: "Equipamiento Interno (camilla, balón O₂, etc.)" },
    { value: "mantenimiento_general",        label: "Mantenimiento General" },
    { value: "revision_tecnica",             label: "Revisión Técnica Vehicular" },
    { value: "mantenimiento_correctivo",     label: "Reparación / Mantenimiento Correctivo" },
    { value: "otros",                        label: "Otros" },
  ],
  default: [
    { value: "mantenimiento_preventivo",    label: "Mantenimiento Preventivo" },
    { value: "mantenimiento_correctivo",    label: "Mantenimiento Correctivo" },
    { value: "revision_tecnica",            label: "Revisión Técnica" },
    { value: "compra_repuestos",            label: "Compra de Repuestos" },
    { value: "otros",                       label: "Otros" },
  ]
};

const TIPO_EQUIPO_LABEL = {
  dea: "DEA",
  monitor_desfibrilador: "Monitor Desfibrilador",
  ambulancia: "Ambulancia",
  monitor_multiparametros: "Monitor Multiparámetros"
};

function SolicitudForm({ equipos, user, onClose, onSaved, onOptimistic }) {
  const centroDefault = user?.centro_principal || user?.centro_asignado || "";
  const isAdmin = ["super_admin", "admin", "encargado_salud", "encargado_compras_salud"].includes(user?.role);

  // Equipos filtrados según centro del usuario
  const equiposFiltrados = centroDefault && !isAdmin
    ? equipos.filter(eq => eq.centro_principal === centroDefault)
    : equipos;

  const [form, setForm] = useState({
    equipo_id: "",
    tipo: "",
    fecha: new Date().toISOString().split("T")[0],
    observaciones: "",
    centro: centroDefault
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const equipoSeleccionado = equiposFiltrados.find(e => e.id === form.equipo_id);
  const tipoEquipo = equipoSeleccionado?.tipo || null;
  const tiposDisponibles = tipoEquipo ? (TIPOS_POR_EQUIPO[tipoEquipo] || TIPOS_POR_EQUIPO.default) : [];

  // Cuando cambia el equipo, resetear tipo
  const handleEquipoChange = (equipoId) => {
    const eq = equiposFiltrados.find(e => e.id === equipoId);
    const tipos = eq ? (TIPOS_POR_EQUIPO[eq.tipo] || TIPOS_POR_EQUIPO.default) : [];
    set("equipo_id", equipoId);
    setForm(f => ({ ...f, equipo_id: equipoId, tipo: tipos[0]?.value || "", centro: eq?.centro_principal || f.centro }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const payload = {
      ...form, estado: "pendiente",
      usuario_email: user?.email || "",
      usuario_nombre: user?.full_name || user?.email || ""
    };
    // Optimistic: close immediately and add temp record
    onOptimistic?.(payload);
    onSaved();
    // Persist in background
    base44.entities.Solicitud.create(payload).catch(() => {});
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="px-7 pt-7 pb-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Nueva Solicitud</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-slate-400" /></button>
        </div>
        <form onSubmit={handleSubmit} className="px-7 py-5 space-y-4">

          {/* Centro - prellenado y bloqueado para usuarios normales */}
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Centro</label>
            {isAdmin ? (
              <NativePicker
                value={form.centro}
                onChange={v => set("centro", v)}
                placeholder="Seleccionar centro..."
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
                options={[{ value: "", label: "Seleccionar..." }, ...CENTROS_ESTRUCTURA.map(c => ({ value: c.nombre, label: c.nombre }))]}
              />
            ) : (
              <div className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-slate-50 text-slate-700 flex items-center gap-2">
                <span className="text-slate-400">🏥</span>
                {centroDefault || <span className="text-slate-400">Sin centro asignado</span>}
              </div>
            )}
          </div>

          {/* Equipo - filtrado por centro */}
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Equipo *</label>
            <NativePicker
              value={form.equipo_id}
              onChange={handleEquipoChange}
              placeholder="Seleccionar equipo..."
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
              options={[
                { value: "", label: "Seleccionar equipo..." },
                ...equiposFiltrados.map(eq => ({
                  value: eq.id,
                  label: `[${TIPO_EQUIPO_LABEL[eq.tipo] || eq.tipo}] ${eq.marca} ${eq.modelo} · Inv.${eq.numero_inventario}${eq.subsede ? ` · ${eq.subsede}` : ""}${eq.ubicacion_especifica ? ` (${eq.ubicacion_especifica})` : ""}`
                }))
              ]}
            />
            {!form.equipo_id && centroDefault && equiposFiltrados.length === 0 && (
              <p className="text-xs text-amber-600 mt-1">No hay equipos registrados para este centro</p>
            )}
          </div>

          {/* Tipo - dinámico según tipo de equipo */}
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">
              Tipo de Solicitud *
              {tipoEquipo && <span className="ml-1 text-blue-500 font-normal">({TIPO_EQUIPO_LABEL[tipoEquipo]})</span>}
            </label>
            {!form.equipo_id ? (
              <div className="w-full border border-dashed border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-400 bg-slate-50">
                Primero selecciona un equipo
              </div>
            ) : (
              <NativePicker
                value={form.tipo}
                onChange={v => set("tipo", v)}
                placeholder="Seleccionar tipo..."
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
                options={tiposDisponibles}
              />
            )}
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Fecha *</label>
            <input type="date" required className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" value={form.fecha} onChange={e => set("fecha", e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Observaciones {form.tipo === "otros" ? "*" : ""}</label>
            <textarea required={form.tipo === "otros"} rows={3} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" placeholder="Describe el problema o requerimiento..." value={form.observaciones} onChange={e => set("observaciones", e.target.value)} />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-medium text-slate-600 border border-slate-200">Cancelar</button>
            <button type="submit" disabled={saving || !form.equipo_id || !form.tipo} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60" style={{ background: "linear-gradient(135deg, #1565c0, #0288d1)" }}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {saving ? "Guardando..." : "Crear Solicitud"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function GestionarModal({ solicitud, onClose, onSaved, onOptimistic }) {
  const [estado, setEstado] = useState(solicitud.estado);
  const [respuesta, setRespuesta] = useState(solicitud.respuesta_admin || "");
  const [saving, setSaving] = useState(false);

  const handleSave = () => {
    setSaving(true);
    const data = { estado, respuesta_admin: respuesta };
    // Optimistic close
    onOptimistic?.(data);
    onSaved();
    // Persist in background
    base44.entities.Solicitud.update(solicitud.id, data).then(() => {
      if (estado === "finalizada" && solicitud.alerta_id) {
        base44.entities.Alerta.update(solicitud.alerta_id, { estado: "resuelta", fecha_resolucion: new Date().toISOString().split("T")[0] }).catch(() => {});
      }
    }).catch(() => {});
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md">
        <div className="px-7 pt-7 pb-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Gestionar Solicitud</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-slate-400" /></button>
        </div>
        <div className="px-7 py-5 space-y-4">
          <div className="bg-slate-50 rounded-xl p-3">
            <p className="text-xs font-semibold text-slate-500">Solicitante</p>
            <p className="text-sm font-medium text-slate-800 mt-0.5">{solicitud.usuario_nombre || solicitud.usuario_email}</p>
            {solicitud.alerta_id && <p className="text-xs text-amber-600 mt-1">⚠ Vinculada a alerta — al finalizar se resolverá automáticamente</p>}
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Estado</label>
            <NativePicker
              value={estado}
              onChange={setEstado}
              placeholder="Seleccionar estado..."
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
              options={Object.entries(ESTADO_CONFIG).map(([k, v]) => ({ value: k, label: v.label }))}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Respuesta / Comentario</label>
            <textarea rows={3} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" value={respuesta} onChange={e => setRespuesta(e.target.value)} />
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-medium text-slate-600 border border-slate-200">Cancelar</button>
            <button onClick={handleSave} disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60" style={{ background: "#1565c0" }}>
              {saving ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}