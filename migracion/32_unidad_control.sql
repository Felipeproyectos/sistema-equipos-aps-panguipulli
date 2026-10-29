-- ═══════════════════════════════════════════════════════════════════
-- 32_unidad_control.sql
--
-- Perfil "Unidad de Control": registra las cargas de combustible y los
-- pagos de cada vehículo, con todo su detalle y su comprobante.
--
-- Por qué
-- ───────
-- La Unidad de Control lleva hoy esos gastos en planillas. La bitácora de
-- Movilización anota litros y monto de pasada, pero no la boleta, la
-- estación, el medio de pago ni el centro que paga; y los pagos del vehículo
-- (permiso de circulación, revisión técnica, SOAP, multas, peajes,
-- reparaciones externas) no se registraban en ninguna parte.
--
-- Qué hace
-- ────────
--   1. carga_combustible y pago_vehiculo, con el detalle completo y un tipo
--      "otro" con categoría libre para lo que no calce en la lista.
--   2. Un disparador por tabla que:
--        · exige que el registro sea de un vehículo y que los números tengan
--          sentido (litros > 0, montos >= 0, kilometraje que no retrocede
--          respecto de la carga anterior, vigencias en orden);
--        · congela el centro que paga: si ese día el vehículo estaba
--          prestado, el del préstamo (igual que la bitácora, 18_*.sql);
--        · deja a nombre de quien la registró, y no se puede cambiar;
--        · no se borra: se ANULA con motivo, a nombre de quien anula, y
--          una anulada ya no se edita (solo Base del Sistema la reabre).
--   3. Quién ve: Base del Sistema, Administración, Unidad de Control,
--      Movilización y el Monitor Corporativo. Quién escribe: Unidad de
--      Control y Base del Sistema. Borrar, solo Base del Sistema.
--   4. La Unidad de Control lee los vehículos (no los equipos médicos).
--   5. Todo pasa por Auditoría (avisar_al_servidor, 04_webhooks.sql).
--
-- Va después de 16 y 18 (prestamo_vehiculo, prestamo_en_fecha) y de 28
-- (es_del_sistema, prestada_a). Es re-ejecutable. Ejecutar una vez en
-- Supabase (SQL Editor → New query → pegar todo → Run) ANTES de desplegar.
-- ═══════════════════════════════════════════════════════════════════

begin;

-- ── 1) Tablas ───────────────────────────────────────────────────────
create table if not exists carga_combustible (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz default now(),
  updated_date timestamptz,
  created_by_id text,
  created_by text,
  is_sample boolean default false,
  equipo_id text,
  equipo_label text,
  fecha date,
  hora text,
  km numeric,
  litros numeric,
  estanque_lleno boolean default false,
  tipo_combustible text,
  precio_litro numeric,
  monto numeric,
  estacion text,
  comuna text,
  documento_tipo text,
  documento_numero text,
  medio_pago text,
  tarjeta text,
  chofer_nombre text,
  centro_costo text,
  prestamo_id text,
  comprobante_url text,
  observaciones text,
  origen text default 'manual',
  estado text default 'vigente',
  motivo_anulacion text,
  anulado_por text,
  fecha_anulacion timestamptz,
  registrado_por_email text,
  registrado_por_nombre text
);

create table if not exists pago_vehiculo (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz default now(),
  updated_date timestamptz,
  created_by_id text,
  created_by text,
  is_sample boolean default false,
  equipo_id text,
  equipo_label text,
  tipo text,
  categoria_otro text,
  descripcion text,
  fecha_pago date,
  monto numeric,
  estado_pago text default 'pagado',
  vence_pago date,
  proveedor text,
  rut_proveedor text,
  documento_tipo text,
  documento_numero text,
  medio_pago text,
  vigencia_desde date,
  vigencia_hasta date,
  centro_costo text,
  prestamo_id text,
  comprobante_url text,
  observaciones text,
  origen text default 'manual',
  estado text default 'vigente',
  motivo_anulacion text,
  anulado_por text,
  fecha_anulacion timestamptz,
  registrado_por_email text,
  registrado_por_nombre text
);

