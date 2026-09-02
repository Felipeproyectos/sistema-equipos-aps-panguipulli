import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, ClipboardList, CheckCircle, XCircle, Loader2, X } from "lucide-react";
import InformeSolicitudesPDF from "@/components/solicitudes/InformeSolicitudesPDF";
import { format } from "date-fns";

const TIPOS = [
  { value: "parches_adulto", label: "Parches Adulto" },
  { value: "parches_nino", label: "Parches Niño" },
  { value: "parches_mixto", label: "Parches Mixto (Adulto/Niño)" },
  { value: "bateria", label: "Batería" },
  { value: "mantenimiento", label: "Mantenimiento" },
];

const TIPOS_FORM = [
  { value: "parches", label: "Parches" },
  { value: "bateria", label: "Batería" },
  { value: "mantenimiento", label: "Mantenimiento" },
];

const PARCHE_TIPOS = [
  { value: "parches_adulto", label: "Adulto" },
  { value: "parches_nino", label: "Niño" },
  { value: "parches_mixto", label: "Mixto (Adulto/Niño)" },
];

const ESTADOS_COLOR = {
  pendiente: "bg-amber-50 text-amber-700 border-amber-200",
  aprobada: "bg-green-50 text-green-700 border-green-200",
  rechazada: "bg-red-50 text-red-700 border-red-200",
  completada: "bg-blue-50 text-blue-700 border-blue-200",
};

