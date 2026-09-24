import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Truck, Monitor } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { buscarEquipos } from "@/lib/buscarEquipos";
import { getNavItemsForRole } from "@/lib/navPermissions";
import { esVehiculo } from "@/lib/centros";

// Buscar un equipo o vehículo desde cualquier pantalla y abrir su ficha, sin
// pasar por la lista y sus filtros. Ctrl+K (o ⌘K) lleva el cursor acá.
//
// La ficha se abre en la pantalla que ese rol ya tiene: Equipos (Salud) o
// Vehículos (Movilización). Si el rol no tiene ninguna de las dos, el buscador
// no aparece — no tendría dónde mostrar lo que encuentra.

// Los equipos se piden una vez y se reusan entre el menú de escritorio y el
// del celular. Se refrescan si pasaron más de 2 minutos.
let cache = { en: 0, equipos: [] };
async function cargarEquipos() {
  if (Date.now() - cache.en < 120000 && cache.equipos.length) return cache.equipos;
  let equipos;
  try {
    const r = await base44.functions.invoke("getEquiposPorCentro");
    equipos = r?.data?.equipos || [];
  } catch {
    equipos = await base44.entities.Equipo.list("-updated_date", 500).catch(() => []);
  }
  cache = { en: Date.now(), equipos: equipos.filter(e => e.activo !== false) };
  return cache.equipos;
}

export function destinoDeFicha(role, equipo) {
  const paginas = new Set(getNavItemsForRole(role).map(i => i.page));
  if (paginas.has("Equipos2")) return `/Equipos2?abrir=${encodeURIComponent(equipo.id)}`;
  if (paginas.has("Flota") && esVehiculo(equipo.tipo)) return `/Flota?abrir=${encodeURIComponent(equipo.id)}`;
  return null;
}

export const rolPuedeBuscar = (role) => {
  const paginas = new Set(getNavItemsForRole(role).map(i => i.page));
  return paginas.has("Equipos2") || paginas.has("Flota");
};

export default function BuscadorEquipos({ role, onElegido, atajo = false }) {
  const navigate = useNavigate();
  const [texto, setTexto] = useState("");
  const [equipos, setEquipos] = useState(cache.equipos);
  const [abierto, setAbierto] = useState(false);
  const [marcado, setMarcado] = useState(0);
  const inputRef = useRef(null);

  const resultados = useMemo(
    () => buscarEquipos(equipos, texto).filter(e => destinoDeFicha(role, e)),
    [equipos, texto, role],
  );

  // Ctrl+K / ⌘K. Solo una instancia lo escucha (la del menú de escritorio).
  useEffect(() => {
    if (!atajo) return undefined;
    const fn = (ev) => {
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "k") {
        ev.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [atajo]);

  if (!rolPuedeBuscar(role)) return null;

  const alEnfocar = () => {
    setAbierto(true);
    cargarEquipos().then(setEquipos).catch(() => {});
  };

  const elegir = (e) => {
    const destino = destinoDeFicha(role, e);
    if (!destino) return;
    setTexto("");
    setAbierto(false);
    inputRef.current?.blur();
    onElegido?.();
    navigate(destino);
  };

  const alTeclear = (ev) => {
    if (ev.key === "ArrowDown") { ev.preventDefault(); setMarcado(m => Math.min(m + 1, resultados.length - 1)); }
    else if (ev.key === "ArrowUp") { ev.preventDefault(); setMarcado(m => Math.max(m - 1, 0)); }
    else if (ev.key === "Enter" && resultados[marcado]) { ev.preventDefault(); elegir(resultados[marcado]); }
    else if (ev.key === "Escape") { setTexto(""); inputRef.current?.blur(); }
  };

  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: "rgba(255,255,255,0.15)" }}>
        <Search className="w-4 h-4 text-white/80 flex-shrink-0" />
        <input
          ref={inputRef}
          value={texto}
          onChange={e => { setTexto(e.target.value); setMarcado(0); }}
          onFocus={alEnfocar}
          onBlur={() => setTimeout(() => setAbierto(false), 150)}
          onKeyDown={alTeclear}
          placeholder="Patente o inventario…"
          aria-label="Buscar equipo o vehículo por patente, inventario o modelo"
          title={atajo ? "Buscar equipo o vehículo (Ctrl+K)" : undefined}
          className="flex-1 min-w-0 bg-transparent text-sm text-white placeholder-white/70 outline-none"
        />
      </div>

      {abierto && texto.trim().length >= 2 && (
        <div className="absolute left-0 right-0 mt-1 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden z-50">
          {resultados.length === 0 ? (
            <p className="px-3 py-3 text-xs text-slate-500">No hay equipos con “{texto.trim()}”.</p>
          ) : resultados.map((e, i) => {
            const Icono = esVehiculo(e.tipo) ? Truck : Monitor;
            const codigo = e.patente || e.numero_inventario || e.numero_serie || "";
            return (
              <button key={e.id} type="button"
                onMouseDown={ev => { ev.preventDefault(); elegir(e); }}
                onMouseEnter={() => setMarcado(i)}
                className={`w-full text-left px-3 py-2 flex items-center gap-2 ${i === marcado ? "bg-blue-50" : ""}`}>
                <Icono className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-slate-800 truncate">{e.marca} {e.modelo}</span>
                  <span className="block text-[11px] text-slate-500 truncate">
                    {[codigo, e.centro_principal].filter(Boolean).join(" · ")}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
