import { useMemo, useState } from "react";
import { X, Loader2, Save, Paperclip, Info, AlertTriangle } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { mensajeDeError } from "@/lib/mensajesDeError";
import {
  TIPOS_COMBUSTIBLE, TIPOS_PAGO, DOCUMENTOS, MEDIOS_PAGO, LITROS_MAXIMOS, VIGENCIAS,
  rotuloVehiculo, vigentes, pesos,
} from "@/lib/unidadControl";

// El formulario de una carga de combustible o de un pago del vehículo, nuevo
// o para corregir uno vigente. El comprobante (boleta, factura, foto) se sube
// al guardar. La base valida lo mismo (32_unidad_control.sql); acá se avisa
// antes, en el campo.

const TIPOS_ARCHIVO = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const MAX_MB = 10;
const hoy = () => new Date().toISOString().slice(0, 10);
const num = (v) => (v === "" || v === null || v === undefined ? null : Number(v));

const VACIO_CARGA = {
  equipo_id: "", fecha: hoy(), hora: "", km: "", litros: "", tipo_combustible: "diesel", precio_litro: "", monto: "",
  estanque_lleno: true, estacion: "", comuna: "", documento_tipo: "boleta", documento_numero: "", medio_pago: "tarjeta_combustible",
  tarjeta: "", chofer_nombre: "", observaciones: "", comprobante_url: "",
};
const VACIO_PAGO = {
  equipo_id: "", tipo: "", categoria_otro: "", descripcion: "", estado_pago: "pagado", fecha_pago: hoy(), vence_pago: "", monto: "",
  vigencia_desde: "", vigencia_hasta: "", proveedor: "", rut_proveedor: "", documento_tipo: "boleta", documento_numero: "",
  medio_pago: "transferencia", observaciones: "", comprobante_url: "",
};

