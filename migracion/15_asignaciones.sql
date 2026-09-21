-- ═══════════════════════════════════════════════════════════════════
-- 15_asignaciones.sql
--
-- Quién maneja qué vehículo, y la regla de que no puede hacerlo con la
-- licencia vencida.
--
-- Qué problema resuelve
-- ─────────────────────
-- La ficha del equipo tiene `conductor_responsable`, un campo de texto
-- libre. Sirve para anotar un nombre, no para saber nada: no se puede
-- preguntar "¿qué vehículos maneja Pedro?", no tiene fechas, no se
-- relaciona con la cuenta del chofer, y nadie valida que esa persona
-- exista ni que esté habilitada.
--
-- Esta tabla es la respuesta, y es además la base sobre la que se
-- construye el calendario de programación: una asignación tiene fechas,
-- no es un campo que se pisa.
--
-- La regla de la licencia
-- ───────────────────────
-- No se puede ABRIR una asignación para alguien con la licencia vencida.
-- Vive en la base y no solo en la pantalla, porque una validación que
-- solo está en el navegador se salta recargando.
--
-- Pero SÍ se puede cerrar o cancelar una que ya existe, aunque la
-- licencia esté vencida. Es a propósito: si la regla estuviera también
-- en el update, a Movilización se le quedaría trabada justo la
-- asignación que necesita resolver. Y por el mismo motivo nada borra
-- asignaciones solo — dejar un turno sin cubrir en silencio es peor que
-- el problema que se quiere evitar.
--
-- Ejecutar una sola vez en Supabase (SQL Editor). Es re-ejecutable.
-- ═══════════════════════════════════════════════════════════════════

-- ── Antes: qué hay hoy en el campo de texto libre ───────────────────
-- Solo lectura. Muestra lo que se venía anotando a mano, que es lo que
-- esta tabla reemplaza. No se migra solo: son nombres sueltos, sin
-- forma de saber a qué cuenta corresponden.
select
  coalesce(nullif(trim(conductor_responsable), ''), '(sin conductor anotado)') as anotado,
  count(*) as vehiculos
from equipo
where tipo in ('ambulancia', 'camioneta', 'furgon', 'camion_3_4')
group by 1
order by 2 desc;

begin;

-- ── 1) La tabla ─────────────────────────────────────────────────────
-- Las seis primeras columnas son las que llevan todas las tablas del
-- sistema. El nombre y el correo del chofer se guardan además del id
-- para que la pantalla no tenga que cruzar con `usuario` en cada fila,
-- igual que hace `solicitud` con usuario_nombre.
create table if not exists asignacion_chofer (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz default now(),
  updated_date timestamptz,
  created_by_id text,
  created_by text,
  is_sample boolean default false,
  chofer_id text,
  chofer_email text,
  chofer_nombre text,
  equipo_id text,
  equipo_label text,
  desde date,
  hasta date,
  estado text default 'activa',
  observaciones text
);

alter table asignacion_chofer enable row level security;

create index if not exists asignacion_chofer_equipo_idx on asignacion_chofer (equipo_id);
create index if not exists asignacion_chofer_chofer_idx on asignacion_chofer (chofer_id);

-- Un vehículo tiene un solo chofer a cargo a la vez. Las asignaciones
-- terminadas no estorban, por eso el índice es parcial. Cuando llegue el
-- calendario, esto se reemplaza por rangos de fecha que no se solapen.
create unique index if not exists asignacion_chofer_un_activo_por_vehiculo
  on asignacion_chofer (equipo_id)
  where estado = 'activa';

-- ── 2) La regla de la licencia, como función ────────────────────────
-- security definer por lo mismo que mi_rol() y las demás: lee `usuario`,
-- que tiene RLS, y una policy que lo consultara directo entraría en
-- recursión.
--
-- Sin licencia cargada devuelve false: quien no acreditó nada no está
-- habilitado. Es la respuesta segura, no la cómoda.
--
-- La fecha se toma en hora de Chile y no en UTC, que es lo que usa el
-- servidor: si no, durante unas horas de la madrugada el día no coincide
-- con el del calendario de la gente.
create or replace function licencia_vigente(id_chofer text) returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce(
    (select licencia_vencimiento >= (now() at time zone 'America/Santiago')::date
     from usuario where id = id_chofer limit 1),
    false) $$;

-- ── 3) Quién ve las asignaciones ────────────────────────────────────
-- Movilización porque las administra. Base del Sistema, Administración y
-- el Monitor Corporativo porque ven todo. El Jefe de Taller porque
-- necesita saber a quién avisarle cuando un vehículo entra o sale del
-- taller. Y cada chofer, las suyas.
drop policy if exists asignacion_chofer_read on asignacion_chofer;
create policy asignacion_chofer_read on asignacion_chofer for select to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'admin'
    or mi_rol() = 'monitor_corporativo' or mi_rol() = 'encargado_movilizacion'
    or mi_rol() = 'jefe_taller'
    or chofer_id = mi_id()));

