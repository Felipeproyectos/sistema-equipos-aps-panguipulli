-- Generado por migracion/generar_sql.py. No editar a mano.
-- Requiere pg_net (Supabase lo trae; hay que habilitarlo una vez).
create extension if not exists pg_net with schema extensions;

-- La URL y el secreto no se escriben en el trigger: viven en una tabla para
-- poder cambiar de entorno sin recrear 24 triggers.
create table if not exists config_webhook (clave text primary key, valor text);
alter table config_webhook enable row level security;   -- nadie la lee por API
-- Cargar una sola vez, reemplazando los valores:
--   insert into config_webhook (clave, valor) values
--     ('url', 'https://TU-SERVICIO.up.railway.app'),
--     ('secreto', 'EL MISMO CRON_SECRET del servidor')
--   on conflict (clave) do update set valor = excluded.valor;

create or replace function avisar_al_servidor() returns trigger
  language plpgsql security definer set search_path = public, extensions as $BODY$
declare
  destino text;
  secreto text;
  fila_nueva jsonb := null;
  fila_vieja jsonb := null;
  accion text;
begin
  select valor into destino from config_webhook where clave = 'url';
  select valor into secreto from config_webhook where clave = 'secreto';
  -- Sin configurar, el trigger no hace nada: no bloquea la escritura.
  if destino is null or secreto is null then return null; end if;

  if TG_OP <> 'DELETE' then fila_nueva := to_jsonb(new); end if;
  if TG_OP <> 'INSERT' then fila_vieja := to_jsonb(old); end if;
  accion := case TG_OP when 'INSERT' then 'create'
                       when 'UPDATE' then 'update'
                       else 'delete' end;

  -- http_post es asincrono: la transaccion no espera la respuesta, asi que un
  -- servidor caido nunca impide guardar el registro.
  perform net.http_post(
    url := destino || '/webhooks/' || TG_ARGV[0],
    body := jsonb_build_object(
      'event', jsonb_build_object(
        'type', accion,
        'entity_name', TG_ARGV[1],
        'entity_id', coalesce(fila_nueva ->> 'id', fila_vieja ->> 'id')),
      'data', fila_nueva,
      'old_data', fila_vieja),
    headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', secreto)
  );
  return null;
end $BODY$;

-- Bitacora de auditoria: un trigger por entidad.
drop trigger if exists acceso_no_autorizado_historial on acceso_no_autorizado;
create trigger acceso_no_autorizado_historial after insert or update or delete on acceso_no_autorizado
  for each row execute function avisar_al_servidor('registrarHistorial', 'AccesoNoAutorizado');
drop trigger if exists actividad_historial on actividad;
create trigger actividad_historial after insert or update or delete on actividad
  for each row execute function avisar_al_servidor('registrarHistorial', 'Actividad');
drop trigger if exists alerta_historial on alerta;
create trigger alerta_historial after insert or update or delete on alerta
  for each row execute function avisar_al_servidor('registrarHistorial', 'Alerta');
drop trigger if exists app_config_historial on app_config;
create trigger app_config_historial after insert or update or delete on app_config
  for each row execute function avisar_al_servidor('registrarHistorial', 'AppConfig');
drop trigger if exists centro_historial on centro;
create trigger centro_historial after insert or update or delete on centro
  for each row execute function avisar_al_servidor('registrarHistorial', 'Centro');
drop trigger if exists comentario_historial on comentario;
create trigger comentario_historial after insert or update or delete on comentario
  for each row execute function avisar_al_servidor('registrarHistorial', 'Comentario');
drop trigger if exists config_alerta_historial on config_alerta;
create trigger config_alerta_historial after insert or update or delete on config_alerta
  for each row execute function avisar_al_servidor('registrarHistorial', 'ConfigAlerta');
drop trigger if exists consumo_repuesto_historial on consumo_repuesto;
create trigger consumo_repuesto_historial after insert or update or delete on consumo_repuesto
  for each row execute function avisar_al_servidor('registrarHistorial', 'ConsumoRepuesto');
