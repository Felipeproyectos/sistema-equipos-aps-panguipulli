-- ═══════════════════════════════════════════════════════════════════
-- 28_29_30_en_un_paso.sql
--
-- Las migraciones 28, 29 y 30 juntas y en orden, para correrlas de una vez
-- en Supabase (SQL Editor → New query → pegar todo → Run). Es lo mismo que
-- correr los tres archivos uno tras otro. Es re-ejecutable. Al final, todas
-- las filas de la verificación deben coincidir.
-- ═══════════════════════════════════════════════════════════════════

begin;

create or replace function es_del_sistema() returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce(mi_rol(), '') <> '' $$;

drop policy if exists orden_trabajo_read on orden_trabajo;
create policy orden_trabajo_read on orden_trabajo for select to authenticated
  using (es_del_sistema());

drop policy if exists proveedor_read on proveedor;
create policy proveedor_read on proveedor for select to authenticated
  using (es_del_sistema());

drop policy if exists repuesto_read on repuesto;
create policy repuesto_read on repuesto for select to authenticated
  using (es_del_sistema());

drop policy if exists alerta_read on alerta;
create policy alerta_read on alerta for select to authenticated
  using (es_del_sistema());

drop policy if exists comentario_read on comentario;
create policy comentario_read on comentario for select to authenticated
  using (es_del_sistema());

drop policy if exists config_alerta_read on config_alerta;
create policy config_alerta_read on config_alerta for select to authenticated
  using (es_del_sistema());

drop policy if exists actividad_create on actividad;
create policy actividad_create on actividad for insert to authenticated
  with check ((mi_rol() = 'super_admin' or mi_rol() = 'admin'
    or (mi_rol() = 'encargado_salud' and centro_origen = mi_centro())
    or (es_del_sistema() and usuario_email = (auth.jwt() ->> 'email'))));

drop policy if exists actividad_read on actividad;
create policy actividad_read on actividad for select to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'admin'
    or (es_del_sistema() and usuario_email = (auth.jwt() ->> 'email'))
    or centro_del_equipo(equipo_id) = mi_centro()));

drop policy if exists actividad_update on actividad;
create policy actividad_update on actividad for update to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'admin'
    or (mi_rol() = 'encargado_salud' and centro_origen = mi_centro())
    or (es_del_sistema() and usuario_email = (auth.jwt() ->> 'email'))))
  with check ((mi_rol() = 'super_admin' or mi_rol() = 'admin'
    or (mi_rol() = 'encargado_salud' and centro_origen = mi_centro())
    or (es_del_sistema() and usuario_email = (auth.jwt() ->> 'email'))));

drop policy if exists historial_mantenimiento_create on historial_mantenimiento;
create policy historial_mantenimiento_create on historial_mantenimiento for insert to authenticated
  with check ((mi_rol() = 'super_admin' or mi_rol() = 'admin' or mi_rol() = 'encargado_salud'
    or (es_del_sistema() and cargado_por_email = (auth.jwt() ->> 'email'))));

drop policy if exists historial_mantenimiento_read on historial_mantenimiento;
create policy historial_mantenimiento_read on historial_mantenimiento for select to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'admin' or mi_rol() = 'encargado_salud'
    or mi_rol() = 'jefe_taller' or mi_rol() = 'mecanico' or mi_rol() = 'monitor_corporativo'
    or (es_del_sistema() and cargado_por_email = (auth.jwt() ->> 'email'))));

drop policy if exists historial_create on historial;
create policy historial_create on historial for insert to authenticated
  with check (es_del_sistema()
    and lower(coalesce(usuario_email, '')) = lower(coalesce(auth.jwt() ->> 'email', '')));

drop policy if exists acceso_no_autorizado_create on acceso_no_autorizado;
create policy acceso_no_autorizado_create on acceso_no_autorizado for insert to authenticated
  with check (mi_rol() = 'super_admin');

commit;

begin;

create or replace function es_del_sistema() returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce(mi_rol(), '') <> '' $$;

create or replace function es_ambulancia(id_equipo text) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from equipo where id = id_equipo and tipo = 'ambulancia') $$;

create or replace function prestada_a(id_equipo text) returns text
  language sql stable security definer set search_path = public as $$
  select centro_destino from prestamo_vehiculo
   where equipo_id = id_equipo and estado = 'vigente'
   order by desde desc limit 1 $$;

drop policy if exists prestamo_vehiculo_read on prestamo_vehiculo;
create policy prestamo_vehiculo_read on prestamo_vehiculo for select to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'admin'
    or mi_rol() = 'monitor_corporativo' or mi_rol() = 'encargado_movilizacion'
    or mi_rol() = 'jefe_taller'
    or (mi_rol() in ('encargado_salud', 'encargado_compras_salud', 'user')
        and (centro_origen = mi_centro() or centro_destino = mi_centro()))));

