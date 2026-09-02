import { differenceInDays, parseISO, format } from "date-fns";

const TIPO_LABELS = {
  dea: "DEA",
  monitor_desfibrilador: "Monitor Desfibrilador",
  ambulancia: "Ambulancia",
  monitor_multiparametros: "Monitor Multiparámetros"
};

const ESTADO_STYLES = {
  operativo: { bg: "#dcfce7", color: "#16a34a", label: "OPERATIVO" },
  mantenimiento: { bg: "#fef9c3", color: "#ca8a04", label: "EN MANTENCIÓN" },
  fuera_de_servicio: { bg: "#fee2e2", color: "#dc2626", label: "FUERA DE SERVICIO" }
};

const TIPO_INC_LABEL = { falla_mecanica: "Falla Mecánica", accidente: "Accidente", otros: "Otros" };

const semaforo = (estado) => {
  const s = {
    ok: { dot: "#16a34a", label: "OK" },
    en_gestion: { dot: "#2563eb", label: "En Gestión" },
    pendiente: { dot: "#d97706", label: "Pendiente" },
    vencida: { dot: "#dc2626", label: "Vencida" },
    vencido: { dot: "#dc2626", label: "Vencido" },
    falla_leve: { dot: "#d97706", label: "Falla Leve" },
    falla_grave: { dot: "#dc2626", label: "Falla Grave" },
    desgastado: { dot: "#d97706", label: "Desgastado" },
    requiere_cambio: { dot: "#dc2626", label: "Req. Cambio" },
    baja_carga: { dot: "#d97706", label: "Baja Carga" },
    requiere_reemplazo: { dot: "#dc2626", label: "Reemplazo" }
  }[estado];
  if (!s) return `<span style="color:#94a3b8">—</span>`;
  return `<span style="display:inline-flex;align-items:center;gap:3px"><span style="width:7px;height:7px;border-radius:50%;background:${s.dot};display:inline-block;flex-shrink:0"></span><span style="color:${s.dot};font-weight:600">${s.label}</span></span>`;
};

