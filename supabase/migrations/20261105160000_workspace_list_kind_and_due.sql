-- ═══════════════════════════════════════════════════════════════════════════
-- Type et échéance d'une liste d'espace — alignement sur « Mes listes »
--
-- Une liste d'espace se lit comme une liste personnelle : une icône de type
-- (tâches ou achats) et une échéance portée par la liste entière. Colonnes
-- ajoutées sur la table existante, sans toucher à `task_lists` : leurs règles
-- d'accès restent distinctes.
--
-- `due_all_day` suit le même principe que `task_lists.due_all_day` : on
-- enregistre l'intention (journée ou créneau) plutôt que de la relire dans
-- l'heure de `due_at`, que chaque appareil lit dans son propre fuseau.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.workspace_task_lists
  add column kind        text not null default 'todo' check (kind in ('todo', 'shopping')),
  add column due_at      timestamptz,
  add column due_all_day boolean,
  add constraint workspace_task_lists_due_all_day_pairing
    check ((due_at is null) = (due_all_day is null));
