-- ═══════════════════════════════════════════════════════════════════
-- 34_simplificar_flujo.sql
--
-- Pautas, alertas y solicitudes: tres cosas distintas, cada una con su
-- recorrido corto.
--
-- Por qué
-- ───────
-- El Encargado de Salud revisaba lo mismo dos veces (aprobar la pauta en
-- Revisión Bitácora y después completar la solicitud en Solicitudes), no podía
-- descartar una solicitud que no ameritaba ir al Monitor —solo enviarla—, y
-- las alertas no se cerraban nunca ni llegaban al área que podía resolverlas.
--
-- La mayor parte del cambio es de la aplicación:
--   · una pauta sin novedades se registra sola en el historial del equipo;
--   · una pauta con fallas la decide el Encargado en la misma tarjeta:
--     enviar al Monitor, resuelto en el centro, o sin gestión;
--   · las alertas se recalculan cada noche y se cierran solas.
-- Esto es lo que la base tiene que permitir para eso.
--
-- Qué hace
-- ────────
--   1. `alerta.automatica`: distingue las alertas que crea la tarea nocturna
--      (se cierran solas al corregir la fecha) de las que escribe una persona
--      (se resuelven a mano). Marca como automáticas las que ya existen de los
--      tipos que solo produce la tarea (revisión técnica, permiso de
--      circulación, certificación, licencias, préstamos).
--   2. `solicitud.cerrada_en`: 'monitor' o 'centro'. Lo anota la base.
--   3. El recorrido (reemplaza la función de 31_solicitudes_monitor.sql):
--        · el Encargado de Salud puede cerrar una solicitud que todavía está
--          en el centro (pendiente o devuelta) como resuelta o como «no
--          requiere gestión», con el motivo por escrito;
--        · la base anota quién creó cada solicitud (`created_by_id`). Las
--          policies le dan a cada persona sus propias solicitudes con ese
--          campo y, desde la migración a Supabase, nadie lo llenaba: el rol
--          Usuario no podía crear, ver ni cancelar las suyas.
--      Todo lo demás del recorrido queda igual.
--
-- Va después de 31_solicitudes_monitor.sql. Es re-ejecutable. Ejecutar una
-- vez en Supabase (SQL Editor → New query → pegar todo → Run) ANTES de
-- desplegar la versión nueva de la aplicación.
-- ═══════════════════════════════════════════════════════════════════

begin;

-- ── 1) Alertas automáticas ──────────────────────────────────────────
alter table alerta add column if not exists automatica boolean;

update alerta set automatica = true
 where automatica is null
   and tipo in ('revision_tecnica_vencida', 'revision_tecnica_por_vencer',
                'permiso_circulacion_vencido', 'permiso_circulacion_por_vencer',
                'certificacion_vencida', 'certificacion_por_vencer',
                'licencia_vencida', 'licencia_por_vencer', 'prestamo_vencido');

-- ── 2) Dónde se cerró la solicitud ──────────────────────────────────
alter table solicitud add column if not exists cerrada_en text;
alter table solicitud drop constraint if exists solicitud_cerrada_en_valida;
alter table solicitud add constraint solicitud_cerrada_en_valida check (cerrada_en is null
  or cerrada_en in ('monitor', 'centro')) not valid;

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
                                 'fecha_toma', 'fecha_resolucion', 'linea_tiempo', 'updated_date', 'numero_solicitud',
                                 'cerrada_en'];
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

  -- Quién la creó lo anota la base, no la pantalla, y no cambia después. Las
  -- policies le dan a cada persona sus propias solicitudes con este campo;
  -- desde la migración nadie lo llenaba, y el Usuario no podía crear una.
  if tg_op = 'INSERT' then
    new.created_by_id := mi_id();
  else
    new.created_by_id := old.created_by_id;
  end if;

  -- La cabina sanitaria es solo de ambulancias.
  if new.ambito = 'cabina' and not exists (select 1 from equipo where id = new.equipo_id and tipo = 'ambulancia') then
    raise exception 'La cabina sanitaria es solo de las ambulancias.';
  end if;

  -- Vehículos: siguen con Movilización y el Taller, como siempre.
  if es_solicitud_de_flota(new.equipo_id, new.tipo, new.ambito) then
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
        if nuevo in ('finalizada', 'rechazada') then
          -- El centro la cierra sin enviarla: la resolvió acá, o no requiere
          -- gestión. Tiene que decir por qué, y queda a su nombre en la línea
          -- de tiempo.
          if length(coalesce(trim(new.resolucion), '')) < 10 then
            raise exception 'Escribe cómo se resolvió en el centro o por qué no requiere gestión (al menos 10 caracteres).';
          end if;
        elsif nuevo not in ('pendiente', 'devuelta', 'derivada') or (viejo = 'pendiente' and nuevo = 'devuelta') then
          raise exception 'El centro completa la solicitud y la envía al Monitor Corporativo, o la cierra indicando cómo se resolvió.';
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
     and (rol = 'monitor_corporativo' or (rol = 'super_admin' and viejo in ('derivada', 'en_proceso'))) then
    new.monitor_email := correo;
    new.monitor_nombre := mi_nombre();
    if nuevo = 'en_proceso' then new.fecha_toma := now(); end if;
    if nuevo in ('devuelta', 'finalizada', 'rechazada') and new.fecha_toma is null then new.fecha_toma := now(); end if;
  end if;
  if nuevo in ('finalizada', 'rechazada') and (tg_op = 'INSERT' or viejo is distinct from nuevo) then
    new.fecha_resolucion := now();
    -- Dónde se cerró: el Monitor la resolvió, o el centro sin enviarla.
    new.cerrada_en := case
      when rol = 'monitor_corporativo' or (rol = 'super_admin' and viejo in ('derivada', 'en_proceso')) then 'monitor'
      else 'centro' end;
  end if;

  return new;
end $$;

-- El disparador ya existe (31_solicitudes_monitor.sql) y apunta a esta
-- función; se vuelve a crear por si esta migración corre sobre una base limpia.
drop trigger if exists solicitud_flujo on solicitud;
create trigger solicitud_flujo
  before insert or update on solicitud
  for each row execute function solicitud_flujo();

commit;

-- ── Verificación ────────────────────────────────────────────────────
-- Las filas deben coincidir.
select 'columna alerta.automatica' as que, count(*)::text as hay, '1' as esperado
  from information_schema.columns
  where table_schema = 'public' and table_name = 'alerta' and column_name = 'automatica'
union all select 'columna solicitud.cerrada_en', count(*)::text, '1'
  from information_schema.columns
  where table_schema = 'public' and table_name = 'solicitud' and column_name = 'cerrada_en'
union all select 'el recorrido deja cerrar en el centro', count(*)::text, '1'
  from pg_proc where proname = 'solicitud_flujo' and prosrc like '%cerrada_en%'
union all select 'alertas de vehículos sin marcar como automáticas', count(*)::text, '0'
  from alerta where automatica is null and tipo like any (array['revision_tecnica%', 'permiso_circulacion%', 'licencia%', 'prestamo_vencido']);
