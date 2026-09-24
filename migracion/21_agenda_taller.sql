-- ═══════════════════════════════════════════════════════════════════
-- 21_agenda_taller.sql
--
-- La agenda entre Movilización y el Taller: cuándo entra un vehículo.
--
-- Qué faltaba
-- ───────────
-- Movilización derivaba una solicitud y ahí se le perdía el rastro: la
-- orden quedaba "pendiente" en el Taller, el Jefe de Taller asignaba un
-- mecánico con una fecha, y nadie le avisaba a Movilización cuándo tenía
-- que llevar el vehículo ni cuándo lo iba a recuperar. Si esa fecha no le
-- servía (el vehículo estaba programado para una ronda rural), no había
-- dónde decirlo.
--
-- El ida y vuelta
-- ───────────────
--   1. Movilización pide. La orden nace `por_agendar`, con la fecha desde
--      la que puede soltar el vehículo (`fecha_preferida`).
--   2. El Jefe de Taller propone ingreso (`cita_fecha`) y entrega
--      estimada (`cita_entrega`) → `propuesta`.
--   3. Movilización confirma → `confirmada`, o pide otra fecha con el
--      motivo en `cita_nota` → `reagendar`, y vuelve al paso 2.
--
-- Cada paso queda además en la línea de tiempo de la orden.
--
-- Lo que puede tocar Movilización
-- ───────────────────────────────
-- Hasta ahora no podía modificar órdenes (12_movilizacion.sql solo le dio
-- crearlas). Ahora puede, pero SOLO:
--   · en órdenes que nacieron en Movilización (origen = 'movilizacion');
--   · su respuesta: cita_estado, cita_nota, fecha_preferida, y agregar
--     (no borrar ni cambiar) entradas en la línea de tiempo;
--   · y la respuesta tiene que ser a una propuesta del Taller.
-- El diagnóstico, el mecánico, los costos y el estado de la orden siguen
-- siendo del Taller. Lo impide un disparador y no la pantalla, porque una
-- regla que vive solo en el navegador se salta con la consola.
--
-- Ejecutar una sola vez en Supabase (SQL Editor). Es re-ejecutable.
-- No depende de otras migraciones más que de las funciones mi_rol() e
-- mi_id() de 03_policies.sql, que ya están en la base.
-- ═══════════════════════════════════════════════════════════════════

-- ── Antes: qué está esperando hoy en el Taller desde Movilización ───
-- Solo lectura.
select estado, count(*) as ordenes
from orden_trabajo
where origen = 'movilizacion'
group by estado
order by estado;

begin;

-- ── 1) Las columnas ─────────────────────────────────────────────────
alter table orden_trabajo add column if not exists fecha_preferida date;
alter table orden_trabajo add column if not exists cita_estado     text;
alter table orden_trabajo add column if not exists cita_fecha      timestamptz;
alter table orden_trabajo add column if not exists cita_entrega    date;
alter table orden_trabajo add column if not exists cita_nota       text;

alter table orden_trabajo drop constraint if exists orden_trabajo_cita_estado_valido;
alter table orden_trabajo add constraint orden_trabajo_cita_estado_valido
  check (cita_estado is null or cita_estado in ('por_agendar', 'propuesta', 'confirmada', 'reagendar'));

-- Las derivadas antes de esta migración que siguen esperando: quedan por
-- agendar, igual que una nueva. No se toca ninguna que ya empezó.
update orden_trabajo
set cita_estado = 'por_agendar'
where origen = 'movilizacion'
  and cita_estado is null
  and estado = 'pendiente';

-- ── 2) Movilización puede responder ─────────────────────────────────
-- Se conserva todo lo que ya estaba (super_admin, jefe_taller, mecanico)
-- y se agrega Movilización, solo en sus órdenes.
drop policy if exists orden_trabajo_update on orden_trabajo;
create policy orden_trabajo_update on orden_trabajo for update to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'jefe_taller' or mi_rol() = 'mecanico'
    or (mi_rol() = 'encargado_movilizacion' and origen = 'movilizacion')))
  with check ((mi_rol() = 'super_admin' or mi_rol() = 'jefe_taller' or mi_rol() = 'mecanico'
    or (mi_rol() = 'encargado_movilizacion' and origen = 'movilizacion')));

