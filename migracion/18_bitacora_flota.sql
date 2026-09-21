-- ═══════════════════════════════════════════════════════════════════
-- 18_bitacora_flota.sql
--
-- La bitácora de operación: cada salida de un vehículo, quién la hizo,
-- a dónde fue y con cuánto kilometraje volvió.
--
-- Por qué es una tabla nueva y no la que ya existe
-- ───────────────────────────────────────────────
-- `kilometraje` es la bitácora de CALIDAD: la que llenan los conductores
-- de la ambulancia desde el enlace público, la que revisa el Encargado de
-- Salud en "Revisión Bitácora" y la que alimenta las pautas. Esa sigue
-- funcionando tal cual está y no se toca.
--
-- Ésta es la de MOVILIZACIÓN, y responde otras preguntas: cuánto anda
-- cada vehículo, quién lo sacó, a qué centro se le carga el combustible,
-- y si alguno salió y todavía no vuelve. Mezclarlas habría obligado a
-- que una de las dos áreas viera la planilla de la otra.
--
-- Lo que la salida se guarda congelado
-- ────────────────────────────────────
-- Si el vehículo estaba prestado ese día, la salida guarda el préstamo,
-- el centro que lo tenía y el centro que pagaba. Congelado al registrar,
-- igual que `orden_trabajo.centro_costo` (16_prestamos.sql): cuando el
-- vehículo vuelva a su centro, la bitácora tiene que seguir diciendo que
-- ese día estaba en Coñaripe. Un informe que lo calcula al momento de
-- mirarlo reescribe el pasado cada vez que cambia el presente.
--
-- Lo hace un disparador y no la pantalla porque hay dos lugares que
-- crean salidas — el chofer desde "Mi bitácora" y Movilización desde la
-- bitácora de la flota — y mañana puede haber un tercero.
--
-- Lo que NO hace
-- ──────────────
-- No cierra solas las salidas ni las borra. Una salida sin regreso es
-- justamente el dato que hay que ver: el vehículo salió y no consta que
-- haya vuelto. Cerrarla sola por la hora sería inventar el regreso.
--
-- Tampoco bloquea al chofer con la licencia vencida. Ahí la regla va al
-- revés que en las asignaciones: no se le puede ENTREGAR un vehículo
-- (15_asignaciones.sql lo frena en el insert), pero si de hecho salió,
-- el viaje tiene que quedar escrito. Impedir el registro no deshace el
-- viaje, solo lo esconde.
--
-- Ejecutar una sola vez en Supabase (SQL Editor). Es re-ejecutable.
-- ═══════════════════════════════════════════════════════════════════

-- ── Antes: qué vehículos hay y cuántos tienen chofer a cargo ────────
-- Solo lectura. Es la foto de lo que esta bitácora va a empezar a medir.
select
  count(*) filter (where e.tipo in ('camioneta','furgon','camion_3_4','ambulancia')) as vehiculos,
  count(distinct a.equipo_id) filter (where a.estado = 'activa')                      as con_chofer_a_cargo
from equipo e
left join asignacion_chofer a on a.equipo_id = e.id;

begin;

-- ── 1) La tabla ─────────────────────────────────────────────────────
-- Las seis primeras columnas son las que llevan todas las tablas del
-- sistema. El nombre del chofer y la etiqueta del vehículo se guardan
-- además del id para que la pantalla no cruce con `usuario` ni con
-- `equipo` en cada fila.
create table if not exists bitacora_flota (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz default now(),
  updated_date timestamptz,
  created_by_id text,
  created_by text,
  is_sample boolean default false,
  equipo_id text,
  equipo_label text,
  chofer_id text,
  chofer_nombre text,
  asignacion_id text,
  fecha date,
  hora_salida text,
  hora_regreso text,
  km_salida numeric,
  km_regreso numeric,
  destino text,
  motivo text,
  combustible_litros numeric,
  combustible_monto numeric,
  prestamo_id text,
  prestamo_destino text,
  centro_costo text,
  estado text default 'en_ruta',
  observaciones text
);

alter table bitacora_flota enable row level security;

