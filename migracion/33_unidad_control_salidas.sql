-- ═══════════════════════════════════════════════════════════════════
-- 33_unidad_control_salidas.sql
--
-- La Unidad de Control lee la bitácora de salidas de la flota.
--
-- Por qué
-- ───────
-- El panel de "Combustible y pagos" muestra kilómetros recorridos, salidas
-- por vehículo y por conductor, y el costo por kilómetro. Esos datos viven en
-- bitacora_flota (18_bitacora_flota.sql), que hoy solo leen Movilización, el
-- Taller, el Monitor y la administración.
--
-- Qué hace
-- ────────
-- Agrega la Unidad de Control a la policy de LECTURA de bitacora_flota. No
-- puede crear ni modificar salidas: eso sigue siendo de Movilización y de cada
-- chofer. Se conserva todo lo que ya estaba.
--
-- Es re-ejecutable. Ejecutar una vez en Supabase (SQL Editor → New query →
-- pegar todo → Run).
-- ═══════════════════════════════════════════════════════════════════

begin;

drop policy if exists bitacora_flota_read on bitacora_flota;
create policy bitacora_flota_read on bitacora_flota for select to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'admin'
    or mi_rol() = 'monitor_corporativo' or mi_rol() = 'encargado_movilizacion'
    or mi_rol() = 'jefe_taller' or mi_rol() = 'unidad_control'
    or chofer_id = mi_id()));

commit;

-- ── Verificación: debe decir 1 ──────────────────────────────────────
select 'Unidad de Control lee la bitácora' as que, count(*)::text as hay, '1' as esperado
  from pg_policies where schemaname = 'public' and tablename = 'bitacora_flota'
    and policyname = 'bitacora_flota_read' and coalesce(qual, '') like '%unidad_control%';
