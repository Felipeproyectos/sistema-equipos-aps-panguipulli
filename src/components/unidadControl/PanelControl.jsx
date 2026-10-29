import { useState } from "react";
import { Fuel, Wallet, Route, Gauge, TrendingUp, Users, MapPin, Truck, Receipt, Droplets, CircleDollarSign, CalendarRange } from "lucide-react";
import { ORDENES_VEHICULO, ordenarVehiculos, pesos, litrosTexto, numeroTexto } from "@/lib/unidadControl";

// El panel de la Unidad de Control: cuánto se gastó, quién consumió más,
// cuántas salidas y kilómetros, y cuánto cuesta cada kilómetro. Los números
// salen de panel() (src/lib/unidadControl.js) con los filtros de la página.

const sombra = { boxShadow: "0 4px 20px rgba(15,45,107,0.06)" };
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const mesTexto = (m) => { const [y, mm] = String(m || "").split("-"); return mm ? `${MESES[Number(mm) - 1]} ${y}` : "Sin fecha"; };
const kmL = (n) => (n === null || n === undefined ? "—" : `${numeroTexto(n, 1)} km/L`);
const porKm = (n) => (n === null || n === undefined ? "—" : `${pesos(n)}/km`);

export default function PanelControl({ datos, onAbrir, children }) {
  const [orden, setOrden] = useState("total");
  const k = datos.kpis;
  const v = datos.vehiculos;
  const mayor = (clave, filtro = () => true) => ordenarVehiculos(v.filter(filtro).filter(x => x[clave] !== null && x[clave] > 0), clave)[0];
  const destacados = [
    { titulo: "Mayor consumo", icono: Droplets, fila: mayor("litros"), valor: (f) => litrosTexto(f.litros), sub: (f) => pesos(f.combustible) },
    { titulo: "Mayor gasto total", icono: CircleDollarSign, fila: mayor("total"), valor: (f) => pesos(f.total), sub: (f) => `${pesos(f.combustible)} comb. · ${pesos(f.pagos)} pagos` },
    { titulo: "Más kilómetros", icono: Route, fila: mayor("km"), valor: (f) => `${numeroTexto(f.km)} km`, sub: (f) => `según ${f.fuenteKm}` },
    { titulo: "Más salidas", icono: Truck, fila: mayor("salidas"), valor: (f) => `${f.salidas} salidas`, sub: (f) => (f.km ? `${numeroTexto(f.km)} km` : "") },
    { titulo: "Costo por km más alto", icono: Receipt, fila: mayor("costoKm"), valor: (f) => porKm(f.costoKm), sub: (f) => `${pesos(f.total)} en ${numeroTexto(f.km)} km` },
    { titulo: "Peor rendimiento", icono: Gauge, fila: ordenarVehiculos(v.filter(x => x.rendimiento !== null), "rendimiento")[0], valor: (f) => kmL(f.rendimiento), sub: (f) => `${litrosTexto(f.litros)} en ${numeroTexto(f.km)} km` },
  ];
  const tabla = ordenarVehiculos(v, orden);
  const maxMes = Math.max(...datos.meses.map(m => m.combustible + m.pagos), 1);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { icono: Wallet, v: pesos(k.total), e: "gasto total", c: "combustible + pagos hechos" },
          { icono: Fuel, v: pesos(k.combustible), e: "en combustible", c: `${litrosTexto(k.litros)} · ${k.cargas} cargas` },
          { icono: Receipt, v: pesos(k.pagos), e: "en pagos y gastos", c: "permisos, seguros, mantención, otros" },
          { icono: Route, v: `${numeroTexto(k.km)} km`, e: "recorridos", c: `${k.salidas} salidas registradas` },
          { icono: TrendingUp, v: porKm(k.costoKm), e: "costo por kilómetro", c: "gasto total ÷ km recorridos" },
          { icono: Gauge, v: kmL(k.rendimiento), e: "rendimiento de la flota", c: "según el odómetro de cada carga" },
          { icono: Droplets, v: k.precioLitro ? pesos(k.precioLitro) : "—", e: "precio promedio del litro", c: "lo pagado ÷ litros cargados" },
          { icono: Truck, v: k.vehiculosActivos, e: "vehículos con movimiento", c: "con cargas o salidas" },
        ].map((x, i) => (
          <div key={i} className="bg-white rounded-2xl p-4" style={sombra}>
            <x.icono className="w-4 h-4 text-teal-700 mb-1" />
            <p className="text-xl lg:text-2xl font-bold text-slate-800">{x.v}</p>
            <p className="text-xs text-slate-600 font-medium">{x.e}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">{x.c}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {destacados.map(d => (
          <button key={d.titulo} type="button" disabled={!d.fila} onClick={() => d.fila && onAbrir(d.fila.equipo_id)}
            className="text-left bg-white rounded-2xl p-4 border border-transparent hover:border-teal-200 disabled:hover:border-transparent" style={sombra}>
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-teal-700"><d.icono className="w-3.5 h-3.5" /> {d.titulo}</p>
            {d.fila ? (
              <>
                <p className="text-sm font-semibold text-slate-800 mt-1 truncate">{d.fila.vehiculo}</p>
                <p className="text-lg font-bold text-slate-900">{d.valor(d.fila)}</p>
                <p className="text-[11px] text-slate-400 truncate">{[d.sub(d.fila), d.fila.centro].filter(Boolean).join(" · ")}</p>
              </>
            ) : <p className="text-sm text-slate-400 mt-1">Sin datos en el período</p>}
          </button>
        ))}
      </div>

      <Caja titulo="Ranking de vehículos" icono={Truck} extra={
        <select value={orden} onChange={e => setOrden(e.target.value)} aria-label="Ordenar por"
          className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs">
          {ORDENES_VEHICULO.map(o => <option key={o.clave} value={o.clave}>Ordenar: {o.label}</option>)}
        </select>
      }>
        {tabla.length === 0 ? <p className="text-sm text-slate-400">Sin cargas, pagos ni salidas en este período.</p> : (
          <div className="overflow-x-auto -mx-5">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-[11px] text-slate-500 uppercase">
                <tr>
                  <th className="text-left px-3 py-2">#</th><th className="text-left px-3 py-2">Vehículo</th>
                  <th className="text-right px-3 py-2">Salidas</th><th className="text-right px-3 py-2">Km</th><th className="text-right px-3 py-2">Litros</th>
                  <th className="text-right px-3 py-2">km/L</th><th className="text-right px-3 py-2">Combustible</th><th className="text-right px-3 py-2">Pagos</th>
                  <th className="text-right px-3 py-2">Total</th><th className="text-right px-3 py-2">$/km</th>
                </tr>
              </thead>
              <tbody>
                {tabla.map((f, i) => (
                  <tr key={f.equipo_id || i} onClick={() => f.equipo_id && onAbrir(f.equipo_id)} className="border-t border-slate-100 hover:bg-teal-50/40 cursor-pointer">
                    <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                    <td className="px-3 py-2"><p className="font-semibold text-slate-800 whitespace-nowrap">{f.vehiculo}</p><p className="text-[11px] text-slate-400">{f.centro}</p></td>
                    <td className="px-3 py-2 text-right">{f.salidas || "—"}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap" title={f.fuenteKm ? `Según ${f.fuenteKm}` : ""}>{f.km ? numeroTexto(f.km) : "—"}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">{f.litros ? numeroTexto(f.litros, 1) : "—"}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">{f.rendimiento ? numeroTexto(f.rendimiento, 1) : "—"}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">{pesos(f.combustible)}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">{pesos(f.pagos)}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap font-bold text-slate-900">{pesos(f.total)}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">{f.costoKm ? pesos(f.costoKm) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[11px] text-slate-400 mt-2">Los km salen de la bitácora de salidas; si el vehículo no tiene salidas, de la diferencia de odómetro entre su primera y última carga del período. Toca un vehículo para ver su ficha.</p>
      </Caja>

      <div className="grid lg:grid-cols-2 gap-4">
        <Caja titulo="Gasto por mes" icono={CalendarRange}>
          {datos.meses.length === 0 ? <p className="text-sm text-slate-400">Sin registros en este período.</p> : (
            <ul className="space-y-2">
              {[...datos.meses].reverse().slice(0, 12).map(m => (
                <li key={m.mes}>
                  <div className="flex justify-between gap-2 text-xs">
                    <span className="text-slate-700 capitalize">{mesTexto(m.mes)}</span>
                    <span className="font-semibold text-slate-800">{pesos(m.combustible + m.pagos)}
                      <span className="text-slate-400 font-normal"> · {litrosTexto(m.litros)}{m.km ? ` · ${numeroTexto(m.km)} km` : ""}{m.salidas ? ` · ${m.salidas} salidas` : ""}</span></span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 mt-1 flex overflow-hidden">
                    <div style={{ width: `${(m.combustible / maxMes) * 100}%`, background: "#0f766e" }} title={`Combustible ${pesos(m.combustible)}`} />
                    <div style={{ width: `${(m.pagos / maxMes) * 100}%`, background: "#5eead4" }} title={`Pagos ${pesos(m.pagos)}`} />
                  </div>
                </li>
              ))}
              <Leyenda />
            </ul>
          )}
        </Caja>
        {children}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Caja titulo="Conductores" icono={Users}>
          {datos.conductores.length === 0 ? <p className="text-sm text-slate-400">Sin conductores registrados en cargas ni salidas.</p> : (
            <ul className="divide-y divide-slate-100 text-xs">
              {datos.conductores.slice(0, 10).map(c => (
                <li key={c.nombre} className="py-1.5">
                  <p className="text-slate-700 font-medium truncate">{c.nombre}</p>
                  <p className="text-slate-500">
                    {[c.litros ? litrosTexto(c.litros) : "", c.monto ? pesos(c.monto) : "", c.cargas ? `${c.cargas} cargas` : "", c.salidas ? `${c.salidas} salidas` : "", c.km ? `${numeroTexto(c.km)} km` : ""].filter(Boolean).join(" · ")}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Caja>
        <Caja titulo="Destinos más frecuentes" icono={MapPin}>
          {datos.destinos.length === 0 ? <p className="text-sm text-slate-400">Sin salidas en este período.</p> : (
            <ul className="divide-y divide-slate-100 text-xs">
              {datos.destinos.slice(0, 10).map(d => (
                <li key={d.destino} className="py-1.5 flex justify-between gap-2"><span className="text-slate-700 truncate">{d.destino}</span><strong className="text-slate-800">{d.n}</strong></li>
              ))}
            </ul>
          )}
        </Caja>
        <Caja titulo="Por tipo de combustible" icono={Fuel}>
          {datos.combustibles.length === 0 ? <p className="text-sm text-slate-400">Sin cargas en este período.</p> : (
            <ul className="divide-y divide-slate-100 text-xs">
              {datos.combustibles.map(c => (
                <li key={c.clave} className="py-1.5 flex justify-between gap-2"><span className="text-slate-700">{c.clave}</span>
                  <span><strong className="text-slate-800">{litrosTexto(c.litros)}</strong><span className="text-slate-400"> · {pesos(c.monto)}{c.litros ? ` · ${pesos(c.monto / c.litros)}/L` : ""}</span></span></li>
              ))}
            </ul>
          )}
        </Caja>
      </div>
    </div>
  );
}

export function Caja({ titulo, icono: Icono, extra, children }) {
  return (
    <div className="bg-white rounded-2xl p-5" style={sombra}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-700"><Icono className="w-4 h-4 text-teal-700" /> {titulo}</h3>
        {extra}
      </div>
      {children}
    </div>
  );
}

export function Leyenda() {
  return (
    <li className="flex gap-3 text-[11px] text-slate-500 pt-1">
      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: "#0f766e" }} /> Combustible</span>
      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: "#5eead4" }} /> Pagos</span>
    </li>
  );
}
