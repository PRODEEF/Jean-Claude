-- ═══════════════════════════════════════════════════════════════════════════
-- Espaces d'équipe et discussions de groupe — lot 1 de docs/COLLABORATION.md
--
-- Jusqu'ici chaque ligne appartenait à un seul compte (`user_id`). Un espace
-- réunit plusieurs comptes ; une discussion de groupe y est lue par tous ses
-- membres. Les données personnelles gardent leurs policies inchangées : les
-- nouvelles s'y ajoutent, et deux policies restrictives bornent l'ensemble.
--
-- Les règles d'accès passent par des fonctions `security definer` : une
-- policy de `conversations` qui interrogerait `conversation_members`, dont la
-- policy interroge `conversations`, bouclerait. Comme `feedback_authors()`,
-- elles ne répondent que pour l'appelant (`auth.uid()`).
--
-- Deux gestes de l'API doivent éviter `insert … returning`, la ligne n'étant
-- pas encore lisible au moment de l'insertion :
--   • créer un espace — son créateur n'en devient membre qu'à l'insertion
--     suivante dans `workspace_members` ;
--   • créer un groupe — même raison avec `conversation_members`.
-- L'identifiant est alors fourni par l'API, qui compose le retour sans relire.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- Tables
-- ───────────────────────────────────────────────────────────────────────────

create table public.workspaces (
  id          uuid primary key default gen_random_uuid(),
  name        text        not null check (length(trim(name)) between 1 and 80),
  -- `set null` : le compte du créateur peut disparaître, l'espace appartient
  -- à ses membres.
  created_by  uuid        references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger workspaces_touch_updated_at before update on public.workspaces
  for each row execute function public.touch_updated_at();

create table public.workspace_members (
  workspace_id uuid        not null references public.workspaces(id) on delete cascade,
  user_id      uuid        not null references auth.users(id) on delete cascade,
  role         text        not null default 'member' check (role in ('admin', 'member')),
  joined_at    timestamptz not null default now(),

  primary key (workspace_id, user_id)
);

-- Sélecteur d'espace : « mes espaces ».
create index workspace_members_user_idx on public.workspace_members (user_id);

-- Invitation par adresse, sans e-mail envoyé en V1 : elle attend que la
-- personne se connecte avec cette adresse. L'adresse est stockée normalisée
-- pour que la comparaison avec celle du jeton reste une égalité simple.
create table public.workspace_invitations (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid        not null references public.workspaces(id) on delete cascade,
  email        text        not null check (
                             email = lower(trim(email))
                             and length(email) between 3 and 320
                             and position('@' in email) > 1
                           ),
  invited_by   uuid        references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  accepted_at  timestamptz,
  declined_at  timestamptz,

  constraint workspace_invitations_single_answer
    check (accepted_at is null or declined_at is null)
);

-- Une seule invitation en attente par adresse et par espace ; une invitation
-- refusée n'empêche pas d'en adresser une nouvelle.
create unique index workspace_invitations_pending_idx
  on public.workspace_invitations (workspace_id, email)
  where accepted_at is null and declined_at is null;

-- Recherche à la connexion : « des invitations m'attendent-elles ? ».
create index workspace_invitations_email_pending_idx
  on public.workspace_invitations (email)
  where accepted_at is null and declined_at is null;

-- ── Groupes ─────────────────────────────────────────────────────────────────
-- Un groupe est une conversation `kind = 'group'` rattachée à un espace. Pas
-- de table à part : fil, messages, recherche et rangement en dossiers
-- (`conversation_folders`, invariant 4) restent ceux des conversations.

alter table public.conversations
  add column workspace_id uuid references public.workspaces(id) on delete cascade,
  -- Bouton silence : Jean-Claude ne parle plus que si on le mentionne.
  add column ai_muted     boolean not null default false;

alter table public.conversations drop constraint conversations_kind_check;
alter table public.conversations
  add constraint conversations_kind_check check (kind in ('chat', 'assistant', 'group'));

alter table public.conversations
  add constraint conversations_group_in_workspace
    check ((kind = 'group') = (workspace_id is not null));

create index conversations_workspace_recent_idx
  on public.conversations (workspace_id, last_message_at desc nulls last)
  where workspace_id is not null;

-- Les non-lus d'un groupe sont propres à chaque membre : ils vivent ici et non
-- sur `conversations`, dont `unread_count` reste celui du seul lecteur d'une
-- conversation personnelle.
create table public.conversation_members (
  conversation_id uuid        not null references public.conversations(id) on delete cascade,
  user_id         uuid        not null references auth.users(id) on delete cascade,
  unread_count    integer     not null default 0 check (unread_count >= 0),
  last_read_at    timestamptz,
  joined_at       timestamptz not null default now(),

  primary key (conversation_id, user_id)
);

-- Liste des groupes d'un membre.
create index conversation_members_user_idx on public.conversation_members (user_id);

-- ───────────────────────────────────────────────────────────────────────────
-- Fonctions d'accès
-- ───────────────────────────────────────────────────────────────────────────

create function public.is_workspace_member(p_workspace uuid) returns boolean
  language sql stable security definer
  set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_members
     where workspace_id = p_workspace and user_id = (select auth.uid())
  );
