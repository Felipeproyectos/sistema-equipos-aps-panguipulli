import { escaparDatos, abrirInformeHtml } from "../lib/informeHtml.js";
import {
  COLUMNAS_CARGA, COLUMNAS_PAGO, ENCABEZADO_EXPORT_CARGA, ENCABEZADO_EXPORT_PAGO,
  filaExportCarga, filaExportPago, totales, pesos, litrosTexto, vencimientos, rotulo, TIPOS_PAGO, numeroTexto,
} from "../lib/unidadControl.js";

// Planillas de la Unidad de Control: exportar a Excel, descargar la plantilla
// para cargar lo que hoy llevan en planillas, leer una planilla (.xlsx o
// .csv) y el informe de gastos para imprimir o guardar en PDF.
//
// exceljs se carga solo cuando se usa: pesa, y la mayoría de las pantallas no
// lo necesitan.

const excel = async () => (await import("exceljs")).default;

function descargar(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// Un texto que empieza con = + - @ se toma como fórmula al abrir el archivo.
const seguro = (v) => (typeof v === "string" && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v);

function hoja(wb, nombre, encabezado, filas, color = "FF0F766E") {
  const ws = wb.addWorksheet(nombre, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.addRow(encabezado);
  filas.forEach(f => ws.addRow(f.map(seguro)));
  const h = ws.getRow(1);
  h.font = { bold: true, color: { argb: "FFFFFFFF" } };
  h.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
  ws.columns.forEach((c, i) => { c.width = Math.min(40, Math.max(12, String(encabezado[i] || "").length + 4)); });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: encabezado.length } };
  return ws;
}

