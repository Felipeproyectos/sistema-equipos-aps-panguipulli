-- ═══════════════════════════════════════════════════════════════════
-- 09_borrar_campos_muertos.sql
--
-- Borra de `usuario` cuatro columnas heredadas de Base44 que en Supabase no
-- escribe ni lee nadie. Estaban ahí aparentando un control de acceso que no
-- existe, y era cuestión de tiempo que alguien las tocara creyendo que hacían
-- algo:
--
--   estado_acceso     El "aprobar ingreso" de Base44 ('pendiente' /
--                     'aprobado' / 'rechazado'). Todas las fichas quedaron en
--                     'aprobado'. Ninguna pantalla, función del servidor ni
--                     policy lo consulta. Su único uso vivo era ordenar la
--                     lista de Usuarios, poniendo primero a los 'pendiente'
--                     que nunca existieron.
--   intentos_acceso   Contador de intentos fallidos mientras la ficha estaba
--                     pendiente. Nada lo incrementa; todas están en 0.
--   disabled          Desactivar una cuenta. Nunca se conectó a nada.
--   disabled_reason   El motivo del anterior. Sin el anterior, no significa
--                     nada.
--
-- Quién puede entrar lo decide Supabase Auth (si existe la cuenta y su clave).
-- Qué ve una vez dentro lo deciden `role` y las policies de 03_policies.sql
-- vía mi_rol(). Para dar de baja a alguien se le quita la cuenta de Auth, no
-- se marca una casilla en esta tabla.
--
-- Es reversible mientras no se ejecute: las cuatro columnas están en blanco o
-- con el mismo valor en todas las filas, así que no se pierde información. Aun
-- así, el bloque 1 imprime lo que hay ANTES de borrar — conviene mirarlo.
--
-- Ejecutar una sola vez en Supabase (SQL Editor), DESPUÉS de desplegar el
-- código que deja de mencionarlas. Si se ejecuta antes, la pantalla de
-- Usuarios seguiría pidiendo `estado_acceso` en su orden y lo recibiría como
-- nulo: ordenaría alfabético igual, sin romperse, pero mejor en orden.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1) Qué hay hoy en esas columnas (solo lectura, para dejar registro) ─────
select
  count(*)                                              as fichas,
  count(estado_acceso)                                  as con_estado_acceso,
  count(*) filter (where estado_acceso <> 'aprobado')   as estado_distinto_de_aprobado,
  count(*) filter (where coalesce(intentos_acceso, 0) <> 0) as con_intentos,
  count(*) filter (where disabled is true)              as desactivados,
  count(disabled_reason)                                as con_motivo
from usuario;

-- Si "estado_distinto_de_aprobado", "con_intentos" o "desactivados" no dan
-- CERO, detente acá y revisa esas filas antes de seguir: significaría que
-- alguien sí las estaba usando.
select id, email, role, estado_acceso, intentos_acceso, disabled, disabled_reason
from usuario
where coalesce(estado_acceso, 'aprobado') <> 'aprobado'
   or coalesce(intentos_acceso, 0) <> 0
   or disabled is true
   or disabled_reason is not null;

-- ── 2) Borrar las columnas ──────────────────────────────────────────────────
begin;

alter table usuario drop column if exists estado_acceso;
alter table usuario drop column if exists intentos_acceso;
alter table usuario drop column if exists disabled;
alter table usuario drop column if exists disabled_reason;

commit;

-- ── 3) Verificación ─────────────────────────────────────────────────────────
-- Debe devolver CERO filas.
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'usuario'
  and column_name in ('estado_acceso', 'intentos_acceso', 'disabled', 'disabled_reason');

-- Y las que quedan, para confirmar que no se llevó nada por delante.
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'usuario'
order by ordinal_position;
