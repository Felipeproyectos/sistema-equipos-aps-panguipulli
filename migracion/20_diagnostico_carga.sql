-- ═══════════════════════════════════════════════════════════════════
-- 20_diagnostico_carga.sql
--
-- «¿Qué me falta cargar?» — respondido por la base, no de memoria.
--
-- SOLO LECTURA. No escribe nada, no cambia nada, se puede correr las
-- veces que se quiera. Devuelve una fila por cosa, con el número y qué
-- hacer si falta.
--
-- Cómo se lee la columna `estado`
-- ───────────────────────────────
--   FALTA   hay que hacer algo para que el sistema sirva
--   ojo     algo que mirar, no necesariamente un problema
--   ok      nada que hacer
--
-- Ejecutar en Supabase (SQL Editor).
-- ═══════════════════════════════════════════════════════════════════

with
  veh as (select * from equipo
           where tipo in ('camioneta','furgon','camion_3_4','ambulancia')
             and coalesce(activo, true)),
  cho as (select * from usuario where role = 'chofer'),
  hoy as (select (now() at time zone 'America/Santiago')::date as d)
select * from (

  -- ── Lo básico ─────────────────────────────────────────────────────
  select 1 as n, 'Centros cargados' as que, count(*)::text as cuantos,
         case when count(*) = 0 then 'FALTA: sin centros no se puede cargar nada mas'
              else 'ok' end as estado
    from centro

  union all
  select 2, 'Vehiculos corporativos (camioneta, furgon, camion 3/4)', count(*)::text,
         case when count(*) = 0 then 'FALTA: cargalos en Vehiculos > Nuevo vehiculo'
              else 'ok' end
    from veh where tipo <> 'ambulancia'

  union all
  select 3, 'Ambulancias', count(*)::text,
         case when count(*) = 0 then 'ojo: no hay ninguna cargada'
              else 'ok (su ficha la mantiene Calidad)' end
    from veh where tipo = 'ambulancia'

  -- ── Los choferes ──────────────────────────────────────────────────
  union all
  select 4, 'Choferes con cuenta', count(*)::text,
         case when count(*) = 0 then 'FALTA: crealos en Choferes > Nuevo chofer'
              else 'ok' end
    from cho

  union all
  select 5, 'Choferes SIN licencia cargada', count(*)::text,
         case when count(*) > 0
              then 'FALTA: cada uno entra con su clave a Mi licencia y la carga'
              else 'ok' end
    from cho where licencia_vencimiento is null

  union all
  select 6, 'Choferes con la licencia VENCIDA', count(*)::text,
         case when count(*) > 0 then 'ojo: no pueden quedar a cargo de un vehiculo'
              else 'ok' end
    from cho, hoy where licencia_vencimiento < hoy.d

  union all
  select 7, 'Choferes con la licencia por vencer (60 dias)', count(*)::text,
         case when count(*) > 0 then 'ojo: avisales que pidan hora para renovar'
              else 'ok' end
    from cho, hoy
   where licencia_vencimiento >= hoy.d and licencia_vencimiento < hoy.d + 60

  -- ── La operación ──────────────────────────────────────────────────
  union all
  select 8, 'Vehiculos SIN chofer a cargo hoy', count(*)::text,
         case when count(*) > 0 then 'FALTA: asignalos en el Calendario'
              else 'ok' end
    from veh v, hoy
   where not exists (select 1 from asignacion_chofer a
                      where a.equipo_id = v.id and a.estado = 'activa'
                        and a.desde <= hoy.d and (a.hasta is null or a.hasta >= hoy.d))

  union all
  select 9, 'Asignaciones ABIERTAS (sin fecha de termino)', count(*)::text,
         case when count(*) > 0
              then 'ojo: mientras esten abiertas no se puede programar nada despues en ese vehiculo'
              else 'ok' end
    from asignacion_chofer where estado = 'activa' and hasta is null

  union all
  select 10, 'Prestamos vigentes atrasados', count(*)::text,
         case when count(*) > 0 then 'ojo: confirma la devolucion o corre la fecha acordada'
              else 'ok' end
    from prestamo_vehiculo p, hoy
   where p.estado = 'vigente' and p.hasta_previsto < hoy.d

  union all
  select 11, 'Salidas registradas en la bitacora', count(*)::text,
         case when count(*) = 0 then 'ojo: todavia nadie registra salidas'
              else 'ok' end
    from bitacora_flota

  union all
  select 12, 'Salidas sin cerrar', count(*)::text,
         case when count(*) > 0 then 'ojo: salieron y no consta el regreso'
              else 'ok' end
    from bitacora_flota where estado = 'en_ruta'

  -- ── El sistema por debajo ─────────────────────────────────────────
  union all
  select 13, 'Filas de PRUEBA en el sistema', count(*)::text,
         case when count(*) > 0
              then 'borralas cuando termines de probar (el bloque al final de 19_datos_de_prueba.sql)'
              else 'ok, no queda ninguna' end
    from (select id from equipo            where id like 'pba-%'
    union all select id from usuario          where id like 'pba-%'
    union all select id from asignacion_chofer where id like 'pba-%'
    union all select id from prestamo_vehiculo where id like 'pba-%'
    union all select id from orden_trabajo     where id like 'pba-%'
    union all select id from bitacora_flota    where id like 'pba-%') z

  union all
  select 14, 'Piezas de las migraciones 15 a 18', count(*)::text || ' de 5',
         case when count(*) = 5 then 'ok'
              else 'FALTA alguna migracion: revisa cual no corrio' end
    from (
      select 1 from information_schema.tables
       where table_schema='public' and table_name='asignacion_chofer'
      union all select 1 from information_schema.tables
       where table_schema='public' and table_name='prestamo_vehiculo'
      union all select 1 from information_schema.tables
       where table_schema='public' and table_name='bitacora_flota'
      union all select 1 from pg_trigger where tgname='asignacion_chofer_sin_choque'
      union all select 1 from pg_trigger where tgname='bitacora_flota_congela_contexto'
    ) piezas

  union all
  select 15, 'Auditoria: la funcion que avisa al servidor', count(*)::text,
         case when count(*) = 0
              then 'FALTA: sin esto la pestana Acciones de Auditoria queda vacia (ver 04_webhooks.sql)'
              else 'ok' end
    from pg_proc where proname = 'avisar_al_servidor'

) t order by n;

-- ── El detalle de lo que salio con FALTA ────────────────────────────
-- 1. Qué choferes no han cargado su licencia.
select full_name as chofer, email, 'sin licencia cargada' as problema
from usuario
where role = 'chofer' and licencia_vencimiento is null
union all
select full_name, email, 'licencia vencida el ' || to_char(licencia_vencimiento, 'DD-MM-YYYY')
from usuario
where role = 'chofer'
  and licencia_vencimiento < (now() at time zone 'America/Santiago')::date
order by 3, 1;

-- 2. Qué vehículos están hoy sin nadie a cargo.
select
  coalesce(nullif(trim(e.marca || ' ' || e.modelo), ''), '(sin marca)') as vehiculo,
  coalesce(e.patente, e.numero_inventario, '—') as patente,
  e.tipo,
  coalesce(e.centro_principal, '(sin centro)') as centro
from equipo e
where e.tipo in ('camioneta','furgon','camion_3_4','ambulancia')
  and coalesce(e.activo, true)
  and not exists (
    select 1 from asignacion_chofer a
     where a.equipo_id = e.id and a.estado = 'activa'
       and a.desde <= (now() at time zone 'America/Santiago')::date
       and (a.hasta is null or a.hasta >= (now() at time zone 'America/Santiago')::date))
order by e.tipo, 1;
