-- ═══════════════════════════════════════════════════════════════════
-- 25_turno_chofer.sql
--
-- El chofer toma el vehículo: Movilización deja de asignar.
--
-- Qué cambia
-- ──────────
-- En la práctica el chofer elige el vehículo al empezar el turno, y en el
-- día puede usar más de uno. Ahora lo registra él mismo desde «Mi turno»:
-- hace la pauta de inicio, el vehículo queda a su nombre y al terminar lo
-- entrega. Cada toma queda en `uso_vehiculo` (lo que pasó de verdad).
--
-- La tabla `asignacion_chofer` no se toca: lo que había programado pasa a
-- leerse como RESERVAS (Movilización reserva un vehículo para una salida
-- puntual). No se migra ni se borra nada.
--
-- Reglas que pone la base, aunque la pantalla falle
-- ─────────────────────────────────────────────────
--   · Un vehículo tiene un solo uso abierto a la vez.
--   · Un chofer tiene un solo uso abierto a la vez (cambia de vehículo
--     entregando el anterior).
--   · Con la licencia vencida no se abre un uso. Vale también para el
--     servidor, que escribe con la llave de servicio: esta regla es un
--     disparador, no una policy.
--   · El kilometraje de entrega no puede ser menor que el de inicio.
--
-- Quién escribe
-- ─────────────
-- El chofer no escribe directo en la tabla: lo hace el servidor
-- (servidor/funciones/turnoVehiculo.js), que valida disponibilidad, relevos
-- y fallas. Movilización y la administración sí pueden corregir a mano.
--
-- Además: `solicitud.origen` (para distinguir la falla que marca el chofer
-- de lo que informa Salud) y `bitacora_flota.uso_id` (la salida queda
-- enganchada al uso en que se hizo).
--
-- Es re-ejecutable. Depende de mi_rol()/mi_id() (03), licencia_vigente()
-- (15), centro_que_paga() (16) y prestamo_en_fecha() (18).
-- Ejecutar una vez en Supabase (SQL Editor).
-- ═══════════════════════════════════════════════════════════════════

begin;

create table if not exists uso_vehiculo (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz default now(),
  updated_date timestamptz,
  created_by_id text,
  created_by text,
  is_sample boolean default false,
  equipo_id text,
  equipo_label text,
  equipo_tipo text,
  chofer_id text,
  chofer_email text,
  chofer_nombre text,
  estado text default 'en_uso',
  fecha date,
  inicio timestamptz,
  fin timestamptz,
  km_inicio numeric,
  km_fin numeric,
  combustible_inicio text,
  combustible_fin text,
  pauta_inicio jsonb,
  pauta_con_falla boolean,
  inspeccion_id text,
  solicitud_id text,
  observaciones_inicio text,
  observaciones_fin text,
  motivo_cambio text,
  cerrado_por text,
  relevado_por text,
  motivo_rechazo text,
  prestamo_id text,
  centro_costo text
);

alter table uso_vehiculo enable row level security;

create index if not exists uso_vehiculo_equipo_idx on uso_vehiculo (equipo_id);
create index if not exists uso_vehiculo_chofer_idx on uso_vehiculo (chofer_id);
create index if not exists uso_vehiculo_fecha_idx on uso_vehiculo (fecha);

-- Uno abierto por vehículo y uno abierto por chofer.
create unique index if not exists uso_vehiculo_un_abierto_por_vehiculo
  on uso_vehiculo (equipo_id) where estado = 'en_uso';
create unique index if not exists uso_vehiculo_un_abierto_por_chofer
  on uso_vehiculo (chofer_id) where estado = 'en_uso';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'uso_vehiculo_estado_valido') then
    alter table uso_vehiculo add constraint uso_vehiculo_estado_valido
      check (estado in ('en_uso', 'entregado', 'rechazado'));
  end if;
end $$;

drop trigger if exists uso_vehiculo_tocar on uso_vehiculo;
create trigger uso_vehiculo_tocar before update on uso_vehiculo
  for each row execute function tocar_updated_date();