alter table carga_combustible enable row level security;
alter table pago_vehiculo enable row level security;

create index if not exists carga_combustible_equipo_idx on carga_combustible (equipo_id, fecha);
create index if not exists carga_combustible_fecha_idx on carga_combustible (fecha);
create index if not exists pago_vehiculo_equipo_idx on pago_vehiculo (equipo_id, fecha_pago);
create index if not exists pago_vehiculo_vigencia_idx on pago_vehiculo (vigencia_hasta) where estado = 'vigente';

-- Valores permitidos.
alter table carga_combustible drop constraint if exists carga_combustible_valores;
alter table carga_combustible add constraint carga_combustible_valores check (
  (estado is null or estado in ('vigente', 'anulado'))
  and (origen is null or origen in ('manual', 'planilla'))
  and (tipo_combustible is null or tipo_combustible in ('diesel', 'gasolina_93', 'gasolina_95', 'gasolina_97', 'otro'))
  and (documento_tipo is null or documento_tipo in ('boleta', 'factura', 'guia', 'vale', 'otro'))
  and (medio_pago is null or medio_pago in ('tarjeta_combustible', 'efectivo', 'transferencia', 'credito', 'otro'))
);
alter table pago_vehiculo drop constraint if exists pago_vehiculo_valores;
alter table pago_vehiculo add constraint pago_vehiculo_valores check (
  (estado is null or estado in ('vigente', 'anulado'))
  and (estado_pago is null or estado_pago in ('pendiente', 'pagado'))
  and (origen is null or origen in ('manual', 'planilla'))
  and (tipo is null or tipo in ('permiso_circulacion', 'revision_tecnica', 'soap', 'seguro', 'peaje_tag',
       'multa', 'reparacion_externa', 'neumaticos', 'lavado', 'estacionamiento', 'otro'))
  and (documento_tipo is null or documento_tipo in ('boleta', 'factura', 'guia', 'vale', 'otro'))
  and (medio_pago is null or medio_pago in ('tarjeta_combustible', 'efectivo', 'transferencia', 'credito', 'otro'))
);

drop trigger if exists carga_combustible_tocar on carga_combustible;
create trigger carga_combustible_tocar before update on carga_combustible
  for each row execute function tocar_updated_date();
drop trigger if exists pago_vehiculo_tocar on pago_vehiculo;
create trigger pago_vehiculo_tocar before update on pago_vehiculo
  for each row execute function tocar_updated_date();

-- ── Apoyo ───────────────────────────────────────────────────────────
create or replace function es_del_sistema() returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce(mi_rol(), '') <> '' $$;

create or replace function mi_nombre() returns text
  language sql stable security definer set search_path = public as $$
  select coalesce(nullif(full_name, ''), email) from usuario
   where lower(email) = lower(auth.jwt() ->> 'email') limit 1 $$;

create or replace function es_vehiculo(id_equipo text) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from equipo where id = id_equipo
                  and tipo in ('ambulancia', 'camioneta', 'furgon', 'camion_3_4')) $$;

create or replace function rotulo_vehiculo(id_equipo text) returns text
  language sql stable security definer set search_path = public as $$
  select concat_ws(' · ', nullif(trim(patente), ''), nullif(trim(concat_ws(' ', marca, modelo)), ''))
    from equipo where id = id_equipo $$;

-- Lo común a las dos tablas: quién registra, anular, editar una anulada.
-- Devuelve el registro con los campos de control ya puestos.
create or replace function control_registro_comun(nuevo jsonb, viejo jsonb, op text) returns jsonb
  language plpgsql stable security definer set search_path = public as $$
declare
  rol text := mi_rol();
  libres text[] := array['estado', 'motivo_anulacion', 'anulado_por', 'fecha_anulacion', 'updated_date'];
