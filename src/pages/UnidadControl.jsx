import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Fuel, Receipt, Plus, Upload, FileSpreadsheet, Printer, AlertTriangle, CalendarClock, Gauge, Wallet,
  Paperclip, Pencil, Ban, Search, Loader2, X, Eye, EyeOff,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { getEffectiveNavRole } from "@/lib/roleSimulator";
import { mensajeDeError } from "@/lib/mensajesDeError";
import {
  TIPOS_COMBUSTIBLE, TIPOS_PAGO, DOCUMENTOS, MEDIOS_PAGO, puedeRegistrar, rotulo, rotuloPago, rotuloVehiculo,
  esVehiculo, filtrar, vigentes, rendimiento, avisosDeCargas, vencimientos, pagosPendientes, totales, pesos, litrosTexto,
} from "@/lib/unidadControl";
import { exportarExcel, informeGastos } from "@/utils/planillaUnidadControl";
import RegistroFormModal from "@/components/unidadControl/RegistroFormModal";
import ImportarPlanilla from "@/components/unidadControl/ImportarPlanilla";
import { useToast } from "@/components/ui/use-toast";

// Unidad de Control: cargas de combustible y pagos de cada vehículo.
//
// La Unidad registra, corrige y anula (nunca borra). Administración,
// Movilización y el Monitor Corporativo ven lo mismo, sin poder modificarlo.
// Las reglas viven en src/lib/unidadControl.js y la base las hace cumplir
// (migracion/32_unidad_control.sql).

const PESTANAS = [
  { clave: "resumen", label: "Resumen", icono: Gauge },
  { clave: "combustible", label: "Combustible", icono: Fuel },
  { clave: "pagos", label: "Pagos y gastos", icono: Receipt },
  { clave: "vencimientos", label: "Vencimientos", icono: CalendarClock },
];

const sombra = { boxShadow: "0 4px 20px rgba(15,45,107,0.06)" };
const hoyISO = () => new Date().toISOString().slice(0, 10);
const inicioMes = () => `${hoyISO().slice(0, 7)}-01`;
const fecha = (f) => { const [y, m, d] = String(f || "").slice(0, 10).split("-"); return d ? `${d}/${m}/${y}` : "—"; };
const ESTADO_VENC = {
  vencido: { label: "Vencido", color: "#dc2626", bg: "#fef2f2" },
  por_vencer: { label: "Por vencer", color: "#d97706", bg: "#fffbeb" },
  sin_registro: { label: "Sin registro", color: "#64748b", bg: "#f1f5f9" },
  vigente: { label: "Vigente", color: "#16a34a", bg: "#f0fdf4" },
};

