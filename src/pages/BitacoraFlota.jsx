import { useState, useEffect, useCallback, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import {
  ClipboardList, Plus, Gauge, Fuel, AlertTriangle, Route,
  ArrowLeftRight, Download, Pencil, CheckCircle2, Users, Truck,
} from "lucide-react";
import { esVehiculo } from "@/lib/centros";
import { isSimulandoActivo } from "@/lib/roleSimulator";
import {
  kmRecorridos, resumen, porVehiculo, porChofer, estadoSalida, etiquetaPrestamo,
} from "@/lib/bitacoraFlota";
import SalidaModal from "@/components/flota/SalidaModal";

// La bitácora de operación de la flota, para el Encargado de Movilización.
//
// Es la contraparte de "Mi bitácora": el chofer anota lo suyo, acá está todo
// junto y sumado. Responde las preguntas que antes se contestaban con una
// planilla aparte — cuánto anda cada vehículo, quién lo sacó, cuánto gastó
// en combustible y a qué centro se le carga.
//
// No se mezcla con la bitácora de Calidad
// ───────────────────────────────────────
// La de las ambulancias (`Kilometraje`, la del enlace público, la que revisa
// el Encargado de Salud) sigue funcionando tal cual y no se toca. Son dos
// bitácoras distintas a propósito: miden cosas distintas y las miran personas
// distintas.
//
// El período por defecto
// ──────────────────────
// El mes corriente. Es el corte con el que se rinde el combustible, así que
// es lo que se va a mirar casi siempre; los otros dos campos están ahí para
// cuando haga falta otro.

const primerDiaDelMes = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
};

const VISTAS = [
  { id: "salidas", label: "Salidas", icono: Route },
  { id: "vehiculos", label: "Por vehículo", icono: Truck },
  { id: "choferes", label: "Por chofer", icono: Users },
];

