-- ═══════════════════════════════════════════════════════════════════
-- 24_demo_movilizacion.sql
--
-- Datos ficticios para PRESENTAR el sistema en vivo con el perfil de
-- Encargado de Movilización. Se ven como datos reales (sin [PRUEBA] en
-- pantalla), pero todo es inventado: vehículos, patentes, choferes,
-- salidas y pedidos al taller.
--
-- Cómo se reconoce y cómo se borra
-- ────────────────────────────────
-- Todo lleva `is_sample = true` y un id que empieza con `pba-demo-`.
-- Se borra con el botón de Configuración → Datos de prueba, o con las
-- líneas del final de este archivo. No toca nada real.
--
-- Antes de cargar, borra los datos de prueba anteriores (los [PRUEBA] de
-- la 19 y la 22, ids `pba-%`) para que no se mezclen en la presentación.
--
-- Es re-ejecutable y las fechas son relativas al día en que se ejecuta:
-- conviene correrlo el mismo día de la presentación, así "hoy", "esta
-- semana" y "este mes" calzan.
--
-- No crea cuentas de acceso: los choferes son fichas, sin clave.
--
-- Ejecutar en Supabase (SQL Editor).
-- ═══════════════════════════════════════════════════════════════════

do $$
declare
  hoy      date := (now() at time zone 'America/Santiago')::date;
  ahora    timestamptz := now();
  anio     text := to_char(now() at time zone 'America/Santiago', 'YYYY');
  -- Las citas futuras caen en día hábil: un sábado o domingo pasa al lunes.
  ing5     date := (hoy + 1) + (case extract(isodow from hoy + 1) when 6 then 2 when 7 then 1 else 0 end)::int;
  ing4     date := (hoy + 2) + (case extract(isodow from hoy + 2) when 6 then 2 when 7 then 1 else 0 end)::int;
  ing3     date := (hoy + 4) + (case extract(isodow from hoy + 4) when 6 then 2 when 7 then 1 else 0 end)::int;
  ent3     date := (ing3 + 1) + (case extract(isodow from ing3 + 1) when 6 then 2 when 7 then 1 else 0 end)::int;
  centro_a text;
  centro_b text;
  centro_c text;

  -- Bitácora
  v        record;
  d        date;
  k        int;
  j        int;
  n        int := 0;
  km       numeric;
  dist     int;
  sale     time;
  litros   numeric;
  obs      text;
  dest_nombre text[] := array['Coñaripe', 'Liquiñe', 'Choshuenco', 'Neltume', 'Puerto Fuy',
                              'Melefquén', 'Pullinque', 'Malalhue', 'Los Lagos', 'Valdivia',
                              'Lanco', 'Panguipulli urbano'];
  dest_km  int[]  := array[44, 90, 90, 100, 110, 20, 30, 32, 70, 230, 90, 18];
  motivos  text[] := array['Ronda médica rural', 'Visita domiciliaria', 'Traslado de insumos a posta',
                           'Retiro de muestras de laboratorio', 'Traslado de pacientes a control',
                           'Entrega de medicamentos y PNAC', 'Trámite administrativo',
                           'Operativo de vacunación'];
