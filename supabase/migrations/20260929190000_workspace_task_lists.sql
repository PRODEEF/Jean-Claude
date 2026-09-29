-- ═══════════════════════════════════════════════════════════════════════════
-- Listes partagées d'un espace d'équipe — docs/COLLABORATION.md
--
-- Tables à part, et non une colonne de plus sur `task_lists` : les listes
-- personnelles portent échéances, sous-tâches et créneaux de calendrier, et
-- leurs requêtes s'en remettent à la RLS pour ne voir que les siennes. Une
-- liste d'espace n'a besoin que d'un titre, de tâches cochables et d'un
-- responsable par tâche.
--
-- Chaque tâche s'écrit à part : deux membres qui cochent en même temps ne
-- s'écrasent pas, contrairement à `PUT /tasks/:id/items`.
--
-- `created_by` est en `set null` : supprimer son compte ne fait pas disparaître
-- ce que l'équipe partage.
-- ═══════════════════════════════════════════════════════════════════════════

create table public.workspace_task_lists (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid        not null references public.workspaces(id) on delete cascade,
  title           text        not null check (length(trim(title)) between 1 and 120),
  -- Un seul dossier, comme une liste personnelle.
  folder_id       uuid        references public.folders(id) on delete set null,
  -- Conversation d'où vient la liste, quand Jean-Claude l'a proposée.
  conversation_id uuid        references public.conversations(id) on delete set null,
  created_by      uuid        references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index workspace_task_lists_workspace_idx
  on public.workspace_task_lists (workspace_id, created_at desc);

create table public.workspace_tasks (
  id           uuid primary key default gen_random_uuid(),
  list_id      uuid        not null references public.workspace_task_lists(id) on delete cascade,
  title        text        not null check (length(trim(title)) between 1 and 120),
  done         boolean     not null default false,
  completed_at timestamptz,
  -- Le responsable ; `null` = personne en particulier.
  assignee_id  uuid        references auth.users(id) on delete set null,
  position     integer     not null default 0,
  created_by   uuid        references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index workspace_tasks_list_idx on public.workspace_tasks (list_id, position);

create trigger workspace_task_lists_touch_updated_at before update on public.workspace_task_lists
  for each row execute function public.touch_updated_at();
create trigger workspace_tasks_touch_updated_at before update on public.workspace_tasks
  for each row execute function public.touch_updated_at();

-- ── Accès ───────────────────────────────────────────────────────────────────
create function public.is_workspace_list_member(p_list uuid) returns boolean
  language sql stable security definer
  set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_task_lists l
      join public.workspace_members wm on wm.workspace_id = l.workspace_id
     where l.id = p_list and wm.user_id = (select auth.uid())
  );
$$;

revoke execute on function public.is_workspace_list_member(uuid) from public, anon;
grant execute on function public.is_workspace_list_member(uuid) to authenticated;

alter table public.workspace_task_lists enable row level security;
alter table public.workspace_tasks      enable row level security;

create policy workspace_task_lists_members on public.workspace_task_lists for all
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

create policy workspace_task_lists_insert_as_self on public.workspace_task_lists
  as restrictive for insert
  with check (created_by = (select auth.uid()));

create policy workspace_tasks_members on public.workspace_tasks for all
  using (public.is_workspace_list_member(list_id))
  with check (public.is_workspace_list_member(list_id));

create policy workspace_tasks_insert_as_self on public.workspace_tasks
  as restrictive for insert
  with check (created_by = (select auth.uid()));

-- ── Invariants structurels ──────────────────────────────────────────────────
-- Une liste reste dans son espace, et ne se range que dans un dossier de cet
-- espace ; sa conversation d'origine en vient aussi. `security definer` : le
-- dossier et la conversation doivent être lus tels qu'ils sont.
create function public.keep_workspace_list_in_space()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if tg_op = 'UPDATE' and new.workspace_id is distinct from old.workspace_id then
    raise exception 'Une liste ne change pas d''espace.';
  end if;

  if new.folder_id is not null and not exists (
    select 1 from public.folders f
     where f.id = new.folder_id and f.workspace_id = new.workspace_id
  ) then
    raise exception 'Une liste d''espace se range dans un dossier du même espace.';
  end if;

  if new.conversation_id is not null and not exists (
    select 1 from public.conversations c
     where c.id = new.conversation_id and c.workspace_id = new.workspace_id
  ) then
    raise exception 'La conversation d''origine appartient au même espace.';
  end if;

  return new;
end;
$fn$;

create trigger workspace_task_lists_keep_space
  before insert or update on public.workspace_task_lists
  for each row execute function public.keep_workspace_list_in_space();

-- Le responsable d'une tâche est membre de l'espace de sa liste.
create function public.keep_workspace_task_assignee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if new.assignee_id is not null and not exists (
    select 1 from public.workspace_task_lists l
      join public.workspace_members wm on wm.workspace_id = l.workspace_id
     where l.id = new.list_id and wm.user_id = new.assignee_id
  ) then
    raise exception 'Le responsable d''une tâche est membre de l''espace.';
  end if;

  if tg_op = 'UPDATE' and new.list_id is distinct from old.list_id then
    raise exception 'Une tâche ne change pas de liste.';
  end if;

  return new;
end;
$fn$;

create trigger workspace_tasks_keep_assignee
  before insert or update on public.workspace_tasks
  for each row execute function public.keep_workspace_task_assignee();

-- Quitter un espace, c'est n'y être plus responsable de rien : ses tâches
-- redeviennent libres plutôt que d'afficher un ancien membre.
create function public.release_workspace_tasks()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  update public.workspace_tasks t
     set assignee_id = null
    from public.workspace_task_lists l
   where l.id = t.list_id
     and l.workspace_id = old.workspace_id
     and t.assignee_id = old.user_id;
  return old;
end;
$fn$;

create trigger workspace_members_release_tasks
  after delete on public.workspace_members
  for each row execute function public.release_workspace_tasks();

-- Fonctions de trigger : jamais appelées directement.
revoke execute on function public.keep_workspace_list_in_space() from public, anon, authenticated;
revoke execute on function public.keep_workspace_task_assignee() from public, anon, authenticated;
revoke execute on function public.release_workspace_tasks() from public, anon, authenticated;
