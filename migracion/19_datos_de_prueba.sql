-- ═══════════════════════════════════════════════════════════════════
-- 19_datos_de_prueba.sql
--
-- Datos de prueba para recorrer todo lo de Movilización sin tocar nada
-- real: vehículos, choferes, asignaciones, un préstamo, un paso por el
-- taller y una bitácora con salidas.
--
-- Cómo se reconoce lo de prueba
-- ─────────────────────────────
-- Todo lleva `is_sample = true`, el id empieza con `pba-` y el texto que
-- se ve en pantalla dice [PRUEBA]. No hay forma de confundirlo con un
-- vehículo o una persona de verdad, y se borra todo con una sola
-- instrucción (está al final del archivo).
--
-- Se puede ejecutar las veces que haga falta: empieza borrando lo suyo.
-- Las fechas son relativas al día en que se ejecuta, así que siempre
-- queda "esta semana" y no un mes viejo.
--
-- Lo que NO hace: crear cuentas de acceso
-- ───────────────────────────────────────
-- Los tres choferes de prueba son fichas, no cuentas: no tienen clave y
-- nadie puede entrar como ellos. Alcanza para ver TODO lo que mira
-- Movilización (el calendario, las licencias, la bitácora, el préstamo).
--
-- Para probar además la pantalla "Mi bitácora" tal como la ve un chofer,
-- hay que crear una cuenta de verdad, y eso se hace desde el sistema, no
-- desde acá: entrar como Movilización → Choferes → «Nuevo chofer». Ahí
-- sale la clave temporal en pantalla.
--
-- Por qué las cuentas no se crean por SQL: las claves viven en el módulo
-- de autenticación de Supabase, que esta base comparte con otro sistema.
-- Escribir ahí a mano es justo lo que no hay que hacer.
--
-- Ejecutar en Supabase (SQL Editor).
-- ═══════════════════════════════════════════════════════════════════

do $$
declare
  centro_a text;
  centro_b text;
  hoy date := (now() at time zone 'America/Santiago')::date;
