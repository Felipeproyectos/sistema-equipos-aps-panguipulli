// Pauta de Cabina de las ambulancias: la revisión de insumos de la cabina
// sanitaria ("Revisión Ambulancia").
//
// A diferencia de las otras pautas, no se llena en pantalla: son más de cien
// insumos con cantidad y vencimiento, y en terreno se sigue llenando en papel.
// Por eso el sistema entrega el formato (Word para llenar en el computador,
// PDF para imprimir) y recibe de vuelta el archivo o las fotos de las hojas,
// junto con las dos preguntas que el encargado necesita ver sin abrir nada.
//
// Lo que viaja de la pantalla al servidor y del servidor a la revisión se
// define acá, para que el formulario, la Revisión Bitácora y la ficha del
// vehículo lean lo mismo. `node src/lib/pautaCabina.js` corre el autotest.

/** tipo_formulario en InspeccionPendiente. */
export const TIPO_FORMULARIO = "pauta_cabina";
/** tipo de la Actividad que queda en la ficha al aprobarla. */
export const TIPO_ACTIVIDAD = "inspeccion_cabina";

export const FORMATOS = {
  word: "/formatos/Pauta_de_Cabina_Ambulancia.docx",
  pdf: "/formatos/Pauta_de_Cabina_Ambulancia.pdf",
};

// Mismos límites que aplica el servidor (servidor/funciones/subirPautaCabina.js).
export const MAX_ARCHIVOS = 5;
export const MAX_MB = 10;
export const TIPOS_ACEPTADOS = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/webp",
];
export const ACCEPT = ".pdf,.doc,.docx,image/*";

const EXTENSION_A_TIPO = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/** El tipo del archivo. Algunos teléfonos mandan el Word sin tipo: se deduce
 *  de la extensión. */
export function tipoDeArchivo(nombre = "", tipo = "") {
  if (tipo && TIPOS_ACEPTADOS.includes(tipo)) return tipo;
  const ext = String(nombre).split(".").pop().toLowerCase();
  return EXTENSION_A_TIPO[ext] || tipo || "";
}

export const esImagen = (tipo) => String(tipo).startsWith("image/");

export function tamanoLegible(bytes) {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

/** Lo que se lee de datos_json de una pauta de cabina, con valores seguros. */
export function leerPautaCabina(insp) {
  let datos = {};
  try { datos = insp?.datos_json ? JSON.parse(insp.datos_json) : {}; } catch { datos = {}; }
  const archivos = Array.isArray(datos.archivos) ? datos.archivos.filter(a => a && a.url) : [];
  return {
    materialCaducado: datos.material_caducado === true,
    reponerMaterial: datos.reponer_material === true,
    respondio: typeof datos.material_caducado === "boolean" && typeof datos.reponer_material === "boolean",
    archivos,
    horaRegistro: datos.hora_registro || null,
    equipo: datos.equipo || null,
  };
}

/** ¿Hay algo que mirar con urgencia? */
export const tieneAvisos = (p) => p.materialCaducado || p.reponerMaterial;

/** La frase corta que se guarda en la Actividad y se ve en el historial. */
export function resumenParaHistorial(p, observaciones = "") {
  const partes = [
    `Material caducado: ${p.materialCaducado ? "Sí" : "No"}`,
    `Reponer material: ${p.reponerMaterial ? "Sí" : "No"}`,
    `Archivos: ${p.archivos.length}`,
  ];
  const obs = String(observaciones || "").trim();
  return partes.join(". ") + "." + (obs ? ` Observaciones: ${obs}` : "");
}

export function _selfCheck() {
  const fallos = [];
  const debe = (c, q) => { if (!c) fallos.push(q); };

  debe(tipoDeArchivo("pauta.docx", "") === EXTENSION_A_TIPO.docx, "el Word sin tipo se reconoce por la extensión");
  debe(tipoDeArchivo("FOTO.JPG", "") === "image/jpeg", "la extensión en mayúsculas también");
  debe(tipoDeArchivo("x.pdf", "application/pdf") === "application/pdf", "el tipo que viene se respeta");
  debe(tipoDeArchivo("x.exe", "") === "", "lo desconocido queda vacío");
  debe(tamanoLegible(1258291) === "1,2 MB" && tamanoLegible(2048) === "2 KB", "tamaños legibles");

  const p = leerPautaCabina({ datos_json: JSON.stringify({
    material_caducado: true, reponer_material: false,
    archivos: [{ nombre: "a.pdf", url: "https://x/a.pdf" }, { nombre: "sin url" }],
  }) });
  debe(p.materialCaducado && !p.reponerMaterial && p.respondio, "lee las dos respuestas");
  debe(p.archivos.length === 1, "descarta archivos sin dirección");
  debe(tieneAvisos(p), "material caducado es un aviso");
  debe(resumenParaHistorial(p, " faltan cánulas ") ===
    "Material caducado: Sí. Reponer material: No. Archivos: 1. Observaciones: faltan cánulas", "resumen para el historial");

  const roto = leerPautaCabina({ datos_json: "{no es json" });
  debe(!roto.respondio && roto.archivos.length === 0 && !tieneAvisos(roto), "un datos_json roto no rompe la pantalla");

  if (fallos.length) { console.error("FALLOS:\n  " + fallos.join("\n  ")); return false; }
  console.log("pautaCabina: autotest ok");
  return true;
}

if (typeof process !== "undefined" && process.argv?.[1]?.endsWith("pautaCabina.js")) _selfCheck();
