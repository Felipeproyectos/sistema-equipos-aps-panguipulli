import { useEffect, useRef } from "react";

const INACTIVITY_LIMIT = 5 * 60 * 1000; // 5 minutos sin actividad
const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "click"];

// Cierra la sesión automáticamente tras 5 minutos sin actividad del usuario.
// Cualquier interacción (mouse, teclado, scroll, touch) reinicia el contador.
export default function useInactivityLogout(onTimeout) {
  const timerRef = useRef(null);
  const lastReset = useRef(0);
  const cbRef = useRef(onTimeout);
  cbRef.current = onTimeout;

  useEffect(() => {
    const reset = () => {
      // Throttle ligero: no reiniciar más de una vez por segundo
      const now = Date.now();
      if (now - lastReset.current < 1000) return;
      lastReset.current = now;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => cbRef.current?.(), INACTIVITY_LIMIT);
    };

    reset();
    ACTIVITY_EVENTS.forEach(ev => window.addEventListener(ev, reset, { passive: true }));
    return () => {
      ACTIVITY_EVENTS.forEach(ev => window.removeEventListener(ev, reset));
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);
}