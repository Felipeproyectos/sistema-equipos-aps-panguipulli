-- ═══════════════════════════════════════════════════════════════════
-- 31_solicitudes_monitor.sql
--
-- Las solicitudes de los equipos vitales se canalizan por el Monitor
-- Corporativo, con el detalle completo.
--
-- Por qué
-- ───────
-- Las pautas e informes llegan a los Encargados de Salud, y ellos mismos
-- cerraban las solicitudes. Ahora quien las resuelve es el Monitor
-- Corporativo (la persona de la Corporación Municipal), y para poder hacerlo
-- sin llamar al centro cada solicitud tiene que traer: qué es (mantenimiento,
-- compra de insumo o desperfecto técnico), el CESFAM, la ubicación exacta, el
-- equipo con marca, modelo, serie e inventario, y quién la pide.
--
-- El recorrido (src/lib/solicitudesMonitor.js lo explica igual)
-- ──────────────
--   pendiente  → la abrió alguien del centro; el Encargado de Salud la completa
--   derivada   → enviada, en la bandeja del Monitor
--   en_proceso → el Monitor la tomó
--   devuelta   → el Monitor pide más información; el Encargado la reenvía
--   finalizada → resuelta, con la resolución escrita
--   rechazada  → no procede, con el motivo
--
-- Las de vehículos (ambulancias y flota) siguen igual: las resuelven
-- Movilización y el Taller, y no pueden entrar a este recorrido.
--
-- Qué hace
-- ────────
--   1. Columnas de detalle, del Monitor y una línea de tiempo.
--   2. Un número correlativo por solicitud (SOL-2026-00001).
--   3. Un disparador que hace cumplir el recorrido en la base, no solo en la
--      pantalla: quién mueve cada estado, el detalle obligatorio para enviar,
--      y que el Monitor solo escriba su respuesta. El equipo y el centro se
--      copian de la ficha del equipo al enviar: no se pueden inventar.
--   4. Al resolverse, la alerta que la originó queda resuelta (antes lo hacía
--      la pantalla, y si se cerraba por otro lado la alerta quedaba activa).
--   5. El Monitor lee todas las solicitudes y actualiza solo las que le
--      llegaron. Movilización ya no puede tocar las que no son de vehículos.
--   6. Aviso por correo al Monitor cuando le llega una, y al centro cuando el
--      Monitor la devuelve o la cierra (servidor/funciones/notificarSolicitudMonitor.js).
--
-- Va después de 12 (policies de Movilización) y 25 (columna origen). Es
-- re-ejecutable. Ejecutar una vez en Supabase (SQL Editor → New query →
-- pegar todo → Run) ANTES de desplegar la versión nueva de la aplicación.
-- ═══════════════════════════════════════════════════════════════════

begin;

-- ── 1) Columnas ─────────────────────────────────────────────────────
alter table solicitud add column if not exists numero_solicitud text;
alter table solicitud add column if not exists categoria text;
alter table solicitud add column if not exists prioridad text;
alter table solicitud add column if not exists operatividad text;
alter table solicitud add column if not exists descripcion text;
alter table solicitud add column if not exists fecha_deteccion date;
alter table solicitud add column if not exists equipo_tipo text;
alter table solicitud add column if not exists equipo_marca text;
alter table solicitud add column if not exists equipo_modelo text;
alter table solicitud add column if not exists equipo_numero_serie text;
alter table solicitud add column if not exists equipo_numero_inventario text;
alter table solicitud add column if not exists subsede text;
alter table solicitud add column if not exists ubicacion_especifica text;
alter table solicitud add column if not exists solicitante_cargo text;
alter table solicitud add column if not exists solicitante_telefono text;
alter table solicitud add column if not exists insumo_nombre text;
alter table solicitud add column if not exists insumo_cantidad numeric;
alter table solicitud add column if not exists insumo_especificacion text;
alter table solicitud add column if not exists derivada_por_email text;
alter table solicitud add column if not exists derivada_por_nombre text;
alter table solicitud add column if not exists fecha_derivacion timestamptz;
alter table solicitud add column if not exists monitor_email text;
alter table solicitud add column if not exists monitor_nombre text;
alter table solicitud add column if not exists fecha_toma timestamptz;
alter table solicitud add column if not exists fecha_resolucion timestamptz;
alter table solicitud add column if not exists resolucion text;
alter table solicitud add column if not exists linea_tiempo jsonb default '[]'::jsonb;

