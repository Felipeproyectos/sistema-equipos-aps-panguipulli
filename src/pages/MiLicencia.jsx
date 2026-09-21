import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { IdCard, Loader2, CheckCircle2, AlertTriangle, Clock, Pencil } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { isSimulandoActivo } from "@/lib/roleSimulator";
import { estadoLicencia } from "@/pages/Choferes";

// La pantalla del chofer. Es la única que tiene, y es a propósito: su trabajo
// no pasa por el sistema, pasa por el vehículo. Lo único que el sistema
// necesita de él — y él del sistema — es que su licencia esté al día.
//
// Cierra el círculo del aviso: la tarea de las 03:00 detecta que la licencia
// está por vencer, Movilización lo ve en su pantalla de Choferes, y cuando el
// chofer renueva, entra acá y pone la fecha nueva. Sin esto, el dato solo
// podría cargarse una vez, en el primer ingreso, y la alerta quedaría sonando
// para siempre.

const CLASES_LICENCIA = ["A1", "A2", "A3", "A4", "A5", "B", "C", "D", "E", "F"];

const COLOR = {
  vencida:    { texto: "#b91c1c", fondo: "#fef2f2", borde: "#fecaca", icon: AlertTriangle,
                titulo: "Tu licencia está vencida",
                ayuda: "No puedes conducir vehículos de la Corporación hasta renovarla. Avísale a Movilización." },
  por_vencer: { texto: "#b45309", fondo: "#fffbeb", borde: "#fde68a", icon: Clock,
                titulo: "Tu licencia está por vencer",
                ayuda: "Pide hora en el municipio para renovarla. Cuando la tengas, actualiza la fecha acá." },
  vigente:    { texto: "#15803d", fondo: "#f0fdf4", borde: "#bbf7d0", icon: CheckCircle2,
                titulo: "Tu licencia está vigente",
                ayuda: "Te vamos a avisar 60 días antes de que venza." },
  sin_datos:  { texto: "#64748b", fondo: "#f8fafc", borde: "#e2e8f0", icon: IdCard,
                titulo: "Falta cargar tu licencia",
                ayuda: "Movilización necesita estos datos para saber que estás habilitado." },
};

