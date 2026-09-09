// Imprime pautas de inspección (diaria / semanal / turno) en PDF.
//
// Una sola función para lo individual y lo masivo: `generarPDFPautas([una])` y
// `generarPDFPautas([...cincuenta])` es el mismo camino, cada pauta en su hoja.
//
// Mismo mecanismo que generarPDFHistorialInspecciones.js: se arma el HTML y se
// abre en una pestaña con el diálogo de impresión, donde el navegador ofrece
// "Guardar como PDF". Sin librería de PDF, y sale con acentos y tildes bien.

const TIPO_LABEL = {
  inspeccion_semanal: "Pauta Semanal",
  inspeccion_diaria: "Pauta Diaria",
  inspeccion_rutinaria: "Pauta Diaria",
  inspeccion_anual: "Pauta Anual",
  turno_chofer: "Registro de Turno de Chofer",
};

const TIPO_EQUIPO_LABEL = {
  ambulancia: "Ambulancia",
  dea: "DEA",
  monitor_desfibrilador: "Monitor Desfibrilador",
  monitor_multiparametros: "Monitor Multiparámetros",
};

const ESTADO_LABEL = {
  aprobado: ["APROBADA", "#16a34a", "#dcfce7"],
  rechazado: ["RECHAZADA", "#dc2626", "#fee2e2"],
  pendiente: ["PENDIENTE DE REVISIÓN", "#d97706", "#fef9c3"],
};

// Las pautas semanales usan bueno/malo; las diarias, correcto/incorrecto.
const MALOS = new Set(["malo", "incorrecto", "no", "falta"]);
const BUENOS = new Set(["bueno", "correcto", "ok", "si", "sí"]);

// Los bloques de checklist de cada tipo de pauta, con el título que lleva cada uno.
const BLOQUES = {
  inspeccion_semanal: [
    ["luces", "Luces"], ["motor", "Motor"],
    ["accesorios", "Accesorios"], ["documentos", "Documentos"],
  ],
  inspeccion_diaria: [
    ["exterior", "1. Revisión Exterior"], ["interior", "2. Revisión Interior"],
    ["equipo_medico", "3. Equipos Médicos"], ["accesorios_diaria", "4. Accesorios"],
    ["saneamiento", "5. Limpieza Básica"], ["documentacion", "6. Documentación"],
  ],
};