begin
  -- Los centros se toman de los que ya existen en la base: así el
  -- vehículo de prueba aparece donde corresponde y el préstamo va a un
  -- centro real. Si hubiera uno solo, el préstamo se hace al mismo, que
  -- es raro pero no rompe nada.
  select nombre into centro_a from centro order by nombre limit 1;
  select nombre into centro_b from centro order by nombre offset 1 limit 1;
  centro_b := coalesce(centro_b, centro_a);

  if centro_a is null then
    raise exception 'No hay centros cargados: primero tiene que existir al menos uno.';
  end if;

  -- ── Se borra lo de prueba anterior ────────────────────────────────
  delete from bitacora_flota     where id like 'pba-%';
  delete from asignacion_chofer  where id like 'pba-%';
  delete from prestamo_vehiculo  where id like 'pba-%';
  delete from orden_trabajo      where id like 'pba-%';
  delete from equipo             where id like 'pba-%';
  delete from usuario            where id like 'pba-%';

  -- ── 1) Tres vehículos ─────────────────────────────────────────────
  insert into equipo (id, is_sample, tipo, marca, modelo, patente, numero_inventario,
                      estado, centro_principal, activo, anio_adquisicion)
  values
    ('pba-veh-1', true, 'camioneta',  'Toyota',    'Hilux [PRUEBA]',  'PBA-01',
     'PRUEBA-01', 'operativo', centro_a, true, 2022),
    ('pba-veh-2', true, 'furgon',     'Renault',   'Kangoo [PRUEBA]', 'PBA-02',
     'PRUEBA-02', 'operativo', centro_a, true, 2021),
    ('pba-veh-3', true, 'camion_3_4', 'Chevrolet', 'NPR [PRUEBA]',    'PBA-03',
     'PRUEBA-03', 'operativo', centro_b, true, 2019);

  -- ── 2) Tres choferes, uno por cada estado de licencia ─────────────
  -- Es lo que hace visible la regla: el de licencia vencida no debería
  -- poder quedar a cargo de nada, y el que está por vencer dispara el
  -- aviso de los 60 días.
  insert into usuario (id, is_sample, role, email, full_name, centro_principal,
                       licencia_numero, licencia_clase, licencia_vencimiento)
  values
    ('pba-chofer-1', true, 'chofer', 'prueba.chofer1@ejemplo.test',
     '[PRUEBA] Carlos Soto',    centro_a, 'PBA-111', 'B',  hoy + 730),
    ('pba-chofer-2', true, 'chofer', 'prueba.chofer2@ejemplo.test',
     '[PRUEBA] Daniela Reyes',  centro_a, 'PBA-222', 'B',  hoy + 25),
    ('pba-chofer-3', true, 'chofer', 'prueba.chofer3@ejemplo.test',
     '[PRUEBA] Hugo Paredes',   centro_b, 'PBA-333', 'A2', hoy - 10);

  -- ── 3) Un préstamo atrasado ───────────────────────────────────────
  -- Salió hace doce días, debía volver hace tres y no ha vuelto. Es el
  -- caso que hay que ver en rojo, y el que hace que las salidas de ese
  -- vehículo queden marcadas como hechas durante el préstamo.
  insert into prestamo_vehiculo (id, is_sample, equipo_id, equipo_label,
                                 centro_origen, centro_destino, centro_costo,
                                 desde, hasta_previsto, estado, motivo)
  values ('pba-prest-1', true, 'pba-veh-2', 'Renault Kangoo [PRUEBA] · PBA-02',
          centro_a, centro_b, centro_b,
          hoy - 12, hoy - 3, 'vigente', '[PRUEBA] Refuerzo de rondas rurales.');

  -- ── 4) Las asignaciones ───────────────────────────────────────────
  -- La 1 y la 2 son el caso que el calendario vino a resolver: la de
  -- esta semana sigue vigente y la de la próxima ya está agendada.
  insert into asignacion_chofer (id, is_sample, chofer_id, chofer_email, chofer_nombre,
                                 equipo_id, equipo_label, desde, hasta, turno,
                                 estado, prestamo_id, destino, observaciones)
  values
    ('pba-asig-1', true, 'pba-chofer-1', 'prueba.chofer1@ejemplo.test', '[PRUEBA] Carlos Soto',
     'pba-veh-1', 'Toyota Hilux [PRUEBA] · PBA-01', hoy - 7, hoy + 2, 'completo',
     'activa', null, null, '[PRUEBA] Turno de esta semana.'),

    ('pba-asig-2', true, 'pba-chofer-2', 'prueba.chofer2@ejemplo.test', '[PRUEBA] Daniela Reyes',
     'pba-veh-1', 'Toyota Hilux [PRUEBA] · PBA-01', hoy + 3, hoy + 10, 'completo',
     'activa', null, null, '[PRUEBA] Programada para la próxima semana.'),

    -- Licencia vencida CON el vehículo ya a cargo: el sistema no le quita
    -- la asignación solo (eso dejaría un turno sin cubrir en silencio),
    -- la marca en rojo y espera que el Encargado decida.
    ('pba-asig-3', true, 'pba-chofer-3', 'prueba.chofer3@ejemplo.test', '[PRUEBA] Hugo Paredes',
     'pba-veh-2', 'Renault Kangoo [PRUEBA] · PBA-02', hoy - 12, hoy + 5, 'completo',
     'activa', 'pba-prest-1', null, '[PRUEBA] A cargo durante el préstamo.'),

    ('pba-asig-4', true, 'pba-chofer-2', 'prueba.chofer2@ejemplo.test', '[PRUEBA] Daniela Reyes',
     'pba-veh-3', 'Chevrolet NPR [PRUEBA] · PBA-03', hoy - 30, null, 'completo',
     'activa', null, null, '[PRUEBA] Asignación abierta, sin fecha de término.');

  -- ── 5) Un paso por el taller que cruza una asignación ─────────────
  -- Sin fecha de cierre a propósito: mientras la orden no se cierre, el
  -- vehículo sigue ocupado, y el calendario tiene que avisar del choque.
  insert into orden_trabajo (id, is_sample, numero_ot, equipo_id, equipo_label, patente,
                             marca_modelo, tipo_activo, prioridad, estado,
                             problema_reportado, origen, fecha_inicio)
  values ('pba-ot-1', true, 'OT-PRUEBA-01', 'pba-veh-2',
          'Renault Kangoo [PRUEBA] · PBA-02', 'PBA-02', 'Renault Kangoo [PRUEBA]',
          'corporativo', 'media', 'en_proceso',
          '[PRUEBA] Ruido en el tren delantero.', 'movilizacion', hoy - 1);

  -- ── 6) La bitácora ────────────────────────────────────────────────
  -- Se insertan SIN centro de costo ni préstamo a propósito: los pone el
  -- disparador de 18_bitacora_flota.sql. Así esta siembra también sirve
  -- para comprobar que esa parte funciona en la base de verdad.
  insert into bitacora_flota (id, is_sample, equipo_id, equipo_label, chofer_id, chofer_nombre,
                              fecha, hora_salida, hora_regreso, km_salida, km_regreso,
                              destino, motivo, combustible_litros, combustible_monto,
                              estado, observaciones)
  values
    -- Toyota Hilux — cuatro salidas cerradas y una todavía en ruta.
    ('pba-bit-1', true, 'pba-veh-1', 'Toyota Hilux [PRUEBA] · PBA-01',
     'pba-chofer-1', '[PRUEBA] Carlos Soto', hoy - 7, '08:15', '12:40', 48200, 48310,
     '[PRUEBA] Ronda rural', 'Traslado de insumos', null, null, 'cerrada', null),
    ('pba-bit-2', true, 'pba-veh-1', 'Toyota Hilux [PRUEBA] · PBA-01',
     'pba-chofer-1', '[PRUEBA] Carlos Soto', hoy - 5, '09:00', '13:20', 48310, 48395,
     '[PRUEBA] Posta rural', 'Retiro de muestras', 38, 45000, 'cerrada', null),
    ('pba-bit-3', true, 'pba-veh-1', 'Toyota Hilux [PRUEBA] · PBA-01',
     'pba-chofer-1', '[PRUEBA] Carlos Soto', hoy - 3, '07:50', '17:10', 48395, 48520,
     '[PRUEBA] Valdivia', 'Tramite administrativo', null, null, 'cerrada', null),
    ('pba-bit-4', true, 'pba-veh-1', 'Toyota Hilux [PRUEBA] · PBA-01',
     'pba-chofer-1', '[PRUEBA] Carlos Soto', hoy - 1, '08:30', '14:05', 48520, 48610,
     '[PRUEBA] Ronda rural', 'Traslado de personal', null, null, 'cerrada',
     '[PRUEBA] Se sintio una vibracion al frenar.'),
    -- Esta es la que tiene que aparecer en amarillo: salio y no consta
    -- que haya vuelto.
    ('pba-bit-5', true, 'pba-veh-1', 'Toyota Hilux [PRUEBA] · PBA-01',
     'pba-chofer-1', '[PRUEBA] Carlos Soto', hoy, '08:10', null, 48610, null,
     '[PRUEBA] Coñaripe', 'Traslado de pacientes', null, null, 'en_ruta', null),

    -- Renault Kangoo — las dos caen dentro del préstamo, así que el
    -- disparador les va a poner solo "durante el préstamo a ...".
    ('pba-bit-6', true, 'pba-veh-2', 'Renault Kangoo [PRUEBA] · PBA-02',
     'pba-chofer-3', '[PRUEBA] Hugo Paredes', hoy - 10, '08:00', '15:30', 92400, 92560,
     '[PRUEBA] Sector rural', 'Operativo en terreno', null, null, 'cerrada', null),
    ('pba-bit-7', true, 'pba-veh-2', 'Renault Kangoo [PRUEBA] · PBA-02',
     'pba-chofer-3', '[PRUEBA] Hugo Paredes', hoy - 6, '07:40', '16:15', 92560, 92700,
     '[PRUEBA] Sector rural', 'Operativo en terreno', 42, 50000, 'cerrada', null),

    -- Chevrolet NPR — para que los totales por vehículo tengan con qué
    -- compararse y el rendimiento en km/L dé un número.
    ('pba-bit-8', true, 'pba-veh-3', 'Chevrolet NPR [PRUEBA] · PBA-03',
     'pba-chofer-2', '[PRUEBA] Daniela Reyes', hoy - 8, '07:30', '18:00', 15300, 15480,
     '[PRUEBA] Valdivia', 'Retiro de equipamiento', 55, 66000, 'cerrada', null),
    ('pba-bit-9', true, 'pba-veh-3', 'Chevrolet NPR [PRUEBA] · PBA-03',
     'pba-chofer-2', '[PRUEBA] Daniela Reyes', hoy - 2, '08:45', '13:30', 15480, 15600,
     '[PRUEBA] Panguipulli', 'Traslado de mobiliario', null, null, 'cerrada', null);

  raise notice 'Datos de prueba creados. Centros usados: % y %.', centro_a, centro_b;
