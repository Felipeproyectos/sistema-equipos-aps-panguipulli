-- Generado por migracion/generar_sql.py. No editar a mano.

create or replace function tocar_updated_date() returns trigger
  language plpgsql as $$ begin new.updated_date = now(); return new; end $$;

create table if not exists acceso_no_autorizado (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz default now(),
  updated_date timestamptz,
  created_by_id text,
  created_by text,
  is_sample boolean default false,
  email text,
  fecha_intento timestamptz,
  user_agent text,
  resultado text,
  usuario_nombre text,
  rol text,
  notas text
);
alter table acceso_no_autorizado enable row level security;
drop trigger if exists acceso_no_autorizado_tocar on acceso_no_autorizado;
create trigger acceso_no_autorizado_tocar before update on acceso_no_autorizado for each row execute function tocar_updated_date();

create table if not exists actividad (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz default now(),
  updated_date timestamptz,
  created_by_id text,
  created_by text,
  is_sample boolean default false,
  equipo_id text,
  tipo text,
  fecha date,
  usuario_email text,
  usuario_nombre text,
  observaciones text,
  centro_origen text,
  subsede_origen text,
  centro_destino text,
  subsede_destino text,
  alerta_id text,
  archivo_url text,
  tipo_incidente text,
  ambulancia_operativa boolean
);
alter table actividad enable row level security;
drop trigger if exists actividad_tocar on actividad;
create trigger actividad_tocar before update on actividad for each row execute function tocar_updated_date();

create table if not exists alerta (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz default now(),
  updated_date timestamptz,
  created_by_id text,
  created_by text,
  is_sample boolean default false,
  equipo_id text,
  tipo text,
  descripcion text,
  nivel text,
  estado text,
  centro text,
  subsede text,
  actividad_resolucion_id text,
  fecha_resolucion date,
  notificacion_enviada boolean
);
alter table alerta enable row level security;
drop trigger if exists alerta_tocar on alerta;
create trigger alerta_tocar before update on alerta for each row execute function tocar_updated_date();

create table if not exists app_config (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz default now(),
  updated_date timestamptz,
  created_by_id text,
  created_by text,
  is_sample boolean default false,
  nombre_app text,
  subtitulo text,
  logo_url text
);
alter table app_config enable row level security;
drop trigger if exists app_config_tocar on app_config;
create trigger app_config_tocar before update on app_config for each row execute function tocar_updated_date();

create table if not exists centro (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz default now(),
  updated_date timestamptz,
  created_by_id text,
  created_by text,
  is_sample boolean default false,
  nombre text,
  tipo text,
  sucursales jsonb,
  emails_contacto jsonb
);
alter table centro enable row level security;
drop trigger if exists centro_tocar on centro;
create trigger centro_tocar before update on centro for each row execute function tocar_updated_date();

create table if not exists comentario (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz default now(),
  updated_date timestamptz,
  created_by_id text,
  created_by text,
  is_sample boolean default false,
  equipo_id text,
  equipo_label text,
  orden_trabajo_id text,
  mensaje text,
  tipo text,
  autor_email text,
  autor_nombre text,
  autor_rol text
);
alter table comentario enable row level security;
drop trigger if exists comentario_tocar on comentario;
create trigger comentario_tocar before update on comentario for each row execute function tocar_updated_date();

create table if not exists config_alerta (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz default now(),
  updated_date timestamptz,
  created_by_id text,
  created_by text,
  is_sample boolean default false,
  cesfam text,
  emails jsonb
);
alter table config_alerta enable row level security;
drop trigger if exists config_alerta_tocar on config_alerta;
create trigger config_alerta_tocar before update on config_alerta for each row execute function tocar_updated_date();

create table if not exists consumo_repuesto (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz default now(),
  updated_date timestamptz,
  created_by_id text,
  created_by text,
  is_sample boolean default false,
  repuesto_id text,
  repuesto_nombre text,
  cantidad numeric,
  precio_unitario numeric,
  subtotal numeric,
  tipo_vehiculo text,
  equipo_id text,
  equipo_label text,
  patente text,
  marca_modelo text,
  consumido_por_email text,
  consumido_por_nombre text,
  fecha date,
  observaciones text,
  origen text
);
alter table consumo_repuesto enable row level security;
drop trigger if exists consumo_repuesto_tocar on consumo_repuesto;
create trigger consumo_repuesto_tocar before update on consumo_repuesto for each row execute function tocar_updated_date();

