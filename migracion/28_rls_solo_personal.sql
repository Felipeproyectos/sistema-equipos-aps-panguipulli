-- ═══════════════════════════════════════════════════════════════════
-- 28_rls_solo_personal.sql
--
-- Que una sesión de Supabase no baste para leer o escribir datos del sistema.
--
-- El problema
-- ───────────
-- Este proyecto de Supabase es compartido con otro sistema
-- (carrera.apscolab.com). Sus usuarios tienen sesión válida acá también,
-- aunque no tengan ficha ni rol en este sistema. Algunas policies solo
-- pedían "estar autenticado":
--
--   · leer TODAS las órdenes de trabajo, proveedores, repuestos, alertas,
--     comentarios y la configuración de alertas (using (true));
--   · agregar actividades o mantenciones a CUALQUIER equipo con solo poner su
--     propio correo (un "mantenimiento realizado" falso en un DEA, por
--     ejemplo), y escribir en Auditoría lo que quisiera.
--
-- La regla nueva
-- ──────────────
-- "Estar dentro" = tener ficha con rol en `usuario` (es_del_sistema()).
-- Quien tiene rol conserva exactamente lo que podía hacer; quien no tiene
-- ficha (el otro sistema) deja de ver y de escribir. En Auditoría, cada uno
-- solo anota a su propio nombre.
--
-- app_config y centro siguen abiertos a cualquier sesión: son el nombre, el
-- logo y la lista de centros, que se ven antes de saber el rol.
--
-- Es re-ejecutable. Ejecutar una vez en Supabase (SQL Editor → New query →
-- pegar todo → Run).
-- ═══════════════════════════════════════════════════════════════════

begin;

create or replace function es_del_sistema() returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce(mi_rol(), '') <> '' $$;

-- ── Lecturas que estaban abiertas a cualquier sesión ────────────────
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

-- ── Actividad: "su propio correo" vale solo para quien tiene rol ─────
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

-- ── Historial de mantenimiento: igual ───────────────────────────────
drop policy if exists historial_mantenimiento_create on historial_mantenimiento;
create policy historial_mantenimiento_create on historial_mantenimiento for insert to authenticated
  with check ((mi_rol() = 'super_admin' or mi_rol() = 'admin' or mi_rol() = 'encargado_salud'
    or (es_del_sistema() and cargado_por_email = (auth.jwt() ->> 'email'))));

drop policy if exists historial_mantenimiento_read on historial_mantenimiento;
create policy historial_mantenimiento_read on historial_mantenimiento for select to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'admin' or mi_rol() = 'encargado_salud'
    or mi_rol() = 'jefe_taller' or mi_rol() = 'mecanico' or mi_rol() = 'monitor_corporativo'
    or (es_del_sistema() and cargado_por_email = (auth.jwt() ->> 'email'))));

-- ── Auditoría: quien está dentro anota, y solo a su propio nombre ───
drop policy if exists historial_create on historial;
create policy historial_create on historial for insert to authenticated
  with check (es_del_sistema()
    and lower(coalesce(usuario_email, '')) = lower(coalesce(auth.jwt() ->> 'email', '')));

-- Los ingresos los escribe el servidor (llave de servicio); desde el
-- navegador ya no hace falta.
drop policy if exists acceso_no_autorizado_create on acceso_no_autorizado;
create policy acceso_no_autorizado_create on acceso_no_autorizado for insert to authenticated
  with check (mi_rol() = 'super_admin');

commit;

-- ── Verificación ────────────────────────────────────────────────────
-- Las dos filas deben coincidir.
select 'policies que piden ser del sistema' as que, count(*)::text as hay, '13' as esperado
from pg_policies
where schemaname = 'public'
  and policyname in ('orden_trabajo_read', 'proveedor_read', 'repuesto_read', 'alerta_read',
    'comentario_read', 'config_alerta_read', 'actividad_create', 'actividad_read', 'actividad_update',
    'historial_mantenimiento_create', 'historial_mantenimiento_read', 'historial_create', 'acceso_no_autorizado_create')
  and (coalesce(qual, '') || coalesce(with_check, '')) ~ '(es_del_sistema|super_admin)'
union all
select 'lecturas que siguen abiertas a cualquier sesión', count(*)::text, '0'
from pg_policies
where schemaname = 'public' and cmd = 'SELECT' and qual = 'true'
  and tablename in ('orden_trabajo', 'proveedor', 'repuesto', 'alerta', 'comentario', 'config_alerta');
