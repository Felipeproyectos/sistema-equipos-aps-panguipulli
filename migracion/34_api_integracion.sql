-- ═══════════════════════════════════════════════════════════════════
-- 34_api_integracion.sql
--
-- API de integración: otros sistemas ENTREGAN información a éste por
-- /api/v1 en el servidor de Railway.
--
-- Por qué
-- ───────
-- Las cargas de combustible, el kilometraje de los vehículos y los pagos
-- (permisos, revisión técnica, SOAP, TAG, multas) existen en otros sistemas:
-- el proveedor de la tarjeta de combustible, el GPS de la flota, finanzas.
-- Hoy se copian a mano o por planilla. Con esto llegan solos, por una clave
-- que identifica a cada sistema, y pasan por las mismas reglas que un
-- registro hecho en pantalla.
--
-- Qué hace
-- ────────
--   1. api_cliente: un acceso por sistema externo. Guarda SOLO el hash de la
--      clave (HMAC-SHA256 con un secreto que vive en Railway), qué puede
--      enviar (alcances), de qué centros, su límite por minuto y su
--      vencimiento.
--   2. api_registro: cada llamada (quién, qué, cuándo, resultado). Se purga
--      sola pasados API_REGISTRO_DIAS (servidor/tareas.js).
--   3. carga_combustible y pago_vehiculo aceptan origen 'api' y guardan
--      quién lo mandó (api_cliente_id) con su identificador (id_externo).
--      Un mismo id_externo del mismo sistema entra una sola vez: reenviar
--      un lote no duplica nada.
--   4. lectura_odometro: el kilometraje que informa el GPS. Tabla propia y
--      no `kilometraje`: ésa es la bitácora de los choferes (Calidad), donde
--      una fila sin km_final es un turno abierto; una lectura del GPS ahí
--      pasaría por el turno de alguien. El odómetro no retrocede: una
--      lectura menor que una anterior (o mayor que una posterior) se rechaza.
--      ultima_lectura_odometro deja leer solo la más reciente de cada
--      vehículo, para que las pantallas no carguen todo el historial.
--   5. Nadie escribe por PostgREST en estas tablas: solo el servidor, con la
--      llave de servicio. Las lecturas las ven los mismos perfiles que ven
--      los gastos de la flota.
--
-- Va después de 32 (carga_combustible, pago_vehiculo, es_vehiculo,
-- rotulo_vehiculo). Es re-ejecutable. Ejecutar una vez en Supabase (SQL
-- Editor → New query → pegar todo → Run) ANTES de desplegar el servidor.
-- ═══════════════════════════════════════════════════════════════════

begin;

-- ── 1) Accesos de sistemas externos ─────────────────────────────────
create table if not exists api_cliente (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz default now(),
  updated_date timestamptz,
  created_by_id text,
  created_by text,
  is_sample boolean default false,
  nombre text not null,
  descripcion text,
  prefijo text not null,
  clave_hash text not null,
  alcances jsonb not null default '[]'::jsonb,
  centros jsonb not null default '[]'::jsonb,
  todos_los_centros boolean not null default false,
  limite_por_minuto integer not null default 60,
  activo boolean not null default true,
  expira timestamptz not null,
  ultimo_uso timestamptz,
  rotada_en timestamptz,
  creado_por_email text,
  creado_por_nombre text,
  revocado_en timestamptz,
  revocado_por text,
  motivo_revocacion text
);

create unique index if not exists api_cliente_prefijo_uniq on api_cliente (prefijo);

alter table api_cliente drop constraint if exists api_cliente_valores;
alter table api_cliente add constraint api_cliente_valores check (
  length(trim(nombre)) between 3 and 80
  and prefijo ~ '^[a-z0-9]{12}$'
  and clave_hash ~ '^[0-9a-f]{64}$'
  and jsonb_typeof(alcances) = 'array'
  and jsonb_typeof(centros) = 'array'
  and limite_por_minuto between 10 and 600
  and (todos_los_centros or jsonb_array_length(centros) > 0)
);

alter table api_cliente enable row level security;
drop trigger if exists api_cliente_tocar on api_cliente;
create trigger api_cliente_tocar before update on api_cliente
  for each row execute function tocar_updated_date();

-- ── 2) Registro de llamadas ─────────────────────────────────────────
create table if not exists api_registro (
  id bigint generated always as identity primary key,
  fecha timestamptz not null default now(),
  cliente_id text,
  prefijo text,
  metodo text,
  ruta text,
  estado integer,
  recibidos integer,
  creados integer,
  duplicados integer,
  rechazados integer,
  duracion_ms integer,
  ip text,
  user_agent text,
  solicitud_id text
);

