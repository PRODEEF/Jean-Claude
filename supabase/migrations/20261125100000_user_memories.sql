-- ═══════════════════════════════════════════════════════════════════════════
-- Ce que Jean-Claude retient de l'utilisateur
--
-- Un goût, une habitude, une contrainte : une phrase par ligne, que l'assistant
-- ne pose qu'après que l'utilisateur a accepté sa proposition (§12.1), et que
-- l'utilisateur relit, corrige et supprime depuis « Ce que Jean-Claude sait de
-- moi ». Suppression en cascade avec le compte (§8, §13.4.6).
--
-- Ajoute aussi la nature de suggestion `remember`.
--
-- Idempotent.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.user_memories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  content     text        not null check (char_length(content) between 1 and 300),
  source      text        not null default 'assistant' check (source in ('assistant', 'user')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists user_memories_user_created_idx
  on public.user_memories (user_id, created_at desc);

alter table public.user_memories enable row level security;

do $do$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'user_memories'
       and policyname = 'user_memories_owner'
  ) then
    create policy user_memories_owner on public.user_memories
      for all to authenticated
      using (user_id = auth.uid())
      with check (user_id = auth.uid());
  end if;
end;
$do$;

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
    'remember'
  ));
