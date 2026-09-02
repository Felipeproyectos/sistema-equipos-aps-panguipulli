-- Generado por migracion/generar_sql.py. No editar a mano.
-- Enlace entre Supabase Auth y la tabla usuario heredada de Base44: por email,
-- porque los id de Base44 son ObjectId y los de auth.users son uuid.
alter table usuario add column if not exists auth_id uuid references auth.users(id);
create unique index if not exists usuario_email_uniq on usuario (lower(email));

-- security definer: estas funciones leen `usuario`, que tiene RLS activo. Sin
-- definer las policies que las llaman se llamarian a si mismas (recursion).
create or replace function mi_rol() returns text
  language sql stable security definer set search_path = public as $$
  select role from usuario where lower(email) = lower(auth.jwt() ->> 'email') limit 1 $$;

create or replace function mi_id() returns text
  language sql stable security definer set search_path = public as $$
  select id from usuario where lower(email) = lower(auth.jwt() ->> 'email') limit 1 $$;

-- El centro de un equipo, para las tablas que solo guardan equipo_id. Es
-- security definer por lo mismo que las de arriba: `equipo` tiene RLS y una
-- policy que lo consulte directo entraria en recursion.
create or replace function centro_del_equipo(id_equipo text) returns text
  language sql stable security definer set search_path = public as $$
  select centro_principal from equipo where id = id_equipo limit 1 $$;

create or replace function mi_centro() returns text
  language sql stable security definer set search_path = public as $$
  select centro_principal from usuario where lower(email) = lower(auth.jwt() ->> 'email') limit 1 $$;

-- usuario no trae rls en su .jsonc: se escribe a mano.
drop policy if exists usuario_lee on usuario;
create policy usuario_lee on usuario for select to authenticated
  using (lower(email) = lower(auth.jwt() ->> 'email') or mi_rol() in ('super_admin','admin','monitor_corporativo'));
drop policy if exists usuario_escribe on usuario;
create policy usuario_escribe on usuario for all to authenticated
  using (mi_rol() in ('super_admin','admin')) with check (mi_rol() in ('super_admin','admin'));

-- AccesoNoAutorizado
drop policy if exists acceso_no_autorizado_create on acceso_no_autorizado;
create policy acceso_no_autorizado_create on acceso_no_autorizado for insert to authenticated
  with check (mi_rol() = 'super_admin');
drop policy if exists acceso_no_autorizado_read on acceso_no_autorizado;
create policy acceso_no_autorizado_read on acceso_no_autorizado for select to authenticated
  using (mi_rol() = 'super_admin');
drop policy if exists acceso_no_autorizado_update on acceso_no_autorizado;
create policy acceso_no_autorizado_update on acceso_no_autorizado for update to authenticated
  using (mi_rol() = 'super_admin')
  with check (mi_rol() = 'super_admin');
drop policy if exists acceso_no_autorizado_delete on acceso_no_autorizado;
create policy acceso_no_autorizado_delete on acceso_no_autorizado for delete to authenticated
  using (mi_rol() = 'super_admin');

-- Actividad
drop policy if exists actividad_create on actividad;
create policy actividad_create on actividad for insert to authenticated
  with check ((mi_rol() = 'super_admin' or mi_rol() = 'admin' or (mi_rol() = 'encargado_salud' and centro_origen = mi_centro()) or usuario_email = (auth.jwt() ->> 'email')));
-- corregida a mano (ver POLICIES_CORREGIDAS en generar_sql.py)
drop policy if exists actividad_read on actividad;
create policy actividad_read on actividad for select to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'admin' or usuario_email = (auth.jwt() ->> 'email') or centro_del_equipo(equipo_id) = mi_centro()));
drop policy if exists actividad_update on actividad;
create policy actividad_update on actividad for update to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'admin' or (mi_rol() = 'encargado_salud' and centro_origen = mi_centro()) or usuario_email = (auth.jwt() ->> 'email')))
  with check ((mi_rol() = 'super_admin' or mi_rol() = 'admin' or (mi_rol() = 'encargado_salud' and centro_origen = mi_centro()) or usuario_email = (auth.jwt() ->> 'email')));
drop policy if exists actividad_delete on actividad;
create policy actividad_delete on actividad for delete to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'admin'));

