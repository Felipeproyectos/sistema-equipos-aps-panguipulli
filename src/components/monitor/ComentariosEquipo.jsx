import { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { MessageCircle, Send, HelpCircle, Loader2 } from "lucide-react";
import { roleLabel } from "@/lib/roles";

const PUEDE_COMENTAR = ["super_admin", "monitor_corporativo", "jefe_taller", "encargado_salud"];

const TIPO_CFG = {
  pregunta: { label: "Pregunta", color: "#7c3aed", bg: "#f5f3ff", icon: HelpCircle },
  respuesta: { label: "Respuesta", color: "#16a34a", bg: "#f0fdf4", icon: MessageCircle },
  nota: { label: "Nota", color: "#2563eb", bg: "#eff6ff", icon: MessageCircle },
};

/**
 * Hilo de notas/preguntas bidireccional por equipo (ver diseño de roles:
 * Monitor Corporativo, Jefe de Taller y Encargado Salud del centro dueño del
 * equipo pueden leer y escribir en el mismo hilo). Ej: "ambulancia de
 * Coñaripe en Taller por cambio de correa" — Monitor Corporativo pregunta
 * fecha de reintegro, Jefe de Taller responde, Encargado Salud de Coñaripe
 * ve la respuesta sin tener que preguntar.
 */
export default function ComentariosEquipo({ equipoId, equipoLabel, ordenTrabajoId, currentUser, compact = false }) {
  const [comentarios, setComentarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mensaje, setMensaje] = useState("");
  const [tipo, setTipo] = useState("nota");
  const [enviando, setEnviando] = useState(false);

  const fetchComentarios = useCallback(async () => {
    if (!equipoId) return;
    const lista = await base44.entities.Comentario.filter({ equipo_id: equipoId }, "-created_date", 50).catch(() => []);
    setComentarios(lista.sort((a, b) => new Date(a.created_date) - new Date(b.created_date)));
  }, [equipoId]);

  useEffect(() => {
    setLoading(true);
    fetchComentarios().finally(() => setLoading(false));
  }, [fetchComentarios]);

  const puedeEscribir = PUEDE_COMENTAR.includes(currentUser?.role);

  const enviar = async () => {
    if (!mensaje.trim() || !equipoId) return;
    setEnviando(true);
    try {
      await base44.entities.Comentario.create({
        equipo_id: equipoId,
        equipo_label: equipoLabel || equipoId,
        orden_trabajo_id: ordenTrabajoId || "",
        mensaje: mensaje.trim(),
        tipo,
        autor_email: currentUser?.email,
        autor_nombre: currentUser?.full_name || currentUser?.email,
        autor_rol: currentUser?.role,
      });
      setMensaje("");
      await fetchComentarios();
    } catch (e) {
      console.error(e);
    } finally {
      setEnviando(false);
    }
  };

  if (!equipoId) return null;

  return (
    <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
      <div className="px-4 py-3 border-b border-slate-50 flex items-center gap-2">
        <MessageCircle className="w-4 h-4 text-indigo-500" />
        <h3 className="text-sm font-bold text-slate-700">Notas y Consultas</h3>
        <span className="text-xs text-slate-400 ml-auto">{equipoLabel}</span>
      </div>

      <div className={`p-4 space-y-2 ${compact ? "max-h-56" : "max-h-80"} overflow-y-auto`}>
        {loading ? (
          <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-slate-300" /></div>
        ) : comentarios.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-3">Sin notas todavía. {puedeEscribir ? "Sé el primero en dejar una." : ""}</p>
        ) : (
          comentarios.map((c) => {
            const cfg = TIPO_CFG[c.tipo] || TIPO_CFG.nota;
            return (
              <div key={c.id} className="rounded-xl px-3 py-2" style={{ background: cfg.bg }}>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-bold" style={{ color: cfg.color }}>{c.autor_nombre || c.autor_email}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: "white", color: cfg.color }}>
                    {roleLabel(c.autor_rol)}
                  </span>
                  <span className="text-[10px] text-slate-400 ml-auto">{cfg.label}</span>
                </div>
                <p className="text-xs text-slate-700">{c.mensaje}</p>
              </div>
            );
          })
        )}
      </div>

      {puedeEscribir && (
        <div className="p-3 border-t border-slate-50 space-y-2">
          <div className="flex gap-1.5">
            {Object.entries(TIPO_CFG).map(([v, cfg]) => (
              <button
                key={v}
                onClick={() => setTipo(v)}
                className="px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all"
                style={tipo === v ? { background: cfg.color, color: "white" } : { background: "#F1F5F9", color: "#64748B" }}
              >
                {cfg.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={mensaje}
              onChange={(e) => setMensaje(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") enviar(); }}
              placeholder="Escribe una nota o pregunta..."
              className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
            <button
              onClick={enviar}
              disabled={!mensaje.trim() || enviando}
              className="px-3 py-2 rounded-xl text-white disabled:opacity-50"
              style={{ background: "#4F46E5" }}
            >
              {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}