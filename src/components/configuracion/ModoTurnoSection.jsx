import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { KeyRound, ClipboardList, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { MODO_MI_TURNO, MODO_PAUTAS, miTurnoActivo } from "@/lib/turnoFlota";

// El interruptor de «Mi turno» (migracion/26_modo_turno.sql).
//
// Mientras la jefatura no dé el visto bueno queda en «Pautas»: el chofer
// llena Turno Chofer en la página pública y Calidad lo revisa en Revisión
// Bitácora, como siempre. Al encenderlo, la tarjeta de la página pública
// pasa a llevar a «Mi turno» y los choferes toman el vehículo con su cuenta.
// Se puede volver atrás cuando se quiera: no se borra nada.

const OPCIONES = [
  {
    modo: MODO_PAUTAS,
    titulo: "Pautas (como siempre)",
    icono: ClipboardList,
    color: "#2563EB",
    texto: "El chofer llena «Turno Chofer» en la página pública de pautas, sin cuenta. Llega a Revisión Bitácora para Calidad.",
  },
  {
    modo: MODO_MI_TURNO,
    titulo: "Mi turno",
    icono: KeyRound,
    color: "#B45309",
    texto: "Cada chofer entra con su cuenta, toma el vehículo con la pauta de inicio y lo entrega al terminar. Movilización ve quién tiene cada vehículo.",
  },
];

export default function ModoTurnoSection({ config, onGuardado }) {
  const [guardando, setGuardando] = useState(null);
  const [error, setError] = useState("");
  const [listo, setListo] = useState("");

  const actual = miTurnoActivo(config) ? MODO_MI_TURNO : MODO_PAUTAS;
  // select * trae la columna aunque esté vacía: si no viene, falta la 26.
  const faltaColumna = !!config && !("modo_turno" in config);

  const cambiar = async (modo) => {
    if (modo === actual || guardando) return;
    const pregunta = modo === MODO_MI_TURNO
      ? "¿Encender «Mi turno»?\n\nLa tarjeta «Turno Chofer» de la página pública dejará de mostrar el formulario y los choferes tendrán que entrar con su cuenta para tomar el vehículo."
      : "¿Volver a las pautas?\n\nLos choferes registrarán el turno otra vez en la página pública, sin cuenta. Lo registrado en «Mi turno» se conserva.";
    if (!window.confirm(pregunta)) return;
    setGuardando(modo);
    setError("");
    setListo("");
    try {
      const nuevo = config?.id
        ? await base44.entities.AppConfig.update(config.id, { modo_turno: modo })
        : await base44.entities.AppConfig.create({ modo_turno: modo });
      onGuardado?.({ ...(config || {}), ...(nuevo || {}), modo_turno: modo });
      setListo(modo === MODO_MI_TURNO ? "«Mi turno» quedó encendido." : "Quedó en pautas, como siempre.");
    } catch (e) {
      const m = String(e?.message || e?.data?.error || "");
      setError(/modo_turno/i.test(m) || faltaColumna
        ? "Falta ejecutar migracion/26_modo_turno.sql en Supabase. Mientras tanto queda en pautas."
        : `No se pudo guardar${m ? `: ${m}` : "."}`);
    } finally {
      setGuardando(null);
    }
  };

  return (
    <div className="bg-white rounded-3xl shadow-lg p-5 lg:p-8 space-y-4">
      <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
        <KeyRound className="w-5 h-5 text-amber-600" /> Turno de los choferes
      </h2>
      <p className="text-sm text-slate-500">
        Cómo registran los choferes el inicio de su turno. Se puede cambiar cuando se quiera; no se borra nada.
      </p>

      <div className="grid sm:grid-cols-2 gap-3">
        {OPCIONES.map(o => {
          const Icono = o.icono;
          const activo = actual === o.modo;
          return (
            <button key={o.modo} onClick={() => cambiar(o.modo)} disabled={!!guardando}
              className="text-left rounded-2xl p-4 border-2 transition-all disabled:opacity-70"
              style={{ borderColor: activo ? o.color : "#E2E8F0", background: activo ? `${o.color}0D` : "#FFFFFF" }}>
              <div className="flex items-center gap-2">
                <Icono className="w-5 h-5" style={{ color: o.color }} />
                <p className="font-bold text-slate-800 flex-1">{o.titulo}</p>
                {guardando === o.modo
                  ? <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                  : activo && (
                    <span className="text-[11px] font-bold rounded-full px-2 py-0.5 text-white" style={{ background: o.color }}>
                      En uso
                    </span>
                  )}
              </div>
              <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">{o.texto}</p>
            </button>
          );
        })}
      </div>

      {actual === MODO_PAUTAS && (
        <p className="text-xs text-slate-500">
          Antes de encender «Mi turno», cada chofer necesita su cuenta (Choferes → Nuevo chofer) y su licencia cargada.
        </p>
      )}
      {faltaColumna && !error && (
        <div className="rounded-xl p-3 text-xs text-amber-800 flex items-start gap-2" style={{ background: "#FFFBEB", border: "1px solid #FDE68A" }}>
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>Para poder encenderlo falta ejecutar <strong>migracion/26_modo_turno.sql</strong> en Supabase. Mientras tanto queda en pautas.</span>
        </div>
      )}
      {error && (
        <div className="rounded-xl p-3 text-xs text-red-700 flex items-start gap-2" style={{ background: "#FEF2F2", border: "1px solid #FECACA" }}>
          <AlertTriangle className="w-4 h-4 shrink-0" /><span>{error}</span>
        </div>
      )}
      {listo && (
        <div className="rounded-xl p-3 text-xs text-green-800 flex items-center gap-2" style={{ background: "#F0FDF4", border: "1px solid #BBF7D0" }}>
          <CheckCircle2 className="w-4 h-4 shrink-0" />{listo}
        </div>
      )}
    </div>
  );
}