-- Alerta
drop policy if exists alerta_create on alerta;
create policy alerta_create on alerta for insert to authenticated
  with check ((mi_rol() = 'super_admin' or mi_rol() = 'admin' or mi_rol() = 'encargado_salud' or mi_rol() = 'encargado_compras_salud'));
drop policy if exists alerta_read on alerta;
create policy alerta_read on alerta for select to authenticated
  using (true);
drop policy if exists alerta_update on alerta;
create policy alerta_update on alerta for update to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'admin' or mi_rol() = 'encargado_salud' or mi_rol() = 'encargado_compras_salud'))
  with check ((mi_rol() = 'super_admin' or mi_rol() = 'admin' or mi_rol() = 'encargado_salud' or mi_rol() = 'encargado_compras_salud'));
drop policy if exists alerta_delete on alerta;
create policy alerta_delete on alerta for delete to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'admin'));

-- AppConfig
drop policy if exists app_config_create on app_config;
create policy app_config_create on app_config for insert to authenticated
  with check ((mi_rol() = 'super_admin' or mi_rol() = 'admin'));
drop policy if exists app_config_read on app_config;
create policy app_config_read on app_config for select to authenticated
  using (true);
drop policy if exists app_config_update on app_config;
create policy app_config_update on app_config for update to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'admin'))
  with check ((mi_rol() = 'super_admin' or mi_rol() = 'admin'));
drop policy if exists app_config_delete on app_config;
create policy app_config_delete on app_config for delete to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'admin'));

-- Centro
drop policy if exists centro_create on centro;
create policy centro_create on centro for insert to authenticated
  with check ((mi_rol() = 'super_admin' or mi_rol() = 'admin'));
drop policy if exists centro_read on centro;
create policy centro_read on centro for select to authenticated
  using (true);
drop policy if exists centro_update on centro;
create policy centro_update on centro for update to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'admin'))
  with check ((mi_rol() = 'super_admin' or mi_rol() = 'admin'));
drop policy if exists centro_delete on centro;
create policy centro_delete on centro for delete to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'admin'));

-- Comentario
drop policy if exists comentario_create on comentario;
create policy comentario_create on comentario for insert to authenticated
  with check ((mi_rol() = 'super_admin' or mi_rol() = 'monitor_corporativo' or mi_rol() = 'jefe_taller' or mi_rol() = 'encargado_salud'));
drop policy if exists comentario_read on comentario;
create policy comentario_read on comentario for select to authenticated
  using (true);
drop policy if exists comentario_update on comentario;
create policy comentario_update on comentario for update to authenticated
  using (mi_rol() = 'super_admin')
  with check (mi_rol() = 'super_admin');
drop policy if exists comentario_delete on comentario;
create policy comentario_delete on comentario for delete to authenticated
  using (mi_rol() = 'super_admin');

-- ConfigAlerta
drop policy if exists config_alerta_create on config_alerta;
create policy config_alerta_create on config_alerta for insert to authenticated
  with check ((mi_rol() = 'super_admin' or mi_rol() = 'admin'));
drop policy if exists config_alerta_read on config_alerta;
create policy config_alerta_read on config_alerta for select to authenticated
  using (true);
drop policy if exists config_alerta_update on config_alerta;
create policy config_alerta_update on config_alerta for update to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'admin'))
  with check ((mi_rol() = 'super_admin' or mi_rol() = 'admin'));
drop policy if exists config_alerta_delete on config_alerta;
create policy config_alerta_delete on config_alerta for delete to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'admin'));

-- ConsumoRepuesto
drop policy if exists consumo_repuesto_create on consumo_repuesto;
create policy consumo_repuesto_create on consumo_repuesto for insert to authenticated
  with check ((mi_rol() = 'super_admin' or mi_rol() = 'admin' or mi_rol() = 'jefe_taller' or mi_rol() = 'encargado_compras_taller'));
drop policy if exists consumo_repuesto_read on consumo_repuesto;
create policy consumo_repuesto_read on consumo_repuesto for select to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'admin' or mi_rol() = 'monitor_corporativo' or mi_rol() = 'jefe_taller' or mi_rol() = 'encargado_compras_taller' or mi_rol() = 'mecanico'));
drop policy if exists consumo_repuesto_update on consumo_repuesto;
create policy consumo_repuesto_update on consumo_repuesto for update to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'jefe_taller'))
  with check ((mi_rol() = 'super_admin' or mi_rol() = 'jefe_taller'));