drop policy if exists prestamo_vehiculo_create on prestamo_vehiculo;
create policy prestamo_vehiculo_create on prestamo_vehiculo for insert to authenticated
  with check ((mi_rol() = 'super_admin' or mi_rol() = 'admin'
    or mi_rol() = 'encargado_movilizacion'
    or (mi_rol() = 'encargado_salud' and es_ambulancia(equipo_id)
        and centro_origen = mi_centro() and centro_del_equipo(equipo_id) = mi_centro())));

drop policy if exists prestamo_vehiculo_update on prestamo_vehiculo;
create policy prestamo_vehiculo_update on prestamo_vehiculo for update to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'admin'
    or mi_rol() = 'encargado_movilizacion'
    or (mi_rol() = 'encargado_salud' and es_ambulancia(equipo_id)
        and (centro_origen = mi_centro() or centro_destino = mi_centro()))))
  with check ((mi_rol() = 'super_admin' or mi_rol() = 'admin'
    or mi_rol() = 'encargado_movilizacion'
    or (mi_rol() = 'encargado_salud' and es_ambulancia(equipo_id)
        and (centro_origen = mi_centro() or centro_destino = mi_centro()))));

drop policy if exists equipo_read on equipo;
create policy equipo_read on equipo for select to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'admin' or mi_rol() = 'monitor_corporativo'
    or (mi_rol() = 'jefe_taller' and tipo = 'ambulancia')
    or (mi_rol() = 'mecanico' and tipo = 'ambulancia')
    or (mi_rol() = 'encargado_compras_taller' and tipo = 'ambulancia')
    or centro_principal = mi_centro()
    or (mi_rol() = 'encargado_movilizacion'
        and tipo in ('ambulancia', 'camioneta', 'furgon', 'camion_3_4'))
    or (tipo = 'ambulancia' and prestada_a(id) = mi_centro())));

drop policy if exists actividad_read on actividad;
create policy actividad_read on actividad for select to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'admin'
    or (es_del_sistema() and usuario_email = (auth.jwt() ->> 'email'))
    or centro_del_equipo(equipo_id) = mi_centro()
    or (es_del_sistema() and prestada_a(equipo_id) = mi_centro())));

commit;

begin;

create or replace function es_del_sistema() returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce(mi_rol(), '') <> '' $$;

create or replace function prestada_a(id_equipo text) returns text
  language sql stable security definer set search_path = public as $$
  select centro_destino from prestamo_vehiculo
   where equipo_id = id_equipo and estado = 'vigente'
   order by desde desc limit 1 $$;

alter table actividad add column if not exists centro_responsable text;
alter table actividad add column if not exists prestamo_id text;
create index if not exists actividad_centro_responsable_idx on actividad (centro_responsable);

drop policy if exists actividad_read on actividad;
create policy actividad_read on actividad for select to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'admin'
    or (es_del_sistema() and usuario_email = (auth.jwt() ->> 'email'))
    or centro_del_equipo(equipo_id) = mi_centro()
    or (es_del_sistema() and prestada_a(equipo_id) = mi_centro())
    or (es_del_sistema() and centro_responsable = mi_centro())));

commit;

select 'funciones' as que, count(*)::text as hay, '3' as esperado
  from pg_proc where proname in ('es_del_sistema', 'es_ambulancia', 'prestada_a')
union all
select 'policies de la 28', count(*)::text, '13'
  from pg_policies where schemaname = 'public'
   and policyname in ('orden_trabajo_read','proveedor_read','repuesto_read','alerta_read',
     'comentario_read','config_alerta_read','actividad_create','actividad_read','actividad_update',
     'historial_mantenimiento_create','historial_mantenimiento_read','historial_create','acceso_no_autorizado_create')
   and (coalesce(qual,'') || coalesce(with_check,'')) ~ '(es_del_sistema|super_admin)'
union all
select 'préstamos con Calidad (29)', count(*)::text, '3'
  from pg_policies where schemaname = 'public' and tablename = 'prestamo_vehiculo'
   and (coalesce(qual,'') || coalesce(with_check,'')) like '%encargado_salud%'
union all
select 'ficha para el centro que la tiene (29)', count(*)::text, '1'
  from pg_policies where schemaname = 'public' and policyname = 'equipo_read'
   and coalesce(qual,'') like '%prestada_a%'
union all
select 'columnas nuevas en actividad (30)', count(*)::text, '2'
  from information_schema.columns
 where table_schema = 'public' and table_name = 'actividad'
   and column_name in ('centro_responsable', 'prestamo_id')
union all
select 'historial para el centro a cargo (30)', count(*)::text, '1'
  from pg_policies where schemaname = 'public' and policyname = 'actividad_read'
   and coalesce(qual,'') like '%centro_responsable%';
