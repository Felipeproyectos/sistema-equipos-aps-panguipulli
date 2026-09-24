import { Link } from "react-router-dom";
import {
  Stethoscope, Route, Wrench, CalendarClock, CalendarCheck, ChevronRight, Timer, AlertTriangle, Eye,
} from "lucide-react";
import { CITA, estadoCita, textoCita } from "@/lib/agendaTaller";

// La coordinación Movilización ↔ Taller vista desde el Monitor Corporativo:
// en qué paso está cada pedido y quién tiene que moverse. Solo lectura; las
// cifras salen de resumenCoordinacion() en src/lib/agendaTaller.js, la misma
// regla que usan las pantallas de Movilización y del Taller.

const QUIEN = {
  taller: { label: "Debe responder el Taller", color: "#1d4ed8" },
  movilizacion: { label: "Debe responder Movilización", color: "#b45309" },
};

function Paso({ icon: Icon, titulo, quien, valor, detalle, color, fondo, ultimo }) {
  return (
    <div className="flex items-stretch gap-2 min-w-0">
      <div className="flex-1 rounded-2xl p-3.5 min-w-0" style={{ background: fondo, border: `1px solid ${color}33` }}>
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 flex-shrink-0" style={{ color }} />
          <p className="text-[11px] font-bold uppercase tracking-wide truncate" style={{ color }}>{quien}</p>
        </div>
        <p className="text-2xl font-bold mt-1" style={{ color }}>{valor}</p>
        <p className="text-xs text-slate-600 leading-tight">{titulo}</p>
        {detalle && <p className="text-[11px] text-slate-400 mt-0.5">{detalle}</p>}
      </div>
      {!ultimo && <ChevronRight className="w-4 h-4 text-slate-300 self-center flex-shrink-0 hidden lg:block" />}
    </div>
  );
}

const vehiculoDe = (ot) => ot.equipo_label || [ot.marca_modelo, ot.patente].filter(Boolean).join(" · ") || "Vehículo sin ficha";

export default function CoordinacionTaller({ resumen, porRevisar = 0, verDetalle = false }) {
  const r = resumen;
  const dias = (n) => (n === null ? "—" : `${String(n).replace(".", ",")} ${n === 1 ? "día" : "días"}`);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
        <Paso icon={Stethoscope} quien="Movilización" valor={porRevisar} titulo="Fallas de Salud por revisar"
          color="#b45309" fondo="#fffbeb" />
        <Paso icon={CalendarClock} quien="Taller" valor={r.porAgendar.length + r.reagendar.length}
          titulo="Pedidos esperando fecha" detalle={r.reagendar.length ? `${r.reagendar.length} con otra fecha pedida` : null}
          color="#1d4ed8" fondo="#eff6ff" />
        <Paso icon={Route} quien="Movilización" valor={r.esperanMovilizacion.length}
          titulo="Fechas propuestas sin respuesta" color="#b45309" fondo="#fffbeb" />
        <Paso icon={CalendarCheck} quien="Acordado" valor={r.confirmadas.length}
          titulo="Ingresos confirmados" color="#15803d" fondo="#f0fdf4" />
        <Paso icon={Wrench} quien="Taller" valor={r.enTaller.length} titulo="Vehículos en reparación"
          color="#7c3aed" fondo="#f5f3ff" ultimo />
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500 px-1">
        <p className="flex items-start gap-1.5">
          <Timer className="w-3.5 h-3.5 text-blue-600 mt-0.5 flex-shrink-0" />
          <span>El Taller tarda en promedio <strong className="text-slate-700">{dias(r.diasRespuestaTaller)}</strong> en proponer fecha</span>
        </p>
        <p className="flex items-start gap-1.5">
          <Timer className="w-3.5 h-3.5 text-amber-600 mt-0.5 flex-shrink-0" />
          <span>Movilización tarda <strong className="text-slate-700">{dias(r.diasRespuestaMovilizacion)}</strong> en confirmarla</span>
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl p-5" style={{ boxShadow: "0 4px 20px rgba(15,45,107,0.06)" }}>
          <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-blue-600" /> Próximos ingresos al taller
          </h3>
          {r.proximos.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6">No hay ingresos agendados.</p>
          ) : (
            <div className="space-y-2">
              {r.proximos.slice(0, 8).map(ot => {
                const c = CITA[estadoCita(ot)];
                return (
                  <div key={ot.id} className="flex items-center gap-3 text-xs">
                    <div className="w-24 flex-shrink-0 font-semibold text-slate-700">{textoCita(ot.cita_fecha)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-slate-700 truncate">{vehiculoDe(ot)}</p>
                      <p className="text-[11px] text-slate-400 truncate">
                        {ot.numero_ot}{ot.cita_entrega && <> · vuelve {textoCita(ot.cita_entrega, false)}</>}
                      </p>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border flex-shrink-0"
                      style={{ background: c.fondo, color: c.color, borderColor: c.borde }}>{c.corto}</span>
                    {verDetalle && (
                      <Link to={`/OrdenTrabajoDetalle/${ot.id}`} className="text-violet-700 flex-shrink-0" title="Ver la orden">
                        <Eye className="w-3.5 h-3.5" />
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl p-5" style={{ boxShadow: "0 4px 20px rgba(15,45,107,0.06)" }}>
          <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600" /> Esperando hace 3 días o más
          </h3>
          {r.atascados.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6">Nada detenido: cada lado está respondiendo a tiempo.</p>
          ) : (
            <div className="space-y-2">
              {r.atascados.slice(0, 8).map(({ ot, quien, dias: d }) => (
                <div key={ot.id} className="flex items-center gap-3 text-xs">
                  <div className="flex-1 min-w-0">
                    <p className="text-slate-700 truncate">{vehiculoDe(ot)}</p>
                    <p className="text-[11px] truncate" style={{ color: QUIEN[quien].color }}>
                      {QUIEN[quien].label}{estadoCita(ot) === "reagendar" && ot.cita_nota ? ` · “${ot.cita_nota}”` : ""}
                    </p>
                  </div>
                  <span className="text-sm font-bold text-red-600 flex-shrink-0">{d} días</span>
                  {verDetalle && (
                    <Link to={`/OrdenTrabajoDetalle/${ot.id}`} className="text-violet-700 flex-shrink-0" title="Ver la orden">
                      <Eye className="w-3.5 h-3.5" />
                    </Link>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