/** Excel con las cargas, los pagos y los totales del período elegido. */
export async function exportarExcel({ cargas = [], pagos = [], equipos = [], nombre = "combustible-y-pagos" }) {
  const ExcelJS = await excel();
  const wb = new ExcelJS.Workbook();
  wb.creator = "Sistema de Gestión de Equipamiento Crítico";
  const porId = new Map(equipos.map(e => [e.id, e]));
  hoja(wb, "Combustible", ENCABEZADO_EXPORT_CARGA, cargas.map(c => filaExportCarga(c, porId)));
  hoja(wb, "Pagos y gastos", ENCABEZADO_EXPORT_PAGO, pagos.map(p => filaExportPago(p, porId)), "FF1D4ED8");
  const t = totales(cargas, pagos, equipos);
  const r = wb.addWorksheet("Resumen");
  r.addRow(["Resumen (sin anulados; pagos solo los hechos)"]).font = { bold: true, size: 13 };
  r.addRow(["Combustible", t.combustible]); r.addRow(["Litros", t.litros]); r.addRow(["Pagos", t.pagos]); r.addRow(["Total", t.total]);
  for (const [titulo, lista] of [["Por vehículo", t.porVehiculo], ["Por centro que paga", t.porCentro], ["Por mes", t.porMes], ["Por tipo", t.porTipo]]) {
    r.addRow([]);
    r.addRow([titulo, "Combustible", "Litros", "Pagos", "Total"]).font = { bold: true };
    lista.forEach(f => r.addRow([seguro(f.clave), f.combustible, f.litros, f.pagos, f.total]));
  }
  r.getColumn(1).width = 34; [2, 3, 4, 5].forEach(i => { r.getColumn(i).width = 14; r.getColumn(i).numFmt = "#,##0"; });
  const buffer = await wb.xlsx.writeBuffer();
  descargar(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${nombre}.xlsx`);
}

/** La plantilla para cargar lo que hoy está en planillas. */
export async function descargarPlantilla(tipo = "carga") {
  const ExcelJS = await excel();
  const wb = new ExcelJS.Workbook();
  const columnas = tipo === "pago" ? COLUMNAS_PAGO : COLUMNAS_CARGA;
  const ejemplo = tipo === "pago"
    ? ["01/03/2026", "AB-CD-12", "Permiso de circulación", "Pago anual", "150000", "Pagado", "", "01/04/2026", "31/03/2027", "Municipalidad de Panguipulli", "69.200.000-0", "Boleta", "12345", "Transferencia", ""]
    : ["05/10/2026", "08:30", "AB-CD-12", "150230", "45,5", "Diésel", "1200", "54600", "Copec Panguipulli", "Panguipulli", "Boleta", "88123", "Tarjeta de combustible", "1234", "Juan Pérez", "Sí", ""];
  const ws = hoja(wb, tipo === "pago" ? "Pagos" : "Cargas", columnas.map(c => c.titulo), [ejemplo]);
  ws.getRow(2).font = { italic: true, color: { argb: "FF94A3B8" } };
  const ayuda = wb.addWorksheet("Instrucciones");
  [
    "1. Una fila por " + (tipo === "pago" ? "pago o gasto." : "carga de combustible."),
    "2. Borra la fila de ejemplo (gris) antes de subir.",
    "3. La patente tiene que ser la de un vehículo registrado en el sistema.",
    "4. Fechas como 05/10/2026. Montos y litros con o sin puntos de miles; decimales con coma.",
    tipo === "pago"
      ? "5. Tipo: " + TIPOS_PAGO.map(t => t.label).join(", ") + ". Si no calza, escribe el concepto y queda como «Otro»."
      : "5. Combustible: Diésel, 93, 95 o 97. Si falta el monto pero está el precio por litro, se calcula.",
    tipo === "pago" ? "6. Permiso de circulación, revisión técnica y SOAP necesitan «Vigente hasta»." : "6. El kilometraje no puede ser menor que el de una carga anterior del mismo vehículo.",
    "7. Antes de guardar se muestra cada fila: las que tienen errores no se guardan y se indica por qué.",
  ].forEach(l => ayuda.addRow([l]));
  ayuda.getColumn(1).width = 110;
  const buffer = await wb.xlsx.writeBuffer();
  descargar(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    tipo === "pago" ? "plantilla_pagos_vehiculos.xlsx" : "plantilla_cargas_combustible.xlsx");
}

/** CSV con ; o , como separador, con comillas, a filas de celdas. */
export function leerCsv(texto) {
  const limpio = String(texto || "").replace(/^﻿/, "");
  const primera = limpio.split(/\r?\n/, 1)[0] || "";
  const sep = (primera.match(/;/g) || []).length >= (primera.match(/,/g) || []).length ? ";" : ",";
  const filas = [];
  let fila = [], celda = "", comillas = false;
  for (let i = 0; i < limpio.length; i++) {
    const c = limpio[i];
    if (comillas) {
      if (c === '"' && limpio[i + 1] === '"') { celda += '"'; i++; }
      else if (c === '"') comillas = false;
      else celda += c;
    } else if (c === '"') comillas = true;
    else if (c === sep) { fila.push(celda); celda = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && limpio[i + 1] === "\n") i++;
      fila.push(celda); filas.push(fila); fila = []; celda = "";
    } else celda += c;
  }
  if (celda !== "" || fila.length) { fila.push(celda); filas.push(fila); }
  return filas;
}

const LIMITE_ARCHIVO = 5 * 1024 * 1024;

/** Lee la primera hoja de un .xlsx o un .csv y devuelve sus filas. */
export async function leerArchivoPlanilla(archivo) {
  if (!archivo) return [];
  if (archivo.size > LIMITE_ARCHIVO) throw new Error("La planilla pesa más de 5 MB. Divídela en partes.");
  const nombre = archivo.name.toLowerCase();
  if (nombre.endsWith(".csv")) return leerCsv(await archivo.text());
  if (!nombre.endsWith(".xlsx")) throw new Error("Sube la planilla en .xlsx o .csv (en Excel: Guardar como → Libro de Excel).");
  const ExcelJS = await excel();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await archivo.arrayBuffer());
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const filas = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const valores = [];
    for (let i = 1; i <= ws.columnCount; i++) {
      let v = row.getCell(i).value;
      if (v && typeof v === "object" && !(v instanceof Date)) v = v.result ?? v.text ?? (Array.isArray(v.richText) ? v.richText.map(x => x.text).join("") : "");
      valores.push(v ?? "");
    }
    filas.push(valores);
  });
  return filas;
}

/** Informe de gastos para imprimir o guardar en PDF. */
export function informeGastos({ cargas = [], pagos = [], equipos = [], filtrosTexto = "", quien = "", hoy = new Date().toISOString().slice(0, 10) }) {
  const t = escaparDatos(totales(cargas, pagos, equipos));
  const venc = escaparDatos(vencimientos(pagos, equipos, hoy).filter(v => v.estado !== "vigente"));
  const { filtrosTexto: f, quien: q } = escaparDatos({ filtrosTexto, quien });
  const generado = new Date().toLocaleString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const tabla = (titulo, lista, conLitros = true) => `<h2>${titulo}</h2><table><thead><tr><th>${titulo.replace("Por ", "")}</th><th class="n">Combustible</th>${conLitros ? `<th class="n">Litros</th>` : ""}<th class="n">Pagos</th><th class="n">Total</th></tr></thead><tbody>
    ${lista.map(r => `<tr><td>${r.clave}</td><td class="n">${pesos(r.combustible)}</td>${conLitros ? `<td class="n">${litrosTexto(r.litros)}</td>` : ""}<td class="n">${pesos(r.pagos)}</td><td class="n"><strong>${pesos(r.total)}</strong></td></tr>`).join("") || `<tr><td colspan="5" class="vacio">Sin registros</td></tr>`}
    </tbody></table>`;
  const ESTADO = { vencido: ["Vencido", "#dc2626"], por_vencer: ["Por vencer", "#d97706"], sin_registro: ["Sin registro", "#64748b"] };
  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/><title>Gastos de vehículos</title>
<style>
  @page { size: A4 portrait; margin: 12mm 10mm 14mm 10mm; }
  @media print { .no-print{display:none!important;} body{background:white!important;padding:0!important;} }
  * { box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  body { font-family:'Segoe UI',Arial,sans-serif; background:#f1f5f9; margin:0; padding:16px; color:#1e293b; font-size:10px; }
  .page { background:white; max-width:190mm; margin:0 auto; padding:16px; }
  .cab { background:linear-gradient(135deg,#0f766e,#134e4a); border-radius:10px; padding:14px 18px; display:flex; justify-content:space-between; gap:10px; color:white; }
  .cab h1 { margin:0; font-size:17px; } .cab p { margin:3px 0 0; font-size:9.5px; opacity:.8; } .cab .der { text-align:right; font-size:9px; opacity:.9; line-height:1.6; }
  .kpis { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin:12px 0; }
  .kpi { border:1px solid #e2e8f0; border-radius:8px; padding:8px; text-align:center; } .kpi b { display:block; font-size:16px; color:#0f766e; } .kpi span { font-size:7.5px; color:#64748b; text-transform:uppercase; font-weight:700; }
  h2 { font-size:11px; color:#134e4a; border-bottom:2px solid #99f6e4; padding-bottom:3px; margin:14px 0 6px; }
  table { width:100%; border-collapse:collapse; } thead th { background:#f8fafc; text-align:left; font-size:7.5px; text-transform:uppercase; color:#64748b; padding:5px; border-bottom:2px solid #e2e8f0; }
  td { padding:4px 5px; border-bottom:1px solid #f1f5f9; } tr { page-break-inside:avoid; } .n { text-align:right; } .vacio { text-align:center; color:#94a3b8; }
  .pie { text-align:center; font-size:8px; color:#94a3b8; border-top:1px solid #e2e8f0; margin-top:14px; padding-top:8px; }
  .boton { position:fixed; bottom:20px; right:20px; background:#0f766e; color:white; border:none; border-radius:10px; padding:12px 22px; font-size:13px; font-weight:700; cursor:pointer; }
</style></head><body><div class="page">
  <div class="cab"><div><h1>Gastos de vehículos</h1><p>${f || "Todo el período"}</p></div>
    <div class="der">Corporación Municipal de Panguipulli<br/>Unidad de Control<br/>Generado ${generado}${q ? ` por ${q}` : ""}</div></div>
  <div class="kpis">
    <div class="kpi"><b>${pesos(t.combustible)}</b><span>Combustible</span></div>
    <div class="kpi"><b>${litrosTexto(t.litros)}</b><span>Litros</span></div>
    <div class="kpi"><b>${pesos(t.pagos)}</b><span>Pagos hechos</span></div>
    <div class="kpi"><b>${pesos(t.total)}</b><span>Total</span></div>
  </div>
  ${tabla("Por centro que paga", t.porCentro)}
  ${tabla("Por vehículo", t.porVehiculo)}
  ${tabla("Por mes", t.porMes)}
  ${tabla("Por tipo", t.porTipo, false)}
  <h2>Vencimientos que requieren atención</h2>
  <table><thead><tr><th>Vehículo</th><th>Centro</th><th>Documento</th><th>Vence</th><th>Estado</th></tr></thead><tbody>
  ${venc.map(v => `<tr><td>${v.vehiculo}</td><td>${v.centro}</td><td>${rotulo(TIPOS_PAGO, v.tipo)}</td><td>${v.hasta ? v.hasta.split("-").reverse().join("/") : "—"}</td><td style="color:${ESTADO[v.estado][1]};font-weight:700">${ESTADO[v.estado][0]}${v.dias !== null ? ` (${v.dias < 0 ? `hace ${-v.dias}` : `en ${v.dias}`} días)` : ""}</td></tr>`).join("") || `<tr><td colspan="5" class="vacio">Todo vigente</td></tr>`}
  </tbody></table>
  <div class="pie"><strong>Corporación Municipal de Panguipulli</strong> · Sistema de Gestión de Equipamiento Crítico · No incluye registros anulados ni pagos pendientes en los totales.</div>
</div><button class="boton no-print" onclick="window.print()">Imprimir / Guardar PDF</button></body></html>`;
  return abrirInformeHtml(html);
}

/**
 * Las fichas de los vehículos en una hoja imprimible: datos, documentos,
 * último km y lo gastado en el período. `periodo` es Map(id → fila del panel),
 * `km` es Map(id → { km, fecha }).
 */
export function informeFichas({ vehiculos = [], periodo = new Map(), venc = [], km = new Map(), quien = "" }) {
  const TIPO = { ambulancia: "Ambulancia", camioneta: "Camioneta", furgon: "Furgón", camion_3_4: "Camión 3/4" };
  const ESTADO = { vencido: ["Vencido", "#dc2626"], por_vencer: ["Por vencer", "#d97706"], sin_registro: ["Sin registro", "#64748b"], vigente: ["Vigente", "#16a34a"] };
  const fechaTexto = (f) => (f ? String(f).slice(0, 10).split("-").reverse().join("/") : "—");
  const filas = vehiculos.map(v => {
    const p = periodo.get(v.id) || {};
    const uk = km.get(v.id);
    return escaparDatos({
      patente: v.patente || "Sin patente", vehiculo: [v.marca, v.modelo].filter(Boolean).join(" "), tipo: TIPO[v.tipo] || v.tipo || "",
      centro: [v.centro_principal, v.subsede].filter(Boolean).join(" · "), conductor: v.conductor_responsable || "",
      inventario: v.numero_inventario || "",
      km: uk ? `${numeroTexto(uk.km)} km (${fechaTexto(uk.fecha)})` : "—",
      docs: venc.filter(d => d.equipo_id === v.id).map(d => ({ tipo: rotulo(TIPOS_PAGO, d.tipo), estado: d.estado, hasta: fechaTexto(d.hasta) })),
      litros: litrosTexto(p.litros || 0), total: pesos(p.total || 0), salidas: String(p.salidas || 0), kmPeriodo: p.km ? `${numeroTexto(p.km)} km` : "—",
    });
  });
  const q = escaparDatos(quien);
  const generado = new Date().toLocaleString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/><title>Fichas de vehículos</title>
<style>
  @page { size: A4 portrait; margin: 10mm; }
  @media print { .no-print{display:none!important;} body{background:white!important;padding:0!important;} }
  * { box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  body { font-family:'Segoe UI',Arial,sans-serif; background:#f1f5f9; margin:0; padding:16px; color:#1e293b; font-size:9.5px; }
  .page { background:white; max-width:190mm; margin:0 auto; padding:14px; }
  .cab { background:linear-gradient(135deg,#0f766e,#134e4a); border-radius:10px; padding:12px 16px; display:flex; justify-content:space-between; color:white; margin-bottom:10px; }
  .cab h1 { margin:0; font-size:16px; } .cab .der { text-align:right; font-size:9px; opacity:.9; line-height:1.6; }
  .grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
  .ficha { border:1px solid #e2e8f0; border-radius:8px; padding:8px; page-break-inside:avoid; }
  .ficha h2 { margin:0; font-size:13px; color:#134e4a; } .ficha .sub { color:#64748b; margin-bottom:4px; }
  .ficha table { width:100%; border-collapse:collapse; } .ficha td { padding:1.5px 0; } .ficha td:last-child { text-align:right; font-weight:600; }
  .docs span { display:inline-block; font-size:8px; font-weight:700; margin:3px 4px 0 0; }
  .pie { text-align:center; font-size:8px; color:#94a3b8; border-top:1px solid #e2e8f0; margin-top:12px; padding-top:6px; }
  .boton { position:fixed; bottom:20px; right:20px; background:#0f766e; color:white; border:none; border-radius:10px; padding:12px 22px; font-size:13px; font-weight:700; cursor:pointer; }
</style></head><body><div class="page">
  <div class="cab"><div><h1>Fichas de vehículos</h1><div>${filas.length} vehículos</div></div>
    <div class="der">Corporación Municipal de Panguipulli<br/>Unidad de Control<br/>Generado ${generado}${q ? ` por ${q}` : ""}</div></div>
  <div class="grid">
  ${filas.map(f => `<div class="ficha"><h2>${f.patente}</h2><div class="sub">${f.vehiculo} · ${f.tipo}</div><table>
    <tr><td>Centro</td><td>${f.centro || "—"}</td></tr>
    ${f.conductor ? `<tr><td>Conductor</td><td>${f.conductor}</td></tr>` : ""}
    ${f.inventario ? `<tr><td>Inventario</td><td>${f.inventario}</td></tr>` : ""}
    <tr><td>Último km</td><td>${f.km}</td></tr>
    <tr><td>Período: gasto</td><td>${f.total}</td></tr>
    <tr><td>Período: litros · salidas · km</td><td>${f.litros} · ${f.salidas} · ${f.kmPeriodo}</td></tr>
  </table><div class="docs">${f.docs.map(d => `<span style="color:${(ESTADO[d.estado] || ESTADO.sin_registro)[1]}">${d.tipo}: ${(ESTADO[d.estado] || ESTADO.sin_registro)[0]}${d.hasta !== "—" ? ` ${d.hasta}` : ""}</span>`).join("")}</div></div>`).join("")}
  </div>
  <div class="pie"><strong>Corporación Municipal de Panguipulli</strong> · Sistema de Gestión de Equipamiento Crítico</div>
</div><button class="boton no-print" onclick="window.print()">Imprimir / Guardar PDF</button></body></html>`;
  return abrirInformeHtml(html);
}