create table if not exists equipo (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz default now(),
  updated_date timestamptz,
  created_by_id text,
  created_by text,
  is_sample boolean default false,
  numero_inventario text,
  tipo text,
  marca text,
  modelo text,
  numero_serie text,
  anio_adquisicion numeric,
  fecha_fabricacion date,
  proveedor text,
  pais_origen text,
  estado text,
  centro_principal text,
  subsede text,
  ubicacion_especifica text,
  fecha_vencimiento_bateria date,
  patente text,
  valor numeric,
  orden_compra_url text,
  foto_url text,
  usuarios_asignados jsonb,
  notas text,
  conductor_responsable text,
  estado_neumaticos text,
  estado_luces text,
  estado_bateria_vehiculo text,
  estado_sirena text,
  estado_revision_tecnica text,
  fecha_vencimiento_revision_tecnica date,
  estado_permiso_circulacion text,
  fecha_vencimiento_permiso_circulacion date,
  fecha_ultimo_informe_externo date,
  url_ultimo_informe_externo text,
  responsable_carga_informe_externo text,
  empresa_responsable_informe_externo text,
  activo boolean,
  proxima_revision_anual date,
  resultado_ultimo_informe_externo text
);
alter table equipo enable row level security;
drop trigger if exists equipo_tocar on equipo;
create trigger equipo_tocar before update on equipo for each row execute function tocar_updated_date();

create table if not exists historial (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz default now(),
  updated_date timestamptz,
  created_by_id text,
  created_by text,
  is_sample boolean default false,
  usuario_email text,
  usuario_nombre text,
  usuario_rol text,
  accion text,
  entidad text,
  entidad_id text,
  descripcion text,
  datos_anteriores text
);
alter table historial enable row level security;
drop trigger if exists historial_tocar on historial;
create trigger historial_tocar before update on historial for each row execute function tocar_updated_date();

create table if not exists historial_mantenimiento (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz default now(),
  updated_date timestamptz,
  created_by_id text,
  created_by text,
  is_sample boolean default false,
  equipo_id text,
  fecha_inspeccion date,
  tipo_mantenimiento text,
  resultado text,
  pruebas_realizadas text,
  observaciones text,
  tecnico_responsable text,
  proximo_mantenimiento date,
  informe_url text,
  cargado_por_email text,
  empresa_responsable text
);
alter table historial_mantenimiento enable row level security;
drop trigger if exists historial_mantenimiento_tocar on historial_mantenimiento;
create trigger historial_mantenimiento_tocar before update on historial_mantenimiento for each row execute function tocar_updated_date();

create table if not exists inspeccion_pendiente (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz default now(),
  updated_date timestamptz,
  created_by_id text,
  created_by text,
  is_sample boolean default false,
  tipo_formulario text,
  equipo_id text,
  equipo_label text,
  conductor text,
  fecha date,
  km_inicial numeric,
  combustible text,
  observaciones text,
  datos_json text,
  estado text,
  revisor_email text,
  revisor_nombre text,
  fecha_revision date,
  nota_revision text
);
alter table inspeccion_pendiente enable row level security;
drop trigger if exists inspeccion_pendiente_tocar on inspeccion_pendiente;
create trigger inspeccion_pendiente_tocar before update on inspeccion_pendiente for each row execute function tocar_updated_date();

create table if not exists invitacion_pendiente (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz default now(),
  updated_date timestamptz,
  created_by_id text,
  created_by text,
  is_sample boolean default false,
  email text,
  rol_asignado text,
  centro_principal text,
  invitado_por_email text,
  invitado_por_nombre text,
  aplicada boolean
);
alter table invitacion_pendiente enable row level security;
drop trigger if exists invitacion_pendiente_tocar on invitacion_pendiente;
create trigger invitacion_pendiente_tocar before update on invitacion_pendiente for each row execute function tocar_updated_date();

create table if not exists kilometraje (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz default now(),
  updated_date timestamptz,
  created_by_id text,
  created_by text,
  is_sample boolean default false,
  equipo_id text,
  fecha date,
  valor_km numeric,
  km_inicial numeric,
  km_final numeric,
  conductor text,
  observaciones text
);
alter table kilometraje enable row level security;
drop trigger if exists kilometraje_tocar on kilometraje;
create trigger kilometraje_tocar before update on kilometraje for each row execute function tocar_updated_date();

