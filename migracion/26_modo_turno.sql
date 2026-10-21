-- ═══════════════════════════════════════════════════════════════════
-- 26_modo_turno.sql
--
-- El interruptor de «Mi turno».
--
-- Mientras la jefatura no dé el visto bueno, el turno de los choferes se
-- registra como siempre: el formulario «Turno Chofer» de la página pública
-- de pautas, que llega a Revisión Bitácora para Calidad. El día que se
-- apruebe, Base del Sistema lo enciende en Configuración → Turno de los
-- choferes, sin tocar código.
--
-- Sin esta columna el sistema funciona igual, con «Mi turno» apagado; solo
-- no se puede encender. Es re-ejecutable. Ejecutar una vez en Supabase
-- (SQL Editor → New query → pegar todo → Run).
-- ═══════════════════════════════════════════════════════════════════

alter table app_config add column if not exists modo_turno text default 'pautas';

-- Verificación: debe decir 1.
select count(*) as columna_modo_turno
from information_schema.columns
where table_schema = 'public' and table_name = 'app_config' and column_name = 'modo_turno';
