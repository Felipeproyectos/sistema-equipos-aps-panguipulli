import { MapPin, Monitor, User, Package, CalendarClock, AlertTriangle, MessageSquareText, Copy, Check } from "lucide-react";
import { useState } from "react";
import { TIPOS_EQUIPO } from "@/lib/centros";
import { CATEGORIAS, PRIORIDADES, OPERATIVIDAD, ESTADOS, rotulo, fichaEnTexto } from "@/lib/solicitudesMonitor";

// El detalle completo de una solicitud, igual para el centro y para el
// Monitor Corporativo: qué es, dónde está el equipo, cuál equipo, quién la
// pide, y el recorrido. Lo que la solicitud no guardó (las viejas, antes de
// 31_solicitudes_monitor.sql) se completa con la ficha actual del equipo.

const fechaHora = (f) => {
  if (!f) return "";
  const d = new Date(f);
  if (Number.isNaN(d.getTime())) return String(f);
  return d.toLocaleString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};
const fecha = (f) => {
  const [y, m, d] = String(f || "").slice(0, 10).split("-");
  return d ? `${d}/${m}/${y}` : "";
};

export function EstadoBadge({ estado }) {
  const cfg = ESTADOS[estado || "pendiente"] || ESTADOS.pendiente;
  return <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ color: cfg.color, background: cfg.bg }}>{cfg.label}</span>;
}

export function PrioridadBadge({ prioridad }) {
  const p = PRIORIDADES.find(x => x.value === prioridad);
  if (!p) return null;
  return <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ color: p.color, background: p.bg }}>Prioridad {p.label}</span>;
}

function Dato({ etiqueta, valor, fuerte }) {
  if (!String(valor ?? "").trim()) return null;
  return (
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">{etiqueta}</p>
      <p className={`text-sm break-words ${fuerte ? "font-semibold text-slate-900" : "text-slate-700"}`}>{valor}</p>
    </div>
  );
}

function Bloque({ icono: Icono, titulo, children }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
      <p className="flex items-center gap-1.5 text-xs font-bold text-slate-500 mb-2"><Icono className="w-3.5 h-3.5" /> {titulo}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">{children}</div>
    </div>
  );
}

/** La solicitud con lo que le falte tomado de la ficha actual del equipo. */
export function conDatosDelEquipo(s, equipo) {
  return {
    ...s,
    equipo_tipo: s.equipo_tipo || equipo?.tipo || "",
    equipo_marca: s.equipo_marca || equipo?.marca || "",
    equipo_modelo: s.equipo_modelo || equipo?.modelo || "",
    equipo_numero_serie: s.equipo_numero_serie || equipo?.numero_serie || "",
    equipo_numero_inventario: s.equipo_numero_inventario || equipo?.numero_inventario || "",
    centro: s.centro || equipo?.centro_principal || "",
    subsede: s.subsede || equipo?.subsede || "",
    ubicacion_especifica: s.ubicacion_especifica || equipo?.ubicacion_especifica || "",
  };
}