create table if not exists orden_de_compra (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz default now(),
  updated_date timestamptz,
  created_by_id text,
  created_by text,
  is_sample boolean default false,
  numero_oc text,
  proveedor_id text,
  proveedor_nombre text,
  creado_por_email text,
  creado_por_nombre text,
  items jsonb,
  estado text,
  total numeric,
  fecha_emision date,
  fecha_entrega_estimada date,
  solicitud_repuesto_id text,
  notas text
);
alter table orden_de_compra enable row level security;
drop trigger if exists orden_de_compra_tocar on orden_de_compra;
create trigger orden_de_compra_tocar before update on orden_de_compra for each row execute function tocar_updated_date();

create table if not exists orden_trabajo (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz default now(),
  updated_date timestamptz,
  created_by_id text,
  created_by text,
  is_sample boolean default false,
  numero_ot text,
  equipo_id text,
  equipo_label text,
  patente text,
  marca_modelo text,
  tipo_activo text,
  prioridad text,
  estado text,
  problema_reportado text,
  diagnostico text,
  origen text,
  inspeccion_id text,
  reportado_por_email text,
  reportado_por_nombre text,
  supervisor_email text,
  supervisor_nombre text,
  mecanico_email text,
  mecanico_nombre text,
  horas_estimadas numeric,
  horas_reales numeric,
  total_mano_obra numeric,
  total_repuestos numeric,
  total numeric,
  repuestos_utilizados jsonb,
  linea_tiempo jsonb,
  fecha_asignacion date,
  fecha_inicio date,
  fecha_fin date,
  notas_cierre text
);
alter table orden_trabajo enable row level security;
drop trigger if exists orden_trabajo_tocar on orden_trabajo;
create trigger orden_trabajo_tocar before update on orden_trabajo for each row execute function tocar_updated_date();

create table if not exists parche (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz default now(),
  updated_date timestamptz,
  created_by_id text,
  created_by text,
  is_sample boolean default false,
  equipo_id text,
  tipo text,
  cantidad numeric,
  fecha_adquisicion date,
  fecha_vencimiento date,
  lote text,
  activo boolean,
  notas text
);
alter table parche enable row level security;
drop trigger if exists parche_tocar on parche;
create trigger parche_tocar before update on parche for each row execute function tocar_updated_date();

create table if not exists proveedor (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz default now(),
  updated_date timestamptz,
  created_by_id text,
  created_by text,
  is_sample boolean default false,
  nombre text,
  rut text,
  rubro text,
  contacto_nombre text,
  telefono text,
  email text,
  direccion text,
  ciudad text,
  web text,
  notas text,
  activo boolean
);
alter table proveedor enable row level security;
drop trigger if exists proveedor_tocar on proveedor;
create trigger proveedor_tocar before update on proveedor for each row execute function tocar_updated_date();

create table if not exists repuesto (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz default now(),
  updated_date timestamptz,
  created_by_id text,
  created_by text,
  is_sample boolean default false,
  codigo text,
  nombre text,
  categoria text,
  marca_modelo_compat text,
  stock_actual numeric,
  stock_minimo numeric,
  precio_unitario numeric,
  proveedor_id text,
  proveedor_nombre text,
  ultimo_reposicion date,
  ubicacion_bodega text,
  notas text,
  numero_factura text,
  fecha_factura date,
  factura_url text,
  numero_orden_compra text,
  fecha_orden_compra date,
  orden_compra_url text,
  activo boolean
);
alter table repuesto enable row level security;
drop trigger if exists repuesto_tocar on repuesto;
create trigger repuesto_tocar before update on repuesto for each row execute function tocar_updated_date();

create table if not exists repuesto_critico (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz default now(),
  updated_date timestamptz,
  created_by_id text,
  created_by text,
  is_sample boolean default false,
  equipo_id text,
  tipo text,
  marca_modelo text,
  estado_label text,
  vida_util_pct numeric,
  stock_unidades numeric,
  ultimo_cambio text,
  proximo_mantenimiento text,
  notas text,
  modificado_por text,
  fecha_modificacion text
);
alter table repuesto_critico enable row level security;
drop trigger if exists repuesto_critico_tocar on repuesto_critico;
create trigger repuesto_critico_tocar before update on repuesto_critico for each row execute function tocar_updated_date();

