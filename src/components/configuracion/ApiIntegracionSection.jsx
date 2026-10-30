import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import {
  Network, Plus, Loader2, Copy, CheckCircle2, AlertTriangle, RefreshCw, Ban, Activity, KeyRound, X, ExternalLink,
} from "lucide-react";

// Los accesos de la API de integración (servidor/api/, 34_api_integracion.sql):
// cada sistema externo que ENTREGA información —la tarjeta de combustible, el
// GPS, finanzas— llama con su propia clave. Acá se crean, se rotan y se
// revocan, y se ve qué mandó cada uno. Solo Base del Sistema.
//
// La clave se muestra UNA vez, al crearla o rotarla: el servidor guarda solo
// su hash y no hay forma de volver a verla.

const API = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
const BASE = API ? `${API}/api/v1` : "";
const fecha = (iso) => (iso ? new Date(iso).toLocaleDateString("es-CL") : "—");
const fechaHora = (iso) => (iso ? new Date(iso).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" }) : "—");
const textoError = (e, que) => e?.data?.error || e?.message || `No se pudo ${que}.`;

const inputCls = "w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-slate-50";
const labelCls = "block text-xs font-medium text-slate-600 mb-1";

function estadoDe(c) {
  if (!c.activo) return { texto: "Revocado", color: "#dc2626", bg: "#fef2f2" };
  const dias = (new Date(c.expira) - Date.now()) / 86400000;
  if (dias <= 0) return { texto: "Vencido", color: "#dc2626", bg: "#fef2f2" };
  if (dias <= 30) return { texto: `Vence en ${Math.ceil(dias)} días`, color: "#d97706", bg: "#fffbeb" };
  return { texto: "Activo", color: "#16a34a", bg: "#f0fdf4" };
}

const invocar = async (accion, datos = {}) =>
  (await base44.functions.invoke("gestionarApiClientes", { accion, ...datos })).data;

function Aviso({ tipo = "error", children }) {
  const estilos = {
    error: { cls: "text-red-700", bg: "#FEF2F2", borde: "#FECACA" },
    alerta: { cls: "text-amber-800", bg: "#FFFBEB", borde: "#FDE68A" },
  }[tipo];
  return (
    <div className={`rounded-xl p-3 text-xs flex items-start gap-2 ${estilos.cls}`} style={{ background: estilos.bg, border: `1px solid ${estilos.borde}` }}>
      <AlertTriangle className="w-4 h-4 shrink-0" /><span>{children}</span>
    </div>
  );
}

function BotonCopiar({ texto, etiqueta = "Copiar" }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch { /* sin permiso de portapapeles: queda el texto a la vista para copiar a mano */ }
  };
  return (
    <button type="button" onClick={copiar}
      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-white flex-shrink-0"
      style={{ background: copiado ? "#10B981" : "#2563EB" }}>
      {copiado ? <><CheckCircle2 className="w-4 h-4" /> Copiado</> : <><Copy className="w-4 h-4" /> {etiqueta}</>}
    </button>
  );
}

function ClaveUnaVez({ nombre, clave, onCerrar }) {
  return (
    <div className="rounded-2xl p-4 space-y-3" style={{ background: "#ECFDF5", border: "2px solid #10B981" }}>
      <p className="text-sm font-bold text-emerald-900 flex items-center gap-2">
        <KeyRound className="w-4 h-4" /> Clave de «{nombre}»
      </p>
      <div className="flex items-center gap-2">
        <code className="flex-1 bg-white border border-emerald-200 rounded-xl px-3 py-2 text-xs text-slate-800 break-all select-all">{clave}</code>
        <BotonCopiar texto={clave} />
      </div>
      <p className="text-xs text-emerald-900 leading-relaxed">
        <strong>Cópiala ahora: no se vuelve a mostrar.</strong> Entrégala al responsable del otro sistema por un canal seguro
        (no por WhatsApp ni en un correo con más gente). Si se pierde o se filtra, usa «Nueva clave».
      </p>
      <button type="button" onClick={onCerrar} className="px-4 py-2 rounded-xl text-sm font-semibold text-emerald-800 bg-white border border-emerald-300 hover:bg-emerald-50">
        Ya la guardé
      </button>
    </div>
  );
}

