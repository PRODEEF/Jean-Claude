-- ═══════════════════════════════════════════════════════════════════════════
-- Listes proposées par Jean-Claude dans une conversation d'espace
--
-- L'assistant propose, il n'exécute pas (§12.1). Quand une conversation
-- d'espace fait émerger qui fait quoi, Jean-Claude propose une liste partagée ;
-- n'importe quel membre de la conversation l'accepte — elle devient une liste
-- de l'espace — ou l'ignore.
--
-- Table à part plutôt que `assistant_suggestions` : celle-ci est personnelle
-- (lue par son seul propriétaire), alors qu'une proposition faite dans une
-- conversation d'espace se lit et se tranche par tous ses membres.
-- ═══════════════════════════════════════════════════════════════════════════

create table public.workspace_list_suggestions (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid        not null references public.conversations(id) on delete cascade,
  -- Le message de Jean-Claude qui porte la proposition : une par message.
  message_id      uuid        not null unique references public.messages(id) on delete cascade,
  -- `{ title, tasks: [{ title, assigneeId }] }`, déjà validé par l'API.
  payload         jsonb       not null,
  status          text        not null default 'pending'
                              check (status in ('pending', 'accepted', 'dismissed')),
  list_id         uuid        references public.workspace_task_lists(id) on delete set null,
  resolved_by     uuid        references auth.users(id) on delete set null,
  resolved_at     timestamptz,
  created_by      uuid        references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),

  constraint workspace_list_suggestions_resolution check (
    (status = 'pending') = (resolved_at is null)
  )
);

create index workspace_list_suggestions_conversation_idx
  on public.workspace_list_suggestions (conversation_id, created_at);

alter table public.workspace_list_suggestions enable row level security;

create policy workspace_list_suggestions_members on public.workspace_list_suggestions for all
  using (public.is_conversation_member(conversation_id))
  with check (public.is_conversation_member(conversation_id));

create policy workspace_list_suggestions_insert_as_self on public.workspace_list_suggestions
  as restrictive for insert
  with check (created_by = (select auth.uid()));
