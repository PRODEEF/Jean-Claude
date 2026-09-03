-- ═══════════════════════════════════════════════════════════════════════════
-- Une proposition de plus : compléter une todoliste existante
--
-- L'assistant savait créer une liste, jamais en enrichir une. « Complète la
-- liste » n'avait donc qu'un outil à sa portée — celui qui en crée une — et il
-- reproposait la même liste indéfiniment, faute de pouvoir faire ce qu'on lui
-- demandait.
--
-- `kind` porte une contrainte CHECK plutôt qu'un type énuméré : une valeur s'y
-- ajoute sans réécrire le type, et les lignes déjà stockées restent lisibles.
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
    'create_recurring_event'
  ));
