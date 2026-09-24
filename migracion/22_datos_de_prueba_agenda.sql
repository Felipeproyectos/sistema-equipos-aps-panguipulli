-- ═══════════════════════════════════════════════════════════════════
-- 22_datos_de_prueba_agenda.sql
--
-- Datos de prueba de la agenda Movilización ↔ Taller: un pedido en cada
-- paso del ida y vuelta, para ver cómo se ve en Solicitudes al Taller,
-- en el Taller, en el Calendario y en el Monitor Corporativo.
--
-- Usa los vehículos de prueba de 19_datos_de_prueba.sql (pba-veh-1, 2 y
-- 3). Si no están, avisa y no hace nada: correr primero la 19.
--
-- Cómo se reconoce lo de prueba: igual que en la 19, `is_sample = true`,
-- el id empieza con `pba-ag-` y el texto dice [PRUEBA]. Es re-ejecutable:
-- empieza borrando lo suyo. Las fechas son relativas al día en que se
-- ejecuta.
--
-- Los siete casos
-- ───────────────
--   1. Salud informa una falla y Movilización no la ha revisado.
--   2. Movilización pidió hace 5 días y el Taller no propone fecha
--      (aparece como "esperando hace 3 días o más" en el Monitor).
--   3. El Taller propuso una fecha que cae sobre un turno ya programado
--      (Movilización ve el aviso del choque).
--   4. Movilización pidió otra fecha, con el motivo.
--   5. Fecha confirmada: el vehículo entra mañana.
--   6. Terminado en el taller; falta cerrar la solicitud y avisar a Salud.
--   (7. La orden en reparación ya la crea la 19: pba-ot-1.)
--
-- Ejecutar en Supabase (SQL Editor).
-- ═══════════════════════════════════════════════════════════════════

do $$
declare
  hoy     date := (now() at time zone 'America/Santiago')::date;
  ahora   timestamptz := now();
  centro_a text;
  -- Día y hora en Chile → timestamptz.
  cita_2  timestamptz;
  cita_3  timestamptz;
  cita_5  timestamptz;