-- Valores permitidos. NOT VALID: rige para lo que se escriba desde ahora, sin
-- revisar las filas viejas (que no tienen estos campos).
alter table solicitud drop constraint if exists solicitud_estado_valido;
alter table solicitud add constraint solicitud_estado_valido check (estado is null
  or estado in ('pendiente', 'derivada', 'en_proceso', 'devuelta', 'finalizada', 'rechazada')) not valid;
alter table solicitud drop constraint if exists solicitud_categoria_valida;
alter table solicitud add constraint solicitud_categoria_valida check (categoria is null
  or categoria in ('mantenimiento', 'compra_insumo', 'desperfecto_tecnico')) not valid;
alter table solicitud drop constraint if exists solicitud_prioridad_valida;
alter table solicitud add constraint solicitud_prioridad_valida check (prioridad is null
  or prioridad in ('critica', 'alta', 'media', 'baja')) not valid;
alter table solicitud drop constraint if exists solicitud_operatividad_valida;
alter table solicitud add constraint solicitud_operatividad_valida check (operatividad is null
  or operatividad in ('operativo', 'operativo_con_restricciones', 'fuera_de_servicio')) not valid;
alter table solicitud drop constraint if exists solicitud_insumo_cantidad_valida;
alter table solicitud add constraint solicitud_insumo_cantidad_valida check (insumo_cantidad is null
  or (insumo_cantidad > 0 and insumo_cantidad <= 100000)) not valid;

create index if not exists solicitud_estado_idx on solicitud (estado);
create unique index if not exists solicitud_numero_uniq on solicitud (numero_solicitud)
  where numero_solicitud is not null;

-- ── 2) Número correlativo ───────────────────────────────────────────
create sequence if not exists solicitud_numero_seq;

-- ── Funciones de apoyo ──────────────────────────────────────────────
create or replace function es_del_sistema() returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce(mi_rol(), '') <> '' $$;

create or replace function mi_nombre() returns text
  language sql stable security definer set search_path = public as $$
  select coalesce(nullif(full_name, ''), email) from usuario
   where lower(email) = lower(auth.jwt() ->> 'email') limit 1 $$;

-- La misma regla que esSolicitudDeFlota (src/lib/panelFlota.js): si apunta a
-- un equipo decide el equipo; si no, el tipo de lo que se pide.
create or replace function es_solicitud_de_flota(id_equipo text, tipo_solicitud text) returns boolean
  language sql stable security definer set search_path = public as $$
  select case
    when coalesce(id_equipo, '') <> '' and exists (select 1 from equipo where id = id_equipo)
      then exists (select 1 from equipo where id = id_equipo
                    and tipo in ('ambulancia', 'camioneta', 'furgon', 'camion_3_4'))
    else coalesce(tipo_solicitud, '') in ('mantenimiento_correctivo', 'mantenimiento_preventivo', 'revision_tecnica')
         and coalesce(id_equipo, '') = ''
  end $$;

-- ── 3) El recorrido ─────────────────────────────────────────────────
create or replace function solicitud_flujo() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  rol text := mi_rol();
  correo text := auth.jwt() ->> 'email';
  viejo text;
  nuevo text := coalesce(new.estado, 'pendiente');
  eq equipo;
  faltan text[] := array[]::text[];
  -- Lo único que el Monitor puede cambiar: su respuesta.
  libres_monitor text[] := array['estado', 'resolucion', 'respuesta_admin', 'monitor_email', 'monitor_nombre',
                                 'fecha_toma', 'fecha_resolucion', 'linea_tiempo', 'updated_date', 'numero_solicitud'];
