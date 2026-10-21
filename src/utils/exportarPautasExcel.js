// Las pautas que se están viendo en Revisión Bitácora, en una planilla.
//
// Para una revisión o auditoría: el centro que tuvo una ambulancia (propia o
// prestada) saca de una vez todas las pautas de un período, con quién las
// hizo, quién las aprobó y qué fallas marcaron. Sale como CSV, que Excel abre
// directo (separado por punto y coma y con BOM, para que lea bien los acentos
// en la configuración regional de Chile).
//
// Un texto que empieza con = + - @ se antepone con un apóstrofo: así Excel no
// lo interpreta como fórmula (un nombre "=HYPERLINK(...)" en la página
// pública no puede convertirse en un enlace o en un cálculo al abrir el
// archivo).
//
// `node src/utils/exportarPautasExcel.js` corre el autotest.
import { fallasDeInspeccion, pautaConFallas } from "../lib/fallasPauta.js";

const TIPO = {
  inspeccion_diaria: "Pauta Diaria",
  inspeccion_semanal: "Pauta Semanal",
  inspeccion_anual: "Pauta Anual",
  turno_chofer: "Turno Chofer",
  pauta_cabina: "Pauta de Cabina",
};
const ESTADO = { pendiente: "Pendiente", aprobado: "Aprobada", rechazado: "Rechazada" };
const MOMENTO = { inicio: "Inicio de turno", termino: "Término de turno" };

const COLUMNAS = [
  "Fecha", "Hora de registro", "Centro a cargo", "Centro dueño", "Prestada",
  "Equipo", "Patente", "Tipo de pauta", "Momento", "Realizada por", "Estado",
  "Revisada por", "Fecha de revisión", "Con fallas", "Fallas", "Observaciones", "Nota del revisor",
];

function leerDatos(insp) {
  try { return insp.datos_json ? JSON.parse(insp.datos_json) : {}; } catch { return {}; }
}

const fechaCL = (v) => {
  const [y, m, d] = String(v || "").slice(0, 10).split("-");
  return d ? `${d}-${m}-${y}` : "";
};
const horaCL = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? ""
    : d.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Santiago" });
};

/** Un valor listo para una celda: sin fórmulas, entre comillas si hace falta. */
export function celda(v) {
  let t = String(v ?? "").replace(/\r?\n/g, " ").trim();
  if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
  return /[";]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

/** Una fila por pauta, en el orden en que llegan. */
export function filasDePautas(lista) {
  return (lista || []).map((insp) => {
    const datos = leerDatos(insp);
    const fallas = fallasDeInspeccion(datos);
    const prestada = insp.prestada_por || (insp.centro_dueno && insp.centro_resuelto !== insp.centro_dueno);
    return [
      fechaCL(insp.fecha),
      horaCL(datos.hora_registro),
      insp.centro_resuelto || datos.equipo?.centro_principal || "",
      insp.centro_dueno || datos.equipo?.centro_principal || "",
      prestada ? "Sí" : "No",
      // Algunas pautas guardaron el id como etiqueta: se prefiere marca y modelo.
      (insp.equipo_label && insp.equipo_label !== insp.equipo_id ? insp.equipo_label : "")
        || [datos.equipo?.marca, datos.equipo?.modelo].filter(Boolean).join(" ") || insp.equipo_id || "",
      datos.equipo?.patente || "",
      TIPO[insp.tipo_formulario] || insp.tipo_formulario || "",
      MOMENTO[datos.momento] || "",
      insp.conductor || "",
      ESTADO[insp.estado] || insp.estado || "",
      insp.revisor_nombre || insp.revisor_email || "",
      fechaCL(insp.fecha_revision),
      pautaConFallas(insp, datos) ? "Sí" : "No",
      fallas.map(f => (f.obs ? `${f.item}: ${f.obs}` : f.item)).join(" | "),
      insp.observaciones || "",
      insp.nota_revision || "",
    ];
  });
}

export function csvDePautas(lista) {
  return [COLUMNAS, ...filasDePautas(lista)].map(f => f.map(celda).join(";")).join("\r\n");
}

/** Descarga la planilla. El nombre lleva el período, si lo hay. */
export function descargarPautasExcel(lista, { desde, hasta, centro } = {}) {
  const partes = ["pautas", centro && centro !== "todos" ? centro : "", desde || "", hasta ? `al-${hasta}` : ""]
    .filter(Boolean).join("_").replace(/[^\wñÑáéíóúÁÉÍÓÚ-]+/g, "-");
  const blob = new Blob(["﻿" + csvDePautas(lista)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${partes || "pautas"}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export function _selfCheck() {
  const fallos = [];
  const debe = (c, q) => { if (!c) fallos.push(q); };
  debe(celda('=HYPERLINK("x")') === `"'=HYPERLINK(""x"")"`, "fórmula neutralizada y comillas escapadas");
  debe(celda("-1+2") === "'-1+2" && celda("@SUM(A1)") === "'@SUM(A1)", "otras fórmulas");
  debe(celda("Juan; Pérez") === '"Juan; Pérez"' && celda("línea\nnueva") === "línea nueva", "punto y coma y saltos");
  const insp = {
    fecha: "2026-10-21", tipo_formulario: "inspeccion_diaria", estado: "aprobado", conductor: "Ana",
    equipo_label: "Mercedes Sprinter", revisor_nombre: "Calidad Coñaripe", fecha_revision: "2026-10-22",
    centro_resuelto: "CESFAM Coñaripe", centro_dueno: "CESFAM Panguipulli", prestada_por: "CESFAM Panguipulli",
    observaciones: "[1. Revisión Exterior] Incorrectos: Luces",
    datos_json: JSON.stringify({ equipo: { patente: "KWZP-90" }, momento: "inicio", hora_registro: "2026-10-21T12:05:00Z",
      exterior: { Luces: { estado: "incorrecto", obs: "foco" } } }),
  };
  const [f] = filasDePautas([insp]);
  debe(f[0] === "21-10-2026" && f[1] === "09:05" && f[2] === "CESFAM Coñaripe" && f[3] === "CESFAM Panguipulli" && f[4] === "Sí", "fila: fecha, hora y centros");
  debe(f[6] === "KWZP-90" && f[7] === "Pauta Diaria" && f[8] === "Inicio de turno" && f[10] === "Aprobada", "fila: equipo y estado");
  debe(f[13] === "Sí" && f[14] === "Luces: foco", "fila: fallas");
  const csv = csvDePautas([insp]);
  debe(csv.split("\r\n").length === 2 && csv.startsWith("Fecha;Hora de registro;Centro a cargo"), "csv con encabezado");
  if (fallos.length) { console.error("FALLOS:\n  " + fallos.join("\n  ")); return false; }
  console.log("exportarPautasExcel: autotest ok");
  return true;
}

if (typeof process !== "undefined" && process.argv?.[1]?.endsWith("exportarPautasExcel.js")) _selfCheck();
