import { useMemo, useState } from "react";
import { Search, Truck, X, Gauge, Fuel, Receipt, Route, User, MapPin, FileText, Printer } from "lucide-react";
import { TIPOS_EQUIPO } from "@/lib/centros";
import {
  TIPOS_PAGO, TIPOS_COMBUSTIBLE, rotulo, rotuloPago, rotuloVehiculo, vigentes, rendimiento, ultimoKm, kmDeSalida,
  pesos, litrosTexto, numeroTexto,
} from "@/lib/unidadControl";
import { informeFichas } from "@/utils/planillaUnidadControl";

// Las fichas de todos los vehículos para la Unidad de Control: datos del
// vehículo, documentos, último kilometraje y lo que gastó en el período.
// Toca una tarjeta para ver la ficha completa con su historial.

const sombra = { boxShadow: "0 4px 20px rgba(15,45,107,0.06)" };
const fecha = (f) => { const [y, m, d] = String(f || "").slice(0, 10).split("-"); return d ? `${d}/${m}/${y}` : "—"; };
export const ESTADO_DOC = {
  vencido: { label: "Vencido", color: "#dc2626", bg: "#fef2f2" },
  por_vencer: { label: "Por vencer", color: "#d97706", bg: "#fffbeb" },
  sin_registro: { label: "Sin registro", color: "#64748b", bg: "#f1f5f9" },
  vigente: { label: "Vigente", color: "#16a34a", bg: "#f0fdf4" },
};
const ESTADO_EQUIPO = {
  operativo: { label: "Operativo", color: "#16a34a", bg: "#f0fdf4" },
  mantenimiento: { label: "En mantención", color: "#d97706", bg: "#fffbeb" },
  fuera_de_servicio: { label: "Fuera de servicio", color: "#dc2626", bg: "#fef2f2" },
};
const CORTO = { permiso_circulacion: "Permiso", revision_tecnica: "Rev. técnica", soap: "SOAP" };
const tipoTexto = (t) => rotulo(TIPOS_EQUIPO, t) || t || "";