begin
  -- ── Centros: se usan los que existen ──────────────────────────────
  select nombre into centro_a from centro where nombre ilike '%panguipulli%' order by nombre limit 1;
  select nombre into centro_b from centro where nombre ilike '%coñaripe%' order by nombre limit 1;
  select nombre into centro_c from centro where nombre ilike '%liqui%' order by nombre limit 1;
  if centro_a is null then select nombre into centro_a from centro order by nombre limit 1; end if;
  if centro_b is null then select nombre into centro_b from centro where nombre <> centro_a order by nombre limit 1; end if;
  if centro_c is null then select nombre into centro_c from centro where nombre not in (centro_a, coalesce(centro_b, '')) order by nombre limit 1; end if;
  centro_b := coalesce(centro_b, centro_a);
  centro_c := coalesce(centro_c, centro_b);
  if centro_a is null then
    raise exception 'No hay centros cargados: primero tiene que existir al menos uno.';
  end if;

  -- ── Se borra todo lo de prueba anterior ───────────────────────────
  delete from comentario        where orden_trabajo_id like 'pba-%';
  delete from alerta            where equipo_id like 'pba-%' or chofer_id like 'pba-%';
  delete from bitacora_flota    where id like 'pba-%';
  delete from asignacion_chofer where id like 'pba-%';
  delete from prestamo_vehiculo where id like 'pba-%';
  delete from orden_trabajo     where id like 'pba-%';
  delete from solicitud         where id like 'pba-%';
  delete from equipo            where id like 'pba-%';
  delete from usuario           where id like 'pba-%';

  -- ── 1) Vehículos ──────────────────────────────────────────────────
  insert into equipo (id, is_sample, tipo, marca, modelo, patente, numero_inventario, estado,
                      centro_principal, ubicacion_especifica, activo, anio_adquisicion,
                      conductor_responsable, estado_neumaticos, estado_luces, estado_bateria_vehiculo,
                      estado_sirena, estado_revision_tecnica, fecha_vencimiento_revision_tecnica,
                      estado_permiso_circulacion, fecha_vencimiento_permiso_circulacion, notas)
  values
    -- Con chofer hoy y la semana próxima ya programada con otra persona.
    ('pba-demo-veh-1', true, 'camioneta', 'Toyota', 'Hilux 2.4 DX 4x4', 'LKXR-42', 'VEH-101', 'operativo',
     centro_a, 'Estacionamiento CESFAM', true, 2022, 'Carlos Soto Vera',
     'ok', 'ok', 'ok', null, 'ok', hoy + 240, 'ok', hoy + 180,
     'Camioneta para rondas rurales del sector cordillera.'),
    -- Prestada a otro centro, atrasada, y a cargo de un chofer con la licencia vencida.
    ('pba-demo-veh-2', true, 'camioneta', 'Mitsubishi', 'L200 Katana CRT', 'JHPS-17', 'VEH-102', 'operativo',
     centro_a, 'Estacionamiento CESFAM', true, 2020, 'Hugo Paredes Lagos',
     'desgastado', 'ok', 'ok', null, 'ok', hoy + 150, 'ok', hoy + 180,
     'Prestada para reforzar el programa de atención domiciliaria.'),
    -- Mañana y tarde con choferes distintos. Entra mañana al taller (revisión técnica).
    ('pba-demo-veh-3', true, 'furgon', 'Peugeot', 'Partner Maxi', 'PFTW-63', 'VEH-103', 'operativo',
     centro_b, 'Patio posterior', true, 2021, 'Daniela Reyes Muñoz',
     'ok', 'falla_leve', 'ok', null, 'en_gestion', hoy + 20, 'ok', hoy + 180,
     'Furgón de visitas domiciliarias y entrega de medicamentos.'),
    -- En el taller ahora, con un turno programado encima (el calendario avisa el choque).
    ('pba-demo-veh-4', true, 'furgon', 'Hyundai', 'H-1 12 pasajeros', 'HSCZ-25', 'VEH-104', 'mantenimiento',
     centro_b, 'Taller municipal', true, 2019, 'Jorge Catalán Silva',
     'ok', 'ok', 'baja_carga', null, 'en_gestion', hoy + 12, 'ok', hoy + 180,
     'Traslado de funcionarios y pacientes a controles.'),
    -- Sin chofer hoy y con el permiso de circulación vencido.
    ('pba-demo-veh-5', true, 'camion_3_4', 'Chevrolet', 'NPR 816', 'GKBD-81', 'VEH-105', 'operativo',
     centro_a, 'Bodega central', true, 2018, null,
     'requiere_cambio', 'ok', 'ok', null, 'ok', hoy + 90, 'vencido', hoy - 20,
     'Camión de bodega: insumos, mobiliario y retiro de residuos.'),
    -- Llegó prestada desde otro centro, dentro de plazo.
    ('pba-demo-veh-6', true, 'camioneta', 'Nissan', 'Navara NP300 4x4', 'RVLT-39', 'VEH-106', 'operativo',
     centro_c, 'Estacionamiento CESFAM', true, 2023, 'Valeria Antilef Huenchumán',
     'ok', 'ok', 'ok', null, 'ok', hoy + 330, 'ok', hoy + 180,
     'Camioneta nueva, asignada a rondas de Liquiñe y Carirriñe.'),
    -- Fuera de servicio, con la revisión técnica vencida.
    ('pba-demo-veh-7', true, 'camioneta', 'Ford', 'Ranger XL 2.2', 'DFGH-58', 'VEH-107', 'fuera_de_servicio',
     centro_c, 'Taller municipal', true, 2015, null,
     'requiere_cambio', 'falla_grave', 'requiere_reemplazo', null, 'vencida', hoy - 45, 'pendiente', hoy - 10,
     'Motor con pérdida de compresión. En evaluación de baja.'),
    -- Ambulancia: la ficha es de Calidad, Movilización la ve en lectura.
    ('pba-demo-veh-8', true, 'ambulancia', 'Mercedes-Benz', 'Sprinter 515 Ambulancia', 'KWZP-90', 'AMB-201', 'operativo',
     centro_a, 'SAPU', true, 2021, 'Marcela Fuentes Riquelme',
     'ok', 'ok', 'ok', 'ok', 'pendiente', hoy + 28, 'ok', hoy + 180,
     'Ambulancia básica SAPU.');

  -- ── 2) Choferes: todos los estados de licencia ────────────────────
  insert into usuario (id, is_sample, role, email, full_name, centro_principal,
                       licencia_numero, licencia_clase, licencia_vencimiento)
  values
    ('pba-demo-cho-1', true, 'chofer', 'carlos.soto@demo.test',        'Carlos Soto Vera',           centro_a, '12.456.789-K', 'B',  hoy + 730),
    ('pba-demo-cho-2', true, 'chofer', 'daniela.reyes@demo.test',      'Daniela Reyes Muñoz',        centro_b, '15.987.321-4', 'A2', hoy + 25),
    ('pba-demo-cho-3', true, 'chofer', 'hugo.paredes@demo.test',       'Hugo Paredes Lagos',         centro_a, '10.234.567-8', 'B',  hoy - 12),
    ('pba-demo-cho-4', true, 'chofer', 'marcela.fuentes@demo.test',    'Marcela Fuentes Riquelme',   centro_a, '14.321.654-2', 'A3', hoy + 540),
    ('pba-demo-cho-5', true, 'chofer', 'jorge.catalan@demo.test',      'Jorge Catalán Silva',        centro_b, '11.876.543-1', 'A2', hoy + 410),
    ('pba-demo-cho-6', true, 'chofer', 'patricio.hernandez@demo.test', 'Patricio Hernández Oyarzo',  centro_c, null,           null, null),
    ('pba-demo-cho-7', true, 'chofer', 'valeria.antilef@demo.test',    'Valeria Antilef Huenchumán', centro_c, '17.654.098-3', 'B',  hoy + 49);

  -- ── 3) Préstamos ──────────────────────────────────────────────────
  insert into prestamo_vehiculo (id, is_sample, equipo_id, equipo_label, centro_origen, centro_destino,
                                 centro_costo, desde, hasta_previsto, devuelto_el, estado, motivo)
  values
    ('pba-demo-pre-1', true, 'pba-demo-veh-2', 'Mitsubishi L200 Katana CRT · JHPS-17',
     centro_a, centro_b, centro_b, hoy - 12, hoy - 3, null, 'vigente',
     'Refuerzo del programa de atención domiciliaria.'),
    ('pba-demo-pre-2', true, 'pba-demo-veh-6', 'Nissan Navara NP300 4x4 · RVLT-39',
     centro_c, centro_a, centro_a, hoy - 3, hoy + 5, null, 'vigente',
     'Cubre a la Hilux durante su cambio de neumáticos.'),
    ('pba-demo-pre-3', true, 'pba-demo-veh-1', 'Toyota Hilux 2.4 DX 4x4 · LKXR-42',
     centro_a, centro_c, centro_c, hoy - 40, hoy - 33, hoy - 32, 'devuelto',
     'Campaña de vacunación en sectores altos.');

  -- ── 4) Asignaciones (calendario) ──────────────────────────────────
  insert into asignacion_chofer (id, is_sample, chofer_id, chofer_email, chofer_nombre, equipo_id, equipo_label,
                                 desde, hasta, turno, hora_salida, hora_regreso, destino, estado,
                                 prestamo_id, observaciones)
  values
    -- Hilux: esta semana Carlos, la próxima Daniela.
    ('pba-demo-asi-1', true, 'pba-demo-cho-1', 'carlos.soto@demo.test', 'Carlos Soto Vera',
     'pba-demo-veh-1', 'Toyota Hilux 2.4 DX 4x4 · LKXR-42', hoy - 4, hoy + 2, 'completo', '08:00', '17:00',
     'Rondas rurales Choshuenco y Neltume', 'activa', null, null),
    ('pba-demo-asi-2', true, 'pba-demo-cho-2', 'daniela.reyes@demo.test', 'Daniela Reyes Muñoz',
     'pba-demo-veh-1', 'Toyota Hilux 2.4 DX 4x4 · LKXR-42', hoy + 3, hoy + 9, 'completo', '08:00', '17:00',
     'Postas de Liquiñe y Carirriñe', 'activa', null, 'Programada por la ronda mensual de cordillera.'),
    -- L200: prestada y a cargo de alguien con la licencia vencida.
    ('pba-demo-asi-3', true, 'pba-demo-cho-3', 'hugo.paredes@demo.test', 'Hugo Paredes Lagos',
     'pba-demo-veh-2', 'Mitsubishi L200 Katana CRT · JHPS-17', hoy - 12, hoy + 4, 'completo', '08:30', '17:30',
     'Atención domiciliaria Coñaripe', 'activa', 'pba-demo-pre-1', null),
    -- Partner: mañana una persona, tarde otra (hasta hoy: mañana entra al taller).
    ('pba-demo-asi-4', true, 'pba-demo-cho-2', 'daniela.reyes@demo.test', 'Daniela Reyes Muñoz',
     'pba-demo-veh-3', 'Peugeot Partner Maxi · PFTW-63', hoy - 7, hoy, 'manana', '08:00', '13:00',
     'Visitas domiciliarias', 'activa', null, null),
    ('pba-demo-asi-5', true, 'pba-demo-cho-5', 'jorge.catalan@demo.test', 'Jorge Catalán Silva',
     'pba-demo-veh-3', 'Peugeot Partner Maxi · PFTW-63', hoy - 7, hoy, 'tarde', '14:00', '19:00',
     'Entrega de medicamentos', 'activa', null, null),
    -- Partner: vuelve del taller y sigue en la tarde.
    ('pba-demo-asi-12', true, 'pba-demo-cho-5', 'jorge.catalan@demo.test', 'Jorge Catalán Silva',
     'pba-demo-veh-3', 'Peugeot Partner Maxi · PFTW-63', ing5 + 1, hoy + 9, 'tarde', '14:00', '19:00',
     'Entrega de medicamentos', 'activa', null, null),
    -- H-1: turno programado mientras está en el taller (choque).
    ('pba-demo-asi-6', true, 'pba-demo-cho-6', 'patricio.hernandez@demo.test', 'Patricio Hernández Oyarzo',
     'pba-demo-veh-4', 'Hyundai H-1 12 pasajeros · HSCZ-25', hoy + 1, hoy + 5, 'completo', '07:30', '16:00',
     'Traslado de pacientes a Valdivia', 'activa', null, null),
    -- NPR: nada hoy, una salida agendada más adelante.
    ('pba-demo-asi-7', true, 'pba-demo-cho-5', 'jorge.catalan@demo.test', 'Jorge Catalán Silva',
     'pba-demo-veh-5', 'Chevrolet NPR 816 · GKBD-81', hoy + 8, hoy + 9, 'manana', '08:00', '12:30',
     'Traslado de mobiliario a Posta Puerto Fuy', 'activa', null, null),
    -- Navara: llegó prestada.
    ('pba-demo-asi-8', true, 'pba-demo-cho-7', 'valeria.antilef@demo.test', 'Valeria Antilef Huenchumán',
     'pba-demo-veh-6', 'Nissan Navara NP300 4x4 · RVLT-39', hoy - 3, hoy + 5, 'completo', '08:00', '17:00',
     'Rondas rurales sector Melefquén', 'activa', 'pba-demo-pre-2', null),
    -- Ambulancia: asignación abierta, sin fecha de término.
    ('pba-demo-asi-9', true, 'pba-demo-cho-4', 'marcela.fuentes@demo.test', 'Marcela Fuentes Riquelme',
     'pba-demo-veh-8', 'Mercedes-Benz Sprinter 515 Ambulancia · KWZP-90', hoy - 60, null, 'completo', null, null,
     'SAPU', 'activa', null, 'Conductora titular de la ambulancia.'),
    -- Historial.
    ('pba-demo-asi-10', true, 'pba-demo-cho-5', 'jorge.catalan@demo.test', 'Jorge Catalán Silva',
     'pba-demo-veh-1', 'Toyota Hilux 2.4 DX 4x4 · LKXR-42', hoy - 30, hoy - 5, 'completo', '08:00', '17:00',
     'Rondas rurales', 'terminada', null, null),
    ('pba-demo-asi-11', true, 'pba-demo-cho-1', 'carlos.soto@demo.test', 'Carlos Soto Vera',
     'pba-demo-veh-5', 'Chevrolet NPR 816 · GKBD-81', hoy - 25, hoy - 6, 'completo', '08:00', '17:00',
     'Bodega central', 'terminada', null, null);

  -- ── 5) Solicitudes de Salud ───────────────────────────────────────
  insert into solicitud (id, is_sample, equipo_id, tipo, fecha, usuario_email, usuario_nombre, centro,
                         estado, observaciones, respuesta_admin, created_date)
  values
    -- Por revisar
    ('pba-demo-sol-1', true, 'pba-demo-veh-8', 'mantenimiento_correctivo', hoy,
     'paula.contreras@demo.test', 'Paula Contreras (Enfermera SAPU)', centro_a, 'pendiente',
     'Se encendió la luz del ABS durante un traslado. Frena bien, pero queremos que la revisen.', null,
     ahora - interval '3 hours'),
    ('pba-demo-sol-2', true, 'pba-demo-veh-3', 'mantenimiento_correctivo', hoy - 1,
     'andrea.millar@demo.test', 'Andrea Millar (TENS)', centro_b, 'pendiente',
     'La puerta lateral corrediza no cierra bien; hay que empujarla dos veces.', null,
     ahora - interval '1 day'),
    -- Origen de la cita confirmada para mañana
    ('pba-demo-sol-3', true, 'pba-demo-veh-3', 'revision_tecnica', hoy - 6,
     'andrea.millar@demo.test', 'Andrea Millar (TENS)', centro_b, 'en_proceso',
     'La revisión técnica vence este mes.', 'Derivada al taller por Movilización',
     ahora - interval '6 days'),
    -- Reparada: falta cerrar y avisar a Salud
    ('pba-demo-sol-4', true, 'pba-demo-veh-8', 'mantenimiento_correctivo', hoy - 9,
     'paula.contreras@demo.test', 'Paula Contreras (Enfermera SAPU)', centro_a, 'en_proceso',
     'Ruido metálico al frenar y tira hacia la derecha.', 'Derivada al taller por Movilización',
     ahora - interval '9 days'),
    -- Cerrada
    ('pba-demo-sol-5', true, 'pba-demo-veh-1', 'mantenimiento_preventivo', hoy - 24,
     'paula.contreras@demo.test', 'Paula Contreras (Enfermera SAPU)', centro_a, 'finalizada',
     'Corresponde la mantención de los 45.000 km.',
     E'Derivada al taller por Movilización\nListo: mantención realizada, el vehículo volvió a operar.',
     ahora - interval '24 days');

  -- ── 6) Órdenes de trabajo: una por cada paso con el taller ────────
  insert into orden_trabajo (id, is_sample, numero_ot, equipo_id, equipo_label, patente, marca_modelo,
                             tipo_activo, prioridad, estado, problema_reportado, diagnostico, origen, solicitud_id,
                             reportado_por_nombre, reportado_por_email, supervisor_nombre,
                             fecha_preferida, cita_estado, cita_fecha, cita_entrega, cita_nota,
                             mecanico_nombre, fecha_asignacion, fecha_inicio, fecha_fin, notas_cierre,
                             horas_reales, total_mano_obra, total_repuestos, total,
                             created_date, linea_tiempo)
  values
    -- En reparación ahora (la H-1)
    ('pba-demo-ot-1', true, 'OT-' || anio || '-90101', 'pba-demo-veh-4', 'Hyundai H-1 12 pasajeros · HSCZ-25',
     'HSCZ-25', 'Hyundai H-1 12 pasajeros', 'corporativo', 'alta', 'en_proceso',
     'Ruido en la caja de cambios al pasar a tercera.', 'Desgaste del sincronizador de 3ª. Se pidió el repuesto.',
     'movilizacion', null, 'Rodrigo Alarcón (Movilización)', 'rodrigo.alarcon@demo.test', 'Mauricio Lepe',
     hoy - 3, 'confirmada', ((hoy - 2) + time '08:30') at time zone 'America/Santiago', hoy + 3, null,
     'Luis Vargas', hoy - 2, hoy - 2, null, null,
     null, null, null, null,
     ahora - interval '6 days',
     jsonb_build_array(
       jsonb_build_object('fecha', ahora - interval '6 days', 'evento', 'Orden de trabajo creada', 'usuario_nombre', 'Rodrigo Alarcón (Movilización)'),
       jsonb_build_object('fecha', ahora - interval '5 days', 'evento', 'Taller propone fecha a Movilización', 'usuario_nombre', 'Mauricio Lepe'),
       jsonb_build_object('fecha', ahora - interval '4 days', 'evento', 'Movilización confirma la fecha de ingreso', 'usuario_nombre', 'Rodrigo Alarcón (Movilización)'),
       jsonb_build_object('fecha', ahora - interval '2 days', 'evento', 'Estado: En Proceso', 'usuario_nombre', 'Luis Vargas'))),

    -- Pedido sin fecha hace 5 días (atascado)
    ('pba-demo-ot-2', true, 'OT-' || anio || '-90102', 'pba-demo-veh-5', 'Chevrolet NPR 816 · GKBD-81',
     'GKBD-81', 'Chevrolet NPR 816', 'corporativo', 'media', 'pendiente',
     'Mantención de los 190.000 km y cambio de neumáticos traseros.', null,
     'movilizacion', null, 'Rodrigo Alarcón (Movilización)', 'rodrigo.alarcon@demo.test', null,
     hoy + 1, 'por_agendar', null, null, null,
     null, null, null, null, null, null, null, null, null,
     ahora - interval '5 days',
     jsonb_build_array(
       jsonb_build_object('fecha', ahora - interval '5 days', 'evento', 'Orden de trabajo creada', 'usuario_nombre', 'Rodrigo Alarcón (Movilización)',
                          'notas', 'Mantención de los 190.000 km.'))),

    -- El Taller propone y cae sobre el turno de Daniela (espera respuesta de Movilización)
    ('pba-demo-ot-3', true, 'OT-' || anio || '-90103', 'pba-demo-veh-1', 'Toyota Hilux 2.4 DX 4x4 · LKXR-42',
     'LKXR-42', 'Toyota Hilux 2.4 DX 4x4', 'corporativo', 'media', 'pendiente',
     'Cambio de neumáticos delanteros y alineación.', null,
     'movilizacion', null, 'Rodrigo Alarcón (Movilización)', 'rodrigo.alarcon@demo.test', null,
     hoy + 3, 'propuesta', (ing3 + time '09:00') at time zone 'America/Santiago', ent3,
     'Traerla con el estanque sobre la mitad.',
     null, null, null, null, null, null, null, null, null,
     ahora - interval '3 days',
     jsonb_build_array(
       jsonb_build_object('fecha', ahora - interval '3 days', 'evento', 'Orden de trabajo creada', 'usuario_nombre', 'Rodrigo Alarcón (Movilización)'),
       jsonb_build_object('fecha', ahora - interval '20 hours', 'evento', 'Taller propone fecha a Movilización', 'usuario_nombre', 'Mauricio Lepe',
                          'notas', 'Traerla con el estanque sobre la mitad.'))),

    -- Movilización pidió otra fecha
    ('pba-demo-ot-4', true, 'OT-' || anio || '-90104', 'pba-demo-veh-6', 'Nissan Navara NP300 4x4 · RVLT-39',
     'RVLT-39', 'Nissan Navara NP300 4x4', 'corporativo', 'baja', 'pendiente',
     'Mantención de los 15.000 km.', null,
     'movilizacion', null, 'Rodrigo Alarcón (Movilización)', 'rodrigo.alarcon@demo.test', null,
     hoy + 8, 'reagendar', (ing4 + time '10:30') at time zone 'America/Santiago', ing4,
     'Esa semana está prestada cubriendo a la Hilux. Puedo llevarla desde el ' || to_char(hoy + 8, 'DD-MM') || '.',
     null, null, null, null, null, null, null, null, null,
     ahora - interval '4 days',
     jsonb_build_array(
       jsonb_build_object('fecha', ahora - interval '4 days', 'evento', 'Orden de trabajo creada', 'usuario_nombre', 'Rodrigo Alarcón (Movilización)'),
       jsonb_build_object('fecha', ahora - interval '3 days', 'evento', 'Taller propone fecha a Movilización', 'usuario_nombre', 'Mauricio Lepe'),
       jsonb_build_object('fecha', ahora - interval '2 days', 'evento', 'Movilización pide otra fecha', 'usuario_nombre', 'Rodrigo Alarcón (Movilización)',
                          'notas', 'Esa semana está prestada cubriendo a la Hilux.'))),

    -- Confirmada: entra el próximo día hábil (viene de la solicitud de Salud 3)
    ('pba-demo-ot-5', true, 'OT-' || anio || '-90105', 'pba-demo-veh-3', 'Peugeot Partner Maxi · PFTW-63',
     'PFTW-63', 'Peugeot Partner Maxi', 'corporativo', 'alta', 'asignada',
     'Revisión técnica — La revisión técnica vence este mes.', null,
     'movilizacion', 'pba-demo-sol-3', 'Rodrigo Alarcón (Movilización)', 'rodrigo.alarcon@demo.test', 'Mauricio Lepe',
     hoy, 'confirmada', (ing5 + time '08:30') at time zone 'America/Santiago', ing5,
     'Pasar por la bodega del taller a dejar las llaves.',
     'Luis Vargas', hoy - 1, null, null, null, null, null, null, null,
     ahora - interval '6 days',
     jsonb_build_array(
       jsonb_build_object('fecha', ahora - interval '6 days', 'evento', 'Orden de trabajo creada', 'usuario_nombre', 'Rodrigo Alarcón (Movilización)'),
       jsonb_build_object('fecha', ahora - interval '5 days', 'evento', 'Taller propone fecha a Movilización', 'usuario_nombre', 'Mauricio Lepe'),
       jsonb_build_object('fecha', ahora - interval '4 days 12 hours', 'evento', 'Movilización confirma la fecha de ingreso', 'usuario_nombre', 'Rodrigo Alarcón (Movilización)'))),

    -- Terminada: falta cerrar y avisar a Salud (viene de la solicitud 4)
    ('pba-demo-ot-6', true, 'OT-' || anio || '-90106', 'pba-demo-veh-8', 'Mercedes-Benz Sprinter 515 Ambulancia · KWZP-90',
     'KWZP-90', 'Mercedes-Benz Sprinter 515 Ambulancia', 'salud', 'alta', 'completada',
     'Reparación — Ruido metálico al frenar y tira hacia la derecha.', 'Pastillas delanteras al límite y disco derecho rayado.',
     'movilizacion', 'pba-demo-sol-4', 'Rodrigo Alarcón (Movilización)', 'rodrigo.alarcon@demo.test', 'Mauricio Lepe',
     hoy - 8, 'confirmada', ((hoy - 6) + time '09:00') at time zone 'America/Santiago', hoy - 4, null,
     'Luis Vargas', hoy - 6, hoy - 6, hoy - 1, 'Cambio de pastillas y discos delanteros. Prueba de frenado OK.',
     6, 60000, 125000, 185000,
     ahora - interval '9 days',
     jsonb_build_array(
       jsonb_build_object('fecha', ahora - interval '9 days', 'evento', 'Orden de trabajo creada', 'usuario_nombre', 'Rodrigo Alarcón (Movilización)'),
       jsonb_build_object('fecha', ahora - interval '7 days', 'evento', 'Taller propone fecha a Movilización', 'usuario_nombre', 'Mauricio Lepe'),
       jsonb_build_object('fecha', ahora - interval '6 days 20 hours', 'evento', 'Movilización confirma la fecha de ingreso', 'usuario_nombre', 'Rodrigo Alarcón (Movilización)'),
       jsonb_build_object('fecha', ahora - interval '1 day', 'evento', 'Estado: Completada', 'usuario_nombre', 'Mauricio Lepe'))),

    -- Cerrada (viene de la solicitud 5)
    ('pba-demo-ot-7', true, 'OT-' || anio || '-90107', 'pba-demo-veh-1', 'Toyota Hilux 2.4 DX 4x4 · LKXR-42',
     'LKXR-42', 'Toyota Hilux 2.4 DX 4x4', 'corporativo', 'media', 'completada',
     'Mantenimiento preventivo — Corresponde la mantención de los 45.000 km.', 'Cambio de aceite, filtros y revisión general.',
     'movilizacion', 'pba-demo-sol-5', 'Rodrigo Alarcón (Movilización)', 'rodrigo.alarcon@demo.test', 'Mauricio Lepe',
     hoy - 21, 'confirmada', ((hoy - 20) + time '08:30') at time zone 'America/Santiago', hoy - 20, null,
     'Luis Vargas', hoy - 20, hoy - 20, hoy - 19, 'Mantención de 45.000 km realizada.',
     4, 40000, 98000, 138000,
     ahora - interval '24 days',
     jsonb_build_array(
       jsonb_build_object('fecha', ahora - interval '24 days', 'evento', 'Orden de trabajo creada', 'usuario_nombre', 'Rodrigo Alarcón (Movilización)'),
       jsonb_build_object('fecha', ahora - interval '23 days', 'evento', 'Taller propone fecha a Movilización', 'usuario_nombre', 'Mauricio Lepe'),
       jsonb_build_object('fecha', ahora - interval '22 days', 'evento', 'Movilización confirma la fecha de ingreso', 'usuario_nombre', 'Rodrigo Alarcón (Movilización)'),
       jsonb_build_object('fecha', ahora - interval '19 days', 'evento', 'Estado: Completada', 'usuario_nombre', 'Mauricio Lepe'))),

    -- Cerrada, pedida directamente por Movilización
    ('pba-demo-ot-8', true, 'OT-' || anio || '-90108', 'pba-demo-veh-5', 'Chevrolet NPR 816 · GKBD-81',
     'GKBD-81', 'Chevrolet NPR 816', 'corporativo', 'alta', 'completada',
     'No arranca en las mañanas.', 'Batería agotada.',
     'movilizacion', null, 'Rodrigo Alarcón (Movilización)', 'rodrigo.alarcon@demo.test', 'Mauricio Lepe',
     hoy - 30, 'confirmada', ((hoy - 29) + time '08:30') at time zone 'America/Santiago', hoy - 29, null,
     'Luis Vargas', hoy - 29, hoy - 29, hoy - 29, 'Cambio de batería 100 Ah.',
     1, 10000, 95000, 105000,
     ahora - interval '31 days',
     jsonb_build_array(
       jsonb_build_object('fecha', ahora - interval '31 days', 'evento', 'Orden de trabajo creada', 'usuario_nombre', 'Rodrigo Alarcón (Movilización)'),
       jsonb_build_object('fecha', ahora - interval '29 days', 'evento', 'Estado: Completada', 'usuario_nombre', 'Mauricio Lepe')));

  -- ── 7) Bitácora: las salidas de las últimas 6 semanas ─────────────
  -- Días hábiles, del más antiguo al más nuevo, para que el odómetro
  -- siempre suba. El centro de costo y el préstamo los pone el disparador
  -- de 18_bitacora_flota.sql.
  for v in
    select * from (values
      ('pba-demo-veh-1', 'Toyota Hilux 2.4 DX 4x4 · LKXR-42',     'pba-demo-cho-1', 'Carlos Soto Vera',           48210,  1),
      ('pba-demo-veh-2', 'Mitsubishi L200 Katana CRT · JHPS-17',  'pba-demo-cho-3', 'Hugo Paredes Lagos',         96340,  2),
      ('pba-demo-veh-3', 'Peugeot Partner Maxi · PFTW-63',        'pba-demo-cho-2', 'Daniela Reyes Muñoz',        31580,  3),
      ('pba-demo-veh-4', 'Hyundai H-1 12 pasajeros · HSCZ-25',    'pba-demo-cho-5', 'Jorge Catalán Silva',       142700,  4),
      ('pba-demo-veh-5', 'Chevrolet NPR 816 · GKBD-81',           'pba-demo-cho-1', 'Carlos Soto Vera',          187450,  5),
      ('pba-demo-veh-6', 'Nissan Navara NP300 4x4 · RVLT-39',     'pba-demo-cho-7', 'Valeria Antilef Huenchumán', 12890,  6)
    ) as t(equipo_id, equipo_label, chofer_id, chofer_nombre, km0, ix)
  loop
    km := v.km0;
    for k in reverse 42..0 loop
      d := hoy - k;
      continue when extract(isodow from d) > 5;
      continue when (k + v.ix) % 3 = 0 and k > 0;
      -- La H-1 está en el taller desde hace dos días; el NPR sin salidas recientes.
      continue when v.equipo_id = 'pba-demo-veh-4' and k <= 2;
      continue when v.equipo_id = 'pba-demo-veh-5' and k <= 3;
      -- Hoy solo quedan en ruta la Hilux y la Partner.
      continue when k = 0 and v.equipo_id not in ('pba-demo-veh-1', 'pba-demo-veh-3');

      j    := 1 + ((k * 7 + v.ix * 3) % 12);
      dist := dest_km[j] + ((k + v.ix) % 5) * 3;
      sale := time '07:30' + ((k + v.ix) % 4) * interval '30 minutes';
      litros := case when (k + v.ix) % 4 = 1 or k = 1 then 35 + (k % 3) * 6 end;
      obs := case
        when v.equipo_id = 'pba-demo-veh-4' and k = 3 then 'Ruido en la caja al pasar a tercera. Se informa al taller.'
        when v.equipo_id = 'pba-demo-veh-1' and k = 6 then 'Neumáticos delanteros con desgaste disparejo.'
        when dest_nombre[j] = 'Liquiñe' and (k % 2) = 0 then 'Camino de ripio en mal estado después de Coñaripe.'
      end;
      n := n + 1;

      insert into bitacora_flota (id, is_sample, equipo_id, equipo_label, chofer_id, chofer_nombre,
                                  fecha, hora_salida, hora_regreso, km_salida, km_regreso,
                                  destino, motivo, combustible_litros, combustible_monto, estado, observaciones)
      values ('pba-demo-bit-' || n, true, v.equipo_id, v.equipo_label, v.chofer_id, v.chofer_nombre,
              d, to_char(sale, 'HH24:MI'),
              case when k = 0 then null else to_char(sale + make_interval(mins => 120 + dist * 2), 'HH24:MI') end,
              km, case when k = 0 then null else km + dist end,
              dest_nombre[j], motivos[1 + ((k + v.ix) % 8)],
              case when k = 0 then null else litros end,
              case when k = 0 or litros is null then null else litros * 1190 end,
              case when k = 0 then 'en_ruta' else 'cerrada' end,
              obs);

      km := km + dist;
    end loop;
  end loop;

  raise notice 'Demo cargada: 8 vehículos, 7 choferes, % salidas. Centros: %, %, %.', n, centro_a, centro_b, centro_c;
