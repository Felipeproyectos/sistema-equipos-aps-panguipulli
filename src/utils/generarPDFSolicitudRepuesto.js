import { format, parseISO } from "date-fns";

const ESTADO_STYLES = {
  pendiente: { bg: "#fef9c3", color: "#ca8a04", label: "PENDIENTE" },
  aprobada: { bg: "#dcfce7", color: "#16a34a", label: "APROBADA" },
  rechazada: { bg: "#fee2e2", color: "#dc2626", label: "RECHAZADA" },
  comprada: { bg: "#dbeafe", color: "#2563eb", label: "COMPRA EJECUTADA" },
};

const SEGUIMIENTO = {
  pendiente: "Enviada al Encargado de Compras de Taller — en espera de gestión.",
  aprobada: "Aprobada — compra pendiente de ejecución por Compras de Taller.",
  rechazada: "Solicitud rechazada. No se ejecutará la compra.",
  comprada: "✔ Compra ejecutada por Compras de Taller.",
};

const fmtFecha = (f) => {
  if (!f) return "—";
  try { return format(parseISO(f), "dd/MM/yyyy"); } catch { return f; }
};

export function generarPDFSolicitudRepuesto(sol) {
  const hoy = new Date();
  const est = ESTADO_STYLES[sol.estado] || ESTADO_STYLES.pendiente;

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/>
<title>Solicitud de Repuesto – ${sol.numero_solicitud || ""}</title>
<style>
  @page { size: A4; margin: 12mm 10mm 18mm 10mm; }
  @media print { .no-print{display:none!important;} body{background:white!important;padding:0!important;} }
  * { box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  body { font-family:'Segoe UI',Arial,sans-serif; background:#f1f5f9; margin:0; padding:16px; color:#1e293b; }
  .page { background:white; max-width:190mm; margin:0 auto; padding:16px; }
  .footer-bar { text-align:center; padding:10px 0 0; font-size:8.5px; color:#94a3b8; border-top:2px solid #e2e8f0; margin-top:20px; }
  .print-btn { position:fixed; bottom:20px; right:20px; background:linear-gradient(135deg,#b45309,#d97706); color:white; border:none; border-radius:10px; padding:12px 24px; font-size:13px; font-weight:700; cursor:pointer; box-shadow:0 4px 14px rgba(217,119,6,0.4); }
</style></head><body>
<div class="page">

  <!-- ENCABEZADO -->
  <div style="background:linear-gradient(135deg,#0f172a,#1e293b,#334155);border-radius:12px;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
    <div>
      <div style="font-size:9.5px;color:rgba(255,255,255,0.6);text-transform:uppercase;letter-spacing:0.06em">Solicitud de Compra de Repuesto</div>
      <div style="font-size:17px;font-weight:800;color:white;margin-top:2px">${sol.numero_solicitud || "—"}</div>
      <div style="font-size:9.5px;color:rgba(255,255,255,0.7);margin-top:3px">${sol.repuesto_nombre || "—"}</div>
    </div>
    <div style="text-align:right;color:rgba(255,255,255,0.8);font-size:9px;line-height:1.7">
      Corporación Municipal de Panguipulli<br/>Módulo de Taller<br/>Generado: ${format(hoy, "dd/MM/yyyy")} a las ${format(hoy, "HH:mm")} hrs
    </div>
  </div>

  <!-- BADGES -->
  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:6px">
    <span style="padding:5px 12px;border-radius:7px;background:${est.bg};color:${est.color};font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em">${est.label}</span>
    <span style="padding:5px 12px;border-radius:7px;background:#fff7ed;color:#c2410c;font-size:9px;font-weight:700;text-transform:uppercase">Urgencia ${sol.urgencia || "media"}</span>
    <span style="padding:5px 12px;border-radius:7px;background:#f5f3ff;color:#7c3aed;font-size:9px;font-weight:700;text-transform:uppercase">${sol.categoria || "otros"}</span>
  </div>

  <!-- DATOS -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:12px">
    <div>
      <div style="font-size:10px;font-weight:700;color:#1e3a5f;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #e2e8f0;padding-bottom:4px;margin-bottom:8px">Detalle de la Solicitud</div>
      <table style="width:100%;font-size:9.5px;border-collapse:collapse">
        <tr><td style="padding:3px 0;color:#94a3b8;width:42%">Repuesto</td><td style="padding:3px 0;font-weight:700">${sol.repuesto_nombre || "—"}</td></tr>
        <tr><td style="padding:3px 0;color:#94a3b8">Cantidad</td><td style="padding:3px 0;font-weight:600">${sol.cantidad ?? 1} unidad(es)</td></tr>
        <tr><td style="padding:3px 0;color:#94a3b8">Categoría</td><td style="padding:3px 0;font-weight:600;text-transform:capitalize">${sol.categoria || "otros"}</td></tr>
        ${sol.orden_trabajo_label ? `<tr><td style="padding:3px 0;color:#94a3b8">Orden de trabajo</td><td style="padding:3px 0;font-weight:600">${sol.orden_trabajo_label}</td></tr>` : ""}
      </table>
    </div>
    <div>
      <div style="font-size:10px;font-weight:700;color:#1e3a5f;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #e2e8f0;padding-bottom:4px;margin-bottom:8px">Solicitante y Fechas</div>
      <table style="width:100%;font-size:9.5px;border-collapse:collapse">
        <tr><td style="padding:3px 0;color:#94a3b8;width:42%">Solicitante</td><td style="padding:3px 0;font-weight:600">${sol.solicitante_nombre || sol.solicitante_email || "—"}</td></tr>
        <tr><td style="padding:3px 0;color:#94a3b8">Fecha solicitud</td><td style="padding:3px 0;font-weight:600">${fmtFecha(sol.fecha_solicitud || sol.created_date)}</td></tr>
        <tr><td style="padding:3px 0;color:#94a3b8">Revisado por</td><td style="padding:3px 0;font-weight:600">${sol.aprobador_nombre || sol.aprobador_email || "Pendiente"}</td></tr>
        <tr><td style="padding:3px 0;color:#94a3b8">Fecha revisión</td><td style="padding:3px 0;font-weight:600">${fmtFecha(sol.fecha_aprobacion)}</td></tr>
      </table>
    </div>
  </div>

  <!-- MOTIVO -->
  <div style="margin-top:14px;padding:10px 14px;border-radius:8px;background:#fffbeb;border-left:4px solid #d97706;font-size:9.5px;color:#78350f">
    <strong>Motivo / justificación:</strong> ${sol.motivo || "Sin justificación registrada."}
  </div>

  ${sol.comentario_aprobador ? `<div style="margin-top:8px;padding:10px 14px;border-radius:8px;background:#eff6ff;border-left:4px solid #2563eb;font-size:9.5px;color:#1e40af"><strong>Comentario del revisor:</strong> ${sol.comentario_aprobador}</div>` : ""}

  <!-- SEGUIMIENTO -->
  <div style="margin-top:14px">
    <div style="background:linear-gradient(135deg,#334155,#64748b);border-radius:8px;padding:8px 12px;margin-bottom:8px">
      <div style="font-size:11px;font-weight:700;color:white">📋 Seguimiento de la Compra</div>
    </div>
    <div style="padding:12px 14px;border:1px solid #e2e8f0;border-radius:8px;font-size:10px;font-weight:600;color:${est.color};background:${est.bg}">
      ${SEGUIMIENTO[sol.estado] || "—"}
    </div>
  </div>

  <!-- FIRMAS -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-top:40px">
    <div style="text-align:center;font-size:9px;color:#64748b"><div style="border-top:1px solid #94a3b8;padding-top:6px">Firma Solicitante<br/><strong>${sol.solicitante_nombre || ""}</strong></div></div>
    <div style="text-align:center;font-size:9px;color:#64748b"><div style="border-top:1px solid #94a3b8;padding-top:6px">Firma Compras de Taller</div></div>
  </div>

  <!-- PIE -->
  <div class="footer-bar">
    <strong>Corporación Municipal de Panguipulli</strong> &nbsp;–&nbsp; Módulo de Taller<br/>
    <span style="font-size:8px">Documento generado automáticamente el ${format(hoy, "dd/MM/yyyy")} a las ${format(hoy, "HH:mm")} hrs &nbsp;|&nbsp; Sistema de Gestión de Equipos</span>
  </div>
</div>
<button class="print-btn no-print" onclick="window.print()">🖨️ Imprimir / Guardar PDF</button>
</body></html>`;

  const blob = new Blob([html], { type: "text/html" });
  window.open(URL.createObjectURL(blob), "_blank");
}