begin
  if (select count(*) from equipo where id in ('pba-veh-1', 'pba-veh-3')) < 2 then
    raise exception 'Faltan los vehículos de prueba: ejecutar primero 19_datos_de_prueba.sql.';
  end if;

  select centro_principal into centro_a from equipo where id = 'pba-veh-1';

  cita_2 := ((hoy + 4) + time '09:00') at time zone 'America/Santiago';
  cita_3 := ((hoy + 6) + time '10:30') at time zone 'America/Santiago';
  cita_5 := ((hoy + 1) + time '08:30') at time zone 'America/Santiago';

  -- ── Se borra lo de prueba anterior de la agenda ───────────────────
  delete from orden_trabajo where id like 'pba-ag-%';
  delete from solicitud     where id like 'pba-ag-%';

  -- ── Las solicitudes de Salud ──────────────────────────────────────
  insert into solicitud (id, is_sample, equipo_id, tipo, fecha, usuario_email, usuario_nombre,
                         centro, estado, observaciones, respuesta_admin, created_date)
  values
    -- 1. Por revisar
    ('pba-ag-sol-1', true, 'pba-veh-3', 'mantenimiento_correctivo', hoy - 1,
     'prueba.salud@ejemplo.test', '[PRUEBA] Paula Enfermera', centro_a, 'pendiente',
     '[PRUEBA] Se encendió la luz de check engine en la ruta a Liquiñe.', null, ahora - interval '1 day'),
    -- 5. La que originó la cita confirmada
    ('pba-ag-sol-2', true, 'pba-veh-1', 'revision_tecnica', hoy - 6,
     'prueba.salud@ejemplo.test', '[PRUEBA] Paula Enfermera', centro_a, 'en_proceso',
     '[PRUEBA] Vence la revisión técnica a fin de mes.', '[PRUEBA] Derivada al taller por Movilización',
     ahora - interval '6 days'),
    -- 6. La que ya se reparó
    ('pba-ag-sol-3', true, 'pba-veh-3', 'mantenimiento_correctivo', hoy - 9,
     'prueba.salud@ejemplo.test', '[PRUEBA] Paula Enfermera', centro_a, 'en_proceso',
     '[PRUEBA] Frena con ruido y tira hacia la derecha.', '[PRUEBA] Derivada al taller por Movilización',
     ahora - interval '9 days');

  -- ── Las órdenes, una por paso ─────────────────────────────────────
  insert into orden_trabajo (id, is_sample, numero_ot, equipo_id, equipo_label, patente, marca_modelo,
                             tipo_activo, prioridad, estado, problema_reportado, origen, solicitud_id,
                             reportado_por_nombre, reportado_por_email,
                             fecha_preferida, cita_estado, cita_fecha, cita_entrega, cita_nota,
                             mecanico_nombre, fecha_inicio, fecha_fin, notas_cierre,
                             total_mano_obra, total_repuestos, total,
                             created_date, linea_tiempo)
  values
    -- 2. Pedido de Movilización sin fecha hace 5 días
    ('pba-ag-ot-2', true, 'OT-PRUEBA-AG2', 'pba-veh-3', 'Chevrolet NPR [PRUEBA] · PBA-03', 'PBA-03',
     'Chevrolet NPR [PRUEBA]', 'corporativo', 'media', 'pendiente',
     '[PRUEBA] Mantención de los 60.000 km.', 'movilizacion', null,
     '[PRUEBA] Encargado Movilización', 'prueba.movil@ejemplo.test',
     hoy + 1, 'por_agendar', null, null, null,
     null, null, null, null, null, null, null,
     ahora - interval '5 days',
     jsonb_build_array(
       jsonb_build_object('fecha', ahora - interval '5 days', 'evento', 'Orden de trabajo creada',
                          'usuario_nombre', '[PRUEBA] Encargado Movilización', 'notas', 'Mantención de los 60.000 km.'))),

    -- 3. El Taller propone y cae sobre el turno de Daniela (pba-asig-2)
    ('pba-ag-ot-3', true, 'OT-PRUEBA-AG3', 'pba-veh-1', 'Toyota Hilux [PRUEBA] · PBA-01', 'PBA-01',
     'Toyota Hilux [PRUEBA]', 'corporativo', 'media', 'pendiente',
     '[PRUEBA] Cambio de neumáticos delanteros.', 'movilizacion', null,
     '[PRUEBA] Encargado Movilización', 'prueba.movil@ejemplo.test',
     hoy + 2, 'propuesta', cita_2, hoy + 5, '[PRUEBA] Traerlo con estanque lleno.',
     null, null, null, null, null, null, null,
     ahora - interval '3 days',
     jsonb_build_array(
       jsonb_build_object('fecha', ahora - interval '3 days', 'evento', 'Orden de trabajo creada',
                          'usuario_nombre', '[PRUEBA] Encargado Movilización'),
       jsonb_build_object('fecha', ahora - interval '1 day', 'evento', 'Taller propone fecha a Movilización',
                          'usuario_nombre', '[PRUEBA] Jefe de Taller', 'notas', 'Traerlo con estanque lleno.'))),

    -- 4. Movilización pidió otra fecha
    ('pba-ag-ot-4', true, 'OT-PRUEBA-AG4', null, 'Nissan Navara [PRUEBA] · PBA-04', 'PBA-04',
     'Nissan Navara [PRUEBA]', 'corporativo', 'baja', 'pendiente',
     '[PRUEBA] Revisar alineación y balanceo.', 'movilizacion', null,
     '[PRUEBA] Encargado Movilización', 'prueba.movil@ejemplo.test',
     hoy + 8, 'reagendar', cita_3, hoy + 6,
     '[PRUEBA] Esa semana hace ronda rural en Liquiñe. Puedo llevarlo la semana siguiente.',
     null, null, null, null, null, null, null,
     ahora - interval '4 days',
     jsonb_build_array(
       jsonb_build_object('fecha', ahora - interval '4 days', 'evento', 'Orden de trabajo creada',
                          'usuario_nombre', '[PRUEBA] Encargado Movilización'),
       jsonb_build_object('fecha', ahora - interval '3 days', 'evento', 'Taller propone fecha a Movilización',
                          'usuario_nombre', '[PRUEBA] Jefe de Taller'),
       jsonb_build_object('fecha', ahora - interval '2 days', 'evento', 'Movilización pide otra fecha',
                          'usuario_nombre', '[PRUEBA] Encargado Movilización',
                          'notas', 'Esa semana hace ronda rural en Liquiñe.'))),

    -- 5. Confirmada: entra mañana (derivada de la solicitud de Salud 2)
    ('pba-ag-ot-5', true, 'OT-PRUEBA-AG5', 'pba-veh-1', 'Toyota Hilux [PRUEBA] · PBA-01', 'PBA-01',
     'Toyota Hilux [PRUEBA]', 'corporativo', 'alta', 'asignada',
     '[PRUEBA] Revisión técnica — Vence la revisión técnica a fin de mes.', 'movilizacion', 'pba-ag-sol-2',
     '[PRUEBA] Encargado Movilización', 'prueba.movil@ejemplo.test',
     hoy, 'confirmada', cita_5, hoy + 1, '[PRUEBA] Pasar por la bodega del taller.',
     '[PRUEBA] Mecánico Turno Mañana', null, null, null, null, null, null,
     ahora - interval '6 days',
     jsonb_build_array(
       jsonb_build_object('fecha', ahora - interval '6 days', 'evento', 'Orden de trabajo creada',
                          'usuario_nombre', '[PRUEBA] Encargado Movilización'),
       jsonb_build_object('fecha', ahora - interval '5 days', 'evento', 'Taller propone fecha a Movilización',
                          'usuario_nombre', '[PRUEBA] Jefe de Taller'),
       jsonb_build_object('fecha', ahora - interval '4 days 12 hours', 'evento', 'Movilización confirma la fecha de ingreso',
                          'usuario_nombre', '[PRUEBA] Encargado Movilización'))),

    -- 6. Terminada; falta avisar a Salud (derivada de la solicitud 3)
    ('pba-ag-ot-6', true, 'OT-PRUEBA-AG6', 'pba-veh-3', 'Chevrolet NPR [PRUEBA] · PBA-03', 'PBA-03',
     'Chevrolet NPR [PRUEBA]', 'corporativo', 'alta', 'completada',
     '[PRUEBA] Reparación — Frena con ruido y tira hacia la derecha.', 'movilizacion', 'pba-ag-sol-3',
     '[PRUEBA] Encargado Movilización', 'prueba.movil@ejemplo.test',
     hoy - 8, 'confirmada', ((hoy - 6) + time '09:00') at time zone 'America/Santiago', hoy - 4, null,
     '[PRUEBA] Mecánico Turno Mañana', hoy - 6, hoy - 1, '[PRUEBA] Cambio de pastillas y discos delanteros.',
     60000, 125000, 185000,
     ahora - interval '9 days',
     jsonb_build_array(
       jsonb_build_object('fecha', ahora - interval '9 days', 'evento', 'Orden de trabajo creada',
                          'usuario_nombre', '[PRUEBA] Encargado Movilización'),
       jsonb_build_object('fecha', ahora - interval '7 days', 'evento', 'Taller propone fecha a Movilización',
                          'usuario_nombre', '[PRUEBA] Jefe de Taller'),
       jsonb_build_object('fecha', ahora - interval '6 days 20 hours', 'evento', 'Movilización confirma la fecha de ingreso',
                          'usuario_nombre', '[PRUEBA] Encargado Movilización'),
       jsonb_build_object('fecha', ahora - interval '1 day', 'evento', 'Estado: Completada',
                          'usuario_nombre', '[PRUEBA] Jefe de Taller')));

  raise notice 'Agenda de prueba creada.';
