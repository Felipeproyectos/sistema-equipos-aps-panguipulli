-- ═══════════════════════════════════════════════════════════════════
-- 23_quien_asigna_roles.sql
--
-- Quién puede dar qué rol, dicho por la base de datos.
--
-- Qué faltaba
-- ───────────
-- La matriz de quién crea a quién ya existía en dos lugares: la pantalla
-- (src/lib/roles.js → QUIEN_CREA_A_QUIEN) y el servidor al crear cuentas
-- (gestionarAcceso.js). Pero la policy `usuario_escribe` deja a un
-- Administrador escribir CUALQUIER fila de `usuario`, con cualquier valor.
-- Desde la consola del navegador, un Administrador podía:
--   · darse a sí mismo el rol de Base del Sistema;
--   · darle a otra persona un rol que la pantalla no le ofrece (Jefe de
--     Taller, Movilización, Monitor…);
--   · cambiar o borrar la ficha de Base del Sistema.
-- La pantalla no lo ofrece, pero una regla que vive solo en la pantalla se
-- salta con la consola.
--
-- Qué hace
-- ────────
-- Un disparador sobre `usuario` que aplica la misma matriz:
--   · Base del Sistema asigna cualquier rol.
--   · Administrador:          admin, encargado_salud, encargado_compras_salud, user
--   · Encargado Movilización: chofer
--   · Encargado Salud:        user
--   · Jefe de Taller:         mecanico, encargado_compras_taller
--   · El resto:               ninguno
-- Solo se modifican fichas de los roles que uno administra (un Administrador
-- no edita la ficha de Base del Sistema ni la de un Jefe de Taller), el rol
-- nuevo tiene que estar en la lista, y nadie cambia su propio rol. Borrar una ficha queda solo para Base del Sistema,
-- igual que ya decía la pantalla (PUEDE_ELIMINAR.usuario).
--
-- El servidor (que usa la llave de servicio, sin usuario detrás) no pasa por
-- esta regla: aplica la misma matriz en su propio código al crear cuentas.
--
-- No cambia a nadie de rol ni borra nada. Ejecutar una vez en Supabase.
-- Es re-ejecutable. Solo depende de mi_rol() y mi_id() (03_policies.sql).
-- ═══════════════════════════════════════════════════════════════════

-- ── Antes: cuántas cuentas hay por rol (solo lectura) ───────────────
select coalesce(role, '(sin rol)') as rol, count(*) as cuentas
from usuario group by 1 order by 1;

begin;

create or replace function roles_que_puede_asignar(quien text)
returns text[]
language sql
immutable
as $$
  select case quien
    when 'admin'                  then array['admin', 'encargado_salud', 'encargado_compras_salud', 'user']
    when 'encargado_movilizacion' then array['chofer']
    when 'encargado_salud'        then array['user']
    when 'jefe_taller'            then array['mecanico', 'encargado_compras_taller']
    else array[]::text[]
  end
$$;

create or replace function usuario_rol_permitido()
returns trigger
language plpgsql
as $$
declare
  quien text := mi_rol();
  permitidos text[] := roles_que_puede_asignar(quien);
begin
  -- Sin usuario detrás (el servidor) o Base del Sistema: sin restricción.
  if quien is null or quien = 'super_admin' then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    raise exception 'Solo Base del Sistema puede borrar la ficha de una persona.';
  end if;

  if tg_op = 'INSERT' then
    if not (coalesce(new.role, '') = any(permitidos)) then
      raise exception 'Tu rol no puede crear cuentas con el rol %.', coalesce(new.role, '(sin rol)');
    end if;
    return new;
  end if;

  -- UPDATE. Solo se tocan fichas de los roles que uno administra: la de Base
  -- del Sistema, la de un Jefe de Taller o la de Movilización no las edita un
  -- Administrador. Una cuenta todavía sin rol sí se puede ordenar.
  if coalesce(old.role, '') <> '' and not (old.role = any(permitidos)) then
    raise exception 'Tu rol no administra cuentas con el rol %.', old.role;
  end if;
  if new.role is distinct from old.role then
    if old.id = mi_id() then
      raise exception 'Nadie puede cambiar su propio rol.';
    end if;
    if not (coalesce(new.role, '') = any(permitidos)) then
      raise exception 'Tu rol no puede asignar el rol %.', coalesce(new.role, '(sin rol)');
    end if;
  end if;
  return new;
end $$;

drop trigger if exists usuario_rol_permitido on usuario;
create trigger usuario_rol_permitido
  before insert or update or delete on usuario
  for each row execute function usuario_rol_permitido();

commit;

-- ── Verificación ────────────────────────────────────────────────────
-- Las dos filas deben coincidir.
select 'funcion de la matriz' as que, count(*)::text as hay, '1' as esperado
  from pg_proc where proname = 'roles_que_puede_asignar'
union all select 'disparador en usuario', count(*)::text, '1'
  from pg_trigger where tgname = 'usuario_rol_permitido';
