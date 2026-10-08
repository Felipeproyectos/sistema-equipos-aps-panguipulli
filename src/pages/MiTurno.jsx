import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import {
  Truck, Loader2, AlertTriangle, CheckCircle2, Clock, IdCard, ArrowLeft, Route,
  ArrowLeftRight, KeyRound, CalendarClock, Ban, Ambulance, ChevronRight, Gauge, Info,
} from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { isSimulandoActivo } from "@/lib/roleSimulator";
import { estadoLicencia } from "@/pages/Choferes";
import { createPageUrl } from "@/utils";
import {
  CHECKLIST_INICIO, COMBUSTIBLE, MOTIVOS_CAMBIO, gruposParaTomar, horaChile, kmRecorridos, pautaCompleta,
} from "@/lib/turnoFlota";
import PautaDiariaAmbulancia from "@/components/bitacora/PautaDiariaAmbulancia";
import SalidaModal from "@/components/flota/SalidaModal";

// «Mi turno»: la pantalla principal del chofer.
//
// Por qué existe
// ──────────────
// En la práctica el chofer elige el vehículo al llegar, y en el día puede
// usar más de uno (una falla, un cambio de carga, un relevo). Esperar a que
// Movilización lo asigne en el calendario era registrar algo que ya había
// pasado, cuando alguien se acordaba. Ahora lo hace el chofer en el momento:
// toma el vehículo al hacer la pauta de inicio y lo entrega al terminar.
//
// Las reglas (quién puede tomar qué, relevos, fallas, licencia) las aplica el
// servidor: servidor/funciones/turnoVehiculo.js. Esta pantalla solo muestra y
// pregunta. La base además impide dos usos abiertos del mismo vehículo o del
// mismo chofer, y abrir uno con la licencia vencida (25_turno_chofer.sql).

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

const fechaCorta = (iso) => {
  if (!iso) return "";
  const [y, m, d] = String(iso).slice(0, 10).split("-");
  return `${d}-${m}-${y}`;
};
const kmTexto = (n) => (n == null || n === "" ? "—" : Number(n).toLocaleString("es-CL"));
const mensajeDe = (e) => e?.data?.error || e?.message || "No se pudo completar. Intenta de nuevo.";

const ICONO_TIPO = { ambulancia: Ambulance };
const iconoDe = (tipo) => ICONO_TIPO[tipo] || Truck;

const inputCls = "w-full border border-slate-200 rounded-xl px-3.5 py-3 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-amber-200";
const labelCls = "block text-xs font-semibold text-slate-600 mb-1.5";

