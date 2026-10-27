import { useMemo, useState } from "react";
import { X, Loader2, Send, Save, Wrench, ShoppingCart, AlertOctagon, Info, Truck } from "lucide-react";
import { base44 } from "@/api/base44Client";
import NativePicker from "@/components/NativePicker";
import { CENTROS_ESTRUCTURA, TIPOS_EQUIPO, esVehiculo } from "@/lib/centros";
import { mensajeDeError } from "@/lib/mensajesDeError";
import {
  CATEGORIAS, PRIORIDADES, OPERATIVIDAD, DESCRIPCION_MINIMA,
  faltantesParaEnviar, fotoDelEquipo, evento, puedeEnviarAlMonitor,
} from "@/lib/solicitudesMonitor";

// El formulario de una solicitud de equipo vital, con el detalle que necesita
// el Monitor Corporativo para resolverla sin llamar al centro.
//
// Sirve para dos cosas:
//   · abrir una nueva (`inicial` vacío);
//   · completar una que ya existe — la abrió un Usuario, una pauta con fallas o
//     una alerta — o corregir una que el Monitor devolvió.
//
// El Encargado de Salud la envía al Monitor. El Usuario la deja pendiente, y
// su Encargado la revisa y la envía. Las de vehículos no van al Monitor: van a
// Movilización, como siempre.

// El detalle de cada tipo de equipo, agrupado por el tipo de solicitud.
const SUBTIPOS = {
  compra_insumo: {
    dea: [["cambio_parches_adulto", "Parches / electrodos adulto"], ["cambio_parches_pediatrico", "Parches / electrodos pediátrico"], ["reemplazo_bateria", "Batería"]],
    monitor_desfibrilador: [["cambio_electrodos_adulto", "Electrodos adulto"], ["cambio_electrodos_pediatrico", "Electrodos pediátrico"], ["reemplazo_bateria", "Batería"], ["reposicion_papel", "Papel de registro"], ["cables_ecg", "Cables ECG"]],
    monitor_multiparametros: [["sensor_spo2", "Sensor SpO2"], ["manguito_presion", "Manguito NIBP"], ["cables_ecg", "Cables ECG / electrodos"], ["sensor_temperatura", "Sensor de temperatura"], ["reemplazo_bateria", "Batería"]],
    default: [["compra_repuestos", "Repuesto o accesorio"]],
    comunes: [["compra_repuestos", "Otro repuesto o accesorio"]],
  },
  mantenimiento: {
    default: [["mantenimiento_preventivo", "Mantenimiento preventivo"], ["calibracion", "Calibración"], ["revision_tecnica", "Revisión técnica / certificación"]],
    dea: [["mantenimiento_preventivo", "Mantenimiento preventivo"], ["revision_tecnica", "Revisión técnica / certificación"], ["limpieza_desinfeccion", "Limpieza y desinfección"]],
    comunes: [],
  },
  desperfecto_tecnico: {
    default: [["mantenimiento_correctivo", "Reparación"]],
    comunes: [["otros", "Otro"]],
  },
};

function subtiposPara(categoria, tipoEquipo) {
  const g = SUBTIPOS[categoria];
  if (!g) return [];
  const base = g[tipoEquipo] || g.default || [];
  const vistos = new Set();
  return [...base, ...(g.comunes || [])]
    .filter(([v]) => (vistos.has(v) ? false : vistos.add(v)))
    .map(([value, label]) => ({ value, label }));
}

const ICONO_CATEGORIA = { mantenimiento: Wrench, compra_insumo: ShoppingCart, desperfecto_tecnico: AlertOctagon };
const CLAVE_CARGO = "solicitudes:cargo";
const hoy = () => new Date().toISOString().split("T")[0];
const leerCargo = () => { try { return localStorage.getItem(CLAVE_CARGO) || ""; } catch { return ""; } };
const guardarCargo = (v) => { try { if (v) localStorage.setItem(CLAVE_CARGO, v); } catch { /* sin almacenamiento */ } };

const ROLES_TODOS_LOS_CENTROS = ["super_admin", "admin", "encargado_salud", "encargado_compras_salud"];

