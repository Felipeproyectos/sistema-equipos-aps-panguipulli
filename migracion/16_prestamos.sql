-- ═══════════════════════════════════════════════════════════════════
-- 16_prestamos.sql
--
-- Préstamos de vehículos entre centros, y el centro de costo congelado.
--
-- Los dos problemas
-- ─────────────────
-- 1. Un vehículo se presta a otro centro por un tiempo y hoy eso no queda
--    registrado en ninguna parte. Se sabe de palabra.
--
-- 2. `orden_trabajo` guarda total_mano_obra, total_repuestos y total,
--    pero NO guarda a qué centro corresponde ese gasto. Cualquier reporte
--    de costos tiene que cruzar la OT con el centro ACTUAL del vehículo,
--    asi que el dia que un vehiculo cambia de centro — o se presta — todo
--    su historial de gastos se reatribuye solo. El pasado cambia.
--
-- Lo que hace este archivo
-- ────────────────────────
-- Registra los préstamos, y congela en cada orden de trabajo el centro
-- que la paga, al momento de crearla. Una vez escrito, ese dato ya no
-- depende de dónde esté el vehículo después.
--
-- Quién paga durante un préstamo se decide EN CADA PRÉSTAMO: puede ser
-- el centro que lo recibe, el dueño, o un tercero. Por eso `centro_costo`
-- es un campo del préstamo y no una regla fija.
--
-- Un préstamo NO se cierra solo al llegar su fecha. Queda vigente hasta
-- que alguien confirme la devolución; si se pasa, se avisa. Mismo criterio
-- que las licencias: el sistema no da por hecho algo que no le consta —
-- darlo por devuelto empezaria a cargarle los gastos al centro equivocado.
--
-- Ejecutar una sola vez en Supabase (SQL Editor). Es re-ejecutable.
-- ═══════════════════════════════════════════════════════════════════

-- ── Antes: cuántas órdenes de trabajo hay sin centro ────────────────
-- Solo lectura. Estas son las que hoy no saben quién las pagó.
select
  count(*) as ordenes_totales,
  count(*) filter (where coalesce(total, 0) > 0) as con_gasto_registrado,
  coalesce(sum(total), 0) as gasto_acumulado
from orden_trabajo;

begin;

-- ── 1) La tabla de préstamos ────────────────────────────────────────
-- `centro_origen` se copia al abrir el préstamo y no se vuelve a tocar:
-- si el vehículo cambiara de dueño después, el préstamo tiene que seguir
-- diciendo de dónde salió en su momento.
--
-- `hasta_previsto` es cuándo se acordó devolverlo. `devuelto_el` es
-- cuándo volvió de verdad. Son distintos a propósito: la diferencia entre
-- los dos es justamente lo que hay que poder mirar.
create table if not exists prestamo_vehiculo (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz default now(),
  updated_date timestamptz,
  created_by_id text,
  created_by text,
  is_sample boolean default false,
  equipo_id text,
  equipo_label text,
  centro_origen text,
  centro_destino text,
  centro_costo text,
  desde date,
  hasta_previsto date,
  devuelto_el date,
  estado text default 'vigente',
  motivo text,
  observaciones text
);

alter table prestamo_vehiculo enable row level security;

create index if not exists prestamo_vehiculo_equipo_idx on prestamo_vehiculo (equipo_id);
create index if not exists prestamo_vehiculo_estado_idx on prestamo_vehiculo (estado);

-- Un vehículo no puede estar prestado en dos lados a la vez.
create unique index if not exists prestamo_vehiculo_uno_vigente
  on prestamo_vehiculo (equipo_id)
  where estado = 'vigente';

-- ── 2) El centro que paga, hoy, por un vehículo ─────────────────────
-- Si está prestado, el que se acordó en el préstamo. Si no, su centro.
-- security definer por lo mismo que las demás: lee tablas con RLS.
create or replace function centro_que_paga(id_equipo text) returns text
  language sql stable security definer set search_path = public as $$
  select coalesce(
    (select nullif(trim(centro_costo), '') from prestamo_vehiculo
      where equipo_id = id_equipo and estado = 'vigente'
      order by desde desc limit 1),
    (select centro_principal from equipo where id = id_equipo limit 1),
    '') $$;

-- ── 3) El centro se congela en la orden de trabajo ──────────────────
alter table orden_trabajo add column if not exists centro_costo text;

create index if not exists orden_trabajo_centro_costo_idx
  on orden_trabajo (centro_costo);

-- Va como disparador y no en el código de la aplicación porque hay dos
-- lugares distintos que crean órdenes (el formulario del taller y
-- aprobarInspeccion), y mañana puede haber un tercero. Acá no se puede
-- olvidar.
--
-- Solo escribe si viene vacío: si la aplicación algún día manda el centro
-- explícito, manda la aplicación.
create or replace function ot_congela_centro() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.centro_costo is null or trim(new.centro_costo) = '' then
    new.centro_costo := centro_que_paga(new.equipo_id);
  end if;
  return new;
end $$;

drop trigger if exists orden_trabajo_congela_centro on orden_trabajo;
create trigger orden_trabajo_congela_centro
  before insert on orden_trabajo
  for each row execute function ot_congela_centro();

