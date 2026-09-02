import { format, parseISO } from "date-fns";

const TIPO_LABELS = {
  dea: "DEA",
  monitor_desfibrilador: "Monitor Desfibrilador",
  ambulancia: "Ambulancia",
  monitor_multiparametros: "Monitor Multiparámetros"
};

const TIPO_INSP = {
  inspeccion_semanal: "Pauta Semanal",
  inspeccion_anual: "Pauta Anual",
  inspeccion_rutinaria: "Pauta Diaria",
  inspeccion: "Inspección General",
  error_calibracion: "Error de Calibración",
  incidente: "Incidente"
};

// Normaliza un valor de checklist a { estado, obs }
function normItem(v) {
  if (typeof v === "string") return { estado: v, obs: "" };
  if (v && typeof v === "object") return { estado: v.estado || "", obs: v.obs || "" };
  return { estado: "", obs: "" };
}

const PARCHES_LABELS = {
  parches_adulto: "Parches Adulto",
  parches_pediatrico: "Parches Pediátrico",
  parches_mixto: "Parches Mixto",
};

function checklistHtml(datos) {
  if (!datos?.checklist) return "";
  const entries = Object.entries(datos.checklist).filter(([, v]) => {
    const { estado } = normItem(v);
    return !!estado;
  });
  if (entries.length === 0) return "";
  const filas = entries.map(([item, v]) => {
    const { estado, obs } = normItem(v);
    const simb = estado === "ok" ? "✓" : estado === "malo" ? "✗" : "N/A";
    const color = estado === "ok" ? "#16a34a" : estado === "malo" ? "#dc2626" : "#94a3b8";
    return `<tr>
      <td style="padding:3px 6px;color:${color};font-weight:700;width:20px;text-align:center">${simb}</td>
      <td style="padding:3px 6px">${item}</td>
      <td style="padding:3px 6px;color:#64748b">${obs || "—"}</td>
    </tr>`;
  }).join("");
  return `<div style="margin-top:6px;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden">
    <div style="background:#f8fafc;padding:4px 8px;font-size:8.5px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em">Checklist</div>
    <table style="width:100%;border-collapse:collapse;font-size:9px">${filas}</table>
  </div>`;
}

function parchesHtml(datos) {
  if (!datos?.parches) return "";
  const entries = Object.entries(datos.parches).filter(([, v]) => {
    const { estado } = normItem(v);
    return !!estado;
  });
  if (entries.length === 0) return "";
  const filas = entries.map(([key, v]) => {
    const { estado, obs } = normItem(v);
    const simb = estado === "ok" ? "✓" : estado === "malo" ? "✗" : "N/A";
    const color = estado === "ok" ? "#16a34a" : estado === "malo" ? "#dc2626" : "#94a3b8";
    const label = PARCHES_LABELS[key] || key;
    return `<tr>
      <td style="padding:3px 6px;color:${color};font-weight:700;width:20px;text-align:center">${simb}</td>
      <td style="padding:3px 6px">${label}</td>
      <td style="padding:3px 6px;color:#64748b">${obs || "—"}</td>
    </tr>`;
  }).join("");
  return `<div style="margin-top:6px;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden">
    <div style="background:#f8fafc;padding:4px 8px;font-size:8.5px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em">Electrodos / Parches</div>
    <table style="width:100%;border-collapse:collapse;font-size:9px">${filas}</table>
  </div>`;
}

