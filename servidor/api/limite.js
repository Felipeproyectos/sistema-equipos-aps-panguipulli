// Contador por ventana fija, en memoria.
//
// ponytail: en memoria y no en la base porque el servidor corre en UNA
// instancia de Railway. Si algún día se escala a varias, cada una contaría por
// su lado (el límite real se multiplicaría por el número de instancias) y
// habría que llevarlo a un almacén compartido.

export function crearLimitador({ ventanaMs, ahora = Date.now }) {
  const cubetas = new Map();
  let usos = 0;

  // Sin esto el mapa crece con cada IP que pasó alguna vez.
  function barrer(t) {
    for (const [clave, c] of cubetas) if (t - c.inicio >= ventanaMs) cubetas.delete(clave);
  }

  function vigente(clave, t) {
    const c = cubetas.get(clave);
    return c && t - c.inicio < ventanaMs ? c : null;
  }

  const segundosHastaReinicio = (c, t) => Math.max(1, Math.ceil((c.inicio + ventanaMs - t) / 1000));

  return {
    /** Anota un uso y dice si todavía cabe dentro de `maximo`. */
    contar(clave, maximo) {
      const t = ahora();
      if (++usos % 500 === 0) barrer(t);
      let c = vigente(clave, t);
      if (!c) {
        c = { inicio: t, cuenta: 0 };
        cubetas.set(clave, c);
      }
      c.cuenta += 1;
      return {
        permitido: c.cuenta <= maximo,
        restantes: Math.max(0, maximo - c.cuenta),
        reinicio: segundosHastaReinicio(c, t),
      };
    },

    /** Mira sin anotar: ¿ya llegó a `maximo` en esta ventana? */
    agotado(clave, maximo) {
      const t = ahora();
      const c = vigente(clave, t);
      return c && c.cuenta >= maximo ? { reinicio: segundosHastaReinicio(c, t) } : null;
    },

    tamano: () => cubetas.size,
  };
}