export default function BitacoraFlota() {
  const [registros, setRegistros] = useState([]);
  const [equipos, setEquipos] = useState([]);
  const [choferes, setChoferes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [abierto, setAbierto] = useState(null);
  const [vista, setVista] = useState("salidas");

  const hoy = new Date().toISOString().split("T")[0];
  const [desde, setDesde] = useState(primerDiaDelMes());
  const [hasta, setHasta] = useState(hoy);
  const [filtroEquipo, setFiltroEquipo] = useState("todos");
  const [filtroChofer, setFiltroChofer] = useState("todos");

  const soloLectura = isSimulandoActivo();

  const cargar = useCallback(async () => {
    setCargando(true);
    const [regs, gente] = await Promise.all([
      base44.entities.BitacoraFlota.list("-fecha", 2000).catch(() => []),
      base44.functions.invoke("getUsuariosPorCentro")
        .then(r => (Array.isArray(r?.data) ? r.data : []))
        .catch(() => base44.entities.User.list("full_name", 500).catch(() => [])),
    ]);
    setRegistros(Array.isArray(regs) ? regs : []);
    setChoferes(gente.filter(u => u.role === "chofer"));
    try {
      const res = await base44.functions.invoke("getEquiposPorCentro");
      setEquipos((res.data?.equipos || []).filter(e => esVehiculo(e.tipo)));
    } catch {
      const eqs = await base44.entities.Equipo.list("-updated_date", 500).catch(() => []);
      setEquipos(eqs.filter(e => esVehiculo(e.tipo)));
    }
    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const visibles = useMemo(() => registros.filter(r => {
    if (desde && (r.fecha || "") < desde) return false;
    if (hasta && (r.fecha || "") > hasta) return false;
    if (filtroEquipo !== "todos" && r.equipo_id !== filtroEquipo) return false;
    if (filtroChofer !== "todos" && r.chofer_id !== filtroChofer) return false;
    return true;
  }), [registros, desde, hasta, filtroEquipo, filtroChofer]);

  const total = resumen(visibles);
  // Las que siguen sin regreso se miran SIEMPRE, no solo dentro del período:
  // una salida de hace tres semanas que nadie cerró es justamente la que
  // desaparecería de la vista al filtrar por el mes corriente.
  const abiertas = registros.filter(r => r.estado === "en_ruta");

  const descargar = () => {
    const filas = visibles.map(r => ({
      fecha: r.fecha || "",
      vehiculo: r.equipo_label || "",
      chofer: r.chofer_nombre || "",
      salida: r.hora_salida || "",
      regreso: r.hora_regreso || "",
      km_salida: r.km_salida ?? "",
      km_regreso: r.km_regreso ?? "",
      km_recorridos: kmRecorridos(r) ?? "",
      destino: r.destino || "",
      motivo: r.motivo || "",
      litros: r.combustible_litros ?? "",
      monto: r.combustible_monto ?? "",
      centro_costo: r.centro_costo || "",
      prestado_a: r.prestamo_destino || "",
      estado: estadoSalida(r.estado).label,
      observaciones: r.observaciones || "",
    }));
    const cabeceras = Object.keys(filas[0] || { fecha: "" });
    // El punto y coma y el BOM son para que Excel en español lo abra en
    // columnas y no rompa las tildes. Con coma y sin BOM queda todo en una
    // celda, que es como llega la mitad de las planillas.
    const csv = "﻿" + [
      cabeceras.join(";"),
      ...filas.map(f => cabeceras.map(c => `"${String(f[c]).replace(/"/g, '""')}"`).join(";")),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `bitacora-flota-${desde}-a-${hasta}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (cargando) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="relative overflow-hidden px-4 lg:px-10 pt-6 lg:pt-10 pb-6 lg:pb-8"
        style={{ background: "linear-gradient(135deg, #451a03 0%, #92400e 45%, #d97706 100%)" }}>
        <div className="relative max-w-6xl mx-auto flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
              style={{ background: "rgba(255,255,255,0.2)" }}>
              <ClipboardList className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-amber-200 text-xs font-semibold uppercase tracking-widest">Flota</p>
              <h1 className="text-2xl lg:text-3xl font-bold text-white">Bitácora de operación</h1>
              <p className="text-amber-100 text-sm mt-0.5">
                {total.salidas} {total.salidas === 1 ? "salida" : "salidas"} en el período ·{" "}
                {total.km.toLocaleString("es-CL")} km
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={descargar} disabled={visibles.length === 0}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
              style={{ background: "rgba(255,255,255,0.15)", color: "white", border: "1px solid rgba(255,255,255,0.3)" }}>
              <Download className="w-4 h-4" /> Descargar
            </button>
            {!soloLectura && (
              <button onClick={() => setAbierto({})}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold shadow"
                style={{ background: "rgba(255,255,255,0.2)", color: "white", border: "1px solid rgba(255,255,255,0.3)" }}>
                <Plus className="w-4 h-4" /> Registrar salida
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 lg:px-10 pt-5 pb-10 space-y-5">
        {/* Un vehículo que salió y no consta que haya vuelto. No se cierra
            solo por la hora: eso sería inventar el regreso. */}
        {abiertas.length > 0 && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-700 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm text-amber-900">
                  <strong>{abiertas.length}</strong>{" "}
                  {abiertas.length === 1 ? "salida sigue sin cerrar" : "salidas siguen sin cerrar"}:
                  el vehículo salió y no consta el regreso.
                </p>
                <div className="mt-2 space-y-1">
                  {abiertas.slice(0, 6).map(r => (
                    <button key={r.id} onClick={() => !soloLectura && setAbierto({ registro: r })}
                      className="block text-xs text-amber-800 hover:text-amber-950 text-left">
                      {fecha(r.fecha)} · {r.equipo_label || "Vehículo"} · {r.chofer_nombre || "sin chofer"}
                      {!soloLectura && <span className="font-semibold"> — cerrarla</span>}
                    </button>
                  ))}
                  {abiertas.length > 6 && (
                    <p className="text-xs text-amber-700">y {abiertas.length - 6} más.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-slate-200 p-4 grid gap-3
                        grid-cols-2 lg:grid-cols-4">
          <Campo id="bf-desde" titulo="Desde">
            <input id="bf-desde" type="date" value={desde} onChange={e => setDesde(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white
                         focus:outline-none focus:ring-2 focus:ring-amber-300" />
          </Campo>
          <Campo id="bf-hasta" titulo="Hasta">
            <input id="bf-hasta" type="date" value={hasta} onChange={e => setHasta(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white
                         focus:outline-none focus:ring-2 focus:ring-amber-300" />
          </Campo>
          <Campo id="bf-equipo" titulo="Vehículo">
            <select id="bf-equipo" value={filtroEquipo} onChange={e => setFiltroEquipo(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white
                         focus:outline-none focus:ring-2 focus:ring-amber-300">
              <option value="todos">Todos</option>
              {equipos.map(v => (
                <option key={v.id} value={v.id}>
                  {[v.marca, v.modelo].filter(Boolean).join(" ")}{v.patente ? ` · ${v.patente}` : ""}
                </option>
              ))}
            </select>
          </Campo>
          <Campo id="bf-chofer" titulo="Chofer">
            <select id="bf-chofer" value={filtroChofer} onChange={e => setFiltroChofer(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white
                         focus:outline-none focus:ring-2 focus:ring-amber-300">
              <option value="todos">Todos</option>
              {choferes.map(c => (
                <option key={c.id} value={c.id}>{c.full_name || c.email}</option>
              ))}
            </select>
          </Campo>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Tarjeta titulo="Salidas" valor={total.salidas} icono={Route} />
          <Tarjeta titulo="Kilómetros" valor={total.km.toLocaleString("es-CL")} icono={Gauge}
            pie={total.abiertas > 0
              ? `${total.abiertas} sin cerrar no suman`
              : `${total.conKm} ${total.conKm === 1 ? "salida cerrada" : "salidas cerradas"}`} />
          <Tarjeta titulo="Combustible" valor={`${total.litros.toLocaleString("es-CL")} L`} icono={Fuel}
            pie={total.monto ? `$${total.monto.toLocaleString("es-CL")}` : null} />
          <Tarjeta titulo="Rendimiento"
            valor={total.litros > 0 ? `${(total.km / total.litros).toFixed(1)} km/L` : "—"}
            icono={Gauge}
            pie={total.litros > 0 ? "sobre lo cargado en el período" : "falta cargar litros"} />
        </div>

        <div className="flex gap-2 flex-wrap">
          {VISTAS.map(v => {
            const Icono = v.icono;
            return (
              <button key={v.id} onClick={() => setVista(v.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-colors ${
                  vista === v.id ? "bg-amber-700 text-white border-amber-700"
                                 : "bg-white text-slate-600 border-slate-200 hover:border-amber-300"}`}>
                <Icono className="w-4 h-4" /> {v.label}
              </button>
            );
          })}
        </div>

        {visibles.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center">
            <Route className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-sm text-slate-500 mt-3">
              No hay salidas registradas en este período.
            </p>
          </div>
        ) : vista === "salidas" ? (
          <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
            {visibles.map(r => (
              <Fila key={r.id} r={r}
                onEditar={soloLectura ? null : () => setAbierto({ registro: r })} />
            ))}
          </div>
        ) : (
          <Agrupado grupos={vista === "vehiculos" ? porVehiculo(visibles) : porChofer(visibles)} />
        )}
      </div>

      {abierto && (
        <SalidaModal
          registro={abierto.registro}
          equipos={equipos}
          choferes={choferes}
          registros={registros}
          onClose={() => setAbierto(null)}
          onGuardado={cargar}
        />
      )}
    </div>
  );
}

