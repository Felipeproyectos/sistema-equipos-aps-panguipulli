import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  Route, Wrench, RefreshCw, Clock, CheckCircle2, AlertTriangle, ChevronRight,
  Plus, CalendarClock, CalendarCheck, CalendarX, User,
} from "lucide-react";
import usePullToRefresh from "@/hooks/usePullToRefresh";
import OrdenTrabajoFormModal from "@/components/taller/OrdenTrabajoFormModal";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { esSolicitudDeFlota } from "@/lib/panelFlota";
import { rangosSeTocan } from "@/lib/calendarioFlota";
import {
  CITA, EVENTO, estadoCita, esperaRespuesta, estaAbierta, tramoDeCita, eventoDeAgenda,
  textoCita, casosDeMovilizacion, pesoDelCaso,
} from "@/lib/agendaTaller";
import { esVehiculo } from "@/lib/centros";
import { isSimulandoActivo } from "@/lib/roleSimulator";
import AyudaPantalla from "@/components/flota/AyudaPantalla";
import { avisarCambioEnPendientes } from "@/hooks/useContadoresMenu";

// La bandeja del Encargado de Movilización: lo que va y viene con el Taller.
//
// Por qué existe
// --------------
// Calidad ya podía pedir mantenimiento de un vehículo: `solicitud` tiene los
// tipos mantenimiento_correctivo, mantenimiento_preventivo y revision_tecnica.
// Acá llegan. El Encargado las evalúa y decide cuáles se convierten en orden
// de trabajo. La orden queda enlazada a la solicitud que la originó, para que
// Calidad pueda ver en qué terminó lo que pidió.
//
// Movilización también pide por su cuenta (una mantención por kilometraje, un
// ruido que contó el chofer). Y en los dos casos acuerda con el Taller cuándo
// entra el vehículo: el Taller propone, Movilización confirma o pide otra
// fecha. Las reglas de ese ida y vuelta están en src/lib/agendaTaller.js; la
// base de datos (migracion/21_agenda_taller.sql) no deja a Movilización tocar
// nada de la orden fuera de su respuesta.

const ETIQUETA_TIPO = {
  mantenimiento_correctivo: "Reparación",
  mantenimiento_preventivo: "Mantenimiento preventivo",
  revision_tecnica: "Revisión técnica",
  compra_repuestos: "Compra de repuestos",
  cambio_parches: "Cambio de parches",
  otros: "Otros",
};

const PESTANAS = [
  { value: "por_revisar", label: "Por revisar",    icon: AlertTriangle },
  { value: "con_taller",  label: "Con el taller",  icon: Wrench },
  { value: "cerradas",    label: "Cerradas",       icon: CheckCircle2 },
];

const COLOR_OT = {
  pendiente:   { texto: "#b45309", fondo: "#fffbeb", borde: "#fcd34d" },
  asignada:    { texto: "#1d4ed8", fondo: "#eff6ff", borde: "#93c5fd" },
  en_proceso:  { texto: "#1d4ed8", fondo: "#eff6ff", borde: "#93c5fd" },
  pausada:     { texto: "#b45309", fondo: "#fffbeb", borde: "#fcd34d" },
  en_revision: { texto: "#6d28d9", fondo: "#f5f3ff", borde: "#c4b5fd" },
  completada:  { texto: "#15803d", fondo: "#f0fdf4", borde: "#86efac" },
  cancelada:   { texto: "#64748b", fondo: "#f8fafc", borde: "#cbd5e1" },
};

const ETIQUETA_OT = {
  pendiente: "En la fila del taller",
  asignada: "Mecánico asignado",
  en_proceso: "En reparación",
  pausada: "Pausada",
  en_revision: "En revisión final",
  completada: "Terminada",
  cancelada: "Cancelada",
};

function cuando(fecha) {
  if (!fecha) return "";
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return "";
  const dias = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (dias <= 0) return "hoy";
  if (dias === 1) return "ayer";
  if (dias < 31) return `hace ${dias} días`;
  return d.toLocaleDateString("es-CL");
}

