import { differenceInDays, parseISO } from "date-fns";
import { AlertTriangle, Zap, Activity, Car, Monitor, MapPin, Hash } from "lucide-react";
import { TIPOS_EQUIPO, ESTADOS_EQUIPO } from "@/lib/centros";

const TIPO_ICONS = {
  dea: Zap,
  monitor_desfibrilador: Activity,
  ambulancia: Car,
  monitor_multiparametros: Monitor
};

const TIPO_COLORS = {
  dea: { icon: "#2563EB", bg: "#EFF6FF" },
  monitor_desfibrilador: { icon: "#7C3AED", bg: "#F5F3FF" },
  ambulancia: { icon: "#DC2626", bg: "#FEF2F2" },
  monitor_multiparametros: { icon: "#0891B2", bg: "#ECFEFF" }
};

export default function EquipoCard({ equipo, parches, onClick, onEdit }) {
  const hoy = new Date();
  const estado = ESTADOS_EQUIPO.find(e => e.value === equipo.estado) || ESTADOS_EQUIPO[0];
  const tipoLabel = TIPOS_EQUIPO.find(t => t.value === equipo.tipo)?.label || equipo.tipo;
  const Icon = TIPO_ICONS[equipo.tipo] || Monitor;
  const iconStyle = TIPO_COLORS[equipo.tipo] || { icon: "#2563EB", bg: "#EFF6FF" };

  const parchesAlerta = parches.filter(p => {
    if (!p.fecha_vencimiento) return false;
    const dias = differenceInDays(parseISO(p.fecha_vencimiento), hoy);
    return dias <= 90;
  });

  const batAlerta = equipo.fecha_vencimiento_bateria
    ? differenceInDays(parseISO(equipo.fecha_vencimiento_bateria), hoy) <= 90
    : false;

  const tieneAlerta = parchesAlerta.length > 0 || batAlerta;

  const estadoBar = {
    operativo: "#10B981",
    mantenimiento: "#F59E0B",
    fuera_de_servicio: "#EF4444"
  }[equipo.estado] || "#94A3B8";

  return (
    <div
      className="bg-white rounded-2xl cursor-pointer overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
      style={{ border: "1px solid #E2E8F0", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}
      onClick={onClick}
    >
      {/* Color bar on top */}
      <div className="h-1" style={{ background: estadoBar }} />

      <div className="p-5">
        {/* Top row: icon + title + status badge */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: iconStyle.bg }}>
              <Icon className="w-5 h-5" style={{ color: iconStyle.icon }} />
            </div>
            <div>
              <p className="font-bold text-slate-900 text-sm leading-tight" style={{ letterSpacing: "-0.02em" }}>
                {equipo.marca} {equipo.modelo}
              </p>
              <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                <Hash className="w-3 h-3" />{equipo.numero_inventario || "—"}
              </p>
            </div>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap"
            style={{ color: estado.color, background: estado.bg, border: `1px solid ${estado.color}22` }}>
            {estado.label}
          </span>
        </div>

        {/* Info rows */}
        <div className="space-y-2 mb-4">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: iconStyle.icon }} />
            <span className="font-medium text-slate-600">{tipoLabel}</span>
          </div>
          <div className="flex items-start gap-2 text-xs text-slate-500">
            <MapPin className="w-3 h-3 text-slate-400 flex-shrink-0 mt-0.5" />
            <span>
              {equipo.centro_principal}
              {equipo.subsede && <span className="text-slate-400"> › {equipo.subsede}</span>}
              {equipo.ubicacion_especifica && (
                <span className="block text-slate-400">{equipo.ubicacion_especifica}</span>
              )}
            </span>
          </div>
          {equipo.patente && (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Car className="w-3 h-3 text-slate-400" />
              <span className="font-semibold text-slate-700">{equipo.patente}</span>
            </div>
          )}
        </div>

        {/* Alert strip */}
        {tieneAlerta && (
          <div className="flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-xl"
            style={{ background: "#FFFBEB", color: "#B45309", border: "1px solid #FDE68A" }}>
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
            <span>
              {parchesAlerta.length > 0 && `${parchesAlerta.length} parche(s) por vencer`}
              {parchesAlerta.length > 0 && batAlerta && " · "}
              {batAlerta && "Batería próxima"}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}