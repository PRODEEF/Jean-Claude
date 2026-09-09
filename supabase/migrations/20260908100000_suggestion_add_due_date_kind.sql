-- ═══════════════════════════════════════════════════════════════════════════
-- Contrainte de kind manquante pour la reprogrammation de todoliste
--
-- `update_task_list_due_date` a rejoint les natures de suggestion valides côté
-- application (packages/domain/src/assistant/assistant.schema.ts) sans que la
-- contrainte CHECK de la table ne soit mise à jour en conséquence : toute
-- tentative de persister cette suggestion échouait en base, et comme la
-- capture de plusieurs suggestions du même tour n'isolait pas ses erreurs,
-- cet échec interrompait aussi la capture des suggestions suivantes.
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
    'update_task_list_due_date'
  ));