export default function MiLicencia() {
  const { user, refreshUser } = useAuth();
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState({ numero: "", clase: "B", vence: "" });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [listo, setListo] = useState(false);

  const soloLectura = isSimulandoActivo();

  useEffect(() => {
    setForm({
      numero: user?.licencia_numero || "",
      clase: user?.licencia_clase || "B",
      vence: user?.licencia_vencimiento || "",
    });
  }, [user]);

  const lic = estadoLicencia(user?.licencia_vencimiento);
  const col = COLOR[lic.clave];
  const Icono = col.icon;

  const guardar = async () => {
    if (!form.numero.trim()) { setError("Escribe el número de tu licencia."); return; }
    if (!form.vence) { setError("Falta la fecha de vencimiento."); return; }
    setError("");
    setGuardando(true);
    try {
      await base44.functions.invoke("gestionarAcceso", {
        accion: "mi_perfil",
        licencia_numero: form.numero.trim(),
        licencia_clase: form.clase,
        licencia_vencimiento: form.vence,
      });
      await refreshUser?.();
      setEditando(false);
      setListo(true);
      setTimeout(() => setListo(false), 3000);
    } catch (e) {
      setError(e?.message || "No se pudo guardar. Intenta de nuevo.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="relative overflow-hidden px-4 lg:px-10 pt-6 lg:pt-10 pb-6 lg:pb-8"
        style={{ background: "linear-gradient(135deg, #451a03 0%, #92400e 45%, #d97706 100%)" }}>
        <div className="relative max-w-2xl mx-auto flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
            style={{ background: "rgba(255,255,255,0.2)" }}>
            <IdCard className="w-6 h-6 text-white" />
          </div>
          <div>
            <p className="text-amber-200 text-xs font-semibold uppercase tracking-widest">Flota</p>
            <h1 className="text-2xl lg:text-3xl font-bold text-white">Mi licencia</h1>
            <p className="text-amber-100 text-sm mt-0.5">{user?.full_name || user?.email}</p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 lg:px-10 pt-6 pb-10 space-y-4">
        <div className="rounded-2xl border p-5 flex items-start gap-3"
          style={{ background: col.fondo, borderColor: col.borde }}>
          <Icono className="w-6 h-6 shrink-0 mt-0.5" style={{ color: col.texto }} />
          <div>
            <p className="font-bold" style={{ color: col.texto }}>{col.titulo}</p>
            {/* "Vigente" a secas repetiria el titulo; el resto agrega el plazo. */}
            {lic.clave !== "sin_datos" && lic.clave !== "vigente" && (
              <p className="text-sm mt-0.5" style={{ color: col.texto }}>{lic.label}</p>
            )}
            <p className="text-sm text-slate-600 mt-1.5">{col.ayuda}</p>
          </div>
        </div>

        {listo && (
          <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3">
            <CheckCircle2 className="w-4 h-4 text-green-700 shrink-0" />
            <p className="text-sm text-green-800">Listo, quedó guardado.</p>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          {!editando ? (
            <>
              <div className="space-y-3">
                <Dato titulo="Número" valor={user?.licencia_numero || "—"} />
                <Dato titulo="Clase" valor={user?.licencia_clase || "—"} />
                <Dato titulo="Vence el" valor={user?.licencia_vencimiento
                  ? new Date(`${user.licencia_vencimiento}T00:00:00`).toLocaleDateString("es-CL")
                  : "—"} />
              </div>
              {!soloLectura && (
                <button onClick={() => setEditando(true)}
                  className="mt-5 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl
                             text-sm font-semibold text-white bg-amber-700 hover:bg-amber-800">
                  <Pencil className="w-4 h-4" />
                  {user?.licencia_numero ? "Actualizar mis datos" : "Cargar mi licencia"}
                </button>
              )}
            </>
          ) : (
            <div className="space-y-4">
              <div>
                <label htmlFor="mi-lic-numero" className="text-xs font-semibold text-slate-600 block mb-1">
                  Número de licencia *
                </label>
                <input id="mi-lic-numero" value={form.numero}
                  onChange={e => setForm(f => ({ ...f, numero: e.target.value }))}
                  placeholder="Como aparece en el documento"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white
                             focus:outline-none focus:ring-2 focus:ring-amber-300" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="mi-lic-clase" className="text-xs font-semibold text-slate-600 block mb-1">Clase</label>
                  <select id="mi-lic-clase" value={form.clase}
                    onChange={e => setForm(f => ({ ...f, clase: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white
                               focus:outline-none focus:ring-2 focus:ring-amber-300">
                    {CLASES_LICENCIA.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="mi-lic-vence" className="text-xs font-semibold text-slate-600 block mb-1">Vence el *</label>
                  <input id="mi-lic-vence" type="date" value={form.vence}
                    onChange={e => setForm(f => ({ ...f, vence: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white
                               focus:outline-none focus:ring-2 focus:ring-amber-300" />
                </div>
              </div>

              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              <div className="flex gap-3">
                <button onClick={() => { setEditando(false); setError(""); }}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium text-slate-600
                             border border-slate-200 hover:bg-slate-50">
                  Cancelar
                </button>
                <button onClick={guardar} disabled={guardando}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl
                             text-sm font-semibold text-white bg-amber-700 hover:bg-amber-800 disabled:opacity-60">
                  {guardando && <Loader2 className="w-4 h-4 animate-spin" />}
                  {guardando ? "Guardando..." : "Guardar"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Dato({ titulo, valor }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <span className="text-sm text-slate-500">{titulo}</span>
      <span className="text-sm font-semibold text-slate-800">{valor}</span>
    </div>
  );
}
