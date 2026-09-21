import {
  asignacionesDelDia, tramosDelPeriodo, rangosSeTocan, esFinDeSemana,
} from "@/lib/calendarioFlota";

// La programación de la flota, para imprimir o guardar en PDF.
//
// Por qué no basta con imprimir la pantalla
// ─────────────────────────────────────────
// En pantalla la grilla del mes se lee por colores y se completa pasando el
// cursor por encima. En un papel pegado en la oficina no hay cursor: el que
// lo mira tiene que poder leer el nombre del chofer. Por eso son dos formas
// distintas de la misma información:
//
//   semana  una columna por día, ancha, con el nombre adentro. Es la que se
//           imprime para la semana que viene.
//   mes     la grilla compacta para ver la ocupación de un vistazo, y debajo
//           el detalle en palabras: vehículo, chofer, desde, hasta.
//
// Los tramos del detalle vienen recortados al período (ver tramosDelPeriodo):
// una asignación abierta impresa con su fecha original diría algo que no es
// lo que se está mirando.

const DIAS_CORTOS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MESES = ["enero","febrero","marzo","abril","mayo","junio",
               "julio","agosto","septiembre","octubre","noviembre","diciembre"];

const ABREV_TURNO = { completo: "", manana: "AM", tarde: "PM" };

/** Todo lo que sale de la base se escapa: un destino con un `<` no puede
 *  romper el documento. */