-- Las órdenes que ya existen se completan con el centro actual del
-- vehículo. Es el mismo valor que un reporte habría calculado hoy, así
-- que no empeora nada — pero de acá en adelante deja de moverse.
--
-- OJO: para un vehículo que YA cambió de centro alguna vez, esto no
-- reconstruye dónde estaba en su momento. Eso se perdió antes de que
-- existiera este campo y no hay forma de recuperarlo. Lo que se corta es
-- que siga pasando.
update orden_trabajo ot
   set centro_costo = e.centro_principal
  from equipo e
 where ot.equipo_id = e.id
   and (ot.centro_costo is null or trim(ot.centro_costo) = '');

-- ── 4) La asignación sabe si es por un préstamo ─────────────────────
-- Para que la bitácora del chofer pueda decir "manejando la camioneta
-- durante el préstamo a Coñaripe", y no solo "manejando la camioneta".
alter table asignacion_chofer add column if not exists prestamo_id text;

create index if not exists asignacion_chofer_prestamo_idx
  on asignacion_chofer (prestamo_id);

-- ── 5) Quién ve y quién registra los préstamos ──────────────────────
-- Lo mismo que las asignaciones: Movilización administra, los de arriba
-- miran, el Jefe de Taller mira porque necesita saber dónde está el
-- vehículo que le llega.
drop policy if exists prestamo_vehiculo_read on prestamo_vehiculo;
create policy prestamo_vehiculo_read on prestamo_vehiculo for select to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'admin'
    or mi_rol() = 'monitor_corporativo' or mi_rol() = 'encargado_movilizacion'
    or mi_rol() = 'jefe_taller'));

drop policy if exists prestamo_vehiculo_create on prestamo_vehiculo;
create policy prestamo_vehiculo_create on prestamo_vehiculo for insert to authenticated
  with check ((mi_rol() = 'super_admin' or mi_rol() = 'admin'
    or mi_rol() = 'encargado_movilizacion'));

drop policy if exists prestamo_vehiculo_update on prestamo_vehiculo;
create policy prestamo_vehiculo_update on prestamo_vehiculo for update to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'admin'
    or mi_rol() = 'encargado_movilizacion'))
  with check ((mi_rol() = 'super_admin' or mi_rol() = 'admin'
    or mi_rol() = 'encargado_movilizacion'));

-- Borrar no: un prestamo que existio es parte del historial del vehiculo.
-- Se cancela, que deja constancia.
drop policy if exists prestamo_vehiculo_delete on prestamo_vehiculo;
create policy prestamo_vehiculo_delete on prestamo_vehiculo for delete to authenticated
  using (mi_rol() = 'super_admin');

-- ── 6) Auditoría, si la función existe en esta base ─────────────────
-- Condicionado por lo mismo que en 15_asignaciones.sql: 04_webhooks no
-- se ejecutó en producción y `create trigger` a secas revertiría todo.
do $$
begin
  if exists (select 1 from pg_proc where proname = 'avisar_al_servidor') then
    execute 'drop trigger if exists prestamo_vehiculo_historial on prestamo_vehiculo';
    execute 'create trigger prestamo_vehiculo_historial after insert or update or delete
             on prestamo_vehiculo for each row
             execute function avisar_al_servidor(''registrarHistorial'', ''PrestamoVehiculo'')';
  else
    raise notice 'avisar_al_servidor() no existe: sin disparador de auditoria (ver 04_webhooks.sql)';
  end if;
end $$;

commit;

-- ── Verificación ────────────────────────────────────────────────────
-- 1. Lo que se creó. Las seis filas deben coincidir.
select 'tabla prestamo_vehiculo' as que, count(*)::text as hay, '1' as esperado
  from information_schema.tables
  where table_schema='public' and table_name='prestamo_vehiculo'
union all select 'policies del prestamo', count(*)::text, '4' from pg_policies
  where schemaname='public' and tablename='prestamo_vehiculo'
union all select 'funcion centro_que_paga', count(*)::text, '1'
  from pg_proc where proname='centro_que_paga'
union all select 'columna orden_trabajo.centro_costo', count(*)::text, '1'
  from information_schema.columns
  where table_schema='public' and table_name='orden_trabajo' and column_name='centro_costo'
union all select 'disparador que congela el centro', count(*)::text, '1'
  from pg_trigger where tgname = 'orden_trabajo_congela_centro'
union all select 'columna asignacion_chofer.prestamo_id', count(*)::text, '1'
  from information_schema.columns
  where table_schema='public' and table_name='asignacion_chofer' and column_name='prestamo_id';

-- 2. Ninguna orden de trabajo quedó sin centro. Se espera 0.
select count(*) as ordenes_sin_centro
from orden_trabajo
where centro_costo is null or trim(centro_costo) = '';

-- 3. Cómo quedó repartido el gasto. Esta es la foto que antes no existía.
select
  coalesce(nullif(centro_costo, ''), '(sin centro)') as centro,
  count(*) as ordenes,
  coalesce(sum(total), 0) as gasto
from orden_trabajo
group by 1
order by 3 desc;

-- ── Después ─────────────────────────────────────────────────────────
-- En la ficha de un vehículo, Movilización registra el préstamo y elige
-- qué centro asume el costo. Desde ese momento, las órdenes de trabajo de
-- ese vehículo se cargan solas a ese centro, y el reporte del vehículo
-- muestra el préstamo con sus fechas. El préstamo sigue vigente hasta que
-- alguien confirme la devolución.
