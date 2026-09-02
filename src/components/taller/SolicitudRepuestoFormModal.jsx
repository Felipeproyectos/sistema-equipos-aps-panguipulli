import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, X } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

const CATS = ["neumaticos", "frenos", "bateria", "filtros", "lubricantes", "electrico", "sirena", "luces", "otros"];

export default function SolicitudRepuestoFormModal({ open, onClose, onGuardar, user, ordenesActivas = [], requiereOT = false }) {
  const [form, setForm] = useState({ repuesto_nombre: "", categoria: "otros", cantidad: 1, urgencia: "media", motivo: "", orden_trabajo_id: "" });
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  if (!open) return null;

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // El mecánico solicita al Jefe de Taller; el Jefe (u otros roles) solicita
  // directamente al Encargado de Compras de Taller.
  const destino = user?.role === "mecanico" ? "el Jefe de Taller" : "el Encargado de Compras de Taller";

  // El mecánico debe esperar aprobación del Jefe de Taller; el Jefe de Taller
  // (y admins) generan solicitudes de compra que se auto-aprueban y van
  // directamente al Encargado de Compras de Taller.
  const esAutoAprueba = ["jefe_taller", "super_admin", "admin"].includes(user?.role);

  const submit = async () => {
    if (!form.repuesto_nombre.trim()) { toast({ title: "Indica el repuesto", variant: "destructive" }); return; }
    if (requiereOT && !form.orden_trabajo_id) { toast({ title: "Selecciona la orden de trabajo", description: "Debes vincular la solicitud a un vehículo en taller", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const numero = `SR-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Date.now().toString().slice(-5)}`;
      const otSel = ordenesActivas.find(o => o.id === form.orden_trabajo_id);
      const hoy = new Date().toISOString().split("T")[0];
      const base = {
        repuesto_nombre: form.repuesto_nombre,
        categoria: form.categoria,
        cantidad: Number(form.cantidad) || 1,
        urgencia: form.urgencia,
        motivo: form.motivo,
        orden_trabajo_id: form.orden_trabajo_id || undefined,
        orden_trabajo_label: otSel ? `${otSel.numero_ot} · ${otSel.equipo_label || ""}` : undefined,
        numero_solicitud: numero,
        solicitante_email: user?.email,
        solicitante_nombre: user?.full_name,
        fecha_solicitud: hoy,
      };
      if (esAutoAprueba) {
        Object.assign(base, {
          estado: "aprobada",
          aprobador_email: user?.email,
          aprobador_nombre: user?.full_name,
          fecha_aprobacion: hoy,
          comentario_aprobador: "Solicitud de compra generada por Jefe de Taller",
        });
      } else {
        base.estado = "pendiente";
      }
      await base44.entities.SolicitudRepuesto.create(base);
      toast({ title: esAutoAprueba ? "Solicitud de compra enviada" : "Solicitud enviada", description: esAutoAprueba ? "Notificada al Encargado de Compras de Taller" : `Será revisada por ${destino}` });
      setForm({ repuesto_nombre: "", categoria: "otros", cantidad: 1, urgencia: "media", motivo: "", orden_trabajo_id: "" });
      onGuardar();
      onClose();
    } catch (e) {
      toast({ title: "No se pudo crear", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const input = "w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 bg-slate-50";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" style={{ background: "rgba(15,23,42,0.5)" }}>
      <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-800">Nueva Solicitud de Repuesto</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-3">
          {ordenesActivas.length > 0 && (
            <div>
              <label className="text-xs font-semibold text-slate-500">
                Orden de trabajo {requiereOT && <span className="text-amber-600">*</span>}
              </label>
              <select className={input} value={form.orden_trabajo_id} onChange={e => set("orden_trabajo_id", e.target.value)}>
                <option value="">Selecciona el vehículo en taller…</option>
                {ordenesActivas.map(o => (
                  <option key={o.id} value={o.id}>{o.numero_ot} · {o.equipo_label}{o.patente ? ` · ${o.patente}` : ""}</option>
                ))}
              </select>
              <p className="text-[11px] text-slate-400 mt-1">Vincula la solicitud a la orden donde se usarán los repuestos.</p>
            </div>
          )}
          <div>
            <label className="text-xs font-semibold text-slate-500">Repuesto solicitado</label>
            <input className={input} value={form.repuesto_nombre} onChange={e => set("repuesto_nombre", e.target.value)} placeholder="Ej. Filtro de aceite" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500">Categoría</label>
              <select className={input} value={form.categoria} onChange={e => set("categoria", e.target.value)}>
                {CATS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">Cantidad</label>
              <input type="number" min="1" className={input} value={form.cantidad} onChange={e => set("cantidad", e.target.value)} />
            </div>
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
            <label className="text-xs font-semibold text-slate-500">Motivo / justificación</label>
            <textarea rows={2} className={input} value={form.motivo} onChange={e => set("motivo", e.target.value)} placeholder="¿Para qué se necesita?" />
          </div>
          <p className="text-xs text-slate-400">La solicitud será revisada y gestionada por {destino}.</p>
        </div>
        <div className="px-5 py-4 border-t border-slate-100 flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100">Cancelar</button>
          <button onClick={submit} disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50 flex items-center justify-center gap-1.5" style={{ background: "#D97706" }}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Enviar Solicitud"}
          </button>
        </div>
      </div>
    </div>
  );
}