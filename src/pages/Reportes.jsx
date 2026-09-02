import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { FileText, Loader2, Filter, Bell, ClipboardList } from "lucide-react";
import { CENTROS_ESTRUCTURA } from "@/lib/centros";
import { esRolTaller, esSuperAdmin, esMonitorCorporativo } from "@/lib/roles";
import ReporteTaller from "@/components/reportes/ReporteTaller";
import { format } from "date-fns";
import { useAuth } from "@/lib/AuthContext";

export default function Reportes() {
  const { user } = useAuth();
  const [equipos, setEquipos] = useState([]);
  const [parches, setParches] = useState([]);
  const [alertas, setAlertas] = useState([]);
  const [solicitudes, setSolicitudes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generandoAlertas, setGenerandoAlertas] = useState(false);
  const [generandoSolicitudes, setGenerandoSolicitudes] = useState(false);
  const [filtroCentro, setFiltroCentro] = useState("");

  useEffect(() => {
    Promise.all([
      base44.entities.Equipo.list('-created_date', 500),
      base44.entities.Parche.list('-updated_date', 300),
      base44.entities.Alerta.list('-created_date', 300),
      base44.entities.Solicitud.list('-fecha', 300)
    ]).then(([eq, pa, al, so]) => {
      setEquipos(eq);
      setParches(pa);
      setAlertas(al);
      setSolicitudes(so);
      setLoading(false);
    });
  }, []);

  const hoy = new Date();

  const alertasFiltradas = alertas.filter(a =>
    a.estado === "activa" && (!filtroCentro || a.centro === filtroCentro)
  );

  const solicitudesFiltradas = solicitudes.filter(s =>
    (!filtroCentro || s.centro === filtroCentro)
  );

  const NIVEL_LABELS = { critica: "CRÍTICA", advertencia: "ADVERTENCIA", info: "INFO" };
  const NIVEL_COLORS = { critica: "#dc2626", advertencia: "#d97706", info: "#2563eb" };
  const TIPO_ALERTA_LABELS = {
    parche_vencido: "Parche Vencido",
    parche_por_vencer: "Parche por Vencer",
    bateria_vencida: "Batería Vencida",
    bateria_por_vencer: "Batería por Vencer",
    mantenimiento_requerido: "Mantenimiento Requerido",
    equipo_fuera_servicio: "Equipo Fuera de Servicio"
  };
  const ESTADO_SOL_LABELS = { pendiente: "Pendiente", en_proceso: "En Proceso", finalizada: "Finalizada" };
  const ESTADO_SOL_COLORS = { pendiente: "#d97706", en_proceso: "#2563eb", finalizada: "#16a34a" };
  const TIPO_SOL_LABELS = {
    compra_repuestos: "Compra Repuestos",
    cambio_parches: "Cambio Parches",
    mantenimiento_preventivo: "Mant. Preventivo",
    mantenimiento_correctivo: "Mant. Correctivo",
    revision_tecnica: "Revisión Técnica",
    otros: "Otros"
  };

  const generarPDFAlertas = () => {
    setGenerandoAlertas(true);

    const criticas = alertasFiltradas.filter(a => a.nivel === "critica");
    const advertencias = alertasFiltradas.filter(a => a.nivel === "advertencia");
    const info = alertasFiltradas.filter(a => a.nivel === "info");

    const filas = alertasFiltradas
      .sort((a,b) => {
        const ord = { critica: 0, advertencia: 1, info: 2 };
        return (ord[a.nivel]||3) - (ord[b.nivel]||3);
      })
      .map(al => {
        const eq = equipos.find(e => e.id === al.equipo_id);
        const color = NIVEL_COLORS[al.nivel] || "#64748b";
        return `<tr>
          <td><span style="background:${color}18;color:${color};padding:2px 7px;border-radius:4px;font-size:8.5px;font-weight:700">${NIVEL_LABELS[al.nivel]||al.nivel}</span></td>
          <td>${TIPO_ALERTA_LABELS[al.tipo]||al.tipo}</td>
          <td>${eq ? `${eq.marca} ${eq.modelo}` : "—"}</td>
          <td>${al.centro||"—"}${al.subsede?" / "+al.subsede:""}</td>
          <td style="word-break:break-word">${al.descripcion||"—"}</td>
        </tr>`;
      }).join("");

    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/>
<title>Reporte de Alertas Activas</title>
<style>
  @page { size: A4; margin: 12mm 10mm 18mm 10mm; }
  @media print { .no-print{display:none!important;} body{background:white!important;padding:0!important;} }
  * { box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  body { font-family:'Segoe UI',Arial,sans-serif; background:#f1f5f9; margin:0; padding:16px; color:#1e293b; }
  .page { background:white; max-width:190mm; margin:0 auto; padding:16px; }
  .header-bar { background:linear-gradient(135deg,#7f1d1d,#dc2626); border-radius:10px; padding:14px 20px; display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; }
  .header-bar h1 { color:white; margin:0; font-size:16px; font-weight:800; }
  .header-bar p { color:rgba(255,255,255,0.7); margin:3px 0 0; font-size:9.5px; }
  .header-right { text-align:right; color:rgba(255,255,255,0.8); font-size:9px; line-height:1.6; }
  .summary-bar { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin-bottom:12px; }
  .sum-card { border-radius:8px; padding:8px 10px; text-align:center; border:1px solid #e2e8f0; }
  .sum-card .n { font-size:20px; font-weight:800; }
  .sum-card .l { font-size:8px; color:#64748b; text-transform:uppercase; font-weight:600; margin-top:1px; }
  table { width:100%; border-collapse:collapse; font-size:9.5px; }
  thead th { background:#f8fafc; padding:6px 8px; text-align:left; font-size:8.5px; font-weight:700; color:#64748b; text-transform:uppercase; border-bottom:2px solid #e2e8f0; }
  tbody td { padding:6px 8px; border-bottom:1px solid #f1f5f9; vertical-align:top; }
  tbody tr:nth-child(even) td { background:#f8fafc; }
  .footer-bar { text-align:center; padding:10px 0 0; font-size:8.5px; color:#94a3b8; border-top:1px solid #e2e8f0; margin-top:14px; }
  .print-btn { position:fixed; bottom:20px; right:20px; background:linear-gradient(135deg,#dc2626,#b91c1c); color:white; border:none; border-radius:10px; padding:12px 24px; font-size:13px; font-weight:700; cursor:pointer; box-shadow:0 4px 14px rgba(220,38,38,0.4); }
</style></head><body>
<div class="page">
  <div class="header-bar">
    <div>
      <h1>🔔 Reporte de Alertas Activas</h1>
      <p>${filtroCentro||"Todos los centros"}</p>
    </div>
    <div class="header-right">Corporación Municipal de Panguipulli<br/>Departamento de Informática<br/>Generado: ${format(hoy,"dd/MM/yyyy")} a las ${format(hoy,"HH:mm")} hrs</div>
  </div>
  <div class="summary-bar">
    <div class="sum-card" style="background:#fee2e2;border-color:#fca5a5"><div class="n" style="color:#dc2626">${criticas.length}</div><div class="l">Críticas</div></div>
    <div class="sum-card" style="background:#fef9c3;border-color:#fde047"><div class="n" style="color:#ca8a04">${advertencias.length}</div><div class="l">Advertencias</div></div>
    <div class="sum-card" style="background:#eff6ff;border-color:#bfdbfe"><div class="n" style="color:#2563eb">${info.length}</div><div class="l">Informativas</div></div>
  </div>
  ${alertasFiltradas.length === 0
    ? '<p style="text-align:center;color:#94a3b8;padding:20px">Sin alertas activas</p>'
    : `<table><thead><tr><th>Nivel</th><th>Tipo</th><th>Equipo</th><th>Centro</th><th>Descripción</th></tr></thead><tbody>${filas}</tbody></table>`
  }
  <div class="footer-bar"><strong>Corporación Municipal de Panguipulli</strong> &nbsp;–&nbsp; Informe elaborado por departamento de informática<br/><span style="font-size:8px">Documento generado automáticamente el ${format(hoy,"dd/MM/yyyy")} a las ${format(hoy,"HH:mm")} hrs &nbsp;|&nbsp; Sistema de Gestión de Equipos Médicos</span></div>
</div>
<button class="print-btn no-print" onclick="window.print()">🖨️ Imprimir / Guardar PDF</button>
</body></html>`;

    const blob = new Blob([html], { type: "text/html" });
    window.open(URL.createObjectURL(blob), "_blank");
    setGenerandoAlertas(false);
  };

  const generarPDFSolicitudes = () => {
    setGenerandoSolicitudes(true);

    const pendientes = solicitudesFiltradas.filter(s => s.estado === "pendiente");
    const enProceso = solicitudesFiltradas.filter(s => s.estado === "en_proceso");
    const finalizadas = solicitudesFiltradas.filter(s => s.estado === "finalizada");

    const filas = solicitudesFiltradas
      .sort((a,b) => {
        const ord = { pendiente: 0, en_proceso: 1, finalizada: 2 };
        return (ord[a.estado]||3) - (ord[b.estado]||3);
      })
      .map(sol => {
        const eq = equipos.find(e => e.id === sol.equipo_id);
        const color = ESTADO_SOL_COLORS[sol.estado] || "#64748b";
        return `<tr>
          <td>${sol.fecha||"—"}</td>
          <td>${TIPO_SOL_LABELS[sol.tipo]||sol.tipo}</td>
          <td>${eq ? `${eq.marca} ${eq.modelo}` : "—"}</td>
          <td>${sol.centro||"—"}</td>
          <td>${sol.usuario_nombre||"—"}</td>
          <td><span style="background:${color}18;color:${color};padding:2px 7px;border-radius:4px;font-size:8.5px;font-weight:700">${ESTADO_SOL_LABELS[sol.estado]||sol.estado}</span></td>
          <td style="word-break:break-word">${sol.observaciones||"—"}</td>
        </tr>`;
      }).join("");

    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/>
<title>Reporte de Solicitudes</title>
<style>
  @page { size: A4 portrait; margin: 12mm 10mm 18mm 10mm; }
  @media print { .no-print{display:none!important;} body{background:white!important;padding:0!important;} }
  * { box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  body { font-family:'Segoe UI',Arial,sans-serif; background:#f1f5f9; margin:0; padding:16px; color:#1e293b; }
  .page { background:white; max-width:190mm; margin:0 auto; padding:16px; }
  .header-bar { background:linear-gradient(135deg,#1e3a5f,#2563eb); border-radius:10px; padding:14px 20px; display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; }
  .header-bar h1 { color:white; margin:0; font-size:16px; font-weight:800; }
  .header-bar p { color:rgba(255,255,255,0.7); margin:3px 0 0; font-size:9.5px; }
  .header-right { text-align:right; color:rgba(255,255,255,0.8); font-size:9px; line-height:1.6; }
  .summary-bar { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin-bottom:12px; }
  .sum-card { border-radius:8px; padding:8px 10px; text-align:center; border:1px solid #e2e8f0; }
  .sum-card .n { font-size:20px; font-weight:800; }
  .sum-card .l { font-size:8px; color:#64748b; text-transform:uppercase; font-weight:600; margin-top:1px; }
  table { width:100%; border-collapse:collapse; font-size:8.5px; table-layout:fixed; }
  thead th { background:#f8fafc; padding:5px 6px; text-align:left; font-size:8px; font-weight:700; color:#64748b; text-transform:uppercase; border-bottom:2px solid #e2e8f0; overflow:hidden; }
  tbody td { padding:5px 6px; border-bottom:1px solid #f1f5f9; vertical-align:top; word-break:break-word; overflow-wrap:break-word; }
  tbody tr:nth-child(even) td { background:#f8fafc; }
  .footer-bar { text-align:center; padding:10px 0 0; font-size:8.5px; color:#94a3b8; border-top:1px solid #e2e8f0; margin-top:14px; }
  .print-btn { position:fixed; bottom:20px; right:20px; background:linear-gradient(135deg,#1565c0,#0288d1); color:white; border:none; border-radius:10px; padding:12px 24px; font-size:13px; font-weight:700; cursor:pointer; box-shadow:0 4px 14px rgba(21,101,192,0.4); }
</style></head><body>
<div class="page">
  <div class="header-bar">
    <div>
      <h1>📋 Reporte de Solicitudes</h1>
      <p>${filtroCentro||"Todos los centros"}</p>
    </div>
    <div class="header-right">Corporación Municipal de Panguipulli<br/>Departamento de Informática<br/>Generado: ${format(hoy,"dd/MM/yyyy")} a las ${format(hoy,"HH:mm")} hrs</div>
  </div>
  <div class="summary-bar">
    <div class="sum-card" style="background:#fef9c3;border-color:#fde047"><div class="n" style="color:#ca8a04">${pendientes.length}</div><div class="l">Pendientes</div></div>
    <div class="sum-card" style="background:#eff6ff;border-color:#bfdbfe"><div class="n" style="color:#2563eb">${enProceso.length}</div><div class="l">En Proceso</div></div>
    <div class="sum-card" style="background:#dcfce7;border-color:#86efac"><div class="n" style="color:#16a34a">${finalizadas.length}</div><div class="l">Finalizadas</div></div>
  </div>
  ${solicitudesFiltradas.length === 0
    ? '<p style="text-align:center;color:#94a3b8;padding:20px">Sin solicitudes registradas</p>'
    : `<table><thead><tr><th style="width:9%">Fecha</th><th style="width:16%">Tipo</th><th style="width:15%">Equipo</th><th style="width:15%">Centro</th><th style="width:13%">Solicitante</th><th style="width:10%">Estado</th><th style="width:22%">Observaciones</th></tr></thead><tbody>${filas}</tbody></table>`
  }
  <div class="footer-bar"><strong>Corporación Municipal de Panguipulli</strong> &nbsp;–&nbsp; Informe elaborado por departamento de informática<br/><span style="font-size:8px">Documento generado automáticamente el ${format(hoy,"dd/MM/yyyy")} a las ${format(hoy,"HH:mm")} hrs &nbsp;|&nbsp; Sistema de Gestión de Equipos Médicos</span></div>
</div>
<button class="print-btn no-print" onclick="window.print()">🖨️ Imprimir / Guardar PDF</button>
</body></html>`;

    const blob = new Blob([html], { type: "text/html" });
    window.open(URL.createObjectURL(blob), "_blank");
    setGenerandoSolicitudes(false);
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const alertasActivas = alertasFiltradas.length;
  const solPendientes = solicitudesFiltradas.filter(s => s.estado === "pendiente").length;

  // Cada área ve solo sus propios reportes; Base del Sistema y Monitor
  // Corporativo ven ambos.
  const veReportesSalud = esSuperAdmin(user?.role) || esMonitorCorporativo(user?.role) || user?.role === "admin" || user?.role === "encargado_salud";
  const veReportesTaller = esSuperAdmin(user?.role) || esMonitorCorporativo(user?.role) || esRolTaller(user?.role);

  return (
    <div className="min-h-screen" style={{ background: "#e8f4fd" }}>
      <div className="relative overflow-hidden px-6 lg:px-10 pt-10 pb-8" style={{ background: "linear-gradient(135deg, #0f2d6b 0%, #1565c0 40%, #29b6f6 100%)" }}>
        <div className="relative max-w-4xl mx-auto flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: "rgba(255,255,255,0.2)" }}>
            <FileText className="w-6 h-6 text-white" />
          </div>
          <div>
            <p className="text-cyan-200 text-xs font-semibold uppercase tracking-widest">Documentos</p>
            <h1 className="text-3xl font-bold text-white">Reportes</h1>
            <p className="text-blue-100 text-sm mt-0.5">Generación de informes en PDF</p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 lg:px-10 pt-6 pb-10 space-y-5">

        {veReportesSalud && (
        <div className="bg-white rounded-2xl shadow p-5">
          <h2 className="text-sm font-bold text-slate-700 flex items-center gap-2 mb-3">
            <Filter className="w-4 h-4 text-blue-500" /> Filtro por Centro
          </h2>
          <select
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            value={filtroCentro}
            onChange={e => setFiltroCentro(e.target.value)}
          >
            <option value="">Todos los centros</option>
            {CENTROS_ESTRUCTURA.map(c => <option key={c.nombre} value={c.nombre}>{c.nombre}</option>)}
          </select>
        </div>
        )}

        {veReportesSalud && (<>
        {/* Reporte Alertas */}
        <div className="bg-white rounded-2xl shadow p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "#fee2e2" }}>
                <Bell className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800">Reporte de Alertas Activas</h3>
                <p className="text-xs text-slate-400 mt-0.5">Alertas críticas, advertencias e informativas vigentes</p>
              </div>
            </div>
            <span className="text-xl font-bold text-red-500">{alertasActivas}</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Críticas", n: alertasFiltradas.filter(a=>a.nivel==="critica").length, color: "#dc2626", bg: "#fee2e2" },
              { label: "Advertencias", n: alertasFiltradas.filter(a=>a.nivel==="advertencia").length, color: "#ca8a04", bg: "#fef9c3" },
              { label: "Informativas", n: alertasFiltradas.filter(a=>a.nivel==="info").length, color: "#2563eb", bg: "#eff6ff" }
            ].map(s => (
              <div key={s.label} className="rounded-xl p-3 text-center" style={{ background: s.bg }}>
                <p className="text-xl font-bold" style={{ color: s.color }}>{s.n}</p>
                <p className="text-xs font-medium mt-0.5" style={{ color: s.color }}>{s.label}</p>
              </div>
            ))}
          </div>
          <button
            onClick={generarPDFAlertas}
            disabled={generandoAlertas}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white disabled:opacity-60"
            style={{ background: "linear-gradient(135deg,#dc2626,#b91c1c)" }}
          >
            {generandoAlertas ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            {generandoAlertas ? "Generando..." : "Generar PDF de Alertas"}
          </button>
        </div>

        {/* Reporte Solicitudes */}
        <div className="bg-white rounded-2xl shadow p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "#eff6ff" }}>
                <ClipboardList className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800">Reporte de Solicitudes</h3>
                <p className="text-xs text-slate-400 mt-0.5">Historial completo de solicitudes de mantenimiento y compras</p>
              </div>
            </div>
            <span className="text-xl font-bold text-blue-500">{solicitudesFiltradas.length}</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Pendientes", n: solicitudesFiltradas.filter(s=>s.estado==="pendiente").length, color: "#ca8a04", bg: "#fef9c3" },
              { label: "En Proceso", n: solicitudesFiltradas.filter(s=>s.estado==="en_proceso").length, color: "#2563eb", bg: "#eff6ff" },
              { label: "Finalizadas", n: solicitudesFiltradas.filter(s=>s.estado==="finalizada").length, color: "#16a34a", bg: "#dcfce7" }
            ].map(s => (
              <div key={s.label} className="rounded-xl p-3 text-center" style={{ background: s.bg }}>
                <p className="text-xl font-bold" style={{ color: s.color }}>{s.n}</p>
                <p className="text-xs font-medium mt-0.5" style={{ color: s.color }}>{s.label}</p>
              </div>
            ))}
          </div>
          <button
            onClick={generarPDFSolicitudes}
            disabled={generandoSolicitudes}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white disabled:opacity-60"
            style={{ background: "linear-gradient(135deg,#1565c0,#0288d1)" }}
          >
            {generandoSolicitudes ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            {generandoSolicitudes ? "Generando..." : "Generar PDF de Solicitudes"}
          </button>
        </div>
        </>)}

        {/* Reporte de Taller */}
        {veReportesTaller && <ReporteTaller />}

      </div>
    </div>
  );
}