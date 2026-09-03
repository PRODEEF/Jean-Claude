-- ═══════════════════════════════════════════════════════════════════════════
-- L'échéance passe de la tâche à la liste, et les tâches gagnent un niveau
--
-- Une deadline concerne l'ensemble d'une todoliste — « les courses avant
-- samedi », « le dossier MDPH pour le 15 » — et non une de ses lignes. La
-- porter ligne par ligne obligeait à répéter la même date sur chaque item et
-- rendait impossible de dire qu'une liste, comme tout, arrive à échéance.
--
-- `event_id` suit le même déplacement : le créneau posé dans l'agenda (A.3)
-- vaut désormais pour la liste entière, et c'est ce lien qui évite d'afficher
-- deux fois la même échéance dans le calendrier — la liste et son créneau.
--
-- `parent_id` ouvre un second niveau dans une liste : « Peindre la chambre »
-- porte « acheter le rouleau » et « poncer ». Deux niveaux et pas davantage —
-- c'est la profondeur de Things 3 et de Todoist, et la règle est tenue par le
-- service : une tâche qui a un parent ne peut pas en être un.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.task_lists
  add column due_at  timestamptz,
  add column event_id uuid references public.calendar_events(id) on delete set null;

-- Les échéances déjà posées ne sont pas perdues : la liste hérite de la plus
-- proche de ses tâches, qui est celle à laquelle elle devait être bouclée.
update public.task_lists as l
   set due_at = sub.due_at
  from (
    select list_id, min(due_at) as due_at
      from public.tasks
     where due_at is not null
     group by list_id
  ) as sub
 where sub.list_id = l.id;

alter table public.tasks
  add column parent_id uuid references public.tasks(id) on delete cascade;

drop index if exists public.tasks_due_idx;

alter table public.tasks
  drop column due_at,
  drop column event_id;

-- Les enfants d'une tâche se lisent toujours ensemble, dans l'ordre de la liste.
create index tasks_parent_idx on public.tasks (parent_id, position) where parent_id is not null;

-- Ce que porte la semaine : les listes non bouclées, du plus proche au plus loin.
create index task_lists_due_idx on public.task_lists (user_id, due_at) where due_at is not null;
