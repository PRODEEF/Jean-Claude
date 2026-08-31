-- ═══════════════════════════════════════════════════════════════════════════
-- Jean-Claude — schéma initial
--
-- Principes retenus :
--   • Tout est scopé par `user_id` et protégé par RLS dès la V1. L'usage est
--     mono-utilisateur (§2) mais le schéma n'aura pas à être repris pour
--     l'ouverture multi-utilisateurs.
--   • Postgres standard, sans extension propriétaire : la migration vers un
--     hébergement UE (§8) reste un simple `pg_dump` / `pg_restore`.
--   • Les suppressions en cascade suivent la possession : supprimer un compte
--     supprime toutes ses données (exigence RGPD, §8 et §13.4.6).
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";
-- Recherche plein texte insensible à la casse et aux accents (A.6).
create extension if not exists "unaccent";

-- ───────────────────────────────────────────────────────────────────────────
-- Profils & préférences
-- ───────────────────────────────────────────────────────────────────────────

create table public.profiles (
  id                      uuid primary key references auth.users(id) on delete cascade,
  display_name            text,
  -- Contexte stable appris à l'onboarding (§6.3) puis enrichi au fil de l'eau.
  -- Distinct du contexte ponctuel, porté par les conversations (§13.4.2).
  memory                  text,
  onboarding_completed_at timestamptz,

  -- Panneau de paramètres de la maquette.
  assistant_name          text        not null default 'Jean-Claude',
  assistant_color         text        not null default '#6366F1',
  theme                   text        not null default 'system'
                                      check (theme in ('light', 'dark', 'system')),
  timezone                text        not null default 'Europe/Paris',
  speak_responses         boolean     not null default false,

  -- Bornage du mode assistant (A.10). En jsonb plutôt qu'en colonnes : les
  -- capacités de l'assistant vont s'étoffer, chacune ne mérite pas une migration.
  assistant_scope         jsonb       not null default '{
                            "morningReminders": true,
                            "folderOrganization": true,
                            "structureSuggestions": true,
                            "proactiveTaskDetection": true,
                            "proactiveScheduling": true
                          }'::jsonb,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- ───────────────────────────────────────────────────────────────────────────
-- Dossiers — 2 niveaux en V1 (§3 Phase A)
-- ───────────────────────────────────────────────────────────────────────────

create table public.folders (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid        not null references auth.users(id) on delete cascade,
  parent_id             uuid        references public.folders(id) on delete cascade,
  name                  text        not null check (length(trim(name)) between 1 and 120),
  -- Regroupement Perso/Pro (A.0) : colonne présente, non exploitée en V1.
  category              text        check (category in ('personal', 'professional')),
  -- Sous-dossiers automatiques de projet (A.4).
  purpose               text        not null default 'generic'
                                    check (purpose in ('generic', 'idea', 'todo', 'purchase', 'appointment')),
  color                 text,
  position              integer     not null default 0,
  created_by_assistant  boolean     not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint folders_name_unique_per_parent unique nulls not distinct (user_id, parent_id, name)
);

create index folders_user_parent_idx on public.folders (user_id, parent_id, position);

-- Garde-fou d'arborescence : un dossier dont le parent a déjà un parent
-- créerait un 3e niveau, non prévu en V1. Implémenté en trigger car une
-- contrainte CHECK ne peut pas interroger une autre ligne.
create or replace function public.enforce_folder_depth()
returns trigger
language plpgsql
as $fn$
begin
  if new.parent_id is not null
     and exists (select 1 from public.folders where id = new.parent_id and parent_id is not null)
  then
    raise exception 'Profondeur maximale atteinte : arborescence limitée à 2 niveaux (V1).';
  end if;
  return new;
end;
$fn$;

create trigger folders_depth_guard
  before insert or update of parent_id on public.folders
  for each row execute function public.enforce_folder_depth();

-- ───────────────────────────────────────────────────────────────────────────
-- Conversations & messages
-- ───────────────────────────────────────────────────────────────────────────

