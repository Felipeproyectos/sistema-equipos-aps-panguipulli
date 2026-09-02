import { format, parseISO } from "date-fns";

const ESTADO_STYLES = {
  pendiente: { bg: "#fef9c3", color: "#ca8a04", label: "PENDIENTE" },
  asignada: { bg: "#dbeafe", color: "#2563eb", label: "ASIGNADA" },
  en_proceso: { bg: "#ede9fe", color: "#7c3aed", label: "EN PROCESO" },
  pausada: { bg: "#f1f5f9", color: "#64748b", label: "PAUSADA" },
  completada: { bg: "#dcfce7", color: "#16a34a", label: "COMPLETADA" },
  cancelada: { bg: "#fee2e2", color: "#dc2626", label: "CANCELADA" },
};

const PRIORIDAD_LABEL = { alta: "Alta", media: "Media", baja: "Baja" };

const clp = (n) => `$${(Number(n) || 0).toLocaleString("es-CL")}`;

const fmtFecha = (f) => {
  if (!f) return "—";
  try { return format(parseISO(f), "dd/MM/yyyy"); } catch { return f; }
};
const fmtFechaHora = (f) => {
  if (!f) return "—";
  try { return format(new Date(f), "dd/MM/yyyy HH:mm"); } catch { return f; }
};

