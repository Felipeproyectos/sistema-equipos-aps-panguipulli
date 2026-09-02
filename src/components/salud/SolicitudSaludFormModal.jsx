import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { X, Loader2, Heart } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

const CATEGORIAS = [
  { value: "parches", label: "Parches (adulto/pediátrico)" },
  { value: "baterias", label: "Baterías" },
  { value: "electrodos", label: "Electrodos / SpO2" },
  { value: "insumos_medicos", label: "Insumos médicos" },
  { value: "otros", label: "Otros" },
];

export default function SolicitudSaludFormModal({ user, onClose, onGuardado }) {
  const [form, setForm] = useState({
    repuesto_nombre: "",
    categoria: "insumos_medicos",
    cantidad: 1,
    urgencia: "media",
    equipo_label: "",
    motivo: "",
  });
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.repuesto_nombre.trim()) {
      toast({ title: "Indica el insumo a solicitar", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const numero = `CS-${Date.now().toString().slice(-6)}`;
      await base44.entities.SolicitudRepuestoSalud.create({
        numero_solicitud: numero,
        solicitante_email: user?.email,
        solicitante_nombre: user?.full_name,
        repuesto_nombre: form.repuesto_nombre.trim(),
        categoria: form.categoria,
        cantidad: Number(form.cantidad) || 1,
        urgencia: form.urgencia,
        equipo_label: form.equipo_label.trim() || undefined,
        motivo: form.motivo.trim() || undefined,
        estado: "aprobada",
        fecha_solicitud: new Date().toISOString().split("T")[0],
        linea_tiempo: [
          {
            fecha: new Date().toISOString(),
            evento: "Solicitud creada",
            usuario_email: user?.email || "",
            usuario_nombre: user?.full_name || "",
            notas: "Solicitud de compra de insumo médico enviada a Compras Salud",
          },
        ],
      });
      toast({ title: "Solicitud enviada", description: `${numero} · queda pendiente de compra.` });
      onGuardado();
      onClose();
    } catch (e) {
      toast({ title: "No se pudo crear la solicitud", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const input = "w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300 bg-slate-50";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" style={{ background: "rgba(15,23,42,0.55)" }}>
      <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "#ccfbf1" }}>
              <Heart className="w-4 h-4 text-teal-600" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800">Solicitud de Insumo Médico</h3>
              <p className="text-xs text-slate-500">Se envía al Encargado de Compras de Salud</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-500">Insumo a solicitar *</label>
            <input className={input} value={form.repuesto_nombre} onChange={e => set("repuesto_nombre", e.target.value)} placeholder="Ej. Parches DEA adulto (paquete)" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500">Categoría</label>
              <select className={input} value={form.categoria} onChange={e => set("categoria", e.target.value)}>
                {CATEGORIAS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">Cantidad</label>
              <input type="number" min="1" className={input} value={form.cantidad} onChange={e => set("cantidad", e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">Equipo asociado (opcional)</label>
            <input className={input} value={form.equipo_label} onChange={e => set("equipo_label", e.target.value)} placeholder="Ej. DEA LIFEPAK 15 — CESFAM Panguipulli" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">Urgencia</label>
            <select className={input} value={form.urgencia} onChange={e => set("urgencia", e.target.value)}>
              <option value="alta">Alta</option>
              <option value="media">Media</option>
              <option value="baja">Baja</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">Motivo / Justificación</label>
            <textarea rows={2} className={input} value={form.motivo} onChange={e => set("motivo", e.target.value)} placeholder="Ej. Stock mínimo alcanzado, vencimiento próximo, etc." />
          </div>
        </div>
        <div className="px-5 py-4 border-t border-slate-100 flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100">Cancelar</button>
          <button onClick={submit} disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50 flex items-center justify-center gap-1.5" style={{ background: "#0d9488" }}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Enviar Solicitud"}
          </button>
        </div>
      </div>
    </div>
  );
}