export default function Movilizacion() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [solicitudes, setSolicitudes] = useState([]);
  const [ordenes, setOrdenes] = useState([]);
  const [equipos, setEquipos] = useState([]);
  const [asignaciones, setAsignaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pestana, setPestana] = useState(null);
  const [formulario, setFormulario] = useState(null);
  const [ocupado, setOcupado] = useState(null);
  const [pidiendoOtra, setPidiendoOtra] = useState(null);
  const containerRef = useRef(null);

  const soloLectura = isSimulandoActivo();

  const cargar = useCallback(async () => {
    const [sols, ots, eqs, asigs] = await Promise.all([
      base44.entities.Solicitud.list("-created_date", 500).catch(() => []),
      base44.entities.OrdenTrabajo.list("-created_date", 500).catch(() => []),
      base44.entities.Equipo.list("-updated_date", 500).catch(() => []),
      base44.entities.AsignacionChofer.filter({ estado: "activa" }, "-desde", 1000).catch(() => []),
    ]);
    setSolicitudes(sols);
    setOrdenes(ots);
    setEquipos(eqs);
    setAsignaciones(asigs);
  }, []);

  useEffect(() => { cargar().finally(() => setLoading(false)); }, [cargar]);
  const { refreshing } = usePullToRefresh(cargar, containerRef);

  const porId = useMemo(() => new Map(equipos.map(e => [e.id, e])), [equipos]);
  const vehiculos = useMemo(() => equipos.filter(e => esVehiculo(e.tipo)), [equipos]);

  const casos = useMemo(() => {
    const mias = solicitudes.filter(s => esSolicitudDeFlota(s, porId.get(s.equipo_id)));
    return casosDeMovilizacion({ solicitudes: mias, ordenes });
  }, [solicitudes, ordenes, porId]);

  const cuenta = (etapa) => casos.filter(c => c.etapa === etapa).length;
  const esperanTuRespuesta = casos.filter(c => esperaRespuesta(c.ot)).length;

  // Se abre donde hay algo que hacer: primero lo que espera tu respuesta.
  // Se decide una vez, al cargar: después la pestaña no salta sola mientras
  // la persona responde.
  const pestanaActiva = pestana
    || (esperanTuRespuesta ? "con_taller" : cuenta("por_revisar") ? "por_revisar" : "con_taller");
  useEffect(() => {
    if (!loading && pestana === null) setPestana(pestanaActiva);
  }, [loading, pestana, pestanaActiva]);

  const visibles = casos
    .filter(c => c.etapa === pestanaActiva)
    .sort((a, b) => (pestanaActiva === "con_taller" ? pesoDelCaso(a) - pesoDelCaso(b) : 0));

  // ── Pedir al taller ────────────────────────────────────────────────
  const semillaDeVehiculo = (eq) => ({
    equipo_id: eq.id,
    equipo_label: `${eq.marca} ${eq.modelo}${eq.patente ? ` · ${eq.patente}` : ""}`,
    patente: eq.patente || "",
    marca_modelo: `${eq.marca} ${eq.modelo}`,
    tipo_activo: eq.tipo === "ambulancia" ? "salud" : "corporativo",
  });

  const abrirDerivacion = (s) => {
    const eq = porId.get(s.equipo_id);
    setFormulario({
      solicitud: s,
      semilla: {
        solicitud_id: s.id,
        origen: "movilizacion",
        // Sin ficha del vehículo se escribe a mano, como antes.
        ...(eq ? semillaDeVehiculo(eq) : { tipo_activo: "corporativo" }),
        problema_reportado: [ETIQUETA_TIPO[s.tipo] || s.tipo, s.observaciones].filter(Boolean).join(" — "),
        prioridad: s.tipo === "mantenimiento_correctivo" ? "alta" : "media",
      },
    });
  };

  const abrirPedidoPropio = () => {
    setFormulario({ solicitud: null, semilla: { origen: "movilizacion", tipo_activo: "salud" } });
  };

  // La orden quedó creada: si venía de Salud, la solicitud pasa a "en taller".
  const alGuardarPedido = async () => {
    const s = formulario?.solicitud;
    setFormulario(null);
    if (s && (s.estado || "pendiente") === "pendiente") {
      await base44.entities.Solicitud.update(s.id, {
        estado: "en_proceso",
        respuesta_admin: [s.respuesta_admin, `Derivada al taller por ${user?.full_name || user?.email}`]
          .filter(Boolean).join("\n"),
      }).catch(() => {});
    }
    setPestana("con_taller");
    await cargar();
    avisarCambioEnPendientes();
  };

  // ── Responder al taller ────────────────────────────────────────────
  // Solo se mandan los campos de la respuesta: la base rechaza cualquier otro.
  const responder = async (ot, cambios, evento, notas) => {
    setOcupado(ot.id);
    try {
      await base44.entities.OrdenTrabajo.update(ot.id, {
        ...cambios,
        linea_tiempo: [...(ot.linea_tiempo || []), eventoDeAgenda(user, evento, notas)],
      });
      setPidiendoOtra(null);
      await cargar();
      avisarCambioEnPendientes();
    } catch (e) {
      toast({ title: "No se pudo guardar la respuesta", description: e.message, variant: "destructive" });
    } finally {
      setOcupado(null);
    }
  };

  const confirmar = (ot) => responder(ot, { cita_estado: "confirmada" },
    EVENTO.confirma, textoCita(ot.cita_fecha));

  const pedirOtraFecha = () => {
    const { ot, motivo, desde } = pidiendoOtra;
    if (!motivo.trim()) {
      toast({ title: "Cuéntale al taller por qué no sirve esa fecha", variant: "destructive" });
      return;
    }
    const nota = [motivo.trim(), desde ? `Puedo llevarlo desde el ${textoCita(desde, false)}.` : ""].filter(Boolean).join(" ");
    responder(ot, { cita_estado: "reagendar", cita_nota: nota, ...(desde ? { fecha_preferida: desde } : {}) },
      EVENTO.pideOtra, nota);
  };

  const cerrarSolicitud = async (s, texto) => {
    setOcupado(s.id);
    try {
      await base44.entities.Solicitud.update(s.id, {
        estado: "finalizada",
        ...(texto ? { respuesta_admin: [s.respuesta_admin, texto].filter(Boolean).join("\n") } : {}),
      });
      await cargar();
      avisarCambioEnPendientes();
    } catch (e) {
      toast({ title: "No se pudo cerrar", description: e.message, variant: "destructive" });
    } finally {
      setOcupado(null);
    }
  };

  // Quién tiene el vehículo en el calendario esos días.
  const choferesEnLaCita = (ot) => {
    const t = tramoDeCita(ot);
    if (!t || !ot.equipo_id) return [];
    return asignaciones.filter(a => a.equipo_id === ot.equipo_id && a.estado === "activa"
      && rangosSeTocan(a.desde, a.hasta, t.desde, t.hasta));
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div ref={containerRef} className="min-h-screen bg-slate-50" style={{ overscrollBehavior: "none" }}>
      {refreshing && (
        <div className="flex items-center justify-center py-3 lg:hidden">
          <RefreshCw className="w-5 h-5 text-amber-500 animate-spin" />
        </div>
      )}

      <div className="relative overflow-hidden px-4 lg:px-10 pt-6 lg:pt-12 pb-6 lg:pb-8"
        style={{ background: "linear-gradient(135deg, #451a03 0%, #92400e 45%, #d97706 100%)" }}>
        <div className="relative max-w-5xl mx-auto flex items-center gap-3 flex-wrap">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
            style={{ background: "rgba(255,255,255,0.2)" }}>
            <Route className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-amber-200 text-xs font-semibold uppercase tracking-widest">Flota</p>
            <h1 className="text-2xl lg:text-3xl font-bold text-white">Solicitudes al Taller</h1>
            <p className="text-amber-100 text-sm mt-0.5">
              {cuenta("por_revisar")} por revisar
              {esperanTuRespuesta > 0 && <> · <strong className="text-white">{esperanTuRespuesta} esperan tu respuesta</strong></>}
              {" "}· {cuenta("con_taller")} con el taller
            </p>
          </div>
          {!soloLectura && (
            <button onClick={abrirPedidoPropio}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-amber-900 bg-white hover:bg-amber-50">
              <Plus className="w-4 h-4" /> Pedir revisión
            </button>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 lg:px-10 pt-5 pb-10">
        <AyudaPantalla clave="solicitudes-agenda">
          <strong>1.</strong> Lo que pide Salud llega a <em>Por revisar</em>: <strong>Derivar al taller</strong> o
          {" "}<strong>Cerrar sin taller</strong>. También puedes <strong>Pedir revisión</strong> tú mismo.
          {" "}<strong>2.</strong> El Jefe de Taller te <strong>propone día y hora</strong> de ingreso y cuándo lo
          devuelve. <strong>3.</strong> En <em>Con el taller</em> la <strong>confirmas</strong> o
          {" "}<strong>pides otra fecha</strong>. Esos días quedan marcados en el Calendario.
        </AyudaPantalla>

        <div className="flex gap-2 mb-5 overflow-x-auto">
          {PESTANAS.map(p => {
            const Icono = p.icon;
            const activa = pestanaActiva === p.value;
            const avisa = p.value === "con_taller" && esperanTuRespuesta > 0;
            return (
              <button key={p.value} onClick={() => setPestana(p.value)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap border transition-colors ${
                  activa ? "bg-amber-700 text-white border-amber-700" : "bg-white text-slate-600 border-slate-200 hover:border-amber-300"}`}>
                <Icono className="w-4 h-4" />
                {p.label}
                <span className={activa ? "text-amber-200" : "text-slate-400"}>{cuenta(p.value)}</span>
                {avisa && <span className="w-2 h-2 rounded-full bg-blue-500" title="Hay fechas esperando tu respuesta" />}
              </button>
            );
          })}
        </div>

        {visibles.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
            <Route className="w-12 h-12 mx-auto text-slate-200 mb-3" />
            <p className="text-slate-500 font-medium">
              {pestanaActiva === "por_revisar"
                ? "No hay solicitudes de Salud esperando revisión."
                : pestanaActiva === "con_taller"
                  ? "No hay nada pendiente con el taller."
                  : "Todavía no se cierra nada."}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {visibles.map(caso => {
              const { solicitud: s, ot } = caso;
              const eq = porId.get(ot?.equipo_id || s?.equipo_id);
              const colorOT = ot ? (COLOR_OT[ot.estado] || COLOR_OT.pendiente) : null;
              const cita = estadoCita(ot);
              const enAgenda = estaAbierta(ot) && !ot.fecha_inicio && cita;
              const idOcupado = ot?.id || s?.id;
              const choferes = cita === "propuesta" || cita === "confirmada" ? choferesEnLaCita(ot) : [];
              const formOtra = pidiendoOtra && pidiendoOtra.ot.id === ot?.id ? pidiendoOtra : null;

              return (
                <div key={caso.id} className="bg-white rounded-2xl border border-slate-200 p-5"
                  style={cita === "propuesta" && enAgenda ? { borderColor: CITA.propuesta.borde, boxShadow: "0 0 0 3px #dbeafe" } : undefined}>
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="min-w-0">
                      <p className="font-bold text-slate-800">
                        {eq ? `${eq.marca} ${eq.modelo}` : (ot?.marca_modelo || ot?.equipo_label || "Vehículo sin ficha")}
                        {(eq?.patente || ot?.patente) && <span className="text-slate-400 font-medium"> · {eq?.patente || ot?.patente}</span>}
                      </p>
                      <p className="text-sm text-slate-500 mt-0.5">
                        {s
                          ? <>Pedido por Salud · {ETIQUETA_TIPO[s.tipo] || s.tipo}{s.centro && <> · {s.centro}</>}</>
                          : <>Pedido por Movilización</>}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-slate-400 flex items-center gap-1 justify-end">
                        <Clock className="w-3 h-3" /> {cuando(s?.created_date || s?.fecha || ot?.created_date)}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {s ? (s.usuario_nombre || s.usuario_email) : (ot?.reportado_por_nombre || ot?.reportado_por_email)}
                      </p>
                    </div>
                  </div>

                  {(s?.observaciones || (!s && ot?.problema_reportado)) && (
                    <p className="text-sm text-slate-600 mt-3 bg-slate-50 rounded-xl p-3 whitespace-pre-line">
                      {s?.observaciones || ot.problema_reportado}
                    </p>
                  )}

                  {ot && (
                    <div className="flex items-center gap-2 mt-3 text-sm flex-wrap">
                      <Wrench className="w-4 h-4 text-slate-400" />
                      <span className="text-slate-600 font-medium">{ot.numero_ot}</span>
                      <span className="px-2 py-0.5 rounded-lg text-xs font-semibold border"
                        style={{ color: colorOT.texto, background: colorOT.fondo, borderColor: colorOT.borde }}>
                        {ETIQUETA_OT[ot.estado] || ot.estado?.replace(/_/g, " ")}
                      </span>
                      {ot.mecanico_nombre && (
                        <span className="text-xs text-slate-500 flex items-center gap-1">
                          <User className="w-3 h-3" /> {ot.mecanico_nombre}
                        </span>
                      )}
                    </div>
                  )}

                  {/* ── La agenda con el taller ── */}
                  {enAgenda && cita === "por_agendar" && (
                    <div className="mt-3 rounded-xl border px-4 py-3 text-sm flex items-start gap-2"
                      style={{ background: CITA.por_agendar.fondo, borderColor: CITA.por_agendar.borde, color: CITA.por_agendar.color }}>
                      <CalendarClock className="w-4 h-4 mt-0.5 shrink-0" />
                      <span>
                        Esperando que el taller proponga fecha de ingreso.
                        {ot.fecha_preferida && <> Dijiste que puedes llevarlo desde el <strong>{textoCita(ot.fecha_preferida, false)}</strong>.</>}
                      </span>
                    </div>
                  )}

                  {enAgenda && cita === "reagendar" && (
                    <div className="mt-3 rounded-xl border px-4 py-3 text-sm flex items-start gap-2"
                      style={{ background: CITA.reagendar.fondo, borderColor: CITA.reagendar.borde, color: CITA.reagendar.color }}>
                      <CalendarX className="w-4 h-4 mt-0.5 shrink-0" />
                      <span>
                        Pediste otra fecha{ot.cita_nota && <>: “{ot.cita_nota}”</>}. Esperando nueva propuesta del taller.
                      </span>
                    </div>
                  )}

                  {enAgenda && (cita === "propuesta" || cita === "confirmada") && (
                    <div className="mt-3 rounded-xl border px-4 py-3 text-sm"
                      style={{ background: CITA[cita].fondo, borderColor: CITA[cita].borde, color: CITA[cita].color }}>
                      <p className="flex items-start gap-2">
                        {cita === "propuesta" ? <CalendarClock className="w-4 h-4 mt-0.5 shrink-0" /> : <CalendarCheck className="w-4 h-4 mt-0.5 shrink-0" />}
                        <span>
                          {cita === "propuesta" ? "El taller propone: " : "Confirmado: "}
                          llevarlo el <strong>{textoCita(ot.cita_fecha)}</strong>
                          {ot.cita_entrega && <> · vuelve el <strong>{textoCita(ot.cita_entrega, false)}</strong></>}
                        </span>
                      </p>
                      {ot.cita_nota && cita === "propuesta" && (
                        <p className="mt-1 ml-6 text-slate-600">“{ot.cita_nota}”</p>
                      )}
                      {choferes.length > 0 && (
                        <p className="mt-2 ml-6 text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                          Esos días {choferes.map(a => a.chofer_nombre || "alguien").join(" y ")}{" "}
                          {choferes.length === 1 ? "tiene" : "tienen"} este vehículo en el calendario.
                          {cita === "propuesta" ? " Si confirmas, ajusta la programación en " : " Ajusta la programación en "}
                          <Link to={createPageUrl("Calendario")} className="underline font-semibold">Calendario</Link>.
                        </p>
                      )}

                      {!soloLectura && !formOtra && (
                        <div className="flex gap-2 mt-3 ml-6 flex-wrap">
                          {cita === "propuesta" && (
                            <button onClick={() => confirmar(ot)} disabled={ocupado === ot.id}
                              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-green-700 hover:bg-green-800 disabled:opacity-60">
                              <CalendarCheck className="w-4 h-4" /> {ocupado === ot.id ? "Guardando..." : "Confirmar fecha"}
                            </button>
                          )}
                          <button onClick={() => setPidiendoOtra({ ot, motivo: "", desde: "" })}
                            className="px-4 py-2 rounded-xl text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50">
                            Pedir otra fecha
                          </button>
                        </div>
                      )}

                      {formOtra && (
                        <div className="mt-3 ml-6 space-y-2 text-slate-700">
                          <textarea rows={2} value={formOtra.motivo} autoFocus
                            onChange={e => setPidiendoOtra(p => ({ ...p, motivo: e.target.value }))}
                            placeholder="¿Por qué no sirve? Ej: ese día tiene ronda rural en Liquiñe"
                            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm resize-none bg-white" />
                          <label className="text-xs text-slate-500 flex items-center gap-2 flex-wrap">
                            Puedo llevarlo desde
                            <input type="date" value={formOtra.desde}
                              min={new Date().toISOString().split("T")[0]}
                              onChange={e => setPidiendoOtra(p => ({ ...p, desde: e.target.value }))}
                              className="border border-slate-200 rounded-lg px-2 py-1 text-sm bg-white" />
                            <span className="text-slate-400">(opcional)</span>
                          </label>
                          <div className="flex gap-2">
                            <button onClick={pedirOtraFecha} disabled={ocupado === ot.id}
                              className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-amber-700 hover:bg-amber-800 disabled:opacity-60">
                              {ocupado === ot.id ? "Enviando..." : "Enviar al taller"}
                            </button>
                            <button onClick={() => setPidiendoOtra(null)}
                              className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 bg-white border border-slate-200">
                              Cancelar
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Ya en el taller ── */}
                  {estaAbierta(ot) && ot.fecha_inicio && (
                    <p className="mt-3 text-sm text-slate-600 flex items-center gap-2">
                      <Wrench className="w-4 h-4 text-blue-500" />
                      En el taller desde el {textoCita(ot.fecha_inicio, false)}
                      {ot.cita_entrega && <> · entrega estimada {textoCita(ot.cita_entrega, false)}</>}
                    </p>
                  )}
                  {ot?.diagnostico && (
                    <p className="mt-2 text-sm text-slate-600"><span className="text-slate-400">Diagnóstico:</span> {ot.diagnostico}</p>
                  )}

                  {/* ── Terminado ── */}
                  {ot?.estado === "completada" && (
                    <div className="mt-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
                      <p className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4" />
                        El taller terminó{ot.fecha_fin && <> el {textoCita(ot.fecha_fin, false)}</>}. Ya puedes retirar el vehículo.
                      </p>
                      {ot.notas_cierre && <p className="mt-1 ml-6 text-green-800">{ot.notas_cierre}</p>}
                      {s && (s.estado || "pendiente") !== "finalizada" && !soloLectura && (
                        <button
                          onClick={() => cerrarSolicitud(s, `Reparado en el taller (${ot.numero_ot})${ot.notas_cierre ? `: ${ot.notas_cierre}` : ""}`)}
                          disabled={ocupado === s.id}
                          className="mt-3 ml-6 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-green-700 hover:bg-green-800 disabled:opacity-60">
                          {ocupado === s.id ? "Cerrando..." : "Cerrar y avisar a Salud"}
                        </button>
                      )}
                    </div>
                  )}

                  {/* ── Lo que pidió Salud y nadie decidió ── */}
                  {!soloLectura && s && !ot && (s.estado || "pendiente") !== "finalizada" && (
                    <div className="flex gap-2 mt-4 flex-wrap">
                      <button onClick={() => abrirDerivacion(s)}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-amber-700 hover:bg-amber-800">
                        <Wrench className="w-4 h-4" /> Derivar al taller
                        <ChevronRight className="w-4 h-4" />
                      </button>
                      <button onClick={() => cerrarSolicitud(s)} disabled={ocupado === idOcupado}
                        className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 disabled:opacity-60">
                        {ocupado === idOcupado ? "Cerrando..." : "Cerrar sin taller"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <OrdenTrabajoFormModal
        open={!!formulario}
        onClose={() => setFormulario(null)}
        onGuardar={alGuardarPedido}
        equipos={vehiculos}
        editando={null}
        semilla={formulario?.semilla}
        user={user}
      />
    </div>
  );
}