begin
  if op = 'INSERT' then
    if rol is not null then
      nuevo := nuevo || jsonb_build_object('registrado_por_email', auth.jwt() ->> 'email',
                                           'registrado_por_nombre', mi_nombre());
    end if;
    if coalesce(nuevo ->> 'estado', 'vigente') = 'anulado' then
      raise exception 'Un registro nuevo no puede nacer anulado.';
    end if;
    return nuevo || jsonb_build_object('estado', 'vigente');
  end if;

  -- Quién lo registró no cambia.
  nuevo := nuevo || jsonb_build_object('registrado_por_email', viejo -> 'registrado_por_email',
                                       'registrado_por_nombre', viejo -> 'registrado_por_nombre');

  if coalesce(viejo ->> 'estado', 'vigente') = 'anulado' and rol is distinct from 'super_admin' and rol is not null then
    raise exception 'El registro está anulado y ya no se modifica.';
  end if;

  if coalesce(nuevo ->> 'estado', 'vigente') = 'anulado' and coalesce(viejo ->> 'estado', 'vigente') <> 'anulado' then
    if length(trim(coalesce(nuevo ->> 'motivo_anulacion', ''))) < 5 then
      raise exception 'Para anular escribe el motivo.';
    end if;
    -- Al anular no se toca nada más.
    if rol is not null and rol <> 'super_admin' and (nuevo - libres) is distinct from (viejo - libres) then
      raise exception 'Al anular un registro no se pueden cambiar sus datos.';
    end if;
    nuevo := nuevo || jsonb_build_object('anulado_por', coalesce(mi_nombre(), 'sistema'),
                                         'fecha_anulacion', now());
  end if;
  return nuevo;
end $$;

-- ── 2) Reglas de cada tabla ─────────────────────────────────────────
create or replace function carga_combustible_reglas() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  p prestamo_vehiculo;
  anterior numeric;
begin
  new := jsonb_populate_record(new, control_registro_comun(to_jsonb(new),
           case when tg_op = 'UPDATE' then to_jsonb(old) else null end, tg_op));
  if new.estado = 'anulado' then return new; end if;

  if not es_vehiculo(new.equipo_id) then
    raise exception 'La carga tiene que ser de un vehículo de la flota.';
  end if;
  if new.fecha is null then raise exception 'Falta la fecha de la carga.'; end if;
  if new.fecha > (now() at time zone 'America/Santiago')::date + 1 then
    raise exception 'La fecha de la carga (%) está en el futuro.', new.fecha;
  end if;
  if coalesce(new.litros, 0) <= 0 then raise exception 'Los litros tienen que ser mayores que cero.'; end if;
  if new.litros > 1000 then raise exception 'Una carga de % litros no es posible: revisa el número.', new.litros; end if;
  if new.precio_litro is not null and new.precio_litro < 0 then raise exception 'El precio por litro no puede ser negativo.'; end if;
  if new.monto is null and new.precio_litro is not null then
    new.monto := round(new.litros * new.precio_litro);
  end if;
  if new.monto is null or new.monto < 0 then raise exception 'Falta el monto de la carga.'; end if;
  if new.km is not null and new.km < 0 then raise exception 'El kilometraje no puede ser negativo.'; end if;

  -- El odómetro no retrocede respecto de la carga anterior del mismo vehículo.
  if new.km is not null then
    select max(km) into anterior from carga_combustible
     where equipo_id = new.equipo_id and estado = 'vigente' and id <> new.id
       and (fecha < new.fecha or (fecha = new.fecha and coalesce(hora, '') < coalesce(new.hora, '')));
    if anterior is not null and new.km < anterior then
      raise exception 'El kilometraje (%) es menor que el de una carga anterior de este vehículo (%).', new.km, anterior;
    end if;
  end if;

  new.equipo_label := coalesce(rotulo_vehiculo(new.equipo_id), new.equipo_label);
  -- El centro que paga se calcula cada vez que cambia el vehículo o la fecha.
  if tg_op = 'INSERT' or new.equipo_id is distinct from old.equipo_id or new.fecha is distinct from old.fecha then
    p := prestamo_en_fecha(new.equipo_id, new.fecha);
    if p.id is not null then
      new.prestamo_id := p.id;
      new.centro_costo := coalesce(nullif(trim(p.centro_costo), ''), p.centro_destino);
    else
      -- Sin préstamo ese día paga el dueño. No centro_que_paga(): esa
      -- mira el préstamo vigente HOY, y la carga puede ser de antes.
      new.prestamo_id := null;
      new.centro_costo := (select centro_principal from equipo where id = new.equipo_id);
    end if;
  end if;
  return new;