create index if not exists api_registro_fecha_idx on api_registro (fecha);
create index if not exists api_registro_cliente_idx on api_registro (cliente_id, fecha desc);

alter table api_registro enable row level security;

-- Sin policies: con RLS activo, anon y authenticated no ven ni escriben nada.
-- El REVOKE lo deja dicho dos veces.
revoke all on api_cliente from anon, authenticated;
revoke all on api_registro from anon, authenticated;

-- ── 3) Cargas y pagos que llegan por la API ─────────────────────────
alter table carga_combustible add column if not exists api_cliente_id text;
alter table carga_combustible add column if not exists id_externo text;
alter table pago_vehiculo add column if not exists api_cliente_id text;
alter table pago_vehiculo add column if not exists id_externo text;

-- Los registros hechos en pantalla traen los dos en NULL, y en un índice
-- único los NULL nunca chocan entre sí.
create unique index if not exists carga_combustible_externo_uniq on carga_combustible (api_cliente_id, id_externo);
create unique index if not exists pago_vehiculo_externo_uniq on pago_vehiculo (api_cliente_id, id_externo);

-- Las mismas listas de 32_unidad_control.sql, con 'api' en el origen.
alter table carga_combustible drop constraint if exists carga_combustible_valores;
alter table carga_combustible add constraint carga_combustible_valores check (
  (estado is null or estado in ('vigente', 'anulado'))
  and (origen is null or origen in ('manual', 'planilla', 'api'))
  and (tipo_combustible is null or tipo_combustible in ('diesel', 'gasolina_93', 'gasolina_95', 'gasolina_97', 'otro'))
  and (documento_tipo is null or documento_tipo in ('boleta', 'factura', 'guia', 'vale', 'otro'))
  and (medio_pago is null or medio_pago in ('tarjeta_combustible', 'efectivo', 'transferencia', 'credito', 'otro'))
);
alter table pago_vehiculo drop constraint if exists pago_vehiculo_valores;
alter table pago_vehiculo add constraint pago_vehiculo_valores check (
  (estado is null or estado in ('vigente', 'anulado'))
  and (estado_pago is null or estado_pago in ('pendiente', 'pagado'))
  and (origen is null or origen in ('manual', 'planilla', 'api'))
  and (tipo is null or tipo in ('permiso_circulacion', 'revision_tecnica', 'soap', 'seguro', 'peaje_tag',
       'multa', 'reparacion_externa', 'neumaticos', 'lavado', 'estacionamiento', 'otro'))
  and (documento_tipo is null or documento_tipo in ('boleta', 'factura', 'guia', 'vale', 'otro'))
  and (medio_pago is null or medio_pago in ('tarjeta_combustible', 'efectivo', 'transferencia', 'credito', 'otro'))
);

-- ── 4) Lecturas de odómetro (GPS) ───────────────────────────────────
create table if not exists lectura_odometro (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz default now(),
  updated_date timestamptz,
  created_by_id text,
  created_by text,
  is_sample boolean default false,
  equipo_id text not null,
  equipo_label text,
  fecha_lectura timestamptz not null,
  fecha date,
  km numeric not null,
  fuente text default 'gps',
  centro text,
  origen text default 'api',
  api_cliente_id text,
  id_externo text,
  registrado_por_nombre text
);

create index if not exists lectura_odometro_equipo_idx on lectura_odometro (equipo_id, fecha_lectura desc);
create unique index if not exists lectura_odometro_externo_uniq on lectura_odometro (api_cliente_id, id_externo);

alter table lectura_odometro enable row level security;
drop trigger if exists lectura_odometro_tocar on lectura_odometro;
create trigger lectura_odometro_tocar before update on lectura_odometro
  for each row execute function tocar_updated_date();

create or replace function lectura_odometro_reglas() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  antes numeric;
  despues numeric;
