-- ═══════════════════════════════════════════════════════════════════
-- 13_flota.sql
--
-- Movilización administra las fichas de los vehículos corporativos.
--
-- Qué problema resuelve
-- ─────────────────────
-- Con 12_movilizacion.sql el Encargado puede LEER las fichas, pero no
-- crear ni editar ninguna. Hoy la ficha de una camioneta municipal la
-- tiene que cargar Base del Sistema o un Administrador, aunque quien
-- conoce ese vehículo es Movilización.
--
-- Qué se abre y qué NO
-- ────────────────────
-- Se abre SOLO sobre los vehículos corporativos:
--     camioneta · furgon · camion_3_4
--
-- La AMBULANCIA queda fuera a propósito. Su ficha es de Calidad: ahí
-- viven las pautas, el historial clínico y la información con la que el
-- personal de salud identifica el equipo. Movilización la ve completa
-- (12_movilizacion.sql le dio lectura) y puede pedirle cosas al taller,
-- pero no la edita. Los equipos que no son vehículos — DEA, monitores —
-- tampoco: no tienen nada que ver con la flota.
--
-- Borrar tampoco: `equipo_delete` no se toca y sigue siendo de
-- super_admin y admin.
--
-- IMPORTANTE: todo acá es ADITIVO. Las dos policies se reescriben
-- copiando su condición actual tal cual y agregando el caso nuevo al
-- final. Nadie pierde un permiso que hoy tenga.
--
-- Ejecutar una sola vez en Supabase (SQL Editor). Es re-ejecutable.
-- ═══════════════════════════════════════════════════════════════════

-- ── Antes: qué vehículos hay cargados y de qué tipo ─────────────────
-- Solo lectura. Las filas 'camioneta', 'furgon' y 'camion_3_4' son las
-- que Movilización va a poder mantener después de esto.
select
  tipo,
  count(*) as vehiculos
from equipo
where tipo in ('ambulancia', 'camioneta', 'furgon', 'camion_3_4')
group by 1
order by 2 desc;

begin;

-- ── 1) Movilización carga fichas de vehículos corporativos ──────────
-- Los tres casos que ya existían quedan igual; el nuevo va al final y
-- está acotado por `tipo`, así que este perfil no puede crear un DEA,
-- un monitor ni una ambulancia.
drop policy if exists equipo_create on equipo;
create policy equipo_create on equipo for insert to authenticated
  with check ((mi_rol() = 'super_admin' or mi_rol() = 'admin'
    or (mi_rol() = 'encargado_salud' and centro_principal = mi_centro())
    or (mi_rol() = 'encargado_movilizacion'
        and tipo in ('camioneta', 'furgon', 'camion_3_4'))));

-- ── 2) Y las mantiene al día ────────────────────────────────────────
-- El `tipo` se acota en las DOS mitades a propósito:
--   using      → sobre qué filas puede actuar (la fila como está hoy)
--   with check → cómo puede quedar la fila después
-- Sin la segunda, este perfil podría tomar una camioneta suya y
-- cambiarle el tipo a 'ambulancia', quedándose con una ficha de Calidad.
drop policy if exists equipo_update on equipo;
create policy equipo_update on equipo for update to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'admin'
    or (mi_rol() = 'encargado_salud' and centro_principal = mi_centro())
    or (mi_rol() = 'encargado_movilizacion'
        and tipo in ('camioneta', 'furgon', 'camion_3_4'))))
  with check ((mi_rol() = 'super_admin' or mi_rol() = 'admin'
    or (mi_rol() = 'encargado_salud' and centro_principal = mi_centro())
    or (mi_rol() = 'encargado_movilizacion'
        and tipo in ('camioneta', 'furgon', 'camion_3_4'))));

-- `equipo_read` NO se toca: 12_movilizacion.sql ya le dio lectura de
-- todas las fichas, que es lo que necesita para administrar la flota y
-- para resolver a qué vehículo apunta una solicitud.

-- `equipo_delete` NO se toca: dar de baja un vehículo sigue siendo de
-- super_admin y admin.

commit;

-- ── Verificación ────────────────────────────────────────────────────
-- 1. Las dos policies nombran al perfil y acotan por tipo.
--    Se esperan 2 filas, ambas con acota_por_tipo = true.
select
  policyname as policy,
  cmd as operacion,
  (coalesce(qual, '') || coalesce(with_check, '')) like '%camion_3_4%' as acota_por_tipo
from pg_policies
where schemaname = 'public'
  and tablename = 'equipo'
  and coalesce(qual, '') || coalesce(with_check, '') like '%encargado_movilizacion%'
order by cmd;

-- 2. Nadie perdió permisos: estas condiciones deben seguir apareciendo.
--    Se esperan 2 filas (equipo insert, equipo update).
select tablename as tabla, policyname as policy, cmd as operacion
from pg_policies
where schemaname = 'public'
  and tablename = 'equipo'
  and coalesce(with_check, '') like '%encargado_salud%'
  and coalesce(with_check, '') like '%mi_centro()%'
order by cmd;

-- 3. La ambulancia sigue siendo intocable para este perfil.
--    Debe devolver 0 filas: ninguna policy de escritura lo autoriza
--    sobre 'ambulancia'.
select policyname as policy, cmd as operacion
from pg_policies
where schemaname = 'public'
  and tablename = 'equipo'
  and cmd in ('INSERT', 'UPDATE', 'DELETE')
  and coalesce(qual, '') || coalesce(with_check, '') like '%encargado_movilizacion%'
  and coalesce(qual, '') || coalesce(with_check, '') like '%ambulancia%';

-- ── Después ─────────────────────────────────────────────────────────
-- El Encargado de Movilización ve "Vehículos" en su menú, con las fichas
-- de toda la flota. Puede cargar y editar las corporativas; las
-- ambulancias las ve completas, en lectura.
