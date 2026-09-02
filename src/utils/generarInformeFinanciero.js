import { format, parseISO, isValid } from "date-fns";

const ESTADO_LABEL = {
  borrador: "Borrador",
  emitida: "Emitida",
  recibida: "Recibida",
  cancelada: "Cancelada",
};

const RUBRO_LABEL = {
  repuestos: "Repuestos",
  neumaticos: "Neumáticos",
  lubricantes: "Lubricantes",
  servicio_tecnico: "Servicio Técnico",
  insumos_medicos: "Insumos Médicos",
  otros: "Otros",
};

const fmtFecha = (f) => {
  if (!f) return "—";
  try {
    const d = typeof f === "string" ? parseISO(f) : new Date(f);
    return isValid(d) ? format(d, "dd/MM/yyyy") : "—";
  } catch {
    return "—";
  }
};

const fmtMonto = (n) => "$" + (n || 0).toLocaleString("es-CL");

export function generarInformeFinanciero({
  proveedores,
  ordenes,
  fechaDesde,
  fechaHasta,
  esMulti,
}) {
  const hoy = new Date();
  const desdeLabel = fechaDesde ? fmtFecha(fechaDesde) : "Sin límite inferior";
  const hastaLabel = fechaHasta ? fmtFecha(fechaHasta) : "Sin límite superior";
  const tituloReporte = esMulti
    ? "Informe Financiero Consolidado de Proveedores"
    : "Informe Financiero por Proveedor";

  // Agrupar órdenes por proveedor
  const porProveedor = {};
  ordenes.forEach((o) => {
    const pid = o.proveedor_id || "_solo";
    if (!porProveedor[pid]) porProveedor[pid] = [];
    porProveedor[pid].push(o);
  });

  const proveedorMap = {};
  proveedores.forEach((p) => { proveedorMap[p.id] = p; });

  let totalGeneral = 0;
  let totalOrdenes = 0;

  const seccionesProveedores = proveedores.map((p) => {
    const lista = porProveedor[p.id] || [];
    const validas = lista.filter((o) => o.estado !== "cancelada");
    const totalProv = validas.reduce((s, o) => s + (o.total || 0), 0);
    totalGeneral += totalProv;
    totalOrdenes += validas.length;

    const filasItems = validas.length === 0
      ? `<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:10px">Sin órdenes en el rango seleccionado</td></tr>`
      : validas.map((o, i) => {
          const cfgBg = o.estado === "recibida" ? "#dcfce7" : o.estado === "emitida" ? "#eff6ff" : o.estado === "cancelada" ? "#fee2e2" : "#f1f5f9";
          const cfgColor = o.estado === "recibida" ? "#16a34a" : o.estado === "emitida" ? "#2563eb" : "#64748b";
          return `<tr style="${i % 2 === 1 ? "background:#f8fafc" : ""}">
            <td style="padding:5px 8px;font-weight:600">${o.numero_oc || "Sin N°"}</td>
            <td style="padding:5px 8px">${fmtFecha(o.fecha_emision)}</td>
            <td style="padding:5px 8px">${fmtFecha(o.fecha_entrega_estimada)}</td>
            <td style="padding:5px 8px"><span style="background:${cfgBg};color:${cfgColor};padding:2px 8px;border-radius:4px;font-size:8.5px;font-weight:700">${ESTADO_LABEL[o.estado] || o.estado}</span></td>
            <td style="padding:5px 8px;text-align:right;font-weight:700">${fmtMonto(o.total)}</td>
          </tr>`;
        }).join("");

    const desgloseItems = esMulti ? "" : validas.map((o) => {
      if (!Array.isArray(o.items) || o.items.length === 0) return "";
      return `<div style="margin-top:6px;padding:6px 10px;background:#f8fafc;border-radius:6px;font-size:8.5px">
        <strong style="color:#1e3a5f">${o.numero_oc || "Sin N°"}</strong> — Detalle de ítems:
        ${o.items.map((it) => `<div style="display:flex;justify-content:space-between;padding:1px 0;color:#475569"><span>${it.repuesto_nombre || "Ítem"} × ${it.cantidad || 0}</span><span>${fmtMonto(it.subtotal)}</span></div>`).join("")}
      </div>`;
    }).join("");

    return `
      <div style="margin-top:14px;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden">
        <div style="background:linear-gradient(135deg,#1e3a5f,#2563eb);padding:9px 14px;display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="font-size:12px;font-weight:700;color:white">${p.nombre}</div>
            <div style="font-size:8.5px;color:rgba(255,255,255,0.7)">${p.rut ? `RUT: ${p.rut}` : ""} ${p.rubro ? `· ${RUBRO_LABEL[p.rubro] || p.rubro}` : ""}</div>
          </div>
          <div style="text-align:right;color:white">
            <div style="font-size:14px;font-weight:800">${fmtMonto(totalProv)}</div>
            <div style="font-size:8px;color:rgba(255,255,255,0.7)">${validas.length} orden(es)</div>
          </div>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:9.5px">
          <thead><tr style="background:#f8fafc">
            <th style="padding:5px 8px;text-align:left;font-size:8.5px;font-weight:700;color:#64748b;text-transform:uppercase;border-bottom:2px solid #e2e8f0">N° OC</th>
            <th style="padding:5px 8px;text-align:left;font-size:8.5px;font-weight:700;color:#64748b;text-transform:uppercase;border-bottom:2px solid #e2e8f0">Emisión</th>
            <th style="padding:5px 8px;text-align:left;font-size:8.5px;font-weight:700;color:#64748b;text-transform:uppercase;border-bottom:2px solid #e2e8f0">Entrega Est.</th>
            <th style="padding:5px 8px;text-align:left;font-size:8.5px;font-weight:700;color:#64748b;text-transform:uppercase;border-bottom:2px solid #e2e8f0">Estado</th>
            <th style="padding:5px 8px;text-align:right;font-size:8.5px;font-weight:700;color:#64748b;text-transform:uppercase;border-bottom:2px solid #e2e8f0">Total</th>
          </tr></thead>
          <tbody>${filasItems}</tbody>
        </table>
        ${desgloseItems}
      </div>`;
  }).join("");

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/>
<title>${tituloReporte}</title>
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
      <div style="font-size:9.5px;color:rgba(255,255,255,0.6);text-transform:uppercase;letter-spacing:0.06em">${esMulti ? "Consolidado" : "Individual"}</div>
      <div style="font-size:17px;font-weight:800;color:white;margin-top:2px">${tituloReporte}</div>
      <div style="font-size:9.5px;color:rgba(255,255,255,0.7);margin-top:3px">Período: ${desdeLabel} → ${hastaLabel}</div>
    </div>
    <div style="text-align:right;color:rgba(255,255,255,0.8);font-size:9px;line-height:1.7">
      Corporación Municipal de Panguipulli<br/>Departamento de Informática<br/>Generado: ${format(hoy,"dd/MM/yyyy")} a las ${format(hoy,"HH:mm")} hrs
    </div>
  </div>

  <!-- KPIs -->
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:6px">
    <div style="background:#eff6ff;border-radius:9px;padding:10px;text-align:center">
      <div style="font-size:20px;font-weight:800;color:#2563eb">${proveedores.length}</div>
      <div style="font-size:8px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;margin-top:2px">Proveedores</div>
    </div>
    <div style="background:#f0fdf4;border-radius:9px;padding:10px;text-align:center">
      <div style="font-size:20px;font-weight:800;color:#16a34a">${totalOrdenes}</div>
      <div style="font-size:8px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;margin-top:2px">Órdenes Vigentes</div>
    </div>
    <div style="background:#f5f3ff;border-radius:9px;padding:10px;text-align:center">
      <div style="font-size:20px;font-weight:800;color:#7c3aed">${fmtMonto(totalGeneral)}</div>
      <div style="font-size:8px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;margin-top:2px">Costo Total</div>
    </div>
  </div>

  ${seccionesProveedores}

  <!-- PIE -->
  <div class="footer-bar">
    <strong>Corporación Municipal de Panguipulli</strong> &nbsp;–&nbsp; Informe financiero de compras a proveedores<br/>
    <span style="font-size:8px">Documento generado automáticamente el ${format(hoy,"dd/MM/yyyy")} a las ${format(hoy,"HH:mm")} hrs &nbsp;|&nbsp; Sistema de Gestión de Equipos Médicos</span>
  </div>
</div>
<button class="print-btn no-print" onclick="window.print()">🖨️ Imprimir / Guardar PDF</button>
</body></html>`;

  const blob = new Blob([html], { type: "text/html" });
  window.open(URL.createObjectURL(blob), "_blank");
}