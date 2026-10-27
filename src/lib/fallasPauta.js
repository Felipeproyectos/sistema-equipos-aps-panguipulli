// Las fallas de una pauta, venga del formulario que venga.
//
// Cada formulario guarda sus ítems a su manera en datos_json:
//   · Ambulancia semanal: luces, motor, accesorios, documentos → { item: { estado: bueno|malo, obs } }, y danos
//   · Ambulancia diaria: exterior, interior, equipo_medico, accesorios_diaria,
//     saneamiento, documentacion → { item: { estado: correcto|incorrecto, obs } }
//   · Monitor desfibrilador y DEA: checklist → { item: { estado: ok|malo|na, obs } };
//     el DEA además parches → { parches_adulto: { estado, obs, cantidad } }
//   · Monitor multiparámetros: checklist → { item: "ok"|"malo"|"na" }
//
// Antes, aprobar solo miraba el texto de observaciones ("Fallas:"), y el DEA
// escribe "Fallas checklist:" / "Fallas parches:": sus fallas no abrían OT.
// Y el detalle de la OT no traía los ítems del checklist de los monitores.
//
// Lo usan Revisión Bitácora y el servidor (aprobarInspeccion.js, vía la copia
// de servidor/compartido/). `node src/lib/fallasPauta.js` corre el autotest.
//
// Qué pasa con las fallas al aprobar
// ──────────────────────────────────
// Antes se abría una OT directo en la fila del taller. Ahora se abre una
// SOLICITUD, y la decide quien corresponde: Movilización en «Solicitudes al
// Taller» si es un vehículo (la deriva al taller o la cierra), Salud en
// «Solicitudes» si es un equipo. Si el equipo ya tiene una solicitud de pauta
// sin revisar, la falla nueva se suma a esa en vez de abrir otra.
//
// La ambulancia se parte en dos: la CABINA SANITARIA (equipos médicos,
// oxígeno, camilla, botiquín, limpieza y desechos clínicos) es 100% de
// Calidad, y va al Encargado de Salud y de ahí al Monitor Corporativo; el
// VEHÍCULO (motor, luces, neumáticos, carrocería, documentos) es de
// Movilización. Una misma pauta puede abrir una solicitud de cada lado.

export const ORIGEN_PAUTA = "pauta_inspeccion";

const TIPOS_VEHICULO = ["ambulancia", "camioneta", "furgon", "camion_3_4"];

const NOMBRE_PAUTA = {
  inspeccion_diaria: "Pauta Diaria",
  inspeccion_semanal: "Pauta Semanal",
  inspeccion_anual: "Pauta Anual",
  turno_chofer: "Turno Chofer",
};

/** Quién decide qué se hace con las fallas de este equipo. */
export const areaQueDecide = (equipo) => (TIPOS_VEHICULO.includes(equipo?.tipo) ? "movilizacion" : "salud");

/** solicitud.ambito de lo que es de la cabina sanitaria de una ambulancia. */
export const AMBITO_CABINA = "cabina";
export const AMBITO_VEHICULO = "vehiculo";

// Lo de la cabina, venga de la pauta diaria (por bloque) o de la semanal (por
// ítem: ahí "Camilla" y "Oxígeno" van mezclados con la baliza y los espejos).
const BLOQUES_CABINA = new Set(["equipo_medico", "saneamiento"]);
const ITEMS_CABINA = /camilla|ox[ií]geno|botiqu[ií]n|primeros auxilios|\bDEA\b|desfibril|monitor|aspirad|insumo|desecho/i;

/** ¿Esta falla es de la cabina sanitaria (Calidad) y no del vehículo? */
export const esFallaDeCabina = (f) => BLOQUES_CABINA.has(f?.bloque) || ITEMS_CABINA.test(String(f?.item || ""));

/** Las fallas de la pauta separadas: { cabina: [...], vehiculo: [...] }. */
export function separarFallas(fallas = []) {
  return {
    cabina: fallas.filter(esFallaDeCabina),
    vehiculo: fallas.filter(f => !esFallaDeCabina(f)),
  };
}

/** De dónde vino una solicitud, en palabras de quien la recibe. */
export function rotuloOrigenSolicitud(s) {
  if (s?.origen === "pauta_chofer") return "Informado por el chofer";
  if (s?.origen === ORIGEN_PAUTA) return "Falla en una pauta";
  return "Pedido por Salud";
}

