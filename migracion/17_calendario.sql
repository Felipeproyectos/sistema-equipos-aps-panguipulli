-- ═══════════════════════════════════════════════════════════════════
-- 17_calendario.sql
--
-- Programar el uso de los vehículos: varias asignaciones por vehículo,
-- mientras no se pisen.
--
-- Qué cambia, y por qué
-- ─────────────────────
-- 15_asignaciones.sql puso la regla "un vehículo, una asignación activa"
-- con un índice único parcial. Eso servía para responder "¿quién lo tiene
-- ahora?", pero IMPIDE programar a futuro: no se puede dejar agendado al
-- chofer de la semana que viene mientras el de esta semana sigue vigente.
--
-- La regla correcta no es "una sola", es "que no se pisen". Este archivo
-- hace ese cambio, que ya estaba anotado en el comentario del índice.
--
-- Cómo se decide si dos asignaciones se pisan
-- ───────────────────────────────────────────
-- Se pisan cuando coinciden en FECHAS y además en TURNO:
--
--     completo  choca con todo
--     mañana    choca con mañana y con completo
--     tarde     choca con tarde y con completo
--
-- Así, "por días" sigue funcionando igual (todo es 'completo'), y quien
-- necesite partir la jornada puede hacerlo sin que el sistema lo trate
-- como un choque.
--
-- Va como disparador y no como constraint de exclusión porque la regla
-- del turno no se expresa bien con operadores: 'completo' choca con
-- valores distintos de sí mismo. Un disparador lo dice en una línea y
-- además puede devolver un mensaje que la persona entienda.
--
-- La hora y el destino son DESCRIPTIVOS: sirven para saber qué se hizo,
-- no entran en el cálculo del choque. Dos salidas el mismo día y turno
-- siguen siendo un choque aunque tengan horas distintas — si hace falta
-- esa precisión, es la bitácora de operación, no esto.
--
-- Ejecutar una sola vez en Supabase (SQL Editor). Es re-ejecutable.
-- ═══════════════════════════════════════════════════════════════════

-- ── Antes: cuántas asignaciones hay, y si alguna ya se pisa ─────────
-- Solo lectura. Si esto devuelve filas, hay que resolverlas a mano ANTES
-- de que el disparador empiece a rechazarlas.
select
  a.equipo_id,
  a.equipo_label,
  count(*) as activas_que_se_pisan
from asignacion_chofer a
join asignacion_chofer b
  on b.equipo_id = a.equipo_id
 and b.id <> a.id
 and b.estado = 'activa'
 and daterange(b.desde, b.hasta, '[]') && daterange(a.desde, a.hasta, '[]')
where a.estado = 'activa'
group by 1, 2;

begin;

-- ── 1) El detalle opcional ──────────────────────────────────────────
-- `turno` por defecto 'completo': todo lo que ya existe queda como está
-- y sigue significando "el día entero", que es el caso principal.
alter table asignacion_chofer add column if not exists turno text default 'completo';
alter table asignacion_chofer add column if not exists hora_salida text;
alter table asignacion_chofer add column if not exists hora_regreso text;
alter table asignacion_chofer add column if not exists destino text;

update asignacion_chofer
   set turno = 'completo'
 where turno is null or trim(turno) = '';

-- ── 2) Fuera la regla vieja ─────────────────────────────────────────
-- Este índice es justamente lo que impide programar a futuro.
drop index if exists asignacion_chofer_un_activo_por_vehiculo;

-- Para que el disparador busque rápido el choque.
create index if not exists asignacion_chofer_equipo_fechas_idx
  on asignacion_chofer (equipo_id, desde)
  where estado = 'activa';

-- ── 3) La regla nueva ───────────────────────────────────────────────
-- `hasta` nulo = asignación abierta, sin fecha de término. daterange con
-- límite superior nulo es no acotado, que es exactamente eso.
create or replace function asignacion_sin_choque() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  otra record;
begin
  -- Cerrar o cancelar una asignación nunca puede chocar con nada.
  if new.estado is distinct from 'activa' then
    return new;
  end if;
  if new.desde is null then
    raise exception 'La asignación necesita una fecha de inicio.';
  end if;

  select a.chofer_nombre, a.desde, a.hasta, a.turno
    into otra
    from asignacion_chofer a
   where a.equipo_id = new.equipo_id
     and a.id is distinct from new.id
     and a.estado = 'activa'
     and daterange(a.desde, a.hasta, '[]') && daterange(new.desde, new.hasta, '[]')
     and (coalesce(a.turno, 'completo') = 'completo'
       or coalesce(new.turno, 'completo') = 'completo'
       or coalesce(a.turno, 'completo') = coalesce(new.turno, 'completo'))
   order by a.desde
   limit 1;

  if found then
    raise exception 'Ese vehículo ya lo tiene % desde el % %, en turno %.',
      coalesce(otra.chofer_nombre, 'otro chofer'),
      to_char(otra.desde, 'DD-MM-YYYY'),
      case when otra.hasta is null then '(sin fecha de término)'
           else 'hasta el ' || to_char(otra.hasta, 'DD-MM-YYYY') end,
      coalesce(otra.turno, 'completo');
  end if;

  return new;
end $$;

drop trigger if exists asignacion_chofer_sin_choque on asignacion_chofer;
create trigger asignacion_chofer_sin_choque
  before insert or update on asignacion_chofer
  for each row execute function asignacion_sin_choque();

commit;

-- ── Verificación ────────────────────────────────────────────────────
-- 1. Lo que se creó. Las cinco filas deben coincidir.
select 'columna turno' as que, count(*)::text as hay, '1' as esperado
  from information_schema.columns
  where table_schema='public' and table_name='asignacion_chofer' and column_name='turno'
union all select 'columnas hora y destino', count(*)::text, '3'
  from information_schema.columns
  where table_schema='public' and table_name='asignacion_chofer'
    and column_name in ('hora_salida','hora_regreso','destino')
union all select 'funcion asignacion_sin_choque', count(*)::text, '1'
  from pg_proc where proname='asignacion_sin_choque'
union all select 'disparador puesto', count(*)::text, '1'
  from pg_trigger where tgname='asignacion_chofer_sin_choque'
union all select 'indice viejo (debe estar fuera)', count(*)::text, '0'
  from pg_indexes where schemaname='public'
    and indexname='asignacion_chofer_un_activo_por_vehiculo';

-- 2. Ninguna asignación quedó sin turno. Se espera 0.
select count(*) as sin_turno
from asignacion_chofer
where turno is null or trim(turno) = '';

-- ── Después ─────────────────────────────────────────────────────────
-- Movilización ve "Calendario" en su menú: una grilla por vehículo con
-- lo que hay programado, los préstamos y los períodos en taller. Puede
-- programar a futuro sin cerrar lo que está vigente, y el sistema le
-- avisa si lo que agenda cae encima de un paso por el taller.