$$;

create function public.is_workspace_admin(p_workspace uuid) returns boolean
  language sql stable security definer
  set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_members
     where workspace_id = p_workspace and user_id = (select auth.uid()) and role = 'admin'
  );
$$;

-- Adresse lue dans le jeton, jamais dans la requête : c'est elle qui prouve
-- que l'invitation vise bien l'appelant.
create function public.has_pending_invitation(p_workspace uuid) returns boolean
  language sql stable security definer
  set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_invitations
     where workspace_id = p_workspace
       and email = lower((select auth.jwt()) ->> 'email')
       and accepted_at is null and declined_at is null
  );
$$;

-- Premier membre d'un espace : seul son créateur, et seulement tant que
-- l'espace est vide. Un créateur retiré par un autre admin ne peut donc pas
-- s'y réinscrire.
create function public.can_join_as_founder(p_workspace uuid) returns boolean
  language sql stable security definer
  set search_path = ''
as $$
  select exists (
    select 1 from public.workspaces w
     where w.id = p_workspace and w.created_by = (select auth.uid())
  )
  and not exists (
    select 1 from public.workspace_members where workspace_id = p_workspace
  );
$$;

create function public.is_conversation_member(p_conversation uuid) returns boolean
  language sql stable security definer
  set search_path = ''
as $$
  select exists (
    select 1 from public.conversation_members
     where conversation_id = p_conversation and user_id = (select auth.uid())
  );
$$;

-- Conversation personnelle possédée, ou groupe dont l'appelant est membre.
create function public.can_access_conversation(p_conversation uuid) returns boolean
  language sql stable security definer
  set search_path = ''
as $$
  select exists (
    select 1 from public.conversations c
     where c.id = p_conversation
       and (
         (c.workspace_id is null and c.user_id = (select auth.uid()))
         or exists (
           select 1 from public.conversation_members m
            where m.conversation_id = c.id and m.user_id = (select auth.uid())
         )
       )
  );
$$;

-- Ajouter `p_user` à un groupe : il doit être membre de l'espace du groupe, et
-- l'appelant membre du groupe — ou son créateur tant que le groupe est vide.
create function public.can_add_to_group(p_conversation uuid, p_user uuid) returns boolean
  language sql stable security definer
  set search_path = ''
as $$
  select exists (
    select 1 from public.conversations c
      join public.workspace_members wm
        on wm.workspace_id = c.workspace_id and wm.user_id = p_user
     where c.id = p_conversation
       and c.kind = 'group'
       and (
         exists (
           select 1 from public.conversation_members m
            where m.conversation_id = c.id and m.user_id = (select auth.uid())
         )
         or (
           c.user_id = (select auth.uid())
           and not exists (
             select 1 from public.conversation_members m where m.conversation_id = c.id
           )
         )
       )
  );
$$;

-- Nom affiché des membres d'un espace, pour signer les messages de groupe. La
-- RLS de `profiles` s'arrête au propriétaire, et à raison : la ligne porte la
-- mémoire de l'utilisateur. Comme `feedback_authors()`, la fonction ne rend
-- que ce qu'un collègue doit voir.
create function public.workspace_member_profiles(p_workspace uuid)
returns table (user_id uuid, display_name text, role text)
language sql stable security definer
set search_path = ''
as $$
  select wm.user_id, p.display_name, wm.role
    from public.workspace_members wm
    left join public.profiles p on p.id = wm.user_id
   where wm.workspace_id = p_workspace
     and public.is_workspace_member(p_workspace);
