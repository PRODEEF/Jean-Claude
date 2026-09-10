-- ═══════════════════════════════════════════════════════════════════════════
-- Tâches — garde-fou de profondeur et d'acyclicité sur `parent_id`
--
-- La migration `task_list_deadline_and_subtasks.sql` a ouvert un second niveau
-- (« deux niveaux et pas davantage ») en affirmant que « la règle est tenue
-- par le service ». Ce n'est vrai que pour `replaceTasks` (l'éditeur) :
-- `PATCH /:id/items/:itemId` écrit `parentId` sans aucune vérification de
-- profondeur ni d'auto-référence. Ce trigger ferme ce chemin, symétrique à
-- `folders_depth_guard` pour les dossiers.
--
-- `MAX_TASK_DEPTH = 1` dans `packages/domain/src/task/task.schema.ts` :
-- une tâche de premier niveau (`parent_id is null`) peut porter des
-- sous-tâches, une sous-tâche ne peut pas en porter elle-même. Duplication
-- assumée avec la constante TypeScript, même raison que pour les dossiers :
-- une fonction SQL ne peut pas la lire, et la base doit tenir quel que soit
-- le chemin d'écriture.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.enforce_task_depth()
returns trigger
language plpgsql
as $fn$
declare
  parent_has_parent boolean;
  has_children       boolean;
begin
  if new.parent_id is null then
    return new;
  end if;

  if new.parent_id = new.id then
    raise exception 'Une tâche ne peut pas être sa propre sous-tâche.';
  end if;

  select (parent_id is not null) into parent_has_parent
    from public.tasks
   where id = new.parent_id;

  -- `parent_has_parent` reste `null` si le parent visé n'existe pas : la
  -- contrainte de clé étrangère s'en charge déjà, ce trigger n'a rien à
  -- ajouter dans ce cas.
  if parent_has_parent then
    raise exception 'Profondeur maximale atteinte : une sous-tâche ne peut pas avoir de sous-tâche.';
  end if;

  -- Symétrique à la vérification de hauteur que `FolderService.update` fait
  -- pour les dossiers : donner un parent à une tâche qui a elle-même des
  -- enfants pousserait ces derniers à un 3ᵉ niveau sans qu'aucune de leurs
  -- lignes ne soit touchée par ce trigger.
  select exists(select 1 from public.tasks where parent_id = new.id) into has_children;

  if has_children then
    raise exception 'Cette tâche a des sous-tâches : elle ne peut pas devenir elle-même une sous-tâche.';
  end if;

  return new;
end;
$fn$;

create trigger tasks_depth_guard
  before insert or update of parent_id on public.tasks
  for each row execute function public.enforce_task_depth();