const esc = (v) => String(v ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const bonito = (k) => k.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

function fechaCL(str) {
  if (!str) return "—";
  const [y, m, d] = String(str).split("T")[0].split("-");
  return d ? `${d}/${m}/${y}` : str;
}

function horaCL(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
}

function normalizar(v) {
  if (typeof v === "string") return { estado: v, obs: "" };
  if (v && typeof v === "object") return { estado: v.estado || "", obs: v.obs || v.observacion || "" };
  return { estado: "", obs: "" };
}

function bloqueHtml(titulo, data) {
  if (!data || typeof data !== "object") return "";
  const items = Object.entries(data);
  if (items.length === 0) return "";
  const malos = items.filter(([, v]) => MALOS.has(normalizar(v).estado)).length;

  const filas = items.map(([nombre, v]) => {
    const { estado, obs } = normalizar(v);
    const malo = MALOS.has(estado);
    const bueno = BUENOS.has(estado);
    const simb = malo ? "✗" : bueno ? "✓" : "—";
    const color = malo ? "#dc2626" : bueno ? "#16a34a" : "#94a3b8";
    return `<tr>
      <td style="padding:3px 6px;color:${color};font-weight:700;width:18px;text-align:center">${simb}</td>
      <td style="padding:3px 6px">${esc(bonito(nombre))}</td>
      <td style="padding:3px 6px;color:#64748b;width:38%">${esc(obs) || "—"}</td>
    </tr>`;
  }).join("");

  return `<div style="border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;margin-bottom:8px;page-break-inside:avoid">
    <div style="background:#f8fafc;padding:5px 9px;font-size:9px;font-weight:700;color:#334155;display:flex;justify-content:space-between">
      <span>${esc(titulo)}</span>
      <span style="color:${malos ? "#dc2626" : "#16a34a"}">${malos ? `${malos} falla(s)` : "Sin fallas"}</span>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:9px">${filas}</table>
  </div>`;
}

function danosHtml(danos) {
  if (!danos || typeof danos !== "object") return "";
  const lista = Object.entries(danos).filter(([, v]) => v?.marcado);
  if (lista.length === 0) return "";
  const filas = lista.map(([zona, v]) => `<tr>
      <td style="padding:3px 6px;font-weight:600;color:#b91c1c;width:35%">${esc(bonito(zona))}</td>
      <td style="padding:3px 6px;color:#475569">${esc(v.descripcion) || "—"}</td>
    </tr>`).join("");
  return `<div style="border:1px solid #fecaca;border-radius:6px;overflow:hidden;margin-bottom:8px;page-break-inside:avoid">
    <div style="background:#fff5f5;padding:5px 9px;font-size:9px;font-weight:700;color:#dc2626">Daños visuales (${lista.length})</div>
    <table style="width:100%;border-collapse:collapse;font-size:9px">${filas}</table>
  </div>`;
}

function hoja(insp, indice, total) {
  let datos = {};
  try { datos = insp.datos_json ? JSON.parse(insp.datos_json) : {}; } catch { datos = {}; }
  const equipo = datos.equipo || {};

  const tipoKey = insp.tipo_formulario === "inspeccion_rutinaria" ? "inspeccion_diaria" : insp.tipo_formulario;
  const titulo = TIPO_LABEL[insp.tipo_formulario] || insp.tipo_formulario || "Pauta";
  const est = ESTADO_LABEL[insp.estado] || ESTADO_LABEL.pendiente;

  const bloques = (BLOQUES[tipoKey] || [])
    .map(([campo, rotulo]) => bloqueHtml(rotulo, datos[campo])).join("");

  const observaciones = [
    datos.problemasDetectados && `<strong>Problemas detectados:</strong> ${esc(datos.problemasDetectados)}`,
    datos.accionesTomadas && `<strong>Acciones tomadas:</strong> ${esc(datos.accionesTomadas)}`,
    insp.observaciones && esc(insp.observaciones).replace(/\s*\|\s*/g, " · "),
  ].filter(Boolean).join("<br/>");

  const revision = insp.estado !== "pendiente"
    ? `<tr>
        <td style="padding:2px 0;color:#94a3b8">Revisado por</td>
        <td style="padding:2px 0;font-weight:600">${esc(insp.revisor_nombre || insp.revisor_email || "—")}</td>
        <td style="padding:2px 0;color:#94a3b8">Fecha revisión</td>
        <td style="padding:2px 0;font-weight:600">${fechaCL(insp.fecha_revision)}</td>
      </tr>`
    : "";

  return `<div class="page">
  <div style="background:linear-gradient(135deg,#0f2d6b,#1565c0,#0288d1);border-radius:10px;padding:12px 18px;display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
    <div>
      <div style="font-size:9px;color:rgba(255,255,255,0.65);text-transform:uppercase;letter-spacing:0.06em">Bitácora de Inspección</div>
      <div style="font-size:16px;font-weight:800;color:white;margin-top:2px">${esc(titulo)}</div>
      <div style="font-size:9.5px;color:rgba(255,255,255,0.75);margin-top:3px">
        ${esc(TIPO_EQUIPO_LABEL[equipo.tipo] || equipo.tipo || "Equipo")} ·
        ${esc(insp.equipo_label || insp.equipo_id || "—")}${equipo.patente ? ` (${esc(equipo.patente)})` : ""}
      </div>
    </div>
    <div style="text-align:right">
      <span style="background:${est[2]};color:${est[1]};padding:3px 10px;border-radius:10px;font-size:8.5px;font-weight:800">${est[0]}</span>
      <div style="font-size:8.5px;color:rgba(255,255,255,0.7);margin-top:6px">Hoja ${indice} de ${total}</div>
    </div>
  </div>

  <table style="width:100%;font-size:9.5px;border-collapse:collapse;margin-bottom:10px">
    <tr>
      <td style="padding:2px 0;color:#94a3b8;width:16%">Fecha</td>
      <td style="padding:2px 0;font-weight:600;width:34%">${fechaCL(insp.fecha)}${horaCL(datos.hora_registro) ? ` · ${horaCL(datos.hora_registro)} hrs` : ""}</td>
      <td style="padding:2px 0;color:#94a3b8;width:16%">Centro</td>
      <td style="padding:2px 0;font-weight:600">${esc(equipo.centro_principal || "—")}${equipo.subsede ? ` · ${esc(equipo.subsede)}` : ""}</td>
    </tr>
    <tr>
      <td style="padding:2px 0;color:#94a3b8">Responsable</td>
      <td style="padding:2px 0;font-weight:600">${esc(insp.conductor || datos.conductor || "—")}</td>
      <td style="padding:2px 0;color:#94a3b8">Inventario</td>
      <td style="padding:2px 0;font-weight:600">${esc(equipo.numero_inventario || "—")}</td>
    </tr>
    <tr>
      <td style="padding:2px 0;color:#94a3b8">Kilometraje</td>
      <td style="padding:2px 0;font-weight:600">${insp.km_inicial ? `${Number(insp.km_inicial).toLocaleString("es-CL")} km` : "—"}</td>
      <td style="padding:2px 0;color:#94a3b8">Combustible</td>
      <td style="padding:2px 0;font-weight:600">${esc(insp.combustible || "—")}</td>
    </tr>
    ${revision}
  </table>

  ${bloques}
  ${danosHtml(datos.danos)}

  ${observaciones ? `<div style="font-size:9px;color:#475569;background:#f8fafc;padding:6px 9px;border-radius:6px;border-left:3px solid #cbd5e1;margin-bottom:8px">${observaciones}</div>` : ""}
  ${insp.nota_revision ? `<div style="font-size:9px;color:#92400e;background:#fffbeb;padding:6px 9px;border-radius:6px;border-left:3px solid #fbbf24">Nota del revisor: ${esc(insp.nota_revision)}</div>` : ""}

  <div style="display:flex;gap:40px;margin-top:26px">
    <div style="flex:1;border-top:1px solid #94a3b8;padding-top:4px;font-size:8.5px;color:#64748b;text-align:center">Firma del responsable</div>
    <div style="flex:1;border-top:1px solid #94a3b8;padding-top:4px;font-size:8.5px;color:#64748b;text-align:center">Firma del revisor</div>
  </div>

  <div class="footer-bar">
    <strong>Corporación Municipal de Panguipulli</strong> – Sistema de Gestión de Equipamiento Crítico
  </div>
</div>`;
}

export function generarPDFPautas(inspecciones) {
  const lista = Array.isArray(inspecciones) ? inspecciones : [inspecciones];
  if (lista.length === 0) return false;

  const hoy = new Date();
  const generado = `${hoy.toLocaleDateString("es-CL")} a las ${hoy.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })} hrs`;
  const titulo = lista.length === 1
    ? `Pauta – ${lista[0].equipo_label || lista[0].equipo_id || ""}`
    : `Pautas de inspección (${lista.length})`;

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/>
<title>${esc(titulo)}</title>
<style>
  @page { size: A4; margin: 12mm 10mm; }
  @media print { .no-print { display:none !important; } body { background:white !important; padding:0 !important; } }
  * { box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  body { font-family:'Segoe UI',Arial,sans-serif; background:#f1f5f9; margin:0; padding:16px; color:#1e293b; }
  .page { background:white; max-width:190mm; margin:0 auto 16px; padding:16px; page-break-after:always; }
  .page:last-of-type { page-break-after:auto; }
  .footer-bar { text-align:center; padding:8px 0 0; font-size:8px; color:#94a3b8; border-top:1px solid #e2e8f0; margin-top:14px; }
  .print-btn { position:fixed; bottom:20px; right:20px; background:linear-gradient(135deg,#1565c0,#0288d1); color:white; border:none; border-radius:10px; padding:12px 24px; font-size:13px; font-weight:700; cursor:pointer; box-shadow:0 4px 14px rgba(21,101,192,0.4); }
</style></head><body>
${lista.map((insp, i) => hoja(insp, i + 1, lista.length)).join("\n")}
<div class="no-print" style="text-align:center;font-size:9px;color:#94a3b8;padding-bottom:60px">Generado el ${generado}</div>
<button class="print-btn no-print" onclick="window.print()">🖨️ Imprimir / Guardar PDF</button>
</body></html>`;

  const ventana = window.open("", "_blank");
  if (!ventana) return false;   // bloqueador de pop-ups: lo avisa quien llama
  ventana.document.write(html);
  ventana.document.close();
  return true;
}

// ponytail: un self-check, no una suite. Lo que se rompe en silencio acá es el
// mapeo de estados (bueno/malo vs correcto/incorrecto) y el parseo de datos_json.
export function _selfCheck() {
  const semanal = {
    id: "1", tipo_formulario: "inspeccion_semanal", estado: "pendiente", fecha: "2026-09-01",
    equipo_label: "Ambulancia 3", conductor: "J. Pérez",
    datos_json: JSON.stringify({
      equipo: { tipo: "ambulancia", centro_principal: "CESFAM Panguipulli", patente: "AB-12" },
      luces: { luz_baja: { estado: "bueno" }, baliza: { estado: "malo", obs: "quemada" } },
      danos: { puerta_lateral: { marcado: true, descripcion: "rayada" } },
    }),
  };
  const diaria = { ...semanal, id: "2", tipo_formulario: "inspeccion_diaria",
    datos_json: JSON.stringify({ equipo: {}, exterior: { neumaticos: { estado: "incorrecto" } } }) };
  const rota = { id: "3", tipo_formulario: "turno_chofer", datos_json: "{no es json" };

  const h1 = hoja(semanal, 1, 3);
  console.assert(h1.includes("Pauta Semanal") && h1.includes("1 falla(s)"), "semanal: falla no contada");
  console.assert(h1.includes("Daños visuales (1)"), "semanal: daño no listado");
  console.assert(h1.includes("AB-12") && h1.includes("CESFAM Panguipulli"), "semanal: cabecera incompleta");

  const h2 = hoja(diaria, 2, 3);
  console.assert(h2.includes("1. Revisión Exterior") && h2.includes("1 falla(s)"), "diaria: incorrecto != malo");

  const h3 = hoja(rota, 3, 3);
  console.assert(h3.includes("Registro de Turno"), "json roto debe seguir imprimiendo la hoja");

  console.assert(hoja({ ...semanal, equipo_label: '<img src=x onerror=alert(1)>' }, 1, 1).includes("&lt;img"),
    "el texto del formulario tiene que ir escapado");
  return true;
}