begin
  -- Número correlativo: se pone una vez y no cambia. Las viejas lo reciben la
  -- primera vez que se tocan.
  if tg_op = 'UPDATE' and coalesce(old.numero_solicitud, '') <> '' then
    new.numero_solicitud := old.numero_solicitud;
  elsif coalesce(new.numero_solicitud, '') = '' then
    new.numero_solicitud := 'SOL-' || to_char(now() at time zone 'America/Santiago', 'YYYY')
      || '-' || lpad(nextval('solicitud_numero_seq')::text, 5, '0');
  end if;

  -- El servidor (llave de servicio, sin persona) y el SQL Editor no tienen rol:
  -- abren solicitudes de pautas con fallas y no pasan por estas reglas.
  if rol is null then
    return new;
  end if;

  viejo := case when tg_op = 'UPDATE' then coalesce(old.estado, 'pendiente') else null end;

  -- Vehículos: siguen con Movilización y el Taller, como siempre.
  if es_solicitud_de_flota(new.equipo_id, new.tipo) then
    if nuevo in ('derivada', 'devuelta', 'rechazada') then
      raise exception 'Las solicitudes de vehículos las resuelven Movilización y el Taller, no el Monitor Corporativo.';
    end if;
    return new;
  end if;

  if rol = 'encargado_movilizacion' then
    raise exception 'Movilización solo gestiona solicitudes de vehículos.';
  end if;

  -- La línea de tiempo solo crece.
  if tg_op = 'UPDATE' and rol <> 'super_admin'
     and not (coalesce(new.linea_tiempo, '[]'::jsonb) @> coalesce(old.linea_tiempo, '[]'::jsonb)) then
    raise exception 'La línea de tiempo de la solicitud no se puede borrar ni corregir, solo agregarle.';
  end if;

  -- ¿Quién puede mover cada estado? Base del Sistema, todo.
  if rol <> 'super_admin' then
    if tg_op = 'INSERT' then
      if nuevo not in ('pendiente', 'derivada') then
        raise exception 'Una solicitud nueva queda pendiente o se envía al Monitor Corporativo.';
      end if;
      if nuevo = 'derivada' and rol not in ('admin', 'encargado_salud') then
        raise exception 'Solo el Encargado de Salud envía solicitudes al Monitor Corporativo.';
      end if;
    else
      if viejo in ('finalizada', 'rechazada') then
        raise exception 'La solicitud % ya está cerrada.', new.numero_solicitud;
      end if;

      if rol = 'monitor_corporativo' then
        if not (viejo in ('derivada', 'en_proceso')
                and (nuevo in ('finalizada', 'devuelta', 'rechazada')
                     or (viejo = 'derivada' and nuevo in ('derivada', 'en_proceso'))
                     or (viejo = 'en_proceso' and nuevo = 'en_proceso'))) then
          raise exception 'El Monitor Corporativo solo gestiona las solicitudes que le enviaron.';
        end if;
        if (to_jsonb(new) - libres_monitor) is distinct from (to_jsonb(old) - libres_monitor) then
          raise exception 'El Monitor Corporativo solo puede responder la solicitud; el detalle lo escribe el centro.';
        end if;
        if nuevo in ('finalizada', 'devuelta', 'rechazada') and coalesce(trim(new.resolucion), '') = '' then
          raise exception 'Escribe la resolución o el motivo antes de cerrar o devolver la solicitud.';
        end if;
      elsif rol in ('admin', 'encargado_salud') then
        if viejo in ('derivada', 'en_proceso') then
          raise exception 'La solicitud % está en manos del Monitor Corporativo: si hay que corregir algo, pídele que la devuelva.', new.numero_solicitud;
        end if;
        if nuevo not in ('pendiente', 'devuelta', 'derivada') or (viejo = 'pendiente' and nuevo = 'devuelta') then
          raise exception 'Las solicitudes de equipos vitales las resuelve el Monitor Corporativo: el centro las completa y se las envía.';
        end if;
      else
        -- Quien la abrió (Usuario) solo la edita mientras sigue pendiente.
        if not (viejo = 'pendiente' and nuevo = 'pendiente') then
          raise exception 'Solo el Encargado de Salud puede enviar la solicitud al Monitor Corporativo.';
        end if;
      end if;
    end if;
  end if;

  -- Quien la abre a su nombre: su propio correo, si no viene.
  if tg_op = 'INSERT' and coalesce(new.usuario_email, '') = '' then
    new.usuario_email := correo;
  end if;

  -- Enviar (o reenviar): el equipo y el centro salen de la ficha del equipo,
  -- y el detalle tiene que estar completo.
  if nuevo = 'derivada' and (tg_op = 'INSERT' or viejo is distinct from 'derivada') then
    select * into eq from equipo where id = new.equipo_id;
    if eq.id is null then
      faltan := faltan || 'el equipo'::text;
    else
      new.equipo_tipo := eq.tipo;
      new.equipo_marca := eq.marca;
      new.equipo_modelo := eq.modelo;
      new.equipo_numero_serie := eq.numero_serie;
      new.equipo_numero_inventario := eq.numero_inventario;
      new.centro := coalesce(nullif(trim(eq.centro_principal), ''), new.centro);
      new.subsede := coalesce(nullif(trim(new.subsede), ''), eq.subsede);
      new.ubicacion_especifica := coalesce(nullif(trim(new.ubicacion_especifica), ''), eq.ubicacion_especifica);
    end if;

    if new.categoria is null then faltan := faltan || 'el tipo de solicitud'::text; end if;
    if coalesce(trim(new.centro), '') = '' then faltan := faltan || 'el CESFAM o centro'::text; end if;
    if coalesce(trim(new.ubicacion_especifica), '') = '' then faltan := faltan || 'la ubicación exacta'::text; end if;
    if new.prioridad is null then faltan := faltan || 'la prioridad'::text; end if;
    if new.operatividad is null then faltan := faltan || 'el estado del equipo'::text; end if;
    if length(coalesce(trim(new.descripcion), '')) < 20 then faltan := faltan || 'una descripción de al menos 20 caracteres'::text; end if;
    if coalesce(trim(new.usuario_nombre), '') = '' then faltan := faltan || 'quién solicita'::text; end if;
    if coalesce(trim(new.solicitante_cargo), '') = '' then faltan := faltan || 'el cargo de quien solicita'::text; end if;
    if new.categoria = 'compra_insumo' then
      if coalesce(trim(new.insumo_nombre), '') = '' then faltan := faltan || 'el insumo'::text; end if;
      if coalesce(new.insumo_cantidad, 0) <= 0 then faltan := faltan || 'la cantidad del insumo'::text; end if;
    end if;
    if new.categoria = 'desperfecto_tecnico' and new.fecha_deteccion is null then
      faltan := faltan || 'la fecha en que se detectó la falla'::text;
    end if;
    if array_length(faltan, 1) > 0 then
      raise exception 'Para enviar la solicitud al Monitor Corporativo falta: %.', array_to_string(faltan, ', ');
    end if;

    new.derivada_por_email := correo;
    new.derivada_por_nombre := mi_nombre();
    new.fecha_derivacion := now();
    new.resolucion := null;
  end if;

  -- Lo que hace el Monitor queda a su nombre.
  if nuevo in ('en_proceso', 'devuelta', 'finalizada', 'rechazada')
     and (tg_op = 'INSERT' or viejo is distinct from nuevo)
     and rol in ('monitor_corporativo', 'super_admin') then
    new.monitor_email := correo;
    new.monitor_nombre := mi_nombre();
    if nuevo = 'en_proceso' then new.fecha_toma := now(); end if;
    if nuevo in ('devuelta', 'finalizada', 'rechazada') and new.fecha_toma is null then new.fecha_toma := now(); end if;
  end if;
  if nuevo in ('finalizada', 'rechazada') and (tg_op = 'INSERT' or viejo is distinct from nuevo) then
    new.fecha_resolucion := now();
  end if;

  return new;
