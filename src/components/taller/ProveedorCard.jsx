import { useState } from "react";
import { Building2, Phone, Mail, MapPin, Globe, Pencil, Trash2, ShoppingCart } from "lucide-react";

const RUBRO_CFG = {
  repuestos: { color: "#2563EB", bg: "#EFF6FF" },
  neumaticos: { color: "#7C3AED", bg: "#F5F3FF" },
  lubricantes: { color: "#D97706", bg: "#FFFBEB" },
  servicio_tecnico: { color: "#0891B2", bg: "#ECFEFF" },
  otros: { color: "#64748B", bg: "#F1F5F9" },
};

export default function ProveedorCard({ proveedor, onEditar, onDelete, onNotificar, onHistorial }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const cfg = RUBRO_CFG[proveedor.rubro] || RUBRO_CFG.otros;

  return (
    <div className="bg-white rounded-2xl p-4 transition-all" style={{ border: `1px solid ${proveedor.activo === false ? "#FECACA" : "#E2E8F0"}`, boxShadow: "0 2px 8px rgba(15,45,107,0.05)" }}>
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: cfg.bg }}>
          <Building2 className="w-5 h-5" style={{ color: cfg.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-bold text-slate-800 text-sm truncate">{proveedor.nombre}</p>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: cfg.bg, color: cfg.color }}>
              {proveedor.rubro}
            </span>
            {proveedor.activo === false && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-600">Inactivo</span>
            )}
          </div>
          {proveedor.rut && <p className="text-xs text-slate-400 mt-0.5">RUT: {proveedor.rut}</p>}
          <div className="mt-2 space-y-1">
            {proveedor.contacto_nombre && <p className="text-xs text-slate-600">{proveedor.contacto_nombre}</p>}
            {proveedor.telefono && (
              <a href={`tel:${proveedor.telefono}`} className="text-xs text-slate-600 flex items-center gap-1.5 hover:text-blue-600">
                <Phone className="w-3 h-3" /> {proveedor.telefono}
              </a>
            )}
            {proveedor.email && (
              <a href={`mailto:${proveedor.email}`} className="text-xs text-slate-600 flex items-center gap-1.5 hover:text-blue-600 truncate">
                <Mail className="w-3 h-3" /> {proveedor.email}
              </a>
            )}
            {(proveedor.direccion || proveedor.ciudad) && (
              <p className="text-xs text-slate-400 flex items-center gap-1.5">
                <MapPin className="w-3 h-3" /> {[proveedor.direccion, proveedor.ciudad].filter(Boolean).join(", ")}
              </p>
            )}
            {proveedor.web && (
              <a href={proveedor.web.startsWith("http") ? proveedor.web : `https://${proveedor.web}`} target="_blank" rel="noreferrer"
                className="text-xs text-blue-600 flex items-center gap-1.5 hover:underline truncate">
                <Globe className="w-3 h-3" /> {proveedor.web}
              </a>
            )}
          </div>
        </div>
      </div>
      <div className="flex gap-2 mt-3 pt-3 border-t border-slate-100">
        {onHistorial && (
          <button onClick={() => onHistorial(proveedor)} className="flex-1 py-2 rounded-xl text-xs font-bold text-violet-600 flex items-center justify-center gap-1.5" style={{ background: "#F5F3FF" }}>
            <ShoppingCart className="w-3.5 h-3.5" /> Historial
          </button>
        )}
        <button onClick={() => onEditar(proveedor)} className="flex-1 py-2 rounded-xl text-xs font-bold text-blue-600 flex items-center justify-center gap-1.5" style={{ background: "#EFF6FF" }}>
          <Pencil className="w-3.5 h-3.5" /> Editar
        </button>
        {confirmDelete ? (
          <>
            <button onClick={() => onDelete(proveedor)} className="flex-1 py-2 rounded-xl text-xs font-bold text-white" style={{ background: "#DC2626" }}>Confirmar</button>
            <button onClick={() => setConfirmDelete(false)} className="flex-1 py-2 rounded-xl text-xs font-bold bg-slate-100 text-slate-600">Cancelar</button>
          </>
        ) : (
          <button onClick={() => setConfirmDelete(true)} className="flex-1 py-2 rounded-xl text-xs font-bold text-red-600 flex items-center justify-center gap-1.5" style={{ background: "#FEF2F2" }}>
            <Trash2 className="w-3.5 h-3.5" /> Eliminar
          </button>
        )}
      </div>
    </div>
  );
}