-- ═══════════════════════════════════════════════════════════════════════════
-- Nouvelle nature de suggestion : plusieurs rendez-vous ponctuels en un
-- seul appel (A.3)
--
-- `create_recurring_event` ne pose qu'une série récurrente. Rien ne
-- permettait à l'assistant de proposer plusieurs rendez-vous ponctuels
-- distincts en une seule proposition — le modèle devait soit les fusionner à
-- tort dans une série, soit les proposer un par un. `create_events` porte ce
-- geste : une entrée par rendez-vous dans une seule charge utile, toujours
-- sous validation explicite (§12.1).
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.assistant_suggestions
  drop constraint assistant_suggestions_kind_check;

alter table public.assistant_suggestions
  add constraint assistant_suggestions_kind_check check (kind in (
    'create_task_list',
    'add_task_list_items',
    'schedule_task',
    'assign_folders',
    'create_project_folders',
    'create_recurring_event',
    'create_events',
    'update_task_list_due_date',
    'update_task_list_items',
    'report_bug'
  ));
