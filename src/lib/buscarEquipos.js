// El buscador del menú: encontrar un equipo o vehículo por patente, número de
// inventario o de serie, o por marca y modelo, escribiéndolo como salga.
// `node src/lib/buscarEquipos.js` corre el autotest.
//
// "kxjz42", "KXJZ-42" y "kx jz 42" tienen que encontrar la misma patente: la
// gente la escribe de memoria, sin guiones, y desde el celular.

const sinMarcas = (t) => String(t || "")
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase();

/** Solo letras y números: así el guion o el punto no impiden encontrar. */
const compacto = (t) => sinMarcas(t).replace(/[^a-z0-9]/g, "");

const CAMPOS_EXACTOS = ["patente", "numero_inventario", "numero_serie"];

/**
 * Los equipos que calzan con lo escrito, los mejores primero:
 *   1. patente / inventario / serie que empieza igual
 *   2. patente / inventario / serie que lo contiene
 *   3. todas las palabras aparecen en marca, modelo, tipo o centro
 */
export function buscarEquipos(equipos, texto, limite = 8) {
  const q = compacto(texto);
  if (q.length < 2) return [];
  const palabras = sinMarcas(texto).split(/\s+/).filter(Boolean);

  const puntaje = (e) => {
    const codigos = CAMPOS_EXACTOS.map(c => compacto(e[c])).filter(Boolean);
    if (codigos.some(c => c.startsWith(q))) return 3;
    if (codigos.some(c => c.includes(q))) return 2;
    const texto = sinMarcas([e.marca, e.modelo, e.tipo, e.centro_principal, e.subsede].filter(Boolean).join(" "));
    if (palabras.length && palabras.every(p => texto.includes(p))) return 1;
    return 0;
  };

  return equipos
    .map(e => ({ e, p: puntaje(e) }))
    .filter(x => x.p > 0)
    .sort((a, b) => b.p - a.p)
    .slice(0, limite)
    .map(x => x.e);
}

export function _selfCheck() {
  const fallos = [];
  const debe = (c, q) => { if (!c) fallos.push(q); };
  const eqs = [
    { id: "a", marca: "Mercedes", modelo: "Sprinter", tipo: "ambulancia", patente: "KXJZ-42", numero_inventario: "AMB-001", centro_principal: "CESFAM Panguipulli" },
    { id: "b", marca: "Toyota", modelo: "Hilux", tipo: "camioneta", patente: "JKLM-11", numero_inventario: "VEH-001", centro_principal: "CESFAM Coñaripe" },
    { id: "c", marca: "Zoll", modelo: "AED Plus", tipo: "dea", numero_serie: "X11-2042", numero_inventario: "DEA-014" },
  ];
  const ids = (t) => buscarEquipos(eqs, t).map(e => e.id).join();
  debe(ids("kxjz42") === "a", "la patente sin guion la encuentra");
  debe(ids("KXJZ-42") === "a", "y con guion también");
  debe(ids("kx jz") === "a", "y con espacios");
  debe(ids("amb-001") === "a", "por número de inventario");
  debe(ids("2042") === "c", `lo que contiene gana por sobre nada, dio ${ids("2042")}`);
  debe(ids("toyota hilux") === "b", "por marca y modelo");
  debe(ids("conaripe") === "b", "el centro sin tilde encuentra el que la tiene");
  debe(ids("x") === "", "una letra sola no busca");
  debe(ids("veh") === "b", "el inventario que empieza igual");
  debe(buscarEquipos(eqs, "dea")[0].id === "c", "el inventario DEA-014 antes que cualquier texto");

  if (fallos.length) { console.error("FALLOS:\n  " + fallos.join("\n  ")); return false; }
  console.log("buscarEquipos: autotest ok");
  return true;
}

if (typeof process !== "undefined" && process.argv?.[1]?.endsWith("buscarEquipos.js")) _selfCheck();