export default function MiTurno() {
  const { user } = useAuth();
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState("");
  const [paso, setPaso] = useState(null); // null | "elegir" | "pauta" | "entregar"
  const [elegido, setElegido] = useState(null); // { vehiculo, relevo }
  const [aviso, setAviso] = useState("");
  const [salida, setSalida] = useState(null);
  const [registros, setRegistros] = useState([]);
  const soloLectura = isSimulandoActivo();

  const cargar = useCallback(async () => {
    setErrorCarga("");
    try {
      const [r, regs] = await Promise.all([
        base44.functions.invoke("turnoVehiculo", { accion: "estado" }),
        user?.id ? base44.entities.BitacoraFlota.filter({ chofer_id: user.id }, "-fecha", 100).catch(() => []) : [],
      ]);
      setDatos(r.data);
      setRegistros(Array.isArray(regs) ? regs : []);
    } catch (e) {
      setErrorCarga(mensajeDe(e));
    }
    setCargando(false);
  }, [user?.id]);

  useEffect(() => { cargar(); }, [cargar]);

  const volverAlInicio = async (mensaje) => {
    setPaso(null);
    setElegido(null);
    setAviso(mensaje || "");
    await cargar();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (cargando) return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 className="w-7 h-7 text-amber-600 animate-spin" />
    </div>
  );

  const nombre = datos?.yo?.nombre || user?.full_name || user?.email || "";
  const hoy = new Date(`${datos?.hoy || new Date().toISOString().slice(0, 10)}T12:00:00`);
  const fechaLarga = `${DIAS[hoy.getDay()]} ${hoy.getDate()} de ${MESES[hoy.getMonth()]}`;
  const actual = datos?.actual || null;
  const vehiculoActual = actual ? datos.vehiculos.find(v => v.id === actual.equipo_id) : null;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="relative overflow-hidden px-4 lg:px-10 pt-6 lg:pt-10 pb-6 lg:pb-8"
        style={{ background: "linear-gradient(135deg, #451a03 0%, #92400e 45%, #d97706 100%)" }}>
        <div className="relative max-w-xl mx-auto flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
            style={{ background: "rgba(255,255,255,0.2)" }}>
            <KeyRound className="w-6 h-6 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-amber-200 text-xs font-semibold uppercase tracking-widest">Mi turno</p>
            <h1 className="text-2xl font-bold text-white truncate">
              {paso === "elegir" ? "¿Qué vehículo usarás?"
                : paso === "pauta" ? "Pauta de inicio"
                : paso === "entregar" ? "Entregar vehículo"
                : `Hola, ${String(nombre).split(" ")[0]}`}
            </h1>
            <p className="text-amber-100 text-sm mt-0.5 first-letter:uppercase">
              {paso === "pauta" && elegido ? elegido.vehiculo.label : fechaLarga}
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 pt-5 pb-12 space-y-4">
        {errorCarga && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <p>{errorCarga}</p>
              <button onClick={() => { setCargando(true); cargar(); }} className="mt-1 text-xs font-bold underline">Reintentar</button>
            </div>
          </div>
        )}

        {datos && paso === null && (
          <Inicio
            datos={datos} actual={actual} vehiculoActual={vehiculoActual} aviso={aviso}
            soloLectura={soloLectura}
            onTomar={() => { setAviso(""); setPaso("elegir"); }}
            onCambiar={() => { setAviso(""); setPaso("elegir"); }}
            onEntregar={() => { setAviso(""); setPaso("entregar"); }}
            onSalida={() => setSalida({})}
            onCerrarSalida={(r) => setSalida({ registro: r })}
            registros={registros}
          />
        )}

        {datos && paso === "elegir" && (
          <Elegir
            datos={datos}
            onVolver={() => setPaso(null)}
            onElegir={(vehiculo, relevo) => { setElegido({ vehiculo, relevo }); setPaso("pauta"); }}
          />
        )}

        {datos && paso === "pauta" && elegido && (
          <Pauta
            datos={datos} elegido={elegido} actual={actual} nombre={nombre}
            onVolver={() => setPaso("elegir")}
            onListo={(r) => volverAlInicio(
              `Tomaste ${elegido.vehiculo.label}.`
              + (r?.relevo ? " Se cerró el tramo del chofer que lo tenía." : "")
              + (r?.solicitud_creada ? " La falla que marcaste ya le llegó a Movilización." : ""))}
          />
        )}

        {datos && paso === "entregar" && actual && (
          <Entregar
            actual={actual}
            onVolver={() => setPaso(null)}
            onListo={(r) => volverAlInicio(
              `Entregaste ${actual.equipo_label || "el vehículo"}.`
              + (r?.solicitud_creada ? " Lo que reportaste le llegó a Movilización." : ""))}
          />
        )}
      </div>

      {salida && actual && (
        <SalidaModal
          registro={salida.registro}
          equipos={[{ id: actual.equipo_id, label: actual.equipo_label }]}
          chofer={{ id: user?.id, nombre }}
          registros={registros}
          usoId={actual.id}
          onClose={() => setSalida(null)}
          onGuardado={cargar}
        />
      )}
    </div>
  );
}

