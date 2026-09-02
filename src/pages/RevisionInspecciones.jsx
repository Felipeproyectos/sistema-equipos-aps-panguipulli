import { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/lib/AuthContext";
import { ROLES } from "@/lib/roles";

// Devuelve la lista de centros que el usuario puede ver, o null si ve todos.
function centrosPermitidos(user) {
  if (!user) return null;
  if ([ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.MONITOR_CORPORATIVO].includes(user.role)) return null;
  const set = new Set();
  if (user.centro_principal) set.add(user.centro_principal);
  (user.centros_asignados || []).forEach(c => set.add(c));
  return set.size ? [...set] : null;
}

function centroDeInspeccion(insp) {
  try {
    const datos = insp.datos_json ? JSON.parse(insp.datos_json) : {};
    return datos.equipo?.centro_principal || "";
  } catch { return ""; }
}
import {
  CheckCircle, XCircle, ChevronDown, ChevronUp, ClipboardCheck, Car, MapPin, User, Calendar,
  Fuel, Gauge, Zap, Wrench, Package, FileText, AlertCircle
} from "lucide-react";

const TIPO_LABEL = {
  inspeccion_semanal: "Pauta Semanal",
  turno_chofer: "Turno Chofer",
  inspeccion_diaria: "Pauta Diaria",
  inspeccion_anual: "Pauta Anual",
};

const TIPO_EQUIPO_LABEL = {
  ambulancia: "Ambulancia",
  dea: "DEA",
  monitor_desfibrilador: "Monitor Desfibrilador",
  monitor_multiparametros: "Monitor Multiparámetros",
};

const ESTADO_CFG = {
  pendiente: { label: "Pendiente", color: "#D97706", bg: "#FFFBEB", border: "#FDE68A" },
  aprobado: { label: "Aprobado", color: "#16A34A", bg: "#F0FDF4", border: "#BBF7D0" },
  rechazado: { label: "Rechazado", color: "#DC2626", bg: "#FEF2F2", border: "#FECACA" },
};

function formatFecha(fechaStr) {
  if (!fechaStr) return "-";
  const [y, m, d] = fechaStr.split("-");
  return `${d}/${m}/${y}`;
}

function formatHora(isoStr) {
  if (!isoStr) return "-";
  const d = new Date(isoStr);
  return d.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
}

function ChecklistDetail({ titulo, icon: Icon, color, data }) {
  if (!data) return null;
  const items = Object.entries(data);
  const malos = items.filter(([, v]) => v?.estado === "malo");
  const buenos = items.filter(([, v]) => v?.estado === "bueno");

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #E2E8F0" }}>
      <div className="flex items-center gap-2 px-4 py-2.5" style={{ background: `${color}12` }}>
        <Icon className="w-4 h-4" style={{ color }} />
        <span className="text-xs font-bold" style={{ color }}>{titulo}</span>
        <span className="ml-auto text-xs text-slate-400">{buenos.length}/{items.length} OK</span>
        {malos.length > 0 && (
          <span className="text-xs font-bold px-1.5 py-0.5 rounded-full" style={{ background: "#FEF2F2", color: "#DC2626" }}>
            {malos.length} falla{malos.length > 1 ? "s" : ""}
          </span>
        )}
      </div>
      {malos.length > 0 && (
        <div className="px-4 py-2 space-y-1.5">
          {malos.map(([item, v]) => (
            <div key={item} className="flex items-start gap-2 text-xs">
              <span className="text-red-400 mt-0.5 flex-shrink-0">✗</span>
              <div>
                <span className="font-semibold text-red-700">{item}</span>
                {v.obs && <span className="text-red-500"> — {v.obs}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
      {malos.length === 0 && (
        <div className="px-4 py-2">
          <span className="text-xs text-green-600 flex items-center gap-1">
            <CheckCircle className="w-3.5 h-3.5" /> Todo en buen estado
          </span>
        </div>
      )}
    </div>
  );
}

// Componente para checklist diaria (usa "correcto"/"incorrecto" en lugar de "bueno"/"malo")
function ChecklistDiarioDetail({ titulo, color, data }) {
  if (!data) return null;
  const items = Object.entries(data);
  const incorrectos = items.filter(([, v]) => v?.estado === "incorrecto");
  const correctos = items.filter(([, v]) => v?.estado === "correcto");

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #E2E8F0" }}>
      <div className="flex items-center gap-2 px-4 py-2.5" style={{ background: `${color}12` }}>
        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
        <span className="text-xs font-bold" style={{ color }}>{titulo}</span>
        <span className="ml-auto text-xs text-slate-400">{correctos.length}/{items.length} OK</span>
        {incorrectos.length > 0 && (
          <span className="text-xs font-bold px-1.5 py-0.5 rounded-full" style={{ background: "#FEF2F2", color: "#DC2626" }}>
            {incorrectos.length} falla{incorrectos.length > 1 ? "s" : ""}
          </span>
        )}
      </div>
      {incorrectos.length > 0 ? (
        <div className="px-4 py-2 space-y-1.5">
          {incorrectos.map(([item, v]) => (
            <div key={item} className="flex items-start gap-2 text-xs">
              <span className="text-red-400 mt-0.5 flex-shrink-0">✗</span>
              <div>
                <span className="font-semibold text-red-700">{item}</span>
                {v.obs && <span className="text-red-500"> — {v.obs}</span>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="px-4 py-2">
          <span className="text-xs text-green-600 flex items-center gap-1">
            <CheckCircle className="w-3.5 h-3.5" /> Todo correcto
          </span>
        </div>
      )}
    </div>
  );
}

function DanosDetail({ danos }) {
  if (!danos) return null;
  const lista = Object.entries(danos).filter(([, v]) => v?.marcado);
  if (lista.length === 0) return (
    <div className="rounded-xl px-4 py-3 text-xs text-green-700 flex items-center gap-2"
      style={{ background: "#F0FDF4", border: "1px solid #BBF7D0" }}>
      <CheckCircle className="w-4 h-4" /> Sin daños visuales reportados
    </div>
  );
  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #FECACA" }}>
      <div className="flex items-center gap-2 px-4 py-2.5" style={{ background: "#FFF5F5" }}>
        <AlertCircle className="w-4 h-4 text-red-500" />
        <span className="text-xs font-bold text-red-600">Daños Visuales ({lista.length})</span>
      </div>
      <div className="px-4 py-2 space-y-2">
        {lista.map(([zoneId, v]) => (
          <div key={zoneId} className="flex items-start gap-3">
            {v.foto_url && (
              <img src={v.foto_url} alt="daño" className="w-14 h-14 object-cover rounded-lg flex-shrink-0" />
            )}
            <div>
              <p className="text-xs font-bold text-red-700">{zoneId.replace(/_/g, " ")}</p>
              <p className="text-xs text-slate-600">{v.descripcion}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function InspeccionCard({ insp, onActualizar }) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [nota, setNota] = useState("");
  const [processing, setProcessing] = useState(false);

  const estado = ESTADO_CFG[insp.estado] || ESTADO_CFG.pendiente;
  const hasFallas = insp.observaciones?.includes("Fallas:") || insp.observaciones?.includes("Daños");

  // Parsear datos_json
  const datos = (() => {
    try { return insp.datos_json ? JSON.parse(insp.datos_json) : {}; } catch { return {}; }
  })();

  const equipo = datos.equipo || {};
  const horaRegistro = datos.hora_registro;

  const handleAccion = async (accion) => {
    setProcessing(true);
    try {
      const res = await base44.functions.invoke("aprobarInspeccion", {
        inspeccion_id: insp.id,
        accion,
        nota,
      });
      const data = res.data || res;
      if (accion === "aprobar" && data?.ot_creada) {
        toast({
          title: "Orden de Trabajo creada automáticamente",
          description: `${data.ot_creada.numero_ot} — ${data.ot_creada.fallas} falla(s) detectada(s). Prioridad: ${data.ot_creada.prioridad}.`,
          variant: "default",
        });
      } else if (accion === "aprobar") {
        toast({ title: "Inspección aprobada", description: "Sin fallas — no se requiere orden de trabajo." });
      } else {
        toast({ title: "Inspección rechazada", description: nota || "Se notificó al conductor." });
      }
    } catch (err) {
      toast({ title: "Error", description: err.message || "No se pudo procesar", variant: "destructive" });
    }
    setProcessing(false);
    onActualizar();
  };

  return (
    <div className="bg-white rounded-2xl overflow-hidden" style={{ border: `1px solid ${estado.border}`, boxShadow: "0 1px 6px rgba(0,0,0,0.06)" }}>

      {/* Header */}
      <div className="p-4 cursor-pointer" onClick={() => setExpanded(e => !e)}>
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: estado.bg }}>
            <ClipboardCheck className="w-5 h-5" style={{ color: estado.color }} />
          </div>
          <div className="flex-1 min-w-0">
            {/* Título y estado */}
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <p className="font-bold text-slate-800">{TIPO_LABEL[insp.tipo_formulario] || insp.tipo_formulario}</p>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                style={{ background: estado.bg, color: estado.color }}>
                {estado.label}
              </span>
              {hasFallas && (
                <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "#FEF2F2", color: "#DC2626" }}>
                  ⚠ Con fallas
                </span>
              )}
            </div>

            {/* Tipo y nombre del equipo */}
            <div className="flex items-center gap-1.5 mb-1">
              <Car className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
              <span className="text-sm font-semibold text-blue-700">
                {equipo.tipo ? TIPO_EQUIPO_LABEL[equipo.tipo] || equipo.tipo : "Equipo"}
                {" · "}
                {insp.equipo_label || insp.equipo_id}
                {equipo.patente && <span className="font-normal text-blue-500"> ({equipo.patente})</span>}
              </span>
            </div>

            {/* Centro */}
            {(equipo.centro_principal || equipo.subsede) && (
              <div className="flex items-center gap-1.5 mb-1">
                <MapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                <span className="text-xs text-slate-600">
                  {equipo.centro_principal}
                  {equipo.subsede && ` · ${equipo.subsede}`}
                </span>
              </div>
            )}

            {/* Conductor, Fecha y Hora */}
            <div className="flex flex-wrap gap-x-4 gap-y-0.5">
              {insp.conductor && (
                <div className="flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-xs text-slate-600">{insp.conductor}</span>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-xs text-slate-600">
                  {formatFecha(insp.fecha)}
                  {horaRegistro && ` · ${formatHora(horaRegistro)}`}
                </span>
              </div>
              {insp.km_inicial && (
                <div className="flex items-center gap-1.5">
                  <Gauge className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-xs text-slate-600">KM {Number(insp.km_inicial).toLocaleString()}</span>
                </div>
              )}
              {insp.combustible && (
                <div className="flex items-center gap-1.5">
                  <Fuel className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-xs text-slate-600">{insp.combustible}</span>
                </div>
              )}
            </div>

            {/* Revisor — visible sin expandir */}
            {insp.estado !== "pendiente" && (insp.revisor_nombre || insp.revisor_email) && (
              <div className="flex items-center gap-1.5 mt-2 px-2.5 py-1.5 rounded-lg w-fit"
                style={{
                  background: insp.estado === "aprobado" ? "#F0FDF4" : "#FEF2F2",
                  border: `1px solid ${insp.estado === "aprobado" ? "#BBF7D0" : "#FECACA"}`
                }}>
                <User className="w-3 h-3 flex-shrink-0" style={{ color: insp.estado === "aprobado" ? "#16A34A" : "#DC2626" }} />
                <span className="text-xs font-semibold" style={{ color: insp.estado === "aprobado" ? "#15803D" : "#DC2626" }}>
                  {insp.estado === "aprobado" ? "Aprobado" : "Rechazado"} por {insp.revisor_nombre || insp.revisor_email}
                </span>
                {insp.fecha_revision && (
                  <span className="text-xs" style={{ color: insp.estado === "aprobado" ? "#86EFAC" : "#FECACA" }}>
                    · {formatFecha(insp.fecha_revision)}
                  </span>
                )}
              </div>
            )}
          </div>
          <button className="text-slate-400 hover:text-slate-600 flex-shrink-0 mt-1">
            {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Detalle expandido */}
      {expanded && (
        <div className="border-t border-slate-100 p-4 space-y-3" style={{ background: "#FAFBFC" }}>

          {/* Info del equipo */}
          {equipo.centro_principal && (
            <div className="p-3 rounded-xl text-xs space-y-1" style={{ background: "#EFF6FF", border: "1px solid #BFDBFE" }}>
              <p className="font-bold text-blue-700 mb-1.5 flex items-center gap-1.5">
                <Car className="w-3.5 h-3.5" /> Información del Equipo
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-slate-700">
                <span><span className="font-semibold">Tipo:</span> {TIPO_EQUIPO_LABEL[equipo.tipo] || equipo.tipo || "-"}</span>
                <span><span className="font-semibold">Inventario:</span> {equipo.numero_inventario || "-"}</span>
                <span><span className="font-semibold">Marca/Modelo:</span> {equipo.marca} {equipo.modelo}</span>
                {equipo.patente && <span><span className="font-semibold">Patente:</span> {equipo.patente}</span>}
                <span className="col-span-2"><span className="font-semibold">Centro:</span> {equipo.centro_principal}{equipo.subsede ? ` · ${equipo.subsede}` : ""}</span>
              </div>
            </div>
          )}

          {/* Checklists de la pauta semanal */}
          {insp.tipo_formulario === "inspeccion_semanal" && (
            <div className="space-y-2">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Revisión de Ítems</p>
              <ChecklistDetail titulo="Luces" icon={Zap} color="#F59E0B" data={datos.luces} />
              <ChecklistDetail titulo="Motor" icon={Wrench} color="#2563EB" data={datos.motor} />
              <ChecklistDetail titulo="Accesorios" icon={Package} color="#7C3AED" data={datos.accesorios} />
              <ChecklistDetail titulo="Documentos" icon={FileText} color="#059669" data={datos.documentos} />
              <DanosDetail danos={datos.danos} />
            </div>
          )}

          {/* Checklist de la pauta diaria */}
          {insp.tipo_formulario === "inspeccion_diaria" && (
            <div className="space-y-2">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Revisión de Ítems</p>
              <ChecklistDiarioDetail titulo="1. Revisión Exterior" color="#2563EB" data={datos.exterior} />
              <ChecklistDiarioDetail titulo="2. Revisión Interior" color="#7C3AED" data={datos.interior} />
              <ChecklistDiarioDetail titulo="3. Equipos Médicos" color="#059669" data={datos.equipo_medico} />
              <ChecklistDiarioDetail titulo="4. Accesorios" color="#D97706" data={datos.accesorios_diaria} />
              <ChecklistDiarioDetail titulo="5. Limpieza Básica" color="#0891B2" data={datos.saneamiento} />
              <ChecklistDiarioDetail titulo="6. Documentación" color="#DC2626" data={datos.documentacion} />
              {(datos.problemasDetectados || datos.accionesTomadas) && (
                <div className="rounded-xl p-3 space-y-1.5" style={{ background: "#FFFBEB", border: "1px solid #FDE68A" }}>
                  <p className="text-xs font-bold text-amber-700">Observaciones Generales</p>
                  {datos.problemasDetectados && (
                    <p className="text-xs text-slate-700"><span className="font-semibold">Problemas:</span> {datos.problemasDetectados}</p>
                  )}
                  {datos.accionesTomadas && (
                    <p className="text-xs text-slate-700"><span className="font-semibold">Acciones tomadas:</span> {datos.accionesTomadas}</p>
                  )}
                </div>
              )}
              {!datos.exterior && insp.observaciones && (
                <div className="p-3 rounded-xl text-xs text-slate-700 bg-white" style={{ border: "1px solid #E2E8F0" }}>
                  {insp.observaciones}
                </div>
              )}
            </div>
          )}

          {/* Para turno chofer: observaciones */}
          {insp.tipo_formulario === "turno_chofer" && insp.observaciones && (
            <div className="space-y-1.5">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Observaciones</p>
              <div className="p-3 rounded-xl text-xs text-slate-700 bg-white" style={{ border: "1px solid #E2E8F0" }}>
                {insp.observaciones}
              </div>
            </div>
          )}

          {/* Nota del revisor (ya revisado) */}
          {insp.estado !== "pendiente" && (
            <div className="p-3 rounded-xl text-sm" style={{ background: estado.bg, border: `1px solid ${estado.border}` }}>
              <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: estado.color }}>
                {insp.estado === "aprobado" ? "✓ Aprobado" : "✗ Rechazado"} por {insp.revisor_nombre || insp.revisor_email}
                {insp.fecha_revision && ` · ${formatFecha(insp.fecha_revision)}`}
              </p>
              {insp.nota_revision && <p className="text-xs" style={{ color: estado.color }}>{insp.nota_revision}</p>}
            </div>
          )}

          {/* Acciones (solo pendientes) */}
          {insp.estado === "pendiente" && (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">Nota al conductor (opcional)</label>
                <textarea rows={2} placeholder="Ej: KM no coincide con el anterior registro..."
                  value={nota} onChange={e => setNota(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none" />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleAccion("rechazar")}
                  disabled={processing}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                  style={{ background: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA" }}>
                  <XCircle className="w-4 h-4" /> Rechazar
                </button>
                <button
                  onClick={() => handleAccion("aprobar")}
                  disabled={processing}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-50"
                  style={{ background: "#16A34A" }}>
                  <CheckCircle className="w-4 h-4" /> Aprobar y Sincronizar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function RevisionInspecciones() {
  const { user } = useAuth();
  const [inspecciones, setInspecciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState("pendiente");
  const [centroSeleccionado, setCentroSeleccionado] = useState("todos");

  // Antes: list("-created_date", 100) sobre 259 registros. Las inspecciones
  // pendientes mas viejas caian fuera del corte por fecha y no habia forma de
  // llegar a ellas: 50 de las 52 pendientes eran invisibles, y por eso se
  // acumulaban. Se pide por estado — que es justo lo que muestra la pestaña —
  // en vez de traer las mas recientes y despues filtrar en pantalla.
  const cargar = useCallback(async () => {
    setLoading(true);
    const data = filtro === "todos"
      ? await base44.entities.InspeccionPendiente.list("-created_date", 500)
      : await base44.entities.InspeccionPendiente.filter({ estado: filtro }, "-created_date", 500);
    setInspecciones(data);
    setLoading(false);
  }, [filtro]);

  useEffect(() => { cargar(); }, [cargar]);



  const permitidos = centrosPermitidos(user);
  const enAlcance = permitidos
    ? inspecciones.filter(i => permitidos.includes(centroDeInspeccion(i)))
    : inspecciones;
  const filtradas = enAlcance.filter(i => filtro === "todos" || i.estado === filtro);
  const pendientes = enAlcance.filter(i => i.estado === "pendiente").length;

  // Agrupar por centro principal
  const porCentro = filtradas.reduce((acc, insp) => {
    let centro = "Sin centro";
    try {
      const datos = insp.datos_json ? JSON.parse(insp.datos_json) : {};
      centro = datos.equipo?.centro_principal || "Sin centro";
    } catch {}
    if (!acc[centro]) acc[centro] = [];
    acc[centro].push(insp);
    return acc;
  }, {});
  const centrosOrdenados = Object.keys(porCentro).sort((a, b) => a.localeCompare(b, "es"));
  const centrosAMostrar = centroSeleccionado === "todos" ? centrosOrdenados : centrosOrdenados.filter(c => c === centroSeleccionado);

  return (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-8">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-slate-900">Revisión de Inspecciones</h1>
            {pendientes > 0 && (
              <span className="text-xs font-bold px-2.5 py-1 rounded-full text-white" style={{ background: "#EF4444" }}>
                {pendientes} pendiente{pendientes > 1 ? "s" : ""}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500">Revisa y aprueba los formularios enviados desde la bitácora pública antes de sincronizarlos al sistema.</p>
        </div>

        {/* Filtros */}
        <div className="flex gap-2 mb-5 flex-wrap">
          {[
            { value: "pendiente", label: "Pendientes" },
            { value: "aprobado", label: "Aprobados" },
            { value: "rechazado", label: "Rechazados" },
            { value: "todos", label: "Todos" },
          ].map(f => (
            <button key={f.value} onClick={() => setFiltro(f.value)}
              className="px-4 py-2 rounded-xl text-sm font-semibold transition-all"
              style={filtro === f.value
                ? { background: "#1D4ED8", color: "white" }
                : { background: "white", color: "#64748B", border: "1px solid #E2E8F0" }}>
              {f.label}
            </button>
          ))}
        </div>

        {/* Selector de centro */}
        {centrosOrdenados.length > 1 && (
          <div className="mb-5">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 block">Centro</label>
            <div className="relative">
              <MapPin className="w-4 h-4 text-blue-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <select value={centroSeleccionado} onChange={e => setCentroSeleccionado(e.target.value)}
                className="w-full pl-9 pr-9 py-2.5 rounded-xl text-sm font-semibold text-slate-700 appearance-none cursor-pointer"
                style={{ background: "white", border: "1px solid #E2E8F0" }}>
                <option value="todos">Todos los centros ({filtradas.length})</option>
                {centrosOrdenados.map(c => (
                  <option key={c} value={c}>{c} ({porCentro[c].length})</option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>
        )}

        {/* Lista */}
        {loading ? (
          <div className="text-center py-16 text-slate-400 text-sm">Cargando...</div>
        ) : centrosAMostrar.length === 0 ? (
          <div className="text-center py-16">
            <ClipboardCheck className="w-12 h-12 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-400 text-sm">No hay registros {filtro !== "todos" ? `con estado "${filtro}"` : ""}.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {centrosAMostrar.map(centro => (
              <div key={centro}>
                {/* Encabezado de centro */}
                <div className="flex items-center gap-2 mb-3">
                  <MapPin className="w-4 h-4 text-blue-500 flex-shrink-0" />
                  <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">{centro}</h2>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "#EFF6FF", color: "#1D4ED8" }}>
                    {porCentro[centro].length}
                  </span>
                  <div className="flex-1 h-px" style={{ background: "#E2E8F0" }} />
                </div>
                <div className="space-y-3">
                  {porCentro[centro].map(insp => (
                    <InspeccionCard key={insp.id} insp={insp} onActualizar={cargar} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}