-- ═══════════════════════════════════════════════════════════════════════════
-- Fusion rendez-vous et todo — étape 3b : conversion des rendez-vous en todos
--
-- À JOUER AU BASCULEMENT, PAS AVANT. Ce n'est pas une migration : elle n'est pas
-- dans `supabase/migrations/` pour qu'on ne la colle pas par réflexe.
--
-- Pourquoi pas tout de suite : tant que les écrans lisent encore `calendar_events`,
-- chaque rendez-vous converti apparaîtrait deux fois (l'événement et sa liste),
-- et la liste s'afficherait dans « Mes listes » comme une liste vide.
--
-- Prérequis : `20261112170000`, `20261112180000` et `20261112190000` appliquées.
--
-- Règles de conversion (décisions de Yann, 12 novembre) :
--   · un rendez-vous devient une liste sans tâche, à la même date, avec ses notes,
--     sa répétition, son rappel, son dossier et sa conversation d'origine ;
--   · sans heure de fin et pas « toute la journée », la durée par défaut est 1 h ;
--   · un rendez-vous déjà représenté par une liste (`task_lists.event_id`) n'est
--     pas recréé : la liste existante reçoit ce qui lui manque, sans l'écraser ;
--   · rejouable : un rendez-vous déjà converti est ignoré (`source_event_id`).
--     Rejouer au basculement convertit ceux créés entre-temps ; une modification
--     faite sur un rendez-vous déjà converti n'est pas reportée.
--
-- Les événements d'espace partagé (`workspace_events`) ne sont pas concernés.
-- Les rendez-vous ne sont PAS supprimés ici : c'est l'étape 6.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- 1. Une liste déjà liée à un rendez-vous le représente : on lui donne la fin, la
--    répétition, le rappel et les notes, seulement là où elle n'a rien.
update public.task_lists as l
   set ends_at                 = coalesce(l.ends_at, e.ends_at),
       rrule                   = coalesce(l.rrule, e.rrule),
       reminder_minutes_before = coalesce(l.reminder_minutes_before, e.reminder_minutes_before),
       notes                   = coalesce(l.notes, e.notes),
       source_event_id         = e.id
  from public.calendar_events as e
 where l.event_id = e.id
   and l.source_event_id is null
   -- `task_lists_range_valid` : une fin ne précède jamais le début de la liste.
   and (e.ends_at is null or l.due_at is null or e.ends_at > l.due_at);

-- 2. Tous les autres rendez-vous deviennent une liste.
insert into public.task_lists (
  user_id, title, kind, due_at, due_all_day, ends_at, rrule, reminder_minutes_before,
  notes, folder_id, conversation_id, created_by_assistant, source_event_id,
  created_at, updated_at
)
select e.user_id,
       e.title,
       'todo',
       e.starts_at,
       e.all_day,
       case
         when e.ends_at is not null then e.ends_at
         when e.all_day then null
         else e.starts_at + interval '1 hour'
       end,
       e.rrule,
       e.reminder_minutes_before,
       e.notes,
       e.folder_id,
       e.conversation_id,
       e.created_by_assistant,
       e.id,
       e.created_at,
       e.updated_at
  from public.calendar_events as e
 where not exists (select 1 from public.task_lists l where l.source_event_id = e.id)
   and not exists (select 1 from public.task_lists l where l.event_id = e.id);

commit;

-- Contrôle : doit renvoyer 0 ligne.
select e.id, e.title
  from public.calendar_events as e
 where not exists (
   select 1 from public.task_lists l where l.source_event_id = e.id or l.event_id = e.id
 );
