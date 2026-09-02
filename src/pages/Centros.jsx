import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, X, Building2, MapPin, Loader2, ChevronDown, ChevronUp, Mail } from "lucide-react";

const CENTROS_INICIALES = [
  { nombre: "CESFAM Panguipulli", tipo: "CESFAM", sucursales: [] },
  { nombre: "CESFAM Coñaripe", tipo: "CESFAM", sucursales: [] },
  { nombre: "CESFAM Choshuenco", tipo: "CESFAM", sucursales: [] },
  { nombre: "CECOSF Liquiñe", tipo: "CECOSF", sucursales: [] },
  { nombre: "CECOSF Neltume", tipo: "CECOSF", sucursales: [] },
];

export default function Centros() {
  const [centros, setCentros] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandido, setExpandido] = useState(null);
  const [nuevoLugar, setNuevoLugar] = useState({});
  const [nuevoEmail, setNuevoEmail] = useState({});
  const [saving, setSaving] = useState(null);

  const load = async () => {
    let data = await base44.entities.Centro.list().catch(() => []);
    if (data.length === 0) {
      await Promise.all(CENTROS_INICIALES.map(c => base44.entities.Centro.create(c)));
      data = await base44.entities.Centro.list();
    }
    for (const ci of CENTROS_INICIALES) {
      if (!data.find(d => d.nombre === ci.nombre)) {
        await base44.entities.Centro.create(ci);
      }
    }
    data = await base44.entities.Centro.list();
    setCentros(data.sort((a, b) => a.nombre.localeCompare(b.nombre)));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleAddSucursal = async (centro) => {
    const lugar = nuevoLugar[centro.id]?.trim();
    if (!lugar) return;
    setSaving(centro.id);
    const sucursales = [...(centro.sucursales || []), lugar];
    await base44.entities.Centro.update(centro.id, { sucursales });
    setNuevoLugar(p => ({ ...p, [centro.id]: "" }));
    setSaving(null);
    load();
  };

  const handleRemoveSucursal = async (centro, lugar) => {
    const sucursales = (centro.sucursales || []).filter(s => s !== lugar);
    await base44.entities.Centro.update(centro.id, { sucursales });
    load();
  };

  const handleAddEmail = async (centro) => {
    const email = nuevoEmail[centro.id]?.trim().toLowerCase();
    if (!email || !email.includes('@')) return;
    const emails_contacto = [...(centro.emails_contacto || [])];
    if (emails_contacto.includes(email)) return;
    emails_contacto.push(email);
    setSaving(centro.id + '_email');
    await base44.entities.Centro.update(centro.id, { emails_contacto });
    setNuevoEmail(p => ({ ...p, [centro.id]: '' }));
    setSaving(null);
    load();
  };

  const handleRemoveEmail = async (centro, email) => {
    const emails_contacto = (centro.emails_contacto || []).filter(e => e !== email);
    await base44.entities.Centro.update(centro.id, { emails_contacto });
    load();
  };

  const tipoBadge = {
    CESFAM: "bg-blue-100 text-blue-700",
    CECOSF: "bg-purple-100 text-purple-700",
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
    </div>
  );

  return (
    <div className="min-h-screen" style={{ background: "#e8f4fd" }}>
      {/* Header */}
      <div className="relative overflow-hidden px-6 lg:px-10 pt-10 pb-8" style={{ background: "linear-gradient(135deg, #0f2d6b 0%, #1565c0 40%, #29b6f6 100%)" }}>
        <div className="absolute right-8 top-1/2 -translate-y-1/2 w-56 h-56 rounded-full opacity-20 border-4 border-white" />
        <div className="absolute right-4 bottom-0 w-72 h-72 rounded-full opacity-10" style={{ background: "radial-gradient(circle, #29b6f6 0%, transparent 70%)" }} />
        <div className="relative max-w-3xl mx-auto flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: "rgba(255,255,255,0.2)" }}>
            <Building2 className="w-6 h-6 text-white" />
          </div>
          <div>
            <p className="text-cyan-200 text-xs font-semibold uppercase tracking-widest">Administración</p>
            <h1 className="text-3xl font-bold text-white">Centros de Salud</h1>
            <p className="text-blue-100 text-sm mt-0.5">Gestiona centros principales y sus ubicaciones dependientes</p>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 lg:px-10 pt-6 pb-10">
        <div className="bg-white rounded-3xl shadow-lg p-6">
          <div className="space-y-3">
            {centros.map(centro => (
              <div key={centro.id} className="bg-slate-50 rounded-2xl border border-slate-100 overflow-hidden">
                <button
                  onClick={() => setExpandido(expandido === centro.id ? null : centro.id)}
                  className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-100 transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                      <Building2 className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">{centro.nombre}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${tipoBadge[centro.tipo]}`}>
                          {centro.tipo}
                        </span>
                        <span className="text-xs text-slate-400">
                          {(centro.sucursales || []).length} ubicación(es)
                        </span>
                      </div>
                    </div>
                  </div>
                  {expandido === centro.id
                    ? <ChevronUp className="w-5 h-5 text-slate-400" />
                    : <ChevronDown className="w-5 h-5 text-slate-400" />}
                </button>

                {expandido === centro.id && (
                  <div className="px-6 pb-5 border-t border-slate-200 pt-4 bg-white">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5" /> Ubicaciones dependientes
                    </p>
                    <div className="space-y-2 mb-4">
                      {(centro.sucursales || []).length === 0 ? (
                        <p className="text-sm text-slate-400 italic">Sin ubicaciones registradas</p>
                      ) : (
                        centro.sucursales.map(s => (
                          <div key={s} className="flex items-center justify-between bg-slate-50 rounded-xl px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <MapPin className="w-3.5 h-3.5 text-slate-400" />
                              <span className="text-sm text-slate-700">{s}</span>
                            </div>
                            <button onClick={() => handleRemoveSucursal(centro, s)} className="text-slate-300 hover:text-red-500 transition-colors">
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="mt-5 border-t border-slate-100 pt-4">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5" /> Correos para notificaciones
                      </p>
                      <div className="space-y-2 mb-3">
                        {(centro.emails_contacto || []).length === 0 ? (
                          <p className="text-sm text-slate-400 italic">Sin correos registrados</p>
                        ) : (
                          centro.emails_contacto.map(email => (
                            <div key={email} className="flex items-center justify-between bg-blue-50 border border-blue-100 rounded-xl px-4 py-2.5">
                              <div className="flex items-center gap-2">
                                <Mail className="w-3.5 h-3.5 text-blue-400" />
                                <span className="text-sm text-blue-800">{email}</span>
                              </div>
                              <button onClick={() => handleRemoveEmail(centro, email)} className="text-blue-300 hover:text-red-500 transition-colors">
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="email"
                          className="flex-1 border border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-slate-50"
                          placeholder="correo@ejemplo.com"
                          value={nuevoEmail[centro.id] || ''}
                          onChange={e => setNuevoEmail(p => ({ ...p, [centro.id]: e.target.value }))}
                          onKeyDown={e => e.key === 'Enter' && handleAddEmail(centro)}
                        />
                        <button
                          onClick={() => handleAddEmail(centro)}
                          disabled={saving === centro.id + '_email' || !nuevoEmail[centro.id]?.trim()}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
                          style={{ background: '#1565c0' }}
                        >
                          {saving === centro.id + '_email' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                          Agregar
                        </button>
                      </div>
                    </div>

                    <div className="flex gap-2 mt-4">
                      <input
                        className="flex-1 border border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-slate-50"
                        placeholder="Ej: Posta Tralcapulli, Estación Médica..."
                        value={nuevoLugar[centro.id] || ""}
                        onChange={e => setNuevoLugar(p => ({ ...p, [centro.id]: e.target.value }))}
                        onKeyDown={e => e.key === "Enter" && handleAddSucursal(centro)}
                      />
                      <button
                        onClick={() => handleAddSucursal(centro)}
                        disabled={saving === centro.id || !nuevoLugar[centro.id]?.trim()}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-60 transition-colors"
                        style={{ background: "#3b82f6" }}
                      >
                        {saving === centro.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                        Agregar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-400 text-center mt-6">
            Los 5 centros principales están fijos. Solo puedes agregar o quitar ubicaciones dependientes.
          </p>
        </div>
      </div>
    </div>
  );
}