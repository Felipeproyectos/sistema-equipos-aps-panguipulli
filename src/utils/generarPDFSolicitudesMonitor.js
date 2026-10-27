import { escaparDatos, abrirInformeHtml } from "../lib/informeHtml.js";
import { CATEGORIAS, PRIORIDADES, OPERATIVIDAD, ESTADOS, GRUPOS_INFORME, rotulo } from "../lib/solicitudesMonitor.js";

// El informe de solicitudes del Monitor Corporativo, para imprimir o guardar
// en PDF (el navegador lo guarda con "Imprimir → Guardar como PDF").
//
// Dos formatos:
//   · "resumen": una tabla por centro, para revisar o llevar a una reunión.
//   · "detalle": una ficha completa por solicitud, para entregar a un
//     proveedor o archivar; cada ficha empieza en hoja nueva.
//
// Todo texto que viene de la base se escapa antes de armar el HTML
// (escaparDatos), y la pestaña se abre sin poder correr scripts
// (abrirInformeHtml). `htmlInformeSolicitudes` no toca el navegador: se puede
// probar con node.

const TIPOS_EQUIPO = {
  dea: "DEA", monitor_desfibrilador: "Monitor desfibrilador", monitor_multiparametros: "Monitor multiparámetros",
  ambulancia: "Ambulancia", camioneta: "Camioneta", furgon: "Furgón", camion_3_4: "Camión 3/4",
};