const fechaCorta = (f) => {
  const [y, m, d] = String(f || "").slice(0, 10).split("-");
  return d ? `${d}/${m}/${y}` : "";
};

/** El texto de la solicitud que abre una pauta aprobada con fallas. */
export function textoSolicitudDePauta({ insp, datos, revisor, fallas: soloEstas }) {
  const fallas = soloEstas || fallasDeInspeccion(datos);
  const nombre = NOMBRE_PAUTA[insp?.tipo_formulario] || "pauta";
  const momento = datos?.momento === "inicio" ? " (inicio de turno)" : datos?.momento === "termino" ? " (término de turno)" : "";
  const extra = [datos?.descripcion, datos?.problemasDetectados].map(t => String(t || "").trim()).filter(Boolean);
  return [
    `${nombre}${momento} del ${fechaCorta(insp?.fecha)}${insp?.conductor ? `, hecha por ${insp.conductor}` : ""}:`,
    ...(fallas.length
      ? fallas.map(f => `- ${f.item}${f.obs ? `: ${f.obs}` : ""}`)
      : [String(insp?.observaciones || "").trim() || "- (la pauta no detalla los ítems)"]),
    ...extra.map(t => `Observaciones: ${t}`),
    revisor ? `Aprobada por ${revisor}.` : "",
  ].filter(Boolean).join("\n");
}

export const BLOQUES_PAUTA = [
  "luces", "motor", "accesorios", "documentos",
  "exterior", "interior", "equipo_medico", "accesorios_diaria", "saneamiento", "documentacion",
  "checklist", "parches",
];

export const ROTULO_PARCHES = {
  parches_adulto: "Parches Adulto",
  parches_pediatrico: "Parches Pediátrico",
  parches_mixto: "Parches Mixto",
};

const MALOS = new Set(["malo", "incorrecto"]);

/** El estado de un ítem, sea texto suelto u objeto { estado }. */
export function estadoDe(v) {
  if (typeof v === "string") return v;
  return v && typeof v === "object" ? String(v.estado || "") : "";
}

export function obsDe(v) {
  return v && typeof v === "object" ? String(v.obs || v.observacion || "").trim() : "";
}

/** [{ bloque, item, obs }] con cada ítem malo y cada daño marcado. */
export function fallasDeInspeccion(datos) {
  const fallas = [];
  for (const bloque of BLOQUES_PAUTA) {
    const obj = datos?.[bloque];
    if (!obj || typeof obj !== "object") continue;
    for (const [item, v] of Object.entries(obj)) {
      if (!MALOS.has(estadoDe(v))) continue;
      fallas.push({ bloque, item: bloque === "parches" ? ROTULO_PARCHES[item] || item : item, obs: obsDe(v) });
    }
  }
  if (datos?.danos && typeof datos.danos === "object") {
    for (const [zona, v] of Object.entries(datos.danos)) {
      if (v?.marcado) fallas.push({ bloque: "danos", item: `Daño visual: ${zona.replace(/_/g, " ")}`, obs: String(v.descripcion || "").trim() });
    }
  }
  return fallas;
}

/** ¿La pauta trae fallas? Mira los ítems y, para las antiguas sin ítems, el texto. */
export function pautaConFallas(insp, datos) {
  const obs = String(insp?.observaciones || "");
  return /Incorrectos:|Fallas[^:|]*:|Daños/.test(obs) || fallasDeInspeccion(datos).length > 0;
}

/** ¿Trae ítems con los que mostrar la pauta? */
export function tieneChecklistPlano(datos) {
  const conAlgo = (o) => o && typeof o === "object" && Object.values(o).some(v => estadoDe(v));
  return conAlgo(datos?.checklist) || conAlgo(datos?.parches);
}

