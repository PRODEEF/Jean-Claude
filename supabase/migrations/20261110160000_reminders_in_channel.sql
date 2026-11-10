-- ═══════════════════════════════════════════════════════════════════════════
-- Rappels de rendez-vous dans le canal permanent Jean-Claude
--
-- Deux ajouts, idempotents :
--   1. `profiles.remind_in_channel` : l'utilisateur veut-il que Jean-Claude lui
--      écrive dans son canal à l'heure d'un rappel ? Vrai par défaut — un
--      rappel n'existe que si l'utilisateur en a demandé un.
--   2. `reminders_sent` : un rappel déjà envoyé, par occurrence et par canal.
--      Le planificateur repasse sur une fenêtre plus large que sa cadence pour
--      ne rien rater ; cette table l'empêche d'écrire deux fois le même rappel.
--
-- `reminders_sent` n'a aucune policy : seul le planificateur y accède, avec la
-- clé de service. Aucun utilisateur n'a à la lire ni à l'écrire.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.profiles
  add column if not exists remind_in_channel boolean not null default true;

create table if not exists public.reminders_sent (
  event_id      uuid        not null references public.calendar_events (id) on delete cascade,
  -- Début de l'occurrence rappelée : une série en a une par date.
  occurrence_at timestamptz not null,
  channel       text        not null check (channel in ('assistant_channel', 'email', 'push')),
  sent_at       timestamptz not null default now(),
  primary key (event_id, occurrence_at, channel)
);

alter table public.reminders_sent enable row level security;