export default function UnidadControl() {
  const { user } = useAuth();
  const role = getEffectiveNavRole(user?.role);
  const escribe = puedeRegistrar(role);
  const { toast } = useToast();
  const [cargas, setCargas] = useState([]);
  const [pagos, setPagos] = useState([]);
  const [equipos, setEquipos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState("");
  const [pestana, setPestana] = useState("resumen");
  const [f, setF] = useState({ desde: inicioMes(), hasta: "", equipo: "todos", centro: "todos" });
  const [busqueda, setBusqueda] = useState("");
  const [verAnulados, setVerAnulados] = useState(false);
  const [formulario, setFormulario] = useState(null);
  const [importando, setImportando] = useState(false);
  const [anulando, setAnulando] = useState(null);
  const [exportando, setExportando] = useState(false);

  const cargar = useCallback(async () => {
    setErrorCarga("");
    try {
      const [c, p, e] = await Promise.all([
        base44.entities.CargaCombustible.list("-fecha", 5000),
        base44.entities.PagoVehiculo.list("-created_date", 5000),
        base44.entities.Equipo.list("-updated_date", 1000),
      ]);
      setCargas(c); setPagos(p); setEquipos(e);
    } catch (e) {
      setErrorCarga(mensajeDeError(e, "cargar los registros"));
    } finally {
      setCargando(false);
    }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const vehiculos = useMemo(() => equipos.filter(esVehiculo).filter(e => e.activo !== false)
    .sort((a, b) => rotuloVehiculo(a).localeCompare(rotuloVehiculo(b))), [equipos]);
  const porId = useMemo(() => new Map(equipos.map(e => [e.id, e])), [equipos]);
  const centros = useMemo(() => [...new Set([...vehiculos.map(v => v.centro_principal), ...cargas.map(c => c.centro_costo), ...pagos.map(p => p.centro_costo)].filter(Boolean))].sort(), [vehiculos, cargas, pagos]);

  const q = busqueda.trim().toLowerCase();
  const coincide = (r, extra = []) => !q || [r.equipo_label, rotuloVehiculo(porId.get(r.equipo_id)), r.documento_numero, r.estacion, r.proveedor,
    r.chofer_nombre, r.observaciones, r.descripcion, r.categoria_otro, r.centro_costo, ...extra].some(v => String(v || "").toLowerCase().includes(q));
  const cargasF = useMemo(() => filtrar(cargas, { ...f, campoFecha: "fecha" }).filter(c => coincide(c)), [cargas, f, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const pagosF = useMemo(() => filtrar(pagos, { ...f, campoFecha: "fecha_pago" }).filter(p => coincide(p, [rotuloPago(p)])), [pagos, f, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const visibles = (lista) => (verAnulados ? lista : vigentes(lista));

  const t = useMemo(() => totales(cargasF, pagosF, equipos), [cargasF, pagosF, equipos]);
  const rend = useMemo(() => rendimiento(f.equipo !== "todos" ? cargas.filter(c => c.equipo_id === f.equipo) : []), [cargas, f.equipo]);
  const rendFlota = useMemo(() => {
    const prom = vehiculos.map(v => rendimiento(cargas.filter(c => c.equipo_id === v.id)).promedio).filter(x => x !== null);
    return prom.length ? prom.reduce((a, b) => a + b, 0) / prom.length : null;
  }, [vehiculos, cargas]);
  const avisos = useMemo(() => avisosDeCargas(cargas, equipos), [cargas, equipos]);
  const avisosPorCarga = useMemo(() => {
    const m = new Map();
    avisos.forEach(a => m.set(a.id, [...(m.get(a.id) || []), a]));
    return m;
  }, [avisos]);
  const avisosEnPeriodo = useMemo(() => avisos.filter(a => a.tono === "rojo" || cargasF.some(c => c.id === a.id)), [avisos, cargasF]);
  const venc = useMemo(() => vencimientos(pagos, f.centro === "todos" ? vehiculos : vehiculos.filter(v => v.centro_principal === f.centro)), [pagos, vehiculos, f.centro]);
  const pendientes = useMemo(() => pagosPendientes(pagos), [pagos]);
  const vencAtencion = venc.filter(v => v.estado === "vencido" || v.estado === "por_vencer");

  const filtrosTexto = [
    f.desde || f.hasta ? `${f.desde ? `Desde ${fecha(f.desde)}` : ""}${f.hasta ? ` hasta ${fecha(f.hasta)}` : ""}` : "Todo el período",
    f.equipo !== "todos" ? rotuloVehiculo(porId.get(f.equipo)) : "Todos los vehículos",
    f.centro !== "todos" ? f.centro : "Todos los centros",
  ].join(" · ");

  const exportar = async () => {
    setExportando(true);
    try {
      await exportarExcel({ cargas: visibles(cargasF), pagos: visibles(pagosF), equipos,
        nombre: `combustible-y-pagos_${f.desde || "inicio"}_${f.hasta || hoyISO()}`.replace(/[^\w-]/g, "-") });
    } catch (e) {
      toast({ title: "No se pudo exportar", description: e.message, variant: "destructive" });
    } finally {
      setExportando(false);
    }
  };
  const imprimir = () => {
    const ok = informeGastos({ cargas: cargasF, pagos: pagosF, equipos: f.equipo !== "todos" ? equipos.filter(e => e.id === f.equipo) : equipos,
      filtrosTexto, quien: user?.full_name || user?.email || "" });
    if (!ok) toast({ title: "El navegador bloqueó la ventana", description: "Permite las ventanas emergentes de este sitio.", variant: "destructive" });
  };

  const alGuardar = async () => { setFormulario(null); await cargar(); };

  if (cargando) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const campo = "bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm";

  return (
    <div className="min-h-screen" style={{ background: "#f8fafc" }}>
      <div className="px-4 lg:px-10 pt-6 lg:pt-10 pb-6" style={{ background: "linear-gradient(135deg, #0f766e 0%, #134e4a 100%)" }}>
        <div className="max-w-6xl mx-auto flex items-center gap-3 flex-wrap">
          <div className="w-11 h-11 lg:w-12 lg:h-12 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(255,255,255,0.18)" }}>
            <Wallet className="w-6 h-6 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl lg:text-3xl font-bold text-white leading-tight">Combustible y pagos</h1>
            <p className="text-teal-100 text-xs lg:text-sm mt-0.5">Unidad de Control · {escribe ? "Registro de cargas, pagos y gastos de cada vehículo" : "Solo lectura"}</p>
          </div>
          {escribe && (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setFormulario({ tipo: "carga" })} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-white text-teal-900"><Plus className="w-4 h-4" /> Carga</button>
              <button type="button" onClick={() => setFormulario({ tipo: "pago" })} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-white text-teal-900"><Plus className="w-4 h-4" /> Pago o gasto</button>
              <button type="button" onClick={() => setImportando(true)} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: "rgba(255,255,255,0.18)" }}><Upload className="w-4 h-4" /> Planilla</button>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 lg:px-10 mt-5 pb-10 space-y-5">
        {errorCarga && <p className="rounded-2xl px-4 py-3 bg-red-50 border border-red-200 text-sm text-red-700">{errorCarga}</p>}

        {/* Filtros: valen para todas las pestañas, la exportación y el informe */}
        <div className="bg-white rounded-2xl p-4 space-y-3" style={sombra}>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            <label className="text-xs font-semibold text-slate-500">Desde<input type="date" className={`${campo} w-full mt-1`} value={f.desde} onChange={e => setF(x => ({ ...x, desde: e.target.value }))} /></label>
            <label className="text-xs font-semibold text-slate-500">Hasta<input type="date" className={`${campo} w-full mt-1`} value={f.hasta} min={f.desde || undefined} onChange={e => setF(x => ({ ...x, hasta: e.target.value }))} /></label>
            <label className="text-xs font-semibold text-slate-500">Vehículo
              <select className={`${campo} w-full mt-1`} value={f.equipo} onChange={e => setF(x => ({ ...x, equipo: e.target.value }))}>
                <option value="todos">Todos los vehículos</option>
                {vehiculos.map(v => <option key={v.id} value={v.id}>{rotuloVehiculo(v)}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-500">Centro que paga
              <select className={`${campo} w-full mt-1`} value={f.centro} onChange={e => setF(x => ({ ...x, centro: e.target.value }))}>
                <option value="todos">Todos los centros</option>
                {centros.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Patente, N° de documento, estación, proveedor, conductor..."
                className={`${campo} w-full pl-9`} />
            </div>
            <div className="flex gap-2 flex-wrap">
              <button type="button" onClick={() => setF({ desde: inicioMes(), hasta: "", equipo: "todos", centro: "todos" })} className="px-3 py-2 rounded-xl text-xs font-semibold border border-slate-200 text-slate-600">Este mes</button>
              <button type="button" onClick={() => setF(x => ({ ...x, desde: "", hasta: "" }))} className="px-3 py-2 rounded-xl text-xs font-semibold border border-slate-200 text-slate-600">Todo</button>
              <button type="button" onClick={exportar} disabled={exportando} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-teal-200 text-teal-800 bg-teal-50 disabled:opacity-60">
                {exportando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5" />} Excel
              </button>
              <button type="button" onClick={imprimir} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-teal-200 text-teal-800 bg-teal-50">
                <Printer className="w-3.5 h-3.5" /> Informe PDF
              </button>
            </div>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {PESTANAS.map(p => {
            const cuenta = p.clave === "vencimientos" ? vencAtencion.length : p.clave === "pagos" ? pendientes.filter(x => x._vencido).length : 0;
            return (
              <button key={p.clave} type="button" onClick={() => setPestana(p.clave)} aria-pressed={pestana === p.clave}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap flex-shrink-0"
                style={pestana === p.clave ? { background: "#0f766e", color: "white" } : { background: "white", color: "#475569", border: "1px solid #e2e8f0" }}>
                <p.icono className="w-4 h-4" /> {p.label}
                {cuenta > 0 && <span className="ml-1 text-[11px] px-1.5 rounded-full bg-red-500 text-white">{cuenta}</span>}
              </button>
            );
          })}
        </div>

        {pestana === "resumen" && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { v: pesos(t.combustible), e: "en combustible", c: `${litrosTexto(t.litros)} · ${vigentes(cargasF).length} cargas` },
                { v: pesos(t.pagos), e: "en pagos y gastos", c: `${vigentes(pagosF).filter(p => p.estado_pago !== "pendiente").length} pagos hechos` },
                { v: pesos(t.total), e: "gasto total del período", c: filtrosTexto.split(" · ")[0] },
                { v: f.equipo !== "todos" ? (rend.promedio ? `${rend.promedio.toFixed(1).replace(".", ",")} km/L` : "—") : (rendFlota ? `${rendFlota.toFixed(1).replace(".", ",")} km/L` : "—"),
                  e: f.equipo !== "todos" ? "rendimiento del vehículo" : "rendimiento promedio de la flota", c: "según el kilometraje de cada carga" },
              ].map((k, i) => (
                <div key={i} className="bg-white rounded-2xl p-4" style={sombra}>
                  <p className="text-xl lg:text-2xl font-bold text-slate-800">{k.v}</p>
                  <p className="text-xs text-slate-600 font-medium">{k.e}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">{k.c}</p>
                </div>
              ))}
            </div>

            <div className="grid lg:grid-cols-2 gap-4">
              <Panel titulo="Requiere atención" icono={AlertTriangle}>
                {vencAtencion.length === 0 && pendientes.length === 0 && avisosEnPeriodo.length === 0 ? (
                  <p className="text-sm text-green-700">Nada pendiente: documentos vigentes, sin pagos pendientes ni cargas por revisar.</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {vencAtencion.slice(0, 6).map((v, i) => (
                      <li key={`v${i}`} className="flex items-start gap-2"><Punto color={ESTADO_VENC[v.estado].color} />
                        <span><strong>{rotulo(TIPOS_PAGO, v.tipo)}</strong> de {v.vehiculo}: {v.estado === "vencido" ? `venció hace ${-v.dias} días` : `vence en ${v.dias} días`} ({fecha(v.hasta)})</span></li>
                    ))}
                    {pendientes.slice(0, 4).map(p => (
                      <li key={p.id} className="flex items-start gap-2"><Punto color={p._vencido ? "#dc2626" : "#d97706"} />
                        <span><strong>{rotuloPago(p)}</strong> pendiente de {rotuloVehiculo(porId.get(p.equipo_id)) || p.equipo_label}: {pesos(p.monto)}, {p._vencido ? "venció" : "vence"} el {fecha(p.vence_pago)}</span></li>
                    ))}
                    {[...new Set(avisosEnPeriodo.map(a => a.id))].slice(0, 5).map(id => {
                      const c = cargas.find(x => x.id === id);
                      const de = avisosEnPeriodo.filter(a => a.id === id);
                      return (
                        <li key={`a${id}`} className="flex items-start gap-2"><Punto color={de.some(a => a.tono === "rojo") ? "#dc2626" : "#d97706"} />
                          <span>Carga del {fecha(c?.fecha)} de {rotuloVehiculo(porId.get(c?.equipo_id))}: {de.map(a => a.motivo.charAt(0).toLowerCase() + a.motivo.slice(1)).join("; ")}</span></li>
                      );
                    })}
                  </ul>
                )}
              </Panel>
              <Panel titulo="Gasto por centro que paga" icono={Wallet}>
                <Barras filas={t.porCentro} />
              </Panel>
            </div>
            <Panel titulo="Gasto por vehículo" icono={Fuel}>
              <Barras filas={t.porVehiculo} conLitros />
            </Panel>
          </div>
        )}

        {(pestana === "combustible" || pestana === "pagos") && (
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-xs text-slate-500">
              <input type="checkbox" className="accent-teal-600" checked={verAnulados} onChange={e => setVerAnulados(e.target.checked)} />
              {verAnulados ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />} Mostrar anulados
            </label>
            {pestana === "combustible" ? (
              <Lista vacio="No hay cargas en este período.">
                {visibles(cargasF).map(c => (
                  <Fila key={c.id} anulado={c.estado === "anulado"} motivo={c.motivo_anulacion} anuladoPor={c.anulado_por}
                    titulo={`${fecha(c.fecha)}${c.hora ? ` ${c.hora}` : ""} · ${rotuloVehiculo(porId.get(c.equipo_id)) || c.equipo_label}`}
                    monto={pesos(c.monto)}
                    detalle={[`${litrosTexto(c.litros)} ${rotulo(TIPOS_COMBUSTIBLE, c.tipo_combustible)}`, c.km ? `${Number(c.km).toLocaleString("es-CL")} km` : "",
                      c.estacion, c.chofer_nombre ? `Conductor: ${c.chofer_nombre}` : ""].filter(Boolean).join(" · ")}
                    sub={[`Paga ${c.centro_costo || "—"}`, c.documento_numero ? `${rotulo(DOCUMENTOS, c.documento_tipo) || "Doc."} N° ${c.documento_numero}` : "", rotulo(MEDIOS_PAGO, c.medio_pago),
                      c.origen === "planilla" ? "Desde planilla" : "", c.registrado_por_nombre ? `Registró ${c.registrado_por_nombre}` : ""].filter(Boolean).join(" · ")}
                    avisos={c.estado === "anulado" ? [] : (avisosPorCarga.get(c.id) || [])}
                    comprobante={c.comprobante_url} escribe={escribe}
                    onEditar={() => setFormulario({ tipo: "carga", inicial: c })} onAnular={() => setAnulando({ tipo: "carga", registro: c })} />
                ))}
              </Lista>
            ) : (
              <Lista vacio="No hay pagos en este período.">
                {visibles(pagosF).map(p => (
                  <Fila key={p.id} anulado={p.estado === "anulado"} motivo={p.motivo_anulacion} anuladoPor={p.anulado_por}
                    titulo={`${p.estado_pago === "pendiente" ? `Vence ${fecha(p.vence_pago)}` : fecha(p.fecha_pago)} · ${rotuloPago(p)}`}
                    monto={pesos(p.monto)}
                    etiqueta={p.estado_pago === "pendiente" ? { texto: "Pendiente", color: "#d97706", bg: "#fffbeb" } : null}
                    detalle={[rotuloVehiculo(porId.get(p.equipo_id)) || p.equipo_label, p.descripcion, p.proveedor,
                      p.vigencia_hasta ? `Vigente hasta ${fecha(p.vigencia_hasta)}` : ""].filter(Boolean).join(" · ")}
                    sub={[`Paga ${p.centro_costo || "—"}`, p.documento_numero ? `${rotulo(DOCUMENTOS, p.documento_tipo) || "Doc."} N° ${p.documento_numero}` : "", rotulo(MEDIOS_PAGO, p.medio_pago),
                      p.origen === "planilla" ? "Desde planilla" : "", p.registrado_por_nombre ? `Registró ${p.registrado_por_nombre}` : ""].filter(Boolean).join(" · ")}
                    comprobante={p.comprobante_url} escribe={escribe}
                    onEditar={() => setFormulario({ tipo: "pago", inicial: p })} onAnular={() => setAnulando({ tipo: "pago", registro: p })} />
                ))}
              </Lista>
            )}
          </div>
        )}

        {pestana === "vencimientos" && (
          <div className="bg-white rounded-2xl overflow-hidden" style={sombra}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                  <tr><th className="text-left px-4 py-2">Vehículo</th><th className="text-left px-4 py-2">Centro</th><th className="text-left px-4 py-2">Documento</th><th className="text-left px-4 py-2">Vigente hasta</th><th className="text-left px-4 py-2">Estado</th></tr>
                </thead>
                <tbody>
                  {venc.map((v, i) => {
                    const cfg = ESTADO_VENC[v.estado];
                    return (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="px-4 py-2 font-medium text-slate-800">{v.vehiculo}</td>
                        <td className="px-4 py-2 text-slate-500">{v.centro}</td>
                        <td className="px-4 py-2">{rotulo(TIPOS_PAGO, v.tipo)}</td>
                        <td className="px-4 py-2">{v.hasta ? fecha(v.hasta) : "—"}</td>
                        <td className="px-4 py-2"><span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ color: cfg.color, background: cfg.bg }}>
                          {cfg.label}{v.dias !== null && v.estado !== "vigente" ? ` · ${v.dias < 0 ? `hace ${-v.dias}` : `en ${v.dias}`} d` : ""}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-slate-400 px-4 py-2">Sale del último pago de permiso de circulación, revisión técnica o SOAP registrado para cada vehículo. "Por vencer" = 30 días o menos.</p>
          </div>
        )}
      </div>

      {formulario && (
        <RegistroFormModal tipo={formulario.tipo} inicial={formulario.inicial} vehiculos={vehiculos} cargas={cargas}
          onClose={() => setFormulario(null)} onSaved={alGuardar} />
      )}
      {importando && <ImportarPlanilla vehiculos={vehiculos} onClose={() => setImportando(false)} onSaved={cargar} />}
      {anulando && <Anular {...anulando} onClose={() => setAnulando(null)} onSaved={async () => { setAnulando(null); await cargar(); }} />}
    </div>
  );
}

function Punto({ color }) {
  return <span className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: color }} />;
}

function Panel({ titulo, icono: Icono, children }) {
  return (
    <div className="bg-white rounded-2xl p-5" style={sombra}>
      <h3 className="flex items-center gap-2 text-sm font-bold text-slate-700 mb-3"><Icono className="w-4 h-4 text-teal-700" /> {titulo}</h3>
      {children}
    </div>
  );
}

function Barras({ filas, conLitros = false }) {
  if (!filas.length) return <p className="text-sm text-slate-400">Sin registros en este período.</p>;
  const max = Math.max(...filas.map(f => f.total), 1);
  return (
    <ul className="space-y-2">
      {filas.slice(0, 10).map(f => (
        <li key={f.clave}>
          <div className="flex justify-between gap-2 text-xs">
            <span className="text-slate-700 truncate">{f.clave}</span>
            <span className="font-semibold text-slate-800 flex-shrink-0">{pesos(f.total)}{conLitros && f.litros ? <span className="text-slate-400 font-normal"> · {litrosTexto(f.litros)}</span> : null}</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 mt-1 flex overflow-hidden">
            <div style={{ width: `${(f.combustible / max) * 100}%`, background: "#0f766e" }} title={`Combustible ${pesos(f.combustible)}`} />
            <div style={{ width: `${(f.pagos / max) * 100}%`, background: "#5eead4" }} title={`Pagos ${pesos(f.pagos)}`} />
          </div>
        </li>
      ))}
      <li className="flex gap-3 text-[11px] text-slate-500 pt-1">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: "#0f766e" }} /> Combustible</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: "#5eead4" }} /> Pagos</span>
      </li>
    </ul>
  );
}

function Lista({ vacio, children }) {
  const hay = Array.isArray(children) ? children.length > 0 : !!children;
  if (!hay) return <div className="text-center py-14 bg-white rounded-2xl text-slate-400" style={sombra}>{vacio}</div>;
  return <div className="space-y-2">{children}</div>;
}

function Fila({ titulo, monto, detalle, sub, etiqueta, avisos = [], comprobante, anulado, motivo, anuladoPor, escribe, onEditar, onAnular }) {
  return (
    <div className={`bg-white rounded-2xl p-4 border ${anulado ? "opacity-60" : ""}`} style={{ ...sombra, borderColor: avisos.some(a => a.tono === "rojo") ? "#fecaca" : "#f1f5f9" }}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className={`font-semibold text-slate-900 text-sm ${anulado ? "line-through" : ""}`}>{titulo}</p>
            {etiqueta && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ color: etiqueta.color, background: etiqueta.bg }}>{etiqueta.texto}</span>}
            {anulado && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">Anulado</span>}
          </div>
          {detalle && <p className="text-xs text-slate-600 mt-0.5">{detalle}</p>}
          {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
          {anulado && motivo && <p className="text-[11px] text-slate-500 mt-1">Anulado por {anuladoPor}: {motivo}</p>}
          {avisos.map((a, i) => (
            <p key={i} className="flex items-center gap-1 text-[11px] mt-1" style={{ color: a.tono === "rojo" ? "#dc2626" : "#b45309" }}>
              <AlertTriangle className="w-3 h-3" /> {a.motivo}
            </p>
          ))}
        </div>
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <p className="font-bold text-slate-800">{monto}</p>
          <div className="flex gap-1">
            {comprobante && (
              <a href={comprobante} target="_blank" rel="noopener noreferrer" title="Ver comprobante"
                className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"><Paperclip className="w-3.5 h-3.5" /></a>
            )}
            {escribe && !anulado && (
              <>
                <button type="button" onClick={onEditar} title="Corregir" className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"><Pencil className="w-3.5 h-3.5" /></button>
                <button type="button" onClick={onAnular} title="Anular" className="p-1.5 rounded-lg border border-red-200 text-red-500 hover:bg-red-50"><Ban className="w-3.5 h-3.5" /></button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Anular({ tipo, registro, onClose, onSaved }) {
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const confirmar = async () => {
    if (motivo.trim().length < 5) { setError("Escribe el motivo (al menos 5 caracteres)."); return; }
    setGuardando(true);
    try {
      const entidad = tipo === "carga" ? base44.entities.CargaCombustible : base44.entities.PagoVehiculo;
      await entidad.update(registro.id, { estado: "anulado", motivo_anulacion: motivo.trim() });
      onSaved();
    } catch (e) {
      setError(mensajeDeError(e, "anular el registro"));
    } finally {
      setGuardando(false);
    }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white sm:rounded-3xl rounded-t-3xl shadow-2xl w-full max-w-md p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Anular {tipo === "carga" ? "carga" : "pago"}</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar"><X className="w-5 h-5 text-slate-400" /></button>
        </div>
        <p className="text-sm text-slate-600">No se borra: queda en el historial como anulado, con tu nombre y el motivo, y deja de sumar en los totales.</p>
        <textarea rows={3} autoFocus maxLength={500} value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ej.: boleta duplicada, monto mal ingresado..."
          className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" />
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-medium text-slate-600 border border-slate-200">Cancelar</button>
          <button type="button" onClick={confirmar} disabled={guardando} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-600 disabled:opacity-60">
            {guardando && <Loader2 className="w-4 h-4 animate-spin" />} Anular
          </button>
        </div>
      </div>
    </div>
  );
}