export function generarPDFEquipo({ equipo, actividades, parches }) {
  const hoy = new Date();
  const est = ESTADO_STYLES[equipo.estado] || { bg: "#f1f5f9", color: "#64748b", label: equipo.estado };
  const tipoLabel = TIPO_LABELS[equipo.tipo] || equipo.tipo;
  const esAmb = equipo.tipo === "ambulancia";

  // Inspecciones (últimas 5)
  const inspecciones = actividades
    .filter(a => ["inspeccion","inspeccion_semanal","inspeccion_anual"].includes(a.tipo))
    .sort((a,b) => new Date(b.fecha)-new Date(a.fecha))
    .slice(0, 5);

  // Mantenimientos (últimos 5)
  const mantenimientos = actividades
    .filter(a => ["mantenimiento_preventivo","mantenimiento_correctivo","otros"].includes(a.tipo))
    .sort((a,b) => new Date(b.fecha)-new Date(a.fecha))
    .slice(0, 5);

  // Incidentes
  const incidentes = actividades
    .filter(a => a.tipo === "incidente")
    .sort((a,b) => new Date(b.fecha)-new Date(a.fecha));

  const fotoHtml = equipo.foto_url
    ? `<img src="${equipo.foto_url}" style="width:100%;height:180px;object-fit:cover;border-radius:8px;border:1px solid #e2e8f0" />`
    : `<div style="width:100%;height:180px;background:linear-gradient(135deg,#eff6ff,#e0e7ff);border-radius:8px;border:1px solid #e2e8f0;display:flex;align-items:center;justify-content:center;flex-direction:column">
        <div style="font-size:48px;margin-bottom:8px">${esAmb ? "🚑" : "🔬"}</div>
        <div style="color:#94a3b8;font-size:10px">Sin imagen registrada</div>
       </div>`;

  // Detalles ambulancia
  let seccionEspecifica = "";
  if (esAmb) {
    seccionEspecifica = `
      <div style="margin-top:14px">
        <div style="font-size:10px;font-weight:700;color:#1e3a5f;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #e2e8f0;padding-bottom:4px;margin-bottom:8px">Estado del Vehículo</div>
        <table style="width:100%;font-size:9.5px;border-collapse:collapse">
          <tr>
            <td style="padding:3px 6px;color:#64748b;width:22%">Neumáticos</td>
            <td style="padding:3px 6px;width:28%">${semaforo(equipo.estado_neumaticos)}</td>
            <td style="padding:3px 6px;color:#64748b;width:22%">Luces</td>
            <td style="padding:3px 6px">${semaforo(equipo.estado_luces)}</td>
          </tr>
          <tr style="background:#f8fafc">
            <td style="padding:3px 6px;color:#64748b">Batería Veh.</td>
            <td style="padding:3px 6px">${semaforo(equipo.estado_bateria_vehiculo)}</td>
            <td style="padding:3px 6px;color:#64748b">Sirena</td>
            <td style="padding:3px 6px">${semaforo(equipo.estado_sirena)}</td>
          </tr>
          <tr>
            <td style="padding:3px 6px;color:#64748b">Rev. Técnica</td>
            <td style="padding:3px 6px">${semaforo(equipo.estado_revision_tecnica)}</td>
            <td style="padding:3px 6px;color:#64748b">Permiso Circ.</td>
            <td style="padding:3px 6px">${semaforo(equipo.estado_permiso_circulacion)}</td>
          </tr>
          ${equipo.fecha_vencimiento_revision_tecnica ? `<tr style="background:#f8fafc"><td style="padding:3px 6px;color:#64748b">Vence Rev. Téc.</td><td colspan="3" style="padding:3px 6px;font-weight:600">${format(parseISO(equipo.fecha_vencimiento_revision_tecnica),"dd/MM/yyyy")}</td></tr>` : ""}
          ${equipo.fecha_vencimiento_permiso_circulacion ? `<tr><td style="padding:3px 6px;color:#64748b">Vence Permiso</td><td colspan="3" style="padding:3px 6px;font-weight:600">${format(parseISO(equipo.fecha_vencimiento_permiso_circulacion),"dd/MM/yyyy")}</td></tr>` : ""}
        </table>
      </div>`;
  } else {
    // Parches
    const parchesActivos = parches.filter(p => p.equipo_id === equipo.id && p.activo !== false);
    const TIPO_PARCHE = { adulto: "Adulto", pediatrico: "Pediátrico", mixto: "Mixto" };
    const filasParches = parchesActivos.length === 0
      ? `<tr><td colspan="4" style="text-align:center;color:#94a3b8;padding:10px">Sin parches registrados</td></tr>`
      : parchesActivos.map(p => {
          const dias = differenceInDays(parseISO(p.fecha_vencimiento), hoy);
          const color = dias < 0 ? "#dc2626" : dias <= 30 ? "#ea580c" : dias <= 90 ? "#d97706" : "#16a34a";
          const badge = dias < 0 ? "VENCIDO" : `${dias}d`;
          return `<tr>
            <td style="padding:4px 6px">${TIPO_PARCHE[p.tipo]||p.tipo}</td>
            <td style="padding:4px 6px">${p.cantidad} ud.</td>
            <td style="padding:4px 6px">${format(parseISO(p.fecha_vencimiento),"dd/MM/yyyy")}</td>
            <td style="padding:4px 6px"><span style="background:${color}15;color:${color};padding:1px 6px;border-radius:4px;font-size:8.5px;font-weight:700">${badge}</span></td>
          </tr>`;
        }).join("");

    const batDias = equipo.fecha_vencimiento_bateria ? differenceInDays(parseISO(equipo.fecha_vencimiento_bateria), hoy) : null;
    seccionEspecifica = `
      <div style="margin-top:14px">
        <div style="font-size:10px;font-weight:700;color:#1e3a5f;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #e2e8f0;padding-bottom:4px;margin-bottom:8px">Accesorios y Consumibles</div>
        ${batDias !== null ? `<div style="margin-bottom:8px;padding:6px 10px;border-radius:7px;background:${batDias < 0 ? "#fee2e2" : batDias <= 90 ? "#fef9c3" : "#dcfce7"};font-size:9.5px">
          <strong>Batería:</strong> Vence el ${format(parseISO(equipo.fecha_vencimiento_bateria),"dd/MM/yyyy")} 
          ${batDias < 0 ? `<strong style="color:#dc2626"> — VENCIDA (${Math.abs(batDias)} días)</strong>` : batDias <= 90 ? `<strong style="color:#d97706"> — ${batDias} días restantes</strong>` : `<span style="color:#16a34a"> — Vigente</span>`}
        </div>` : ""}
        <table style="width:100%;border-collapse:collapse;font-size:9.5px">
          <thead><tr style="background:#f8fafc">
            <th style="padding:4px 6px;text-align:left;font-size:8.5px;font-weight:700;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e2e8f0">Tipo Parche</th>
            <th style="padding:4px 6px;text-align:left;font-size:8.5px;font-weight:700;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e2e8f0">Cantidad</th>
            <th style="padding:4px 6px;text-align:left;font-size:8.5px;font-weight:700;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e2e8f0">Vencimiento</th>
            <th style="padding:4px 6px;text-align:left;font-size:8.5px;font-weight:700;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e2e8f0">Estado</th>
          </tr></thead>
          <tbody>${filasParches}</tbody>
        </table>
      </div>`;
  }

  // Sección inspecciones
  const filasInsp = inspecciones.length === 0
    ? `<tr><td colspan="4" style="text-align:center;color:#94a3b8;padding:10px">Sin inspecciones registradas</td></tr>`
    : inspecciones.map((a,i) => {
        const tipoInsp = { inspeccion_semanal:"Semanal", inspeccion_anual:"Anual", inspeccion:"General" }[a.tipo] || "Inspección";
        return `<tr style="${i%2===1?"background:#f8fafc":""}">
          <td style="padding:4px 6px">${a.fecha||"—"}</td>
          <td style="padding:4px 6px">${tipoInsp}</td>
          <td style="padding:4px 6px">${a.usuario_nombre||"—"}</td>
          <td style="padding:4px 6px;word-break:break-word">${a.observaciones||"—"}</td>
        </tr>`;
      }).join("");

  // Sección mantenimientos
  const filasMant = mantenimientos.length === 0
    ? `<tr><td colspan="4" style="text-align:center;color:#94a3b8;padding:10px">Sin registros de mantenimiento</td></tr>`
    : mantenimientos.map((a,i) => {
        const tipoM = { mantenimiento_preventivo:"Preventivo", mantenimiento_correctivo:"Correctivo", otros:"Otros" }[a.tipo] || a.tipo;
        const color = { mantenimiento_preventivo:"#2563eb", mantenimiento_correctivo:"#dc2626", otros:"#7c3aed" }[a.tipo] || "#64748b";
        return `<tr style="${i%2===1?"background:#f8fafc":""}">
          <td style="padding:4px 6px">${a.fecha||"—"}</td>
          <td style="padding:4px 6px"><span style="color:${color};font-weight:600">${tipoM}</span></td>
          <td style="padding:4px 6px">${a.usuario_nombre||"—"}</td>
          <td style="padding:4px 6px;word-break:break-word">${a.observaciones||"—"}</td>
        </tr>`;
      }).join("");

  // Sección incidentes
  const filasInc = incidentes.length === 0
    ? `<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:10px">Sin incidentes registrados</td></tr>`
    : incidentes.map((a,i) => {
        const opHtml = esAmb
          ? (a.ambulancia_operativa === false
            ? '<span style="background:#fee2e2;color:#dc2626;padding:1px 5px;border-radius:4px;font-size:8px;font-weight:700">FUERA SERVICIO</span>'
            : '<span style="background:#dcfce7;color:#16a34a;padding:1px 5px;border-radius:4px;font-size:8px;font-weight:700">OPERATIVA</span>')
          : '<span style="color:#94a3b8">N/A</span>';
        return `<tr style="${i%2===1?"background:#fff5f5":"background:#fff"}">
          <td style="padding:4px 6px">${a.fecha||"—"}</td>
          <td style="padding:4px 6px"><span style="background:#fee2e2;color:#dc2626;padding:1px 5px;border-radius:4px;font-size:8.5px;font-weight:700">${TIPO_INC_LABEL[a.tipo_incidente]||"Sin clasificar"}</span></td>
          <td style="padding:4px 6px;word-break:break-word">${a.observaciones||"—"}</td>
          <td style="padding:4px 6px">${opHtml}</td>
          <td style="padding:4px 6px">${a.usuario_nombre||"—"}</td>
        </tr>`;
      }).join("");

  const seccionTable = (titulo, icono, color, bg, headers, filas) => `
    <div style="margin-top:16px">
      <div style="background:linear-gradient(135deg,${color},${bg});border-radius:8px;padding:8px 12px;margin-bottom:8px">
        <div style="font-size:11px;font-weight:700;color:white">${icono} ${titulo}</div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:9.5px">
        <thead><tr style="background:#f8fafc">${headers.map(h=>`<th style="padding:5px 6px;text-align:left;font-size:8.5px;font-weight:700;color:#64748b;text-transform:uppercase;border-bottom:2px solid #e2e8f0">${h}</th>`).join("")}</tr></thead>
        <tbody>${filas}</tbody>
      </table>
    </div>`;

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/>
<title>Informe Equipo – ${equipo.marca} ${equipo.modelo}</title>
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
  <div style="background:linear-gradient(135deg,#0f2d6b,#1565c0,#0288d1);border-radius:12px;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
    <div>
      <div style="font-size:9.5px;color:rgba(255,255,255,0.6);text-transform:uppercase;letter-spacing:0.06em">Informe Individual de Equipo</div>
      <div style="font-size:17px;font-weight:800;color:white;margin-top:2px">${equipo.marca} ${equipo.modelo}</div>
      <div style="font-size:9.5px;color:rgba(255,255,255,0.7);margin-top:3px">${tipoLabel} &nbsp;·&nbsp; Inventario: ${equipo.numero_inventario||"—"}</div>
    </div>
    <div style="text-align:right;color:rgba(255,255,255,0.8);font-size:9px;line-height:1.7">
      Corporación Municipal de Panguipulli<br/>Departamento de Informática<br/>Generado: ${format(hoy,"dd/MM/yyyy")} a las ${format(hoy,"HH:mm")} hrs
    </div>
  </div>

  <!-- CUERPO PRINCIPAL -->
  <div style="display:grid;grid-template-columns:160px 1fr;gap:14px">
    <!-- Foto + estado -->
    <div>
      ${fotoHtml}
      <div style="margin-top:7px;text-align:center;padding:5px 8px;border-radius:7px;background:${est.bg};color:${est.color};font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em">${est.label}</div>
      <div style="margin-top:6px;font-size:8.5px;color:#64748b;text-align:center;line-height:1.5">${equipo.centro_principal}${equipo.subsede ? `<br/><strong>${equipo.subsede}</strong>` : ""}${equipo.ubicacion_especifica ? `<br/>${equipo.ubicacion_especifica}` : ""}</div>
    </div>
    <!-- Datos generales -->
    <div>
      <div style="font-size:10px;font-weight:700;color:#1e3a5f;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #e2e8f0;padding-bottom:4px;margin-bottom:8px">Datos Generales</div>
      <table style="width:100%;font-size:9.5px;border-collapse:collapse">
        <tr><td style="padding:3px 0;color:#94a3b8;width:35%">N° Serie</td><td style="padding:3px 0;font-weight:600">${equipo.numero_serie||"—"}</td></tr>
        <tr><td style="padding:3px 0;color:#94a3b8">Año Adquisición</td><td style="padding:3px 0;font-weight:600">${equipo.anio_adquisicion||"—"}</td></tr>
        ${equipo.fecha_fabricacion ? `<tr><td style="padding:3px 0;color:#94a3b8">Fecha Fabricación</td><td style="padding:3px 0;font-weight:600">${format(parseISO(equipo.fecha_fabricacion),"dd/MM/yyyy")}</td></tr>` : ""}
        ${equipo.pais_origen ? `<tr><td style="padding:3px 0;color:#94a3b8">País de Origen</td><td style="padding:3px 0;font-weight:600">${equipo.pais_origen}</td></tr>` : ""}
        ${equipo.proveedor ? `<tr><td style="padding:3px 0;color:#94a3b8">Proveedor</td><td style="padding:3px 0;font-weight:600">${equipo.proveedor}</td></tr>` : ""}
        ${equipo.patente ? `<tr><td style="padding:3px 0;color:#94a3b8">Patente</td><td style="padding:3px 0;font-weight:700;color:#1d4ed8">${equipo.patente}</td></tr>` : ""}
        ${equipo.conductor_responsable ? `<tr><td style="padding:3px 0;color:#94a3b8">Conductor</td><td style="padding:3px 0;font-weight:600">${equipo.conductor_responsable}</td></tr>` : ""}
        ${equipo.numero_inventario ? `<tr><td style="padding:3px 0;color:#94a3b8">N° Inventario</td><td style="padding:3px 0;font-weight:600">${equipo.numero_inventario}</td></tr>` : ""}
      </table>
      ${seccionEspecifica}
    </div>
  </div>

  <!-- INSPECCIONES -->
  ${seccionTable("Últimas Inspecciones (5 más recientes)","✓","#1565c0","#0288d1",["Fecha","Tipo","Responsable","Observaciones"],filasInsp)}

  <!-- MANTENIMIENTOS -->
  ${seccionTable("Historial de Mantenimiento (5 más recientes)","🔧","#5b21b6","#7c3aed",["Fecha","Tipo","Responsable","Observaciones"],filasMant)}

  <!-- INCIDENTES -->
  ${incidentes.length > 0 ? seccionTable("Registro de Incidentes","⚠","#b91c1c","#dc2626",["Fecha","Causa","Descripción","Estado Amb.","Responsable"],filasInc) : ""}

  ${equipo.notas ? `<div style="margin-top:14px;padding:10px 14px;border-radius:8px;background:#eff6ff;border-left:4px solid #2563eb;font-size:9.5px;color:#1e40af"><strong>Notas:</strong> ${equipo.notas}</div>` : ""}

  <!-- PIE -->
  <div class="footer-bar">
    <strong>Corporación Municipal de Panguipulli</strong> &nbsp;–&nbsp; Informe elaborado por departamento de informática<br/>
    <span style="font-size:8px">Documento generado automáticamente el ${format(hoy,"dd/MM/yyyy")} a las ${format(hoy,"HH:mm")} hrs &nbsp;|&nbsp; Sistema de Gestión de Equipos Médicos</span>
  </div>
</div>
<button class="print-btn no-print" onclick="window.print()">🖨️ Imprimir / Guardar PDF</button>
</body></html>`;

  const blob = new Blob([html], { type: "text/html" });
  window.open(URL.createObjectURL(blob), "_blank");
}