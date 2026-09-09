-- ═══════════════════════════════════════════════════════════════════════════
-- Nouvelle nature de suggestion : le signalement d'un bug (A.10)
--
-- Le signalement d'un problème technique devient un 4e sujet du canal
-- permanent : le modèle peut désormais l'y proposer comme n'importe quelle
-- autre suggestion (§12.1), plutôt que de rester cantonné à la fenêtre
-- d'avis général posée le 4 septembre. Ceci amende la doctrine de
-- `20260904090000_feedback.sql`, qui tenait `feedback` volontairement hors
-- de portée du modèle : une suggestion `report_bug` acceptée y écrit
-- toujours une ligne, mais seulement après validation explicite de
-- l'utilisateur, jamais depuis un tool_call exécuté directement.
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
    'report_bug'
  ));
