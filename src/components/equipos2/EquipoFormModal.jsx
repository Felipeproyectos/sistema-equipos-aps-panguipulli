import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { X, Upload, Loader2 } from "lucide-react";
import { getCentrosEstructura, TIPOS_EQUIPO, ESTADOS_EQUIPO } from "@/lib/centros";

export default function EquipoFormModal({ equipo, onClose, onSaved, user }) {
  // Pueden elegir cualquier centro: super_admin y admin. El encargado de salud
  // queda fijo a su centro (solo lectura). Antes solo se permitía a "admin",
  // lo que dejaba el campo en blanco para super_admin y encargado_salud.
  const puedeElegirCentro = user?.role === "super_admin" || user?.role === "admin";
  const centroFijoUsuario = user?.centro_principal || user?.centro_asignado || user?.centro || "";
  const [centrosEstructura, setCentrosEstructura] = useState([]);
  const [form, setForm] = useState({
    numero_inventario: "", tipo: "dea", marca: "", modelo: "", numero_serie: "",
    anio_adquisicion: new Date().getFullYear(), estado: "operativo",
    centro_principal: puedeElegirCentro ? "" : centroFijoUsuario,
    subsede: "", ubicacion_especifica: "", fecha_vencimiento_bateria: "",
    patente: "", valor: "", notas: "",
    conductor_responsable: "",
    estado_neumaticos: "ok", estado_luces: "ok", estado_bateria_vehiculo: "ok", estado_sirena: "ok",
    estado_revision_tecnica: "ok", fecha_vencimiento_revision_tecnica: "",
    estado_permiso_circulacion: "ok", fecha_vencimiento_permiso_circulacion: ""
  });
  const [saving, setSaving] = useState(false);
  const [uploadingFoto, setUploadingFoto] = useState(false);

  useEffect(() => {
    getCentrosEstructura().then(setCentrosEstructura);
    if (equipo) {
      setForm({ ...equipo, valor: equipo.valor || "", anio_adquisicion: equipo.anio_adquisicion || new Date().getFullYear() });
    }
  }, [equipo]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const inputCls = "w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300";
  const selectCls = "w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300";

  const centroData = centrosEstructura.find(c => c.nombre === form.centro_principal);
  const subsedes = centroData?.subsedes || [];

  const handleFotoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingFoto(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    set("foto_url", file_url);
    setUploadingFoto(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const data = { ...form, valor: form.valor ? Number(form.valor) : undefined, anio_adquisicion: Number(form.anio_adquisicion) };
    if (equipo?.id) {
      await base44.entities.Equipo.update(equipo.id, data);
    } else {
      await base44.entities.Equipo.create(data);
    }
    setSaving(false);
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="px-7 pt-7 pb-4 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
          <h2 className="text-lg font-bold text-slate-900">{equipo ? "Editar Equipo" : "Nuevo Equipo"}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-slate-400 hover:text-slate-700" /></button>
        </div>
        <form onSubmit={handleSubmit} className="px-7 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">N° Inventario *</label>
              <input required className={inputCls} value={form.numero_inventario} onChange={e => set("numero_inventario", e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">Tipo de Equipo *</label>
              <select required className={selectCls} value={form.tipo} onChange={e => set("tipo", e.target.value)}>
                {TIPOS_EQUIPO.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">Marca *</label>
              <input required className={inputCls} value={form.marca} onChange={e => set("marca", e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">Modelo *</label>
              <input required className={inputCls} value={form.modelo} onChange={e => set("modelo", e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">N° de Serie</label>
              <input className={inputCls} value={form.numero_serie} onChange={e => set("numero_serie", e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">Estado *</label>
              <select required className={selectCls} value={form.estado} onChange={e => set("estado", e.target.value)}>
                {ESTADOS_EQUIPO.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">Centro Principal *</label>
              {puedeElegirCentro ? (
                <select required className={selectCls} value={form.centro_principal} onChange={e => { set("centro_principal", e.target.value); set("subsede", ""); }}>
                  <option value="">Seleccionar...</option>
                  {centrosEstructura.map(c => <option key={c.nombre} value={c.nombre}>{c.nombre}</option>)}
                </select>
              ) : (
                <input readOnly className="w-full border border-slate-100 bg-slate-50 rounded-xl px-3 py-2 text-sm text-slate-900" value={form.centro_principal} />
              )}
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">Subsede</label>
              <select className={selectCls} value={form.subsede} onChange={e => set("subsede", e.target.value)} disabled={subsedes.length === 0}>
                <option value="">Sin subsede</option>
                {subsedes.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Ubicación Específica</label>
            <input className={inputCls} placeholder="Ej: Sala de Urgencias, Morbilidad..." value={form.ubicacion_especifica} onChange={e => set("ubicacion_especifica", e.target.value)} />
          </div>

          {form.tipo === "ambulancia" && (<>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">Patente</label>
                <input className={inputCls} value={form.patente} onChange={e => set("patente", e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">Conductor Responsable</label>
                <input className={inputCls} placeholder="Nombre del conductor..." value={form.conductor_responsable} onChange={e => set("conductor_responsable", e.target.value)} />
              </div>
            </div>

            <div className="border border-slate-200 rounded-2xl p-4 space-y-3">
              <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">Estado del Vehículo</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">Neumáticos</label>
                  <select className={selectCls} value={form.estado_neumaticos} onChange={e => set("estado_neumaticos", e.target.value)}>
                    <option value="ok">OK</option>
                    <option value="desgastado">Desgastado</option>
                    <option value="requiere_cambio">Requiere Cambio</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">Luces</label>
                  <select className={selectCls} value={form.estado_luces} onChange={e => set("estado_luces", e.target.value)}>
                    <option value="ok">OK</option>
                    <option value="falla_leve">Falla Leve</option>
                    <option value="falla_grave">Falla Grave</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">Batería Vehículo</label>
                  <select className={selectCls} value={form.estado_bateria_vehiculo} onChange={e => set("estado_bateria_vehiculo", e.target.value)}>
                    <option value="ok">OK</option>
                    <option value="baja_carga">Baja Carga</option>
                    <option value="requiere_reemplazo">Requiere Reemplazo</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">Sirena</label>
                  <select className={selectCls} value={form.estado_sirena} onChange={e => set("estado_sirena", e.target.value)}>
                    <option value="ok">OK</option>
                    <option value="falla_leve">Falla Leve</option>
                    <option value="falla_grave">Falla Grave</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1 border-t border-slate-100">
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">Revisión Técnica</label>
                  <select className={selectCls} value={form.estado_revision_tecnica} onChange={e => set("estado_revision_tecnica", e.target.value)}>
                    <option value="ok">OK</option>
                    <option value="en_gestion">En Gestión</option>
                    <option value="pendiente">Pendiente</option>
                    <option value="vencida">Vencida</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">Vencimiento Rev. Técnica</label>
                  <input type="date" className={inputCls} value={form.fecha_vencimiento_revision_tecnica} onChange={e => set("fecha_vencimiento_revision_tecnica", e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">Permiso Circulación</label>
                  <select className={selectCls} value={form.estado_permiso_circulacion} onChange={e => set("estado_permiso_circulacion", e.target.value)}>
                    <option value="ok">OK</option>
                    <option value="en_gestion">En Gestión</option>
                    <option value="pendiente">Pendiente</option>
                    <option value="vencido">Vencido</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">Vencimiento Permiso</label>
                  <input type="date" className={inputCls} value={form.fecha_vencimiento_permiso_circulacion} onChange={e => set("fecha_vencimiento_permiso_circulacion", e.target.value)} />
                </div>
              </div>
            </div>
          </>)}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">Año Adquisición</label>
              <input type="number" className={inputCls} value={form.anio_adquisicion} onChange={e => set("anio_adquisicion", e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">Fecha de Fabricación</label>
              <input type="date" className={inputCls} value={form.fecha_fabricacion || ""} onChange={e => set("fecha_fabricacion", e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">Proveedor</label>
              <input className={inputCls} placeholder="Empresa o persona que vendió el equipo..." value={form.proveedor || ""} onChange={e => set("proveedor", e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">País de Origen</label>
              <input className={inputCls} placeholder="Ej: Estados Unidos, Alemania..." value={form.pais_origen || ""} onChange={e => set("pais_origen", e.target.value)} />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Notas</label>
            <textarea rows={3} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300" value={form.notas} onChange={e => set("notas", e.target.value)} />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Foto del Equipo</label>
            <label className="flex items-center gap-2 cursor-pointer border-2 border-dashed border-slate-200 rounded-xl p-3 hover:border-blue-300 transition-colors">
              <Upload className="w-4 h-4 text-slate-400" />
              <span className="text-sm text-slate-500">{uploadingFoto ? "Subiendo..." : form.foto_url ? "Cambiar foto" : "Subir foto"}</span>
              <input type="file" accept="image/*" className="hidden" onChange={handleFotoUpload} disabled={uploadingFoto} />
            </label>
            {form.foto_url && <img src={form.foto_url} alt="foto" className="mt-2 h-24 rounded-xl object-cover" />}
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-medium text-slate-600 border border-slate-200 hover:bg-slate-50">Cancelar</button>
            <button type="submit" disabled={saving} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60" style={{ background: "linear-gradient(135deg, #1565c0, #0288d1)" }}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {saving ? "Guardando..." : "Guardar Equipo"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}