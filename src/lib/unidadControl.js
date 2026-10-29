// Las reglas del perfil Unidad de Control: cargas de combustible y pagos de
// cada vehículo (migracion/32_unidad_control.sql).
//
// Acá vive lo que no depende de la pantalla, para poder probarlo sin
// navegador (`node src/lib/unidadControl.js`):
//   · los catálogos (tipos de combustible, de pago, documentos, medios);
//   · el rendimiento en km por litro y las cargas que conviene revisar;
//   · los vencimientos de permiso de circulación, revisión técnica y SOAP;
//   · los totales por vehículo, centro, mes y tipo;
//   · la lectura de las planillas que la Unidad ya usa (CSV o Excel).
//
// La base repite las validaciones que importan (vehículo de la flota, litros
// y montos, kilometraje que no retrocede, anular con motivo): esto avisa
// antes de guardar, no reemplaza a la base.

export const TIPOS_COMBUSTIBLE = [
  { value: "diesel", label: "Diésel" },
  { value: "gasolina_93", label: "Gasolina 93" },
  { value: "gasolina_95", label: "Gasolina 95" },
  { value: "gasolina_97", label: "Gasolina 97" },
  { value: "otro", label: "Otro" },
];

export const TIPOS_PAGO = [
  { value: "permiso_circulacion", label: "Permiso de circulación", vigencia: true },
  { value: "revision_tecnica", label: "Revisión técnica", vigencia: true },
  { value: "soap", label: "SOAP", vigencia: true },
  { value: "seguro", label: "Seguro" },
  { value: "peaje_tag", label: "Peaje / TAG" },
  { value: "multa", label: "Multa" },
  { value: "reparacion_externa", label: "Reparación externa" },
  { value: "neumaticos", label: "Neumáticos" },
  { value: "lavado", label: "Lavado" },
  { value: "estacionamiento", label: "Estacionamiento" },
  { value: "otro", label: "Otro (especificar)" },
];

export const DOCUMENTOS = [
  { value: "boleta", label: "Boleta" },
  { value: "factura", label: "Factura" },
  { value: "guia", label: "Guía de despacho" },
  { value: "vale", label: "Vale" },
  { value: "otro", label: "Otro" },
];

export const MEDIOS_PAGO = [
  { value: "tarjeta_combustible", label: "Tarjeta de combustible" },
  { value: "efectivo", label: "Efectivo" },
  { value: "transferencia", label: "Transferencia" },
  { value: "credito", label: "Crédito / orden de compra" },
  { value: "otro", label: "Otro" },
];

export const TIPOS_VEHICULO = ["ambulancia", "camioneta", "furgon", "camion_3_4"];
export const esVehiculo = (e) => TIPOS_VEHICULO.includes(e?.tipo);

// Lo que razonablemente cabe en el estanque, por tipo. Sin la capacidad real
// de cada vehículo en su ficha, sirve para detectar un número mal tipeado.
export const LITROS_MAXIMOS = { ambulancia: 100, camioneta: 80, furgon: 100, camion_3_4: 150 };

/** Los vencimientos que se siguen por vehículo. */
export const VIGENCIAS = TIPOS_PAGO.filter(t => t.vigencia).map(t => t.value);
export const DIAS_AVISO = 30;

/** Quién registra y quién solo mira. */
export const ROLES_ESCRIBEN = ["super_admin", "unidad_control"];
export const ROLES_LEEN = ["super_admin", "admin", "unidad_control", "encargado_movilizacion", "monitor_corporativo"];
export const puedeRegistrar = (role) => ROLES_ESCRIBEN.includes(role);

export const rotulo = (lista, v) => lista.find(x => x.value === v)?.label || "";
export const rotuloPago = (p) => (p?.tipo === "otro" && p?.categoria_otro ? p.categoria_otro : rotulo(TIPOS_PAGO, p?.tipo) || p?.tipo || "");
export const rotuloVehiculo = (e) => [e?.patente, [e?.marca, e?.modelo].filter(Boolean).join(" ")].filter(Boolean).join(" · ");