create table public.conversations (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid        not null references auth.users(id) on delete cascade,
  kind            text        not null default 'chat' check (kind in ('chat', 'assistant')),
  title           text        not null default 'Nouvelle conversation',
  archived_at     timestamptz,
  last_message_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Le canal permanent Jean-Claude est unique par utilisateur (A.10).
create unique index conversations_one_assistant_channel_idx
  on public.conversations (user_id)
  where kind = 'assistant';

create index conversations_user_recent_idx
  on public.conversations (user_id, last_message_at desc nulls last);

-- ═══ Rangement matriciel (§5.2, A.1) ═══════════════════════════════════════
-- Table de liaison, et non une colonne `folder_id` sur `conversations` :
-- une conversation sur l'assurance auto doit être visible depuis « Véhicule »
-- ET depuis « Administratif > Assurances », sans être dupliquée.
create table public.conversation_folders (
  conversation_id uuid        not null references public.conversations(id) on delete cascade,
  folder_id       uuid        not null references public.folders(id) on delete cascade,
  -- 'assistant' = classement automatique, 'user' = choix manuel.
  -- Une correction manuelle d'un classement automatique est le signal
  -- d'apprentissage de la logique de rangement de l'utilisateur (A.7).
  source          text        not null default 'user' check (source in ('user', 'assistant')),
  created_at      timestamptz not null default now(),

  primary key (conversation_id, folder_id)
);

create index conversation_folders_folder_idx on public.conversation_folders (folder_id);

create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid        not null references public.conversations(id) on delete cascade,
  user_id         uuid        not null references auth.users(id) on delete cascade,
  role            text        not null check (role in ('user', 'assistant', 'system')),
  content         text        not null,
  input_mode      text        not null default 'text' check (input_mode in ('text', 'voice')),
  -- Traçabilité multi-modèle (§5.1) : quel fournisseur a produit quelle réponse.
  provider        text,
  model           text,
  created_at      timestamptz not null default now()
);

create index messages_conversation_idx on public.messages (conversation_id, created_at);

-- Index de recherche plein texte en français (A.6).
create index messages_content_fts_idx
  on public.messages using gin (to_tsvector('french', content));

create index conversations_title_fts_idx
  on public.conversations using gin (to_tsvector('french', title));

-- ───────────────────────────────────────────────────────────────────────────
-- Todolistes (A.2) — `kind` sépare liste d'achats et liste de tâches (§12.1)
-- ───────────────────────────────────────────────────────────────────────────

create table public.task_lists (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid        not null references auth.users(id) on delete cascade,
  title                text        not null check (length(trim(title)) between 1 and 120),
  kind                 text        not null default 'todo' check (kind in ('todo', 'shopping')),
  -- Conversation d'origine quand la liste vient d'une conversion (A.2).
  -- `set null` : supprimer la conversation ne doit pas détruire la todoliste.
  conversation_id      uuid        references public.conversations(id) on delete set null,
  -- La liste reste visible dans son dossier thématique (A.2).
  folder_id            uuid        references public.folders(id) on delete set null,
  created_by_assistant boolean     not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index task_lists_user_idx on public.task_lists (user_id, updated_at desc);
create index task_lists_folder_idx on public.task_lists (folder_id);

-- ───────────────────────────────────────────────────────────────────────────
-- Calendrier (A.11) — récurrence au format RRULE (RFC 5545)
-- ───────────────────────────────────────────────────────────────────────────

create table public.calendar_events (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid        not null references auth.users(id) on delete cascade,
  title                   text        not null check (length(trim(title)) between 1 and 120),
  notes                   text,
  starts_at               timestamptz not null,
  ends_at                 timestamptz,
  all_day                 boolean     not null default false,
  -- `null` = ponctuel. Renseigné = série récurrente, ex. 'FREQ=WEEKLY;BYDAY=TU'.
  -- Les occurrences ne sont pas matérialisées : elles sont calculées à la volée
  -- sur la fenêtre consultée, une série étant potentiellement infinie.
  rrule                   text,
  -- Rappel automatique avant chaque occurrence, sans ressaisie (A.11).
  reminder_minutes_before integer     check (reminder_minutes_before between 0 and 10080),
  folder_id               uuid        references public.folders(id) on delete set null,
  conversation_id         uuid        references public.conversations(id) on delete set null,
  created_by_assistant    boolean     not null default false,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  constraint calendar_events_range_valid check (ends_at is null or ends_at > starts_at)
);

create index calendar_events_user_range_idx on public.calendar_events (user_id, starts_at);
-- Les séries récurrentes sont chargées entièrement puis expansées : un index
-- partiel évite de les balayer avec les événements ponctuels.
create index calendar_events_recurring_idx on public.calendar_events (user_id) where rrule is not null;

create table public.tasks (
  id           uuid primary key default gen_random_uuid(),
  list_id      uuid        not null references public.task_lists(id) on delete cascade,
  user_id      uuid        not null references auth.users(id) on delete cascade,
  title        text        not null check (length(trim(title)) between 1 and 120),
  notes        text,
  done         boolean     not null default false,
  completed_at timestamptz,
  -- Échéance déduite de la conversation (A.3) ou posée par l'utilisateur.
  due_at       timestamptz,
  -- Événement créé quand la tâche a été planifiée dans le calendrier (A.3, A.8).
  event_id     uuid        references public.calendar_events(id) on delete set null,
  position     integer     not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index tasks_list_idx on public.tasks (list_id, position);
create index tasks_due_idx on public.tasks (user_id, due_at) where done = false and due_at is not null;

-- ───────────────────────────────────────────────────────────────────────────
-- Suggestions proactives (§12.1, A.8)
--
-- L'assistant propose, il n'exécute pas. Chaque suggestion est persistée en
-- attente puis acceptée ou ignorée d'un geste — c'est ce qui rend l'intelligence
-- proactive « suggestive et non intrusive » exigée au §12.1.
-- ───────────────────────────────────────────────────────────────────────────

create table public.assistant_suggestions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid        not null references auth.users(id) on delete cascade,
  conversation_id uuid        references public.conversations(id) on delete cascade,
  kind            text        not null check (kind in (
                    'create_task_list',
                    'schedule_task',
                    'assign_folders',
                    'create_project_folders',
                    'create_recurring_event'
                  )),
  status          text        not null default 'pending'
                              check (status in ('pending', 'accepted', 'dismissed', 'expired')),
  message         text        not null check (length(message) between 1 and 500),
  -- Charge utile de l'action, validée au moment de l'acceptation seulement :
  -- ajouter un type de suggestion ne doit pas casser la lecture des anciennes.
  payload         jsonb       not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  resolved_at     timestamptz
);

create index assistant_suggestions_pending_idx
  on public.assistant_suggestions (user_id, created_at desc)
  where status = 'pending';

-- ───────────────────────────────────────────────────────────────────────────
-- `updated_at` automatique
-- ───────────────────────────────────────────────────────────────────────────

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $fn$
begin
  new.updated_at := now();
  return new;
end;
$fn$;

do $do$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'folders', 'conversations', 'task_lists', 'tasks', 'calendar_events'
  ]
  loop
    execute format(
      'create trigger %I_touch_updated_at before update on public.%I
         for each row execute function public.touch_updated_at()',
      t, t
    );
  end loop;