drop policy if exists consumo_repuesto_delete on consumo_repuesto;
create policy consumo_repuesto_delete on consumo_repuesto for delete to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'jefe_taller'));

-- Equipo
drop policy if exists equipo_create on equipo;
create policy equipo_create on equipo for insert to authenticated
  with check ((mi_rol() = 'super_admin' or mi_rol() = 'admin' or (mi_rol() = 'encargado_salud' and centro_principal = mi_centro())));
drop policy if exists equipo_read on equipo;
create policy equipo_read on equipo for select to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'admin' or mi_rol() = 'monitor_corporativo' or (mi_rol() = 'jefe_taller' and tipo = 'ambulancia') or (mi_rol() = 'mecanico' and tipo = 'ambulancia') or (mi_rol() = 'encargado_compras_taller' and tipo = 'ambulancia') or centro_principal = mi_centro()));
drop policy if exists equipo_update on equipo;
create policy equipo_update on equipo for update to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'admin' or (mi_rol() = 'encargado_salud' and centro_principal = mi_centro())))
  with check ((mi_rol() = 'super_admin' or mi_rol() = 'admin' or (mi_rol() = 'encargado_salud' and centro_principal = mi_centro())));
drop policy if exists equipo_delete on equipo;
create policy equipo_delete on equipo for delete to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'admin'));

-- Historial
drop policy if exists historial_create on historial;
create policy historial_create on historial for insert to authenticated
  with check (mi_rol() = 'super_admin');
drop policy if exists historial_read on historial;
create policy historial_read on historial for select to authenticated
  using (mi_rol() = 'super_admin');
drop policy if exists historial_update on historial;
create policy historial_update on historial for update to authenticated
  using (mi_rol() = 'super_admin')
  with check (mi_rol() = 'super_admin');
drop policy if exists historial_delete on historial;
create policy historial_delete on historial for delete to authenticated
  using (mi_rol() = 'super_admin');

-- HistorialMantenimiento
drop policy if exists historial_mantenimiento_create on historial_mantenimiento;
create policy historial_mantenimiento_create on historial_mantenimiento for insert to authenticated
  with check ((mi_rol() = 'super_admin' or mi_rol() = 'admin' or mi_rol() = 'encargado_salud' or cargado_por_email = (auth.jwt() ->> 'email')));
drop policy if exists historial_mantenimiento_read on historial_mantenimiento;
create policy historial_mantenimiento_read on historial_mantenimiento for select to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'admin' or mi_rol() = 'encargado_salud' or mi_rol() = 'jefe_taller' or mi_rol() = 'mecanico' or mi_rol() = 'monitor_corporativo' or cargado_por_email = (auth.jwt() ->> 'email')));
drop policy if exists historial_mantenimiento_update on historial_mantenimiento;
create policy historial_mantenimiento_update on historial_mantenimiento for update to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'admin'))
  with check ((mi_rol() = 'super_admin' or mi_rol() = 'admin'));
drop policy if exists historial_mantenimiento_delete on historial_mantenimiento;
create policy historial_mantenimiento_delete on historial_mantenimiento for delete to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'admin'));

-- InspeccionPendiente
drop policy if exists inspeccion_pendiente_create on inspeccion_pendiente;
create policy inspeccion_pendiente_create on inspeccion_pendiente for insert to authenticated
  with check ((mi_rol() = 'super_admin' or mi_rol() = 'admin' or mi_rol() = 'encargado_salud'));
drop policy if exists inspeccion_pendiente_read on inspeccion_pendiente;
create policy inspeccion_pendiente_read on inspeccion_pendiente for select to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'admin' or mi_rol() = 'encargado_salud' or mi_rol() = 'monitor_corporativo' or mi_rol() = 'jefe_taller' or mi_rol() = 'mecanico' or created_by_id = mi_id()));
drop policy if exists inspeccion_pendiente_update on inspeccion_pendiente;
create policy inspeccion_pendiente_update on inspeccion_pendiente for update to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'admin' or mi_rol() = 'encargado_salud'))
  with check ((mi_rol() = 'super_admin' or mi_rol() = 'admin' or mi_rol() = 'encargado_salud'));
drop policy if exists inspeccion_pendiente_delete on inspeccion_pendiente;
create policy inspeccion_pendiente_delete on inspeccion_pendiente for delete to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'admin' or mi_rol() = 'encargado_salud'));