const DIA_MS = 86400000;
const dia = (f) => String(f || "").slice(0, 10);
const diasEntre = (a, b) => Math.round((new Date(`${dia(b)}T12:00:00`) - new Date(`${dia(a)}T12:00:00`)) / DIA_MS);
const numero = (v) => (v === null || v === undefined || v === "" ? null : Number(v));
export const vigentes = (lista = []) => lista.filter(r => (r.estado || "vigente") !== "anulado");

export const pesos = (n) => `$${Math.round(Number(n) || 0).toLocaleString("es-CL")}`;
export const litrosTexto = (n) => `${(Number(n) || 0).toLocaleString("es-CL", { maximumFractionDigits: 1 })} L`;

/** Filtra por período (fecha de la carga o del pago), vehículo y centro que paga. */
export function filtrar(lista = [], { desde = "", hasta = "", equipo = "todos", centro = "todos", campoFecha = "fecha" } = {}) {
  return lista.filter(r => {
    const f = dia(r[campoFecha] || r.vence_pago || r.created_date);
    if (desde && f < desde) return false;
    if (hasta && f > hasta) return false;
    if (equipo !== "todos" && r.equipo_id !== equipo) return false;
    if (centro !== "todos" && (r.centro_costo || "") !== centro) return false;
    return true;
  });
}

const ordenCarga = (a, b) => dia(a.fecha).localeCompare(dia(b.fecha))
  || String(a.hora || "").localeCompare(String(b.hora || "")) || (numero(a.km) ?? 0) - (numero(b.km) ?? 0);

/**
 * Rendimiento por tramo: entre una carga con kilometraje y la siguiente, los
 * km recorridos divididos por los litros de esa siguiente carga (lo que se
 * repuso de lo gastado). Devuelve { porCarga: Map(id → km/L), promedio }.
 */
export function rendimiento(cargas = []) {
  const lista = vigentes(cargas).filter(c => numero(c.km) !== null).sort(ordenCarga);
  const porCarga = new Map();
  let km = 0;
  let litros = 0;
  for (let i = 1; i < lista.length; i++) {
    const tramo = numero(lista[i].km) - numero(lista[i - 1].km);
    const l = numero(lista[i].litros);
    if (tramo > 0 && l > 0) {
      porCarga.set(lista[i].id, tramo / l);
      km += tramo;
      litros += l;
    }
  }
  return { porCarga, promedio: litros > 0 ? km / litros : null };
}

/**
 * Las cargas que conviene revisar, con el motivo en palabras. Cada aviso:
 * { id, equipo_id, motivo, tono: "rojo" | "ambar" }.
 */
export function avisosDeCargas(cargas = [], equipos = []) {
  const porId = new Map(equipos.map(e => [e.id, e]));
  const lista = vigentes(cargas);
  const avisos = [];
  const porVehiculo = new Map();
  lista.forEach(c => porVehiculo.set(c.equipo_id, [...(porVehiculo.get(c.equipo_id) || []), c]));

  for (const [equipoId, delVehiculo] of porVehiculo) {
    const eq = porId.get(equipoId);
    const max = LITROS_MAXIMOS[eq?.tipo] || 120;
    const { porCarga, promedio } = rendimiento(delVehiculo);
    const porDia = new Map();
    delVehiculo.forEach(c => porDia.set(dia(c.fecha), (porDia.get(dia(c.fecha)) || 0) + 1));

    for (const c of delVehiculo) {
      if (numero(c.litros) > max) avisos.push({ id: c.id, equipo_id: equipoId, tono: "rojo", motivo: `${litrosTexto(c.litros)} superan lo que cabe en el estanque (~${max} L)` });
      if (porDia.get(dia(c.fecha)) > 1) avisos.push({ id: c.id, equipo_id: equipoId, tono: "ambar", motivo: "Más de una carga el mismo día" });
      const r = porCarga.get(c.id);
      if (r !== undefined && promedio && (r < promedio * 0.5 || r > promedio * 2)) {
        avisos.push({ id: c.id, equipo_id: equipoId, tono: "ambar", motivo: `Rendimiento de ${r.toFixed(1).replace(".", ",")} km/L, lejos del promedio del vehículo (${promedio.toFixed(1).replace(".", ",")})` });
      }
      if (numero(c.km) === null) avisos.push({ id: c.id, equipo_id: equipoId, tono: "ambar", motivo: "Sin kilometraje: no se puede calcular el rendimiento" });
      if (!c.comprobante_url && !c.documento_numero) avisos.push({ id: c.id, equipo_id: equipoId, tono: "ambar", motivo: "Sin comprobante ni número de documento" });
    }
  }
  return avisos;
}