export function generarPDFOrdenTrabajo(ot) {
  const hoy = new Date();
  const est = ESTADO_STYLES[ot.estado] || { bg: "#f1f5f9", color: "#64748b", label: ot.estado };

  const repuestos = ot.repuestos_utilizados || [];
  const filasRepuestos = repuestos.length === 0
    ? `<tr><td colspan="4" style="text-align:center;color:#94a3b8;padding:10px">Sin repuestos registrados</td></tr>`
    : repuestos.map((r, i) => `<tr style="${i % 2 === 1 ? "background:#f8fafc" : ""}">
        <td style="padding:4px 6px">${r.nombre || r.repuesto_nombre || "—"}</td>
        <td style="padding:4px 6px;text-align:center">${r.cantidad ?? "—"}</td>
        <td style="padding:4px 6px;text-align:right">${r.precio_unitario != null ? clp(r.precio_unitario) : "—"}</td>
        <td style="padding:4px 6px;text-align:right">${r.subtotal != null ? clp(r.subtotal) : "—"}</td>
      </tr>`).join("");

  const eventos = (ot.linea_tiempo || []).slice().sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
  const filasTimeline = eventos.length === 0
    ? `<tr><td colspan="3" style="text-align:center;color:#94a3b8;padding:10px">Sin eventos registrados</td></tr>`
    : eventos.map((e, i) => `<tr style="${i % 2 === 1 ? "background:#f8fafc" : ""}">
        <td style="padding:4px 6px;white-space:nowrap">${fmtFechaHora(e.fecha)}</td>
        <td style="padding:4px 6px;font-weight:600">${e.evento || "—"}${e.usuario_nombre ? `<div style="font-weight:400;color:#94a3b8;font-size:8.5px">${e.usuario_nombre}</div>` : ""}</td>
        <td style="padding:4px 6px;word-break:break-word">${e.notas || "—"}</td>
      </tr>`).join("");

  const seccionTable = (titulo, icono, color, bg, headers, filas, aligns = []) => `
    <div style="margin-top:16px">
      <div style="background:linear-gradient(135deg,${color},${bg});border-radius:8px;padding:8px 12px;margin-bottom:8px">
        <div style="font-size:11px;font-weight:700;color:white">${icono} ${titulo}</div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:9.5px">
        <thead><tr style="background:#f8fafc">${headers.map((h, i) => `<th style="padding:5px 6px;text-align:${aligns[i] || "left"};font-size:8.5px;font-weight:700;color:#64748b;text-transform:uppercase;border-bottom:2px solid #e2e8f0">${h}</th>`).join("")}</tr></thead>
        <tbody>${filas}</tbody>
      </table>
    </div>`;

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/>
<title>Orden de Trabajo – ${ot.numero_ot}</title>
<style>
  @page { size: A4; margin: 12mm 10mm 18mm 10mm; }
  @media print { .no-print{display:none!important;} body{background:white!important;padding:0!important;} }
  * { box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  body { font-family:'Segoe UI',Arial,sans-serif; background:#f1f5f9; margin:0; padding:16px; color:#1e293b; }
  .page { background:white; max-width:190mm; margin:0 auto; padding:16px; }
  .footer-bar { text-align:center; padding:10px 0 0; font-size:8.5px; color:#94a3b8; border-top:2px solid #e2e8f0; margin-top:16px; }
  .print-btn { position:fixed; bottom:20px; right:20px; background:linear-gradient(135deg,#1565c0,#0288d1); color:white; border:none; border-radius:10px; padding:12px 24px; font-size:13px; font-weight:700; cursor:pointer; box-shadow:0 4px 14px rgba(21,101,192,0.4); }
</style></head><body>
<div class="page">

  <!-- ENCABEZADO -->
  <div style="background:linear-gradient(135deg,#0f172a,#1e293b,#334155);border-radius:12px;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
    <div>
      <div style="font-size:9.5px;color:rgba(255,255,255,0.6);text-transform:uppercase;letter-spacing:0.06em">Orden de Trabajo de Taller</div>
      <div style="font-size:17px;font-weight:800;color:white;margin-top:2px">${ot.numero_ot}</div>
      <div style="font-size:9.5px;color:rgba(255,255,255,0.7);margin-top:3px">${ot.equipo_label || "—"}${ot.patente ? ` · ${ot.patente}` : ""}</div>
    </div>
    <div style="text-align:right;color:rgba(255,255,255,0.8);font-size:9px;line-height:1.7">
      Corporación Municipal de Panguipulli<br/>Módulo de Taller<br/>Generado: ${format(hoy, "dd/MM/yyyy")} a las ${format(hoy, "HH:mm")} hrs
    </div>
  </div>

  <!-- BADGES -->
  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:6px">
    <span style="padding:5px 12px;border-radius:7px;background:${est.bg};color:${est.color};font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em">${est.label}</span>
    <span style="padding:5px 12px;border-radius:7px;background:#eff6ff;color:#2563eb;font-size:9px;font-weight:700;text-transform:uppercase">Prioridad ${PRIORIDAD_LABEL[ot.prioridad] || ot.prioridad || "—"}</span>
    <span style="padding:5px 12px;border-radius:7px;background:#f5f3ff;color:#7c3aed;font-size:9px;font-weight:700;text-transform:uppercase">${ot.tipo_activo === "externo" ? "Vehículo Externo" : "Vehículo Corporativo"}</span>
  </div>

  <!-- DATOS GENERALES -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:12px">
    <div>
      <div style="font-size:10px;font-weight:700;color:#1e3a5f;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #e2e8f0;padding-bottom:4px;margin-bottom:8px">Datos de la Orden</div>
      <table style="width:100%;font-size:9.5px;border-collapse:collapse">
        <tr><td style="padding:3px 0;color:#94a3b8;width:42%">Vehículo</td><td style="padding:3px 0;font-weight:600">${ot.equipo_label || "—"}</td></tr>
        ${ot.marca_modelo ? `<tr><td style="padding:3px 0;color:#94a3b8">Marca / Modelo</td><td style="padding:3px 0;font-weight:600">${ot.marca_modelo}</td></tr>` : ""}
        ${ot.patente ? `<tr><td style="padding:3px 0;color:#94a3b8">Patente</td><td style="padding:3px 0;font-weight:700;color:#1d4ed8">${ot.patente}</td></tr>` : ""}
        <tr><td style="padding:3px 0;color:#94a3b8">Mecánico</td><td style="padding:3px 0;font-weight:600">${ot.mecanico_nombre || ot.mecanico_email || "Sin asignar"}</td></tr>
        <tr><td style="padding:3px 0;color:#94a3b8">Reportado por</td><td style="padding:3px 0;font-weight:600">${ot.reportado_por_nombre || "—"}</td></tr>
        <tr><td style="padding:3px 0;color:#94a3b8">Origen</td><td style="padding:3px 0;font-weight:600;text-transform:capitalize">${(ot.origen || "—").replace(/_/g, " ")}</td></tr>
      </table>
    </div>
    <div>
      <div style="font-size:10px;font-weight:700;color:#1e3a5f;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #e2e8f0;padding-bottom:4px;margin-bottom:8px">Fechas y Horas</div>
      <table style="width:100%;font-size:9.5px;border-collapse:collapse">
        <tr><td style="padding:3px 0;color:#94a3b8;width:42%">Creación</td><td style="padding:3px 0;font-weight:600">${fmtFecha(ot.created_date)}</td></tr>
        <tr><td style="padding:3px 0;color:#94a3b8">Asignación</td><td style="padding:3px 0;font-weight:600">${fmtFechaHora(ot.fecha_asignacion)}</td></tr>
        <tr><td style="padding:3px 0;color:#94a3b8">Inicio</td><td style="padding:3px 0;font-weight:600">${fmtFecha(ot.fecha_inicio)}</td></tr>
        <tr><td style="padding:3px 0;color:#94a3b8">Término</td><td style="padding:3px 0;font-weight:600">${fmtFecha(ot.fecha_fin)}</td></tr>
        <tr><td style="padding:3px 0;color:#94a3b8">Horas reales</td><td style="padding:3px 0;font-weight:600">${ot.horas_reales != null ? ot.horas_reales : "—"}</td></tr>
      </table>
    </div>
  </div>

  <!-- PROBLEMA Y DIAGNÓSTICO -->
  <div style="margin-top:14px;padding:10px 14px;border-radius:8px;background:#fef2f2;border-left:4px solid #dc2626;font-size:9.5px;color:#7f1d1d">
    <strong>Problema reportado:</strong> ${ot.problema_reportado || "Sin descripción"}
  </div>
  <div style="margin-top:8px;padding:10px 14px;border-radius:8px;background:#eff6ff;border-left:4px solid #2563eb;font-size:9.5px;color:#1e40af">
    <strong>Diagnóstico técnico:</strong> ${ot.diagnostico || "Sin diagnóstico registrado."}
  </div>

  <!-- REPUESTOS -->
  ${seccionTable("Repuestos Utilizados", "🔩", "#c2410c", "#ea580c", ["Repuesto", "Cant.", "P. Unit.", "Subtotal"], filasRepuestos, ["left", "center", "right", "right"])}

  <!-- COSTOS -->
  <div style="margin-top:16px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
    <div style="border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px">
      <div style="font-size:8.5px;color:#94a3b8;text-transform:uppercase">Repuestos</div>
      <div style="font-size:15px;font-weight:800;color:#7c3aed;margin-top:2px">${clp(ot.total_repuestos)}</div>
    </div>
    <div style="border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px">
      <div style="font-size:8.5px;color:#94a3b8;text-transform:uppercase">Mano de Obra</div>
      <div style="font-size:15px;font-weight:800;color:#475569;margin-top:2px">${clp(ot.total_mano_obra)}</div>
    </div>
    <div style="border:2px solid #2563eb;border-radius:8px;padding:10px 12px;background:#eff6ff">
      <div style="font-size:8.5px;color:#2563eb;text-transform:uppercase">Total</div>
      <div style="font-size:15px;font-weight:800;color:#1d4ed8;margin-top:2px">${clp(ot.total)}</div>
    </div>
  </div>

  <!-- LÍNEA DE TIEMPO -->
  ${seccionTable("Línea de Tiempo", "⏱", "#334155", "#64748b", ["Fecha / Hora", "Evento", "Notas"], filasTimeline)}

  ${ot.notas_cierre ? `<div style="margin-top:14px;padding:10px 14px;border-radius:8px;background:#f0fdf4;border-left:4px solid #16a34a;font-size:9.5px;color:#166534"><strong>Notas de cierre:</strong> ${ot.notas_cierre}</div>` : ""}

  <!-- PIE -->
  <div class="footer-bar">
    <strong>Corporación Municipal de Panguipulli</strong> &nbsp;–&nbsp; Módulo de Taller<br/>
    <span style="font-size:8px">Documento generado automáticamente el ${format(hoy, "dd/MM/yyyy")} a las ${format(hoy, "HH:mm")} hrs &nbsp;|&nbsp; Sistema de Gestión de Equipos Médicos</span>
  </div>
</div>
<button class="print-btn no-print" onclick="window.print()">🖨️ Imprimir / Guardar PDF</button>
</body></html>`;

  const blob = new Blob([html], { type: "text/html" });
  window.open(URL.createObjectURL(blob), "_blank");
}