function Opciones({ className, value, onChange, opciones, vacio }) {
  return (
    <select className={className} value={value} onChange={e => onChange(e.target.value)}>
      {vacio && <option value="">{vacio}</option>}
      {opciones.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export default function RegistroFormModal({ tipo = "carga", inicial = null, vehiculos = [], cargas = [], onClose, onSaved }) {
  const esCarga = tipo === "carga";
  const base = esCarga ? VACIO_CARGA : VACIO_PAGO;
  const [form, setForm] = useState(() => {
    const f = { ...base };
    for (const k of Object.keys(base)) if (inicial?.[k] !== undefined && inicial?.[k] !== null) f[k] = inicial[k];
    return f;
  });
  const [archivo, setArchivo] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const vehiculo = vehiculos.find(v => v.id === form.equipo_id);
  const tipoPago = TIPOS_PAGO.find(t => t.value === form.tipo);

  // Avisos mientras se llena: no bloquean, la base decide.
  const avisos = useMemo(() => {
    if (!esCarga || !vehiculo) return [];
    const out = [];
    const max = LITROS_MAXIMOS[vehiculo.tipo] || 120;
    if (num(form.litros) > max) out.push(`${form.litros} L es más de lo que cabe en el estanque (~${max} L).`);
    const anterior = vigentes(cargas).filter(c => c.equipo_id === vehiculo.id && c.id !== inicial?.id && num(c.km) !== null && String(c.fecha) <= form.fecha)
      .sort((a, b) => num(b.km) - num(a.km))[0];
    if (anterior && num(form.km) !== null && num(form.km) < num(anterior.km)) {
      out.push(`El kilometraje es menor que el de la carga del ${anterior.fecha} (${Number(anterior.km).toLocaleString("es-CL")} km): la base no lo va a aceptar.`);
    }
    if (anterior && num(form.km) > num(anterior.km) && num(form.litros) > 0) {
      out.push(`Rendimiento desde la carga anterior: ${((num(form.km) - num(anterior.km)) / num(form.litros)).toFixed(1).replace(".", ",")} km/L.`);
    }
    return out;
  }, [esCarga, vehiculo, form.litros, form.km, form.fecha, cargas, inicial?.id]);

  const montoCalculado = esCarga && num(form.litros) > 0 && num(form.precio_litro) > 0
    ? Math.round(num(form.litros) * num(form.precio_litro)) : null;

  const elegirArchivo = (f) => {
    setError("");
    if (!f) { setArchivo(null); return; }
    if (!TIPOS_ARCHIVO.includes(f.type)) { setError("El comprobante tiene que ser PDF o imagen (JPG, PNG, WEBP)."); return; }
    if (f.size > MAX_MB * 1024 * 1024) { setError(`El comprobante pesa más de ${MAX_MB} MB.`); return; }
    setArchivo(f);
  };

  const faltantes = () => {
    const f = [];
    if (!form.equipo_id) f.push("el vehículo");
    if (esCarga) {
      if (!form.fecha) f.push("la fecha");
      if (!(num(form.litros) > 0)) f.push("los litros");
      if (num(form.monto) === null && montoCalculado === null) f.push("el monto (o el precio por litro)");
    } else {
      if (!form.tipo) f.push("el tipo de pago");
      if (form.tipo === "otro" && form.categoria_otro.trim().length < 3) f.push("de qué se trata el pago");
      if (num(form.monto) === null) f.push("el monto");
      if (form.estado_pago === "pagado" && !form.fecha_pago) f.push("la fecha de pago");
      if (form.estado_pago === "pendiente" && !form.vence_pago) f.push("la fecha en que vence el pago");
      if (VIGENCIAS.includes(form.tipo) && !form.vigencia_hasta) f.push("hasta cuándo queda vigente");
    }
    return f;
  };

  const guardar = async () => {
    setError("");
    const f = faltantes();
    if (f.length) { setError(`Falta ${f.join(", ")}.`); return; }
    setGuardando(true);
    try {
      let comprobante = form.comprobante_url || "";
      if (archivo) comprobante = (await base44.integrations.Core.UploadFile({ file: archivo })).file_url;
      const datos = esCarga ? {
        ...form, km: num(form.km), litros: num(form.litros), precio_litro: num(form.precio_litro),
        monto: num(form.monto) ?? montoCalculado, comprobante_url: comprobante,
      } : {
        ...form, monto: num(form.monto), comprobante_url: comprobante,
        categoria_otro: form.tipo === "otro" ? form.categoria_otro.trim() : "",
        fecha_pago: form.estado_pago === "pagado" ? form.fecha_pago : null,
        vence_pago: form.estado_pago === "pendiente" ? form.vence_pago : null,
        vigencia_desde: form.vigencia_desde || null, vigencia_hasta: form.vigencia_hasta || null,
      };
      const entidad = esCarga ? base44.entities.CargaCombustible : base44.entities.PagoVehiculo;
      if (inicial?.id) await entidad.update(inicial.id, datos);
      else await entidad.create({ ...datos, origen: "manual" });
      onSaved?.();
    } catch (e) {
      setError(mensajeDeError(e, esCarga ? "guardar la carga" : "guardar el pago"));
    } finally {
      setGuardando(false);
    }
  };

  const campo = "w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300 bg-white";
  const et = "text-xs font-semibold text-slate-600 block mb-1";
  const Select = ({ k, opciones, vacio }) => (
    <Opciones className={campo} value={form[k] || ""} onChange={v => set(k, v)} opciones={opciones} vacio={vacio} />
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white sm:rounded-3xl rounded-t-3xl shadow-2xl w-full max-w-2xl max-h-[94vh] overflow-y-auto">
        <div className="sticky top-0 z-10 bg-white px-5 sm:px-7 pt-6 pb-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              {inicial?.id ? "Corregir " : "Nueva "}{esCarga ? "carga de combustible" : "pago o gasto"}
            </h2>
            <p className="text-xs text-slate-500">El centro que paga se calcula solo: si ese día el vehículo estaba prestado, paga el que lo tenía.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar"><X className="w-5 h-5 text-slate-400" /></button>
        </div>

        <div className="px-5 sm:px-7 py-5 space-y-4">
          <div>
            <label className={et}>Vehículo *</label>
            <select className={campo} value={form.equipo_id} onChange={e => set("equipo_id", e.target.value)}>
              <option value="">Seleccionar vehículo...</option>
              {vehiculos.map(v => <option key={v.id} value={v.id}>{rotuloVehiculo(v)} — {v.centro_principal}</option>)}
            </select>
          </div>

          {esCarga ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div><label className={et}>Fecha *</label><input type="date" max={hoy()} className={campo} value={form.fecha} onChange={e => set("fecha", e.target.value)} /></div>
                <div><label className={et}>Hora</label><input type="time" className={campo} value={form.hora} onChange={e => set("hora", e.target.value)} /></div>
                <div><label className={et}>Kilometraje</label><input type="number" min="0" inputMode="numeric" className={campo} value={form.km} onChange={e => set("km", e.target.value)} /></div>
                <div><label className={et}>Litros *</label><input type="number" min="0" step="0.01" inputMode="decimal" className={campo} value={form.litros} onChange={e => set("litros", e.target.value)} /></div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div><label className={et}>Combustible</label><Select k="tipo_combustible" opciones={TIPOS_COMBUSTIBLE} /></div>
                <div><label className={et}>Precio por litro</label><input type="number" min="0" step="0.1" inputMode="decimal" className={campo} value={form.precio_litro} onChange={e => set("precio_litro", e.target.value)} /></div>
                <div>
                  <label className={et}>Monto total *</label>
                  <input type="number" min="0" inputMode="numeric" className={campo} value={form.monto} placeholder={montoCalculado !== null ? String(montoCalculado) : ""} onChange={e => set("monto", e.target.value)} />
                  {montoCalculado !== null && form.monto === "" && <p className="text-[11px] text-slate-400 mt-0.5">Se guardará {pesos(montoCalculado)}</p>}
                </div>
                <label className="flex items-center gap-2 text-sm sm:mt-6"><input type="checkbox" className="accent-teal-600" checked={!!form.estanque_lleno} onChange={e => set("estanque_lleno", e.target.checked)} /> Estanque lleno</label>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2"><label className={et}>Estación de servicio</label><input className={campo} maxLength={120} placeholder="Ej.: Copec Panguipulli" value={form.estacion} onChange={e => set("estacion", e.target.value)} /></div>
                <div><label className={et}>Comuna</label><input className={campo} maxLength={60} value={form.comuna} onChange={e => set("comuna", e.target.value)} /></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className={et}>Conductor</label><input className={campo} maxLength={120} value={form.chofer_nombre} onChange={e => set("chofer_nombre", e.target.value)} /></div>
                <div><label className={et}>N° de tarjeta de combustible</label><input className={campo} maxLength={40} value={form.tarjeta} onChange={e => set("tarjeta", e.target.value)} /></div>
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className={et}>Tipo de pago *</label><Select k="tipo" opciones={TIPOS_PAGO} vacio="Seleccionar..." /></div>
                {form.tipo === "otro" && (
                  <div><label className={et}>¿Qué es? *</label><input className={campo} maxLength={80} placeholder="Ej.: Cambio de plumillas" value={form.categoria_otro} onChange={e => set("categoria_otro", e.target.value)} /></div>
                )}
              </div>
              <div><label className={et}>Descripción</label><input className={campo} maxLength={300} value={form.descripcion} onChange={e => set("descripcion", e.target.value)} /></div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <label className={et}>Estado</label>
                  <select className={campo} value={form.estado_pago} onChange={e => set("estado_pago", e.target.value)}>
                    <option value="pagado">Pagado</option><option value="pendiente">Pendiente</option>
                  </select>
                </div>
                {form.estado_pago === "pagado"
                  ? <div><label className={et}>Fecha de pago *</label><input type="date" className={campo} value={form.fecha_pago || ""} onChange={e => set("fecha_pago", e.target.value)} /></div>
                  : <div><label className={et}>Vence el *</label><input type="date" className={campo} value={form.vence_pago || ""} onChange={e => set("vence_pago", e.target.value)} /></div>}
                <div><label className={et}>Monto *</label><input type="number" min="0" inputMode="numeric" className={campo} value={form.monto} onChange={e => set("monto", e.target.value)} /></div>
              </div>
              {(tipoPago?.vigencia || form.tipo === "seguro") && (
                <div className="grid grid-cols-2 gap-3">
                  <div><label className={et}>Vigente desde</label><input type="date" className={campo} value={form.vigencia_desde || ""} onChange={e => set("vigencia_desde", e.target.value)} /></div>
                  <div><label className={et}>Vigente hasta {tipoPago?.vigencia ? "*" : ""}</label><input type="date" className={campo} value={form.vigencia_hasta || ""} onChange={e => set("vigencia_hasta", e.target.value)} /></div>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className={et}>Proveedor</label><input className={campo} maxLength={120} value={form.proveedor} onChange={e => set("proveedor", e.target.value)} /></div>
                <div><label className={et}>RUT del proveedor</label><input className={campo} maxLength={15} placeholder="12.345.678-9" value={form.rut_proveedor} onChange={e => set("rut_proveedor", e.target.value)} /></div>
              </div>
            </>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div><label className={et}>Documento</label><Select k="documento_tipo" opciones={DOCUMENTOS} vacio="—" /></div>
            <div><label className={et}>N° de documento</label><input className={campo} maxLength={40} value={form.documento_numero} onChange={e => set("documento_numero", e.target.value)} /></div>
            <div><label className={et}>Medio de pago</label><Select k="medio_pago" opciones={MEDIOS_PAGO} vacio="—" /></div>
          </div>

          <div>
            <label className={et}>Comprobante (PDF o foto, hasta {MAX_MB} MB)</label>
            <label className="flex items-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-2.5 text-sm text-slate-600 cursor-pointer hover:bg-slate-50">
              <Paperclip className="w-4 h-4" />
              {archivo ? archivo.name : form.comprobante_url ? "Ya tiene comprobante — elige otro para reemplazarlo" : "Adjuntar boleta, factura o foto"}
              <input type="file" accept=".pdf,image/*" className="hidden" onChange={e => elegirArchivo(e.target.files?.[0] || null)} />
            </label>
          </div>

          <div><label className={et}>Observaciones</label><textarea rows={2} maxLength={1000} className={campo} value={form.observaciones} onChange={e => set("observaciones", e.target.value)} /></div>

          {avisos.length > 0 && (
            <ul className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 space-y-0.5">
              {avisos.map((a, i) => <li key={i} className="flex gap-1.5"><AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />{a}</li>)}
            </ul>
          )}
          {error && <p role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"><Info className="w-4 h-4 flex-shrink-0 mt-0.5" /> {error}</p>}
        </div>

        <div className="sticky bottom-0 bg-white border-t border-slate-100 px-5 sm:px-7 py-4 flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="py-2.5 px-4 rounded-xl text-sm font-medium text-slate-600 border border-slate-200">Cancelar</button>
          <button type="button" onClick={guardar} disabled={guardando}
            className="flex items-center gap-2 py-2.5 px-5 rounded-xl text-sm font-semibold text-white disabled:opacity-60" style={{ background: "#0f766e" }}>
            {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