-- ── 3) …pero solo su respuesta ──────────────────────────────────────
create or replace function orden_trabajo_respuesta_movilizacion()
returns trigger
language plpgsql
as $$
declare
  libres text[] := array['cita_estado', 'cita_nota', 'fecha_preferida', 'linea_tiempo', 'updated_date'];
begin
  if mi_rol() is distinct from 'encargado_movilizacion' then
    return new;
  end if;

  if (to_jsonb(new) - libres) is distinct from (to_jsonb(old) - libres) then
    raise exception 'Movilización solo puede responder la fecha que propone el Taller; el resto de la orden es del Taller.';
  end if;

  if new.cita_estado is distinct from old.cita_estado
     and not (old.cita_estado = 'propuesta'  and new.cita_estado in ('confirmada', 'reagendar'))
     and not (old.cita_estado = 'confirmada' and new.cita_estado = 'reagendar') then
    raise exception 'Solo se puede confirmar o pedir otra fecha sobre una fecha propuesta por el Taller.';
  end if;

  if not (coalesce(new.linea_tiempo, '[]'::jsonb) @> coalesce(old.linea_tiempo, '[]'::jsonb)) then
    raise exception 'La línea de tiempo de la orden no se puede borrar ni corregir, solo agregarle.';
  end if;

  return new;
end $$;

drop trigger if exists orden_trabajo_respuesta_movilizacion on orden_trabajo;
create trigger orden_trabajo_respuesta_movilizacion
  before update on orden_trabajo
  for each row execute function orden_trabajo_respuesta_movilizacion();

commit;

-- ── Verificación ────────────────────────────────────────────────────
-- 1. Lo que se creó. Las cuatro filas deben coincidir.
select 'columnas nuevas de orden_trabajo' as que, count(*)::text as hay, '5' as esperado
  from information_schema.columns
  where table_schema = 'public' and table_name = 'orden_trabajo'
    and column_name in ('fecha_preferida', 'cita_estado', 'cita_fecha', 'cita_entrega', 'cita_nota')
union all select 'regla de valores de cita_estado', count(*)::text, '1'
  from pg_constraint where conname = 'orden_trabajo_cita_estado_valido'
union all select 'policy de update con Movilización', count(*)::text, '1'
  from pg_policies
  where schemaname = 'public' and tablename = 'orden_trabajo' and policyname = 'orden_trabajo_update'
    and coalesce(qual, '') like '%encargado_movilizacion%'
union all select 'disparador de la respuesta', count(*)::text, '1'
  from pg_trigger where tgname = 'orden_trabajo_respuesta_movilizacion';

-- 2. Un estado inventado se rechaza. Va en su propio bloque, que se
--    revierte solo: la prueba no deja nada escrito.
do $$
declare ok boolean := false;
begin
  begin
    insert into orden_trabajo (id, numero_ot, cita_estado) values ('prueba-21', 'PRUEBA-21', 'cuando_sea');
  exception when others then
    ok := true;
    raise notice 'bien, lo rechazo: %', sqlerrm;
  end;
  if not ok then
    raise exception 'MAL: acepto un cita_estado que no existe';
  end if;
end $$;

-- ── Después ─────────────────────────────────────────────────────────
-- Movilización, en "Solicitudes al Taller": pide revisión de un vehículo
-- o deriva lo de Salud, con la fecha desde la que lo puede soltar. En la
-- pestaña "Con el taller" ve la fecha que propone el Taller y la confirma
-- o pide otra. El Jefe de Taller ve en "Taller" el filtro "Por agendar" y,
-- en el detalle de la orden, la tarjeta "Agenda con Movilización". El
-- Calendario de flota marca esos días como "en taller" desde que hay
-- fecha propuesta, así se ve con anticipación qué vehículo no va a estar.
