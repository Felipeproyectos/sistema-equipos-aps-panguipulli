-- ═══════════════════════════════════════════════════════════════════
-- 29_prestamo_ambulancias.sql
--
-- Calidad presta ambulancias, y el centro que la recibe le aplica sus pautas.
--
-- Qué cambia
-- ──────────
-- Los préstamos de vehículos (`prestamo_vehiculo`, 16_prestamos.sql) los
-- registraba solo Movilización. Mientras Movilización no los use, los
-- registra Calidad (encargado_salud) para las ambulancias de su centro.
--
--   · Crear: Calidad del centro DUEÑO de la ambulancia.
--   · Registrar la devolución: Calidad del centro dueño o del que la recibió.
--   · Ver: Calidad y el personal de los dos centros.
--
-- Mientras dure el préstamo, el centro que la recibió ve la ficha de la
-- ambulancia y su historial de actividades (para aplicarle sus pautas y
-- revisarlas). La ficha la sigue editando el dueño.
--
-- Movilización conserva todo lo que ya podía hacer.
--
-- Requiere 16_prestamos.sql. Si todavía no corriste 28_rls_solo_personal.sql,
-- corre esa primero. Es re-ejecutable. Ejecutar una vez en Supabase (SQL
-- Editor → New query → pegar todo → Run).
-- ═══════════════════════════════════════════════════════════════════

begin;

-- ── Funciones de apoyo (security definer: leen tablas con RLS) ──────
create or replace function es_del_sistema() returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce(mi_rol(), '') <> '' $$;

create or replace function es_ambulancia(id_equipo text) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from equipo where id = id_equipo and tipo = 'ambulancia') $$;

-- El centro que tiene prestada hoy la ambulancia, o null.
create or replace function prestada_a(id_equipo text) returns text
  language sql stable security definer set search_path = public as $$
  select centro_destino from prestamo_vehiculo
   where equipo_id = id_equipo and estado = 'vigente'
   order by desde desc limit 1 $$;

-- ── Préstamos: quién los ve ─────────────────────────────────────────
drop policy if exists prestamo_vehiculo_read on prestamo_vehiculo;
create policy prestamo_vehiculo_read on prestamo_vehiculo for select to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'admin'
    or mi_rol() = 'monitor_corporativo' or mi_rol() = 'encargado_movilizacion'
    or mi_rol() = 'jefe_taller'
    or (mi_rol() in ('encargado_salud', 'encargado_compras_salud', 'user')
        and (centro_origen = mi_centro() or centro_destino = mi_centro()))));

-- ── Préstamos: quién los registra ───────────────────────────────────
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

-- ── La ficha: el centro que la tiene prestada la ve ─────────────────
-- Las condiciones anteriores (14_choferes.sql) se copian tal cual; se
-- agrega la última.
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

-- ── Su historial: también, mientras la tenga ────────────────────────
-- Igual que en 28_rls_solo_personal.sql, más la última condición.
drop policy if exists actividad_read on actividad;
create policy actividad_read on actividad for select to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'admin'
    or (es_del_sistema() and usuario_email = (auth.jwt() ->> 'email'))
    or centro_del_equipo(equipo_id) = mi_centro()
    or (es_del_sistema() and prestada_a(equipo_id) = mi_centro())));

commit;

-- ── Verificación ────────────────────────────────────────────────────
-- Todas las filas deben coincidir.
select 'funciones de apoyo' as que, count(*)::text as hay, '3' as esperado
  from pg_proc where proname in ('es_del_sistema', 'es_ambulancia', 'prestada_a')
union all
select 'policies de préstamos con Calidad', count(*)::text, '3'
  from pg_policies where schemaname = 'public' and tablename = 'prestamo_vehiculo'
   and policyname in ('prestamo_vehiculo_read', 'prestamo_vehiculo_create', 'prestamo_vehiculo_update')
   and (coalesce(qual, '') || coalesce(with_check, '')) like '%encargado_salud%'
union all
select 'ficha e historial para el centro que la tiene', count(*)::text, '2'
  from pg_policies where schemaname = 'public'
   and policyname in ('equipo_read', 'actividad_read')
   and coalesce(qual, '') like '%prestada_a%';
