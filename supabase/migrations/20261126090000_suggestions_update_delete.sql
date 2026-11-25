-- Nouveaux types de proposition : déplacer un rendez-vous, supprimer un
-- élément, régler l'outil. Aucune colonne ajoutée : seule la contrainte sur `kind` s'élargit.

alter table public.assistant_suggestions
  drop constraint if exists assistant_suggestions_kind_check;

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
    'report_bug',
    'remember',
    'update_event',
    'delete_item',
    'update_settings'
  ));
