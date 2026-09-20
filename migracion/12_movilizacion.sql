-- ═══════════════════════════════════════════════════════════════════
-- 12_movilizacion.sql
--
-- El perfil Encargado de Movilización y el puente entre Calidad y Taller.
--
-- Qué problema resuelve
-- ─────────────────────
-- Hoy Calidad YA puede pedir mantenimiento de un vehículo: la tabla
-- `solicitud` tiene los tipos 'mantenimiento_correctivo', 'revision_tecnica'
-- y 'mantenimiento_preventivo', y el Encargado de Salud los ve en su pantalla.
--
-- Pero esa solicitud no llega a ninguna parte. No existe campo que la una a
-- una orden de trabajo, y nadie del Taller la ve. Queda en una lista pasando
-- de 'pendiente' a 'finalizada' a mano, sin que el taller se entere nunca.
--
-- El lado que pide existe; el que recibe, no. Eso es lo que agrega este
-- archivo: un perfil cuyo trabajo es recibir esas solicitudes, decidir cuáles
-- van al taller, y dejar la orden de trabajo enlazada con la solicitud que la
-- originó.
--
-- IMPORTANTE: todo acá es ADITIVO. Cada policy se reescribe copiando su
-- condición actual tal cual y agregando `or mi_rol() = 'encargado_movilizacion'`.
-- Nadie pierde un permiso que hoy tenga.
--
-- Ejecutar una sola vez en Supabase (SQL Editor). Es re-ejecutable.
-- ═══════════════════════════════════════════════════════════════════

-- ── Antes: cuántas solicitudes de vehículo están esperando a nadie ──
-- Solo lectura. Estas son las que hoy no tienen destinatario.
select
  estado,
  count(*) as solicitudes
from solicitud
where tipo in ('mantenimiento_correctivo', 'mantenimiento_preventivo', 'revision_tecnica')
group by 1
order by 2 desc;

begin;

-- ── 1) El vínculo que faltaba ───────────────────────────────────────
-- Una orden de trabajo nacida de una solicitud recuerda cuál fue. Sin esto,
-- Calidad no puede saber en qué terminó lo que pidió.
alter table orden_trabajo add column if not exists solicitud_id text;

create index if not exists orden_trabajo_solicitud_idx
  on orden_trabajo (solicitud_id);

-- ── 2) Movilización lee las solicitudes ─────────────────────────────
-- Su trabajo es atender las de cualquier centro, así que necesita verlas
-- todas. Se agrega al final; los cuatro casos que ya existían quedan igual.
drop policy if exists solicitud_read on solicitud;
create policy solicitud_read on solicitud for select to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'admin' or mi_rol() = 'encargado_salud'
    or mi_rol() = 'encargado_compras_salud' or created_by_id = mi_id()
    or mi_rol() = 'encargado_movilizacion'));

-- ── 3) Movilización mueve el estado de la solicitud ─────────────────
-- La pasa a 'en_proceso' cuando la deriva al taller y a 'finalizada' cuando
-- el trabajo terminó. NO puede crear solicitudes: esas nacen en Calidad, y
-- `solicitud_create` no se toca.
drop policy if exists solicitud_update on solicitud;
create policy solicitud_update on solicitud for update to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'admin' or mi_rol() = 'encargado_salud'
    or (created_by_id = mi_id() and estado = 'pendiente')
    or mi_rol() = 'encargado_movilizacion'))
  with check ((mi_rol() = 'super_admin' or mi_rol() = 'admin' or mi_rol() = 'encargado_salud'
    or (created_by_id = mi_id() and estado = 'pendiente')
    or mi_rol() = 'encargado_movilizacion'));

-- ── 4) Movilización abre órdenes de trabajo ─────────────────────────
-- Es el único perfil fuera del Taller que puede abrir una orden a partir de
-- una solicitud. No la ejecuta ni la cierra: `orden_trabajo_update` no se
-- toca, así que eso sigue siendo del Taller.
drop policy if exists orden_trabajo_create on orden_trabajo;
create policy orden_trabajo_create on orden_trabajo for insert to authenticated
  with check ((mi_rol() = 'super_admin' or mi_rol() = 'admin' or mi_rol() = 'encargado_salud'
    or mi_rol() = 'jefe_taller' or mi_rol() = 'mecanico'
    or mi_rol() = 'encargado_movilizacion'));

-- `orden_trabajo_read` NO se toca: hoy es `using (true)` y cualquiera que esté
-- dentro las lee. Restringirla acá rompería la pestaña de Taller que Calidad
-- ve en la ficha de un equipo.

-- ── 5) Los equipos, para saber a qué vehículo le está pasando algo ──
-- Solo lectura. La ficha la mantiene quien corresponda; Movilización la mira.
drop policy if exists equipo_read on equipo;
create policy equipo_read on equipo for select to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'admin' or mi_rol() = 'monitor_corporativo'
    or (mi_rol() = 'jefe_taller' and tipo = 'ambulancia')
    or (mi_rol() = 'mecanico' and tipo = 'ambulancia')
    or (mi_rol() = 'encargado_compras_taller' and tipo = 'ambulancia')
    or centro_principal = mi_centro()
    or mi_rol() = 'encargado_movilizacion'));

commit;

-- ── Verificación ────────────────────────────────────────────────────
-- 1. La columna nueva existe. Debe devolver una fila.
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'orden_trabajo'
  and column_name = 'solicitud_id';

-- 2. Las cuatro policies que nombran al perfil nuevo.
select tablename as tabla, policyname as policy, cmd as operacion
from pg_policies
where schemaname = 'public'
  and coalesce(qual, '') || coalesce(with_check, '') like '%encargado_movilizacion%'
order by tablename, cmd;

-- 3. Nadie perdió permisos: estas condiciones deben seguir apareciendo.
--    Se esperan 3 filas (solicitud select, solicitud update, orden_trabajo insert).
select tablename as tabla, policyname as policy
from pg_policies
where schemaname = 'public'
  and (
    (tablename = 'solicitud' and coalesce(qual, '') like '%encargado_compras_salud%')
    or (tablename = 'solicitud' and coalesce(qual, '') like '%pendiente%')
    or (tablename = 'orden_trabajo' and coalesce(with_check, '') like '%encargado_salud%')
  )
order by tablename, policyname;

-- ── Después ─────────────────────────────────────────────────────────
-- Para que alguien entre con este perfil hay que crearle la cuenta desde
-- Usuarios, eligiendo "Encargado de Movilización". La pantalla de Movilización
-- aparece sola en su menú.
