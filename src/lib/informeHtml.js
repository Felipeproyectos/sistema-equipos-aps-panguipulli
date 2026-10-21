// Los informes que se imprimen (ficha del equipo, historial de inspecciones,
// orden de trabajo, reportes…) se arman como HTML y se abren en una pestaña
// nueva. Esa pestaña tiene el MISMO origen que la aplicación: un <script> o un
// onerror metido en un texto (el nombre del conductor de la página pública,
// por ejemplo) correría con la sesión de quien imprime y podría robarla.
//
// Dos defensas, las dos siempre:
//   1. escaparDatos(): todo texto que venga de la base se escapa ANTES de
//      armar el HTML. Se aplica a los datos de entrada, no plantilla por
//      plantilla, para que un campo nuevo no quede afuera por olvido.
//   2. abrirInformeHtml(): la página lleva una política (CSP) que no deja
//      correr ningún script salvo el del botón Imprimir, ni enviar formularios.
//
// `node src/lib/informeHtml.js` corre el autotest.

const MAPA = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Un texto listo para ir dentro de HTML (contenido o atributo entre comillas). */
export const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => MAPA[c]);

/**
 * Copia de los datos con cada texto escapado, a cualquier profundidad (también
 * las claves: los ítems de un checklist son claves). Números, booleanos,
 * fechas y null quedan como están. Un texto sin caracteres especiales (fechas
 * ISO, estados, ids) sale idéntico, así que las comparaciones siguen andando.
 */
export function escaparDatos(v) {
  if (typeof v === "string") return esc(v);
  if (Array.isArray(v)) return v.map(escaparDatos);
  if (v && typeof v === "object" && !(v instanceof Date)) {
    const copia = {};
    for (const [k, x] of Object.entries(v)) copia[esc(k)] = escaparDatos(x);
    return copia;
  }
  return v;
}

function nonce() {
  const a = new Uint8Array(16);
  (globalThis.crypto || {}).getRandomValues?.(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("") || String(Date.now());
}

/** El HTML con la política de seguridad y el botón Imprimir sin JS en línea. */
export function blindarInforme(html) {
  const n = nonce();
  const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; `
    + `img-src data: blob: https:; style-src 'unsafe-inline'; font-src data: https:; `
    + `script-src 'nonce-${n}'; base-uri 'none'; form-action 'none'">`;
  const imprimir = `<script nonce="${n}">document.addEventListener("click",function(e){`
    + `var b=e.target&&e.target.closest&&e.target.closest("[data-imprimir]");if(b)window.print();});</script>`;
  let doc = String(html).split('onclick="window.print()"').join("data-imprimir");
  // La política va lo primero dentro de <head>, antes de cualquier dato.
  doc = /<head[^>]*>/i.test(doc) ? doc.replace(/<head([^>]*)>/i, `<head$1>${csp}`) : csp + doc;
  const fin = doc.toLowerCase().lastIndexOf("</body>");
  return fin === -1 ? doc + imprimir : doc.slice(0, fin) + imprimir + doc.slice(fin);
}

/** Abre el informe en una pestaña nueva. false si el navegador la bloqueó. */
export function abrirInformeHtml(html) {
  const blob = new Blob([blindarInforme(html)], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const ventana = window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return !!ventana;
}

export function _selfCheck() {
  const fallos = [];
  const debe = (c, q) => { if (!c) fallos.push(q); };
  debe(esc(`<img src=x onerror="a('b')">&`) === "&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;", "esc");
  debe(esc(null) === "" && esc(0) === "0", "esc de vacíos y números");
  const d = escaparDatos({ conductor: "<b>x</b>", km: 12, ok: true, fecha: "2026-10-14", lista: [{ obs: "a<b" }],
    checklist: { "<svg onload=x>": { estado: "malo" } } });
  debe(d.conductor === "&lt;b&gt;x&lt;/b&gt;" && d.km === 12 && d.ok === true && d.fecha === "2026-10-14", "datos planos");
  debe(d.lista[0].obs === "a&lt;b" && d.checklist["&lt;svg onload=x&gt;"].estado === "malo", "datos anidados y claves");
  const h = blindarInforme(`<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>t</title></head><body><p>x</p><button onclick="window.print()">I</button></body></html>`);
  debe(/<head><meta http-equiv="Content-Security-Policy"[^>]*script-src 'nonce-[0-9a-f]+'/.test(h), "CSP primero en head");
  debe(!h.includes("onclick=") && h.includes("data-imprimir") && /<script nonce="[0-9a-f]+">[\s\S]*<\/script><\/body>/.test(h), "botón sin JS en línea");
  if (fallos.length) { console.error("FALLOS:\n  " + fallos.join("\n  ")); return false; }
  console.log("informeHtml: autotest ok");
  return true;
}

if (typeof process !== "undefined" && process.argv?.[1]?.endsWith("informeHtml.js")) _selfCheck();