export default function FlotaFichas({ vehiculos, periodo, venc, cargas, salidas, lecturas = [], quien, onAbrir }) {
  const [q, setQ] = useState("");
  const [centro, setCentro] = useState("todos");
  const [tipo, setTipo] = useState("todos");
  const [docs, setDocs] = useState("todos");
  const [bloqueado, setBloqueado] = useState(false);
  const km = useMemo(() => ultimoKm(cargas, salidas, lecturas), [cargas, salidas, lecturas]);
  const docsDe = useMemo(() => {
    const m = new Map();
    venc.forEach(v => m.set(v.equipo_id, [...(m.get(v.equipo_id) || []), v]));
    return m;
  }, [venc]);
  const centros = [...new Set(vehiculos.map(v => v.centro_principal).filter(Boolean))].sort();
  const tipos = [...new Set(vehiculos.map(v => v.tipo))];
  const texto = q.trim().toLowerCase();
  const lista = vehiculos.filter(v => {
    if (centro !== "todos" && v.centro_principal !== centro) return false;
    if (tipo !== "todos" && v.tipo !== tipo) return false;
    if (docs === "atencion" && !(docsDe.get(v.id) || []).some(d => d.estado === "vencido" || d.estado === "por_vencer")) return false;
    return !texto || [v.patente, v.marca, v.modelo, v.centro_principal, v.subsede, v.conductor_responsable, v.numero_inventario]
      .some(x => String(x || "").toLowerCase().includes(texto));
  });
  const campo = "bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm";
  const imprimir = () => setBloqueado(!informeFichas({ vehiculos: lista, periodo, venc, km, quien }));

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-2xl p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto] gap-2" style={sombra}>
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Patente, marca, conductor, inventario..." className={`${campo} w-full pl-9`} />
        </div>
        <select className={campo} value={centro} onChange={e => setCentro(e.target.value)} aria-label="Centro">
          <option value="todos">Todos los centros</option>
          {centros.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className={campo} value={tipo} onChange={e => setTipo(e.target.value)} aria-label="Tipo">
          <option value="todos">Todos los tipos</option>
          {tipos.map(t => <option key={t} value={t}>{tipoTexto(t)}</option>)}
        </select>
        <select className={campo} value={docs} onChange={e => setDocs(e.target.value)} aria-label="Documentos">
          <option value="todos">Todos los documentos</option>
          <option value="atencion">Documentos vencidos o por vencer</option>
        </select>
        <button type="button" onClick={imprimir} className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-teal-200 text-teal-800 bg-teal-50">
          <Printer className="w-3.5 h-3.5" /> Imprimir fichas
        </button>
      </div>
      {bloqueado && <p className="rounded-xl px-3 py-2 bg-red-50 text-xs text-red-700">El navegador bloqueó la ventana: permite las ventanas emergentes de este sitio.</p>}
      <p className="text-xs text-slate-500 px-1">{lista.length} de {vehiculos.length} vehículos · los montos son del período elegido arriba.</p>

      {lista.length === 0 ? (
        <div className="text-center py-14 bg-white rounded-2xl text-slate-400" style={sombra}>Ningún vehículo coincide con la búsqueda.</div>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {lista.map(v => {
            const p = periodo.get(v.id);
            const est = ESTADO_EQUIPO[v.estado] || ESTADO_EQUIPO.operativo;
            const uk = km.get(v.id);
            return (
              <button key={v.id} type="button" onClick={() => onAbrir(v.id)}
                className="text-left bg-white rounded-2xl p-4 border border-slate-100 hover:border-teal-300 transition-colors" style={sombra}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-lg font-bold text-slate-900 tracking-wide">{v.patente || "Sin patente"}</p>
                    <p className="text-sm text-slate-600 truncate">{[v.marca, v.modelo].filter(Boolean).join(" ") || "—"}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-teal-50 text-teal-800">{tipoTexto(v.tipo)}</span>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ color: est.color, background: est.bg }}>{est.label}</span>
                  </div>
                </div>
                <p className="flex items-center gap-1 text-xs text-slate-500 mt-2 truncate"><MapPin className="w-3 h-3 flex-shrink-0" /> {[v.centro_principal, v.subsede].filter(Boolean).join(" · ") || "Sin centro"}</p>
                {v.conductor_responsable && <p className="flex items-center gap-1 text-xs text-slate-500 truncate"><User className="w-3 h-3 flex-shrink-0" /> {v.conductor_responsable}</p>}
                <div className="flex flex-wrap gap-1 mt-2">
                  {(docsDe.get(v.id) || []).map(d => (
                    <span key={d.tipo} className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ color: ESTADO_DOC[d.estado].color, background: ESTADO_DOC[d.estado].bg }}
                      title={d.hasta ? `Vence ${fecha(d.hasta)}` : "Sin registro"}>
                      {CORTO[d.tipo]}: {d.estado === "sin_registro" ? "—" : fecha(d.hasta)}
                    </span>
                  ))}
                </div>
                <div className="grid grid-cols-4 gap-1 mt-3 pt-3 border-t border-slate-100 text-center">
                  <Dato v={uk ? numeroTexto(uk.km) : "—"} e="último km" />
                  <Dato v={p?.litros ? numeroTexto(p.litros) : "0"} e="litros" />
                  <Dato v={p?.salidas || 0} e="salidas" />
                  <Dato v={pesos(p?.total || 0)} e="gasto" fuerte />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Dato({ v, e, fuerte }) {
  return (
    <div className="min-w-0">
      <p className={`text-xs truncate ${fuerte ? "font-bold text-teal-800" : "font-semibold text-slate-800"}`}>{v}</p>
      <p className="text-[10px] text-slate-400">{e}</p>
    </div>
  );
}

/** La ficha completa de un vehículo, con todo su historial (no solo el período). */
export function FichaVehiculo({ equipo, cargas, pagos, salidas, lecturas = [], venc, periodo, onClose }) {
  const c = useMemo(() => vigentes(cargas).filter(x => x.equipo_id === equipo.id).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))), [cargas, equipo.id]);
  const p = useMemo(() => vigentes(pagos).filter(x => x.equipo_id === equipo.id).sort((a, b) => String(b.fecha_pago || b.vence_pago || "").localeCompare(String(a.fecha_pago || a.vence_pago || ""))), [pagos, equipo.id]);
  const s = useMemo(() => salidas.filter(x => x.equipo_id === equipo.id).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))), [salidas, equipo.id]);
  const rend = useMemo(() => rendimiento(c), [c]);
  const uk = ultimoKm(c, s, lecturas.filter(x => x.equipo_id === equipo.id)).get(equipo.id);
  const hechos = p.filter(x => (x.estado_pago || "pagado") === "pagado");
  const totalComb = c.reduce((a, x) => a + (Number(x.monto) || 0), 0);
  const totalLitros = c.reduce((a, x) => a + (Number(x.litros) || 0), 0);
  const totalPagos = hechos.reduce((a, x) => a + (Number(x.monto) || 0), 0);
  const kmSalidas = s.reduce((a, x) => a + (kmDeSalida(x) || 0), 0);
  const est = ESTADO_EQUIPO[equipo.estado] || ESTADO_EQUIPO.operativo;
  const docs = venc.filter(v => v.equipo_id === equipo.id);
  const datos = [
    ["Tipo", tipoTexto(equipo.tipo)], ["Marca y modelo", [equipo.marca, equipo.modelo].filter(Boolean).join(" ")], ["Patente", equipo.patente],
    ["N° inventario", equipo.numero_inventario], ["Año", equipo.anio_adquisicion], ["Centro", equipo.centro_principal], ["Subsede", equipo.subsede],
    ["Ubicación", equipo.ubicacion_especifica], ["Conductor responsable", equipo.conductor_responsable],
  ].filter(([, v]) => v);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white sm:rounded-3xl rounded-t-3xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()} role="dialog" aria-label={`Ficha ${rotuloVehiculo(equipo)}`}>
        <div className="sticky top-0 z-10 px-6 py-4 flex items-start gap-3" style={{ background: "linear-gradient(135deg, #0f766e 0%, #134e4a 100%)" }}>
          <Truck className="w-6 h-6 text-white mt-1" />
          <div className="flex-1 min-w-0">
            <p className="text-xl font-bold text-white">{equipo.patente || "Sin patente"}</p>
            <p className="text-sm text-teal-100 truncate">{[equipo.marca, equipo.modelo].filter(Boolean).join(" ")} · {equipo.centro_principal || "Sin centro"}</p>
          </div>
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full mt-1" style={{ color: est.color, background: est.bg }}>{est.label}</span>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="text-white/80 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Indicador icono={Gauge} v={uk ? `${numeroTexto(uk.km)} km` : "—"} e={uk ? `último km (${fecha(uk.fecha)}${uk.fuente === "gps" ? " · GPS" : ""})` : "último km"} />
            <Indicador icono={Fuel} v={pesos(totalComb)} e={`combustible · ${litrosTexto(totalLitros)}`} />
            <Indicador icono={Receipt} v={pesos(totalPagos)} e={`pagos · ${hechos.length} registros`} />
            <Indicador icono={Route} v={rend.promedio ? `${numeroTexto(rend.promedio, 1)} km/L` : "—"} e={`rendimiento · ${s.length} salidas`} />
          </div>
          {periodo && (
            <p className="text-xs text-slate-600 bg-teal-50 rounded-xl px-3 py-2">
              <strong>En el período filtrado:</strong> {pesos(periodo.total)} de gasto · {litrosTexto(periodo.litros)} · {periodo.salidas} salidas
              {periodo.km ? ` · ${numeroTexto(periodo.km)} km` : ""}{periodo.costoKm ? ` · ${pesos(periodo.costoKm)}/km` : ""}
            </p>
          )}

          <Seccion titulo="Datos del vehículo">
            <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
              {datos.map(([k, v]) => <div key={k} className="flex justify-between gap-2 border-b border-slate-50 py-0.5"><dt className="text-slate-500">{k}</dt><dd className="font-medium text-slate-800 text-right">{v}</dd></div>)}
            </dl>
          </Seccion>

          <Seccion titulo="Documentos">
            <div className="grid sm:grid-cols-3 gap-2">
              {docs.map(d => (
                <div key={d.tipo} className="rounded-xl px-3 py-2" style={{ background: ESTADO_DOC[d.estado].bg }}>
                  <p className="text-xs font-semibold text-slate-700">{rotulo(TIPOS_PAGO, d.tipo)}</p>
                  <p className="text-sm font-bold" style={{ color: ESTADO_DOC[d.estado].color }}>{ESTADO_DOC[d.estado].label}{d.hasta ? ` · ${fecha(d.hasta)}` : ""}</p>
                  {d.fuente === "ficha" && <p className="text-[10px] text-slate-500">Según la ficha (sin pago registrado)</p>}
                </div>
              ))}
            </div>
          </Seccion>

          {equipo.notas && (
            <Seccion titulo="Notas de la ficha" icono={FileText}>
              <p className="text-xs text-slate-600 whitespace-pre-wrap bg-slate-50 rounded-xl p-3">{equipo.notas}</p>
            </Seccion>
          )}

          <Seccion titulo={`Cargas de combustible (${c.length})`}>
            <Tabla vacio="Sin cargas registradas." filas={c.slice(0, 10).map(x => [fecha(x.fecha), x.km ? `${numeroTexto(x.km)} km` : "—",
              `${litrosTexto(x.litros)} ${rotulo(TIPOS_COMBUSTIBLE, x.tipo_combustible)}`, x.chofer_nombre || "", pesos(x.monto)])} />
          </Seccion>
          <Seccion titulo={`Pagos y gastos (${p.length})`}>
            <Tabla vacio="Sin pagos registrados." filas={p.slice(0, 10).map(x => [x.estado_pago === "pendiente" ? `Pendiente ${fecha(x.vence_pago)}` : fecha(x.fecha_pago),
              rotuloPago(x), x.proveedor || x.descripcion || "", x.vigencia_hasta ? `Hasta ${fecha(x.vigencia_hasta)}` : "", pesos(x.monto)])} />
          </Seccion>
          <Seccion titulo={`Salidas (${s.length}${kmSalidas ? ` · ${numeroTexto(kmSalidas)} km` : ""})`}>
            <Tabla vacio="Sin salidas en la bitácora." filas={s.slice(0, 10).map(x => [fecha(x.fecha), x.destino || "—", x.chofer_nombre || "",
              x.motivo || "", kmDeSalida(x) !== null ? `${numeroTexto(kmDeSalida(x))} km` : x.estado === "en_ruta" ? "En ruta" : "—"])} />
          </Seccion>
          <p className="text-[11px] text-slate-400">Totales de todo el historial registrado; se muestran los 10 movimientos más recientes de cada tipo. No incluye anulados ni pagos pendientes.</p>
        </div>
      </div>
    </div>
  );
}

function Indicador({ icono: Icono, v, e }) {
  return (
    <div className="rounded-xl border border-slate-100 p-3">
      <Icono className="w-4 h-4 text-teal-700" />
      <p className="text-base font-bold text-slate-800 mt-1">{v}</p>
      <p className="text-[11px] text-slate-500">{e}</p>
    </div>
  );
}

function Seccion({ titulo, children }) {
  return (
    <section>
      <h3 className="text-xs font-bold uppercase tracking-wide text-teal-800 mb-2">{titulo}</h3>
      {children}
    </section>
  );
}

function Tabla({ filas, vacio }) {
  if (!filas.length) return <p className="text-sm text-slate-400">{vacio}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <tbody>
          {filas.map((f, i) => (
            <tr key={i} className="border-t border-slate-100">
              {f.map((x, j) => <td key={j} className={`py-1.5 pr-3 ${j === f.length - 1 ? "text-right font-semibold text-slate-800 whitespace-nowrap" : "text-slate-600"} ${j === 0 ? "whitespace-nowrap" : ""}`}>{x}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