function Fila({ r, onEditar }) {
  const est = estadoSalida(r.estado);
  const km = kmRecorridos(r);
  const prestamo = etiquetaPrestamo(r);
  return (
    <div className="px-5 py-4 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold text-slate-800">{fecha(r.fecha)}</p>
          <span className="text-sm text-slate-600">{r.equipo_label || "Vehículo"}</span>
          <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
            style={{ color: est.color, background: est.bg, border: `1px solid ${est.borde}` }}>
            {est.label}
          </span>
        </div>
        <p className="text-xs text-slate-500 mt-0.5">
          {r.chofer_nombre || "Sin chofer anotado"}
          {(r.hora_salida || r.hora_regreso) && ` · ${r.hora_salida || "—"} a ${r.hora_regreso || "—"}`}
        </p>
        {(r.destino || r.motivo) && (
          <p className="text-xs text-slate-500 mt-0.5">
            {[r.destino, r.motivo].filter(Boolean).join(" · ")}
          </p>
        )}
        {prestamo && (
          <p className="text-xs text-amber-700 mt-1 flex items-center gap-1">
            <ArrowLeftRight className="w-3 h-3 shrink-0" /> {prestamo}
          </p>
        )}
        {r.observaciones && (
          <p className="text-xs text-slate-400 mt-1 italic">{r.observaciones}</p>
        )}
      </div>
      <div className="flex items-start gap-4 shrink-0">
        <div className="text-right">
          <p className="text-sm font-bold text-slate-800">
            {km !== null ? `${km.toLocaleString("es-CL")} km` : "—"}
          </p>
          {r.combustible_litros ? (
            <p className="text-xs text-slate-500">{r.combustible_litros} L</p>
          ) : null}
          {/* El centro de costo va en gris y al final: es un dato de respaldo,
              no el titular de la línea. */}
          {r.centro_costo && (
            <p className="text-xs text-slate-400 mt-0.5">{r.centro_costo}</p>
          )}
        </div>
        {onEditar && (
          <button onClick={onEditar} className="text-slate-400 hover:text-amber-700 mt-0.5"
            title={r.estado === "en_ruta" ? "Registrar el regreso" : "Corregir"}>
            {r.estado === "en_ruta" ? <CheckCircle2 className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
          </button>
        )}
      </div>
    </div>
  );
}

function Agrupado({ grupos }) {
  const mayor = Math.max(1, ...grupos.map(g => g.km));
  return (
    <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
      {grupos.map(g => (
        <div key={g.clave} className="px-5 py-4">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm font-semibold text-slate-800 truncate">{g.label}</p>
            <p className="text-sm font-bold text-slate-800 shrink-0">
              {g.km.toLocaleString("es-CL")} km
            </p>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full mt-2 overflow-hidden">
            <div className="h-full bg-amber-600 rounded-full"
              style={{ width: `${Math.round((g.km / mayor) * 100)}%` }} />
          </div>
          <p className="text-xs text-slate-500 mt-1.5">
            {g.salidas} {g.salidas === 1 ? "salida" : "salidas"}
            {g.abiertas > 0 && ` · ${g.abiertas} sin cerrar`}
            {g.litros > 0 && ` · ${g.litros.toLocaleString("es-CL")} L`}
            {g.monto > 0 && ` · $${g.monto.toLocaleString("es-CL")}`}
          </p>
        </div>
      ))}
    </div>
  );
}

function Campo({ id, titulo, children }) {
  return (
    <div>
      <label htmlFor={id} className="text-xs font-semibold text-slate-600 block mb-1">{titulo}</label>
      {children}
    </div>
  );
}

function Tarjeta({ titulo, valor, icono: Icono, pie }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4">
      <Icono className="w-4 h-4 text-slate-400" />
      <p className="text-2xl font-bold text-slate-900 mt-2">{valor}</p>
      <p className="text-xs text-slate-500">{titulo}</p>
      {pie && <p className="text-xs text-slate-400 mt-0.5">{pie}</p>}
    </div>
  );
}

function fecha(v) {
  if (!v) return "—";
  const d = new Date(`${String(v).split("T")[0]}T00:00:00`);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString("es-CL");
}