drop trigger if exists equipo_historial on equipo;
create trigger equipo_historial after insert or update or delete on equipo
  for each row execute function avisar_al_servidor('registrarHistorial', 'Equipo');
drop trigger if exists historial_mantenimiento_historial on historial_mantenimiento;
create trigger historial_mantenimiento_historial after insert or update or delete on historial_mantenimiento
  for each row execute function avisar_al_servidor('registrarHistorial', 'HistorialMantenimiento');
drop trigger if exists inspeccion_pendiente_historial on inspeccion_pendiente;
create trigger inspeccion_pendiente_historial after insert or update or delete on inspeccion_pendiente
  for each row execute function avisar_al_servidor('registrarHistorial', 'InspeccionPendiente');
drop trigger if exists invitacion_pendiente_historial on invitacion_pendiente;
create trigger invitacion_pendiente_historial after insert or update or delete on invitacion_pendiente
  for each row execute function avisar_al_servidor('registrarHistorial', 'InvitacionPendiente');
drop trigger if exists kilometraje_historial on kilometraje;
create trigger kilometraje_historial after insert or update or delete on kilometraje
  for each row execute function avisar_al_servidor('registrarHistorial', 'Kilometraje');
drop trigger if exists orden_de_compra_historial on orden_de_compra;
create trigger orden_de_compra_historial after insert or update or delete on orden_de_compra
  for each row execute function avisar_al_servidor('registrarHistorial', 'OrdenDeCompra');
drop trigger if exists orden_trabajo_historial on orden_trabajo;
create trigger orden_trabajo_historial after insert or update or delete on orden_trabajo
  for each row execute function avisar_al_servidor('registrarHistorial', 'OrdenTrabajo');
drop trigger if exists parche_historial on parche;
create trigger parche_historial after insert or update or delete on parche
  for each row execute function avisar_al_servidor('registrarHistorial', 'Parche');
drop trigger if exists proveedor_historial on proveedor;
create trigger proveedor_historial after insert or update or delete on proveedor
  for each row execute function avisar_al_servidor('registrarHistorial', 'Proveedor');
drop trigger if exists repuesto_historial on repuesto;
create trigger repuesto_historial after insert or update or delete on repuesto
  for each row execute function avisar_al_servidor('registrarHistorial', 'Repuesto');
drop trigger if exists repuesto_critico_historial on repuesto_critico;
create trigger repuesto_critico_historial after insert or update or delete on repuesto_critico
  for each row execute function avisar_al_servidor('registrarHistorial', 'RepuestoCritico');
drop trigger if exists solicitud_historial on solicitud;
create trigger solicitud_historial after insert or update or delete on solicitud
  for each row execute function avisar_al_servidor('registrarHistorial', 'Solicitud');
drop trigger if exists solicitud_repuesto_historial on solicitud_repuesto;
create trigger solicitud_repuesto_historial after insert or update or delete on solicitud_repuesto
  for each row execute function avisar_al_servidor('registrarHistorial', 'SolicitudRepuesto');
drop trigger if exists solicitud_repuesto_salud_historial on solicitud_repuesto_salud;
create trigger solicitud_repuesto_salud_historial after insert or update or delete on solicitud_repuesto_salud
  for each row execute function avisar_al_servidor('registrarHistorial', 'SolicitudRepuestoSalud');
drop trigger if exists solicitud_stock_historial on solicitud_stock;
create trigger solicitud_stock_historial after insert or update or delete on solicitud_stock
  for each row execute function avisar_al_servidor('registrarHistorial', 'SolicitudStock');
drop trigger if exists usuario_historial on usuario;
create trigger usuario_historial after insert or update or delete on usuario
  for each row execute function avisar_al_servidor('registrarHistorial', 'User');

-- Aviso por correo al crearse una solicitud de repuesto.
drop trigger if exists solicitud_repuesto_avisa on solicitud_repuesto;
create trigger solicitud_repuesto_avisa after insert on solicitud_repuesto
  for each row execute function avisar_al_servidor('notificarSolicitudRepuesto', 'SolicitudRepuesto');
