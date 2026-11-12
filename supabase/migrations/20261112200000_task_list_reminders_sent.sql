-- ═══════════════════════════════════════════════════════════════════════════
-- Fusion rendez-vous et todo — étape 4c : les rappels d'une liste
--
-- `reminders_sent` retient les rappels déjà envoyés, par occurrence et par canal,
-- mais sa clé étrangère vise `calendar_events` : elle ne peut pas recevoir celui
-- d'une liste. Plutôt que de défaire cette clé — qui nettoie la table quand un
-- rendez-vous disparaît —, une table jumelle, même forme, qui vise `task_lists`.
--
-- Comme `reminders_sent`, aucune policy : seul le planificateur y accède, avec la
-- clé de service. Rien ne l'écrit tant qu'aucune liste ne porte de rappel.
-- Idempotent.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.task_list_reminders_sent (
  list_id       uuid        not null references public.task_lists (id) on delete cascade,
  -- Début de l'occurrence rappelée : une série en a une par date.
  occurrence_at timestamptz not null,
  channel       text        not null check (channel in ('assistant_channel', 'email', 'push')),
  sent_at       timestamptz not null default now(),
  primary key (list_id, occurrence_at, channel)
);

alter table public.task_list_reminders_sent enable row level security;