$$;

do $do$
declare
  f text;
begin
  foreach f in array array[
    'public.is_workspace_member(uuid)',
    'public.is_workspace_admin(uuid)',
    'public.has_pending_invitation(uuid)',
    'public.can_join_as_founder(uuid)',
    'public.is_conversation_member(uuid)',
    'public.can_access_conversation(uuid)',
    'public.can_add_to_group(uuid, uuid)',
    'public.workspace_member_profiles(uuid)'
  ]
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$do$;

-- ───────────────────────────────────────────────────────────────────────────
-- Row Level Security
-- ───────────────────────────────────────────────────────────────────────────

alter table public.workspaces            enable row level security;
alter table public.workspace_members     enable row level security;
alter table public.workspace_invitations enable row level security;
alter table public.conversation_members  enable row level security;

-- ── workspaces ──────────────────────────────────────────────────────────────
-- Une personne invitée lit le nom de l'espace avant de l'avoir rejoint :
-- « Vous êtes invité dans Association X ».
create policy workspaces_member_read on public.workspaces for select
  using (public.is_workspace_member(id) or public.has_pending_invitation(id));

create policy workspaces_create on public.workspaces for insert
  with check (created_by = (select auth.uid()));

create policy workspaces_admin_update on public.workspaces for update
  using (public.is_workspace_admin(id))
  with check (public.is_workspace_admin(id));

-- Pas de policy `delete` : supprimer un espace emporte toutes ses discussions,
-- et le choix entre suppression et archivage reste ouvert
-- (docs/COLLABORATION.md, §9).

-- ── workspace_members ───────────────────────────────────────────────────────
create policy workspace_members_read on public.workspace_members for select
  using (public.is_workspace_member(workspace_id));

-- On n'entre dans un espace que par soi-même : en le fondant, ou en acceptant
-- une invitation. Un admin n'inscrit personne d'office.
create policy workspace_members_join on public.workspace_members for insert
  with check (
    user_id = (select auth.uid())
    and (
      (role = 'admin' and public.can_join_as_founder(workspace_id))
      or (role = 'member' and public.has_pending_invitation(workspace_id))
    )
  );

create policy workspace_members_admin_update on public.workspace_members for update
  using (public.is_workspace_admin(workspace_id))
  with check (public.is_workspace_admin(workspace_id));

-- Partir soi-même, ou être retiré par un admin. Que le dernier admin ne parte
-- pas est une règle métier, tenue par le service.
create policy workspace_members_leave on public.workspace_members for delete
  using (user_id = (select auth.uid()) or public.is_workspace_admin(workspace_id));

-- ── workspace_invitations ───────────────────────────────────────────────────
create policy workspace_invitations_read on public.workspace_invitations for select
  using (
    public.is_workspace_admin(workspace_id)
    or email = lower((select auth.jwt()) ->> 'email')
  );

create policy workspace_invitations_admin_insert on public.workspace_invitations for insert
  with check (public.is_workspace_admin(workspace_id) and invited_by = (select auth.uid()));

create policy workspace_invitations_answer on public.workspace_invitations for update
  using (email = lower((select auth.jwt()) ->> 'email'))
  with check (email = lower((select auth.jwt()) ->> 'email'));

-- La policy ouvre la ligne à la personne invitée, le privilège de colonne la
-- borne à sa réponse : sans lui, elle pourrait déplacer son invitation vers un
-- autre espace et y entrer.
revoke update on public.workspace_invitations from authenticated;
grant update (accepted_at, declined_at) on public.workspace_invitations to authenticated;

create policy workspace_invitations_admin_delete on public.workspace_invitations for delete
  using (public.is_workspace_admin(workspace_id));

-- ── conversations ───────────────────────────────────────────────────────────
-- `conversations_owner_access` reste : le créateur d'un groupe en est
-- `user_id`. Les membres y ajoutent la lecture et la mise à jour (titre,
-- bouton silence, `last_message_at` à chaque message).
create policy conversations_member_read on public.conversations for select
  using (public.is_conversation_member(id));

