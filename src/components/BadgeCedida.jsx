import { ArrowLeftRight } from "lucide-react";

// El distintivo de una ambulancia cedida (prestada) a otro centro: la palabra
// CEDIDA bien visible y, al lado, a quién o por quién. Mismo aspecto en la
// lista de equipos, la ficha y Revisión Bitácora, para reconocerla de un
// vistazo. Ver src/lib/prestamoEquipo.js.
export default function BadgeCedida({ detalle, className = "" }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full text-xs font-semibold whitespace-nowrap ${className}`}
      style={{ background: "#FEF3C7", color: "#92400E", border: "1px solid #FCD34D", padding: "2px 8px 2px 2px" }}>
      <span className="inline-flex items-center gap-1 rounded-full font-extrabold tracking-wider text-white"
        style={{ background: "#D97706", padding: "1px 7px", fontSize: 11 }}>
        <ArrowLeftRight className="w-3 h-3" /> CEDIDA
      </span>
      {detalle && <span className="truncate">{detalle}</span>}
    </span>
  );
}