end $$;

-- ── Verificación ────────────────────────────────────────────────────
select 'vehiculos' as que, count(*)::text as hay from equipo where id like 'pba-demo-%'
union all select 'choferes',      count(*)::text from usuario where id like 'pba-demo-%'
union all select 'asignaciones',  count(*)::text from asignacion_chofer where id like 'pba-demo-%'
union all select 'prestamos',     count(*)::text from prestamo_vehiculo where id like 'pba-demo-%'
union all select 'solicitudes',   count(*)::text from solicitud where id like 'pba-demo-%'
union all select 'ordenes',       count(*)::text from orden_trabajo where id like 'pba-demo-%'
union all select 'salidas',       count(*)::text from bitacora_flota where id like 'pba-demo-%';

-- ═══════════════════════════════════════════════════════════════════
-- PARA BORRAR LA DEMO (o usar Configuración → Datos de prueba)
-- ═══════════════════════════════════════════════════════════════════
--   delete from bitacora_flota    where id like 'pba-%';
--   delete from asignacion_chofer where id like 'pba-%';
--   delete from prestamo_vehiculo where id like 'pba-%';
--   delete from orden_trabajo     where id like 'pba-%';
--   delete from solicitud         where id like 'pba-%';
--   delete from equipo            where id like 'pba-%';
--   delete from usuario           where id like 'pba-%';
--
-- ── Qué se ve con el perfil de Movilización ─────────────────────────
-- Panel de Flota  vehículos con y sin chofer, uno en el taller, un chofer
--                 manejando con la licencia vencida, licencias por vencer
--                 y sin cargar, un préstamo atrasado, dos salidas en ruta,
--                 dos solicitudes de Salud por revisar y una fecha del
--                 taller esperando respuesta.
-- Calendario      la Hilux con dos choferes seguidos y la cita propuesta
--                 encima del segundo; la Partner con turno mañana y tarde
--                 y su ingreso al taller mañana; la H-1 en el taller con un
--                 turno programado encima; las dos camionetas prestadas.
-- Vehículos       8 fichas: camionetas, furgones, camión 3/4 y una
--                 ambulancia (solo lectura); operativo, en mantenimiento y
--                 fuera de servicio; revisión técnica y permiso vencidos.
-- Choferes        vigente, por vencer, vencida y sin licencia cargada.
-- Bitácora        ~6 semanas de salidas por vehículo y chofer, con
--                 combustible, kilómetros, observaciones y las salidas
--                 durante los préstamos.
-- Solicitudes     Por revisar (2), Con el taller (propuesta con choque,
-- al Taller       sin fecha hace 5 días, otra fecha pedida, confirmada,
--                 en reparación, terminada para avisar a Salud) y
--                 Cerradas (2).