-- InvitacionPendiente
drop policy if exists invitacion_pendiente_create on invitacion_pendiente;
create policy invitacion_pendiente_create on invitacion_pendiente for insert to authenticated
  with check ((mi_rol() = 'super_admin' or mi_rol() = 'admin' or mi_rol() = 'encargado_salud' or mi_rol() = 'jefe_taller'));
drop policy if exists invitacion_pendiente_read on invitacion_pendiente;
create policy invitacion_pendiente_read on invitacion_pendiente for select to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'admin' or mi_rol() = 'encargado_salud' or mi_rol() = 'jefe_taller'));
drop policy if exists invitacion_pendiente_update on invitacion_pendiente;
create policy invitacion_pendiente_update on invitacion_pendiente for update to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'admin'))
  with check ((mi_rol() = 'super_admin' or mi_rol() = 'admin'));
drop policy if exists invitacion_pendiente_delete on invitacion_pendiente;
create policy invitacion_pendiente_delete on invitacion_pendiente for delete to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'admin'));

-- Kilometraje
drop policy if exists kilometraje_create on kilometraje;
create policy kilometraje_create on kilometraje for insert to authenticated
  with check ((mi_rol() = 'super_admin' or mi_rol() = 'admin' or mi_rol() = 'encargado_salud' or created_by_id = mi_id()));
drop policy if exists kilometraje_read on kilometraje;
create policy kilometraje_read on kilometraje for select to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'admin' or mi_rol() = 'encargado_salud' or created_by_id = mi_id()));
drop policy if exists kilometraje_update on kilometraje;
create policy kilometraje_update on kilometraje for update to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'admin'))
  with check ((mi_rol() = 'super_admin' or mi_rol() = 'admin'));
drop policy if exists kilometraje_delete on kilometraje;
create policy kilometraje_delete on kilometraje for delete to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'admin'));

-- OrdenDeCompra
drop policy if exists orden_de_compra_create on orden_de_compra;
create policy orden_de_compra_create on orden_de_compra for insert to authenticated
  with check ((mi_rol() = 'super_admin' or mi_rol() = 'admin' or mi_rol() = 'jefe_taller' or mi_rol() = 'encargado_compras_taller' or mi_rol() = 'mecanico'));
drop policy if exists orden_de_compra_read on orden_de_compra;
create policy orden_de_compra_read on orden_de_compra for select to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'admin' or mi_rol() = 'monitor_corporativo' or mi_rol() = 'jefe_taller' or mi_rol() = 'encargado_compras_taller' or mi_rol() = 'mecanico' or created_by = (auth.jwt() ->> 'email')));
drop policy if exists orden_de_compra_update on orden_de_compra;
create policy orden_de_compra_update on orden_de_compra for update to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'admin' or mi_rol() = 'jefe_taller' or mi_rol() = 'encargado_compras_taller'))
  with check ((mi_rol() = 'super_admin' or mi_rol() = 'admin' or mi_rol() = 'jefe_taller' or mi_rol() = 'encargado_compras_taller'));
drop policy if exists orden_de_compra_delete on orden_de_compra;
create policy orden_de_compra_delete on orden_de_compra for delete to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'jefe_taller'));

-- OrdenTrabajo
drop policy if exists orden_trabajo_create on orden_trabajo;
create policy orden_trabajo_create on orden_trabajo for insert to authenticated
  with check ((mi_rol() = 'super_admin' or mi_rol() = 'admin' or mi_rol() = 'encargado_salud' or mi_rol() = 'jefe_taller' or mi_rol() = 'mecanico'));
drop policy if exists orden_trabajo_read on orden_trabajo;
create policy orden_trabajo_read on orden_trabajo for select to authenticated
  using (true);
drop policy if exists orden_trabajo_update on orden_trabajo;
create policy orden_trabajo_update on orden_trabajo for update to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'jefe_taller' or mi_rol() = 'mecanico'))
  with check ((mi_rol() = 'super_admin' or mi_rol() = 'jefe_taller' or mi_rol() = 'mecanico'));
drop policy if exists orden_trabajo_delete on orden_trabajo;
create policy orden_trabajo_delete on orden_trabajo for delete to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'jefe_taller'));

-- Parche
drop policy if exists parche_create on parche;
create policy parche_create on parche for insert to authenticated
  with check ((mi_rol() = 'super_admin' or mi_rol() = 'admin' or mi_rol() = 'encargado_salud' or created_by_id = mi_id()));