const fecha = (f) => {
  const [y, m, d] = String(f || "").slice(0, 10).split("-");
  return d ? `${d}/${m}/${y}` : "";
};
const fechaHora = (f) => {
  if (!f) return "";
  const d = new Date(f);
  if (Number.isNaN(d.getTime())) return String(f);
  return d.toLocaleString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

/** La solicitud con lo que le falte tomado de la ficha actual del equipo. */
function completar(s, equipo) {
  return {
    ...s,
    equipo_tipo: s.equipo_tipo || equipo?.tipo || "",
    equipo_marca: s.equipo_marca || equipo?.marca || "",
    equipo_modelo: s.equipo_modelo || equipo?.modelo || "",
    equipo_numero_serie: s.equipo_numero_serie || equipo?.numero_serie || "",
    equipo_numero_inventario: s.equipo_numero_inventario || equipo?.numero_inventario || "",
    patente: equipo?.patente || "",
    centro: s.centro || equipo?.centro_principal || "",
    subsede: s.subsede || equipo?.subsede || "",
    ubicacion_especifica: s.ubicacion_especifica || equipo?.ubicacion_especifica || "",
  };
}

const chip = (texto, color, fondo) => (texto ? `<span class="chip" style="color:${color};background:${fondo}">${texto}</span>` : "");
const chipEstado = (e) => { const c = ESTADOS[e || "pendiente"] || ESTADOS.pendiente; return chip(c.corto, c.color, c.bg); };
const chipPrioridad = (p) => { const c = PRIORIDADES.find(x => x.value === p); return c ? chip(c.label, c.color, c.bg) : ""; };
const nombreEquipo = (s) => [s.equipo_marca, s.equipo_modelo].filter(Boolean).join(" ") || "—";
const parte = (s) => (s.ambito === "cabina" ? "Cabina sanitaria" : s.ambito === "vehiculo" ? "Vehículo" : "");

function dato(etiqueta, valor) {
  return String(valor ?? "").trim() ? `<div class="dato"><span>${etiqueta}</span><strong>${valor}</strong></div>` : "";
}

function tablaCentro(lista) {
  const filas = lista.map(s => `<tr>
      <td><strong>${s.numero_solicitud || "—"}</strong><br/><span class="gris">${fecha(s.fecha_derivacion || s.fecha)}</span></td>
      <td>${rotulo(CATEGORIAS, s.categoria) || "—"}${parte(s) ? `<br/><span class="gris">${parte(s)}</span>` : ""}</td>
      <td><strong>${nombreEquipo(s)}</strong>${s.equipo_numero_serie ? `<br/><span class="gris">S/N ${s.equipo_numero_serie}</span>` : ""}${s.equipo_numero_inventario ? `<br/><span class="gris">Inv. ${s.equipo_numero_inventario}</span>` : ""}${s.patente ? `<br/><span class="gris">${s.patente}</span>` : ""}</td>
      <td>${[s.subsede, s.ubicacion_especifica].filter(Boolean).join("<br/>") || "—"}</td>
      <td>${s.usuario_nombre || "—"}${s.solicitante_cargo ? `<br/><span class="gris">${s.solicitante_cargo}</span>` : ""}${s.solicitante_telefono ? `<br/><span class="gris">${s.solicitante_telefono}</span>` : ""}</td>
      <td>${chipPrioridad(s.prioridad)}${s.operatividad && s.operatividad !== "operativo" ? `<br/><span class="${s.operatividad === "fuera_de_servicio" ? "rojo" : "gris"}">${rotulo(OPERATIVIDAD, s.operatividad)}</span>` : ""}</td>
      <td>${chipEstado(s.estado)}${s.monitor_nombre ? `<br/><span class="gris">${s.monitor_nombre}</span>` : ""}</td>
      <td class="texto">${s.insumo_nombre ? `<strong>${s.insumo_nombre} × ${s.insumo_cantidad || 1}</strong><br/>` : ""}${s.descripcion || s.observaciones || "—"}${s.resolucion ? `<div class="resp"><strong>Monitor:</strong> ${s.resolucion}</div>` : ""}</td>
    </tr>`).join("");
  return `<table>
    <thead><tr>
      <th style="width:9%">N° / envío</th><th style="width:10%">Tipo</th><th style="width:14%">Equipo</th>
      <th style="width:12%">Ubicación</th><th style="width:12%">Solicita</th><th style="width:9%">Prioridad</th>
      <th style="width:9%">Estado</th><th style="width:25%">Descripción</th>
    </tr></thead><tbody>${filas}</tbody></table>`;
}

function ficha(s) {
  const linea = Array.isArray(s.linea_tiempo) ? s.linea_tiempo : [];
  return `<section class="ficha">
    <div class="ficha-cab">
      <div><h2>${s.numero_solicitud || "Solicitud"}</h2><p>${rotulo(CATEGORIAS, s.categoria) || ""}${parte(s) ? ` · ${parte(s)}` : ""}</p></div>
      <div class="chips">${chipEstado(s.estado)} ${chipPrioridad(s.prioridad)}</div>
    </div>
    ${s.operatividad === "fuera_de_servicio" ? `<p class="alerta">Equipo fuera de servicio</p>` : ""}
    <h3>Dónde está</h3>
    <div class="grilla">${dato("CESFAM / centro", s.centro)}${dato("Subsede", s.subsede)}${dato("Ubicación exacta", s.ubicacion_especifica)}</div>
    <h3>Equipo</h3>
    <div class="grilla">${dato("Tipo", TIPOS_EQUIPO[s.equipo_tipo] || s.equipo_tipo)}${dato("Marca y modelo", nombreEquipo(s))}${dato("N° de serie", s.equipo_numero_serie)}${dato("N° de inventario", s.equipo_numero_inventario)}${dato("Patente", s.patente)}${dato("Estado del equipo", rotulo(OPERATIVIDAD, s.operatividad))}</div>
    <h3>Qué se pide</h3>
    <div class="grilla">${dato("Tipo de solicitud", rotulo(CATEGORIAS, s.categoria))}${dato("Prioridad", rotulo(PRIORIDADES, s.prioridad))}${dato("Insumo", s.insumo_nombre ? `${s.insumo_nombre} × ${s.insumo_cantidad || 1}` : "")}${dato("Especificación / código", s.insumo_especificacion)}${dato("Falla detectada el", fecha(s.fecha_deteccion))}${dato("Fecha de la solicitud", fecha(s.fecha))}</div>
    <div class="caja"><span>Descripción</span><p>${s.descripcion || s.observaciones || "—"}</p></div>
    <h3>Quién la pide</h3>
    <div class="grilla">${dato("Solicitante", s.usuario_nombre)}${dato("Cargo", s.solicitante_cargo)}${dato("Teléfono", s.solicitante_telefono)}${dato("Correo", s.usuario_email)}${dato("Enviada al Monitor por", s.derivada_por_nombre ? `${s.derivada_por_nombre} · ${fechaHora(s.fecha_derivacion)}` : "")}${dato("Gestiona (Monitor)", s.monitor_nombre)}</div>
    ${s.resolucion ? `<div class="caja resp"><span>Respuesta del Monitor Corporativo</span><p>${s.resolucion}</p></div>` : ""}
    ${linea.length ? `<h3>Recorrido</h3><ol class="linea">${linea.map(e => `<li><strong>${e.evento || ""}</strong> · ${e.usuario_nombre || e.usuario_email || ""} · <span class="gris">${fechaHora(e.fecha)}</span>${e.notas ? `<br/><span class="gris">${e.notas}</span>` : ""}</li>`).join("")}</ol>` : ""}
    <div class="firmas"><div>Recibe conforme (centro)</div><div>Monitor Corporativo</div></div>
  </section>`;
}

/**
 * El HTML del informe. `entrada`: { solicitudes, equipos, filtros, formato,
 * quien, ahora }. Las solicitudes ya vienen filtradas y ordenadas
 * (filtrarParaInforme).
 */
export function htmlInformeSolicitudes(entrada) {
  const ahora = entrada.ahora || new Date();
  const porId = new Map((entrada.equipos || []).map(e => [e.id, e]));
  const lista = (entrada.solicitudes || []).map(s => completar(s, porId.get(s.equipo_id)));
  const { filtros = {}, formato = "resumen", quien = "" } = escaparDatos({ filtros: entrada.filtros, formato: entrada.formato, quien: entrada.quien });
  const sol = escaparDatos(lista);

  const grupos = GRUPOS_INFORME.filter(g => (filtros.grupos || []).includes(g.clave)).map(g => g.label);
  const filtrosTexto = [
    filtros.centro && filtros.centro !== "todos" ? filtros.centro : "Todos los centros",
    grupos.length === GRUPOS_INFORME.length ? "Todos los estados" : grupos.join(", "),
    filtros.categoria && filtros.categoria !== "todas" ? rotulo(CATEGORIAS, filtros.categoria) : "",
    filtros.soloUrgentes ? "Solo críticas o fuera de servicio" : "",
    filtros.desde || filtros.hasta ? `Enviadas ${filtros.desde ? `desde el ${fecha(filtros.desde)}` : ""}${filtros.hasta ? ` hasta el ${fecha(filtros.hasta)}` : ""}` : "",
  ].filter(Boolean).join(" · ");

  const cuenta = (estados) => sol.filter(s => estados.includes(s.estado)).length;
  const urgentes = sol.filter(s => s.prioridad === "critica" || s.operatividad === "fuera_de_servicio").length;
  const centros = [...new Set(sol.map(s => s.centro || "Sin centro"))];
  const generado = ahora.toLocaleString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const titulo = sol.length === 1 && formato === "detalle" ? `Solicitud ${sol[0].numero_solicitud || ""}` : "Solicitudes de los centros";

  const cuerpo = !sol.length
    ? `<p class="vacio">Ninguna solicitud coincide con los filtros elegidos.</p>`
    : formato === "detalle"
      ? sol.map(ficha).join("")
      : centros.map(c => {
        const delCentro = sol.filter(s => (s.centro || "Sin centro") === c);
        return `<div class="centro"><h2>${c} <span>${delCentro.length} ${delCentro.length === 1 ? "solicitud" : "solicitudes"}</span></h2>${tablaCentro(delCentro)}</div>`;
      }).join("");

  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/>
<title>${titulo}</title>
<style>
  @page { size: A4 ${formato === "detalle" ? "portrait" : "landscape"}; margin: 11mm 9mm 14mm 9mm; }
  @media print { .no-print{display:none!important;} body{background:white!important;padding:0!important;} .page{box-shadow:none!important;padding:0!important;} }
  * { box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  body { font-family:'Segoe UI',Arial,sans-serif; background:#f1f5f9; margin:0; padding:16px; color:#1e293b; }
  .page { background:white; max-width:${formato === "detalle" ? "190mm" : "277mm"}; margin:0 auto; padding:16px; box-shadow:0 4px 20px rgba(15,45,107,.08); }
  .cab { background:linear-gradient(135deg,#4F46E5,#312E81); border-radius:10px; padding:14px 20px; display:flex; justify-content:space-between; gap:12px; align-items:center; margin-bottom:10px; }
  .cab h1 { color:white; margin:0; font-size:17px; } .cab p { color:rgba(255,255,255,.78); margin:3px 0 0; font-size:9.5px; }
  .cab .der { text-align:right; color:rgba(255,255,255,.85); font-size:9px; line-height:1.6; }
  .resumen { display:grid; grid-template-columns:repeat(5,1fr); gap:8px; margin-bottom:12px; }
  .tarjeta { border:1px solid #e2e8f0; border-radius:8px; padding:7px 10px; text-align:center; }
  .tarjeta .n { font-size:19px; font-weight:800; } .tarjeta .l { font-size:7.5px; color:#64748b; text-transform:uppercase; font-weight:700; }
  .centro { margin-bottom:14px; page-break-inside:auto; }
  .centro h2 { font-size:12px; margin:0 0 6px; color:#312E81; border-bottom:2px solid #c7d2fe; padding-bottom:3px; }
  .centro h2 span { font-weight:600; color:#64748b; font-size:9.5px; margin-left:6px; }
  table { width:100%; border-collapse:collapse; font-size:8.3px; table-layout:fixed; }
  thead { display:table-header-group; }
  thead th { background:#f8fafc; padding:5px; text-align:left; font-size:7.5px; color:#64748b; text-transform:uppercase; border-bottom:2px solid #e2e8f0; }
  tbody td { padding:5px; border-bottom:1px solid #f1f5f9; vertical-align:top; word-break:break-word; }
  tbody tr { page-break-inside:avoid; } tbody tr:nth-child(even) td { background:#fafbff; }
  .texto { white-space:pre-line; }
  .gris { color:#64748b; } .rojo { color:#dc2626; font-weight:700; }
  .chip { display:inline-block; padding:1px 6px; border-radius:4px; font-size:7.8px; font-weight:700; }
  .resp { margin-top:4px; background:#eef2ff; border-radius:4px; padding:3px 5px; color:#312E81; }
  .ficha { border:1px solid #e2e8f0; border-radius:10px; padding:14px 16px; margin-bottom:14px; page-break-after:always; font-size:10px; }
  .ficha:last-of-type { page-break-after:auto; }
  .ficha-cab { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #c7d2fe; padding-bottom:6px; margin-bottom:6px; }
  .ficha-cab h2 { margin:0; font-size:15px; color:#312E81; } .ficha-cab p { margin:2px 0 0; color:#64748b; }
  .ficha h3 { font-size:9px; text-transform:uppercase; color:#64748b; margin:10px 0 4px; letter-spacing:.04em; }
  .grilla { display:grid; grid-template-columns:repeat(3,1fr); gap:5px 14px; }
  .dato span { display:block; font-size:7.5px; color:#94a3b8; text-transform:uppercase; font-weight:700; } .dato strong { font-size:10px; }
  .caja { border:1px solid #e2e8f0; border-radius:6px; padding:7px 9px; margin-top:8px; }
  .caja span { font-size:7.5px; color:#94a3b8; text-transform:uppercase; font-weight:700; } .caja p { margin:3px 0 0; white-space:pre-line; }
  .alerta { background:#fef2f2; color:#b91c1c; border:1px solid #fecaca; border-radius:6px; padding:5px 8px; font-weight:700; margin:6px 0; }
  .linea { margin:0; padding-left:16px; } .linea li { margin-bottom:3px; }
  .firmas { display:grid; grid-template-columns:1fr 1fr; gap:40px; margin-top:34px; }
  .firmas div { border-top:1px solid #94a3b8; padding-top:4px; text-align:center; font-size:8.5px; color:#64748b; }
  .vacio { text-align:center; color:#94a3b8; padding:30px; }
  .pie { text-align:center; padding-top:8px; font-size:8px; color:#94a3b8; border-top:1px solid #e2e8f0; margin-top:12px; }
  .boton { position:fixed; bottom:20px; right:20px; background:linear-gradient(135deg,#4F46E5,#312E81); color:white; border:none; border-radius:10px; padding:12px 22px; font-size:13px; font-weight:700; cursor:pointer; box-shadow:0 4px 14px rgba(79,70,229,.4); }
</style></head><body>
<div class="page">
  <div class="cab">
    <div><h1>${titulo}</h1><p>${filtrosTexto}</p></div>
    <div class="der">Corporación Municipal de Panguipulli<br/>Monitor Corporativo — Equipos vitales<br/>Generado ${generado}${quien ? ` por ${quien}` : ""}</div>
  </div>
  ${formato === "resumen" || sol.length > 1 ? `<div class="resumen">
    <div class="tarjeta"><div class="n">${sol.length}</div><div class="l">En este informe</div></div>
    <div class="tarjeta"><div class="n" style="color:#4f46e5">${cuenta(["derivada"])}</div><div class="l">Por atender</div></div>
    <div class="tarjeta"><div class="n" style="color:#2563eb">${cuenta(["en_proceso"])}</div><div class="l">En gestión</div></div>
    <div class="tarjeta"><div class="n" style="color:#c2410c">${cuenta(["devuelta"])}</div><div class="l">Devueltas</div></div>
    <div class="tarjeta"><div class="n" style="color:#dc2626">${urgentes}</div><div class="l">Críticas o fuera de servicio</div></div>
  </div>` : ""}
  ${cuerpo}
  <div class="pie"><strong>Corporación Municipal de Panguipulli</strong> · Sistema de Gestión de Equipamiento Crítico · Documento generado automáticamente el ${generado}. Contiene datos de funcionarios: uso interno.</div>
</div>
<button class="boton no-print" onclick="window.print()">Imprimir / Guardar PDF</button>
</body></html>`;
}

/** Abre el informe en una pestaña nueva. false si el navegador la bloqueó. */
export function generarPDFSolicitudesMonitor(entrada) {
  return abrirInformeHtml(htmlInformeSolicitudes(entrada));
}
