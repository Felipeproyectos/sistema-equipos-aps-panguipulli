-- ═══════════════════════════════════════════════════════════════════
-- 06_categorias_activo_taller.sql
-- Taller Mecánico: separación de la flota en 3 categorías de activo
--   salud       → ambulancias (flota asistencial)
--   corporativo → camionetas, furgones, camiones 3/4 (flota institucional)
--   externo     → vehículos de otra entidad, registrados manualmente en la OT
--
-- Reclasifica las órdenes de trabajo históricas: antes todas las OT de
-- ambulancia se guardaban con tipo_activo = 'corporativo'.
-- Ejecutar una sola vez en Supabase (SQL Editor).
-- ═══════════════════════════════════════════════════════════════════

-- 1) OT de ambulancias marcadas como 'corporativo' → 'salud'
update orden_trabajo ot
set tipo_activo = 'salud'
from equipo e
where ot.equipo_id = e.id
  and e.tipo = 'ambulancia'
  and coalesce(ot.tipo_activo, '') <> 'externo'
  and coalesce(ot.tipo_activo, '') is distinct from 'salud';

-- 2) OT de vehículos institucionales → 'corporativo'
update orden_trabajo ot
set tipo_activo = 'corporativo'
from equipo e
where ot.equipo_id = e.id
  and e.tipo in ('camioneta', 'furgon', 'camion_3_4')
  and coalesce(ot.tipo_activo, '') <> 'externo'
  and coalesce(ot.tipo_activo, '') is distinct from 'corporativo';

-- 3) OT internas sin equipo asociado y sin categoría → 'salud' (valor histórico)
update orden_trabajo
set tipo_activo = 'salud'
where coalesce(tipo_activo, '') not in ('salud', 'corporativo', 'externo')
  and coalesce(equipo_id, '') = '';

-- Verificación
select tipo_activo, count(*) from orden_trabajo group by 1 order by 1;