create policy conversations_member_update on public.conversations for update
  using (public.is_conversation_member(id))
  with check (public.is_conversation_member(id));

-- Restrictive : elle s'ajoute en « et » à toutes les autres. Un créateur
-- retiré du groupe perd l'accès malgré `conversations_owner_access`, et nul ne
-- crée un groupe dans un espace dont il n'est pas membre.
create policy conversations_group_guard on public.conversations
  as restrictive for all
  using (workspace_id is null or public.is_conversation_member(id))
  with check (workspace_id is null or public.is_workspace_member(workspace_id));

-- ── messages ────────────────────────────────────────────────────────────────
create policy messages_member_read on public.messages for select
  using (public.is_conversation_member(conversation_id));

-- `messages_owner_access` ne vérifie que l'auteur : elle laissait écrire dans
-- la conversation d'un autre pour peu qu'on en connaisse l'identifiant. Sans
-- conséquence à un seul utilisateur, plus du tout avec des groupes.
create policy messages_conversation_guard on public.messages
  as restrictive for all
  using (public.can_access_conversation(conversation_id))
  with check (public.can_access_conversation(conversation_id));

-- ── conversation_members ────────────────────────────────────────────────────
create policy conversation_members_read on public.conversation_members for select
  using (public.is_conversation_member(conversation_id));

create policy conversation_members_add on public.conversation_members for insert
  with check (public.can_add_to_group(conversation_id, user_id));

-- Chacun ne tient que ses propres non-lus.
create policy conversation_members_self_update on public.conversation_members for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Quitter un groupe soi-même. Qui peut en retirer un autre n'est pas tranché ;
-- un retrait de l'espace passe par `leave_workspace_groups()`.
create policy conversation_members_leave on public.conversation_members for delete
  using (user_id = (select auth.uid()));

-- ───────────────────────────────────────────────────────────────────────────
-- Invariants structurels
-- ───────────────────────────────────────────────────────────────────────────

-- Non-lus : dans un groupe, chaque message compte pour tous les membres sauf
-- son auteur ; une réponse de Jean-Claude compte pour tous. `security definer`
-- parce que l'auteur ne peut pas écrire la ligne `conversation_members` des
-- autres. La conversation personnelle garde exactement son comportement.
create or replace function public.touch_conversation_on_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_is_group boolean;
begin
  select c.workspace_id is not null into v_is_group
    from public.conversations c where c.id = new.conversation_id;

  update public.conversations
  set
    unread_count = case
      when new.role = 'assistant' and not v_is_group then unread_count + 1
      else unread_count
    end,
    pending_question = case
      when new.role = 'assistant' then new.choices is not null
      when new.role = 'user' then false
      else pending_question
    end
  where id = new.conversation_id;

  if v_is_group then
    update public.conversation_members
       set unread_count = unread_count + 1
     where conversation_id = new.conversation_id
       and (new.role = 'assistant' or (new.role = 'user' and user_id <> new.user_id));
  end if;

  return new;
end;
$fn$;

-- Quitter un espace, c'est quitter tous ses groupes. En trigger : la RLS des
-- groupes repose déjà sur l'appartenance, mais une ligne orpheline dans
-- `conversation_members` continuerait d'accumuler des non-lus.
create function public.leave_workspace_groups()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  delete from public.conversation_members m
   using public.conversations c
   where c.id = m.conversation_id
     and c.workspace_id = old.workspace_id
     and m.user_id = old.user_id;
  return old;
end;
$fn$;

create trigger workspace_members_leave_groups
  after delete on public.workspace_members
  for each row execute function public.leave_workspace_groups();

-- Un groupe ne change pas d'espace et une conversation personnelle ne devient
-- pas un groupe : l'un ou l'autre ferait passer des messages d'un cercle de
-- lecteurs à un autre.
create function public.keep_conversation_workspace()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  if new.workspace_id is distinct from old.workspace_id then
    raise exception 'Une conversation ne change pas d''espace.';
  end if;
  return new;
end;
$fn$;

create trigger conversations_keep_workspace
  before update on public.conversations
  for each row execute function public.keep_conversation_workspace();