end $$;

-- ── Verificación ────────────────────────────────────────────────────
-- 1. Lo que quedó creado. Las seis filas deben coincidir.
select 'vehiculos de prueba' as que, count(*)::text as hay, '3' as esperado
  from equipo where id like 'pba-%'
union all select 'choferes de prueba', count(*)::text, '3'
  from usuario where id like 'pba-%'
union all select 'asignaciones', count(*)::text, '4'
  from asignacion_chofer where id like 'pba-%'
union all select 'prestamo', count(*)::text, '1'
  from prestamo_vehiculo where id like 'pba-%'
union all select 'orden de trabajo', count(*)::text, '1'
  from orden_trabajo where id like 'pba-%'
union all select 'salidas en la bitacora', count(*)::text, '9'
  from bitacora_flota where id like 'pba-%';

-- 2. El disparador hizo lo suyo: las dos salidas del Kangoo tienen que
--    haber quedado enganchadas al préstamo, y las otras siete con el
--    centro del vehículo. Se esperan 2 y 7.
select
  count(*) filter (where prestamo_id is not null) as durante_el_prestamo,
  count(*) filter (where prestamo_id is null and centro_costo is not null) as con_centro_propio
from bitacora_flota
where id like 'pba-%';

-- 3. Cómo quedó repartido: kilómetros por vehículo.
select equipo_label,
       count(*) as salidas,
       sum(km_regreso - km_salida) as km,
       sum(combustible_litros) as litros
