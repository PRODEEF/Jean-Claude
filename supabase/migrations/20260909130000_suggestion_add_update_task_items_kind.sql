-- ═══════════════════════════════════════════════════════════════════════════
-- Nouvelle nature de suggestion : modifier les lignes d'une todoliste (A.2)
--
-- `add_task_list_items` ne sait qu'ajouter. Sans un geste pour cocher ou
-- renommer une ligne déjà née du fil, le modèle recréait une liste homonyme
-- dès qu'on lui demandait de marquer une tâche faite. `update_task_list_items`
-- porte ce geste, toujours sous validation explicite (§12.1).
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
    'update_task_list_due_date',
    'update_task_list_items',
    'report_bug'
  ));