export function _selfCheck() {
  const fallos = [];
  const debe = (c, q) => { if (!c) fallos.push(q); };

  const desfib = { checklist: { "Pantalla operativa": { estado: "ok", obs: "" }, "Batería cargada": { estado: "malo", obs: " al 40% " } } };
  debe(fallasDeInspeccion(desfib).map(f => `${f.item}:${f.obs}`).join() === "Batería cargada:al 40%", "desfibrilador");

  const multi = { checklist: { "Cables": "ok", "Alarmas": "malo", "Impresora": "na" } };
  debe(fallasDeInspeccion(multi).map(f => f.item).join() === "Alarmas", "multiparámetros con estados de texto");

  const dea = { checklist: { "Autotest": { estado: "ok" } }, parches: { parches_adulto: { estado: "malo", obs: "vencidos", cantidad: "2" } } };
  debe(fallasDeInspeccion(dea).map(f => f.item).join() === "Parches Adulto", "parches del DEA con su rótulo");
  debe(pautaConFallas({ observaciones: "Fallas parches: Parches Adulto" }, {}), "texto del DEA cuenta como falla");
  debe(pautaConFallas({ observaciones: "" }, dea), "los ítems malos cuentan aunque el texto no lo diga");
  debe(!pautaConFallas({ observaciones: "Sin observaciones" }, { checklist: { a: "ok" } }), "sin fallas");

  const amb = { luces: { baliza: { estado: "malo", obs: "quemada" } }, exterior: { neumaticos: { estado: "incorrecto" } },
    danos: { puerta: { marcado: true, descripcion: "rayada" }, techo: { marcado: false } } };
  debe(fallasDeInspeccion(amb).length === 3, "ambulancia: luces, exterior y un daño");

  debe(tieneChecklistPlano(desfib) && tieneChecklistPlano(multi) && tieneChecklistPlano(dea), "checklist plano");
  debe(!tieneChecklistPlano(amb) && !tieneChecklistPlano({ checklist: { a: "" } }) && !tieneChecklistPlano(null), "sin checklist plano");

  debe(areaQueDecide({ tipo: "camioneta" }) === "movilizacion" && areaQueDecide({ tipo: "ambulancia" }) === "movilizacion", "vehículos → Movilización");
  debe(areaQueDecide({ tipo: "dea" }) === "salud" && areaQueDecide(null) === "salud", "equipos → Salud");
  const txt = textoSolicitudDePauta({ insp: { tipo_formulario: "inspeccion_diaria", fecha: "2026-10-13", conductor: "Juan" },
    datos: { momento: "inicio", exterior: { "Revisar luces": { estado: "incorrecto", obs: "foco trasero" } } }, revisor: "Ana" });
  debe(txt === "Pauta Diaria (inicio de turno) del 13/10/2026, hecha por Juan:\n- Revisar luces: foco trasero\nAprobada por Ana.", "texto de la solicitud: " + txt);
  debe(textoSolicitudDePauta({ insp: { tipo_formulario: "inspeccion_semanal", fecha: "2026-10-13", observaciones: "Fallas: algo" }, datos: {} })
    .includes("Fallas: algo"), "pauta sin ítems: va su texto");
  debe(rotuloOrigenSolicitud({ origen: ORIGEN_PAUTA }) === "Falla en una pauta" && rotuloOrigenSolicitud({}) === "Pedido por Salud", "rótulo del origen");

  const diaria = { exterior: { "Revisar luces": { estado: "incorrecto" } },
    equipo_medico: { "Comprobar funcionamiento de sistemas de oxígeno": { estado: "incorrecto", obs: "manómetro en rojo" } },
    accesorios_diaria: { "Botiquín": { estado: "incorrecto" }, "Extintor": { estado: "incorrecto" } },
    saneamiento: { "Vaciar contenedores de basura y desechos médicos": { estado: "incorrecto" } } };
  const sd = separarFallas(fallasDeInspeccion(diaria));
  debe(sd.cabina.length === 3 && sd.vehiculo.map(f => f.item).join() === "Revisar luces,Extintor",
    `diaria: oxígeno, botiquín y desechos a Calidad; luces y extintor a Movilización (${sd.vehiculo.map(f => f.item)})`);
  const ss = separarFallas(fallasDeInspeccion({ accesorios: { Camilla: { estado: "malo" }, Oxígeno: { estado: "malo" }, Baliza: { estado: "malo" } } }));
  debe(ss.cabina.map(f => f.item).join() === "Camilla,Oxígeno" && ss.vehiculo.map(f => f.item).join() === "Baliza", "semanal: camilla y oxígeno son de la cabina");
  debe(textoSolicitudDePauta({ insp: { tipo_formulario: "inspeccion_diaria", fecha: "2026-10-13" }, datos: diaria, fallas: sd.cabina })
    .split("\n").filter(l => l.startsWith("- ")).length === 3, "el texto lleva solo las fallas que se le pasan");

  if (fallos.length) { console.error("FALLOS:\n  " + fallos.join("\n  ")); return false; }
  console.log("fallasPauta: autotest ok");
  return true;
}

if (typeof process !== "undefined" && process.argv?.[1]?.endsWith("fallasPauta.js")) _selfCheck();
