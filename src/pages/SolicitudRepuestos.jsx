import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Package } from "lucide-react";
import SolicitudRepuestoModule from "@/components/taller/SolicitudRepuestoModule";
import { useAuth } from "@/lib/AuthContext";

export default function SolicitudRepuestos() {
  const { user } = useAuth();
  const [ordenesActivas, setOrdenesActivas] = useState([]);

  useEffect(() => {
    if (!user?.email) return;
    base44.entities.OrdenTrabajo.list("-created_date", 100)
      .then((list) => setOrdenesActivas(
        list.filter((o) => o.mecanico_email === user.email &&
          ["pendiente", "asignada", "en_proceso", "pausada"].includes(o.estado))
      ))
      .catch(() => {});
  }, [user]);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="relative overflow-hidden px-4 lg:px-10 pt-6 lg:pt-12 pb-6 lg:pb-8"
        style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e293b 40%, #334155 100%)" }}>
        <div className="relative max-w-6xl mx-auto flex items-center gap-3">
          <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(255,255,255,0.15)" }}>
            <Package className="w-5 h-5 lg:w-6 lg:h-6 text-white" />
          </div>
          <div>
            <p className="text-amber-300 text-[10px] lg:text-xs font-semibold uppercase tracking-widest hidden sm:block">Módulo de Taller Mecánico</p>
            <h1 className="text-xl lg:text-4xl font-bold text-white leading-tight">Solicitud de Repuestos</h1>
            <p className="text-slate-300 text-xs lg:text-sm mt-0.5">Pide repuestos al Jefe de Taller y sigue su aprobación</p>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 lg:px-10 mt-4 lg:mt-6 pb-10">
        <SolicitudRepuestoModule
          user={user}
          ordenesActivas={ordenesActivas}
          requiereOT={user?.role === "mecanico"}
        />
      </div>
    </div>
  );
}