create index if not exists bitacora_flota_equipo_idx on bitacora_flota (equipo_id, fecha);
create index if not exists bitacora_flota_chofer_idx on bitacora_flota (chofer_id, fecha);
create index if not exists bitacora_flota_fecha_idx  on bitacora_flota (fecha);
-- Para la pregunta que se hace todos los días: ¿queda alguno sin volver?
create index if not exists bitacora_flota_en_ruta_idx on bitacora_flota (equipo_id)
  where estado = 'en_ruta';

-- ── 2) Dónde estaba el vehículo ese día ─────────────────────────────
-- Devuelve el préstamo que cubría esa fecha, si lo hubo. Se busca por la
-- fecha de la salida y no por "el préstamo vigente hoy", porque una
-- salida se puede registrar al día siguiente, o corregir después.
--
-- `devuelto_el` manda sobre `hasta_previsto`: lo que importa es cuándo
-- volvió de verdad, no cuándo se había acordado. Un préstamo todavía
-- abierto (sin devolución) cubre desde su inicio en adelante, que es
-- exactamente lo que significa que el vehículo no ha vuelto.
--
-- security definer por lo mismo que mi_rol() y centro_que_paga(): lee
-- tablas con RLS, y una policy que las consultara directo entraría en
-- recursión.
create or replace function prestamo_en_fecha(id_equipo text, dia date)
  returns prestamo_vehiculo
  language sql stable security definer set search_path = public as $$
  select p.*
    from prestamo_vehiculo p
   where p.equipo_id = id_equipo
     and p.estado <> 'cancelado'
     and p.desde <= dia
     and (p.devuelto_el is null or p.devuelto_el >= dia)
   order by p.desde desc
   limit 1
$$;

-- ── 3) Lo que se congela, y lo que no se acepta ─────────────────────
-- Dos cosas en el mismo disparador porque las dos tienen que pasar sí o
-- sí en cada escritura, venga de donde venga.
create or replace function bitacora_flota_contexto() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  p prestamo_vehiculo;
begin
  if new.fecha is null then
    raise exception 'La salida necesita una fecha.';
  end if;

  -- El odómetro no retrocede. Es el error más caro de esta tabla: un
  -- regreso menor que la salida deja kilometrajes negativos que después
  -- aparecen restados en todos los totales.
  if new.km_salida is not null and new.km_regreso is not null
     and new.km_regreso < new.km_salida then
    raise exception 'El kilometraje de regreso (%) no puede ser menor que el de salida (%).',
      new.km_regreso, new.km_salida;
  end if;

  -- Solo al nacer, y solo si vienen vacíos: si algún día la aplicación
  -- manda el contexto explícito, manda la aplicación.
  if tg_op = 'INSERT' and new.prestamo_id is null
     and (new.centro_costo is null or trim(new.centro_costo) = '') then
    p := prestamo_en_fecha(new.equipo_id, new.fecha);
    if p.id is not null then
      new.prestamo_id       := p.id;
      new.prestamo_destino  := p.centro_destino;
      new.centro_costo      := p.centro_costo;
    else
      new.centro_costo := centro_que_paga(new.equipo_id);
    end if;
  end if;

  return new;
end $$;

drop trigger if exists bitacora_flota_congela_contexto on bitacora_flota;
create trigger bitacora_flota_congela_contexto
  before insert or update on bitacora_flota
  for each row execute function bitacora_flota_contexto();

-- ── 4) Quién ve la bitácora ─────────────────────────────────────────
-- Movilización porque es suya. Base del Sistema, Administración y el
-- Monitor Corporativo porque ven todo. El Jefe de Taller porque el
-- kilometraje es lo que decide cuándo toca mantención. Y cada chofer,
-- las suyas — no las de los demás.
drop policy if exists bitacora_flota_read on bitacora_flota;
create policy bitacora_flota_read on bitacora_flota for select to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'admin'
    or mi_rol() = 'monitor_corporativo' or mi_rol() = 'encargado_movilizacion'
    or mi_rol() = 'jefe_taller'
    or chofer_id = mi_id()));

