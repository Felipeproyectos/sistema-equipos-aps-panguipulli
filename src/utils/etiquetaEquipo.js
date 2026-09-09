// `equipo_label` casi siempre ya viene con la patente adentro
// ("NISSAN NAVARA — GKWL.46-3"), asi que las cinco pantallas que hacian
// `${equipo_label} · ${patente}` la mostraban dos veces seguidas:
//
//   NISSAN NAVARA — GKWL.46-3 · GKWL.46-3
//
// Solo se agrega cuando falta de verdad.
export function etiquetaEquipo(label, patente) {
  const base = String(label || "").trim();
  const pat = String(patente || "").trim();
  if (!pat) return base || "—";
  if (!base) return pat;
  return base.toLowerCase().includes(pat.toLowerCase()) ? base : `${base} · ${pat}`;
}

// ponytail: un self-check, no una suite. Lo que se rompe en silencio aca es la
// comparacion de mayusculas — las patentes vienen escritas de las dos formas.
export function _selfCheck() {
  const casos = [
    ["NISSAN NAVARA — GKWL.46-3", "GKWL.46-3", "NISSAN NAVARA — GKWL.46-3"],  // ya incluida
    ["ford ranger — hlhl10", "HLHL10", "ford ranger — hlhl10"],               // distinta caja
    ["MERCEDES SPRINTER", "LVJD81", "MERCEDES SPRINTER · LVJD81"],            // falta: se agrega
    ["Monitor Zoll", "", "Monitor Zoll"],                                     // sin patente
    ["", "AB-12", "AB-12"],                                                   // sin etiqueta
    ["", "", "—"],                                                            // sin nada
    [null, undefined, "—"],                                                   // nulos
  ];
  for (const [label, patente, esperado] of casos) {
    const dio = etiquetaEquipo(label, patente);
    console.assert(dio === esperado, `etiquetaEquipo(${JSON.stringify(label)}, ${JSON.stringify(patente)}) dio ${JSON.stringify(dio)}, se esperaba ${JSON.stringify(esperado)}`);
  }
  return true;
}
