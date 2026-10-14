-- ═══════════════════════════════════════════════════════════════════
-- 27_limpiar_taller.sql
--
-- Deja limpio el módulo de Taller: cancela TODAS las órdenes de trabajo
-- abiertas (pendientes, asignadas, en proceso, pausadas y en revisión).
-- Las completadas quedan como historial.
--
-- De paso cierra lo que esperaba a esas órdenes, para que no quede nada
-- colgando en otras bandejas:
--   · las solicitudes de Movilización / Salud derivadas a esas órdenes
--     (quedan finalizadas, con la razón);
--   · las solicitudes de repuestos PENDIENTES de esas órdenes (quedan
--     rechazadas, con la razón). Las ya aprobadas o compradas no se tocan.
--
-- No borra nada. Guarda el estado anterior en respaldo_limpieza_taller,
-- así que se puede deshacer (al final del archivo).
--
-- Ejecutar una vez en Supabase (SQL Editor → New query → pegar todo → Run).
-- ═══════════════════════════════════════════════════════════════════

create table if not exists respaldo_limpieza_taller (
  tabla text not null,
  id text not null,
  estado_anterior text,
  respaldado_el timestamptz default now(),
  primary key (tabla, id)
);
-- Sin policies: nadie la lee desde la aplicación, solo desde el SQL Editor.
alter table respaldo_limpieza_taller enable row level security;

begin;

-- ── 1) Respaldo ─────────────────────────────────────────────────────
insert into respaldo_limpieza_taller (tabla, id, estado_anterior)
select 'orden_trabajo', id, estado
from orden_trabajo
where coalesce(estado, 'pendiente') not in ('completada', 'cancelada')
on conflict do nothing;

insert into respaldo_limpieza_taller (tabla, id, estado_anterior)
select 'solicitud', s.id, s.estado
from solicitud s
where coalesce(s.estado, 'pendiente') <> 'finalizada'
  and exists (select 1 from orden_trabajo o
              join respaldo_limpieza_taller r on r.tabla = 'orden_trabajo' and r.id = o.id
              where o.solicitud_id = s.id)
on conflict do nothing;

insert into respaldo_limpieza_taller (tabla, id, estado_anterior)
select 'solicitud_repuesto', sr.id, sr.estado
from solicitud_repuesto sr
join respaldo_limpieza_taller r on r.tabla = 'orden_trabajo' and r.id = sr.orden_trabajo_id
where coalesce(sr.estado, 'pendiente') = 'pendiente'
on conflict do nothing;

-- ── 2) Cancelar las órdenes abiertas ────────────────────────────────
update orden_trabajo o
set estado = 'cancelada',
    notas_cierre = coalesce(nullif(o.notas_cierre, ''), 'Cancelada en la limpieza del módulo de Taller.'),
    linea_tiempo = coalesce(o.linea_tiempo, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'fecha', now(),
      'evento', 'Cancelada: limpieza del módulo de Taller',
      'usuario_nombre', 'Sistema',
      'usuario_email', ''))
where coalesce(o.estado, 'pendiente') not in ('completada', 'cancelada');

-- ── 3) Cerrar lo que las esperaba ───────────────────────────────────
update solicitud s
set estado = 'finalizada',
    respuesta_admin = concat_ws(E'\n', nullif(s.respuesta_admin, ''),
      'Cerrada: la orden del taller se canceló en la limpieza del módulo.')
from respaldo_limpieza_taller r
where r.tabla = 'solicitud' and r.id = s.id and coalesce(s.estado, 'pendiente') <> 'finalizada';

update solicitud_repuesto sr
set estado = 'rechazada',
    comentario_aprobador = concat_ws(E'\n', nullif(sr.comentario_aprobador, ''),
      'Rechazada: la orden de trabajo se canceló en la limpieza del módulo de Taller.')
from respaldo_limpieza_taller r
where r.tabla = 'solicitud_repuesto' and r.id = sr.id and coalesce(sr.estado, 'pendiente') = 'pendiente';

commit;

-- ── Verificación ────────────────────────────────────────────────────
-- La primera fila debe decir 0.
select 'órdenes abiertas en el taller' as que, count(*) as hay
from orden_trabajo where coalesce(estado, 'pendiente') not in ('completada', 'cancelada')
union all
select 'órdenes canceladas en la limpieza', count(*)
from respaldo_limpieza_taller where tabla = 'orden_trabajo'
union all
select 'solicitudes cerradas', count(*)
from respaldo_limpieza_taller where tabla = 'solicitud'
union all
select 'pedidos de repuestos rechazados', count(*)
from respaldo_limpieza_taller where tabla = 'solicitud_repuesto';

-- ── Para deshacer (correr solo si hace falta) ───────────────────────
-- update orden_trabajo o set estado = r.estado_anterior
--   from respaldo_limpieza_taller r where r.tabla = 'orden_trabajo' and r.id = o.id;
-- update solicitud s set estado = r.estado_anterior
--   from respaldo_limpieza_taller r where r.tabla = 'solicitud' and r.id = s.id;
-- update solicitud_repuesto sr set estado = r.estado_anterior
--   from respaldo_limpieza_taller r where r.tabla = 'solicitud_repuesto' and r.id = sr.id;