end $$;

drop trigger if exists solicitud_flujo on solicitud;
create trigger solicitud_flujo
  before insert or update on solicitud
  for each row execute function solicitud_flujo();

-- ── 4) La alerta que la originó se resuelve con ella ────────────────
create or replace function solicitud_resuelve_alerta() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.estado = 'finalizada' and old.estado is distinct from 'finalizada'
     and coalesce(new.alerta_id, '') <> '' then
    update alerta set estado = 'resuelta', fecha_resolucion = (now() at time zone 'America/Santiago')::date
     where id = new.alerta_id and estado is distinct from 'resuelta';
  end if;
  return null;
end $$;

drop trigger if exists solicitud_resuelve_alerta on solicitud;
create trigger solicitud_resuelve_alerta
  after update on solicitud
  for each row execute function solicitud_resuelve_alerta();

-- ── 5) Quién la ve y quién la actualiza ─────────────────────────────
-- Se conserva todo lo de 12_movilizacion.sql y se agrega el Monitor.
drop policy if exists solicitud_read on solicitud;
create policy solicitud_read on solicitud for select to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'admin' or mi_rol() = 'encargado_salud'
    or mi_rol() = 'encargado_compras_salud' or (es_del_sistema() and created_by_id = mi_id())
    or mi_rol() = 'encargado_movilizacion' or mi_rol() = 'monitor_corporativo'));