create table if not exists solicitud (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz default now(),
  updated_date timestamptz,
  created_by_id text,
  created_by text,
  is_sample boolean default false,
  equipo_id text,
  tipo text,
  fecha date,
  usuario_email text,
  usuario_nombre text,
  centro text,
  estado text,
  observaciones text,
  alerta_id text,
  respuesta_admin text
);
alter table solicitud enable row level security;
drop trigger if exists solicitud_tocar on solicitud;
create trigger solicitud_tocar before update on solicitud for each row execute function tocar_updated_date();

create table if not exists solicitud_repuesto (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz default now(),
  updated_date timestamptz,
  created_by_id text,
  created_by text,
  is_sample boolean default false,
  numero_solicitud text,
  solicitante_email text,
  solicitante_nombre text,
  repuesto_nombre text,
  categoria text,
  cantidad numeric,
  urgencia text,
  motivo text,
  orden_trabajo_id text,
  orden_trabajo_label text,
  estado text,
  aprobador_email text,
  aprobador_nombre text,
  fecha_aprobacion date,
  comentario_aprobador text,
  fecha_solicitud date,
  fecha_compra date,
  proveedor_compra_nombre text,
  precio_total_compra numeric,
  comprado_por_email text,
  comprado_por_nombre text,
  fecha_recepcion_bodega date,
  recibido_por_email text,
  recibido_por_nombre text,
  observaciones_compra text,
  linea_tiempo jsonb
);
alter table solicitud_repuesto enable row level security;
drop trigger if exists solicitud_repuesto_tocar on solicitud_repuesto;
create trigger solicitud_repuesto_tocar before update on solicitud_repuesto for each row execute function tocar_updated_date();

create table if not exists solicitud_repuesto_salud (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz default now(),
  updated_date timestamptz,
  created_by_id text,
  created_by text,
  is_sample boolean default false,
  numero_solicitud text,
  solicitante_email text,
  solicitante_nombre text,
  repuesto_nombre text,
  categoria text,
  equipo_label text,
  cantidad numeric,
  urgencia text,
  motivo text,
  estado text,
  aprobador_email text,
  aprobador_nombre text,
  fecha_aprobacion date,
  comentario_aprobador text,
  fecha_solicitud date,
  fecha_compra date,
  proveedor_compra_nombre text,
  precio_total_compra numeric,
  comprado_por_email text,
  comprado_por_nombre text,
  fecha_recepcion_bodega date,
  recibido_por_email text,
  recibido_por_nombre text,
  observaciones_compra text,
  linea_tiempo jsonb
);
alter table solicitud_repuesto_salud enable row level security;
drop trigger if exists solicitud_repuesto_salud_tocar on solicitud_repuesto_salud;
create trigger solicitud_repuesto_salud_tocar before update on solicitud_repuesto_salud for each row execute function tocar_updated_date();

create table if not exists solicitud_stock (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz default now(),
  updated_date timestamptz,
  created_by_id text,
  created_by text,
  is_sample boolean default false,
  equipo_id text,
  tipo_solicitud text,
  cantidad numeric,
  descripcion text,
  estado text,
  solicitante_email text,
  fecha_solicitud date,
  respuesta_admin text
);
alter table solicitud_stock enable row level security;
drop trigger if exists solicitud_stock_tocar on solicitud_stock;
create trigger solicitud_stock_tocar before update on solicitud_stock for each row execute function tocar_updated_date();

create table if not exists usuario (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz default now(),
  updated_date timestamptz,
  created_by_id text,
  created_by text,
  is_sample boolean default false,
  role text,
  area text,
  centro_asignado text,
  centro_principal text,
  subsedes_asignadas jsonb,
  centros_asignados jsonb,
  email text,
  full_name text,
  is_verified boolean,
  force_password_reset boolean,
  app_id text,
  is_service boolean,
  collaborator_role text,
  _app_role text
);
alter table usuario enable row level security;
drop trigger if exists usuario_tocar on usuario;
create trigger usuario_tocar before update on usuario for each row execute function tocar_updated_date();
