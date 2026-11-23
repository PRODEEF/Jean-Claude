-- ═══════════════════════════════════════════════════════════════════════════
-- Vue du calendrier à l'ouverture
--
-- `profiles.calendar_default_view` : la vue sur laquelle le calendrier s'ouvre
-- à chaque arrivée. Todo par défaut — c'est la vue de travail du quotidien.
-- Idempotent.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.profiles
  add column if not exists calendar_default_view text not null default 'todo'
  check (calendar_default_view in ('day', 'week', 'month', 'year', 'todo'));