begin
  if not es_vehiculo(new.equipo_id) then
    raise exception 'La lectura tiene que ser de un vehículo de la flota.';
  end if;
  if new.fecha_lectura is null then raise exception 'Falta la fecha y hora de la lectura.'; end if;
  if new.fecha_lectura > now() + interval '1 day' then
    raise exception 'La fecha de la lectura (%) está en el futuro.', new.fecha_lectura;
  end if;
  if new.km is null or new.km < 0 then raise exception 'El kilometraje no puede ser negativo.'; end if;
  if new.km > 3000000 then raise exception 'Un odómetro de % km no es posible: revisa el número.', new.km; end if;

  -- El odómetro no retrocede: ni menos que una lectura anterior, ni más que
  -- una posterior (una lectura vieja que llega tarde tiene que calzar).
  select max(km) into antes from lectura_odometro
   where equipo_id = new.equipo_id and id <> new.id and fecha_lectura < new.fecha_lectura;
  if antes is not null and new.km < antes then
    raise exception 'El kilometraje (%) es menor que el de una lectura anterior de este vehículo (%).', new.km, antes;
  end if;
  select min(km) into despues from lectura_odometro
   where equipo_id = new.equipo_id and id <> new.id and fecha_lectura > new.fecha_lectura;
  if despues is not null and new.km > despues then
    raise exception 'El kilometraje (%) es mayor que el de una lectura posterior de este vehículo (%).', new.km, despues;
  end if;

  new.fecha := (new.fecha_lectura at time zone 'America/Santiago')::date;
  new.equipo_label := coalesce(rotulo_vehiculo(new.equipo_id), new.equipo_label);
  new.centro := (select centro_principal from equipo where id = new.equipo_id);
  return new;
end $$;

drop trigger if exists lectura_odometro_reglas on lectura_odometro;
create trigger lectura_odometro_reglas before insert or update on lectura_odometro
  for each row execute function lectura_odometro_reglas();
-- Solo como disparador: que no se pueda llamar por /rest/v1/rpc.
revoke execute on function lectura_odometro_reglas() from public, anon, authenticated;

-- La ven quienes ven los gastos de la flota (32_*.sql) y el Taller, que
-- programa mantenciones por kilometraje. Nadie la escribe con sesión: solo
-- llega por la API. Borrar, solo Base del Sistema.
drop policy if exists lectura_odometro_read on lectura_odometro;
create policy lectura_odometro_read on lectura_odometro for select to authenticated
  using (mi_rol() in ('super_admin', 'admin', 'unidad_control', 'encargado_movilizacion',
                      'monitor_corporativo', 'jefe_taller'));
drop policy if exists lectura_odometro_delete on lectura_odometro;
create policy lectura_odometro_delete on lectura_odometro for delete to authenticated
  using (mi_rol() = 'super_admin');
-- Los permisos se dan explícitos, sin contar con los que Supabase pone por
-- defecto: authenticated lee y borra, y las policies de arriba deciden quién y qué filas.
revoke all on lectura_odometro from anon, authenticated;
grant select, delete on lectura_odometro to authenticated;

-- La más reciente de cada vehículo. security_invoker: aplica la policy de
-- arriba a quien la consulta.
create or replace view ultima_lectura_odometro with (security_invoker = true) as
select distinct on (equipo_id) id, equipo_id, equipo_label, fecha_lectura, fecha, km, fuente, centro
  from lectura_odometro
 order by equipo_id, fecha_lectura desc;
revoke all on ultima_lectura_odometro from anon, authenticated;
grant select on ultima_lectura_odometro to authenticated;

-- El servidor (llave de servicio) es el único que escribe.
grant select, insert, update on api_cliente to service_role;
grant select, insert, delete on api_registro to service_role;
grant select, insert, update, delete on lectura_odometro to service_role;
grant select on ultima_lectura_odometro to service_role;

commit;

-- PostgREST tiene que ver las columnas y la vista nuevas.
notify pgrst, 'reload schema';

-- ── Verificación: cada fila debe decir lo mismo en las dos columnas ─
select 'tablas de la API' as que, count(*)::text as hay, '3' as esperado
  from pg_tables where schemaname = 'public'
   and tablename in ('api_cliente', 'api_registro', 'lectura_odometro')
union all
select 'columnas id_externo en cargas y pagos', count(*)::text, '2'
  from information_schema.columns
 where table_schema = 'public' and column_name = 'id_externo'
   and table_name in ('carga_combustible', 'pago_vehiculo')
union all
select 'origen api permitido', count(*)::text, '2'
  from pg_constraint
 where conname in ('carga_combustible_valores', 'pago_vehiculo_valores')
   and pg_get_constraintdef(oid) like '%''api''%'
union all
select 'permisos de anon o authenticated en api_cliente / api_registro', count(*)::text, '0'
  from information_schema.role_table_grants
 where table_schema = 'public' and table_name in ('api_cliente', 'api_registro')
   and grantee in ('anon', 'authenticated');