/**
 * El estado de cada vigencia (permiso, revisión técnica, SOAP) de cada
 * vehículo, según el último pago registrado. Ordenado de lo más urgente a lo
 * menos: vencido, por vencer (30 días), sin registro, vigente.
 */
export function vencimientos(pagos = [], equipos = [], hoy = new Date().toISOString().slice(0, 10)) {
  const out = [];
  const lista = vigentes(pagos);
  for (const e of equipos.filter(esVehiculo).filter(x => x.activo !== false)) {
    for (const tipo of VIGENCIAS) {
      const ultimo = lista.filter(p => p.equipo_id === e.id && p.tipo === tipo && p.vigencia_hasta)
        .sort((a, b) => dia(b.vigencia_hasta).localeCompare(dia(a.vigencia_hasta)))[0];
      const hasta = ultimo ? dia(ultimo.vigencia_hasta) : "";
      const dias = hasta ? diasEntre(hoy, hasta) : null;
      const estado = !hasta ? "sin_registro" : dias < 0 ? "vencido" : dias <= DIAS_AVISO ? "por_vencer" : "vigente";
      out.push({ equipo_id: e.id, vehiculo: rotuloVehiculo(e), centro: e.centro_principal || "", tipo, hasta, dias, estado });
    }
  }
  const peso = { vencido: 0, por_vencer: 1, sin_registro: 2, vigente: 3 };
  return out.sort((a, b) => peso[a.estado] - peso[b.estado] || (a.dias ?? 9999) - (b.dias ?? 9999));
}

/** Los pagos pendientes: vencidos primero. */
export function pagosPendientes(pagos = [], hoy = new Date().toISOString().slice(0, 10)) {
  return vigentes(pagos).filter(p => p.estado_pago === "pendiente")
    .map(p => ({ ...p, _vencido: !!p.vence_pago && dia(p.vence_pago) < hoy }))
    .sort((a, b) => dia(a.vence_pago).localeCompare(dia(b.vence_pago)));
}

/**
 * Totales de lo que se gastó. Solo los pagos hechos (no los pendientes) y
 * nada anulado. { combustible, litros, pagos, total, porVehiculo, porCentro,
 * porMes, porTipo } — cada "por" es una lista [{ clave, combustible, litros,
 * pagos, total }] ordenada de mayor a menor.
 */
export function totales(cargas = [], pagos = [], equipos = []) {
  const porId = new Map(equipos.map(e => [e.id, e]));
  const acum = new Map();
  const sumar = (grupo, clave, campo, n) => {
    const k = `${grupo}|${clave}`;
    const fila = acum.get(k) || { grupo, clave, combustible: 0, litros: 0, pagos: 0, total: 0 };
    fila[campo] += n;
    if (campo !== "litros") fila.total += n;
    acum.set(k, fila);
  };
  let combustible = 0, litros = 0, pagosHechos = 0;
  for (const c of vigentes(cargas)) {
    const m = Number(c.monto) || 0, l = Number(c.litros) || 0;
    combustible += m; litros += l;
    const veh = rotuloVehiculo(porId.get(c.equipo_id)) || c.equipo_label || "Sin vehículo";
    for (const [g, k] of [["vehiculo", veh], ["centro", c.centro_costo || "Sin centro"], ["mes", dia(c.fecha).slice(0, 7)], ["tipo", "Combustible"]]) {
      sumar(g, k, "combustible", m); sumar(g, k, "litros", l);
    }
  }
  for (const p of vigentes(pagos).filter(x => (x.estado_pago || "pagado") === "pagado")) {
    const m = Number(p.monto) || 0;
    pagosHechos += m;
    const veh = rotuloVehiculo(porId.get(p.equipo_id)) || p.equipo_label || "Sin vehículo";
    for (const [g, k] of [["vehiculo", veh], ["centro", p.centro_costo || "Sin centro"], ["mes", dia(p.fecha_pago).slice(0, 7)], ["tipo", rotuloPago(p)]]) {
      sumar(g, k, "pagos", m);
    }
  }
  const de = (g) => [...acum.values()].filter(f => f.grupo === g).sort((a, b) => (g === "mes" ? b.clave.localeCompare(a.clave) : b.total - a.total));
  return {
    combustible, litros, pagos: pagosHechos, total: combustible + pagosHechos,
    porVehiculo: de("vehiculo"), porCentro: de("centro"), porMes: de("mes"), porTipo: de("tipo"),
  };
}

