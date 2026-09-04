-- ═══════════════════════════════════════════════════════════════════════════
-- Feedback utilisateur
--
-- Deux tables plutôt qu'une table polymorphe façon `assistant_suggestions` :
-- la restitution à Yann (non technique) passe par une lecture directe dans
-- Supabase Studio, et des colonnes explicites s'y lisent sans déplier de jsonb.
-- Ni l'une ni l'autre ne passe par l'assistant (§12.1, A.10) : ce sont des
-- gestes utilisateur directs, jamais une suggestion du modèle.
-- ═══════════════════════════════════════════════════════════════════════════

create table public.feedback (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  category    text        not null check (category in ('bug', 'idea', 'other')),
  content     text        not null check (length(trim(content)) between 1 and 2000),
  platform    text        not null check (platform in ('web', 'ios', 'android')),
  screen      text        not null,
  created_at  timestamptz not null default now()
);

create index feedback_user_recent_idx on public.feedback (user_id, created_at desc);

-- Notation d'une réponse de l'assistant. `unique (user_id, message_id)` +
-- upsert côté Repository : renoter un message change l'avis plutôt que
-- d'empiler des lignes.
create table public.message_ratings (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  message_id  uuid        not null references public.messages(id) on delete cascade,
  rating      text        not null check (rating in ('up', 'down')),
  comment     text        check (length(trim(comment)) between 1 and 2000),
  platform    text        not null check (platform in ('web', 'ios', 'android')),
  screen      text        not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint message_ratings_one_per_user_message unique (user_id, message_id)
);

create index message_ratings_message_idx on public.message_ratings (message_id);

alter table public.feedback         enable row level security;
alter table public.message_ratings  enable row level security;

do $do$
declare
  t text;
begin
  foreach t in array array['feedback', 'message_ratings']
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

-- `feedback` reste immuable, comme `assistant_suggestions` : pas de trigger
-- `touch_updated_at`. `message_ratings` est mutable (renoter met à jour la ligne).
create trigger message_ratings_touch_updated_at
  before update on public.message_ratings
  for each row execute function public.touch_updated_at();