export default function FichaSolicitud({ solicitud, equipo, mostrarLinea = true }) {
  const s = conDatosDelEquipo(solicitud, equipo);
  const [copiado, setCopiado] = useState(false);
  const op = OPERATIVIDAD.find(o => o.value === s.operatividad);
  const tipoEquipo = TIPOS_EQUIPO.find(t => t.value === s.equipo_tipo)?.label || s.equipo_tipo;
  const linea = Array.isArray(s.linea_tiempo) ? s.linea_tiempo : [];

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(fichaEnTexto(s));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sin permiso de portapapeles no pasa nada: el detalle sigue a la vista.
    }
  };

  return (
    <div className="space-y-3">
      {op && op.value !== "operativo" && (
        <p className="flex items-center gap-2 text-xs font-semibold rounded-lg px-3 py-2"
          style={{ color: op.color, background: `${op.color}12`, border: `1px solid ${op.color}40` }}>
          <AlertTriangle className="w-4 h-4 flex-shrink-0" /> Equipo {op.label.toLowerCase()}
        </p>
      )}

      <Bloque icono={MapPin} titulo="Dónde está">
        <Dato etiqueta="CESFAM / centro" valor={s.centro} fuerte />
        <Dato etiqueta="Subsede" valor={s.subsede} />
        <Dato etiqueta="Ubicación exacta" valor={s.ubicacion_especifica} fuerte />
      </Bloque>

      <Bloque icono={Monitor} titulo="Equipo">
        <Dato etiqueta="Tipo" valor={tipoEquipo} />
        <Dato etiqueta="Marca y modelo" valor={[s.equipo_marca, s.equipo_modelo].filter(Boolean).join(" ")} fuerte />
        <Dato etiqueta="N° de serie" valor={s.equipo_numero_serie} />
        <Dato etiqueta="N° de inventario" valor={s.equipo_numero_inventario} />
        <Dato etiqueta="Patente" valor={equipo?.patente} />
        <Dato etiqueta="Parte" valor={s.ambito === "cabina" ? "Cabina sanitaria (Calidad)" : s.ambito === "vehiculo" ? "Vehículo (Movilización)" : ""} fuerte />
        <Dato etiqueta="Estado del equipo" valor={op?.label} />
      </Bloque>

      <Bloque icono={Package} titulo="Qué se pide">
        <Dato etiqueta="Tipo de solicitud" valor={rotulo(CATEGORIAS, s.categoria)} fuerte />
        <Dato etiqueta="Prioridad" valor={rotulo(PRIORIDADES, s.prioridad)} />
        <Dato etiqueta="Insumo" valor={s.insumo_nombre ? `${s.insumo_nombre} × ${s.insumo_cantidad || 1}` : ""} fuerte />
        <Dato etiqueta="Especificación / código" valor={s.insumo_especificacion} />
        <Dato etiqueta="Falla detectada el" valor={fecha(s.fecha_deteccion)} />
        <Dato etiqueta="Fecha de la solicitud" valor={fecha(s.fecha)} />
      </Bloque>

      {(s.descripcion || s.observaciones) && (
        <div className="rounded-xl border border-slate-100 p-3">
          <p className="text-xs font-bold text-slate-500 mb-1">Descripción</p>
          <p className="text-sm text-slate-700 whitespace-pre-line break-words">{s.descripcion || s.observaciones}</p>
          {s.descripcion && s.observaciones && s.observaciones !== s.descripcion && (
            <p className="text-xs text-slate-500 whitespace-pre-line break-words mt-2 pt-2 border-t border-slate-100">{s.observaciones}</p>
          )}
        </div>
      )}

      <Bloque icono={User} titulo="Quién la pide">
        <Dato etiqueta="Solicitante" valor={s.usuario_nombre || s.usuario_email} fuerte />
        <Dato etiqueta="Cargo" valor={s.solicitante_cargo} />
        <Dato etiqueta="Teléfono" valor={s.solicitante_telefono} />
        <Dato etiqueta="Correo" valor={s.usuario_email} />
        <Dato etiqueta="Enviada al Monitor por" valor={s.derivada_por_nombre ? `${s.derivada_por_nombre} · ${fechaHora(s.fecha_derivacion)}` : ""} />
        <Dato etiqueta="Gestiona (Monitor)" valor={s.monitor_nombre} />
      </Bloque>

      {s.resolucion && (
        <div className="rounded-xl border p-3" style={{ background: "#eef2ff", borderColor: "#c7d2fe" }}>
          <p className="flex items-center gap-1.5 text-xs font-bold text-indigo-700 mb-1"><MessageSquareText className="w-3.5 h-3.5" /> Respuesta del Monitor Corporativo</p>
          <p className="text-sm text-indigo-900 whitespace-pre-line break-words">{s.resolucion}</p>
        </div>
      )}
      {!s.resolucion && s.respuesta_admin && (
        <p className="text-xs text-blue-700 bg-blue-50 rounded-lg px-3 py-2 whitespace-pre-line">Respuesta: {s.respuesta_admin}</p>
      )}

      {mostrarLinea && linea.length > 0 && (
        <div className="rounded-xl border border-slate-100 p-3">
          <p className="flex items-center gap-1.5 text-xs font-bold text-slate-500 mb-2"><CalendarClock className="w-3.5 h-3.5" /> Recorrido</p>
          <ol className="space-y-2">
            {linea.map((e, i) => (
              <li key={i} className="flex gap-2 text-xs">
                <span className="w-2 h-2 rounded-full bg-indigo-400 mt-1.5 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-slate-700"><strong>{e.evento}</strong> · {e.usuario_nombre || e.usuario_email} · <span className="text-slate-400">{fechaHora(e.fecha)}</span></p>
                  {e.notas && <p className="text-slate-500 whitespace-pre-line break-words">{e.notas}</p>}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      <button type="button" onClick={copiar}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800">
        {copiado ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
        {copiado ? "Copiado" : "Copiar el detalle"}
      </button>
    </div>
  );
}