const esc = (v) => String(v ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

const dma = (iso) => {
  if (!iso) return "—";
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("es-CL");
};

const nroDia = (iso) => Number(iso.slice(-2));
const nombreDia = (iso) => DIAS_CORTOS[new Date(`${iso}T12:00:00`).getDay()];

const rotulo = (eq) => [eq.marca, eq.modelo].filter(Boolean).join(" ")
  + (eq.patente ? ` · ${eq.patente}` : "");

const COLOR = {
  completo: "#bbf7d0",
  manana:   "#bfdbfe",
  tarde:    "#ddd6fe",
  taller:   "#fecaca",
  prestado: "#fed7aa",
  finde:    "#f8fafc",
  libre:    "#ffffff",
};

/** Qué pintar en la celda de un vehículo un día. El taller manda sobre todo
 *  lo demás porque es lo que de verdad impide usar el vehículo. */
function celda(eq, dia, activas, prestamos, taller) {
  const asigs = asignacionesDelDia(activas, eq.id, dia);
  const enTaller = taller.find(t => t.equipo_id === eq.id && rangosSeTocan(t.desde, t.hasta, dia, dia));
  const prestamo = prestamos.find(p => p.equipo_id === eq.id
    && rangosSeTocan(p.desde, p.hasta_previsto, dia, dia));

  if (enTaller) return { fondo: COLOR.taller, texto: `Taller ${enTaller.numero_ot || ""}`.trim(), asigs, prestamo };
  if (asigs.length) {
    const turnos = new Set(asigs.map(a => a.turno || "completo"));
    const clave = turnos.size > 1 ? "completo" : [...turnos][0];
    const texto = asigs
      .map(a => `${a.chofer_nombre || "?"}${ABREV_TURNO[a.turno || "completo"] ? ` (${ABREV_TURNO[a.turno]})` : ""}`)
      .join(" / ");
    return { fondo: COLOR[clave] || COLOR.completo, texto, asigs, prestamo };
  }
  if (prestamo) return { fondo: COLOR.prestado, texto: `Prestado a ${prestamo.centro_destino || ""}`.trim(), asigs, prestamo };
  return { fondo: esFinDeSemana(dia) ? COLOR.finde : COLOR.libre, texto: "", asigs, prestamo };
}

function tablaSemana(equipos, dias, activas, prestamos, taller) {
  const cabecera = dias.map(d => `
    <th style="border:1px solid #cbd5e1;padding:5px 3px;font-size:9px;background:${esFinDeSemana(d) ? "#f1f5f9" : "#e2e8f0"};color:#334155">
      ${nombreDia(d)}<br/><span style="font-size:11px">${nroDia(d)}</span>
    </th>`).join("");

  const filas = equipos.map(eq => {
    const celdas = dias.map(d => {
      const c = celda(eq, d, activas, prestamos, taller);
      const marcaPrestamo = c.prestamo && c.asigs.length
        ? `<div style="font-size:7px;color:#9a3412;margin-top:1px">en ${esc(c.prestamo.centro_destino)}</div>` : "";
      return `<td style="border:1px solid #cbd5e1;padding:4px 3px;background:${c.fondo};font-size:8.5px;
                         color:#0f172a;vertical-align:top;height:34px;line-height:1.25">
                ${esc(c.texto)}${marcaPrestamo}
              </td>`;
    }).join("");
    return `<tr>
      <td style="border:1px solid #cbd5e1;padding:5px 6px;font-size:9px;font-weight:700;color:#0f172a;background:#f8fafc;white-space:nowrap">
        ${esc(rotulo(eq))}
      </td>${celdas}</tr>`;
  }).join("");

  return `<table style="width:100%;border-collapse:collapse;table-layout:fixed">
    <colgroup><col style="width:120px"/>${dias.map(() => "<col/>").join("")}</colgroup>
    <thead><tr><th style="border:1px solid #cbd5e1;padding:5px;font-size:9px;background:#e2e8f0;color:#334155;text-align:left">Vehículo</th>${cabecera}</tr></thead>
    <tbody>${filas}</tbody>
  </table>`;
}

function grillaMes(equipos, dias, activas, prestamos, taller) {
  const cabecera = dias.map(d => `
    <th style="border:1px solid #cbd5e1;padding:2px 0;font-size:7px;background:${esFinDeSemana(d) ? "#f1f5f9" : "#e2e8f0"};color:#475569">
      ${nroDia(d)}
    </th>`).join("");

  const filas = equipos.map(eq => {
    const celdas = dias.map(d => {
      const c = celda(eq, d, activas, prestamos, taller);
      return `<td style="border:1px solid #e2e8f0;background:${c.fondo};height:16px"></td>`;
    }).join("");
    return `<tr>
      <td style="border:1px solid #cbd5e1;padding:3px 6px;font-size:8px;font-weight:700;color:#0f172a;background:#f8fafc;white-space:nowrap">
        ${esc(rotulo(eq))}
      </td>${celdas}</tr>`;
  }).join("");

  return `<table style="width:100%;border-collapse:collapse;table-layout:fixed">
    <colgroup><col style="width:130px"/>${dias.map(() => "<col/>").join("")}</colgroup>
    <thead><tr><th style="border:1px solid #cbd5e1;padding:3px 6px;font-size:8px;background:#e2e8f0;color:#334155;text-align:left">Vehículo</th>${cabecera}</tr></thead>
    <tbody>${filas}</tbody>
  </table>`;
}

/** El detalle en palabras. Es lo que hace legible la impresión del mes.
 *
 *  Lleva "Dónde estaba" porque un vehículo cedido a otro centro sigue
 *  apareciendo con su chofer, y en el papel eso se leería como si hubiera
 *  estado en casa. Dónde estuvo el vehículo es lo primero que se pregunta
 *  cuando alguien revisa esta hoja después. */
function dondeEstaba(eq, tramo, prestamos) {
  const p = prestamos.find(x => x.equipo_id === eq.id
    && rangosSeTocan(x.desde, x.hasta_previsto, tramo.desde, tramo.hasta));
  return p ? `Prestado a ${p.centro_destino || "otro centro"}` : (eq.centro_principal || "—");
}

function detalle(equipos, dias, activas, prestamos) {
  const desde = dias[0];
  const hasta = dias[dias.length - 1];
  const filas = [];

  for (const eq of equipos) {
    for (const t of tramosDelPeriodo(activas, eq.id, desde, hasta)) {
      const a = t.asignacion;
      filas.push(`<tr>
        <td style="border-bottom:1px solid #e2e8f0;padding:4px 6px;font-size:8.5px">${esc(rotulo(eq))}</td>
        <td style="border-bottom:1px solid #e2e8f0;padding:4px 6px;font-size:8.5px;font-weight:600">${esc(a.chofer_nombre || "—")}</td>
        <td style="border-bottom:1px solid #e2e8f0;padding:4px 6px;font-size:8.5px">${dma(t.desde)}</td>
        <td style="border-bottom:1px solid #e2e8f0;padding:4px 6px;font-size:8.5px">
          ${dma(t.hasta)}${t.recortado && !a.hasta ? ' <span style="color:#94a3b8">(sigue)</span>' : ""}
        </td>
        <td style="border-bottom:1px solid #e2e8f0;padding:4px 6px;font-size:8.5px">
          ${a.turno === "manana" ? "Mañana" : a.turno === "tarde" ? "Tarde" : "Todo el día"}
        </td>
        <td style="border-bottom:1px solid #e2e8f0;padding:4px 6px;font-size:8.5px;color:#475569">${esc(a.destino || "—")}</td>
        <td style="border-bottom:1px solid #e2e8f0;padding:4px 6px;font-size:8.5px;color:#9a3412">${esc(dondeEstaba(eq, t, prestamos))}</td>
      </tr>`);
    }
  }

  if (!filas.length) {
    return `<p style="font-size:9px;color:#94a3b8;margin-top:10px">No hay nada programado en este período.</p>`;
  }

  return `<table style="width:100%;border-collapse:collapse;margin-top:10px">
    <thead><tr style="background:#f1f5f9">
      ${["Vehículo","Chofer","Desde","Hasta","Turno","Destino","Dónde estaba"].map(h =>
        `<th style="padding:5px 6px;font-size:8px;text-transform:uppercase;letter-spacing:0.04em;color:#475569;text-align:left;border-bottom:2px solid #cbd5e1">${h}</th>`).join("")}
    </tr></thead>
    <tbody>${filas.join("")}</tbody>
  </table>`;
}

const cuadrito = (color, texto) =>
  `<span style="display:inline-flex;align-items:center;gap:4px;margin-right:12px">
     <span style="width:10px;height:10px;border:1px solid #94a3b8;background:${color};display:inline-block"></span>${texto}
   </span>`;

/**
 * @param {object} p
 * @param {'semana'|'mes'} p.modo
 * @param {string[]} p.dias         días ISO del período, en orden
 * @param {object[]} p.equipos      los vehículos, en el orden en que se muestran
 * @param {object[]} p.asignaciones todas; acá se filtran las activas
 * @param {object[]} p.prestamos    los vigentes
 * @param {object[]} p.taller       períodos en taller (periodosEnTaller)
 */
export function generarProgramacionFlota({ modo, dias, equipos, asignaciones, prestamos = [], taller = [] }) {
  const activas = asignaciones.filter(a => a.estado === "activa");
  const desde = dias[0];
  const hasta = dias[dias.length - 1];
  const d0 = new Date(`${desde}T12:00:00`);
  const d1 = new Date(`${hasta}T12:00:00`);

  // La mayuscula se pone acá y no con `text-transform:capitalize`, que la pone
  // en CADA palabra y dejaba el encabezado como "Semana Del 21 Al 27 De ...".
  const crudo = modo === "semana"
    ? `semana del ${d0.getDate()} al ${d1.getDate()} de ${MESES[d1.getMonth()]} de ${d1.getFullYear()}`
    : `${MESES[d0.getMonth()]} de ${d0.getFullYear()}`;
  const periodo = crudo.charAt(0).toUpperCase() + crudo.slice(1);

  const ahora = new Date();
  const cuerpo = modo === "semana"
    ? tablaSemana(equipos, dias, activas, prestamos, taller)
    : grillaMes(equipos, dias, activas, prestamos, taller) + detalle(equipos, dias, activas, prestamos);

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/>
<title>Programación de flota – ${esc(periodo)}</title>
<style>
  @page { size: A4 landscape; margin: 10mm; }
  @media print { .no-print{display:none!important;} body{background:white!important;padding:0!important;} }
  * { box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  body { font-family:'Segoe UI',Arial,sans-serif; background:#f1f5f9; margin:0; padding:14px; color:#1e293b; }
  .page { background:white; margin:0 auto; padding:16px 18px; max-width:277mm; }
  .print-btn { position:fixed; bottom:20px; right:20px; background:linear-gradient(135deg,#92400e,#d97706);
               color:white; border:none; border-radius:10px; padding:12px 24px; font-size:13px; font-weight:700;
               cursor:pointer; box-shadow:0 4px 14px rgba(146,64,14,0.4); }
</style></head><body>
<div class="page">
  <div style="display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #92400e;padding-bottom:8px;margin-bottom:12px">
    <div>
      <div style="font-size:9px;text-transform:uppercase;letter-spacing:0.12em;color:#b45309;font-weight:700">Movilización · Flota</div>
      <div style="font-size:19px;font-weight:800;color:#0f172a;line-height:1.2">Programación de vehículos</div>
      <div style="font-size:11px;color:#475569">${esc(periodo)}</div>
    </div>
    <div style="text-align:right;font-size:8.5px;color:#94a3b8;line-height:1.5">
      Corporación Municipal de Panguipulli<br/>
      ${equipos.length} ${equipos.length === 1 ? "vehículo" : "vehículos"} ·
      ${activas.length} ${activas.length === 1 ? "asignación activa" : "asignaciones activas"}
    </div>
  </div>

  ${cuerpo}

  <div style="margin-top:12px;font-size:8px;color:#64748b">
    ${cuadrito(COLOR.completo, "Con chofer, todo el día")}
    ${cuadrito(COLOR.manana, "Solo mañana (AM)")}
    ${cuadrito(COLOR.tarde, "Solo tarde (PM)")}
    ${cuadrito(COLOR.prestado, "Prestado a otro centro")}
    ${cuadrito(COLOR.taller, "En el taller")}
  </div>

  <div style="text-align:center;padding-top:10px;margin-top:12px;border-top:2px solid #e2e8f0;font-size:8px;color:#94a3b8">
    <strong>Corporación Municipal de Panguipulli</strong> — Sistema de Gestión de Equipamiento Crítico<br/>
    Impreso el ${ahora.toLocaleDateString("es-CL")} a las ${ahora.toTimeString().slice(0, 5)} hrs.
    Lo que está en el sistema manda: este papel es la foto de un momento.
  </div>
</div>
<button class="print-btn no-print" onclick="window.print()">🖨️ Imprimir / Guardar PDF</button>
</body></html>`;

  const blob = new Blob([html], { type: "text/html" });
  window.open(URL.createObjectURL(blob), "_blank");
}
