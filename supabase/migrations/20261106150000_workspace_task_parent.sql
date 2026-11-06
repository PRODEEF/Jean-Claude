-- Sous-tâches d'une liste d'espace : une tâche peut avoir une tâche parente.
-- Un seul niveau, comme les listes personnelles : le service refuse une
-- sous-tâche de sous-tâche (une contrainte SQL ne saurait pas le dire sans
-- trigger). La suppression d'une tâche emporte ses sous-tâches.
alter table public.workspace_tasks
  add column if not exists parent_id uuid references public.workspace_tasks (id) on delete cascade;

create index if not exists workspace_tasks_parent_idx on public.workspace_tasks (parent_id);