drop policy if exists solicitud_update on solicitud;
create policy solicitud_update on solicitud for update to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'admin' or mi_rol() = 'encargado_salud'
    or (es_del_sistema() and created_by_id = mi_id() and estado = 'pendiente')
    or mi_rol() = 'encargado_movilizacion'
    or (mi_rol() = 'monitor_corporativo' and estado in ('derivada', 'en_proceso'))))
  with check ((mi_rol() = 'super_admin' or mi_rol() = 'admin' or mi_rol() = 'encargado_salud'
    or (es_del_sistema() and created_by_id = mi_id() and estado = 'pendiente')
    or mi_rol() = 'encargado_movilizacion'
    or (mi_rol() = 'monitor_corporativo' and estado in ('derivada', 'en_proceso', 'devuelta', 'finalizada', 'rechazada'))));

-- ── 6) Avisos por correo ────────────────────────────────────────────
-- avisar_al_servidor viene de 04_webhooks.sql. Solo cuando cambia el estado.
drop trigger if exists solicitud_avisa_monitor on solicitud;
create trigger solicitud_avisa_monitor
  after insert or update of estado on solicitud
  for each row
  when (new.estado in ('derivada', 'devuelta', 'finalizada', 'rechazada'))
  execute function avisar_al_servidor('notificarSolicitudMonitor', 'Solicitud');

commit;

-- ── Verificación ────────────────────────────────────────────────────
-- Las filas deben coincidir.
select 'columnas nuevas de solicitud' as que, count(*)::text as hay, '27' as esperado
  from information_schema.columns
  where table_schema = 'public' and table_name = 'solicitud'
    and column_name in ('numero_solicitud', 'categoria', 'prioridad', 'operatividad', 'descripcion',
      'fecha_deteccion', 'equipo_tipo', 'equipo_marca', 'equipo_modelo', 'equipo_numero_serie',
      'equipo_numero_inventario', 'subsede', 'ubicacion_especifica', 'solicitante_cargo',
      'solicitante_telefono', 'insumo_nombre', 'insumo_cantidad', 'insumo_especificacion',
      'derivada_por_email', 'derivada_por_nombre', 'fecha_derivacion', 'monitor_email',
      'monitor_nombre', 'fecha_toma', 'fecha_resolucion', 'resolucion', 'linea_tiempo')
union all select 'disparadores de solicitud', count(*)::text, '3'
  from pg_trigger where tgname in ('solicitud_flujo', 'solicitud_resuelve_alerta', 'solicitud_avisa_monitor')
union all select 'policy de lectura con el Monitor', count(*)::text, '1'
  from pg_policies where schemaname = 'public' and tablename = 'solicitud' and policyname = 'solicitud_read'
    and coalesce(qual, '') like '%monitor_corporativo%'
union all select 'policy de update con el Monitor', count(*)::text, '1'
  from pg_policies where schemaname = 'public' and tablename = 'solicitud' and policyname = 'solicitud_update'
    and coalesce(qual, '') like '%monitor_corporativo%';
