-- Auditoría: dejar que TODOS escriban, que solo Base del Sistema lea.
--
-- En 03_policies.sql el insert de `historial` y `acceso_no_autorizado` estaba
-- restringido a super_admin. Con esa regla la auditoría solo podía registrar
-- lo que hacía el super_admin: las acciones de mecánicos, jefes de taller,
-- encargados y admins las rechazaba la policy en silencio — que es justo lo
-- contrario de lo que una auditoría tiene que hacer.
--
-- La lectura NO cambia: sigue siendo exclusiva de super_admin.
--
-- Correr una vez en el SQL Editor de Supabase.

-- Historial: quién crea, edita y elimina qué.
drop policy if exists historial_create on historial;
create policy historial_create on historial for insert to authenticated
  with check (true);

-- Nadie puede reescribir ni borrar el registro, ni el super_admin: una bitácora
-- que se puede editar no sirve como evidencia.
drop policy if exists historial_update on historial;
drop policy if exists historial_delete on historial;

-- Ingresos al sistema (exitosos y rechazados).
drop policy if exists acceso_no_autorizado_create on acceso_no_autorizado;
create policy acceso_no_autorizado_create on acceso_no_autorizado for insert to authenticated
  with check (true);

drop policy if exists acceso_no_autorizado_update on acceso_no_autorizado;
drop policy if exists acceso_no_autorizado_delete on acceso_no_autorizado;

-- Las listas de auditoría se piden siempre ordenadas por fecha descendente.
create index if not exists historial_created_date_idx on historial (created_date desc);
create index if not exists acceso_fecha_intento_idx on acceso_no_autorizado (fecha_intento desc);