// ── Planillas ───────────────────────────────────────────────────────────
// Las columnas de la plantilla, en el orden en que se descarga. `aliases`
// son otros nombres con que la columna suele venir en las planillas que la
// Unidad ya tiene; se comparan sin tildes, mayúsculas ni espacios.
export const COLUMNAS_CARGA = [
  { campo: "fecha", titulo: "Fecha", aliases: ["fecha carga", "dia"] },
  { campo: "hora", titulo: "Hora" },
  { campo: "patente", titulo: "Patente", aliases: ["vehiculo", "ppu"] },
  { campo: "km", titulo: "Kilometraje", aliases: ["km", "odometro"] },
  { campo: "litros", titulo: "Litros", aliases: ["lts", "cantidad"] },
  { campo: "tipo_combustible", titulo: "Combustible", aliases: ["tipo combustible", "producto"] },
  { campo: "precio_litro", titulo: "Precio por litro", aliases: ["precio", "valor litro"] },
  { campo: "monto", titulo: "Monto", aliases: ["total", "valor", "importe"] },
  { campo: "estacion", titulo: "Estación", aliases: ["servicentro", "bencinera"] },
  { campo: "comuna", titulo: "Comuna" },
  { campo: "documento_tipo", titulo: "Tipo documento", aliases: ["documento"] },
  { campo: "documento_numero", titulo: "N° documento", aliases: ["numero documento", "boleta", "factura", "folio"] },
  { campo: "medio_pago", titulo: "Medio de pago", aliases: ["forma de pago"] },
  { campo: "tarjeta", titulo: "Tarjeta", aliases: ["n tarjeta", "numero tarjeta"] },
  { campo: "chofer_nombre", titulo: "Conductor", aliases: ["chofer"] },
  { campo: "estanque_lleno", titulo: "Estanque lleno (si/no)", aliases: ["estanque lleno", "lleno"] },
  { campo: "observaciones", titulo: "Observaciones", aliases: ["obs", "comentario"] },
];

export const COLUMNAS_PAGO = [
  { campo: "fecha_pago", titulo: "Fecha de pago", aliases: ["fecha"] },
  { campo: "patente", titulo: "Patente", aliases: ["vehiculo", "ppu"] },
  { campo: "tipo", titulo: "Tipo", aliases: ["concepto", "item"] },
  { campo: "descripcion", titulo: "Descripción", aliases: ["detalle", "glosa"] },
  { campo: "monto", titulo: "Monto", aliases: ["total", "valor", "importe"] },
  { campo: "estado_pago", titulo: "Estado (pagado/pendiente)", aliases: ["estado"] },
  { campo: "vence_pago", titulo: "Vence el (si está pendiente)", aliases: ["vencimiento pago"] },
  { campo: "vigencia_desde", titulo: "Vigente desde", aliases: ["desde"] },
  { campo: "vigencia_hasta", titulo: "Vigente hasta", aliases: ["hasta", "vencimiento"] },
  { campo: "proveedor", titulo: "Proveedor", aliases: ["empresa"] },
  { campo: "rut_proveedor", titulo: "RUT proveedor", aliases: ["rut"] },
  { campo: "documento_tipo", titulo: "Tipo documento", aliases: ["documento"] },
  { campo: "documento_numero", titulo: "N° documento", aliases: ["numero documento", "folio", "factura", "boleta"] },
  { campo: "medio_pago", titulo: "Medio de pago", aliases: ["forma de pago"] },
  { campo: "observaciones", titulo: "Observaciones", aliases: ["obs", "comentario"] },
];

