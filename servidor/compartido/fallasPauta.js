// Copia de src/lib/fallasPauta.js, generada por migracion/sincronizar_compartido.py.
// No editar a mano: se edita el original y se vuelve a correr el script.

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
// Qué pasa con una pauta al llegar
// ────────────────────────────────
// Sin novedades (ningún ítem malo y nada escrito a mano: `sinNovedades`) se
// registra sola en el historial del equipo: no espera a nadie. Con novedades
// queda para el Encargado en Revisión Bitácora, que decide en la misma
// tarjeta (DECISIONES): enviarla al Monitor Corporativo, dejarla como
// resuelta en el centro, o registrarla sin gestión.
//
// Lo de los vehículos no lo decide Salud: abre una SOLICITUD para
// Movilización en «Solicitudes al Taller» (la deriva al taller o la cierra).
// Si el equipo ya tiene una solicitud de pauta abierta del mismo lado —por
// enviar, en el Monitor o en el taller—, la falla nueva se suma a esa en vez
// de abrir otra (`solicitudAbiertaDePauta`).
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

const texto = (v) => String(v ?? "").trim();

/** ¿Trae algún ítem respondido, del formulario que sea? */
export function tieneItems(datos) {
  return BLOQUES_PAUTA.some(b => {
    const o = datos?.[b];
    return o && typeof o === "object" && Object.values(o).some(v => estadoDe(v));
  });
}

/**
 * ¿La pauta no trae nada que alguien tenga que mirar? Sin ítems malos, sin
 * daños y sin nada escrito a mano. Las que se llenan sin ítems (un resultado
 * general, la Pauta de Cabina con sus archivos) siempre las mira una persona;
 * el Turno Chofer solo si el chofer escribió algo.
 */
export function sinNovedades(insp, datos) {
  if (insp?.tipo_formulario === "pauta_cabina") return false;
  if (pautaConFallas(insp, datos)) return false;
  if (texto(datos?.descripcion) || texto(datos?.problemasDetectados)) return false;
  if (tieneItems(datos)) return true;
  const obs = texto(insp?.observaciones);
  return insp?.tipo_formulario === "turno_chofer" && (!obs || /^KM Inicial: \d+$/i.test(obs));
}

// ── Lo que el Encargado decide sobre una pauta con fallas de Calidad ────
export const DECISIONES = [
  { value: "enviar_monitor", label: "Enviar al Monitor Corporativo", ayuda: "Necesita gestión de la Corporación: reparación, mantención o compra." },
  { value: "resuelto_centro", label: "Resuelto en el centro", ayuda: "Ya se solucionó acá. Queda anotado en el historial del equipo." },
  { value: "sin_gestion", label: "No requiere gestión", ayuda: "Observación menor o ya conocida. Queda anotada, sin solicitud." },
];
export const NOTA_MINIMA = 10;

const ESTADOS_ABIERTOS = ["pendiente", "derivada", "en_proceso", "devuelta"];

/**
 * La solicitud de pauta que este equipo ya tiene abierta del mismo lado
 * (cabina sanitaria / resto), en el estado que esté. La falla que se repite
 * se suma a esa: una solicitud nueva cada día por la misma falla solo hace
 * ruido a quien ya la está gestionando.
 */
export function solicitudAbiertaDePauta(solicitudes = [], ambito) {
  const mismoLado = (x) => (ambito === AMBITO_CABINA ? x.ambito === AMBITO_CABINA : x.ambito !== AMBITO_CABINA);
  const peso = (x) => ESTADOS_ABIERTOS.indexOf(x.estado || "pendiente");
  return solicitudes
    .filter(x => x.origen === ORIGEN_PAUTA && mismoLado(x) && peso(x) >= 0)
    .sort((a, b) => peso(a) - peso(b))[0] || null;
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

  debe(sinNovedades({ tipo_formulario: "inspeccion_semanal", observaciones: "Sin observaciones" }, { checklist: { a: "ok", b: "na" } }), "todo ok y nada escrito: sin novedades");
  debe(!sinNovedades({ tipo_formulario: "inspeccion_semanal", observaciones: "Sin observaciones" }, dea), "un ítem malo es novedad");
  debe(!sinNovedades({ tipo_formulario: "inspeccion_semanal" }, { checklist: { a: "ok" }, descripcion: " pantalla rayada " }), "lo escrito a mano es novedad");
  debe(!sinNovedades({ tipo_formulario: "inspeccion_diaria" }, { exterior: { a: { estado: "correcto" } }, problemasDetectados: "ruido" }), "problemas detectados es novedad");
  debe(!sinNovedades({ tipo_formulario: "inspeccion_semanal", observaciones: "Resultado: aprobado." }, {}), "sin ítems la mira una persona");
  debe(!sinNovedades({ tipo_formulario: "pauta_cabina" }, { checklist: { a: "ok" } }), "la Pauta de Cabina la mira una persona");
  debe(sinNovedades({ tipo_formulario: "turno_chofer", observaciones: "KM Inicial: 120500" }, {}), "turno sin comentario: sin novedades");
  debe(!sinNovedades({ tipo_formulario: "turno_chofer", observaciones: "frenos largos" }, {}), "turno con comentario: novedad");
  debe(!sinNovedades({ tipo_formulario: "inspeccion_semanal", observaciones: "[LUCES] Fallas: baliza" }, {}), "pauta antigua con texto de fallas");

  const sols = [
    { id: "1", origen: ORIGEN_PAUTA, estado: "finalizada" },
    { id: "2", origen: ORIGEN_PAUTA, estado: "derivada" },
    { id: "3", origen: ORIGEN_PAUTA, estado: "pendiente", ambito: AMBITO_CABINA },
    { id: "4", estado: "pendiente" },
    { id: "5", origen: ORIGEN_PAUTA, estado: "en_proceso", ambito: AMBITO_VEHICULO },
  ];
  debe(solicitudAbiertaDePauta(sols, undefined)?.id === "2", "la que está en el Monitor cuenta como abierta");
  debe(solicitudAbiertaDePauta(sols, AMBITO_CABINA)?.id === "3", "la cabina tiene la suya");
  debe(solicitudAbiertaDePauta([sols[0], sols[3]], undefined) === null, "cerrada o manual: no hay dónde sumar");
  debe(solicitudAbiertaDePauta([sols[4], { id: "6", origen: ORIGEN_PAUTA }], AMBITO_VEHICULO)?.id === "6", "sin estado es pendiente, y va primero");

  if (fallos.length) { console.error("FALLOS:\n  " + fallos.join("\n  ")); return false; }
  console.log("fallasPauta: autotest ok");
  return true;
}

if (typeof process !== "undefined" && process.argv?.[1]?.endsWith("fallasPauta.js")) _selfCheck();