export function generarPDFHistorialInspecciones({ equipo, items, fechaDesde, fechaHasta }) {
  const hoy = new Date();
  const tipoLabel = TIPO_LABELS[equipo.tipo] || equipo.tipo;
  const total = items.length;
  const conFallas = items.filter(i => i.resultado === "fallas").length;
  const conObs = items.filter(i => i.resultado === "observaciones").length;
  const sinFallas = items.filter(i => i.resultado === "ok").length;
  const aprobadas = items.filter(i => i.estadoRevision === "aprobado").length;

  const tarjetas = total === 0
    ? `<div style="text-align:center;color:#94a3b8;padding:30px;border:1px dashed #cbd5e1;border-radius:8px">No hay inspecciones en el rango seleccionado</div>`
    : items.map((it, i) => {
        const tipo = TIPO_INSP[it.act.tipo] || it.act.tipo;
        const fecha = it.act.fecha || "—";
        const hora = it.act.created_date
          ? format(new Date(it.act.created_date), "HH:mm")
          : "";
        const inspector = it.act.usuario_nombre || "—";
        const aprobador = it.approver || "—";
        const fechaRev = it.approverDate ? format(parseISO(it.approverDate), "dd/MM/yyyy") : "—";
        const estRev = { aprobado: ["APROBADA", "#16a34a", "#dcfce7"], rechazado: ["RECHAZADA", "#dc2626", "#fee2e2"], pendiente: ["PENDIENTE", "#d97706", "#fef9c3"] }[it.estadoRevision] || ["—", "#64748b", "#f1f5f9"];
        const resCfg = { ok: ["Sin fallas", "#16a34a", "#dcfce7"], fallas: ["Con fallas", "#dc2626", "#fee2e2"], observaciones: ["Con observaciones", "#d97706", "#fef9c3"] }[it.resultado] || ["—", "#64748b", "#f1f5f9"];

        const obs = it.act.observaciones
          ? `<div style="margin-top:5px;font-size:8.5px;color:#475569;background:#f8fafc;padding:5px 8px;border-radius:5px;border-left:3px solid #cbd5e1"><strong>Observaciones:</strong> ${it.act.observaciones.replace(/\s*\|\s*/g, " · ")}</div>`
          : "";

        const desc = it.datos?.descripcion
          ? `<div style="margin-top:4px;font-size:8.5px;color:#92400e"><strong>Descripción:</strong> ${it.datos.descripcion}</div>`
          : "";

        return `<div style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:10px;page-break-inside:avoid">
          <div style="background:#f8fafc;padding:7px 12px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
            <div style="font-size:11px;font-weight:700;color:#1e293b">${i + 1}. ${tipo}</div>
            <div style="display:flex;gap:5px;align-items:center">
              <span style="background:${resCfg[2]};color:${resCfg[1]};padding:2px 8px;border-radius:10px;font-size:8px;font-weight:700">${resCfg[0]}</span>
              <span style="background:${estRev[2]};color:${estRev[1]};padding:2px 8px;border-radius:10px;font-size:8px;font-weight:700">${estRev[0]}</span>
            </div>
          </div>
          <div style="padding:8px 12px">
            <table style="width:100%;font-size:9px;border-collapse:collapse">
              <tr>
                <td style="padding:2px 0;color:#94a3b8;width:18%">Fecha</td>
                <td style="padding:2px 0;font-weight:600;width:32%">${fecha}${hora ? ` · ${hora}` : ""}</td>
                <td style="padding:2px 0;color:#94a3b8;width:18%">Aprobado el</td>
                <td style="padding:2px 0;font-weight:600">${fechaRev}</td>
              </tr>
              <tr>
                <td style="padding:2px 0;color:#94a3b8">Inspeccionado por</td>
                <td style="padding:2px 0;font-weight:600">${inspector}</td>
                <td style="padding:2px 0;color:#94a3b8">Aprobado por</td>
                <td style="padding:2px 0;font-weight:600">${aprobador}</td>
              </tr>
            </table>
            ${checklistHtml(it.datos)}
            ${parchesHtml(it.datos)}
            ${desc}
            ${obs}
          </div>
        </div>`;
      }).join("");

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/>
<title>Historial de Inspecciones – ${equipo.marca} ${equipo.modelo}</title>
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
  <div style="background:linear-gradient(135deg,#0f2d6b,#1565c0,#0288d1);border-radius:12px;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
    <div>
      <div style="font-size:9.5px;color:rgba(255,255,255,0.6);text-transform:uppercase;letter-spacing:0.06em">Historial de Inspecciones</div>
      <div style="font-size:17px;font-weight:800;color:white;margin-top:2px">${tipoLabel} — ${equipo.marca} ${equipo.modelo}</div>
      <div style="font-size:9.5px;color:rgba(255,255,255,0.7);margin-top:3px">Inventario: ${equipo.numero_inventario || "—"} ${equipo.numero_serie ? "· S/N: " + equipo.numero_serie : ""}</div>
    </div>
    <div style="text-align:right;color:rgba(255,255,255,0.8);font-size:9px;line-height:1.7">
      Corporación Municipal de Panguipulli<br/>Generado: ${format(hoy, "dd/MM/yyyy")} a las ${format(hoy, "HH:mm")} hrs
    </div>
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:14px">
    <div style="border:1px solid #e2e8f0;border-radius:8px;padding:8px 12px">
      <div style="font-size:8.5px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em">Rango de fechas</div>
      <div style="font-size:11px;font-weight:700;color:#1e293b;margin-top:2px">${fechaDesde || "Inicio"} → ${fechaHasta || "Hoy"}</div>
    </div>
    <div style="border:1px solid #e2e8f0;border-radius:8px;padding:8px 12px">
      <div style="font-size:8.5px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em">Inspecciones</div>
      <div style="font-size:18px;font-weight:800;color:#1565c0;margin-top:2px">${total}</div>
    </div>
    <div style="border:1px solid #e2e8f0;border-radius:8px;padding:8px 12px">
      <div style="font-size:8.5px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em">Resumen</div>
      <div style="font-size:9.5px;font-weight:600;margin-top:2px">
        <span style="color:#16a34a">${sinFallas} sin fallas</span> ·
        <span style="color:#d97706">${conObs} c/obs</span> ·
        <span style="color:#dc2626">${conFallas} c/fallas</span><br/>
        <span style="color:#64748b">${aprobadas} aprobadas</span>
      </div>
    </div>
  </div>

  ${tarjetas}

  <div class="footer-bar">
    <strong>Corporación Municipal de Panguipulli</strong> – Sistema de Gestión de Equipos Médicos<br/>
    <span style="font-size:8px">Documento generado automáticamente el ${format(hoy, "dd/MM/yyyy")} a las ${format(hoy, "HH:mm")} hrs</span>
  </div>
</div>
<button class="print-btn no-print" onclick="window.print()">🖨️ Imprimir / Guardar PDF</button>
</body></html>`;

  const blob = new Blob([html], { type: "text/html" });
  window.open(URL.createObjectURL(blob), "_blank");
}