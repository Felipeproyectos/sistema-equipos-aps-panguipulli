-- ═══════════════════════════════════════════════════════════════════
-- 30_historial_prestamo.sql
--
-- El historial de las pautas hechas con una ambulancia prestada queda
-- también del centro que la tenía, aunque ya se haya devuelto.
--
-- Por qué
-- ───────
-- Con 29_prestamo_ambulancias.sql el centro que recibe una ambulancia ve su
-- historial MIENTRAS la tiene. Al devolverla lo pierde, y en una revisión o
-- auditoría tiene que poder mostrar las pautas que aplicó.
--
-- Qué hace
-- ────────
-- `actividad.centro_responsable`: el centro que tenía el equipo cuando se
-- hizo (si estaba prestado, el que lo recibió). Lo pone el servidor al
-- aprobar la pauta. Ese centro sigue viendo esas actividades siempre; el
-- dueño también, como hasta ahora. `actividad.prestamo_id`: el préstamo de
-- ese momento.
--
-- Las pautas mismas (con quién las hizo, quién las aprobó y sus fallas) ya
-- quedaban: se sacan desde Revisión Bitácora por período, en PDF o Excel.
--
-- Requiere 28 y 29. Es re-ejecutable. Ejecutar una vez en Supabase (SQL
-- Editor → New query → pegar todo → Run).
-- ═══════════════════════════════════════════════════════════════════

begin;

alter table actividad add column if not exists centro_responsable text;
alter table actividad add column if not exists prestamo_id text;
create index if not exists actividad_centro_responsable_idx on actividad (centro_responsable);

-- Igual que en 29_prestamo_ambulancias.sql, más la última condición.
drop policy if exists actividad_read on actividad;
create policy actividad_read on actividad for select to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'admin'
    or (es_del_sistema() and usuario_email = (auth.jwt() ->> 'email'))
    or centro_del_equipo(equipo_id) = mi_centro()
    or (es_del_sistema() and prestada_a(equipo_id) = mi_centro())
    or (es_del_sistema() and centro_responsable = mi_centro())));

commit;

-- ── Verificación ────────────────────────────────────────────────────
-- Las dos filas deben coincidir.
select 'columnas nuevas en actividad' as que, count(*)::text as hay, '2' as esperado
  from information_schema.columns
 where table_schema = 'public' and table_name = 'actividad'
   and column_name in ('centro_responsable', 'prestamo_id')
union all
select 'historial para el centro a cargo', count(*)::text, '1'
  from pg_policies where schemaname = 'public' and policyname = 'actividad_read'
   and coalesce(qual, '') like '%centro_responsable%';
