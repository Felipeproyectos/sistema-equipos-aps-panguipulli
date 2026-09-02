import { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import {
  MessageSquare, Send, Loader2, StickyNote, HelpCircle, CornerDownRight, Lock
} from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { isSimulandoActivo, MENSAJE_BLOQUEO_SIMULACION } from "@/lib/roleSimulator";
import { ROLE_LABELS } from "@/lib/roles";

const TIPO_CFG = {
  nota: { label: "Nota", icon: StickyNote, color: "#2563EB", bg: "#EFF6FF" },
  pregunta: { label: "Pregunta", icon: HelpCircle, color: "#D97706", bg: "#FFFBEB" },
  respuesta: { label: "Respuesta", icon: CornerDownRight, color: "#16A34A", bg: "#F0FDF4" },
};

// Roles que pueden escribir notas/consultas en la OT (según RLS de Comentario)
const ROLES_ESCRITURA = ["super_admin", "monitor_corporativo", "jefe_taller", "encargado_salud"];

function fmtFecha(fecha) {
  if (!fecha) return "";
  try {
    return new Date(fecha).toLocaleString("es-CL", {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch { return fecha; }
}

export default function ComentariosOT({ ot }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [comentarios, setComentarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mensaje, setMensaje] = useState("");
  const [tipo, setTipo] = useState("nota");
  const [enviando, setEnviando] = useState(false);

  const simActivo = isSimulandoActivo();
  const puedeEscribir = !simActivo && ROLES_ESCRITURA.includes(user?.role);

  const cargarComentarios = useCallback(async () => {
    if (!ot?.id) return;
    setLoading(true);
    try {
      const todos = await base44.entities.Comentario.filter(
        { orden_trabajo_id: ot.id },
        "-created_date",
        100
      ).catch(() => []);
      setComentarios(todos);
    } catch { setComentarios([]); }
    setLoading(false);
  }, [ot?.id]);

  useEffect(() => { cargarComentarios(); }, [cargarComentarios]);

  const enviar = async () => {
    if (!mensaje.trim()) {
      toast({ title: "Escribe un mensaje primero", variant: "destructive" });
      return;
    }
    setEnviando(true);
    try {
      await base44.entities.Comentario.create({
        equipo_id: ot.equipo_id || ot.id,
        equipo_label: ot.equipo_label || ot.numero_ot,
        orden_trabajo_id: ot.id,
        mensaje: mensaje.trim(),
        tipo,
        autor_email: user.email,
        autor_nombre: user.full_name,
        autor_rol: user.role,
      });
      setMensaje("");
      setTipo("nota");
      await cargarComentarios();
      toast({ title: "Mensaje publicado" });
    } catch (e) {
      toast({ title: "No se pudo publicar", description: e.message, variant: "destructive" });
    }
    setEnviando(false);
  };

  return (
    <div className="bg-white rounded-2xl p-5" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
      <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
        <MessageSquare className="w-4 h-4 text-indigo-600" />
        Notas y Consultas
        <span className="text-xs font-normal text-slate-400">
          · Coordina estado del vehículo
        </span>
      </h3>

      {simActivo && (
        <div className="rounded-xl px-3 py-2 mb-3 flex items-center gap-2 text-xs font-semibold" style={{ background: "#F5F3FF", color: "#7C3AED" }}>
          <Lock className="w-3.5 h-3.5 flex-shrink-0" /> {MENSAJE_BLOQUEO_SIMULACION}
        </div>
      )}

      {/* Lista de mensajes */}
      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
        </div>
      ) : comentarios.length === 0 ? (
        <div className="text-center py-6">
          <MessageSquare className="w-8 h-8 text-slate-200 mx-auto mb-2" />
          <p className="text-xs text-slate-400">Sin notas ni consultas. Sé el primero en coordinar.</p>
        </div>
      ) : (
        <div className="space-y-3 mb-4 max-h-80 overflow-y-auto pr-1">
          {comentarios.map((c) => {
            const cfg = TIPO_CFG[c.tipo] || TIPO_CFG.nota;
            const Icon = cfg.icon;
            return (
              <div key={c.id} className="flex items-start gap-2.5">
                <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: cfg.bg }}>
                  <Icon className="w-4 h-4" style={{ color: cfg.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-semibold text-slate-700">{c.autor_nombre || c.autor_email}</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: cfg.bg, color: cfg.color }}>
                      {ROLE_LABELS[c.autor_rol] || c.autor_rol}
                    </span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">
                      {cfg.label}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600 whitespace-pre-wrap mt-0.5">{c.mensaje}</p>
                  <span className="text-xs text-slate-400">{fmtFecha(c.created_date)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Caja de nuevo mensaje */}
      {puedeEscribir && (
        <div className="border-t border-slate-100 pt-3">
          <div className="flex gap-2 mb-2">
            {(Object.keys(TIPO_CFG)).map((k) => {
              const cfg = TIPO_CFG[k];
              const Icon = cfg.icon;
              const activo = tipo === k;
              return (
                <button key={k} onClick={() => setTipo(k)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all"
                  style={{
                    background: activo ? cfg.color : cfg.bg,
                    color: activo ? "white" : cfg.color,
                  }}>
                  <Icon className="w-3.5 h-3.5" /> {cfg.label}
                </button>
              );
            })}
          </div>
          <div className="flex gap-2">
            <textarea rows={2} value={mensaje} onChange={(e) => setMensaje(e.target.value)}
              placeholder={
                tipo === "pregunta" ? "Escribe tu consulta sobre el estado del vehículo..." :
                tipo === "respuesta" ? "Responde a una consulta previa..." :
                "Agrega una nota de coordinación..."
              }
              className="flex-1 border border-slate-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            <button onClick={enviar} disabled={enviando || !mensaje.trim()}
              className="px-4 rounded-xl text-sm font-bold text-white disabled:opacity-50 flex items-center justify-center gap-1 self-stretch"
              style={{ background: "#4F46E5" }}>
              {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}