from bitacora_flota
where id like 'pba-%'
group by 1
order by 3 desc nulls last;

-- ═══════════════════════════════════════════════════════════════════
-- PARA BORRAR TODO LO DE PRUEBA
-- ═══════════════════════════════════════════════════════════════════
-- Copiar estas seis líneas en una consulta nueva y ejecutarlas. No tocan
-- nada real: todos los ids de prueba empiezan con `pba-`.
--
--   delete from bitacora_flota    where id like 'pba-%';
--   delete from asignacion_chofer where id like 'pba-%';
--   delete from prestamo_vehiculo where id like 'pba-%';
--   delete from orden_trabajo     where id like 'pba-%';
--   delete from equipo            where id like 'pba-%';
--   delete from usuario           where id like 'pba-%';
--
-- ── Qué se va a ver, pantalla por pantalla ──────────────────────────
-- Vehículos   3 vehículos [PRUEBA]; el Kangoo en rojo, porque lo tiene a
--             cargo alguien con la licencia vencida, y en ámbar porque
--             el préstamo se pasó de la fecha de devolución.
-- Calendario  el Hilux con dos tramos seguidos (esta semana y la
--             próxima, dos choferes distintos), y el Kangoo marcado por
--             cruzarse con la orden de trabajo abierta.
-- Choferes    los tres estados de licencia: vigente, por vencer y
--             vencida.
-- Bitácora    9 salidas, una sin cerrar, totales por vehículo y por
--             chofer, y las dos del Kangoo diciendo que fueron durante
--             el préstamo.
-- Informe     el PDF del Kangoo con el préstamo y quién lo tuvo a cargo.
