import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Wrench, Loader2, FileText, Clock, DollarSign, Package, User } from "lucide-react";
import { format, differenceInDays, parseISO } from "date-fns";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from "recharts";

const ESTADO_LABELS = {
  pendiente: "Pendiente", asignada: "Asignada", en_proceso: "En Proceso",
  pausada: "Pausada", completada: "Completada", cancelada: "Cancelada",
};

export default function ReporteTaller() {
  const [ordenes, setOrdenes] = useState([]);
  const [repuestos, setRepuestos] = useState([]);
  const [equipos, setEquipos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generando, setGenerando] = useState(false);

  useEffect(() => {
    Promise.all([
      base44.entities.OrdenTrabajo.list().catch(() => []),
      base44.entities.Repuesto.list().catch(() => []),
      base44.entities.Equipo.list().catch(() => []),
    ]).then(([ot, rep, eq]) => {
      const ambulancias = eq.filter(e => e.tipo === "ambulancia");
      const idsAmbulancias = new Set(ambulancias.map(a => a.id));
      // Solo OT de vehículos: ambulancias corporativas o activos externos
      const ordenesVehiculos = ot.filter(o =>
        o.tipo_activo === "externo" || (o.equipo_id && idsAmbulancias.has(o.equipo_id))
      );
      setOrdenes(ordenesVehiculos);
      setRepuestos(rep);
      setEquipos(ambulancias);
      setLoading(false);
    });
  }, []);

  if (loading) return (
    <div className="bg-white rounded-2xl shadow p-6">
      <div className="flex items-center gap-2 text-slate-400 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" /> Cargando datos de taller...
      </div>
    </div>
  );

  // KPIs
  const completadas = ordenes.filter(o => o.estado === "completada");
  const enGestion = ordenes.filter(o => ["pendiente", "asignada", "en_proceso"].includes(o.estado));
  const canceladas = ordenes.filter(o => o.estado === "cancelada");

  // Tiempo promedio de reparación (días entre fecha_inicio y fecha_fin)
  const tiemposReparacion = completadas
    .filter(o => o.fecha_inicio && o.fecha_fin)
    .map(o => differenceInDays(parseISO(o.fecha_fin), parseISO(o.fecha_inicio)));
  const tiempoPromedio = tiemposReparacion.length > 0
    ? (tiemposReparacion.reduce((a, b) => a + b, 0) / tiemposReparacion.length).toFixed(1)
    : "—";

  const costoTotal = ordenes.reduce((s, o) => s + (o.total || 0), 0);
  const costoRepuestos = ordenes.reduce((s, o) => s + (o.total_repuestos || 0), 0);
  const costoManoObra = ordenes.reduce((s, o) => s + (o.total_mano_obra || 0), 0);

  // OT por mecánico
  const porMecanico = {};
  ordenes.forEach(o => {
    const key = o.mecanico_nombre || "Sin asignar";
    if (!porMecanico[key]) porMecanico[key] = { total: 0, completadas: 0, costo: 0 };
    porMecanico[key].total++;
    if (o.estado === "completada") porMecanico[key].completadas++;
    porMecanico[key].costo += (o.total || 0);
  });
  const dataMecanico = Object.entries(porMecanico).map(([nombre, d]) => ({ nombre, ...d }));

  // Costo por vehículo
  const porVehiculo = {};
  ordenes.forEach(o => {
    const key = o.equipo_label || "Sin vehículo";
    if (!porVehiculo[key]) porVehiculo[key] = { total: 0, costo: 0, ot: 0 };
    porVehiculo[key].ot++;
    porVehiculo[key].costo += (o.total || 0);
  });
  const dataVehiculo = Object.entries(porVehiculo).map(([label, d]) => ({ label, ...d }))
    .sort((a, b) => b.costo - a.costo).slice(0, 8);

  // Consumo de repuestos
  const consumoRep = {};
  ordenes.forEach(o => {
    (o.repuestos_utilizados || []).forEach(r => {
      if (!consumoRep[r.nombre]) consumoRep[r.nombre] = { cantidad: 0, costo: 0 };
      consumoRep[r.nombre].cantidad += (r.cantidad || 0);
      consumoRep[r.nombre].costo += (r.subtotal || 0);
    });
  });
  const dataConsumo = Object.entries(consumoRep).map(([nombre, d]) => ({ nombre, ...d }))
    .sort((a, b) => b.costo - a.costo).slice(0, 8);

  // Distribución por estado
  const ESTADO_COLORS = {
    pendiente: "#D97706", asignada: "#2563EB", en_proceso: "#7C3AED",
    pausada: "#64748B", completada: "#16A34A", cancelada: "#DC2626",
  };
  const dataEstados = Object.keys(ESTADO_LABELS).map(k => ({
    name: ESTADO_LABELS[k], value: ordenes.filter(o => o.estado === k).length, color: ESTADO_COLORS[k],
  })).filter(d => d.value > 0);

  const hoy = new Date();

  const generarPDF = () => {
    setGenerando(true);
    const filasMec = dataMecanico.map(m => `<tr>
      <td>${m.nombre}</td><td style="text-align:center">${m.total}</td>
      <td style="text-align:center">${m.completadas}</td>
      <td style="text-align:right">$${m.costo.toLocaleString("es-CL")}</td>
    </tr>`).join("");

    const filasVeh = dataVehiculo.map(v => `<tr>
      <td>${v.label}</td><td style="text-align:center">${v.ot}</td>
      <td style="text-align:right">$${v.costo.toLocaleString("es-CL")}</td>
    </tr>`).join("");

    const filasRep = dataConsumo.map(r => `<tr>
      <td>${r.nombre}</td><td style="text-align:center">${r.cantidad}</td>
      <td style="text-align:right">$${r.costo.toLocaleString("es-CL")}</td>
    </tr>`).join("");

    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/>
<title>Reporte de Taller</title>
<style>
  @page { size:A4; margin:12mm 10mm 18mm 10mm; }
  @media print { .no-print{display:none!important} body{background:white!important;padding:0!important} }
  *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  body{font-family:'Segoe UI',Arial,sans-serif;background:#f1f5f9;margin:0;padding:16px;color:#1e293b}
  .page{background:white;max-width:190mm;margin:0 auto;padding:16px}
  .header-bar{background:linear-gradient(135deg,#0f172a,#1e293b);border-radius:10px;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}
  .header-bar h1{color:white;margin:0;font-size:16px;font-weight:800}
  .header-bar p{color:rgba(255,255,255,0.7);margin:3px 0 0;font-size:9.5px}
  .header-right{text-align:right;color:rgba(255,255,255,0.8);font-size:9px;line-height:1.6}
  .summary-bar{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px}
  .sum-card{border-radius:8px;padding:8px 10px;text-align:center;border:1px solid #e2e8f0}
  .sum-card .n{font-size:20px;font-weight:800}
  .sum-card .l{font-size:7.5px;color:#64748b;text-transform:uppercase;font-weight:600;margin-top:1px}
  h2{font-size:11px;font-weight:800;color:#1e293b;border-bottom:2px solid #e2e8f0;padding-bottom:4px;margin:14px 0 6px}
  table{width:100%;border-collapse:collapse;font-size:9px}
  thead th{background:#f8fafc;padding:5px 6px;text-align:left;font-size:8px;font-weight:700;color:#64748b;text-transform:uppercase;border-bottom:2px solid #e2e8f0}
  tbody td{padding:5px 6px;border-bottom:1px solid #f1f5f9}
  tbody tr:nth-child(even) td{background:#f8fafc}
  .footer-bar{text-align:center;padding:10px 0 0;font-size:8.5px;color:#94a3b8;border-top:1px solid #e2e8f0;margin-top:14px}
  .print-btn{position:fixed;bottom:20px;right:20px;background:linear-gradient(135deg,#0f172a,#334155);color:white;border:none;border-radius:10px;padding:12px 24px;font-size:13px;font-weight:700;cursor:pointer;box-shadow:0 4px 14px rgba(15,23,42,0.4)}
</style></head><body>
<div class="page">
  <div class="header-bar">
    <div><h1>🔧 Reporte de Taller Mecánico</h1><p>KPIs operativos y de costos</p></div>
    <div class="header-right">Corporación Municipal de Panguipulli<br/>Departamento de Informática<br/>Generado: ${format(hoy,"dd/MM/yyyy")} a las ${format(hoy,"HH:mm")} hrs</div>
  </div>
  <div class="summary-bar">
    <div class="sum-card" style="background:#F5F3FF;border-color:#DDD6FE"><div class="n" style="color:#7C3AED">${ordenes.length}</div><div class="l">OT Totales</div></div>
    <div class="sum-card" style="background:#F0FDF4;border-color:#BBF7D0"><div class="n" style="color:#16A34A">${completadas.length}</div><div class="l">Completadas</div></div>
    <div class="sum-card" style="background:#FFFBEB;border-color:#FDE68A"><div class="n" style="color:#D97706">${tiempoPromedio}</div><div class="l">Días Prom.</div></div>
    <div class="sum-card" style="background:#EFF6FF;border-color:#BFDBFE"><div class="n" style="color:#2563EB">$${costoTotal.toLocaleString("es-CL")}</div><div class="l">Costo Total</div></div>
  </div>
  <h2>OT por Mecánico</h2>
  <table><thead><tr><th>Mecánico</th><th style="text-align:center">OT Totales</th><th style="text-align:center">Completadas</th><th style="text-align:right">Costo Total</th></tr></thead>
  <tbody>${filasMec || '<tr><td colspan="4" style="text-align:center;color:#94a3b8">Sin datos</td></tr>'}</tbody></table>
  <h2>Costo por Vehículo</h2>
  <table><thead><tr><th>Vehículo / Activo</th><th style="text-align:center">N° OT</th><th style="text-align:right">Costo Total</th></tr></thead>
  <tbody>${filasVeh || '<tr><td colspan="3" style="text-align:center;color:#94a3b8">Sin datos</td></tr>'}</tbody></table>
  <h2>Consumo de Repuestos</h2>
  <table><thead><tr><th>Repuesto</th><th style="text-align:center">Cantidad Total</th><th style="text-align:right">Costo Total</th></tr></thead>
  <tbody>${filasRep || '<tr><td colspan="3" style="text-align:center;color:#94a3b8">Sin repuestos consumidos</td></tr>'}</tbody></table>
  <div class="footer-bar"><strong>Corporación Municipal de Panguipulli</strong> &nbsp;–&nbsp; Informe de Taller<br/><span style="font-size:8px">Generado automáticamente el ${format(hoy,"dd/MM/yyyy")} a las ${format(hoy,"HH:mm")} hrs</span></div>
</div>
<button class="print-btn no-print" onclick="window.print()">🖨️ Imprimir / Guardar PDF</button>
</body></html>`;

    const blob = new Blob([html], { type: "text/html" });
    window.open(URL.createObjectURL(blob), "_blank");
    setGenerando(false);
  };

  return (
    <div className="bg-white rounded-2xl shadow p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "#F5F3FF" }}>
            <Wrench className="w-5 h-5 text-violet-600" />
          </div>
          <div>
            <h3 className="font-bold text-slate-800">Reporte de Taller</h3>
            <p className="text-xs text-slate-400 mt-0.5">KPIs operativos: OT por mecánico, tiempos, costos y consumo de repuestos</p>
          </div>
        </div>
        <span className="text-xl font-bold text-violet-600">{ordenes.length}</span>
      </div>

      {/* KPIs principales */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "OT Totales", n: ordenes.length, icon: Wrench, color: "#7C3AED", bg: "#F5F3FF" },
          { label: "Completadas", n: completadas.length, icon: FileText, color: "#16A34A", bg: "#F0FDF4" },
          { label: "Días Prom. Reparación", n: tiempoPromedio, icon: Clock, color: "#D97706", bg: "#FFFBEB" },
          { label: "Costo Total", n: `$${(costoTotal / 1000).toFixed(0)}K`, icon: DollarSign, color: "#2563EB", bg: "#EFF6FF" },
        ].map(s => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="rounded-xl p-3" style={{ background: s.bg }}>
              <Icon className="w-4 h-4 mb-1" style={{ color: s.color }} />
              <p className="text-xl font-bold" style={{ color: s.color }}>{s.n}</p>
              <p className="text-xs font-medium mt-0.5" style={{ color: s.color }}>{s.label}</p>
            </div>
          );
        })}
      </div>

      {/* Distribución por estado */}
      {dataEstados.length > 0 && (
        <div className="bg-slate-50 rounded-xl p-4">
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Distribución por Estado</h4>
          <div className="flex flex-wrap gap-2">
            {dataEstados.map(d => (
              <div key={d.name} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-slate-200">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
                <span className="text-xs font-semibold text-slate-600">{d.name}</span>
                <span className="text-xs font-bold" style={{ color: d.color }}>{d.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* OT por mecánico */}
      {dataMecanico.length > 0 && (
        <div>
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1">
            <User className="w-3.5 h-3.5" /> OT por Mecánico
          </h4>
          <ResponsiveContainer width="100%" height={Math.max(140, dataMecanico.length * 36)}>
            <BarChart data={dataMecanico} layout="vertical" margin={{ left: 0, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E2E8F0" />
              <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
              <YAxis type="category" dataKey="nombre" width={110} tick={{ fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="total" fill="#7C3AED" radius={[0, 4, 4, 0]} barSize={18} name="OT Totales" />
              <Bar dataKey="completadas" fill="#16A34A" radius={[0, 4, 4, 0]} barSize={18} name="Completadas" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Consumo de repuestos */}
      {dataConsumo.length > 0 && (
        <div>
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1">
            <Package className="w-3.5 h-3.5" /> Consumo de Repuestos (Top)
          </h4>
          <ResponsiveContainer width="100%" height={Math.max(140, dataConsumo.length * 32)}>
            <BarChart data={dataConsumo} layout="vertical" margin={{ left: 0, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E2E8F0" />
              <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
              <YAxis type="category" dataKey="nombre" width={120} tick={{ fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="cantidad" fill="#D97706" radius={[0, 4, 4, 0]} barSize={16} name="Cantidad" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Costo por vehículo (tabla compacta) */}
      {dataVehiculo.length > 0 && (
        <div>
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1">
            <DollarSign className="w-3.5 h-3.5" /> Costo por Vehículo
          </h4>
          <div className="space-y-1.5 max-h-52 overflow-y-auto">
            {dataVehiculo.map(v => (
              <div key={v.label} className="flex items-center justify-between p-2 rounded-lg bg-slate-50">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-700 truncate">{v.label}</p>
                  <p className="text-xs text-slate-400">{v.ot} OT</p>
                </div>
                <span className="text-sm font-bold text-blue-700 flex-shrink-0 ml-2">${v.costo.toLocaleString("es-CL")}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={generarPDF}
        disabled={generando || ordenes.length === 0}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white disabled:opacity-60"
        style={{ background: "linear-gradient(135deg,#0f172a,#334155)" }}
      >
        {generando ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
        {generando ? "Generando..." : "Generar PDF de Taller"}
      </button>
    </div>
  );
}