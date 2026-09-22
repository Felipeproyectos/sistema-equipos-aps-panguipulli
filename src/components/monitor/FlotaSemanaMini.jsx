import { Wrench, ArrowLeftRight, UserCheck } from "lucide-react";
import {
  asignacionesDelDia, rangosSeTocan, esFinDeSemana, aISO, sumarDias,
} from "@/lib/calendarioFlota";

// La programación de la flota, en miniatura y de solo lectura.
//
// El Monitor Corporativo necesita VER que se está programando, no
// programarlo — eso es de Movilización. Por eso esto no es el calendario
// completo (src/pages/Calendario.jsx): no arrastra, no abre formularios, no
// tiene botones. Es la misma información, resumida en una tabla que solo se
// mira.
//
// La ventana es una semana RODANTE (hoy y los seis días siguientes), no la
// semana de lunes a domingo del calendario de programación: acá lo que
// importa es "qué viene", no "en qué semana del mes estamos".
const DIAS_CORTOS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

const nombreDia = (iso) => DIAS_CORTOS[new Date(`${iso}T12:00:00`).getDay()];
const nroDia = (iso) => Number(iso.slice(-2));

function rotulo(eq) {
  return [eq.marca, eq.modelo].filter(Boolean).join(" ") + (eq.patente ? ` · ${eq.patente}` : "");
}

export default function FlotaSemanaMini({ vehiculos = [], asignaciones = [], prestamos = [], taller = [] }) {
  const hoy = aISO(new Date());
  const dias = Array.from({ length: 7 }, (_, i) => sumarDias(hoy, i));

  if (vehiculos.length === 0) {
    return (
      <p className="text-sm text-slate-400 text-center py-6">
        No hay vehículos de flota registrados.
      </p>
    );
  }

  return (
    <div>
      <div className="overflow-x-auto -mx-1 px-1">
        <table className="border-collapse w-full" style={{ minWidth: "38rem" }}>
          <thead>
            <tr>
              <th className="text-left text-[10px] font-bold text-slate-500 uppercase tracking-wide pb-2 pr-2 min-w-[9rem]">
                Vehículo
              </th>
              {dias.map((d) => (
                <th key={d}
                  className={`text-[10px] font-semibold pb-2 px-1 ${esFinDeSemana(d) ? "text-slate-300" : "text-slate-500"}`}>
                  {nombreDia(d)}<br /><span className="text-[11px]">{nroDia(d)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {vehiculos.map((eq) => (
              <tr key={eq.id} className="border-t border-slate-50">
                <td className="text-xs font-semibold text-slate-700 py-2 pr-2 truncate max-w-[9rem]">
                  {rotulo(eq)}
                </td>
                {dias.map((d) => {
                  const asigs = asignacionesDelDia(asignaciones, eq.id, d);
                  const enTaller = taller.find((t) => t.equipo_id === eq.id && rangosSeTocan(t.desde, t.hasta, d, d));
                  const prestamo = prestamos.find((p) => p.equipo_id === eq.id && rangosSeTocan(p.desde, p.hasta_previsto, d, d));

                  let contenido = null;
                  let fondo = esFinDeSemana(d) ? "#fafafa" : "transparent";
                  if (enTaller) {
                    fondo = "#fef2f2";
                    contenido = <Wrench className="w-3 h-3 text-red-600 mx-auto" />;
                  } else if (asigs.length) {
                    fondo = "#f0fdf4";
                    contenido = (
                      <span className="flex items-center justify-center gap-0.5">
                        <UserCheck className="w-3 h-3 text-green-600 shrink-0" />
                        {prestamo && <ArrowLeftRight className="w-2.5 h-2.5 text-orange-600 shrink-0" />}
                      </span>
                    );
                  } else if (prestamo) {
                    fondo = "#fff7ed";
                    contenido = <ArrowLeftRight className="w-3 h-3 text-orange-600 mx-auto" />;
                  }

                  const titulo = [
                    ...asigs.map((a) => a.chofer_nombre),
                    prestamo ? `Prestado a ${prestamo.centro_destino}` : "",
                    enTaller ? `En taller — ${enTaller.numero_ot}` : "",
                  ].filter(Boolean).join(" · ") || "Libre";

                  return (
                    <td key={d} title={titulo} className="text-center py-2 px-1" style={{ background: fondo }}>
                      {contenido}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-4 mt-3 text-[11px] text-slate-500">
        <span className="flex items-center gap-1.5"><UserCheck className="w-3 h-3 text-green-600" /> Con chofer</span>
        <span className="flex items-center gap-1.5"><ArrowLeftRight className="w-3 h-3 text-orange-600" /> Prestado</span>
        <span className="flex items-center gap-1.5"><Wrench className="w-3 h-3 text-red-600" /> En taller</span>
        <span className="text-slate-400">— celda vacía: sin nada programado</span>
      </div>
    </div>
  );
}