end $$;

drop trigger if exists carga_combustible_reglas on carga_combustible;
create trigger carga_combustible_reglas before insert or update on carga_combustible
  for each row execute function carga_combustible_reglas();

create or replace function pago_vehiculo_reglas() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  p prestamo_vehiculo;
  dia date;
begin
  new := jsonb_populate_record(new, control_registro_comun(to_jsonb(new),
           case when tg_op = 'UPDATE' then to_jsonb(old) else null end, tg_op));
  if new.estado = 'anulado' then return new; end if;

  if not es_vehiculo(new.equipo_id) then
    raise exception 'El pago tiene que ser de un vehículo de la flota.';
  end if;
  if new.tipo is null then raise exception 'Falta el tipo de pago.'; end if;
  if new.tipo = 'otro' and length(trim(coalesce(new.categoria_otro, ''))) < 3 then
    raise exception 'Para un pago "Otro" escribe de qué se trata.';
  end if;
  if new.monto is null or new.monto < 0 then raise exception 'Falta el monto del pago.'; end if;
  if coalesce(new.estado_pago, 'pagado') = 'pagado' and new.fecha_pago is null then
    raise exception 'Un pago hecho necesita la fecha de pago.';
  end if;
  if new.estado_pago = 'pendiente' and new.vence_pago is null then
    raise exception 'Un pago pendiente necesita la fecha en que vence.';
  end if;
  if new.vigencia_desde is not null and new.vigencia_hasta is not null and new.vigencia_hasta < new.vigencia_desde then
    raise exception 'La vigencia termina antes de empezar.';
  end if;
  if new.tipo in ('permiso_circulacion', 'revision_tecnica', 'soap') and new.vigencia_hasta is null then
    raise exception 'Indica hasta cuándo queda vigente (permiso, revisión técnica o SOAP).';
  end if;

  new.equipo_label := coalesce(rotulo_vehiculo(new.equipo_id), new.equipo_label);
  dia := coalesce(new.fecha_pago, new.vence_pago, (now() at time zone 'America/Santiago')::date);
  if tg_op = 'INSERT' or new.equipo_id is distinct from old.equipo_id
     or new.fecha_pago is distinct from old.fecha_pago or new.vence_pago is distinct from old.vence_pago then
    p := prestamo_en_fecha(new.equipo_id, dia);
    if p.id is not null then
      new.prestamo_id := p.id;
      new.centro_costo := coalesce(nullif(trim(p.centro_costo), ''), p.centro_destino);
    else
      -- Sin préstamo ese día paga el dueño. No centro_que_paga(): esa
      -- mira el préstamo vigente HOY, y la carga puede ser de antes.
      new.prestamo_id := null;
      new.centro_costo := (select centro_principal from equipo where id = new.equipo_id);
    end if;
  end if;
  return new;
end $$;

drop trigger if exists pago_vehiculo_reglas on pago_vehiculo;
create trigger pago_vehiculo_reglas before insert or update on pago_vehiculo
  for each row execute function pago_vehiculo_reglas();

-- ── 3) Quién ve y quién escribe ─────────────────────────────────────
drop policy if exists carga_combustible_read on carga_combustible;
create policy carga_combustible_read on carga_combustible for select to authenticated
  using (mi_rol() in ('super_admin', 'admin', 'unidad_control', 'encargado_movilizacion', 'monitor_corporativo'));