drop policy if exists parche_read on parche;
create policy parche_read on parche for select to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'admin' or mi_rol() = 'encargado_salud' or created_by_id = mi_id()));
drop policy if exists parche_update on parche;
create policy parche_update on parche for update to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'admin' or mi_rol() = 'encargado_salud' or created_by_id = mi_id()))
  with check ((mi_rol() = 'super_admin' or mi_rol() = 'admin' or mi_rol() = 'encargado_salud' or created_by_id = mi_id()));
drop policy if exists parche_delete on parche;
create policy parche_delete on parche for delete to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'admin'));

-- Proveedor
drop policy if exists proveedor_create on proveedor;
create policy proveedor_create on proveedor for insert to authenticated
  with check ((mi_rol() = 'super_admin' or mi_rol() = 'admin' or mi_rol() = 'jefe_taller' or mi_rol() = 'encargado_compras_taller' or mi_rol() = 'encargado_compras_salud'));
drop policy if exists proveedor_read on proveedor;
create policy proveedor_read on proveedor for select to authenticated
  using (true);
drop policy if exists proveedor_update on proveedor;
create policy proveedor_update on proveedor for update to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'admin' or mi_rol() = 'jefe_taller' or mi_rol() = 'encargado_compras_taller' or mi_rol() = 'encargado_compras_salud'))
  with check ((mi_rol() = 'super_admin' or mi_rol() = 'admin' or mi_rol() = 'jefe_taller' or mi_rol() = 'encargado_compras_taller' or mi_rol() = 'encargado_compras_salud'));
drop policy if exists proveedor_delete on proveedor;
create policy proveedor_delete on proveedor for delete to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'admin' or mi_rol() = 'jefe_taller'));

-- Repuesto
drop policy if exists repuesto_create on repuesto;
create policy repuesto_create on repuesto for insert to authenticated
  with check ((mi_rol() = 'super_admin' or mi_rol() = 'jefe_taller' or mi_rol() = 'encargado_compras_taller'));
drop policy if exists repuesto_read on repuesto;
create policy repuesto_read on repuesto for select to authenticated
  using (true);
drop policy if exists repuesto_update on repuesto;
create policy repuesto_update on repuesto for update to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'jefe_taller' or mi_rol() = 'encargado_compras_taller'))
  with check ((mi_rol() = 'super_admin' or mi_rol() = 'jefe_taller' or mi_rol() = 'encargado_compras_taller'));
drop policy if exists repuesto_delete on repuesto;
create policy repuesto_delete on repuesto for delete to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'jefe_taller'));

-- RepuestoCritico
drop policy if exists repuesto_critico_create on repuesto_critico;
create policy repuesto_critico_create on repuesto_critico for insert to authenticated
  with check ((mi_rol() = 'super_admin' or mi_rol() = 'jefe_taller'));
drop policy if exists repuesto_critico_read on repuesto_critico;
create policy repuesto_critico_read on repuesto_critico for select to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'admin' or mi_rol() = 'jefe_taller' or mi_rol() = 'mecanico' or mi_rol() = 'encargado_compras_taller' or mi_rol() = 'monitor_corporativo' or mi_rol() = 'encargado_salud'));
drop policy if exists repuesto_critico_update on repuesto_critico;
create policy repuesto_critico_update on repuesto_critico for update to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'jefe_taller' or mi_rol() = 'mecanico'))
  with check ((mi_rol() = 'super_admin' or mi_rol() = 'jefe_taller' or mi_rol() = 'mecanico'));
drop policy if exists repuesto_critico_delete on repuesto_critico;
create policy repuesto_critico_delete on repuesto_critico for delete to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'jefe_taller'));

-- Solicitud
drop policy if exists solicitud_create on solicitud;
create policy solicitud_create on solicitud for insert to authenticated
  with check ((mi_rol() = 'super_admin' or mi_rol() = 'admin' or mi_rol() = 'encargado_salud' or created_by_id = mi_id()));
drop policy if exists solicitud_read on solicitud;
create policy solicitud_read on solicitud for select to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'admin' or mi_rol() = 'encargado_salud' or mi_rol() = 'encargado_compras_salud' or created_by_id = mi_id()));
drop policy if exists solicitud_update on solicitud;
create policy solicitud_update on solicitud for update to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'admin' or mi_rol() = 'encargado_salud' or (created_by_id = mi_id() and estado = 'pendiente')))
  with check ((mi_rol() = 'super_admin' or mi_rol() = 'admin' or mi_rol() = 'encargado_salud' or (created_by_id = mi_id() and estado = 'pendiente')));
