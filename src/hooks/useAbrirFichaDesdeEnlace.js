import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

// `?abrir=<id>` en la URL abre la ficha de ese equipo apenas la lista está
// cargada. Lo usa el buscador del menú (components/BuscadorEquipos.jsx) para
// llevar directo a la ficha, y sirve igual para un enlace pegado en un correo.
// El parámetro se quita al abrir, para que cerrar la ficha no la reabra.
export default function useAbrirFichaDesdeEnlace(equipos, abrir) {
  const [params, setParams] = useSearchParams();
  const id = params.get("abrir");

  useEffect(() => {
    if (!id || !equipos.length) return;
    const eq = equipos.find(e => e.id === id);
    if (eq) abrir(eq);
    const resto = new URLSearchParams(params);
    resto.delete("abrir");
    setParams(resto, { replace: true });
  }, [id, equipos, abrir, params, setParams]);
}