export default function SolicitudFormDetallado({ equipos, user, role, inicial = null, onClose, onSaved }) {
  const esNueva = !inicial?.id;
  const veTodos = ROLES_TODOS_LOS_CENTROS.includes(role);
  const centroUsuario = user?.centro_principal || user?.centro_asignado || "";
  const puedeEnviar = puedeEnviarAlMonitor(role);

  const equiposDisponibles = useMemo(() => {
    const lista = centroUsuario && !veTodos ? equipos.filter(e => e.centro_principal === centroUsuario) : equipos;
    // Equipos vitales primero; los vehículos al final, porque van por otro camino.
    return [...lista].sort((a, b) => Number(esVehiculo(a.tipo)) - Number(esVehiculo(b.tipo)));
  }, [equipos, centroUsuario, veTodos]);

  const [form, setForm] = useState(() => {
    const eq = equipos.find(e => e.id === inicial?.equipo_id);
    return {
      equipo_id: inicial?.equipo_id || "",
      categoria: inicial?.categoria || "",
      tipo: inicial?.tipo || "",
      prioridad: inicial?.prioridad || "",
      operatividad: inicial?.operatividad || "",
      descripcion: inicial?.descripcion || inicial?.observaciones || "",
      fecha_deteccion: inicial?.fecha_deteccion || "",
      centro: inicial?.centro || eq?.centro_principal || centroUsuario,
      subsede: inicial?.subsede || eq?.subsede || "",
      ubicacion_especifica: inicial?.ubicacion_especifica || eq?.ubicacion_especifica || "",
      usuario_nombre: inicial?.usuario_nombre || user?.full_name || user?.email || "",
      solicitante_cargo: inicial?.solicitante_cargo || (esNueva ? leerCargo() : ""),
      solicitante_telefono: inicial?.solicitante_telefono || "",
      insumo_nombre: inicial?.insumo_nombre || "",
      insumo_cantidad: inicial?.insumo_cantidad ?? "",
      insumo_especificacion: inicial?.insumo_especificacion || "",
    };
  });
  const [guardando, setGuardando] = useState(null);
  const [error, setError] = useState("");
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const equipo = equipos.find(e => e.id === form.equipo_id) || null;
  const esFlota = equipo ? esVehiculo(equipo.tipo) : false;
  const subtipos = subtiposPara(form.categoria, equipo?.tipo);

  const elegirEquipo = (id) => {
    const eq = equipos.find(e => e.id === id);
    setForm(f => ({
      ...f,
      equipo_id: id,
      centro: eq?.centro_principal || f.centro,
      subsede: eq?.subsede || "",
      ubicacion_especifica: eq?.ubicacion_especifica || "",
      tipo: subtiposPara(f.categoria, eq?.tipo)[0]?.value || "",
    }));
  };

  const elegirCategoria = (c) => {
    setForm(f => ({ ...f, categoria: c, tipo: subtiposPara(c, equipo?.tipo)[0]?.value || "" }));
  };

  const payload = (estado) => {
    const linea = Array.isArray(inicial?.linea_tiempo) ? inicial.linea_tiempo : [];
    const nombreEvento = estado === "derivada"
      ? (inicial?.estado === "devuelta" ? "Corregida y reenviada al Monitor" : "Enviada al Monitor Corporativo")
      : esNueva ? (esFlota ? "Informada a Movilización" : "Creada en el centro") : "Detalle actualizado";
    return {
      equipo_id: form.equipo_id,
      tipo: form.tipo || subtipos[0]?.value || "otros",
      fecha: inicial?.fecha || hoy(),
      categoria: form.categoria || null,
      prioridad: form.prioridad || null,
      operatividad: form.operatividad || null,
      descripcion: form.descripcion.trim(),
      fecha_deteccion: form.fecha_deteccion || null,
      centro: form.centro,
      subsede: form.subsede,
      ubicacion_especifica: form.ubicacion_especifica.trim(),
      usuario_nombre: form.usuario_nombre.trim(),
      solicitante_cargo: form.solicitante_cargo.trim(),
      solicitante_telefono: form.solicitante_telefono.trim(),
      insumo_nombre: form.categoria === "compra_insumo" ? form.insumo_nombre.trim() : "",
      insumo_cantidad: form.categoria === "compra_insumo" && form.insumo_cantidad !== "" ? Number(form.insumo_cantidad) : null,
      insumo_especificacion: form.categoria === "compra_insumo" ? form.insumo_especificacion.trim() : "",
      ...fotoDelEquipo(equipo),
      estado,
      linea_tiempo: [...linea, evento(user, nombreEvento)],
      ...(esNueva ? { usuario_email: user?.email || "" } : {}),
    };
  };

  const guardar = async (estado) => {
    setError("");
    const datos = payload(estado);
    const faltan = estado === "derivada"
      ? faltantesParaEnviar(datos)
      : [
        !datos.equipo_id && "el equipo",
        !datos.categoria && "el tipo de solicitud",
        datos.descripcion.length < DESCRIPCION_MINIMA && `una descripción de al menos ${DESCRIPCION_MINIMA} caracteres`,
        !datos.ubicacion_especifica && "la ubicación exacta",
      ].filter(Boolean);
    if (faltan.length) {
      setError(`Falta ${faltan.join(", ")}.`);
      return;
    }
    setGuardando(estado);
    try {
      if (esNueva) await base44.entities.Solicitud.create(datos);
      else await base44.entities.Solicitud.update(inicial.id, datos);
      guardarCargo(datos.solicitante_cargo);
      onSaved?.();
    } catch (e) {
      // base44Client ya mostró el aviso; acá queda a la vista junto al formulario.
      setError(mensajeDeError(e, estado === "derivada" ? "enviar la solicitud" : "guardar la solicitud"));
    } finally {
      setGuardando(null);
    }
  };

  const campo = "w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300";
  const etiqueta = "text-xs font-semibold text-slate-600 block mb-1";
  const titulo = esNueva ? "Nueva solicitud" : inicial?.estado === "devuelta" ? "Corregir y reenviar" : "Completar solicitud";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white sm:rounded-3xl rounded-t-3xl shadow-2xl w-full max-w-2xl max-h-[94vh] overflow-y-auto">
        <div className="sticky top-0 z-10 bg-white px-5 sm:px-7 pt-6 pb-4 border-b border-slate-100 flex items-center justify-between">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-slate-900">{titulo}</h2>
            <p className="text-xs text-slate-500">
              {inicial?.numero_solicitud ? `${inicial.numero_solicitud} · ` : ""}
              {puedeEnviar ? "La resuelve el Monitor Corporativo de la Corporación Municipal." : "La revisa tu Encargado de Salud y la envía al Monitor Corporativo."}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar"><X className="w-5 h-5 text-slate-400" /></button>
        </div>

        <div className="px-5 sm:px-7 py-5 space-y-5">
          {inicial?.estado === "devuelta" && inicial?.resolucion && (
            <div className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-900">
              <p className="font-bold text-xs mb-0.5">El Monitor Corporativo pide:</p>
              <p className="whitespace-pre-line">{inicial.resolucion}</p>
            </div>
          )}

          {/* 1. Qué se pide */}
          <section>
            <p className={etiqueta}>1. Tipo de solicitud *</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {CATEGORIAS.map(c => {
                const Icono = ICONO_CATEGORIA[c.value];
                const activa = form.categoria === c.value;
                return (
                  <button key={c.value} type="button" onClick={() => elegirCategoria(c.value)} aria-pressed={activa}
                    className="text-left rounded-xl border-2 px-3 py-2.5 transition-all"
                    style={{ borderColor: activa ? "#1565c0" : "#e2e8f0", background: activa ? "#eff6ff" : "white" }}>
                    <span className="flex items-center gap-2 text-sm font-bold text-slate-800"><Icono className="w-4 h-4" style={{ color: activa ? "#1565c0" : "#94a3b8" }} />{c.label}</span>
                    <span className="block text-[11px] text-slate-500 mt-0.5 leading-snug">{c.ayuda}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* 2. El equipo y dónde está */}
          <section className="space-y-3">
            <p className={etiqueta}>2. Equipo y ubicación</p>
            {veTodos && (
              <div>
                <label className={etiqueta}>CESFAM / centro</label>
                {equipo ? (
                  <div className={`${campo} bg-slate-50 text-slate-700`}>{form.centro || "—"}</div>
                ) : (
                  <NativePicker value={form.centro} onChange={v => set("centro", v)} className={campo}
                    options={[{ value: "", label: "Todos los centros" }, ...CENTROS_ESTRUCTURA.map(c => ({ value: c.nombre, label: c.nombre }))]} />
                )}
              </div>
            )}
            <div>
              <label className={etiqueta}>Equipo *</label>
              <NativePicker value={form.equipo_id} onChange={elegirEquipo} placeholder="Seleccionar equipo..." className={campo}
                options={[
                  { value: "", label: "Seleccionar equipo..." },
                  ...equiposDisponibles
                    .filter(e => !veTodos || !form.centro || e.centro_principal === form.centro || e.id === form.equipo_id)
                    .map(e => ({
                      value: e.id,
                      label: `[${TIPOS_EQUIPO.find(t => t.value === e.tipo)?.label || e.tipo}] ${e.marca || ""} ${e.modelo || ""}${e.numero_inventario ? ` · Inv. ${e.numero_inventario}` : ""}${e.patente ? ` · ${e.patente}` : ""}${e.subsede ? ` · ${e.subsede}` : ""}`,
                    })),
                ]} />
              {!equiposDisponibles.length && <p className="text-xs text-amber-600 mt-1">No hay equipos registrados para tu centro.</p>}
            </div>

            {equipo && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 rounded-xl bg-slate-50 border border-slate-100 p-3 text-xs">
                <div><p className="text-slate-400">Marca</p><p className="font-semibold text-slate-800">{equipo.marca || "—"}</p></div>
                <div><p className="text-slate-400">Modelo</p><p className="font-semibold text-slate-800">{equipo.modelo || "—"}</p></div>
                <div><p className="text-slate-400">N° de serie</p><p className="font-semibold text-slate-800 break-all">{equipo.numero_serie || "—"}</p></div>
                <div><p className="text-slate-400">N° de inventario</p><p className="font-semibold text-slate-800">{equipo.numero_inventario || "—"}</p></div>
                <div className="col-span-2"><p className="text-slate-400">CESFAM</p><p className="font-semibold text-slate-800">{equipo.centro_principal || "—"}</p></div>
                <div className="col-span-2"><p className="text-slate-400">Subsede</p><p className="font-semibold text-slate-800">{equipo.subsede || "—"}</p></div>
                {(!equipo.modelo || !equipo.numero_serie) && (
                  <p className="col-span-full text-amber-700">La ficha del equipo no tiene {[!equipo.modelo && "modelo", !equipo.numero_serie && "número de serie"].filter(Boolean).join(" ni ")}: complétala en Equipos para que el Monitor lo identifique.</p>
                )}
              </div>
            )}

            {esFlota && (
              <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <Truck className="w-4 h-4 flex-shrink-0 mt-0.5" />
                Es un vehículo: la solicitud va a Movilización, que la deriva al Taller. No pasa por el Monitor Corporativo.
              </p>
            )}

            <div>
              <label className={etiqueta}>Ubicación exacta del equipo *</label>
              <input className={campo} value={form.ubicacion_especifica} onChange={e => set("ubicacion_especifica", e.target.value)}
                placeholder="Ej.: Sala de procedimientos, box 3, primer piso" maxLength={200} />
              <p className="text-[11px] text-slate-400 mt-1">Viene de la ficha del equipo. Corrígela si hoy está en otro lugar.</p>
            </div>
          </section>

          {/* 3. El detalle */}
          <section className="space-y-3">
            <p className={etiqueta}>3. Detalle</p>
            {form.categoria && subtipos.length > 0 && (
              <div>
                <label className={etiqueta}>{form.categoria === "compra_insumo" ? "Qué insumo" : form.categoria === "mantenimiento" ? "Qué mantenimiento" : "Qué tipo de falla"}</label>
                <NativePicker value={form.tipo} onChange={v => set("tipo", v)} className={campo} options={subtipos} />
              </div>
            )}

            {form.categoria === "compra_insumo" && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className={etiqueta}>Nombre del insumo *</label>
                  <input className={campo} value={form.insumo_nombre} onChange={e => set("insumo_nombre", e.target.value)} placeholder="Ej.: Parches adulto CPR-D-padz" maxLength={150} />
                </div>
                <div>
                  <label className={etiqueta}>Cantidad *</label>
                  <input type="number" min="1" max="100000" step="1" inputMode="numeric" className={campo} value={form.insumo_cantidad} onChange={e => set("insumo_cantidad", e.target.value)} />
                </div>
                <div className="sm:col-span-3">
                  <label className={etiqueta}>Especificación, código o compatibilidad</label>
                  <input className={campo} value={form.insumo_especificacion} onChange={e => set("insumo_especificacion", e.target.value)} placeholder="Ej.: código 8900-0800-01, compatible con Zoll AED Plus" maxLength={250} />
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={etiqueta}>Prioridad *</label>
                <NativePicker value={form.prioridad} onChange={v => set("prioridad", v)} placeholder="Seleccionar..." className={campo}
                  options={[{ value: "", label: "Seleccionar..." }, ...PRIORIDADES.map(p => ({ value: p.value, label: `${p.label} — ${p.ayuda}` }))]} />
              </div>
              <div>
                <label className={etiqueta}>Estado del equipo hoy *</label>
                <NativePicker value={form.operatividad} onChange={v => set("operatividad", v)} placeholder="Seleccionar..." className={campo}
                  options={[{ value: "", label: "Seleccionar..." }, ...OPERATIVIDAD.map(o => ({ value: o.value, label: o.label }))]} />
              </div>
            </div>

            {form.categoria === "desperfecto_tecnico" && (
              <div className="sm:w-1/2">
                <label className={etiqueta}>¿Cuándo se detectó la falla? *</label>
                <input type="date" max={hoy()} className={campo} value={form.fecha_deteccion} onChange={e => set("fecha_deteccion", e.target.value)} />
              </div>
            )}

            <div>
              <label className={etiqueta}>Descripción detallada *</label>
              <textarea rows={5} className={campo} value={form.descripcion} onChange={e => set("descripcion", e.target.value)} maxLength={4000}
                placeholder={form.categoria === "desperfecto_tecnico"
                  ? "Qué falla, qué mensaje o código de error muestra, desde cuándo, qué se intentó y si hay equipo de respaldo."
                  : form.categoria === "compra_insumo"
                    ? "Para qué se necesita, cuántos quedan en stock y cuándo vencen o se acaban."
                    : "Qué mantenimiento corresponde, cuándo fue el último y si hay fecha de vencimiento de certificación."} />
              <p className={`text-[11px] mt-1 ${form.descripcion.trim().length < DESCRIPCION_MINIMA ? "text-amber-600" : "text-slate-400"}`}>
                {form.descripcion.trim().length} caracteres · mínimo {DESCRIPCION_MINIMA}
              </p>
            </div>
          </section>

          {/* 4. Quién la pide */}
          <section className="space-y-3">
            <p className={etiqueta}>4. Quién solicita</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className={etiqueta}>Nombre *</label>
                <input className={campo} value={form.usuario_nombre} onChange={e => set("usuario_nombre", e.target.value)} maxLength={120} />
              </div>
              <div>
                <label className={etiqueta}>Cargo *</label>
                <input className={campo} value={form.solicitante_cargo} onChange={e => set("solicitante_cargo", e.target.value)} placeholder="Ej.: Enfermera coordinadora" maxLength={120} />
              </div>
              <div>
                <label className={etiqueta}>Teléfono de contacto</label>
                <input type="tel" inputMode="tel" className={campo} value={form.solicitante_telefono} onChange={e => set("solicitante_telefono", e.target.value)} placeholder="+56 9 ..." maxLength={30} />
              </div>
            </div>
            {inicial?.usuario_email && <p className="text-[11px] text-slate-400">Correo registrado: {inicial.usuario_email}</p>}
          </section>

          {error && (
            <p role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <Info className="w-4 h-4 flex-shrink-0 mt-0.5" /> {error}
            </p>
          )}
        </div>

        <div className="sticky bottom-0 bg-white border-t border-slate-100 px-5 sm:px-7 py-4 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
          <button type="button" onClick={onClose} className="py-2.5 px-4 rounded-xl text-sm font-medium text-slate-600 border border-slate-200">Cancelar</button>
          {(!puedeEnviar || esFlota || inicial?.estado !== "devuelta") && (
            <button type="button" onClick={() => guardar("pendiente")} disabled={!!guardando}
              className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold disabled:opacity-60 ${!puedeEnviar || esFlota ? "text-white" : "text-slate-700 border border-slate-200"}`}
              style={!puedeEnviar || esFlota ? { background: "linear-gradient(135deg, #1565c0, #0288d1)" } : {}}>
              {guardando === "pendiente" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {esFlota ? "Enviar a Movilización" : puedeEnviar ? "Guardar sin enviar" : "Enviar a mi Encargado de Salud"}
            </button>
          )}
          {puedeEnviar && !esFlota && (
            <button type="button" onClick={() => guardar("derivada")} disabled={!!guardando}
              className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
              style={{ background: "linear-gradient(135deg, #4F46E5, #312E81)" }}>
              {guardando === "derivada" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {inicial?.estado === "devuelta" ? "Reenviar al Monitor Corporativo" : "Enviar al Monitor Corporativo"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