function NuevoAcceso({ info, onCreado, onCancelar }) {
  const [form, setForm] = useState({
    nombre: "", descripcion: "", alcances: [], todos_los_centros: false, centros: [],
    limite_por_minuto: info.limites.defecto, dias_vigencia: info.vigencia.defecto,
  });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const alternar = (k, v) => setForm((f) => ({ ...f, [k]: f[k].includes(v) ? f[k].filter((x) => x !== v) : [...f[k], v] }));

  const crear = async (e) => {
    e.preventDefault();
    setError("");
    if (form.nombre.trim().length < 3) return setError("Escribe el nombre del sistema (al menos 3 letras).");
    if (!form.alcances.length) return setError("Elige qué información va a enviar.");
    if (!form.todos_los_centros && !form.centros.length) return setError("Elige los centros, o «Todos los centros».");
    setGuardando(true);
    try {
      const r = await invocar("crear", {
        ...form,
        limite_por_minuto: Number(form.limite_por_minuto),
        dias_vigencia: Number(form.dias_vigencia),
      });
      onCreado(r);
    } catch (err) {
      setError(textoError(err, "crear el acceso"));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <form onSubmit={crear} className="rounded-2xl p-4 space-y-4 border border-blue-200" style={{ background: "#F8FAFF" }}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-slate-800">Nuevo acceso</p>
        <button type="button" onClick={onCancelar} className="p-1 rounded-lg text-slate-400 hover:text-slate-600" aria-label="Cancelar"><X className="w-4 h-4" /></button>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className={labelCls} htmlFor="api-nombre">Sistema que envía</label>
          <input id="api-nombre" className={inputCls} maxLength={80} value={form.nombre} onChange={(e) => set("nombre", e.target.value)} placeholder="Ej.: Tarjeta de combustible Copec" />
        </div>
        <div>
          <label className={labelCls} htmlFor="api-desc">Descripción (opcional)</label>
          <input id="api-desc" className={inputCls} maxLength={300} value={form.descripcion} onChange={(e) => set("descripcion", e.target.value)} placeholder="Responsable, contrato, contacto técnico" />
        </div>
      </div>

      <fieldset>
        <legend className={labelCls}>Qué información puede enviar</legend>
        <div className="grid sm:grid-cols-3 gap-2">
          {info.alcances.map((a) => (
            <label key={a.clave} className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white p-3 cursor-pointer">
              <input type="checkbox" className="mt-0.5" checked={form.alcances.includes(a.clave)} onChange={() => alternar("alcances", a.clave)} />
              <span>
                <span className="block text-sm font-semibold text-slate-800">{a.nombre}</span>
                <span className="block text-[11px] text-slate-500 leading-snug">{a.descripcion}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className={labelCls}>De qué centros (los vehículos de esos centros)</legend>
        <label className="flex items-center gap-2 text-sm text-slate-700 mb-2">
          <input type="checkbox" checked={form.todos_los_centros} onChange={(e) => set("todos_los_centros", e.target.checked)} />
          Todos los centros
        </label>
        {!form.todos_los_centros && (
          <div className="flex flex-wrap gap-2">
            {info.centros.length === 0 && <span className="text-xs text-slate-500">No hay centros registrados: usa «Todos los centros».</span>}
            {info.centros.map((c) => (
              <label key={c} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm cursor-pointer">
                <input type="checkbox" checked={form.centros.includes(c)} onChange={() => alternar("centros", c)} /> {c}
              </label>
            ))}
          </div>
        )}
      </fieldset>

      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className={labelCls} htmlFor="api-limite">Llamadas por minuto ({info.limites.minimo}–{info.limites.maximo})</label>
          <input id="api-limite" type="number" className={inputCls} min={info.limites.minimo} max={info.limites.maximo}
            value={form.limite_por_minuto} onChange={(e) => set("limite_por_minuto", e.target.value)} />
        </div>
        <div>
          <label className={labelCls} htmlFor="api-dias">Vigencia en días (máximo {info.vigencia.maximo})</label>
          <input id="api-dias" type="number" className={inputCls} min={info.vigencia.minimo} max={info.vigencia.maximo}
            value={form.dias_vigencia} onChange={(e) => set("dias_vigencia", e.target.value)} />
        </div>
      </div>

      {error && <Aviso>{error}</Aviso>}
      <button type="submit" disabled={guardando}
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60">
        {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
        Crear acceso y generar clave
      </button>
    </form>
  );
}

function ActividadAcceso({ id }) {
  const [filas, setFilas] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    invocar("actividad", { id, limite: 25 })
      .then((r) => setFilas(r.registros || []))
      .catch((e) => setError(textoError(e, "leer la actividad")));
  }, [id]);

  if (error) return <Aviso>{error}</Aviso>;
  if (!filas) return <Loader2 className="w-4 h-4 animate-spin text-slate-400" />;
  if (!filas.length) return <p className="text-xs text-slate-500">Todavía no ha llamado a la API.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-slate-500">
            <th className="py-1 pr-3 font-medium">Cuándo</th>
            <th className="py-1 pr-3 font-medium">Llamada</th>
            <th className="py-1 pr-3 font-medium">Resultado</th>
            <th className="py-1 pr-3 font-medium">Registros</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.id} className="border-t border-slate-100 text-slate-700">
              <td className="py-1 pr-3 whitespace-nowrap">{fechaHora(f.fecha)}</td>
              <td className="py-1 pr-3 font-mono">{f.metodo} {String(f.ruta || "").replace(/^\/api\/v1/, "")}</td>
              <td className="py-1 pr-3" style={{ color: f.estado >= 400 ? "#dc2626" : f.estado === 207 ? "#d97706" : "#16a34a" }}>{f.estado}</td>
              <td className="py-1 pr-3 whitespace-nowrap">
                {f.recibidos != null ? `${f.creados} nuevos · ${f.duplicados} repetidos · ${f.rechazados} rechazados` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TarjetaAcceso({ cliente, nombresAlcance, onClave, onCambio }) {
  const [ocupado, setOcupado] = useState(false);
  const [verActividad, setVerActividad] = useState(false);
  const [error, setError] = useState("");
  const estado = estadoDe(cliente);

  const rotar = async () => {
    if (!window.confirm(`¿Generar una clave nueva para «${cliente.nombre}»?\n\nLa clave actual deja de funcionar EN ESTE MOMENTO: el otro sistema tendrá que usar la nueva. La vigencia se renueva por un año.`)) return;
    setOcupado(true); setError("");
    try {
      const r = await invocar("rotar", { id: cliente.id });
      onClave({ nombre: cliente.nombre, clave: r.clave });
      onCambio();
    } catch (e) {
      setError(textoError(e, "generar la clave"));
    } finally {
      setOcupado(false);
    }
  };

  const revocar = async () => {
    const motivo = window.prompt(`Revocar «${cliente.nombre}»: el otro sistema deja de poder enviar información, para siempre.\n\nEscribe el motivo:`);
    if (motivo === null) return;
    setOcupado(true); setError("");
    try {
      await invocar("revocar", { id: cliente.id, motivo });
      onCambio();
    } catch (e) {
      setError(textoError(e, "revocar el acceso"));
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 p-4 space-y-2 bg-white">
      <div className="flex items-start gap-2 flex-wrap">
        <div className="flex-1 min-w-0">
          <p className="font-bold text-slate-800 truncate">{cliente.nombre}</p>
          <p className="text-[11px] font-mono text-slate-500">aps_{cliente.prefijo}_…</p>
        </div>
        <span className="text-[11px] font-bold rounded-full px-2 py-0.5" style={{ color: estado.color, background: estado.bg }}>{estado.texto}</span>
      </div>
      {cliente.descripcion && <p className="text-xs text-slate-600">{cliente.descripcion}</p>}
      <div className="flex flex-wrap gap-1.5">
        {cliente.alcances.map((a) => (
          <span key={a} className="text-[11px] rounded-full px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-100">{nombresAlcance[a] || a}</span>
        ))}
      </div>
      <p className="text-xs text-slate-500">
        {cliente.todos_los_centros ? "Todos los centros" : cliente.centros.join(" · ")}
        {` · ${cliente.limite_por_minuto} llamadas/min · vence ${fecha(cliente.expira)} · último uso ${fechaHora(cliente.ultimo_uso)}`}
      </p>
      <p className="text-[11px] text-slate-400">
        Creado {fecha(cliente.created_date)}{cliente.creado_por_nombre ? ` por ${cliente.creado_por_nombre}` : ""}
        {cliente.rotada_en ? ` · clave cambiada ${fecha(cliente.rotada_en)}` : ""}
      </p>
      {!cliente.activo && (
        <p className="text-xs text-red-700">Revocado {fecha(cliente.revocado_en)} por {cliente.revocado_por || "—"}: {cliente.motivo_revocacion}</p>
      )}
      {error && <Aviso>{error}</Aviso>}
      <div className="flex flex-wrap gap-2 pt-1">
        <button type="button" onClick={() => setVerActividad((v) => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50">
          <Activity className="w-3.5 h-3.5" /> {verActividad ? "Ocultar actividad" : "Actividad"}
        </button>
        {cliente.activo && (
          <>
            <button type="button" onClick={rotar} disabled={ocupado}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-blue-700 border border-blue-200 hover:bg-blue-50 disabled:opacity-60">
              {ocupado ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Nueva clave
            </button>
            <button type="button" onClick={revocar} disabled={ocupado}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-red-600 border border-red-200 hover:bg-red-50 disabled:opacity-60">
              <Ban className="w-3.5 h-3.5" /> Revocar
            </button>
          </>
        )}
      </div>
      {verActividad && <div className="pt-2"><ActividadAcceso id={cliente.id} /></div>}
    </div>
  );
}

export default function ApiIntegracionSection() {
  const { user } = useAuth();
  const esBase = user?.role === "super_admin";
  const [info, setInfo] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [creando, setCreando] = useState(false);
  const [claveNueva, setClaveNueva] = useState(null);

  const cargar = async () => {
    setError("");
    try {
      setInfo(await invocar("listar"));
    } catch (e) {
      setError(textoError(e, "cargar los accesos"));
    } finally {
      setCargando(false);
    }
  };
  useEffect(() => { if (esBase) cargar(); }, [esBase]);

  if (!esBase) return null;

  const nombresAlcance = Object.fromEntries((info?.alcances || []).map((a) => [a.clave, a.nombre]));
  const clientes = info?.clientes || [];

  return (
    <div className="bg-white rounded-3xl shadow-lg p-5 lg:p-8 space-y-4">
      <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
        <Network className="w-5 h-5 text-blue-500" /> API de integración
      </h2>
      <p className="text-sm text-slate-500">
        Para que otros sistemas <strong>entreguen información</strong> a éste: cargas de combustible (tarjeta de combustible),
        kilometraje del GPS y pagos de vehículos. Cada sistema recibe su propia clave, que dice qué puede enviar y de qué centros.
        Lo que llega aparece en Unidad de Control marcado «Recibido por API».
      </p>

      {BASE && (
        <div className="rounded-2xl p-4 space-y-2" style={{ background: "#EFF6FF", border: "1px solid #BFDBFE" }}>
          <p className="text-xs font-semibold text-blue-800">Lo que hay que entregarle al responsable del otro sistema</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-white border border-blue-100 rounded-xl px-3 py-2 text-xs text-slate-700 truncate">{BASE}</code>
            <BotonCopiar texto={BASE} etiqueta="Copiar dirección" />
          </div>
          <p className="text-xs text-blue-700">
            Más su clave, y el contrato técnico:{" "}
            <a href={`${BASE}/openapi.json`} target="_blank" rel="noreferrer" className="underline inline-flex items-center gap-1">
              openapi.json <ExternalLink className="w-3 h-3" />
            </a>
          </p>
        </div>
      )}

      {info && !info.configurada && (
        <Aviso tipo="alerta">
          Falta la variable <strong>API_CLAVES_PEPPER</strong> en el servidor de Railway (al menos 32 caracteres al azar).
          Mientras no esté, no se pueden crear claves y la API no atiende.
        </Aviso>
      )}
      {error && <Aviso>{error}</Aviso>}
      {claveNueva && <ClaveUnaVez {...claveNueva} onCerrar={() => setClaveNueva(null)} />}

      {cargando ? (
        <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
      ) : info && (
        <>
          {creando ? (
            <NuevoAcceso info={info} onCancelar={() => setCreando(false)}
              onCreado={(r) => { setCreando(false); setClaveNueva({ nombre: r.cliente.nombre, clave: r.clave }); cargar(); }} />
          ) : (
            <button type="button" onClick={() => setCreando(true)} disabled={!info.configurada}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50">
              <Plus className="w-4 h-4" /> Nuevo acceso
            </button>
          )}
          {clientes.length === 0 ? (
            <p className="text-sm text-slate-500">Todavía no hay sistemas conectados.</p>
          ) : (
            <div className="grid gap-3">
              {clientes.map((c) => (
                <TarjetaAcceso key={c.id} cliente={c} nombresAlcance={nombresAlcance} onClave={setClaveNueva} onCambio={cargar} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
