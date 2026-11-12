-- ═══════════════════════════════════════════════════════════════════════════
-- Fusion rendez-vous et todo — étape 1 : la base (additive)
--
-- Un rendez-vous devient un todo simple : une liste sans sous-tâche. Pour qu'une
-- liste puisse tout porter de ce que portait un rendez-vous, elle gagne :
--   · `ends_at`                 heure de fin (`due_at` est le début) ;
--   · `rrule`                   répétition, au format RRULE comme `calendar_events` ;
--   · `reminder_minutes_before` rappel avant chaque occurrence ;
--   · `done_at`                 « fait » propre à la liste : une liste sans tâche
--                               n'a rien dont déduire qu'elle est faite.
--
-- Rien ne lit encore ces colonnes et rien ne change à l'écran : l'existant ne
-- casse pas. Les droits (RLS) de `task_lists` couvrent déjà les nouvelles colonnes.
-- Idempotent.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.task_lists
  add column if not exists ends_at                 timestamptz,
  add column if not exists rrule                   text,
  add column if not exists reminder_minutes_before integer,
  add column if not exists done_at                 timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'task_lists_reminder_valid'
  ) then
    alter table public.task_lists
      add constraint task_lists_reminder_valid
      check (reminder_minutes_before is null or reminder_minutes_before between 0 and 10080);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'task_lists_range_valid'
  ) then
    alter table public.task_lists
      add constraint task_lists_range_valid
      check (ends_at is null or due_at is null or ends_at > due_at);
  end if;
end $$;

-- Les séries sont chargées entièrement puis développées : un index partiel évite
-- de les chercher parmi les listes ponctuelles.
create index if not exists task_lists_recurring_idx
  on public.task_lists (user_id) where rrule is not null;