-- ── 4) Quién las abre — y la regla ──────────────────────────────────
-- Acá está el bloqueo: `licencia_vigente(chofer_id)` se evalúa en la
-- base, así que da igual lo que muestre la pantalla.
drop policy if exists asignacion_chofer_create on asignacion_chofer;
create policy asignacion_chofer_create on asignacion_chofer for insert to authenticated
  with check ((mi_rol() = 'super_admin' or mi_rol() = 'admin'
    or mi_rol() = 'encargado_movilizacion')
    and licencia_vigente(chofer_id));

-- ── 5) Quién las cierra ─────────────────────────────────────────────
-- SIN la regla de la licencia, a propósito. Si estuviera acá, la
-- asignación de un chofer cuya licencia venció quedaría trabada: no se
-- podría ni terminar. Sería justo la que hay que resolver.
drop policy if exists asignacion_chofer_update on asignacion_chofer;
create policy asignacion_chofer_update on asignacion_chofer for update to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'admin'
    or mi_rol() = 'encargado_movilizacion'))
  with check ((mi_rol() = 'super_admin' or mi_rol() = 'admin'
    or mi_rol() = 'encargado_movilizacion'));

-- ── 6) Borrar, solo para corregir un error de carga ─────────────────
-- Lo normal es terminarla, no borrarla: el historial de quién manejó qué
-- es parte de lo que esta tabla existe para guardar.
drop policy if exists asignacion_chofer_delete on asignacion_chofer;
create policy asignacion_chofer_delete on asignacion_chofer for delete to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'admin'));

-- ── 7) La auditoría, igual que el resto de las tablas ───────────────
-- Todas las tablas del sistema tienen este disparador: es lo que alimenta
-- la pestaña Acciones de Auditoría. Sin él, quién asignó qué vehículo a
-- quién sería lo único que el sistema no registra — y es justo de las
-- cosas que después hay que poder explicar.
--
-- Va a mano porque esta tabla no se genera desde su .jsonc (ver el
-- comentario de ahí). Es la misma línea que generar_sql.py emite para
-- todas las demás.
drop trigger if exists asignacion_chofer_historial on asignacion_chofer;
create trigger asignacion_chofer_historial after insert or update or delete on asignacion_chofer
  for each row execute function avisar_al_servidor('registrarHistorial', 'AsignacionChofer');

commit;

-- ── Verificación ────────────────────────────────────────────────────
-- 1. La tabla existe con sus columnas. Se esperan 15 filas.
select column_name as columna, data_type as tipo
from information_schema.columns
where table_schema = 'public' and table_name = 'asignacion_chofer'
order by ordinal_position;

-- 2. RLS activo y las cuatro policies. Se espera rls_activo = true.
select relrowsecurity as rls_activo
from pg_class where relname = 'asignacion_chofer';

select policyname as policy, cmd as operacion
from pg_policies
where schemaname = 'public' and tablename = 'asignacion_chofer'
order by cmd;

-- 3. La regla de la licencia está donde debe y NO donde no debe.
--    Los dos valores son calculados acá mismo, no columnas de la base.
--    Se espera: create = true, update = false.
select
  (select coalesce(with_check, '') like '%licencia_vigente%' from pg_policies
   where schemaname='public' and tablename='asignacion_chofer' and cmd='INSERT')
    as al_abrir_exige_licencia_vigente,
  (select coalesce(qual, '') || coalesce(with_check, '') like '%licencia_vigente%' from pg_policies
   where schemaname='public' and tablename='asignacion_chofer' and cmd='UPDATE')
    as al_cerrar_tambien_la_exige;

-- 4. El disparador de auditoría quedó puesto. Se espera 1 fila.
select tgname as disparador
from pg_trigger
where tgrelid = 'asignacion_chofer'::regclass and not tgisinternal;

-- 5. La función contesta lo que corresponde para cada chofer.
--    Los que tengan la licencia vencida o sin cargar deben dar false.
select
  u.full_name as chofer,
  u.licencia_vencimiento as vence,
  licencia_vigente(u.id) as puede_ser_asignado
from usuario u
where u.role = 'chofer'
order by u.licencia_vencimiento nulls first;

-- ── Después ─────────────────────────────────────────────────────────
-- En la ficha de un vehículo, Movilización ve quién lo tiene a cargo y
-- puede cambiarlo. Los choferes con la licencia vencida no aparecen
-- disponibles, y si a alguien se le vence estando asignado, la
-- asignación se marca pero NO se deshace sola: eso lo resuelve el
-- Encargado.