-- ── 5) Quién la escribe ─────────────────────────────────────────────
-- El chofer registra lo suyo: `chofer_id = mi_id()` en el with check, de
-- modo que no puede anotarle una salida a otro. Movilización registra
-- por cualquiera, porque a veces el chofer no alcanza a cargarla y la
-- planilla la termina llenando la oficina.
drop policy if exists bitacora_flota_create on bitacora_flota;
create policy bitacora_flota_create on bitacora_flota for insert to authenticated
  with check ((mi_rol() = 'super_admin' or mi_rol() = 'admin'
    or mi_rol() = 'encargado_movilizacion'
    or chofer_id = mi_id()));

-- El chofer cierra su propia salida (el regreso, los kilómetros). El
-- `with check` repite la condición para que no pueda, de paso, cambiarle
-- el dueño a la fila.
drop policy if exists bitacora_flota_update on bitacora_flota;
create policy bitacora_flota_update on bitacora_flota for update to authenticated
  using ((mi_rol() = 'super_admin' or mi_rol() = 'admin'
    or mi_rol() = 'encargado_movilizacion'
    or chofer_id = mi_id()))
  with check ((mi_rol() = 'super_admin' or mi_rol() = 'admin'
    or mi_rol() = 'encargado_movilizacion'
    or chofer_id = mi_id()));

-- Borrar no: una salida que se registró es parte del historial del
-- vehículo. Si quedó mal, se corrige y queda el rastro de la corrección.
drop policy if exists bitacora_flota_delete on bitacora_flota;
create policy bitacora_flota_delete on bitacora_flota for delete to authenticated
  using (mi_rol() = 'super_admin');

-- ── 6) Auditoría, si la función existe en esta base ─────────────────
-- Condicionado por lo mismo que en 15 y 16: 04_webhooks no se ejecutó en
-- producción y `create trigger` a secas revertiría todo el archivo.
do $$
begin
  if exists (select 1 from pg_proc where proname = 'avisar_al_servidor') then
    execute 'drop trigger if exists bitacora_flota_historial on bitacora_flota';
    execute 'create trigger bitacora_flota_historial after insert or update or delete
             on bitacora_flota for each row
             execute function avisar_al_servidor(''registrarHistorial'', ''BitacoraFlota'')';
  else
    raise notice 'avisar_al_servidor() no existe: sin disparador de auditoria (ver 04_webhooks.sql)';
  end if;
end $$;

commit;

-- ── Verificación ────────────────────────────────────────────────────
-- 1. Lo que se creó. Las cinco filas deben coincidir.
select 'tabla bitacora_flota' as que, count(*)::text as hay, '1' as esperado
  from information_schema.tables
  where table_schema='public' and table_name='bitacora_flota'
union all select 'columnas de la tabla', count(*)::text, '25'
  from information_schema.columns
  where table_schema='public' and table_name='bitacora_flota'
union all select 'policies', count(*)::text, '4'
  from pg_policies where schemaname='public' and tablename='bitacora_flota'
union all select 'funcion prestamo_en_fecha', count(*)::text, '1'
  from pg_proc where proname='prestamo_en_fecha'
union all select 'disparador de contexto', count(*)::text, '1'
  from pg_trigger where tgname='bitacora_flota_congela_contexto';

-- 2. El odómetro al revés se rechaza. Debe cortar con el mensaje del
--    disparador y NO dejar nada escrito (por eso va dentro de su propio
--    bloque, que se revierte solo).
-- El bloque interno con `exception` es una subtransaccion: lo que haya
--    escrito se revierte solo, asi que esta prueba no deja basura.
do $$
declare ok boolean := false;
begin
  begin
    insert into bitacora_flota (equipo_id, chofer_id, fecha, km_salida, km_regreso)
    values ('prueba-que-no-existe', 'prueba', current_date, 1000, 900);
  exception when others then
    ok := true;
    raise notice 'bien, lo rechazo: %', sqlerrm;
  end;
  if not ok then
    raise exception 'MAL: acepto un regreso con menos kilometros que la salida';
  end if;
end $$;

-- ── Después ─────────────────────────────────────────────────────────
-- El chofer entra a "Mi bitácora", registra la salida del día con el
-- kilometraje, y al volver la cierra. Movilización ve "Bitácora" con
-- todas las salidas, los kilómetros por vehículo y por chofer, el gasto
-- de combustible, y cuáles siguen sin regreso. Si el vehículo estaba
-- prestado, cada salida de ese período lo dice y lo sigue diciendo
-- después de que el vehículo vuelva.