/* ── Inicio: licencia, lo que tiene a cargo y su día ─────────────────── */
function Inicio({ datos, actual, vehiculoActual, aviso, soloLectura, onTomar, onCambiar, onEntregar, onSalida, onCerrarSalida, registros }) {
  const lic = estadoLicencia(datos.yo.licencia_vencimiento);
  const puede = datos.yo.licencia_vigente;
  const abiertas = actual ? registros.filter(r => r.estado === "en_ruta" && r.equipo_id === actual.equipo_id) : [];

  return (
    <>
      {aviso && (
        <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 flex items-start gap-2">
          <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />{aviso}
        </div>
      )}

      {puede ? (
        <div className={`rounded-xl border px-3.5 py-2.5 text-xs font-semibold flex items-center gap-2 ${
          lic.clave === "por_vencer" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-green-200 bg-green-50 text-green-800"}`}>
          {lic.clave === "por_vencer" ? <Clock className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
          Licencia{datos.yo.licencia_clase ? ` clase ${datos.yo.licencia_clase}` : ""}{" "}
          {lic.clave === "por_vencer" ? `vence en ${lic.dias} días (${fechaCorta(datos.yo.licencia_vencimiento)})` : `vigente hasta ${fechaCorta(datos.yo.licencia_vencimiento)}`}
        </div>
      ) : (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3.5 flex items-start gap-3">
          <IdCard className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div className="text-sm text-red-800">
            <p className="font-bold">
              {datos.yo.licencia_vencimiento ? "Tu licencia está vencida" : "Todavía no cargas tu licencia"}
            </p>
            <p className="mt-0.5">Sin licencia vigente no puedes tomar vehículos.</p>
            <Link to={createPageUrl("MiLicencia")} className="inline-flex items-center gap-1 mt-2 text-xs font-bold text-white bg-red-600 rounded-lg px-3 py-1.5">
              Ir a Mi licencia <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      )}

      {actual ? (
        <div className="rounded-3xl p-5 bg-white" style={{ border: "2px solid #F59E0B", background: "linear-gradient(135deg, #FFF7ED, #FFFFFF)" }}>
          <p className="text-[11px] font-extrabold text-amber-700 uppercase tracking-widest">A tu cargo ahora</p>
          <p className="text-xl font-bold text-slate-900 mt-1">{actual.equipo_label}</p>
          <p className="text-sm text-slate-500 mt-0.5">
            Desde las {horaChile(actual.inicio)}{actual.fecha !== datos.hoy ? ` del ${fechaCorta(actual.fecha)}` : ""}
            {actual.km_inicio != null ? ` · km ${kmTexto(actual.km_inicio)}` : ""}
          </p>
          {actual.fecha !== datos.hoy && (
            <p className="text-xs text-amber-800 mt-2 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              Lo tomaste otro día y no consta que lo hayas entregado.
            </p>
          )}
          {vehiculoActual?.reserva && !vehiculoActual.reserva.para_mi && (
            <p className="text-xs text-blue-800 mt-2">
              Ojo: Movilización lo reservó hoy para {vehiculoActual.reserva.chofer_nombre}
              {vehiculoActual.reserva.hora_salida ? ` a las ${vehiculoActual.reserva.hora_salida}` : ""}.
            </p>
          )}
          {!soloLectura && (
            <>
              <div className="grid grid-cols-2 gap-2 mt-4">
                <button onClick={onSalida}
                  className="py-3 rounded-xl text-sm font-bold text-white bg-amber-700 hover:bg-amber-800 flex items-center justify-center gap-1.5">
                  <Route className="w-4 h-4" /> Registrar salida
                </button>
                <button onClick={onCambiar} disabled={!puede}
                  className="py-3 rounded-xl text-sm font-bold text-slate-700 bg-white border border-slate-200 flex items-center justify-center gap-1.5 disabled:opacity-40">
                  <ArrowLeftRight className="w-4 h-4" /> Cambiar vehículo
                </button>
              </div>
              <button onClick={onEntregar}
                className="w-full mt-2 py-3 rounded-xl text-sm font-bold text-white bg-green-600 hover:bg-green-700">
                Entregar vehículo
              </button>
            </>
          )}
          {abiertas.length > 0 && (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
              <p className="text-xs font-bold text-amber-900">Salida sin cerrar</p>
              {abiertas.map(r => (
                <div key={r.id} className="flex items-center justify-between gap-2 mt-1">
                  <p className="text-xs text-amber-900">
                    {r.hora_salida ? `${r.hora_salida} · ` : ""}{r.destino || "Sin destino"}
                  </p>
                  {!soloLectura && (
                    <button onClick={() => onCerrarSalida(r)} className="text-xs font-bold text-white bg-amber-700 rounded-lg px-2.5 py-1">
                      Ya volví
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-3xl p-6 bg-white border border-slate-200 text-center">
          <Truck className="w-10 h-10 text-slate-300 mx-auto" />
          <p className="font-bold text-slate-800 mt-2">No tienes vehículo a cargo</p>
          <p className="text-sm text-slate-500 mt-1">Para empezar, toma el vehículo que vas a usar y haz la pauta de inicio.</p>
          {!soloLectura && (
            <button onClick={onTomar} disabled={!puede}
              className="w-full mt-4 py-3.5 rounded-xl text-sm font-bold text-white bg-amber-700 hover:bg-amber-800 disabled:opacity-40">
              Tomar vehículo
            </button>
          )}
        </div>
      )}

      {datos.reservas_mias?.length > 0 && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3">
          <p className="text-xs font-bold text-blue-900 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
            <CalendarClock className="w-4 h-4" /> Movilización te reservó
          </p>
          {datos.reservas_mias.map(r => (
            <p key={r.id} className="text-sm text-blue-900">
              <strong>{r.equipo_label || "Vehículo"}</strong>
              {" · "}{r.desde === datos.hoy ? "hoy" : fechaCorta(r.desde)}
              {r.hasta && r.hasta !== r.desde ? ` al ${fechaCorta(r.hasta)}` : ""}
              {r.hora_salida ? ` a las ${r.hora_salida}` : ""}
              {r.destino ? ` · ${r.destino}` : ""}
            </p>
          ))}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 p-4">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Tu día</p>
        {datos.tramos.length === 0 ? (
          <p className="text-sm text-slate-500">Todavía no has tomado ningún vehículo hoy.</p>
        ) : (
          <div className="space-y-2.5">
            {datos.tramos.map(u => {
              const km = kmRecorridos(u);
              const abierto = u.estado === "en_uso";
              return (
                <div key={u.id} className="flex gap-3">
                  <span className="w-2.5 h-2.5 rounded-full mt-1.5 shrink-0" style={{ background: abierto ? "#F59E0B" : "#94A3B8" }} />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800">
                      {horaChile(u.inicio)} – {abierto ? "ahora" : horaChile(u.fin)} · {u.equipo_label}
                    </p>
                    <p className="text-xs text-slate-500">
                      {[
                        km != null ? `${km.toLocaleString("es-CL")} km` : null,
                        u.cerrado_por === "relevo" ? `Lo tomó ${u.relevado_por || "otro chofer"}` : null,
                        u.cerrado_por === "movilizacion" ? "Cerrado por Movilización" : null,
                        u.motivo_cambio ? `Cambio: ${u.motivo_cambio}` : null,
                        u.pauta_con_falla ? "Pauta con falla informada" : null,
                      ].filter(Boolean).join(" · ") || (abierto ? "En uso" : "Entregado")}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

/* ── Elegir el vehículo ──────────────────────────────────────────────── */
function Elegir({ datos, onVolver, onElegir }) {
  const [confirmar, setConfirmar] = useState(null); // { vehiculo, tipo }
  const g = gruposParaTomar(
    datos.vehiculos.map(v => ({ ...v, vehiculo: v, reserva: v.reserva && { ...v.reserva, chofer_id: v.reserva.para_mi ? datos.yo.id : "__otro" } })),
    datos.yo.id,
  );

  const Fila = ({ v, derecha, tono, onClick, disabled, detalle }) => {
    const Icono = iconoDe(v.tipo);
    const t = {
      libre: { borde: "#E2E8F0", fondo: "#FFFFFF", chip: "bg-orange-50 text-amber-800 border-orange-200" },
      mia: { borde: "#BFDBFE", fondo: "#EFF6FF", chip: "bg-white text-blue-700 border-blue-200" },
      ocupado: { borde: "#FDE68A", fondo: "#FFFBEB", chip: "bg-white text-amber-800 border-amber-200" },
      reservado: { borde: "#BFDBFE", fondo: "#EFF6FF", chip: "bg-white text-blue-700 border-blue-200" },
      no: { borde: "#E2E8F0", fondo: "#F8FAFC", chip: "bg-slate-100 text-slate-500 border-slate-200" },
    }[tono];
    return (
      <button type="button" onClick={onClick} disabled={disabled}
        className={`w-full rounded-2xl px-3.5 py-3 flex items-center gap-3 text-left ${disabled ? "opacity-60" : "hover:shadow-md transition-shadow"}`}
        style={{ border: `1px solid ${t.borde}`, background: t.fondo }}>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: v.tipo === "ambulancia" ? "#FEF2F2" : "#FFF7ED" }}>
          <Icono className="w-5 h-5" style={{ color: v.tipo === "ambulancia" ? "#DC2626" : "#B45309" }} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-800 truncate">{v.label}</p>
          <p className="text-xs text-slate-500 truncate">{detalle}</p>
        </div>
        <span className={`text-xs font-bold rounded-lg px-2.5 py-1.5 border shrink-0 ${t.chip}`}>{derecha}</span>
      </button>
    );
  };

  const tipoTexto = (v) => ({ ambulancia: "Ambulancia", camioneta: "Camioneta", furgon: "Furgón", camion_3_4: "Camión 3/4" }[v.tipo] || v.tipo);
  const lugar = (v) => [tipoTexto(v), v.prestamo ? `prestado a ${v.prestamo.centro_destino}` : v.centro].filter(Boolean).join(" · ");
  const reservaTxt = (r) => `${r.hora_salida ? `${r.hora_salida} · ` : ""}${r.destino || "Reservado"}`;

  const Titulo = ({ children }) => (
    <p className="text-[11px] font-extrabold text-slate-400 uppercase tracking-widest mt-2 mb-1.5 ml-1">{children}</p>
  );

  return (
    <div className="space-y-2">
      <button onClick={onVolver} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="w-4 h-4" /> Volver
      </button>

      {confirmar && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-bold text-amber-900">
            {confirmar.tipo === "ocupado"
              ? `${confirmar.vehiculo.label} la tiene ${confirmar.vehiculo.uso.chofer_nombre} desde las ${horaChile(confirmar.vehiculo.uso.inicio)}.`
              : `${confirmar.vehiculo.label} está reservado hoy para ${confirmar.vehiculo.reserva.chofer_nombre}${confirmar.vehiculo.reserva.hora_salida ? ` a las ${confirmar.vehiculo.reserva.hora_salida}` : ""}.`}
          </p>
          <p className="text-xs text-amber-800 mt-1">
            {confirmar.tipo === "ocupado"
              ? "Si te lo entregó, puedes tomarlo: su tramo se cierra y Movilización queda avisado."
              : "Puedes tomarlo igual si lo vas a devolver antes, o si Movilización te lo indicó."}
          </p>
          <div className="grid grid-cols-2 gap-2 mt-3">
            <button onClick={() => setConfirmar(null)} className="py-2.5 rounded-xl text-sm font-bold bg-white border border-slate-200 text-slate-700">
              Elegir otro
            </button>
            <button onClick={() => onElegir(confirmar.vehiculo, confirmar.tipo === "ocupado")}
              className="py-2.5 rounded-xl text-sm font-bold text-white bg-amber-700">
              {confirmar.tipo === "ocupado" ? "Me lo entregó" : "Tomarlo igual"}
            </button>
          </div>
        </div>
      )}

      {g.disponibles.length > 0 && <Titulo>Disponibles</Titulo>}
      {g.disponibles.map(e => (
        <Fila key={e.vehiculo.id} v={e.vehiculo} tono={e.vehiculo.reserva?.para_mi ? "mia" : "libre"}
          derecha="Tomar" onClick={() => onElegir(e.vehiculo, false)}
          detalle={e.vehiculo.reserva?.para_mi ? `Reservado para ti · ${reservaTxt(e.vehiculo.reserva)}` : lugar(e.vehiculo)} />
      ))}
      {g.disponibles.length === 0 && (
        <p className="text-sm text-slate-500 bg-white border border-slate-200 rounded-2xl px-4 py-3">
          No hay vehículos libres en este momento.
        </p>
      )}

      {g.reservados.length > 0 && <Titulo>Reservados</Titulo>}
      {g.reservados.map(e => (
        <Fila key={e.vehiculo.id} v={e.vehiculo} tono="reservado" derecha="Reservado"
          onClick={() => setConfirmar({ vehiculo: e.vehiculo, tipo: "reservado" })}
          detalle={`Para ${e.vehiculo.reserva.chofer_nombre || "otro chofer"} · ${reservaTxt(e.vehiculo.reserva)}`} />
      ))}

      {g.enUso.length > 0 && <Titulo>En uso</Titulo>}
      {g.enUso.map(e => (
        <Fila key={e.vehiculo.id} v={e.vehiculo} tono="ocupado" derecha="Me lo entregó"
          onClick={() => setConfirmar({ vehiculo: e.vehiculo, tipo: "ocupado" })}
          detalle={`La tiene ${e.vehiculo.uso?.chofer_nombre || "otro chofer"} desde las ${horaChile(e.vehiculo.uso?.inicio)}`} />
      ))}

      {g.noDisponibles.length > 0 && <Titulo>No disponibles</Titulo>}
      {g.noDisponibles.map(e => (
        <Fila key={e.vehiculo.id} v={e.vehiculo} tono="no" disabled
          derecha={e.vehiculo.estado === "taller" ? "En taller" : "Fuera de servicio"}
          detalle={e.vehiculo.estado === "taller" ? `En el taller${e.vehiculo.taller?.numero_ot ? ` (${e.vehiculo.taller.numero_ot})` : ""}` : "Fuera de servicio"} />
      ))}
    </div>
  );
}

/* ── Pauta de inicio: al enviarla, el vehículo queda a su nombre ─────── */
function Pauta({ datos, elegido, actual, nombre, onVolver, onListo }) {
  const v = elegido.vehiculo;
  const esAmbulancia = v.tipo === "ambulancia";
  const cambiando = !!actual && actual.equipo_id !== v.id;
  const [km, setKm] = useState(v.ultimo_km?.km != null ? String(v.ultimo_km.km) : "");
  const [combustible, setCombustible] = useState("");
  const [pauta, setPauta] = useState({});
  const [observaciones, setObservaciones] = useState("");
  const [anterior, setAnterior] = useState({ km_fin: "", combustible_fin: "", motivo: MOTIVOS_CAMBIO[0] });
  const [inspeccion, setInspeccion] = useState(null); // ambulancias: la Pauta Diaria ya enviada
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  const marcar = (clave, campo, valor) => setPauta(p => ({ ...p, [clave]: { ...p[clave], [campo]: valor } }));
  const kmNum = km === "" ? null : Number(km);
  const kmOk = kmNum != null && Number.isFinite(kmNum) && kmNum >= 0;
  const antOk = !cambiando || (anterior.km_fin !== "" && Number(anterior.km_fin) >= Number(actual.km_inicio || 0));
  const bajoElUltimo = kmOk && v.ultimo_km?.km != null && kmNum < v.ultimo_km.km;

  const tomar = async (extra = {}) => {
    setError("");
    if (!kmOk) return setError("Indica el kilometraje con que lo tomas.");
    if (!antOk) return setError(`Indica con qué kilometraje entregas ${actual.equipo_label} (no menor que ${kmTexto(actual.km_inicio)}).`);
    if (!esAmbulancia) {
      if (!pautaCompleta(pauta)) return setError("Marca Bien o Mal en todos los ítems de la revisión.");
      const sinObs = CHECKLIST_INICIO.filter(i => pauta[i.clave]?.estado === "mal" && !String(pauta[i.clave]?.obs || "").trim());
      if (sinObs.length) return setError(`Explica qué pasa con: ${sinObs.map(i => i.label).join(", ")}.`);
    }
    setEnviando(true);
    try {
      const r = await base44.functions.invoke("turnoVehiculo", {
        accion: "tomar",
        equipo_id: v.id,
        km_inicio: kmNum,
        combustible,
        observaciones,
        relevo: !!elegido.relevo,
        ...(esAmbulancia ? {} : { pauta }),
        ...(cambiando ? { anterior: { ...anterior, km_fin: Number(anterior.km_fin) } } : {}),
        ...extra,
      });
      onListo(r.data);
    } catch (e) {
      setError(mensajeDe(e));
      setEnviando(false);
    }
  };

  const fallas = CHECKLIST_INICIO.filter(i => pauta[i.clave]?.estado === "mal");

  return (
    <div className="space-y-3">
      <button onClick={onVolver} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="w-4 h-4" /> Elegir otro vehículo
      </button>

      {elegido.relevo && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 flex items-start gap-2">
          <ArrowLeftRight className="w-4 h-4 shrink-0" />
          Lo tenía {v.uso?.chofer_nombre}. Al tomarlo se cierra su tramo y Movilización queda avisado.
        </div>
      )}

      {cambiando && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
          <p className="text-sm font-bold text-slate-800">Primero entregas {actual.equipo_label}</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelCls}>Km al entregarlo *</label>
              <input type="number" inputMode="numeric" className={inputCls} value={anterior.km_fin}
                placeholder={actual.km_inicio != null ? `≥ ${actual.km_inicio}` : ""}
                onChange={e => setAnterior(a => ({ ...a, km_fin: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>Combustible</label>
              <select className={inputCls} value={anterior.combustible_fin} onChange={e => setAnterior(a => ({ ...a, combustible_fin: e.target.value }))}>
                <option value="">—</option>
                {COMBUSTIBLE.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className={labelCls}>¿Por qué cambias de vehículo?</label>
            <select className={inputCls} value={anterior.motivo} onChange={e => setAnterior(a => ({ ...a, motivo: e.target.value }))}>
              {MOTIVOS_CAMBIO.map(m => <option key={m}>{m}</option>)}
            </select>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
        <p className="text-sm font-bold text-slate-800 flex items-center gap-1.5"><Gauge className="w-4 h-4 text-amber-700" /> Kilometraje y combustible</p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelCls}>Km inicial *</label>
            <input type="number" inputMode="numeric" className={inputCls} value={km} onChange={e => setKm(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Combustible</label>
            <select className={inputCls} value={combustible} onChange={e => setCombustible(e.target.value)}>
              <option value="">—</option>
              {COMBUSTIBLE.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
        </div>
        {v.ultimo_km?.km != null && (
          <p className="text-xs text-slate-400">
            Último km registrado: {kmTexto(v.ultimo_km.km)}
            {v.ultimo_km.fecha ? ` (${fechaCorta(v.ultimo_km.fecha)}${v.ultimo_km.quien ? `, ${v.ultimo_km.quien}` : ""})` : ""}
          </p>
        )}
        {bajoElUltimo && (
          <p className="text-xs text-amber-800 flex items-start gap-1.5">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" /> Es menor que el último registrado. Revisa el odómetro antes de seguir.
          </p>
        )}
      </div>

      {esAmbulancia ? (
        inspeccion ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
            <p className="text-sm text-green-800 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> Pauta Diaria enviada.</p>
            {error && <ErrorCaja texto={error} />}
            <button onClick={() => tomar({ inspeccion_id: inspeccion.id, pauta_con_falla: inspeccion.hasFallas })} disabled={enviando}
              className="w-full py-3.5 rounded-xl text-sm font-bold text-white bg-amber-700 disabled:opacity-60 flex items-center justify-center gap-2">
              {enviando ? <><Loader2 className="w-4 h-4 animate-spin" /> Tomando...</> : "Tomar la ambulancia"}
            </button>
          </div>
        ) : !kmOk || !antOk ? (
          <p className="text-sm text-slate-500 bg-white border border-slate-200 rounded-2xl px-4 py-3">
            Indica el kilometraje{cambiando ? " (y con cuánto entregas el anterior)" : ""} para seguir con la Pauta Diaria de inicio.
          </p>
        ) : (
          <>
            {error && <ErrorCaja texto={error} />}
            <PautaDiariaAmbulancia
              equipoFijo={{ id: v.id, marca: v.marca, modelo: v.modelo, patente: v.patente }}
              momento="inicio"
              conductorFijo={nombre}
              textoBoton="Enviar pauta y tomar la ambulancia"
              onSuccess={({ id, hasFallas }) => {
                setInspeccion({ id, hasFallas });
                tomar({ inspeccion_id: id, pauta_con_falla: !!hasFallas });
              }}
            />
          </>
        )
      ) : (
        <>
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <p className="text-sm font-bold text-slate-800 mb-1">Revisión rápida</p>
            <div className="divide-y divide-slate-100">
              {CHECKLIST_INICIO.map(i => {
                const est = pauta[i.clave]?.estado;
                return (
                  <div key={i.clave} className="py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm text-slate-700">{i.label}</span>
                      <div className="flex gap-1.5 shrink-0">
                        <button type="button" onClick={() => marcar(i.clave, "estado", "bien")}
                          className="text-xs font-bold rounded-lg px-3 py-1.5 border"
                          style={est === "bien" ? { background: "#F0FDF4", color: "#16A34A", borderColor: "#BBF7D0" } : { color: "#94A3B8", borderColor: "#E2E8F0" }}>
                          Bien
                        </button>
                        <button type="button" onClick={() => marcar(i.clave, "estado", "mal")}
                          className="text-xs font-bold rounded-lg px-3 py-1.5 border"
                          style={est === "mal" ? { background: "#FEF2F2", color: "#DC2626", borderColor: "#FECACA" } : { color: "#94A3B8", borderColor: "#E2E8F0" }}>
                          Mal
                        </button>
                      </div>
                    </div>
                    {est === "mal" && (
                      <input className={`${inputCls} mt-2 py-2`} placeholder="¿Qué pasa? (obligatorio)"
                        value={pauta[i.clave]?.obs || ""} onChange={e => marcar(i.clave, "obs", e.target.value)} />
                    )}
                  </div>
                );
              })}
            </div>
            <label className={`${labelCls} mt-3`}>Observaciones (opcional)</label>
            <textarea rows={2} className={`${inputCls} resize-none`} value={observaciones} onChange={e => setObservaciones(e.target.value)} />
          </div>

          {fallas.length > 0 && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              Marcaste {fallas.map(f => f.label).join(", ")} como Mal. Puedes salir igual si es seguro; la falla le llega a Movilización.
            </div>
          )}

          {error && <ErrorCaja texto={error} />}
          <button onClick={() => tomar()} disabled={enviando}
            className="w-full py-3.5 rounded-xl text-sm font-bold text-white bg-amber-700 hover:bg-amber-800 disabled:opacity-60 flex items-center justify-center gap-2">
            {enviando ? <><Loader2 className="w-4 h-4 animate-spin" /> Tomando...</> : "Enviar pauta y tomar vehículo"}
          </button>
        </>
      )}
      <p className="text-[11px] text-slate-400 text-center">Hoy {datos.hoy ? fechaCorta(datos.hoy) : ""} · {nombre}</p>
    </div>
  );
}

/* ── Entregar ────────────────────────────────────────────────────────── */
function Entregar({ actual, onVolver, onListo }) {
  const [km, setKm] = useState("");
  const [combustible, setCombustible] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [reporte, setReporte] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  const entregar = async () => {
    setError("");
    const n = km === "" ? null : Number(km);
    if (n == null || !Number.isFinite(n)) return setError("Indica el kilometraje con que lo entregas.");
    if (actual.km_inicio != null && n < Number(actual.km_inicio)) {
      return setError(`No puede ser menor que el de inicio (${kmTexto(actual.km_inicio)}).`);
    }
    setEnviando(true);
    try {
      const r = await base44.functions.invoke("turnoVehiculo", {
        accion: "entregar", km_fin: n, combustible_fin: combustible, observaciones, reporte,
      });
      onListo(r.data);
    } catch (e) {
      setError(mensajeDe(e));
      setEnviando(false);
    }
  };

  const recorridos = km !== "" && actual.km_inicio != null && Number(km) >= Number(actual.km_inicio)
    ? Number(km) - Number(actual.km_inicio) : null;

  return (
    <div className="space-y-3">
      <button onClick={onVolver} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="w-4 h-4" /> Volver
      </button>
      <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
        <div>
          <p className="text-sm font-bold text-slate-800">{actual.equipo_label}</p>
          <p className="text-xs text-slate-500">Lo tomaste a las {horaChile(actual.inicio)} con {kmTexto(actual.km_inicio)} km</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelCls}>Km final *</label>
            <input type="number" inputMode="numeric" className={inputCls} value={km} onChange={e => setKm(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Combustible</label>
            <select className={inputCls} value={combustible} onChange={e => setCombustible(e.target.value)}>
              <option value="">—</option>
              {COMBUSTIBLE.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
        </div>
        {recorridos != null && <p className="text-xs text-slate-500">Recorriste {recorridos.toLocaleString("es-CL")} km.</p>}
        <div>
          <label className={labelCls}>Observaciones (opcional)</label>
          <textarea rows={2} className={`${inputCls} resize-none`} value={observaciones} onChange={e => setObservaciones(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>¿Algo que reportar a Movilización? (opcional)</label>
          <textarea rows={2} className={`${inputCls} resize-none`} value={reporte}
            placeholder="Ej: ruido en el freno delantero, luz de motor encendida..."
            onChange={e => setReporte(e.target.value)} />
          <p className="text-[11px] text-slate-400 mt-1">Si escribes algo aquí, le llega a Movilización como falla para revisar.</p>
        </div>
      </div>
      {error && <ErrorCaja texto={error} />}
      <button onClick={entregar} disabled={enviando}
        className="w-full py-3.5 rounded-xl text-sm font-bold text-white bg-green-600 hover:bg-green-700 disabled:opacity-60 flex items-center justify-center gap-2">
        {enviando ? <><Loader2 className="w-4 h-4 animate-spin" /> Entregando...</> : "Entregar vehículo"}
      </button>
    </div>
  );
}

function ErrorCaja({ texto }) {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 flex items-start gap-2">
      <Ban className="w-4 h-4 shrink-0 mt-0.5" />{texto}
    </div>
  );
}
