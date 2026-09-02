import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Activity, Search, History, Plus, Edit2, Trash2 } from "lucide-react";
import { TIPOS_ACTIVIDAD, CENTROS_ESTRUCTURA } from "@/lib/centros";
import NativePicker from "@/components/NativePicker";
import { format } from "date-fns";

const TIPO_COLORS = {
  cambio_parches:          { bg: "#eff6ff", text: "#1d4ed8" },
  mantenimiento_preventivo:{ bg: "#f0fdf4", text: "#15803d" },
  mantenimiento_correctivo:{ bg: "#fef9c3", text: "#854d0e" },
  error_calibracion:       { bg: "#fef2f2", text: "#dc2626" },
  inspeccion:              { bg: "#f5f3ff", text: "#7c3aed" },
  traslado:                { bg: "#fff7ed", text: "#c2410c" },
  inspeccion_semanal:      { bg: "#e0f2fe", text: "#0369a1" },
  inspeccion_anual:        { bg: "#fae8ff", text: "#7e22ce" },
  incidente:               { bg: "#fef2f2", text: "#b91c1c" },
  otros:                   { bg: "#f8fafc", text: "#475569" },
};

const ACCION_CONFIG = {
  crear:    { bg: "#f0fdf4", text: "#15803d", Icon: Plus,   label: "Creó" },
  editar:   { bg: "#eff6ff", text: "#1d4ed8", Icon: Edit2,  label: "Editó" },
  eliminar: { bg: "#fef2f2", text: "#dc2626", Icon: Trash2, label: "Eliminó" },
};

const VISTA_OPTIONS = [
  { value: "actividades", label: "Actividades de equipos" },
  { value: "historial",   label: "Historial de usuarios" },
];