drop policy if exists carga_combustible_create on carga_combustible;
create policy carga_combustible_create on carga_combustible for insert to authenticated
  with check (mi_rol() in ('super_admin', 'unidad_control'));
drop policy if exists carga_combustible_update on carga_combustible;
create policy carga_combustible_update on carga_combustible for update to authenticated
  using (mi_rol() in ('super_admin', 'unidad_control'))
  with check (mi_rol() in ('super_admin', 'unidad_control'));
drop policy if exists carga_combustible_delete on carga_combustible;
create policy carga_combustible_delete on carga_combustible for delete to authenticated
  using (mi_rol() = 'super_admin');

drop policy if exists pago_vehiculo_read on pago_vehiculo;
create policy pago_vehiculo_read on pago_vehiculo for select to authenticated
  using (mi_rol() in ('super_admin', 'admin', 'unidad_control', 'encargado_movilizacion', 'monitor_corporativo'));
drop policy if exists pago_vehiculo_create on pago_vehiculo;
create policy pago_vehiculo_create on pago_vehiculo for insert to authenticated
  with check (mi_rol() in ('super_admin', 'unidad_control'));
drop policy if exists pago_vehiculo_update on pago_vehiculo;
create policy pago_vehiculo_update on pago_vehiculo for update to authenticated
  using (mi_rol() in ('super_admin', 'unidad_control'))
  with check (mi_rol() in ('super_admin', 'unidad_control'));
drop policy if exists pago_vehiculo_delete on pago_vehiculo;
create policy pago_vehiculo_delete on pago_vehiculo for delete to authenticated
  using (mi_rol() = 'super_admin');

-- ── 4) La Unidad de Control ve los vehículos ────────────────────────
-- Se conserva lo de 28_29_30_en_un_paso.sql y se agrega la Unidad de Control.
drop policy if exists equipo_read on equipo;
create policy equipo_read on equipo for select to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'admin' or mi_rol() = 'monitor_corporativo'
    or (mi_rol() = 'jefe_taller' and tipo = 'ambulancia')
    or (mi_rol() = 'mecanico' and tipo = 'ambulancia')
    or (mi_rol() = 'encargado_compras_taller' and tipo = 'ambulancia')
    or centro_principal = mi_centro()
    or (mi_rol() in ('encargado_movilizacion', 'unidad_control')
        and tipo in ('ambulancia', 'camioneta', 'furgon', 'camion_3_4'))
    or (tipo = 'ambulancia' and prestada_a(id) = mi_centro())));

-- ── 5) Auditoría ────────────────────────────────────────────────────
drop trigger if exists carga_combustible_historial on carga_combustible;
create trigger carga_combustible_historial after insert or update or delete on carga_combustible
  for each row execute function avisar_al_servidor('registrarHistorial', 'CargaCombustible');
drop trigger if exists pago_vehiculo_historial on pago_vehiculo;
create trigger pago_vehiculo_historial after insert or update or delete on pago_vehiculo
  for each row execute function avisar_al_servidor('registrarHistorial', 'PagoVehiculo');

commit;

-- ── Verificación ────────────────────────────────────────────────────
-- Las filas deben coincidir.
select 'tablas nuevas' as que, count(*)::text as hay, '2' as esperado
  from information_schema.tables where table_schema = 'public' and table_name in ('carga_combustible', 'pago_vehiculo')
union all select 'disparadores de reglas', count(*)::text, '2'
  from pg_trigger where tgname in ('carga_combustible_reglas', 'pago_vehiculo_reglas')
union all select 'policies', count(*)::text, '8'
  from pg_policies where schemaname = 'public' and tablename in ('carga_combustible', 'pago_vehiculo')
union all select 'Unidad de Control lee vehículos', count(*)::text, '1'
  from pg_policies where schemaname = 'public' and tablename = 'equipo' and policyname = 'equipo_read'
    and coalesce(qual, '') like '%unidad_control%';
