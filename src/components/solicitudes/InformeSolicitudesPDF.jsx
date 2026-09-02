import { useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { base44 } from "@/api/base44Client";

const TIPOS = {
  parches_adulto: "Parches Adulto",
  parches_nino: "Parches Niño",
  parches_mixto: "Parches Mixto",
  bateria: "Batería",
  mantenimiento: "Mantenimiento",
};

const ESTADO_COLOR = {
  pendiente: { bg: "#fff7ed", text: "#c2410c", label: "Pendiente" },
  aprobada: { bg: "#f0fdf4", text: "#15803d", label: "Aprobada" },
  rechazada: { bg: "#fef2f2", text: "#b91c1c", label: "Rechazada" },
  completada: { bg: "#eff6ff", text: "#1d4ed8", label: "Completada" },
};

export default function InformeSolicitudesPDF({ solicitudes, equipos }) {
  const [generando, setGenerando] = useState(false);

  const generarPDF = async () => {
    setGenerando(true);

    const appConfig = await base44.entities.AppConfig.list().catch(() => []);
    const logo = appConfig[0]?.logo_url || null;
    const appNombre = appConfig[0]?.nombre_app || "DEA Manager";

    const hoy = new Date();

    const resumen = {
      total: solicitudes.length,
      pendiente: solicitudes.filter(s => s.estado === "pendiente").length,
      aprobada: solicitudes.filter(s => s.estado === "aprobada").length,
      rechazada: solicitudes.filter(s => s.estado === "rechazada").length,
      completada: solicitudes.filter(s => s.estado === "completada").length,
    };

    const filas = solicitudes.map(s => {
      const eq = equipos.find(e => e.id === s.equipo_id);
      const est = ESTADO_COLOR[s.estado] || { bg: "#f8fafc", text: "#334155", label: s.estado };
      return `
        <tr>
          <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#1e293b;">
            ${TIPOS[s.tipo_solicitud] || s.tipo_solicitud}
          </td>
          <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#334155;">
            ${eq ? `${eq.marca} ${eq.modelo}` : "—"}
          </td>
          <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#334155;">
            ${eq?.establecimiento || "—"}
          </td>
          <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#475569;">
            ${s.cantidad ?? "—"}
          </td>
          <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;font-size:12px;color:#475569;max-width:200px;">
            ${s.descripcion || "—"}
          </td>
          <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;font-size:11px;color:#94a3b8;">
            ${s.solicitante_email || "—"}
          </td>
          <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;font-size:12px;">
            <span style="background:${est.bg};color:${est.text};padding:3px 10px;border-radius:20px;font-weight:600;white-space:nowrap;">
              ${est.label}
            </span>
          </td>
          <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;font-size:12px;color:#94a3b8;white-space:nowrap;">
            ${s.created_date ? format(new Date(s.created_date), "dd/MM/yyyy") : "—"}
          </td>
        </tr>
      `;
    }).join("");

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <title>Informe de Solicitudes</title>
  <style>
    @page { size: letter portrait; margin: 15mm 15mm 20mm 15mm; }
    @media print {
      body { margin: 0; padding: 0; background: white; }
      .no-print { display: none !important; }
      .page { padding: 0; }
      table { page-break-inside: auto; }
      tr { page-break-inside: avoid; }
    }
    * { box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Arial, sans-serif;
      background: #f0f4f8;
      margin: 0;
      padding: 20px;
      color: #1e293b;
    }
    .page { background: white; width: 100%; max-width: 186mm; margin: 0 auto; padding: 20px; }
    .header {
      background: linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%);
      border-radius: 10px;
      padding: 16px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
    }
    .header-left { display: flex; align-items: center; gap: 12px; }
    .header-logo { width: 56px; height: 56px; object-fit: contain; background: rgba(255,255,255,0.15); border-radius: 8px; padding: 3px; }
    .header-title { color: white; }
    .header-title h1 { margin: 0; font-size: 18px; font-weight: 700; }
    .header-title p { margin: 3px 0 0; font-size: 11px; color: rgba(255,255,255,0.75); }
    .header-right { text-align: right; color: rgba(255,255,255,0.85); font-size: 11px; line-height: 1.7; white-space: nowrap; }
    .resumen-grid {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 8px;
      margin-bottom: 16px;
    }
    .resumen-card {
      background: white;
      border-radius: 8px;
      padding: 10px 8px;
      text-align: center;
      box-shadow: 0 1px 3px rgba(0,0,0,0.07);
      border-top: 3px solid var(--card-color);
    }
    .resumen-card .num { font-size: 22px; font-weight: 700; color: var(--card-color); }
    .resumen-card .lbl { font-size: 9px; color: #64748b; margin-top: 2px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.3px; }
    .table-wrap { background: white; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.07); overflow: hidden; margin-bottom: 16px; }
    .table-header { padding: 10px 14px; border-bottom: 2px solid #f1f5f9; }
    .table-header h2 { margin: 0; font-size: 13px; font-weight: 700; color: #1e293b; }
    table { width: 100%; border-collapse: collapse; font-size: 10px; table-layout: fixed; }
    col.col-tipo { width: 12%; }
    col.col-equipo { width: 13%; }
    col.col-estab { width: 15%; }
    col.col-cant { width: 7%; }
    col.col-desc { width: 18%; }
    col.col-sol { width: 18%; }
    col.col-estado { width: 10%; }
    col.col-fecha { width: 7%; }
    thead tr { background: #f8fafc; }
    thead th { padding: 8px 6px; text-align: left; font-size: 9px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.4px; border-bottom: 2px solid #e2e8f0; overflow: hidden; }
    tbody td { padding: 7px 6px; border-bottom: 1px solid #f1f5f9; vertical-align: top; word-wrap: break-word; overflow-wrap: break-word; }
    tbody tr:nth-child(even) { background: #f8fafc; }
    .footer { text-align: center; padding: 12px 0 0; font-size: 9px; color: #94a3b8; border-top: 1px solid #e2e8f0; margin-top: 8px; }
    .print-btn {
      position: fixed; bottom: 20px; right: 20px;
      background: #2563eb; color: white; border: none; border-radius: 10px;
      padding: 10px 20px; font-size: 13px; font-weight: 600; cursor: pointer;
      box-shadow: 0 4px 14px rgba(37,99,235,0.4);
    }
  </style>
</head>
<body>
<div class="page">
  <div class="header">
    <div class="header-left">
      ${logo ? `<img src="${logo}" class="header-logo" alt="Logo"/>` : ""}
      <div class="header-title">
        <h1>Informe de Solicitudes</h1>
        <p>${appNombre} — Gestión de Stock y Mantenimiento</p>
      </div>
    </div>
    <div class="header-right">
      <div><strong>Fecha:</strong> ${format(hoy, "dd/MM/yyyy")}</div>
      <div><strong>Hora:</strong> ${format(hoy, "HH:mm")} hrs</div>
      <div><strong>Total:</strong> ${resumen.total} solicitud(es)</div>
    </div>
  </div>

  <div class="resumen-grid">
    <div class="resumen-card" style="--card-color:#64748b"><div class="num">${resumen.total}</div><div class="lbl">Total</div></div>
    <div class="resumen-card" style="--card-color:#ea580c"><div class="num">${resumen.pendiente}</div><div class="lbl">Pendientes</div></div>
    <div class="resumen-card" style="--card-color:#16a34a"><div class="num">${resumen.aprobada}</div><div class="lbl">Aprobadas</div></div>
    <div class="resumen-card" style="--card-color:#1d4ed8"><div class="num">${resumen.completada}</div><div class="lbl">Completadas</div></div>
    <div class="resumen-card" style="--card-color:#dc2626"><div class="num">${resumen.rechazada}</div><div class="lbl">Rechazadas</div></div>
  </div>

  <div class="table-wrap">
    <div class="table-header"><h2>📋 Detalle de Solicitudes</h2></div>
    <table>
      <colgroup>
        <col style="width:11%"/><col style="width:13%"/><col style="width:14%"/><col style="width:6%"/><col style="width:18%"/><col style="width:19%"/><col style="width:11%"/><col style="width:8%"/>
      </colgroup>
      <thead>
        <tr>
          <th>Tipo</th><th>Equipo</th><th>Establecimiento</th><th>Cant.</th><th>Descripción</th><th>Solicitante</th><th>Estado</th><th>Fecha</th>
        </tr>
      </thead>
      <tbody>
        ${filas || `<tr><td colspan="8" style="text-align:center;padding:20px;color:#94a3b8;">Sin solicitudes registradas</td></tr>`}
      </tbody>
    </table>
  </div>

  <div class="footer">
    Corporación Municipal Panguipulli &nbsp;–&nbsp; Departamento Informática &nbsp;–&nbsp; Área Salud<br/>
    Informe generado automáticamente el ${format(hoy, "dd/MM/yyyy")} a las ${format(hoy, "HH:mm")} hrs
  </div>
</div>

<button class="print-btn no-print" onclick="window.print()">🖨️ Imprimir / Guardar PDF</button>
</body>
</html>
    `;

    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setGenerando(false);
  };

  return (
    <button
      onClick={generarPDF}
      disabled={generando}
      className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white shadow-sm transition-all hover:opacity-90 disabled:opacity-60"
      style={{ background: "#6366f1" }}
    >
      {generando ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
      {generando ? "Generando..." : "Exportar Informe PDF"}
    </button>
  );
}