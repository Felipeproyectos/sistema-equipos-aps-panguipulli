import { useState, useEffect, useMemo, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import {
  Route, Loader2, Plus, Truck, AlertTriangle, ArrowLeftRight,
  Fuel, Gauge, CheckCircle2, Pencil, IdCard,
} from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { isSimulandoActivo } from "@/lib/roleSimulator";
import { estadoLicencia } from "@/pages/Choferes";
import {
  kmRecorridos, resumen, estadoSalida, etiquetaPrestamo,
} from "@/lib/bitacoraFlota";
import SalidaModal from "@/components/flota/SalidaModal";

// La bitácora del chofer: lo que hizo con el vehículo, día por día.
//
// Es la segunda pantalla que tiene, después de "Mi licencia", y la que usa
// todos los días. Está pensada para llenarse en el teléfono y en dos momentos:
// al salir se anota el odómetro, al volver se cierra.
//
// Por qué la lista de vehículos sale de las asignaciones y no de `equipo`
// ──────────────────────────────────────────────────────────────────────
// Un chofer no necesariamente puede leer la ficha del vehículo que maneja: la
// policy `equipo_read` lo deja ver los de su centro, y la camioneta puede ser
// de otro. La asignación sí la ve — es suya — y ya trae el rótulo del
// vehículo guardado. Así la pantalla funciona sin pedir permisos nuevos.

export default function MiBitacora() {
  const { user } = useAuth();
  const [registros, setRegistros] = useState([]);
  const [asignaciones, setAsignaciones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [abierto, setAbierto] = useState(null); // null | { registro? }

  const soloLectura = isSimulandoActivo();

  const cargar = useCallback(async () => {
    if (!user?.id) return;
    setCargando(true);
    const [regs, asigs] = await Promise.all([
      base44.entities.BitacoraFlota.filter({ chofer_id: user.id }, "-fecha", 300).catch(() => []),
      base44.entities.AsignacionChofer
        .filter({ chofer_id: user.id, estado: "activa" }, "-desde", 50).catch(() => []),
    ]);
    setRegistros(Array.isArray(regs) ? regs : []);
    setAsignaciones(Array.isArray(asigs) ? asigs : []);
    setCargando(false);
  }, [user?.id]);

  useEffect(() => { cargar(); }, [cargar]);

  // Un vehículo por asignación activa, sin repetir: dos asignaciones del mismo
  // vehículo (esta semana y la próxima) son un solo vehículo en la lista.
  const vehiculos = useMemo(() => {
    const vistos = new Map();
    for (const a of asignaciones) {
      if (a.equipo_id && !vistos.has(a.equipo_id)) {
        vistos.set(a.equipo_id, { id: a.equipo_id, label: a.equipo_label || "Vehículo" });
      }
    }
    // Un vehículo que ya usó pero que hoy no tiene asignado igual tiene que
    // poder aparecer: si lo sacó, la salida tiene que quedar escrita.
    for (const r of registros) {
      if (r.equipo_id && !vistos.has(r.equipo_id)) {
        vistos.set(r.equipo_id, { id: r.equipo_id, label: r.equipo_label || "Vehículo" });
      }
    }
    return [...vistos.values()];
  }, [asignaciones, registros]);

  const abiertas = registros.filter(r => r.estado === "en_ruta");
  const mes = new Date().toISOString().slice(0, 7);
  const delMes = registros.filter(r => (r.fecha || "").startsWith(mes));
  const total = resumen(delMes);

  const lic = estadoLicencia(user?.licencia_vencimiento);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="relative overflow-hidden px-4 lg:px-10 pt-6 lg:pt-10 pb-6 lg:pb-8"
        style={{ background: "linear-gradient(135deg, #451a03 0%, #92400e 45%, #d97706 100%)" }}>
        <div className="relative max-w-3xl mx-auto flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
            style={{ background: "rgba(255,255,255,0.2)" }}>
            <Route className="w-6 h-6 text-white" />
          </div>
          <div>
            <p className="text-amber-200 text-xs font-semibold uppercase tracking-widest">Flota</p>
            <h1 className="text-2xl lg:text-3xl font-bold text-white">Mi bitácora</h1>
            <p className="text-amber-100 text-sm mt-0.5">{user?.full_name || user?.email}</p>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 lg:px-10 pt-6 pb-10 space-y-4">
        {/* Avisa, no impide. Si el viaje ya se hizo, esconderlo no lo deshace. */}
        {lic.clave === "vencida" && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <p className="text-sm text-red-800">
              Tu licencia está vencida. No deberías conducir hasta renovarla — avísale a Movilización.
            </p>
          </div>
        )}

        {lic.clave === "sin_datos" && (
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 flex items-start gap-2">
            <IdCard className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
            <p className="text-sm text-slate-600">
              Todavía no cargas tu licencia. Hazlo en{" "}
              <a href="/MiLicencia" className="font-semibold text-amber-700 hover:text-amber-900">Mi licencia</a>
              {" "}— sin eso Movilización no puede asignarte un vehículo.
            </p>
          </div>
        )}

        <div className="grid grid-cols-3 gap-3">
          <Tarjeta titulo="Salidas del mes" valor={total.salidas} icono={Route} />
          <Tarjeta titulo="Kilómetros" valor={total.km.toLocaleString("es-CL")} icono={Gauge} />
          <Tarjeta titulo="Sin cerrar" valor={abiertas.length} icono={AlertTriangle}
            alerta={abiertas.length > 0} />
        </div>

        {!soloLectura && (
          <button onClick={() => setAbierto({})}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl
                       text-sm font-semibold text-white bg-amber-700 hover:bg-amber-800">
            <Plus className="w-4 h-4" /> Registrar salida
          </button>
        )}

        {abiertas.length > 0 && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-xs font-semibold text-amber-900 uppercase tracking-wide mb-3">
              {abiertas.length === 1 ? "Salida sin cerrar" : "Salidas sin cerrar"}
            </p>
            <div className="space-y-2">
              {abiertas.map(r => (
                <div key={r.id} className="bg-white rounded-xl border border-amber-200 px-4 py-3
                                           flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{r.equipo_label || "Vehículo"}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Salió el {fecha(r.fecha)}{r.hora_salida ? ` a las ${r.hora_salida}` : ""}
                      {r.destino ? ` · ${r.destino}` : ""}
                    </p>
                  </div>
                  {!soloLectura && (
                    <button onClick={() => setAbierto({ registro: r })}
                      className="text-xs font-semibold text-white bg-amber-700 hover:bg-amber-800
                                 rounded-lg px-3 py-1.5">
                      Ya volví
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {asignaciones.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
              {asignaciones.length === 1 ? "Vehículo a tu cargo" : "Vehículos a tu cargo"}
            </p>
            <div className="space-y-2">
              {asignaciones.map(a => (
                <div key={a.id} className="flex items-start gap-2 text-sm text-slate-700">
                  <Truck className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                  <div>
                    <p>{a.equipo_label || "Vehículo"}</p>
                    <p className="text-xs text-slate-400">
                      Desde el {fecha(a.desde)}
                      {a.hasta ? ` hasta el ${fecha(a.hasta)}` : " (sin fecha de término)"}
                      {a.destino ? ` · ${a.destino}` : ""}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Tus salidas</p>
          </div>
          {cargando ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-amber-600 animate-spin" />
            </div>
          ) : registros.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-12 px-5">
              Todavía no has registrado ninguna salida. Cuando saques un vehículo,
              anótala acá con el kilometraje.
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {registros.map(r => (
                <FilaSalida key={r.id} r={r}
                  onEditar={soloLectura ? null : () => setAbierto({ registro: r })} />
              ))}
            </div>
          )}
        </div>
      </div>

      {abierto && (
        <SalidaModal
          registro={abierto.registro}
          equipos={vehiculos}
          chofer={{ id: user?.id, nombre: user?.full_name || user?.email }}
          registros={registros}
          onClose={() => setAbierto(null)}
          onGuardado={cargar}
        />
      )}
    </div>
  );
}

function FilaSalida({ r, onEditar }) {
  const est = estadoSalida(r.estado);
  const km = kmRecorridos(r);
  const prestamo = etiquetaPrestamo(r);
  return (
    <div className="px-5 py-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold text-slate-800">{fecha(r.fecha)}</p>
          <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
            style={{ color: est.color, background: est.bg, border: `1px solid ${est.borde}` }}>
            {est.label}
          </span>
        </div>
        <p className="text-sm text-slate-600 mt-0.5">{r.equipo_label || "Vehículo"}</p>
        {(r.destino || r.motivo) && (
          <p className="text-xs text-slate-500 mt-0.5">
            {[r.destino, r.motivo].filter(Boolean).join(" · ")}
          </p>
        )}
        {/* El préstamo es lo que hace que esta línea explique dónde estuvo el
            vehículo, y no solo cuál manejó. */}
        {prestamo && (
          <p className="text-xs text-amber-700 mt-1 flex items-center gap-1">
            <ArrowLeftRight className="w-3 h-3 shrink-0" /> {prestamo}
          </p>
        )}
        <div className="flex items-center gap-3 mt-1.5 flex-wrap">
          {km !== null && (
            <span className="text-xs text-slate-500 flex items-center gap-1">
              <Gauge className="w-3 h-3" /> {km.toLocaleString("es-CL")} km
            </span>
          )}
          {(r.hora_salida || r.hora_regreso) && (
            <span className="text-xs text-slate-400">
              {r.hora_salida || "—"} a {r.hora_regreso || "—"}
            </span>
          )}
          {r.combustible_litros ? (
            <span className="text-xs text-slate-500 flex items-center gap-1">
              <Fuel className="w-3 h-3" /> {r.combustible_litros} L
              {r.combustible_monto ? ` · $${Number(r.combustible_monto).toLocaleString("es-CL")}` : ""}
            </span>
          ) : null}
        </div>
      </div>
      {onEditar && (
        <button onClick={onEditar} className="text-slate-400 hover:text-amber-700 shrink-0"
          title={r.estado === "en_ruta" ? "Registrar el regreso" : "Corregir"}>
          {r.estado === "en_ruta" ? <CheckCircle2 className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
        </button>
      )}
    </div>
  );
}

function Tarjeta({ titulo, valor, icono: Icono, alerta }) {
  return (
    <div className={`rounded-2xl border p-4 ${alerta ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"}`}>
      <Icono className={`w-4 h-4 ${alerta ? "text-amber-600" : "text-slate-400"}`} />
      <p className="text-xl font-bold text-slate-900 mt-2">{valor}</p>
      <p className="text-xs text-slate-500">{titulo}</p>
    </div>
  );
}

function fecha(v) {
  if (!v) return "—";
  const d = new Date(`${String(v).split("T")[0]}T00:00:00`);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString("es-CL");
}