export default function Solicitudes() {
  const [user, setUser] = useState(null);
  const [solicitudes, setSolicitudes] = useState([]);
  const [equipos, setEquipos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    equipo_id: "", establecimiento: "", lugar: "",
    tipo_categoria: "parches",
    parches: { parches_adulto: "", parches_nino: "", parches_mixto: "" },
    tipo_solicitud: "bateria", cantidad: 1, descripcion: ""
  });
  const [saving, setSaving] = useState(false);
  const [selectedSol, setSelectedSol] = useState(null);
  const [respuesta, setRespuesta] = useState("");

  const [centros, setCentros] = useState([]);

  const load = async () => {
    try {
      const u = await base44.auth.me().catch(() => null);
      setUser(u);
      const allEquipos = await base44.entities.Equipo.list().catch(() => []);
      const allCentros = await base44.entities.Centro.list().catch(() => []);
      setCentros(allCentros);
      setEquipos(allEquipos);
      const allSol = await base44.entities.SolicitudStock.list().catch(() => []);
      // Temporalmente todos ven todas las solicitudes
      setSolicitudes(allSol.sort((a, b) => new Date(b.created_date) - new Date(a.created_date)));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const isAdmin = true; // Temporalmente todos tienen permisos de admin

  const handleCreate = async () => {
    setSaving(true);
    const base = { equipo_id: form.equipo_id, solicitante_email: user.email, fecha_solicitud: new Date().toISOString().split("T")[0], estado: "pendiente", descripcion: form.descripcion };
    if (form.tipo_categoria === "parches") {
      // Crear una solicitud por cada tipo de parche con cantidad > 0
      const parchesEntries = PARCHE_TIPOS.filter(p => parseInt(form.parches[p.value]) > 0);
      await Promise.all(parchesEntries.map(p =>
        base44.entities.SolicitudStock.create({ ...base, tipo_solicitud: p.value, cantidad: parseInt(form.parches[p.value]) })
      ));
    } else {
      await base44.entities.SolicitudStock.create({ ...base, tipo_solicitud: form.tipo_solicitud, cantidad: form.cantidad });
    }
    setSaving(false);
    setShowForm(false);
    setForm({ equipo_id: "", establecimiento: "", lugar: "", tipo_categoria: "parches", parches: { parches_adulto: "", parches_nino: "", parches_mixto: "" }, tipo_solicitud: "bateria", cantidad: 1, descripcion: "" });
    load();
  };

  const parchesValidos = form.tipo_categoria === "parches"
    ? PARCHE_TIPOS.some(p => parseInt(form.parches[p.value]) > 0)
    : true;

  const handleUpdateEstado = async (sol, estado) => {
    await base44.entities.SolicitudStock.update(sol.id, { estado, respuesta_admin: respuesta });
    setSelectedSol(null);
    setRespuesta("");
    load();
  };

  const inputCls = "w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 bg-slate-50";

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen" style={{ background: "#e8f4fd" }}>
      {/* Header */}
      <div className="relative overflow-hidden px-6 lg:px-10 pt-10 pb-8" style={{ background: "linear-gradient(135deg, #0f2d6b 0%, #1565c0 40%, #29b6f6 100%)" }}>
        <div className="absolute right-8 top-1/2 -translate-y-1/2 w-56 h-56 rounded-full opacity-20 border-4 border-white" />
        <div className="absolute right-4 bottom-0 w-72 h-72 rounded-full opacity-10" style={{ background: "radial-gradient(circle, #29b6f6 0%, transparent 70%)" }} />
        <div className="relative max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: "rgba(255,255,255,0.2)" }}>
              <ClipboardList className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-cyan-200 text-xs font-semibold uppercase tracking-widest">Gestión</p>
              <h1 className="text-3xl font-bold text-white">Solicitudes</h1>
              <p className="text-blue-100 text-sm mt-0.5">Requerimientos de stock y mantenimiento</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <InformeSolicitudesPDF solicitudes={solicitudes} equipos={equipos} />
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold shadow-sm"
              style={{ background: "rgba(255,255,255,0.2)", color: "white", border: "1px solid rgba(255,255,255,0.3)" }}
            >
              <Plus className="w-4 h-4" /> Nueva Solicitud
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 lg:px-10 pt-6 pb-10">

      {/* Lista */}
      <div className="bg-white rounded-3xl shadow-lg p-6 mb-6">
      <div className="space-y-3">
        {solicitudes.map(sol => {
          const equipo = equipos.find(e => e.id === sol.equipo_id);
          const tipo = TIPOS.find(t => t.value === sol.tipo_solicitud);
          return (
            <div
              key={sol.id}
              onClick={() => isAdmin && setSelectedSol(sol)}
              className={`bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-start justify-between ${isAdmin ? "cursor-pointer hover:shadow-md transition-shadow" : ""}`}
            >
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
                  <ClipboardList className="w-5 h-5 text-slate-500" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900 text-sm">{tipo?.label || sol.tipo_solicitud}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{equipo ? `${equipo.marca} ${equipo.modelo} — ${equipo.establecimiento}` : "Equipo no encontrado"}</p>
                  <p className="text-xs text-slate-400 mt-1">{sol.descripcion}</p>
                  {sol.cantidad > 1 && <p className="text-xs text-slate-400">Cantidad: {sol.cantidad}</p>}
                  <p className="text-xs text-slate-300 mt-1">{sol.solicitante_email}</p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full border capitalize ${ESTADOS_COLOR[sol.estado]}`}>
                  {sol.estado}
                </span>
                {sol.created_date && (
                  <span className="text-xs text-slate-300">{format(new Date(sol.created_date), "dd/MM/yy")}</span>
                )}
              </div>
            </div>
          );
        })}
        {solicitudes.length === 0 && (
          <div className="text-center py-16 text-slate-400">
            <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>No hay solicitudes registradas</p>
          </div>
        )}
      </div>
      </div>

      {/* Modal Nueva Solicitud */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md">
            <div className="px-7 pt-7 pb-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">Nueva Solicitud</h2>
              <button onClick={() => setShowForm(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="px-7 py-6 space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">Establecimiento *</label>
                <select
                  className={inputCls}
                  value={form.establecimiento}
                  onChange={e => setForm(f => ({ ...f, establecimiento: e.target.value, lugar: "", equipo_id: "" }))}
                >
                  <option value="">Seleccionar establecimiento</option>
                  {centros.sort((a,b) => a.nombre.localeCompare(b.nombre)).map(c => (
                    <option key={c.id} value={c.nombre}>{c.nombre}</option>
                  ))}
                </select>
              </div>
              {form.establecimiento && (
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1 block">Lugar *</label>
                  <select
                    className={inputCls}
                    value={form.lugar}
                    onChange={e => {
                      const lugar = e.target.value;
                      const equipo = equipos.find(eq => eq.establecimiento === form.establecimiento && eq.lugar_destinado === lugar);
                      setForm(f => ({ ...f, lugar, equipo_id: equipo?.id || "" }));
                    }}
                  >
                    <option value="">Seleccionar lugar</option>
                    {equipos
                      .filter(e => e.establecimiento === form.establecimiento)
                      .map(e => (
                        <option key={e.id} value={e.lugar_destinado}>{e.lugar_destinado} — {e.marca} {e.modelo}</option>
                      ))}
                  </select>
                </div>
              )}
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">Tipo de Solicitud *</label>
                <select className={inputCls} value={form.tipo_categoria} onChange={e => setForm(f => ({ ...f, tipo_categoria: e.target.value }))}>
                  {TIPOS_FORM.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>

              {form.tipo_categoria === "parches" ? (
                <div className="space-y-2">
                  <label className="text-xs font-medium text-slate-600 block">Cantidades por tipo de parche</label>
                  {PARCHE_TIPOS.map(p => (
                    <div key={p.value} className="flex items-center gap-3">
                      <span className="text-sm text-slate-700 w-40 flex-shrink-0">{p.label}</span>
                      <input
                        type="number"
                        min={0}
                        placeholder="0"
                        className={inputCls}
                        value={form.parches[p.value]}
                        onChange={e => setForm(f => ({ ...f, parches: { ...f.parches, [p.value]: e.target.value } }))}
                      />
                    </div>
                  ))}
                  <p className="text-xs text-slate-400">Deja en 0 los tipos que no necesites</p>
                </div>
              ) : (
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1 block">Cantidad</label>
                  <input type="number" className={inputCls} min={1} value={form.cantidad} onChange={e => setForm(f => ({ ...f, cantidad: parseInt(e.target.value) }))} />
                </div>
              )}
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">Descripción / Motivo *</label>
                <textarea className={inputCls} rows={3} value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} placeholder="Describe el motivo de la solicitud..." />
              </div>
            </div>
            <div className="px-7 pb-7 flex gap-3 justify-end">
              <button onClick={() => setShowForm(false)} className="px-5 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100">Cancelar</button>
              <button
                onClick={handleCreate}
                disabled={saving || !form.equipo_id || !form.establecimiento || !form.lugar || !form.descripcion || !parchesValidos}
                className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white flex items-center gap-2 disabled:opacity-60"
                style={{ background: "#e63946" }}
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} Enviar Solicitud
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Admin respuesta */}
      {selectedSol && isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md">
            <div className="px-7 pt-7 pb-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">Gestionar Solicitud</h2>
              <button onClick={() => setSelectedSol(null)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="px-7 py-6 space-y-4">
              <div className="bg-slate-50 rounded-xl p-4">
                <p className="text-sm font-semibold text-slate-800">{TIPOS.find(t => t.value === selectedSol.tipo_solicitud)?.label}</p>
                <p className="text-xs text-slate-500 mt-1">{selectedSol.descripcion}</p>
                <p className="text-xs text-slate-400 mt-2">Solicitante: {selectedSol.solicitante_email}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">Respuesta / Comentario</label>
                <textarea
                  className={inputCls}
                  rows={3}
                  value={respuesta}
                  onChange={e => setRespuesta(e.target.value)}
                  placeholder="Opcional: agregar comentario..."
                />
              </div>
            </div>
            <div className="px-7 pb-7 flex gap-3">
              <button
                onClick={() => handleUpdateEstado(selectedSol, "rechazada")}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border border-red-200 text-red-600 hover:bg-red-50"
              >
                <XCircle className="w-4 h-4" /> Rechazar
              </button>
              <button
                onClick={() => handleUpdateEstado(selectedSol, "aprobada")}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white"
                style={{ background: "#10b981" }}
              >
                <CheckCircle className="w-4 h-4" /> Aprobar
              </button>
              <button
                onClick={() => handleUpdateEstado(selectedSol, "completada")}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white"
                style={{ background: "#6366f1" }}
              >
                Completar
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}