export default function Actividades() {
  const [actividades, setActividades] = useState([]);
  const [equipos, setEquipos] = useState([]);
  const [historial, setHistorial] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [filtroCentro, setFiltroCentro] = useState("todos");
  const [filtroAccion, setFiltroAccion] = useState("todos");
  const [vista, setVista] = useState("actividades");

  useEffect(() => {
    Promise.all([
      base44.entities.Actividad.list("-fecha", 200).catch(() => []),
      base44.entities.Equipo.list("-created_date", 500).catch(() => []),
      base44.entities.Historial.list("-created_date", 200).catch(() => []),
    ]).then(([acts, eqs, hist]) => {
      setActividades(acts);
      setEquipos(eqs);
      setHistorial(hist);
      setLoading(false);
    });
  }, []);

  const filtradas = actividades.filter(a => {
    const equipo = equipos.find(e => e.id === a.equipo_id);
    if (filtroTipo !== "todos" && a.tipo !== filtroTipo) return false;
    if (filtroCentro !== "todos" && equipo?.centro_principal !== filtroCentro) return false;
    if (busqueda) {
      const b = busqueda.toLowerCase();
      return (a.observaciones || "").toLowerCase().includes(b) ||
        (a.usuario_nombre || "").toLowerCase().includes(b) ||
        (equipo?.marca || "").toLowerCase().includes(b) ||
        (equipo?.modelo || "").toLowerCase().includes(b);
    }
    return true;
  });

  const filtradosHist = historial.filter(r => {
    const matchAccion = filtroAccion === "todos" || r.accion === filtroAccion;
    const matchSearch = !busqueda ||
      r.descripcion?.toLowerCase().includes(busqueda.toLowerCase()) ||
      r.usuario_email?.toLowerCase().includes(busqueda.toLowerCase()) ||
      r.usuario_nombre?.toLowerCase().includes(busqueda.toLowerCase());
    return matchAccion && matchSearch;
  });

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen" style={{ background: "#e8f4fd" }}>
      {/* Header */}
      <div className="relative overflow-hidden px-6 lg:px-10 pt-10 pb-8" style={{ background: "linear-gradient(135deg, #0f2d6b 0%, #1565c0 40%, #29b6f6 100%)" }}>
        <div className="relative max-w-5xl mx-auto flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: "rgba(255,255,255,0.2)" }}>
            {vista === "actividades" ? <Activity className="w-6 h-6 text-white" /> : <History className="w-6 h-6 text-white" />}
          </div>
          <div>
            <p className="text-cyan-200 text-xs font-semibold uppercase tracking-widest">Registro</p>
            <h1 className="text-3xl font-bold text-white">
              {vista === "actividades" ? "Actividades" : "Historial de Usuarios"}
            </h1>
            <p className="text-blue-100 text-sm mt-0.5">
              {vista === "actividades"
                ? `${filtradas.length} actividad(es) registradas`
                : `${filtradosHist.length} acción(es) registradas`}
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 lg:px-10 pt-6 pb-10">

        {/* Selector de vista */}
        <div className="flex gap-2 mb-5">
          {VISTA_OPTIONS.map(v => (
            <button
              key={v.value}
              onClick={() => { setVista(v.value); setBusqueda(""); }}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                vista === v.value
                  ? "text-white shadow"
                  : "bg-white text-slate-500 border border-slate-200 hover:border-blue-300"
              }`}
              style={vista === v.value ? { background: "linear-gradient(135deg,#1565c0,#0288d1)" } : {}}
            >
              {v.label}
            </button>
          ))}
        </div>

        {/* Filtros */}
        <div className="bg-white rounded-2xl shadow p-4 mb-6 flex flex-wrap gap-3 items-center">
          <div className="flex-1 min-w-48 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder={vista === "actividades" ? "Buscar actividad..." : "Buscar usuario o acción..."}
              className="w-full pl-10 pr-4 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-300"
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
            />
          </div>

          {vista === "actividades" ? (
            <>
              <NativePicker
                value={filtroTipo}
                onChange={setFiltroTipo}
                placeholder="Todos los tipos"
                className="px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-300 w-full lg:w-auto"
                options={[{ value: "todos", label: "Todos los tipos" }, ...TIPOS_ACTIVIDAD]}
              />
              <NativePicker
                value={filtroCentro}
                onChange={setFiltroCentro}
                placeholder="Todos los centros"
                className="px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-300 w-full lg:w-auto"
                options={[{ value: "todos", label: "Todos los centros" }, ...CENTROS_ESTRUCTURA.map(c => ({ value: c.nombre, label: c.nombre }))]}
              />
            </>
          ) : (
            <div className="flex gap-2 flex-wrap">
              {["todos", "crear", "editar", "eliminar"].map(a => (
                <button
                  key={a}
                  onClick={() => setFiltroAccion(a)}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all capitalize ${
                    filtroAccion === a ? "text-white shadow-sm" : "bg-white text-slate-500 border border-slate-200"
                  }`}
                  style={filtroAccion === a ? { background: "linear-gradient(135deg,#1565c0,#0288d1)" } : {}}
                >
                  {a === "todos" ? "Todos" : a}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* VISTA: Actividades de equipos */}
        {vista === "actividades" && (
          <div className="space-y-3">
            {filtradas.length === 0 ? (
              <div className="text-center py-20 bg-white rounded-2xl shadow text-slate-400">
                <Activity className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p>No hay actividades para mostrar</p>
              </div>
            ) : filtradas.map(act => {
              const equipo = equipos.find(e => e.id === act.equipo_id);
              const tipo = TIPOS_ACTIVIDAD.find(t => t.value === act.tipo);
              const colors = TIPO_COLORS[act.tipo] || { bg: "#f8fafc", text: "#475569" };
              return (
                <div key={act.id} className="bg-white rounded-2xl shadow border border-slate-100 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold px-3 py-1.5 rounded-full" style={{ background: colors.bg, color: colors.text }}>
                        {tipo?.label || act.tipo}
                      </span>
                      <div>
                        <p className="font-semibold text-slate-900 text-sm">
                          {equipo ? `${equipo.marca} ${equipo.modelo}` : "Equipo desconocido"}
                          {equipo?.numero_inventario && <span className="text-slate-400 font-normal text-xs"> #{equipo.numero_inventario}</span>}
                        </p>
                        <p className="text-xs text-slate-500">
                          {equipo?.centro_principal}{equipo?.subsede && ` › ${equipo.subsede}`}
                        </p>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs text-slate-500">{act.fecha}</p>
                      {act.usuario_nombre && <p className="text-xs text-slate-400">{act.usuario_nombre}</p>}
                    </div>
                  </div>
                  {act.observaciones && (
                    <p className="mt-2 text-sm text-slate-600 bg-slate-50 rounded-xl px-3 py-2">{act.observaciones}</p>
                  )}
                  {act.tipo === "traslado" && act.centro_destino && (
                    <p className="mt-2 text-xs text-blue-600 font-medium">
                      Trasladado a: {act.centro_destino}{act.subsede_destino ? ` › ${act.subsede_destino}` : ""}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* VISTA: Historial de usuarios */}
        {vista === "historial" && (
          <>
            {/* Resumen */}
            <div className="grid grid-cols-3 gap-3 mb-5">
              {[
                { label: "Creaciones", key: "crear",    color: "#15803d", bg: "#f0fdf4" },
                { label: "Ediciones",  key: "editar",   color: "#1d4ed8", bg: "#eff6ff" },
                { label: "Eliminaciones", key: "eliminar", color: "#dc2626", bg: "#fef2f2" },
              ].map(s => (
                <div key={s.key} className="bg-white rounded-2xl p-4 shadow border border-slate-100 text-center">
                  <p className="text-2xl font-bold" style={{ color: s.color }}>
                    {historial.filter(r => r.accion === s.key).length}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              {filtradosHist.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-2xl shadow text-slate-400">
                  <History className="w-10 h-10 mx-auto mb-3 opacity-20" />
                  <p>No hay registros de actividad</p>
                </div>
              ) : filtradosHist.map(r => {
                const cfg = ACCION_CONFIG[r.accion] || ACCION_CONFIG.editar;
                const AccionIcon = cfg.Icon;
                return (
                  <div key={r.id} className="bg-white rounded-2xl shadow border border-slate-100 px-5 py-4 flex items-start gap-4 hover:shadow-md transition-shadow">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: cfg.bg }}>
                      <AccionIcon className="w-4 h-4" style={{ color: cfg.text }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900 leading-snug">{r.descripcion}</p>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        <span className="text-xs font-medium text-slate-600">
                          {r.usuario_nombre || r.usuario_email}
                        </span>
                        {r.usuario_nombre && (
                          <span className="text-xs text-slate-400">{r.usuario_email}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: cfg.bg, color: cfg.text }}>
                        {cfg.label}
                      </span>
                      {r.created_date && (
                        <span className="text-xs text-slate-400">
                          {format(new Date(r.created_date), "dd/MM/yy HH:mm")}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}