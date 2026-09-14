-- ═══════════════════════════════════════════════════════════════════
-- 11_auditoria_registra_a_todos.sql
--
-- La pestaña "Acciones por Perfil" de Auditoría solo muestra lo que hizo
-- Base del Sistema. Filtrar por Mecánico, Jefe de Taller o cualquier otro
-- perfil devuelve "Sin acciones registradas".
--
-- No es que no hagan nada: es que sus filas nunca llegan a guardarse.
--
-- El motivo
-- ─────────
-- La policy de 03_policies.sql dice:
--
--   create policy historial_create on historial for insert to authenticated
--     with check (mi_rol() = 'super_admin');
--
-- O sea: solo super_admin puede ESCRIBIR en el historial. Cuando un mecánico
-- cierra una orden de trabajo, la aplicación intenta anotar esa acción, la
-- base la rechaza, y el navegador se lo traga con un console.warn. La acción
-- ocurre; el registro no.
--
-- Una tabla de auditoría tiene que funcionar al revés: cualquiera que esté
-- dentro puede AGREGAR una línea, y solo Base del Sistema puede LEERLAS. Lo
-- que no debe poder nadie es editar ni borrar lo ya escrito, y eso no cambia.
--
-- Qué NO toca este archivo
-- ────────────────────────
-- La lectura sigue siendo exclusiva de Base del Sistema. Nadie más ve la
-- Auditoría, ni antes ni después.
--
-- Los INGRESOS (quién entró y cuándo) ya no dependen de esto: los escribe el
-- servidor con la llave de servicio desde que se desplegó el arreglo. Aun así
-- se ajusta también su policy, para que la tabla quede coherente.
--
-- Ejecutar una sola vez en Supabase (SQL Editor). Es re-ejecutable.
-- ═══════════════════════════════════════════════════════════════════

-- ── Antes: cuántas filas hay y de quién ────────────────────────────
-- Solo lectura. Sirve para comparar después de unos días de uso.
select
  coalesce(nullif(btrim(usuario_rol), ''), '(sin rol)') as perfil,
  count(*)                                             as acciones
from historial
group by 1
order by 2 desc;

begin;

-- ── 1) Acciones: cualquiera anota, solo Base del Sistema lee ───────
drop policy if exists historial_create on historial;
create policy historial_create on historial for insert to authenticated
  with check (true);

-- Lectura, edición y borrado quedan como estaban: exclusivos de Base del
-- Sistema. Se reescriben acá solo para dejarlo explícito en un mismo lugar.
drop policy if exists historial_read on historial;
create policy historial_read on historial for select to authenticated
  using (mi_rol() = 'super_admin');

drop policy if exists historial_update on historial;
create policy historial_update on historial for update to authenticated
  using (mi_rol() = 'super_admin')
  with check (mi_rol() = 'super_admin');

-- ── 2) Ingresos: lo mismo ──────────────────────────────────────────
drop policy if exists acceso_no_autorizado_create on acceso_no_autorizado;
create policy acceso_no_autorizado_create on acceso_no_autorizado for insert to authenticated
  with check (true);

drop policy if exists acceso_no_autorizado_read on acceso_no_autorizado;
create policy acceso_no_autorizado_read on acceso_no_autorizado for select to authenticated
  using (mi_rol() = 'super_admin');

commit;

-- ── Verificación ───────────────────────────────────────────────────
-- Las dos de escritura deben decir `true`; las de lectura, super_admin.
select
  tablename  as tabla,
  policyname as policy,
  cmd        as operacion,
  coalesce(qual, with_check) as condicion
from pg_policies
where schemaname = 'public'
  and tablename in ('historial', 'acceso_no_autorizado')
order by tablename, cmd, policyname;

-- ── Después de unos días ───────────────────────────────────────────
-- Volver a correr la consulta del principio: deberían aparecer perfiles que
-- antes no salían (Mecánico, Jefe de Taller, Encargado Salud...).