drop policy if exists solicitud_delete on solicitud;
create policy solicitud_delete on solicitud for delete to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'admin' or (created_by_id = mi_id() and estado = 'pendiente')));

-- SolicitudRepuesto
drop policy if exists solicitud_repuesto_create on solicitud_repuesto;
create policy solicitud_repuesto_create on solicitud_repuesto for insert to authenticated
  with check ((mi_rol() = 'super_admin' or mi_rol() = 'admin' or mi_rol() = 'jefe_taller' or mi_rol() = 'mecanico' or mi_rol() = 'encargado_compras_taller'));
drop policy if exists solicitud_repuesto_read on solicitud_repuesto;
create policy solicitud_repuesto_read on solicitud_repuesto for select to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'admin' or mi_rol() = 'monitor_corporativo' or mi_rol() = 'jefe_taller' or mi_rol() = 'encargado_compras_taller' or created_by = (auth.jwt() ->> 'email')));
drop policy if exists solicitud_repuesto_update on solicitud_repuesto;
create policy solicitud_repuesto_update on solicitud_repuesto for update to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'admin' or mi_rol() = 'jefe_taller' or mi_rol() = 'encargado_compras_taller'))
  with check ((mi_rol() = 'super_admin' or mi_rol() = 'admin' or mi_rol() = 'jefe_taller' or mi_rol() = 'encargado_compras_taller'));
drop policy if exists solicitud_repuesto_delete on solicitud_repuesto;
create policy solicitud_repuesto_delete on solicitud_repuesto for delete to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'jefe_taller'));

-- SolicitudRepuestoSalud
drop policy if exists solicitud_repuesto_salud_create on solicitud_repuesto_salud;
create policy solicitud_repuesto_salud_create on solicitud_repuesto_salud for insert to authenticated
  with check ((mi_rol() = 'super_admin' or mi_rol() = 'admin' or mi_rol() = 'encargado_salud' or mi_rol() = 'encargado_compras_salud'));
drop policy if exists solicitud_repuesto_salud_read on solicitud_repuesto_salud;
create policy solicitud_repuesto_salud_read on solicitud_repuesto_salud for select to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'admin' or mi_rol() = 'encargado_salud' or mi_rol() = 'encargado_compras_salud' or mi_rol() = 'monitor_corporativo' or created_by = (auth.jwt() ->> 'email')));
drop policy if exists solicitud_repuesto_salud_update on solicitud_repuesto_salud;
create policy solicitud_repuesto_salud_update on solicitud_repuesto_salud for update to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'admin' or mi_rol() = 'encargado_compras_salud'))
  with check ((mi_rol() = 'super_admin' or mi_rol() = 'admin' or mi_rol() = 'encargado_compras_salud'));
drop policy if exists solicitud_repuesto_salud_delete on solicitud_repuesto_salud;
create policy solicitud_repuesto_salud_delete on solicitud_repuesto_salud for delete to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'admin'));

-- SolicitudStock
drop policy if exists solicitud_stock_create on solicitud_stock;
create policy solicitud_stock_create on solicitud_stock for insert to authenticated
  with check ((mi_rol() = 'super_admin' or mi_rol() = 'admin' or mi_rol() = 'encargado_salud' or created_by_id = mi_id()));
drop policy if exists solicitud_stock_read on solicitud_stock;
create policy solicitud_stock_read on solicitud_stock for select to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'admin' or mi_rol() = 'encargado_salud' or mi_rol() = 'encargado_compras_salud' or created_by_id = mi_id()));
drop policy if exists solicitud_stock_update on solicitud_stock;
create policy solicitud_stock_update on solicitud_stock for update to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'admin' or mi_rol() = 'encargado_salud' or mi_rol() = 'encargado_compras_salud' or (created_by_id = mi_id() and estado = 'pendiente')))
  with check ((mi_rol() = 'super_admin' or mi_rol() = 'admin' or mi_rol() = 'encargado_salud' or mi_rol() = 'encargado_compras_salud' or (created_by_id = mi_id() and estado = 'pendiente')));
drop policy if exists solicitud_stock_delete on solicitud_stock;
create policy solicitud_stock_delete on solicitud_stock for delete to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'admin' or (created_by_id = mi_id() and estado = 'pendiente')));