-- ── Las reglas ──────────────────────────────────────────────────────
create or replace function uso_vehiculo_reglas() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  p prestamo_vehiculo;
begin
  if tg_op = 'INSERT' then
    new.inicio := coalesce(new.inicio, now());
    new.fecha := coalesce(new.fecha, (new.inicio at time zone 'America/Santiago')::date);
    -- Quién paga el uso: el centro dueño, o el del préstamo si estaba prestado.
    if new.prestamo_id is null and (new.centro_costo is null or trim(new.centro_costo) = '') then
      p := prestamo_en_fecha(new.equipo_id, new.fecha);
      if p.id is not null then
        new.prestamo_id  := p.id;
        new.centro_costo := p.centro_costo;
      else
        new.centro_costo := centro_que_paga(new.equipo_id);
      end if;
    end if;
  end if;

  -- Abrir un uso (o reabrirlo) exige licencia vigente. Un intento rechazado
  -- sí se guarda: es la constancia que ve Movilización.
  if new.estado = 'en_uso'
     and (tg_op = 'INSERT' or old.estado is distinct from 'en_uso')
     and not licencia_vigente(new.chofer_id) then
    raise exception 'La licencia de conducir no está vigente: no se puede tomar el vehículo.';
  end if;

  if new.km_inicio is not null and new.km_fin is not null and new.km_fin < new.km_inicio then
    raise exception 'El kilometraje de entrega (%) no puede ser menor que el de inicio (%).',
      new.km_fin, new.km_inicio;
  end if;

  if new.estado = 'entregado' and new.fin is null then
    new.fin := now();
  end if;

  return new;
end $$;

drop trigger if exists uso_vehiculo_reglas on uso_vehiculo;
create trigger uso_vehiculo_reglas
  before insert or update on uso_vehiculo
  for each row execute function uso_vehiculo_reglas();

-- ── Quién la ve ─────────────────────────────────────────────────────
drop policy if exists uso_vehiculo_read on uso_vehiculo;
create policy uso_vehiculo_read on uso_vehiculo for select to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'admin'
    or mi_rol() = 'monitor_corporativo' or mi_rol() = 'encargado_movilizacion'
    or mi_rol() = 'jefe_taller' or mi_rol() = 'encargado_salud'
    or chofer_id = mi_id()));

-- ── Quién la escribe a mano (el chofer, por el servidor) ────────────
drop policy if exists uso_vehiculo_create on uso_vehiculo;
create policy uso_vehiculo_create on uso_vehiculo for insert to authenticated
  with check ((mi_rol() = 'super_admin' or mi_rol() = 'admin'
    or mi_rol() = 'encargado_movilizacion'));

drop policy if exists uso_vehiculo_update on uso_vehiculo;
create policy uso_vehiculo_update on uso_vehiculo for update to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'admin'
    or mi_rol() = 'encargado_movilizacion'))
  with check ((mi_rol() = 'super_admin' or mi_rol() = 'admin'
    or mi_rol() = 'encargado_movilizacion'));

drop policy if exists uso_vehiculo_delete on uso_vehiculo;
create policy uso_vehiculo_delete on uso_vehiculo for delete to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'admin'));

-- ── Auditoría, igual que las demás tablas de la flota ───────────────
do $$
begin
  if exists (select 1 from pg_proc where proname = 'avisar_al_servidor') then
    execute 'drop trigger if exists uso_vehiculo_historial on uso_vehiculo';
    execute 'create trigger uso_vehiculo_historial after insert or update or delete
             on uso_vehiculo for each row
             execute function avisar_al_servidor(''registrarHistorial'', ''UsoVehiculo'')';
  else
    raise notice 'avisar_al_servidor() no existe: sin disparador de auditoria (ver 04_webhooks.sql)';
  end if;
end $$;

-- ── Columnas nuevas en tablas que ya existían ───────────────────────
alter table solicitud add column if not exists origen text;
alter table bitacora_flota add column if not exists uso_id text;

commit;

-- ── Verificación ────────────────────────────────────────────────────
-- Todas las filas deben coincidir.
select 'tabla uso_vehiculo' as que, count(*)::text as hay, '1' as esperado
  from information_schema.tables where table_schema = 'public' and table_name = 'uso_vehiculo'
union all select 'indices de uno abierto', count(*)::text, '2'
  from pg_indexes where schemaname = 'public'
   and indexname in ('uso_vehiculo_un_abierto_por_vehiculo', 'uso_vehiculo_un_abierto_por_chofer')
union all select 'disparador de reglas', count(*)::text, '1'
  from pg_trigger where tgname = 'uso_vehiculo_reglas'
union all select 'policies', count(*)::text, '4'
  from pg_policies where schemaname = 'public' and tablename = 'uso_vehiculo'
union all select 'columna solicitud.origen', count(*)::text, '1'
  from information_schema.columns where table_name = 'solicitud' and column_name = 'origen'
union all select 'columna bitacora_flota.uso_id', count(*)::text, '1'
  from information_schema.columns where table_name = 'bitacora_flota' and column_name = 'uso_id';

-- Choferes que todavía NO podrán tomar vehículos (licencia vencida o sin
-- cargar). Hay que pedirles que la carguen en «Mi licencia».
select full_name as chofer, licencia_vencimiento as vence
from usuario
where role = 'chofer' and not licencia_vigente(id)
order by full_name;