const simple = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/[°º.:()/]/g, " ").replace(/\s+/g, " ").trim();
const patenteSimple = (t) => String(t ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Un número escrito a la chilena (1.234,5) o a la inglesa (1234.5). */
export function leerNumero(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let t = String(v ?? "").replace(/[$\s]/g, "").replace(/[^\d,.-]/g, "");
  if (!t) return null;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Una fecha dd/mm/aaaa, dd-mm-aaaa, aaaa-mm-dd o un Date de Excel → aaaa-mm-dd. */
export function leerFecha(v) {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === "number" && v > 20000 && v < 80000) {
    return new Date(Date.UTC(1899, 11, 30) + v * DIA_MS).toISOString().slice(0, 10);
  }
  const t = String(v ?? "").trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    const anio = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${anio}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return null;
}

function leerCatalogo(v, lista) {
  const s = simple(v);
  if (!s) return null;
  const hit = lista.find(x => simple(x.value) === s || simple(x.label) === s)
    || lista.find(x => s.includes(simple(x.label)) || simple(x.label).includes(s));
  return hit?.value || null;
}

function leerCombustible(v) {
  const s = simple(v);
  if (!s) return null;
  if (/diesel|petroleo/.test(s)) return "diesel";
  const oct = s.match(/9[357]/);
  if (oct) return `gasolina_${oct[0]}`;
  return leerCatalogo(v, TIPOS_COMBUSTIBLE) || "otro";
}

/** Qué columna de la planilla corresponde a cada campo. */
export function mapearEncabezados(encabezados = [], columnas = COLUMNAS_CARGA) {
  const mapa = {};
  encabezados.forEach((h, i) => {
    const s = simple(h);
    const col = columnas.find(c => simple(c.titulo) === s || simple(c.campo.replace(/_/g, " ")) === s || (c.aliases || []).some(a => simple(a) === s));
    if (col && mapa[col.campo] === undefined) mapa[col.campo] = i;
  });
  return mapa;
}

/**
 * Lee las filas de una planilla (la primera es el encabezado) y devuelve
 * { registros, errores }. Cada registro trae `_fila` (la de la planilla) para
 * poder decir cuál falló. `tipo` es "carga" o "pago". Las filas vacías se
 * saltan. Nada se guarda acá: eso lo hace la pantalla, fila por fila, y la
 * base valida cada una.
 */
export function leerPlanilla(filas = [], equipos = [], tipo = "carga") {
  const columnas = tipo === "pago" ? COLUMNAS_PAGO : COLUMNAS_CARGA;
  const [encabezado = [], ...resto] = filas;
  const mapa = mapearEncabezados(encabezado, columnas);
  const porPatente = new Map(equipos.filter(esVehiculo).map(e => [patenteSimple(e.patente), e]));
  const registros = [];
  const errores = [];
  const obligatorias = tipo === "pago" ? ["patente", "tipo", "monto"] : ["fecha", "patente", "litros", "monto"];
  const faltanColumnas = obligatorias.filter(c => mapa[c] === undefined);
  if (faltanColumnas.length) {
    return { registros, errores: [{ fila: 1, motivo: `La planilla no tiene la columna: ${faltanColumnas.map(c => columnas.find(x => x.campo === c).titulo).join(", ")}` }] };
  }

  resto.forEach((fila, i) => {
    const n = i + 2;
    const v = (campo) => (mapa[campo] === undefined ? "" : fila[mapa[campo]]);
    if (fila.every(x => String(x ?? "").trim() === "")) return;
    const problemas = [];
    const eq = porPatente.get(patenteSimple(v("patente")));
    if (!eq) problemas.push(`patente "${v("patente") || "vacía"}" no corresponde a un vehículo registrado`);
    const texto = (campo) => String(v(campo) ?? "").trim();

    if (tipo === "carga") {
      const fecha = leerFecha(v("fecha"));
      const litros = leerNumero(v("litros"));
      const precio = leerNumero(v("precio_litro"));
      let monto = leerNumero(v("monto"));
      if (monto === null && precio !== null && litros) monto = Math.round(precio * litros);
      if (!fecha) problemas.push("fecha no válida");
      if (!(litros > 0)) problemas.push("litros no válidos");
      if (monto === null || monto < 0) problemas.push("monto no válido");
      if (problemas.length) { errores.push({ fila: n, motivo: problemas.join("; ") }); return; }
      registros.push({
        _fila: n, equipo_id: eq.id, fecha, hora: texto("hora"), km: leerNumero(v("km")), litros, precio_litro: precio, monto,
        tipo_combustible: leerCombustible(v("tipo_combustible")), estacion: texto("estacion"), comuna: texto("comuna"),
        documento_tipo: leerCatalogo(v("documento_tipo"), DOCUMENTOS), documento_numero: texto("documento_numero"),
        medio_pago: leerCatalogo(v("medio_pago"), MEDIOS_PAGO), tarjeta: texto("tarjeta"), chofer_nombre: texto("chofer_nombre"),
        estanque_lleno: /^(si|sí|s|x|1|true|lleno)$/i.test(texto("estanque_lleno")), observaciones: texto("observaciones"), origen: "planilla",
      });
    } else {
      const tipoPago = leerCatalogo(v("tipo"), TIPOS_PAGO) || "otro";
      const monto = leerNumero(v("monto"));
      const pendiente = /pend/i.test(texto("estado_pago"));
      const fechaPago = leerFecha(v("fecha_pago"));
      const venceP = leerFecha(v("vence_pago"));
      const hasta = leerFecha(v("vigencia_hasta"));
      if (monto === null || monto < 0) problemas.push("monto no válido");
      if (!pendiente && !fechaPago) problemas.push("falta la fecha de pago");
      if (pendiente && !venceP) problemas.push("un pago pendiente necesita la fecha en que vence");
      if (VIGENCIAS.includes(tipoPago) && !hasta) problemas.push("falta hasta cuándo queda vigente");
      if (problemas.length) { errores.push({ fila: n, motivo: problemas.join("; ") }); return; }
      registros.push({
        _fila: n, equipo_id: eq.id, tipo: tipoPago, categoria_otro: tipoPago === "otro" ? (texto("tipo") || "Otro gasto") : "",
        descripcion: texto("descripcion"), monto, estado_pago: pendiente ? "pendiente" : "pagado", fecha_pago: fechaPago, vence_pago: venceP,
        vigencia_desde: leerFecha(v("vigencia_desde")), vigencia_hasta: hasta, proveedor: texto("proveedor"), rut_proveedor: texto("rut_proveedor"),
        documento_tipo: leerCatalogo(v("documento_tipo"), DOCUMENTOS), documento_numero: texto("documento_numero"),
        medio_pago: leerCatalogo(v("medio_pago"), MEDIOS_PAGO), observaciones: texto("observaciones"), origen: "planilla",
      });
    }
  });
  return { registros, errores };
}

/** Un registro ya guardado, como fila de la planilla de exportación. */
export function filaExportCarga(c, porId = new Map()) {
  const e = porId.get(c.equipo_id);
  return [dia(c.fecha), c.hora || "", e?.patente || "", rotuloVehiculo(e) || c.equipo_label || "", c.centro_costo || "",
    numero(c.km) ?? "", numero(c.litros) ?? "", rotulo(TIPOS_COMBUSTIBLE, c.tipo_combustible), numero(c.precio_litro) ?? "", numero(c.monto) ?? "",
    c.estacion || "", c.comuna || "", rotulo(DOCUMENTOS, c.documento_tipo), c.documento_numero || "", rotulo(MEDIOS_PAGO, c.medio_pago),
    c.tarjeta || "", c.chofer_nombre || "", c.estanque_lleno ? "Sí" : "No", c.observaciones || "", c.registrado_por_nombre || "",
    (c.estado || "vigente") === "anulado" ? `Anulada: ${c.motivo_anulacion || ""}` : "Vigente", c.comprobante_url || ""];
}
export const ENCABEZADO_EXPORT_CARGA = ["Fecha", "Hora", "Patente", "Vehículo", "Centro que paga", "Kilometraje", "Litros", "Combustible",
  "Precio por litro", "Monto", "Estación", "Comuna", "Tipo documento", "N° documento", "Medio de pago", "Tarjeta", "Conductor",
  "Estanque lleno", "Observaciones", "Registrado por", "Estado", "Comprobante"];

export function filaExportPago(p, porId = new Map()) {
  const e = porId.get(p.equipo_id);
  return [dia(p.fecha_pago), e?.patente || "", rotuloVehiculo(e) || p.equipo_label || "", p.centro_costo || "", rotuloPago(p), p.descripcion || "",
    numero(p.monto) ?? "", p.estado_pago === "pendiente" ? "Pendiente" : "Pagado", dia(p.vence_pago), dia(p.vigencia_desde), dia(p.vigencia_hasta),
    p.proveedor || "", p.rut_proveedor || "", rotulo(DOCUMENTOS, p.documento_tipo), p.documento_numero || "", rotulo(MEDIOS_PAGO, p.medio_pago),
    p.observaciones || "", p.registrado_por_nombre || "", (p.estado || "vigente") === "anulado" ? `Anulado: ${p.motivo_anulacion || ""}` : "Vigente",
    p.comprobante_url || ""];
}
export const ENCABEZADO_EXPORT_PAGO = ["Fecha de pago", "Patente", "Vehículo", "Centro que paga", "Tipo", "Descripción", "Monto", "Estado del pago",
  "Vence el", "Vigente desde", "Vigente hasta", "Proveedor", "RUT proveedor", "Tipo documento", "N° documento", "Medio de pago",
  "Observaciones", "Registrado por", "Estado", "Comprobante"];

export function _selfCheck() {
  const fallos = [];
  const debe = (c, q) => { if (!c) fallos.push(q); };
  const equipos = [
    { id: "v1", tipo: "camioneta", patente: "AB-CD-12", marca: "Toyota", modelo: "Hilux", centro_principal: "CESFAM Panguipulli" },
    { id: "v2", tipo: "ambulancia", patente: "TR-KL-21", marca: "Mercedes", modelo: "Sprinter", centro_principal: "CESFAM Coñaripe" },
    { id: "d1", tipo: "dea", marca: "Zoll" },
  ];
  const cargas = [
    { id: "a", equipo_id: "v1", fecha: "2026-10-01", km: 10000, litros: 50, monto: 60000, centro_costo: "CESFAM Panguipulli", documento_numero: "1" },
    { id: "b", equipo_id: "v1", fecha: "2026-10-05", km: 10500, litros: 50, monto: 60000, centro_costo: "CESFAM Panguipulli", documento_numero: "2" },
    { id: "c", equipo_id: "v1", fecha: "2026-10-10", km: 11000, litros: 50, monto: 60000, centro_costo: "CESFAM Panguipulli", documento_numero: "3" },
    { id: "d", equipo_id: "v1", fecha: "2026-10-10", km: 11100, litros: 90, monto: 100000, centro_costo: "CESFAM Panguipulli" },
    { id: "x", equipo_id: "v1", fecha: "2026-10-11", km: 1, litros: 999, monto: 1, estado: "anulado" },
  ];
  const r = rendimiento(cargas);
  debe(r.porCarga.get("b") === 10 && r.porCarga.get("c") === 10, "10 km/L por tramo");
  debe(Math.abs(r.promedio - 1100 / 190) < 1e-9, "promedio ponderado, sin la anulada");
  const av = avisosDeCargas(cargas, equipos);
  debe(av.some(a => a.id === "d" && /superan/.test(a.motivo)), "90 L en una camioneta es mucho");
  debe(av.filter(a => /mismo día/.test(a.motivo)).length === 2, "dos cargas el mismo día");
  debe(av.some(a => a.id === "d" && /Rendimiento/.test(a.motivo)), "rendimiento anómalo");
  debe(av.some(a => a.id === "d" && /comprobante/.test(a.motivo)), "sin comprobante");
  debe(!av.some(a => a.id === "x"), "las anuladas no avisan");

  const pagos = [
    { id: "p1", equipo_id: "v1", tipo: "revision_tecnica", vigencia_hasta: "2026-10-20", monto: 30000, fecha_pago: "2025-10-20", centro_costo: "CESFAM Panguipulli" },
    { id: "p2", equipo_id: "v1", tipo: "soap", vigencia_hasta: "2026-11-10", monto: 9000, fecha_pago: "2026-03-01", centro_costo: "CESFAM Panguipulli" },
    { id: "p3", equipo_id: "v2", tipo: "permiso_circulacion", vigencia_hasta: "2027-03-31", monto: 150000, fecha_pago: "2026-03-30", centro_costo: "CESFAM Coñaripe" },
    { id: "p4", equipo_id: "v2", tipo: "otro", categoria_otro: "Plumillas", monto: 5000, estado_pago: "pendiente", vence_pago: "2026-10-01" },
  ];
  const v = vencimientos(pagos, equipos, "2026-10-27");
  debe(v.length === 6, "tres vigencias por cada uno de los dos vehículos");
  debe(v[0].estado === "vencido" && v[0].tipo === "revision_tecnica" && v[0].dias === -7, "revisión técnica vencida primero");
  debe(v[1].estado === "por_vencer" && v[1].tipo === "soap", "SOAP por vencer");
  debe(v.filter(x => x.estado === "sin_registro").length === 3 && v.at(-1).estado === "vigente", "sin registro y vigente al final");
  debe(pagosPendientes(pagos, "2026-10-27")[0]._vencido, "pago pendiente vencido");

  const t = totales(cargas, pagos, equipos);
  debe(t.combustible === 280000 && t.litros === 240 && t.pagos === 189000 && t.total === 469000, `totales ${JSON.stringify([t.combustible, t.litros, t.pagos])}`);
  debe(t.porCentro[0].clave === "CESFAM Panguipulli" && t.porCentro[0].total === 319000, "por centro");
  debe(t.porTipo.find(x => x.clave === "Combustible").total === 280000 && !t.porTipo.some(x => x.clave === "Plumillas"), "los pendientes no suman");

  debe(leerNumero("1.234,5") === 1234.5 && leerNumero("$ 45.000") === 45000 && leerNumero("12.5") === 12.5 && leerNumero("") === null, "números");
  debe(leerFecha("05/10/2026") === "2026-10-05" && leerFecha("2026-1-5") === "2026-01-05" && leerFecha(46300) === "2026-10-05" && leerFecha("x") === null, "fechas");
  const planilla = [
    ["Fecha", "PPU", "Km", "Lts", "Producto", "Total", "Servicentro", "Folio", "Forma de pago"],
    ["05/10/2026", "ab cd 12", "10.500", "45,5", "Petróleo diésel", "$54.600", "Copec Panguipulli", "88123", "Tarjeta de combustible"],
    ["06/10/2026", "ZZ-ZZ-99", "", "10", "93", "12000", "", "", ""],
    ["", "", "", "", "", "", "", "", ""],
    ["xx", "AB-CD-12", "", "0", "", "", "", "", ""],
  ];
  const lp = leerPlanilla(planilla, equipos, "carga");
  debe(lp.registros.length === 1 && lp.registros[0].equipo_id === "v1" && lp.registros[0].litros === 45.5 && lp.registros[0].monto === 54600
    && lp.registros[0].km === 10500 && lp.registros[0].tipo_combustible === "diesel" && lp.registros[0].medio_pago === "tarjeta_combustible"
    && lp.registros[0].documento_numero === "88123", "planilla de cargas: " + JSON.stringify(lp.registros[0]));
  debe(lp.errores.length === 2 && lp.errores[0].fila === 3 && /patente/.test(lp.errores[0].motivo) && lp.errores[1].fila === 5, "errores con su fila");
  debe(/columna/.test(leerPlanilla([["Patente", "Litros"]], equipos).errores[0].motivo), "falta columna");
  const pp = leerPlanilla([
    ["Fecha", "Patente", "Concepto", "Monto", "Estado", "Vigente hasta"],
    ["01/03/2026", "TR-KL-21", "Permiso de circulación", "150.000", "Pagado", "31/03/2027"],
    ["", "TR-KL-21", "Cambio de plumillas", "5000", "Pendiente", ""],
  ], equipos, "pago");
  debe(pp.registros.length === 1 && pp.registros[0].tipo === "permiso_circulacion" && pp.registros[0].vigencia_hasta === "2027-03-31", "planilla de pagos");
  debe(pp.errores.length === 1 && /vence/.test(pp.errores[0].motivo), "pendiente sin vencimiento");

  if (fallos.length) { console.error("FALLOS:\n  " + fallos.join("\n  ")); return false; }
  console.log("unidadControl: autotest ok");
  return true;
}

if (typeof process !== "undefined" && process.argv?.[1]?.endsWith("unidadControl.js")) _selfCheck();
