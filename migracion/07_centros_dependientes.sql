-- ═══════════════════════════════════════════════════════════════════
-- 07_centros_dependientes.sql
-- La red tiene TRES centros principales:
--   CESFAM Panguipulli · CESFAM Coñaripe · CESFAM Choshuenco
--
-- Los CECOSF y la Corporación se cargaron por error como centro principal.
-- Pasan a ser subsedes del CESFAM del que dependen:
--   CECOSF Liquiñe                      → CESFAM Coñaripe    / CECOSF Liquiñe
--   CECOSF Neltume                      → CESFAM Choshuenco  / CECOSF Neltume
--   Corporación Municipal de Panguipulli → CESFAM Panguipulli / Corporación Municipal
--
-- No borra ningún equipo, alerta ni usuario: solo los reubica. Cada UPDATE
-- conserva la subsede que el registro ya tuviera y solo la completa cuando
-- viene vacía.
-- Ejecutar una sola vez en Supabase (SQL Editor).
-- ═══════════════════════════════════════════════════════════════════

begin;

-- ── 1) Equipos ──────────────────────────────────────────────────────
update equipo
set centro_principal = 'CESFAM Coñaripe',
    subsede = coalesce(nullif(btrim(subsede), ''), 'CECOSF Liquiñe')
where btrim(centro_principal) = 'CECOSF Liquiñe';

update equipo
set centro_principal = 'CESFAM Choshuenco',
    subsede = coalesce(nullif(btrim(subsede), ''), 'CECOSF Neltume')
where btrim(centro_principal) = 'CECOSF Neltume';

update equipo
set centro_principal = 'CESFAM Panguipulli',
    subsede = coalesce(nullif(btrim(subsede), ''), 'Corporación Municipal')
where btrim(centro_principal) = 'Corporación Municipal de Panguipulli';

-- ── 2) Alertas (usan `centro`, no `centro_principal`) ───────────────
update alerta
set centro = 'CESFAM Coñaripe',
    subsede = coalesce(nullif(btrim(subsede), ''), 'CECOSF Liquiñe')
where btrim(centro) = 'CECOSF Liquiñe';

update alerta
set centro = 'CESFAM Choshuenco',
    subsede = coalesce(nullif(btrim(subsede), ''), 'CECOSF Neltume')
where btrim(centro) = 'CECOSF Neltume';

update alerta
set centro = 'CESFAM Panguipulli',
    subsede = coalesce(nullif(btrim(subsede), ''), 'Corporación Municipal')
where btrim(centro) = 'Corporación Municipal de Panguipulli';

-- ── 3) Usuarios ─────────────────────────────────────────────────────
-- centro_principal
update usuario
set centro_principal = 'CESFAM Coñaripe'
where btrim(centro_principal) = 'CECOSF Liquiñe';

update usuario
set centro_principal = 'CESFAM Choshuenco'
where btrim(centro_principal) = 'CECOSF Neltume';

update usuario
set centro_principal = 'CESFAM Panguipulli'
where btrim(centro_principal) = 'Corporación Municipal de Panguipulli';

-- subsedes_asignadas: quién debe ver qué posta es una decisión de alcance que
-- no se deduce de los datos. Revisar a mano después de correr el resto:
--   select email, role, centro_principal, subsedes_asignadas, centros_asignados
--   from usuario order by centro_principal, email;

-- centros_asignados: cambiar el nombre del centro dependiente por el CESFAM.
update usuario
set centros_asignados = (
  select jsonb_agg(distinct
    case btrim(valor)
      when 'CECOSF Liquiñe' then 'CESFAM Coñaripe'
      when 'CECOSF Neltume' then 'CESFAM Choshuenco'
      when 'Corporación Municipal de Panguipulli' then 'CESFAM Panguipulli'
      else valor
    end)
  from jsonb_array_elements_text(centros_asignados) as valor
)
where centros_asignados is not null
  and jsonb_typeof(centros_asignados) = 'array'
  and exists (
    select 1 from jsonb_array_elements_text(centros_asignados) as valor
    where btrim(valor) in ('CECOSF Liquiñe', 'CECOSF Neltume', 'Corporación Municipal de Panguipulli')
  );

-- ── 4) Invitaciones pendientes ──────────────────────────────────────
update invitacion_pendiente
set centro_principal = case btrim(centro_principal)
      when 'CECOSF Liquiñe' then 'CESFAM Coñaripe'
      when 'CECOSF Neltume' then 'CESFAM Choshuenco'
      when 'Corporación Municipal de Panguipulli' then 'CESFAM Panguipulli'
      else centro_principal
    end
where btrim(centro_principal) in ('CECOSF Liquiñe', 'CECOSF Neltume', 'Corporación Municipal de Panguipulli');

-- ── 5) Tabla `centro`: dejar solo los tres, con sus subsedes ────────
update centro
set sucursales = (
  select jsonb_agg(distinct valor)
  from (
    select jsonb_array_elements_text(coalesce(sucursales, '[]'::jsonb)) as valor
    union select 'Corporación Municipal'
  ) s
)
where btrim(nombre) = 'CESFAM Panguipulli';

update centro
set sucursales = (
  select jsonb_agg(distinct valor)
  from (
    select jsonb_array_elements_text(coalesce(sucursales, '[]'::jsonb)) as valor
    union select 'CECOSF Liquiñe'
  ) s
)
where btrim(nombre) = 'CESFAM Coñaripe';

update centro
set sucursales = (
  select jsonb_agg(distinct valor)
  from (
    select jsonb_array_elements_text(coalesce(sucursales, '[]'::jsonb)) as valor
    union select 'CECOSF Neltume'
  ) s
)
where btrim(nombre) = 'CESFAM Choshuenco';

delete from centro
where btrim(nombre) in ('CECOSF Liquiñe', 'CECOSF Neltume', 'Corporación Municipal de Panguipulli');

commit;

-- ── Verificación ────────────────────────────────────────────────────
select nombre, sucursales from centro order by nombre;

select centro_principal, coalesce(nullif(btrim(subsede), ''), '(sede central)') as subsede, count(*)
from equipo
group by 1, 2
order by 1, 2;
