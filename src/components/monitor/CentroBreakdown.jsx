import { useState } from "react";
import {
  Building2, ChevronDown, MapPin, CheckCircle2, Wrench,
  AlertTriangle, Heart, ClipboardList
} from "lucide-react";
import { differenceInDays, parseISO } from "date-fns";

const ESTADO_COLOR = {
  operativo: "#16a34a",
  mantenimiento: "#d97706",
  fuera_de_servicio: "#dc2626",
};

function MiniStat({ icon: Icon, value, color, bg, title }) {
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg flex-shrink-0" style={{ background: bg }} title={title}>
      <Icon className="w-3.5 h-3.5" style={{ color }} />
      <span className="text-xs font-bold" style={{ color }}>{value}</span>
    </div>
  );
}

function SubsedeRow({ nombre, eqs, alertasCount, otCount, vencidos }) {
  return (
    <div className="flex items-center gap-2 py-2.5 px-3 rounded-xl border border-slate-100 bg-slate-50/50">
      <MapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-slate-700 truncate">{nombre}</p>
        <p className="text-[10px] text-slate-400">{eqs.length} equipo{eqs.length === 1 ? "" : "s"}</p>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {vencidos > 0 && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-red-100 text-red-600" title="Parches vencidos">
            <Heart className="w-3 h-3 inline" /> {vencidos}
          </span>
        )}
        {alertasCount > 0 && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-600" title="Alertas activas">
            <AlertTriangle className="w-3 h-3 inline" /> {alertasCount}
          </span>
        )}
        {otCount > 0 && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-violet-100 text-violet-600" title="OT activas">
            <Wrench className="w-3 h-3 inline" /> {otCount}
          </span>
        )}
        {vencidos === 0 && alertasCount === 0 && otCount === 0 && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-green-100 text-green-600">
            <CheckCircle2 className="w-3 h-3 inline" /> OK
          </span>
        )}
      </div>
    </div>
  );
}

