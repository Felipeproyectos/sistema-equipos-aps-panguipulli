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

  if (fallos.length) { console.error("FALLOS:\n  " + fallos.join("\n  ")); return false; }
  console.log("fallasPauta: autotest ok");
  return true;
}

if (typeof process !== "undefined" && process.argv?.[1]?.endsWith("fallasPauta.js")) _selfCheck();
