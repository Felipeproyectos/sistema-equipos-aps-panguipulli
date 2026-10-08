import { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import {
  LayoutDashboard, RefreshCw, Truck, IdCard, NotebookPen, Wrench,
  AlertTriangle, CheckCircle2, ArrowRight, ArrowLeftRight, Clock, Stethoscope,
  Route, ChevronRight, Printer, HeartPulse, CalendarClock, KeyRound, Ban,
} from "lucide-react";
import usePullToRefresh from "@/hooks/usePullToRefresh";
import { createPageUrl } from "@/utils";
import { esVehiculo } from "@/lib/centros";
import { estadoLicencia } from "@/pages/Choferes";
import { resumenDelDia, pasosDeLaPuestaEnMarcha } from "@/lib/panelFlota";
import { resumenAhora, horaChile, rotuloVehiculo as rotuloDeFlota } from "@/lib/turnoFlota";

// La primera pantalla del Encargado de Movilización.
//
// Por qué existe
// ──────────────
// La gestión de los móviles quedó repartida en cinco pantallas (Solicitudes
// al Taller, Vehículos, Calendario, Choferes, Bitácora), cada una bien hecha
// por separado, pero sin nada que dijera por dónde empezar ni qué había que
// hacer HOY. Quien entraba tenía que recorrerlas todas para enterarse de que
// un vehículo estaba sin chofer o que una licencia había vencido.
//
// Esta pantalla responde dos preguntas, en este orden:
//   1. ¿Qué necesita mi atención hoy? — cada aviso con su botón directo.
//   2. ¿Cómo funciona esto? — el proceso en pasos, con cuáles ya están hechos.
//
// Desde migracion/25_turno_chofer.sql arriba de todo va «Ahora»: quién tiene
// cada vehículo en este momento. Los choferes lo toman en «Mi turno»; acá
// Movilización solo mira, y puede liberar uno que quedó sin entregar.

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = ["enero","febrero","marzo","abril","mayo","junio",
               "julio","agosto","septiembre","octubre","noviembre","diciembre"];

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

/** Hasta tres nombres, y "y N más". Un aviso sin nombres obliga a ir a buscar. */
function nombres(lista, rotulo) {
  const r = lista.slice(0, 3).map(rotulo).filter(Boolean);
  const resto = lista.length - r.length;
  return r.join(" · ") + (resto > 0 ? ` y ${resto} más` : "");
}
const rotuloChofer = (c) => c.full_name || c.email;

const TONO = {
  rojo:  { borde: "#fecaca", fondo: "#fef2f2", texto: "#991b1b", icono: "#dc2626", boton: "#b91c1c" },
  ambar: { borde: "#fde68a", fondo: "#fffbeb", texto: "#92400e", icono: "#d97706", boton: "#b45309" },
  azul:  { borde: "#bfdbfe", fondo: "#eff6ff", texto: "#1e3a8a", icono: "#2563eb", boton: "#1d4ed8" },
  gris:  { borde: "#e2e8f0", fondo: "#f8fafc", texto: "#334155", icono: "#64748b", boton: "#475569" },
};

export default function PanelFlota() {
  const [datos, setDatos] = useState(null);
  const [ahora, setAhora] = useState(null);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef(null);

  const cargar = useCallback(async () => {
    const [equipos, gente, asignaciones, prestamos, bitacora, solicitudes, ordenes, usos] = await Promise.all([
      base44.functions.invoke("getEquiposPorCentro")
        .then(r => r.data?.equipos || [])
        .catch(() => base44.entities.Equipo.list("-updated_date", 500).catch(() => [])),
      base44.functions.invoke("getUsuariosPorCentro")
        .then(r => (Array.isArray(r?.data) ? r.data : []))
        .catch(() => base44.entities.User.list("full_name", 500).catch(() => [])),
      base44.entities.AsignacionChofer.filter({ estado: "activa" }, "-desde", 1000).catch(() => []),
      base44.entities.PrestamoVehiculo.filter({ estado: "vigente" }, "-desde", 500).catch(() => []),
      base44.entities.BitacoraFlota.list("-fecha", 1000).catch(() => []),
      base44.entities.Solicitud.list("-created_date", 500).catch(() => []),
      base44.entities.OrdenTrabajo.list("-created_date", 500).catch(() => []),
      base44.entities.UsoVehiculo.list("-inicio", 1500).catch(() => []),
    ]);
    const vehiculos = equipos.filter(e => esVehiculo(e.tipo));
    setAhora({
      ...resumenAhora({ vehiculos, usos, ordenes, reservas: asignaciones, prestamos }),
      choferes: gente.filter(u => u.role === "chofer"),
      hayUsos: usos.some(u => u.estado !== "rechazado"),
    });
    setDatos(resumenDelDia({
      vehiculos: equipos.filter(e => esVehiculo(e.tipo)),
      choferes: gente.filter(u => u.role === "chofer"),
      asignaciones, prestamos, bitacora, solicitudes, ordenes, equipos,
      estadoLicencia,
    }));
  }, []);

  useEffect(() => { cargar().finally(() => setLoading(false)); }, [cargar]);
  const { refreshing } = usePullToRefresh(cargar, containerRef);

  const liberar = async (u) => {
    if (!window.confirm(`¿Liberar ${u.equipo_label || "el vehículo"}? Se cierra el uso de ${u.chofer_nombre} (desde las ${horaChile(u.inicio)}).`)) return;
    try {
      await base44.functions.invoke("turnoVehiculo", { accion: "liberar", uso_id: u.id, nota: "Liberado desde el Panel de Flota" });
    } catch (e) {
      window.alert(e?.data?.error || e?.message || "No se pudo liberar.");
    }
    cargar();
  };

  if (loading || !datos || !ahora) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const r = datos;
  const hoy = new Date(`${r.dia}T12:00:00`);
  const fechaLarga = `${DIAS[hoy.getDay()]} ${hoy.getDate()} de ${MESES[hoy.getMonth()]}`;

  // ── Lo de hoy, de lo más grave a lo menos ─────────────────────────────
  const a = ahora;
  const idsVencidos = new Set(r.licenciaVencida.map(c => c.id));
  const conVehiculoYVencida = a.enUso.filter(e => idsVencidos.has(e.uso.chofer_id));
  const avisos = [
    conVehiculoYVencida.length > 0 && {
      tono: "rojo", icono: IdCard,
      titulo: `${plural(conVehiculoYVencida.length, "chofer tiene", "choferes tienen")} un vehículo con la licencia vencida`,
      detalle: nombres(conVehiculoYVencida, e => `${e.uso.chofer_nombre} (${rotuloDeFlota(e.vehiculo)})`),
      accion: "Liberar", pagina: "Flota",
    },
    a.rechazosHoy.length > 0 && {
      tono: "rojo", icono: Ban,
      titulo: `${plural(a.rechazosHoy.length, "intento", "intentos")} de tomar un vehículo con la licencia vencida o sin cargar`,
      detalle: nombres(a.rechazosHoy, u => `${u.chofer_nombre} · ${u.equipo_label} · ${horaChile(u.inicio)}`) + ". No se le permitió.",
      accion: "Ver choferes", pagina: "Choferes",
    },
    a.sinEntregar.length > 0 && {
      tono: "ambar", icono: Clock,
      titulo: `${plural(a.sinEntregar.length, "vehículo sigue", "vehículos siguen")} sin entregar desde otro día`,
      detalle: nombres(a.sinEntregar, u => `${u.equipo_label} · ${u.chofer_nombre} desde ${String(u.fecha || "").slice(8, 10)}/${String(u.fecha || "").slice(5, 7)}`),
      accion: "Ver vehículos", pagina: "Flota",
    },
    a.fallasHoy.length > 0 && {
      tono: "ambar", icono: AlertTriangle,
      titulo: `${plural(a.fallasHoy.length, "pauta de inicio marcó", "pautas de inicio marcaron")} fallas hoy`,
      detalle: nombres(a.fallasHoy, u => `${u.equipo_label} (${u.chofer_nombre})`),
      accion: "Revisar", pagina: "Movilizacion",
    },
    a.relevosHoy.length > 0 && {
      tono: "azul", icono: ArrowLeftRight,
      titulo: `${plural(a.relevosHoy.length, "vehículo cambió", "vehículos cambiaron")} de manos sin entregarse en el sistema`,
      detalle: nombres(a.relevosHoy, u => `${u.equipo_label}: ${u.chofer_nombre} → ${u.relevado_por}`),
      accion: "Calendario", pagina: "Calendario",
    },
    r.citasPorResponder.length > 0 && {
      tono: "azul", icono: CalendarClock,
      titulo: `El taller propone fecha de ingreso para ${plural(r.citasPorResponder.length, "vehículo", "vehículos")}`,
      detalle: nombres(r.citasPorResponder, o => o.equipo_label || o.numero_ot),
      accion: "Responder", pagina: "Movilizacion",
    },
    r.porRevisar.length > 0 && {
      tono: "ambar", icono: Stethoscope,
      titulo: `${plural(r.porRevisar.length, "falla informada espera", "fallas informadas esperan")} que la revises`,
      detalle: "Decide si va al taller o se cierra sin reparación.",
      accion: "Revisar", pagina: "Movilizacion",
    },
    r.prestamosAtrasados.length > 0 && {
      tono: "ambar", icono: ArrowLeftRight,
      titulo: `${plural(r.prestamosAtrasados.length, "préstamo pasó", "préstamos pasaron")} su fecha de devolución`,
      detalle: nombres(r.prestamosAtrasados, p => `${p.equipo_label || "Vehículo"} en ${p.centro_destino}`),
      accion: "Ver vehículos", pagina: "Flota",
    },
    r.salidasAbiertas.length > 0 && {
      tono: "ambar", icono: Route,
      titulo: `${plural(r.salidasAbiertas.length, "salida sigue", "salidas siguen")} sin cerrar`,
      detalle: "El vehículo salió y no consta que haya vuelto.",
      accion: "Ver bitácora", pagina: "BitacoraFlota",
    },
    r.licenciaPorVencer.length > 0 && {
      tono: "azul", icono: Clock,
      titulo: `${plural(r.licenciaPorVencer.length, "licencia vence", "licencias vencen")} en los próximos 60 días`,
      detalle: nombres(r.licenciaPorVencer, rotuloChofer),
      accion: "Ver choferes", pagina: "Choferes",
    },
    r.sinLicencia.length > 0 && {
      tono: "gris", icono: IdCard,
      titulo: `${plural(r.sinLicencia.length, "chofer no ha", "choferes no han")} cargado su licencia`,
      detalle: "Hasta que la carguen no pueden tomar vehículos.",
      accion: "Ver choferes", pagina: "Choferes",
    },
  ].filter(Boolean);

  const pasos = pasosDeLaPuestaEnMarcha(r);
  const hecho = (clave) => (clave === "calendario" ? a.hayUsos : pasos.find(p => p.clave === clave)?.hecho);

  const PASOS = [
    {
      clave: "vehiculos", icono: Truck, pagina: "Flota", boton: "Vehículos",
      titulo: "Carga los vehículos",
      texto: "Cada móvil con su patente y su centro. Las ambulancias ya las carga Salud: aquí aparecen solas.",
      estado: r.vehiculos.length ? `${plural(r.vehiculos.length, "vehículo cargado", "vehículos cargados")}` : "Aún no hay vehículos",
    },
    {
      clave: "choferes", icono: IdCard, pagina: "Choferes", boton: "Choferes",
      titulo: "Crea los choferes",
      texto: "Les creas la cuenta y les entregas la clave. Al entrar, cada uno carga su licencia desde el teléfono.",
      estado: r.choferes.length
        ? `${r.habilitados.length} de ${r.choferes.length} con licencia vigente`
        : "Aún no hay choferes",
    },
    {
      clave: "calendario", icono: KeyRound, pagina: "Calendario", boton: "Calendario",
      titulo: "Los choferes toman los vehículos",
      texto: "Cada chofer entra a «Mi turno» en su teléfono, elige el vehículo y hace la pauta de inicio; al terminar lo entrega. Tú lo ves en el Calendario y puedes reservar un vehículo para una salida.",
      estado: a.hayUsos
        ? `${plural(a.usosHoy.length, "uso", "usos")} hoy · ${plural(a.enUso.length, "vehículo", "vehículos")} en uso ahora`
        : "Todavía ningún chofer ha tomado un vehículo",
    },
    {
      clave: "bitacora", icono: NotebookPen, pagina: "BitacoraFlota", boton: "Bitácora",
      titulo: "Cada salida queda registrada",
      texto: "El chofer anota la salida y el regreso en Mi bitácora (kilómetros, destino, combustible). Tú lo ves todo junto.",
      estado: r.salidasDelMes.length
        ? `${plural(r.salidasDelMes.length, "salida", "salidas")} este mes`
        : "Aún sin salidas este mes",
    },
  ];

  return (
    <div ref={containerRef} className="min-h-screen bg-slate-50" style={{ overscrollBehavior: "none" }}>
      {refreshing && (
        <div className="flex items-center justify-center py-3 lg:hidden">
          <RefreshCw className="w-5 h-5 text-amber-500 animate-spin" />
        </div>
      )}

      <div className="relative overflow-hidden px-4 lg:px-10 pt-6 lg:pt-10 pb-6 lg:pb-8"
        style={{ background: "linear-gradient(135deg, #451a03 0%, #92400e 45%, #d97706 100%)" }}>
        <div className="relative max-w-5xl mx-auto flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
            style={{ background: "rgba(255,255,255,0.2)" }}>
            <LayoutDashboard className="w-6 h-6 text-white" />
          </div>
          <div>
            <p className="text-amber-200 text-xs font-semibold uppercase tracking-widest">Flota</p>
            <h1 className="text-2xl lg:text-3xl font-bold text-white">Panel de Flota</h1>
            <p className="text-amber-100 text-sm mt-0.5 first-letter:uppercase">{fechaLarga}</p>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 lg:px-10 pt-6 pb-12 space-y-8">

        {/* ── 0. Ahora ──────────────────────────────────────────────────── */}
        <section>
          <h2 className="text-lg font-bold text-slate-800 mb-1">Ahora</h2>
          <p className="text-sm text-slate-500 mb-4">Quién tiene cada vehículo en este momento. Lo registran los choferes al tomarlo en «Mi turno».</p>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 mb-4">
            {[
              { n: a.enUso.length, t: "En uso", c: "#B45309" },
              { n: a.libres.length, t: "Libres", c: "#16A34A" },
              { n: a.reservados.length, t: "Reservados hoy", c: "#1D4ED8" },
              { n: a.enTaller.length + a.fueraServicio.length, t: "En taller / fuera", c: "#DC2626" },
              { n: a.prestados.length, t: "Prestados", c: "#7C3AED" },
            ].map(k => (
              <div key={k.t} className="bg-white rounded-2xl border border-slate-200 px-4 py-3">
                <p className="text-2xl font-bold" style={{ color: k.c }}>{k.n}</p>
                <p className="text-xs font-semibold text-slate-500">{k.t}</p>
              </div>
            ))}
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
            {[...a.enUso, ...a.reservados, ...a.libres, ...a.enTaller, ...a.fueraServicio].map(e => {
              const est = e.estado === "en_uso" ? { t: "En uso", c: "bg-orange-50 text-amber-800" }
                : e.estado === "taller" ? { t: "En taller", c: "bg-red-50 text-red-700" }
                : e.estado === "fuera_servicio" ? { t: "Fuera de servicio", c: "bg-slate-100 text-slate-600" }
                : e.reserva ? { t: "Reservado", c: "bg-blue-50 text-blue-700" }
                : { t: "Libre", c: "bg-green-50 text-green-700" };
              const detalle = e.uso
                ? `${e.uso.chofer_nombre} · desde ${e.uso.fecha && e.uso.fecha !== a.dia ? `el ${e.uso.fecha.slice(8, 10)}/${e.uso.fecha.slice(5, 7)} ` : ""}${horaChile(e.uso.inicio)}${e.uso.km_inicio != null ? ` · km ${Number(e.uso.km_inicio).toLocaleString("es-CL")}` : ""}`
                : e.reserva ? `Reservado para ${e.reserva.chofer_nombre}${e.reserva.hora_salida ? ` · ${e.reserva.hora_salida}` : ""}${e.reserva.destino ? ` · ${e.reserva.destino}` : ""}`
                : e.taller ? (e.taller.numero_ot || "En el taller")
                : e.estado === "fuera_servicio" ? "Fuera de servicio" : "Nadie lo tiene";
              return (
                <div key={e.vehiculo.id} className="px-4 py-2.5 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800 truncate">{rotuloDeFlota(e.vehiculo)}</p>
                    <p className="text-xs text-slate-500 truncate">
                      {detalle}{e.prestamo ? ` · prestado a ${e.prestamo.centro_destino}` : ""}
                    </p>
                  </div>
                  <span className={`text-[11px] font-bold rounded-full px-2.5 py-1 shrink-0 ${est.c}`}>{est.t}</span>
                  {e.uso && (
                    <button onClick={() => liberar(e.uso)}
                      className="text-[11px] font-semibold text-red-600 hover:text-red-800 shrink-0">
                      Liberar
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* ── 1. Lo de hoy ─────────────────────────────────────────────── */}
        <section>
          <h2 className="text-lg font-bold text-slate-800 mb-1">Para hoy</h2>
          <p className="text-sm text-slate-500 mb-4">
            Lo que necesita tu atención, de lo más urgente a lo menos. Cada botón te lleva a donde se resuelve.
          </p>

          {avisos.length === 0 ? (
            <div className="rounded-2xl border border-green-200 bg-green-50 px-5 py-4 flex items-center gap-3">
              <CheckCircle2 className="w-6 h-6 text-green-600 shrink-0" />
              <div>
                <p className="font-semibold text-green-900">Todo en orden hoy</p>
                <p className="text-sm text-green-800">
                  No hay nada pendiente.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              {avisos.map((a, i) => {
                const t = TONO[a.tono];
                const Icono = a.icono;
                return (
                  <div key={i} className="rounded-2xl border px-4 py-3 flex items-center gap-3 flex-wrap sm:flex-nowrap"
                    style={{ background: t.fondo, borderColor: t.borde }}>
                    <Icono className="w-5 h-5 shrink-0" style={{ color: t.icono }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold" style={{ color: t.texto }}>{a.titulo}</p>
                      {a.detalle && <p className="text-xs mt-0.5 sm:truncate" style={{ color: t.texto, opacity: 0.8 }}>{a.detalle}</p>}
                    </div>
                    <Link to={createPageUrl(a.pagina)}
                      className="shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-white"
                      style={{ background: t.boton }}>
                      {a.accion} <ChevronRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ── 2. Cómo funciona ─────────────────────────────────────────── */}
        <section>
          <h2 className="text-lg font-bold text-slate-800 mb-1">Cómo funciona la gestión de los móviles</h2>
          <p className="text-sm text-slate-500 mb-4">Quién hace qué, y los pasos para dejarlo andando.</p>

          {/* Quién hace qué */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 mb-5">
            {[
              { icono: HeartPulse, quien: "Salud", hace: "Usa las ambulancias e informa cuando algo falla" },
              { icono: LayoutDashboard, quien: "Movilización (tú)", hace: "Supervisa la flota, reserva vehículos y decide qué va al taller", destacado: true },
              { icono: Truck, quien: "Chofer", hace: "Toma el vehículo con la pauta de inicio, anota sus salidas y lo entrega" },
              { icono: Wrench, quien: "Taller", hace: "Repara lo que Movilización le deriva" },
            ].map((x, i, arr) => {
              const Icono = x.icono;
              return (
                <div key={x.quien} className="relative">
                  <div className={`h-full rounded-2xl border p-3.5 ${x.destacado ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white"}`}>
                    <Icono className={`w-5 h-5 mb-1.5 ${x.destacado ? "text-amber-700" : "text-slate-400"}`} />
                    <p className={`text-sm font-bold ${x.destacado ? "text-amber-900" : "text-slate-800"}`}>{x.quien}</p>
                    <p className="text-xs text-slate-500 mt-0.5 leading-snug">{x.hace}</p>
                  </div>
                  {i < arr.length - 1 && (
                    <ArrowRight className="hidden sm:block absolute -right-[13px] top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 z-10" />
                  )}
                </div>
              );
            })}
          </div>

          {/* Los pasos */}
          <ol className="space-y-2.5">
            {PASOS.map((p, i) => {
              const Icono = p.icono;
              const ok = hecho(p.clave);
              return (
                <li key={p.clave} className="bg-white rounded-2xl border border-slate-200 p-4 flex items-start gap-4">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-sm font-bold ${
                    ok ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-800"}`}>
                    {ok ? <CheckCircle2 className="w-5 h-5" /> : i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800 flex items-center gap-2">
                      <Icono className="w-4 h-4 text-slate-400" /> {p.titulo}
                    </p>
                    <p className="text-sm text-slate-500 mt-0.5">{p.texto}</p>
                    <p className={`text-xs font-semibold mt-1.5 ${ok ? "text-green-700" : "text-amber-700"}`}>{p.estado}</p>
                  </div>
                  <Link to={createPageUrl(p.pagina)}
                    className="shrink-0 self-center flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold border border-slate-200 text-slate-700 hover:border-amber-300 hover:text-amber-800">
                    {p.boton} <ChevronRight className="w-3.5 h-3.5" />
                  </Link>
                </li>
              );
            })}

            {/* El taller no es un paso de la puesta en marcha: es lo que pasa
                cuando algo falla. Va aparte, sin casilla de "hecho". */}
            <li className="bg-white rounded-2xl border border-dashed border-slate-300 p-4 flex items-start gap-4">
              <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 bg-slate-100 text-slate-500">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-800 flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-slate-400" /> Cuando un vehículo falla
                </p>
                <p className="text-sm text-slate-500 mt-0.5">
                  Salud lo informa desde la ficha del equipo, o el chofer lo marca en la pauta de inicio o al
                  entregarlo, y te llega a <strong>Solicitudes al Taller</strong>.
                  Tú decides: lo derivas al taller (se crea la orden de trabajo) o lo cierras sin reparación.
                  También puedes pedir una revisión tú mismo. El Jefe de Taller te propone día y hora de
                  ingreso; tú la confirmas o pides otra, y esos días quedan marcados en el Calendario.
                </p>
                <p className="text-xs font-semibold mt-1.5 text-slate-600">
                  {r.porRevisar.length ? `${plural(r.porRevisar.length, "por revisar", "por revisar")}` : "Nada por revisar"}
                  {r.enTaller.length ? ` · ${plural(r.enTaller.length, "vehículo", "vehículos")} en el taller` : ""}
                </p>
              </div>
              <Link to={createPageUrl("Movilizacion")}
                className="shrink-0 self-center flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold border border-slate-200 text-slate-700 hover:border-amber-300 hover:text-amber-800">
                Solicitudes <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </li>
          </ol>

          {/* Lo que se hace de vez en cuando */}
          <div className="mt-4 rounded-2xl bg-white border border-slate-200 p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">También puedes</p>
            <ul className="space-y-1.5 text-sm text-slate-600">
              <li className="flex items-start gap-2">
                <ArrowLeftRight className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                <span><strong>Prestar un vehículo a otro centro</strong>: en <Link className="text-amber-700 font-semibold hover:underline" to={createPageUrl("Flota")}>Vehículos</Link>, botón <em>Prestar</em> en su tarjeta. Eliges quién paga los gastos mientras dure.</span>
              </li>
              <li className="flex items-start gap-2">
                <Printer className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                <span><strong>Imprimir la programación</strong> de la semana o del mes: en <Link className="text-amber-700 font-semibold hover:underline" to={createPageUrl("Calendario")}>Calendario</Link>, botón <em>Imprimir</em>.</span>
              </li>
              <li className="flex items-start gap-2">
                <Truck className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                <span><strong>Ver la historia de un vehículo</strong> (dónde estuvo, quién lo manejó, qué reparaciones tuvo): abre su tarjeta en <Link className="text-amber-700 font-semibold hover:underline" to={createPageUrl("Flota")}>Vehículos</Link> y usa <em>Imprimir</em>.</span>
              </li>
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}