export default function CentroBreakdown({ centros, equipos, alertas, parches, ordenes }) {
  const [openIdx, setOpenIdx] = useState(0);

  const eqById = {};
  equipos.forEach(e => { if (e.id) eqById[e.id] = e; });

  // Construir jerarquía centro -> subsede -> equipos
  const centroMap = {};
  const ensureCentro = (nombre) => {
    if (!centroMap[nombre]) centroMap[nombre] = { subsedes: {}, direct: [] };
    return centroMap[nombre];
  };
  (centros || []).forEach(c => {
    const cent = ensureCentro(c.nombre);
    (c.subsedes || []).forEach(s => { if (!cent.subsedes[s]) cent.subsedes[s] = []; });
  });
  equipos.forEach(e => {
    const cp = e.centro_principal || "Sin centro";
    const cent = ensureCentro(cp);
    const sub = e.subsede && String(e.subsede).trim() ? String(e.subsede).trim() : null;
    if (sub) {
      if (!cent.subsedes[sub]) cent.subsedes[sub] = [];
      cent.subsedes[sub].push(e);
    } else {
      cent.direct.push(e);
    }
  });

  const hoy = new Date();
  const isVencido = (p) => {
    try { return differenceInDays(parseISO(p.fecha_vencimiento), hoy) < 0; } catch { return false; }
  };

  const statsFor = (eqs) => {
    const ids = new Set(eqs.map(e => e.id).filter(Boolean));
    return {
      total: eqs.length,
      operativos: eqs.filter(e => e.estado === "operativo").length,
      mantencion: eqs.filter(e => e.estado === "mantenimiento").length,
      fuera: eqs.filter(e => e.estado === "fuera_de_servicio").length,
      alertas: alertas.filter(a => a.equipo_id && ids.has(a.equipo_id)).length,
      vencidos: parches.filter(p => p.equipo_id && ids.has(p.equipo_id) && isVencido(p)).length,
      ot: ordenes.filter(o => o.equipo_id && ids.has(o.equipo_id) &&
        ["pendiente", "asignada", "en_proceso", "pausada"].includes(o.estado)).length,
    };
  };

  const centroEntries = Object.entries(centroMap)
    .filter(([, c]) => c.direct.length > 0 || Object.keys(c.subsedes).length > 0)
    .sort((a, b) => {
      const ta = a[1].direct.length + Object.values(a[1].subsedes).reduce((s, e) => s + e.length, 0);
      const tb = b[1].direct.length + Object.values(b[1].subsedes).reduce((s, e) => s + e.length, 0);
      return tb - ta;
    });

  if (centroEntries.length === 0) {
    return (
      <div className="bg-white/60 rounded-3xl p-8 text-center" style={{ boxShadow: "0 4px 24px rgba(15,45,107,0.06)" }}>
        <Building2 className="w-10 h-10 text-slate-200 mx-auto mb-2" />
        <p className="text-slate-400 text-sm">Sin equipos asignados a centros.</p>
      </div>
    );
  }

  return (
    <div className="bg-white/60 rounded-3xl p-5 lg:p-6" style={{ boxShadow: "0 4px 24px rgba(15,45,107,0.06)" }}>
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "#e0e7ff" }}>
          <Building2 className="w-5 h-5" style={{ color: "#4f46e5" }} />
        </div>
        <div>
          <h2 className="text-lg font-bold text-indigo-700">Distribución por Centro y Sucursal</h2>
          <p className="text-xs text-slate-500">Detalle operativo por establecimiento y posta dependiente</p>
        </div>
      </div>

      <div className="space-y-3">
        {centroEntries.map(([nombre, cent], idx) => {
          const allEqs = [...cent.direct, ...Object.values(cent.subsedes).flat()];
          const s = statsFor(allEqs);
          const isOpen = openIdx === idx;
          return (
            <div key={nombre} className="bg-white rounded-2xl border border-slate-100 overflow-hidden" style={{ boxShadow: "0 2px 12px rgba(15,45,107,0.04)" }}>
              <button
                onClick={() => setOpenIdx(isOpen ? -1 : idx)}
                className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-slate-50 transition-colors text-left"
              >
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "#eef2ff" }}>
                  <Building2 className="w-4.5 h-4.5" style={{ color: "#4f46e5" }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-800 truncate">{nombre}</p>
                  <p className="text-[11px] text-slate-400">{s.total} equipo{s.total === 1 ? "" : "s"} · {Object.keys(cent.subsedes).length} sucursal{Object.keys(cent.subsedes).length === 1 ? "" : "es"}</p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {s.fuera > 0 && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-red-100 text-red-600">{s.fuera} fuera</span>}
                  {s.alertas > 0 && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-600">{s.alertas} alertas</span>}
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-indigo-100 text-indigo-600">{s.total}</span>
                  <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </div>
              </button>

              {isOpen && (
                <div className="px-4 pb-4 space-y-3 border-t border-slate-50">
                  <div className="flex flex-wrap gap-2 pt-3">
                    <MiniStat icon={CheckCircle2} value={s.operativos} color={ESTADO_COLOR.operativo} bg="#dcfce7" title="Operativos" />
                    <MiniStat icon={Wrench} value={s.mantencion} color={ESTADO_COLOR.mantenimiento} bg="#fef9c3" title="En mantención" />
                    <MiniStat icon={AlertTriangle} value={s.fuera} color={ESTADO_COLOR.fuera_de_servicio} bg="#fee2e2" title="Fuera de servicio" />
                    <MiniStat icon={AlertTriangle} value={s.alertas} color="#dc2626" bg="#fef2f2" title="Alertas activas" />
                    <MiniStat icon={Heart} value={s.vencidos} color="#db2777" bg="#fce7f3" title="Parches vencidos" />
                    <MiniStat icon={ClipboardList} value={s.ot} color="#7c3aed" bg="#f5f3ff" title="OT activas" />
                  </div>

                  {Object.keys(cent.subsedes).length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1">Sucursales</p>
                      {Object.entries(cent.subsedes).map(([subName, subEqs]) => {
                        const ss = statsFor(subEqs);
                        return (
                          <SubsedeRow
                            key={subName}
                            nombre={subName}
                            eqs={subEqs}
                            alertasCount={ss.alertas}
                            otCount={ss.ot}
                            vencidos={ss.vencidos}
                          />
                        );
                      })}
                    </div>
                  )}

                  {cent.direct.length > 0 && (
                    <div className="space-y-1.5">
                      {Object.keys(cent.subsedes).length > 0 && (
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1">Sede central</p>
                      )}
                      <SubsedeRow
                        nombre="Sede central"
                        eqs={cent.direct}
                        alertasCount={statsFor(cent.direct).alertas}
                        otCount={statsFor(cent.direct).ot}
                        vencidos={statsFor(cent.direct).vencidos}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}