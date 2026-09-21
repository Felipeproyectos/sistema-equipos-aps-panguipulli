-- ═══════════════════════════════════════════════════════════════════
-- 14_choferes.sql
--
-- Los choferes, su licencia de conducir, y el aviso antes de que venza.
--
-- Qué agrega
-- ──────────
-- 1. Acota `equipo_read` para Movilización a los vehículos (pedido aparte,
--    ver más abajo).
-- 2. Los campos de la licencia en `usuario`.
-- 3. `chofer_id` en `alerta`, para que un aviso pueda colgar de una persona
--    y no solo de un equipo.
-- 4. Movilización puede cerrar las alertas que le llegan.
--
-- El rol `chofer` NO necesita nada acá: `usuario.role` es una columna de
-- texto sin restricción, y quién puede crear cada rol lo decide
-- `gestionarAcceso` en el servidor, no la base.
--
-- IMPORTANTE: las dos policies que se reescriben copian su condición
-- actual tal cual. La única condición que CAMBIA en todo el archivo es la
-- de `encargado_movilizacion` en `equipo_read`, y se estrecha a propósito,
-- a pedido. Ningún otro perfil gana ni pierde nada.
--
-- Ejecutar una sola vez en Supabase (SQL Editor). Es re-ejecutable.
-- ═══════════════════════════════════════════════════════════════════

-- ── Antes: cuántas cuentas hay de cada perfil ───────────────────────
-- Solo lectura. Sirve para comparar después de crear los choferes.
select coalesce(role, '(sin rol)') as perfil, count(*) as cuentas
from usuario
group by 1
order by 2 desc;

begin;

-- ── 1) La licencia de conducir ──────────────────────────────────────
-- Van en `usuario` y no en una tabla aparte porque el chofer ES un
-- usuario del sistema: entra con su cuenta y carga esto él mismo la
-- primera vez. Quedan nulas para todos los demás perfiles.
alter table usuario add column if not exists licencia_numero text;
alter table usuario add column if not exists licencia_clase text;
alter table usuario add column if not exists licencia_vencimiento date;

-- Para buscar las que están por vencer sin recorrer la tabla entera.
create index if not exists usuario_licencia_vencimiento_idx
  on usuario (licencia_vencimiento)
  where licencia_vencimiento is not null;

-- ── 2) Una alerta puede colgar de una persona ───────────────────────
-- Hasta hoy toda alerta apuntaba a un equipo (`equipo_id`). La licencia
-- vencida no es de un vehículo, es de un chofer. La pantalla de Alertas
-- ya tolera una alerta sin equipo: su propio formulario guarda
-- `equipo_id: null` y muestra "Sin equipo".
alter table alerta add column if not exists chofer_id text;

create index if not exists alerta_chofer_idx on alerta (chofer_id);

-- ── 3) Movilización cierra las alertas que le llegan ────────────────
-- Cuando el chofer renueva su licencia, el Encargado marca la alerta
-- como resuelta. Los cuatro perfiles que ya podían quedan igual.
drop policy if exists alerta_update on alerta;
create policy alerta_update on alerta for update to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'admin'
    or mi_rol() = 'encargado_salud' or mi_rol() = 'encargado_compras_salud'
    or mi_rol() = 'encargado_movilizacion'))
  with check ((mi_rol() = 'super_admin' or mi_rol() = 'admin'
    or mi_rol() = 'encargado_salud' or mi_rol() = 'encargado_compras_salud'
    or mi_rol() = 'encargado_movilizacion'));

-- `alerta_create` NO se toca: las alertas de licencia las crea la tarea
-- de las 03:00, que corre con la llave de servicio y no pasa por RLS.

-- ── 4) Movilización lee vehículos, no todo el inventario ────────────
-- En 12_movilizacion.sql le abrí `equipo_read` entera, para no estrechar
-- una policy recién puesta. Queda parejo con lo que la pantalla muestra:
-- los DEA y los monitores no son asunto de la flota.
--
-- Esta es la ÚNICA condición que cambia en todo el archivo, y estrecha.
-- Las siete anteriores se copian tal cual.
drop policy if exists equipo_read on equipo;
create policy equipo_read on equipo for select to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'admin' or mi_rol() = 'monitor_corporativo'
    or (mi_rol() = 'jefe_taller' and tipo = 'ambulancia')
    or (mi_rol() = 'mecanico' and tipo = 'ambulancia')
    or (mi_rol() = 'encargado_compras_taller' and tipo = 'ambulancia')
    or centro_principal = mi_centro()
    or (mi_rol() = 'encargado_movilizacion'
        and tipo in ('ambulancia', 'camioneta', 'furgon', 'camion_3_4'))));

commit;

-- ── Verificación ────────────────────────────────────────────────────
-- 1. Las tres columnas de la licencia y la de la alerta.
--    Se esperan 4 filas.
select table_name as tabla, column_name as columna, data_type as tipo
from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'usuario' and column_name like 'licencia%')
    or (table_name = 'alerta' and column_name = 'chofer_id'))
order by table_name, column_name;

-- 2. Movilización quedó acotada a vehículos en la lectura de equipos.
--    La columna `acotada_a_vehiculos` es un valor CALCULADO acá mismo,
--    no una columna de la base. Debe salir true.
select
  policyname as policy,
  (coalesce(qual, '') like '%camion_3_4%') as acotada_a_vehiculos
from pg_policies
where schemaname = 'public' and tablename = 'equipo' and cmd = 'SELECT';

-- 3. Nadie perdió lectura de equipos: las tres condiciones de Taller y
--    la de centro propio siguen ahí. Se esperan 4 filas, todas true.
select 'jefe_taller ve ambulancias'      as condicion,
       coalesce(qual, '') like '%jefe_taller%'            as sigue
from pg_policies where schemaname='public' and tablename='equipo' and cmd='SELECT'
union all
select 'mecanico ve ambulancias',
       coalesce(qual, '') like '%mecanico%'
from pg_policies where schemaname='public' and tablename='equipo' and cmd='SELECT'
union all
select 'compras_taller ve ambulancias',
       coalesce(qual, '') like '%encargado_compras_taller%'
from pg_policies where schemaname='public' and tablename='equipo' and cmd='SELECT'
union all
select 'cada uno ve su centro',
       coalesce(qual, '') like '%mi_centro()%'
from pg_policies where schemaname='public' and tablename='equipo' and cmd='SELECT';

-- 4. Los cuatro perfiles que ya cerraban alertas siguen pudiendo.
--    Se esperan 4 filas, todas true.
select p.quien as perfil, coalesce(pol.with_check, '') like '%' || p.quien || '%' as sigue
from (values ('super_admin'), ('admin'), ('encargado_salud'), ('encargado_compras_salud')) as p(quien)
cross join (
  select with_check from pg_policies
  where schemaname='public' and tablename='alerta' and cmd='UPDATE'
) as pol;

-- ── Después ─────────────────────────────────────────────────────────
-- Movilización ve "Choferes" en su menú y puede crear esas cuentas. El
-- chofer entra, carga su licencia y su vencimiento, y desde esa noche la
-- tarea de las 03:00 avisa 60 días antes de que caduque.
