-- ═══════════════════════════════════════════════════════════════════════════
-- Événements d'espace — lot 8 de docs/COLLABORATION.md (§10)
--
-- Un événement rattaché à une conversation d'espace s'affiche dans le
-- calendrier de chacun de ses membres, qui peuvent tous le modifier.
--
-- Table à part plutôt qu'une colonne de plus sur `calendar_events`, comme les
-- listes partagées : les requêtes du calendrier personnel s'en remettent à la
-- RLS, qui leur aurait mêlé les événements d'espace, et le prompt personnel lit
-- ce calendrier. L'API fusionne les deux dans la vue calendrier.
--
-- Pas de récurrence : un événement d'espace est ponctuel. Le rappel est commun
-- à tous les membres ; comme pour le calendrier personnel, aucun rappel n'est
-- encore délivré.
-- ═══════════════════════════════════════════════════════════════════════════

create table public.workspace_events (
  id                      uuid primary key default gen_random_uuid(),
  conversation_id         uuid        not null references public.conversations(id) on delete cascade,
  title                   text        not null check (length(trim(title)) between 1 and 120),
  notes                   text        check (notes is null or length(notes) <= 4000),
  starts_at               timestamptz not null,
  ends_at                 timestamptz,
  all_day                 boolean     not null default false,
  reminder_minutes_before integer     check (reminder_minutes_before between 0 and 10080),
  -- `set null` : supprimer son compte n'efface pas ce que l'équipe partage.
  created_by              uuid        references auth.users(id) on delete set null,
  created_by_assistant    boolean     not null default false,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  constraint workspace_events_range_valid check (ends_at is null or ends_at > starts_at)
);

-- Vue calendrier : les événements d'une conversation, par date.
create index workspace_events_conversation_idx
  on public.workspace_events (conversation_id, starts_at);

create trigger workspace_events_touch_updated_at before update on public.workspace_events
  for each row execute function public.touch_updated_at();

alter table public.workspace_events enable row level security;

-- `conversation_members` n'a de lignes que pour les conversations d'espace :
-- un événement ne peut donc naître que dans l'une d'elles.
create policy workspace_events_members on public.workspace_events for all
  using (public.is_conversation_member(conversation_id))
  with check (public.is_conversation_member(conversation_id));

create policy workspace_events_insert_as_self on public.workspace_events
  as restrictive for insert
  with check (created_by = (select auth.uid()));

-- Un événement ne change pas de conversation : il appartient à ceux qui l'ont
-- vu naître.
create function public.keep_event_conversation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.conversation_id <> old.conversation_id then
    raise exception 'Un événement ne change pas de conversation.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger workspace_events_keep_conversation before update on public.workspace_events
  for each row execute function public.keep_event_conversation();

-- ── Propositions de Jean-Claude ─────────────────────────────────────────────
-- Même modèle que `workspace_list_suggestions` : une proposition par message
-- de Jean-Claude, tranchée une fois par n'importe quel membre (§12.1).
create table public.workspace_event_suggestions (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid        not null references public.conversations(id) on delete cascade,
  message_id      uuid        not null unique references public.messages(id) on delete cascade,
  -- `{ title, startsAt, endsAt, allDay, notes }`, déjà validé par l'API.
  payload         jsonb       not null,
  status          text        not null default 'pending'
                              check (status in ('pending', 'accepted', 'dismissed')),
  event_id        uuid        references public.workspace_events(id) on delete set null,
  resolved_by     uuid        references auth.users(id) on delete set null,
  resolved_at     timestamptz,
  created_by      uuid        references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),

  constraint workspace_event_suggestions_resolution check (
    (status = 'pending') = (resolved_at is null)
  )
);

create index workspace_event_suggestions_conversation_idx
  on public.workspace_event_suggestions (conversation_id, created_at);

alter table public.workspace_event_suggestions enable row level security;

create policy workspace_event_suggestions_members on public.workspace_event_suggestions for all
  using (public.is_conversation_member(conversation_id))
  with check (public.is_conversation_member(conversation_id));

create policy workspace_event_suggestions_insert_as_self on public.workspace_event_suggestions
  as restrictive for insert
  with check (created_by = (select auth.uid()));

-- ── Temps réel ───────────────────────────────────────────────────────────────
-- La carte de proposition naît juste après le message de Jean-Claude : même
-- raison que pour les listes proposées. Les événements eux-mêmes n'ont pas
-- besoin d'être publiés : chaque geste laisse un message dans le fil, qui
-- prévient déjà les membres. Sans effet sur un Postgres nu (§8).
do $do$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'workspace_event_suggestions'
     )
  then
    alter publication supabase_realtime add table public.workspace_event_suggestions;
  end if;
end;
$do$;
