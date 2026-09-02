import { useEffect, useRef, useState } from "react";

export default function usePullToRefresh(onRefresh, containerRef) {
  const [pulling, setPulling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(null);
  const THRESHOLD = 72;

  useEffect(() => {
    const el = containerRef?.current || window;

    const onTouchStart = (e) => {
      const scrollTop = containerRef?.current
        ? containerRef.current.scrollTop
        : window.scrollY;
      if (scrollTop === 0) startY.current = e.touches[0].clientY;
    };

    const onTouchMove = (e) => {
      if (startY.current === null) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy > 10) setPulling(true);
    };

    const onTouchEnd = async (e) => {
      if (startY.current === null) return;
      const dy = (e.changedTouches[0]?.clientY || 0) - startY.current;
      startY.current = null;
      setPulling(false);
      if (dy >= THRESHOLD) {
        setRefreshing(true);
        await onRefresh();
        setRefreshing(false);
      }
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: true });
    el.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [onRefresh, containerRef]);

  return { pulling, refreshing };
}