end;
$do$;

-- ───────────────────────────────────────────────────────────────────────────
-- Création du profil à l'inscription
--
-- En trigger plutôt qu'en appel applicatif : le profil doit exister quel que
-- soit le chemin d'inscription (OTP e-mail aujourd'hui, SMS demain — §6.2),
-- sans dépendre du client qui a initié la création.
-- ───────────────────────────────────────────────────────────────────────────

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$fn$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ═══════════════════════════════════════════════════════════════════════════
-- Row Level Security
--
-- Activée sur toutes les tables dès la V1. Le backend interroge Postgres avec
-- le JWT de l'utilisateur (client `forUser`), jamais avec la clé service_role
-- pour les lectures métier : RLS reste le dernier rempart même en cas de bug
-- applicatif. Voir aussi §13.4.6 (confidentialité et confiance).
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.profiles              enable row level security;
alter table public.folders               enable row level security;
alter table public.conversations         enable row level security;
alter table public.conversation_folders  enable row level security;
alter table public.messages              enable row level security;
alter table public.task_lists            enable row level security;
alter table public.tasks                 enable row level security;
alter table public.calendar_events       enable row level security;
alter table public.assistant_suggestions enable row level security;

create policy "profil : accès à son propre profil"
  on public.profiles for all
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Tables directement possédées : une policy `for all` suffit.
do $do$
declare
  t text;
begin
  foreach t in array array[
    'folders', 'conversations', 'messages',
    'task_lists', 'tasks', 'calendar_events', 'assistant_suggestions'
  ]
  loop
    execute format(
      'create policy %I on public.%I for all
         using (user_id = (select auth.uid()))
         with check (user_id = (select auth.uid()))',
      t || '_owner_access', t
    );
  end loop;
end;
$do$;

-- La table de liaison ne porte pas de `user_id` : la possession est vérifiée
-- des deux côtés, ce qui interdit aussi de rattacher sa conversation au
-- dossier d'un autre utilisateur.
create policy "liaison : conversation et dossier possédés"
  on public.conversation_folders for all
  using (
    exists (select 1 from public.conversations c
             where c.id = conversation_id and c.user_id = (select auth.uid()))
    and exists (select 1 from public.folders f
                 where f.id = folder_id and f.user_id = (select auth.uid()))
  )
  with check (
    exists (select 1 from public.conversations c
             where c.id = conversation_id and c.user_id = (select auth.uid()))
    and exists (select 1 from public.folders f
                 where f.id = folder_id and f.user_id = (select auth.uid()))
  );
