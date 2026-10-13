-- ═══════════════════════════════════════════════════════════════════
-- 27_fallas_de_pauta_a_solicitudes.sql
--
-- Las fallas de las pautas ya no van directo al taller.
--
-- Hasta ahora, aprobar una pauta con fallas en Revisión Bitácora abría una
-- orden de trabajo en la fila del taller sin que nadie la evaluara. Desde
-- este cambio abre una SOLICITUD: si es un vehículo la decide Movilización
-- («Solicitudes al Taller»: la deriva al taller o la cierra); si es un
-- equipo, Salud («Solicitudes»).
--
-- Esta migración ordena lo que ya quedó en el taller: las órdenes que
-- nacieron de una pauta y que el taller todavía NO tomó (pendientes, sin
-- mecánico y sin fecha propuesta) pasan a ser una solicitud por equipo, y la
-- orden queda cancelada con la razón en su línea de tiempo. Las que el
-- taller ya asignó, agendó o empezó NO se tocan.
--
-- Es opcional y re-ejecutable. Primero corre la parte 1 sola para ver qué
-- se movería; si está bien, corre todo.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1) Qué se movería (solo mira) ───────────────────────────────────
select o.numero_ot, o.equipo_label, o.created_date::date as creada,
       left(o.problema_reportado, 80) as problema
from orden_trabajo o
where o.origen = 'inspeccion' and o.estado = 'pendiente'
  and coalesce(o.mecanico_email, '') = '' and o.cita_estado is null
  and o.equipo_id is not null
order by o.equipo_label, o.created_date;

-- ── 2) Moverlas ─────────────────────────────────────────────────────
begin;

create temp table ot_a_mover on commit drop as
select o.*
from orden_trabajo o
where o.origen = 'inspeccion' and o.estado = 'pendiente'
  and coalesce(o.mecanico_email, '') = '' and o.cita_estado is null
  and o.equipo_id is not null;

-- Una solicitud por equipo, con todas sus fallas juntas. El id sale del
-- equipo y del día: si se corre dos veces no se duplica.
insert into solicitud (id, equipo_id, tipo, fecha, usuario_email, usuario_nombre,
                       centro, estado, origen, observaciones)
select 'pauta-ot-' || m.equipo_id || '-' || to_char(now() at time zone 'America/Santiago', 'YYYYMMDD'),
       m.equipo_id,
       'mantenimiento_correctivo',
       min((m.created_date at time zone 'America/Santiago')::date),
       (array_agg(m.reportado_por_email order by m.created_date desc))[1],
       (array_agg(m.reportado_por_nombre order by m.created_date desc))[1],
       coalesce(max(e.centro_principal), ''),
       'pendiente',
       'pauta_inspeccion',
       string_agg(coalesce(m.problema_reportado, '') || E'\n(Venía de la ' || coalesce(m.numero_ot, 'orden')
                  || ', que estaba en la fila del taller.)', E'\n\n' order by m.created_date)
from ot_a_mover m
left join equipo e on e.id = m.equipo_id
group by m.equipo_id
on conflict (id) do nothing;

update orden_trabajo o
set estado = 'cancelada',
    notas_cierre = 'Pasó a solicitud: las fallas de las pautas las evalúa Movilización (vehículos) o Salud (equipos) antes de llegar al taller.',
    linea_tiempo = coalesce(o.linea_tiempo, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'fecha', now(),
      'evento', 'Cancelada: pasa como solicitud a Movilización / Salud para que la evalúen',
      'usuario_nombre', 'Sistema',
      'usuario_email', ''))
from ot_a_mover m
where o.id = m.id;

commit;

-- ── Verificación ────────────────────────────────────────────────────
-- Debe decir 0 en la primera fila; la segunda, cuántas solicitudes quedaron.
select 'órdenes de pauta sin tomar que quedan en el taller' as que, count(*) as hay
from orden_trabajo
where origen = 'inspeccion' and estado = 'pendiente'
  and coalesce(mecanico_email, '') = '' and cita_estado is null and equipo_id is not null
union all
select 'solicitudes de pauta por revisar', count(*)
from solicitud where origen = 'pauta_inspeccion' and estado = 'pendiente';