end $$;

-- ── Verificación ────────────────────────────────────────────────────
-- Una fila por paso. Deben salir los seis, con "hay" = 1.
select 'por revisar (Salud)' as paso, count(*) as hay from solicitud where id = 'pba-ag-sol-1' and estado = 'pendiente'
union all select 'por agendar (Taller)',     count(*) from orden_trabajo where id = 'pba-ag-ot-2' and cita_estado = 'por_agendar'
union all select 'propuesta (Movilización)', count(*) from orden_trabajo where id = 'pba-ag-ot-3' and cita_estado = 'propuesta'
union all select 'otra fecha pedida',        count(*) from orden_trabajo where id = 'pba-ag-ot-4' and cita_estado = 'reagendar'
union all select 'confirmada',               count(*) from orden_trabajo where id = 'pba-ag-ot-5' and cita_estado = 'confirmada'
union all select 'terminada, avisar a Salud', count(*) from orden_trabajo where id = 'pba-ag-ot-6' and estado = 'completada';

-- ═══════════════════════════════════════════════════════════════════
-- PARA BORRAR SOLO ESTO
-- ═══════════════════════════════════════════════════════════════════
--   delete from orden_trabajo where id like 'pba-ag-%';
--   delete from solicitud     where id like 'pba-ag-%';
--
-- Las seis líneas de borrado de la 19 (`like 'pba-%'`) también se llevan
-- las órdenes de acá. Para las solicitudes, agregar:
--   delete from solicitud     where id like 'pba-%';
--
-- ── Qué se va a ver ─────────────────────────────────────────────────
-- Solicitudes al Taller (Movilización)
--   Por revisar    la luz de check engine del NPR.
--   Con el taller  primero la propuesta del Hilux con el aviso de que
--                  Daniela Reyes tiene ese vehículo esos días; después el
--                  NPR terminado con "Cerrar y avisar a Salud"; el NPR sin
--                  fecha; la Navara con la otra fecha pedida; el Hilux
--                  confirmado para mañana; el Kangoo en reparación (19).
-- Taller (Jefe)    filtro "Por agendar" con 2 (el NPR y la Navara).
-- Calendario       el Hilux marcado "Taller" mañana y "Taller?" en la
--                  fecha propuesta.
-- Monitor          sección "Coordinación Movilización ↔ Taller": cuántos
--                  pedidos tiene cada lado, los próximos ingresos, el NPR
--                  "esperando hace 5 días" y los tiempos de respuesta.
