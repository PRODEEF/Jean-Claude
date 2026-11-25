-- ═══════════════════════════════════════════════════════════════════════════
-- Point du matin (étape 4a du plan « cerveau »)
--
-- Retient qu'un point du matin est parti pour un utilisateur et un jour local,
-- pour qu'il n'y en ait qu'un par jour même si le planificateur passe plusieurs
-- fois dans la plage du matin.
--
-- Comme `reminders_sent`, aucune policy : seul le planificateur y accède, avec la
-- clé de service. Idempotent.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.morning_briefs_sent (
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Jour civil dans le fuseau de l'utilisateur, au moment de l'envoi.
  day     date not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, day)
);

alter table public.morning_briefs_sent enable row level security;
