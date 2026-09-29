-- ═══════════════════════════════════════════════════════════════════════════
-- Revue des retours testeurs par l'équipe
--
-- Jusqu'ici, `feedback` et `message_ratings` ne se lisaient que dans Supabase
-- Studio : aucune RLS ne prévoyait d'accès au-delà du propriétaire. Un rôle
-- admin, attribué à la main, ouvre la lecture de ces deux tables — et d'elles
-- seules. Conversations, mémoire et réglages restent hors de portée : le canal
-- permanent porte aussi les rappels et l'organisation personnelle du testeur
-- (§8), qu'on n'a pas à lire pour traiter ses retours.
--
-- Une policy plutôt que la clé service_role : la règle 100-api réserve le
-- client `admin` aux traitements système, jamais à une requête HTTP. Les RLS
-- s'appliquent toujours, simplement élargies pour les admins.
-- ═══════════════════════════════════════════════════════════════════════════

-- Attribution à la main, depuis le SQL Editor :
--   insert into public.admins (user_id) values ('<uuid du compte>');
-- Aucune policy d'écriture : un compte ne peut pas s'élever lui-même.
--
-- Clé étrangère vers `profiles` et non `auth.users` : c'est ce qui permet au
-- Repository de lire le droit dans la même requête que le profil. La cascade
-- tient, `profiles` étant lui-même effacé avec le compte.
create table public.admins (
  user_id     uuid        primary key references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now()
);

alter table public.admins enable row level security;

-- Chacun ne lit que sa propre ligne : assez pour que `is_admin()` s'évalue
-- sous l'identité de l'appelant, sans `security definer`.
create policy admins_self_read on public.admins for select
  using (user_id = (select auth.uid()));

create function public.is_admin() returns boolean
  language sql stable
  set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()));
$$;

-- ── Statut d'un retour ─────────────────────────────────────────────────────
-- Seule donnée mutable de `feedback`, et seulement par un admin : ce que le
-- testeur a écrit reste tel qu'il l'a envoyé.
alter table public.feedback
  add column status text not null default 'new'
    check (status in ('new', 'acknowledged', 'resolved', 'dismissed'));

create index feedback_recent_idx on public.feedback (created_at desc);

-- `for all` laissait au propriétaire la main sur le statut. Il écrit et relit
-- ses retours, sans plus ; la suppression de son compte les efface toujours,
-- par la cascade.
drop policy feedback_owner_access on public.feedback;

create policy feedback_owner_read on public.feedback for select
  using (user_id = (select auth.uid()));

create policy feedback_owner_insert on public.feedback for insert
  with check (user_id = (select auth.uid()) and status = 'new');

create policy feedback_admin_read on public.feedback for select
  using ((select public.is_admin()));

create policy feedback_admin_update on public.feedback for update
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- La policy ouvre la ligne, le privilège de colonne la borne : un admin trie
-- les retours, il ne réécrit pas ce que le testeur a dit.
revoke update on public.feedback from anon, authenticated;
grant update (status) on public.feedback to authenticated;

create policy message_ratings_admin_read on public.message_ratings for select
  using ((select public.is_admin()));

-- ── Auteurs des retours ────────────────────────────────────────────────────
-- Nom affiché et adresse de qui a laissé un retour, pour les seuls admins.
-- `security definer` parce que `auth.users` n'est pas lisible du rôle
-- `authenticated` et que la RLS de `profiles` s'arrête au propriétaire. La
-- fonction ne rend que ces deux colonnes : ni la mémoire, ni les réglages.
create function public.feedback_authors()
returns table (user_id uuid, display_name text, email text)
language sql stable security definer
set search_path = ''
as $$
  select u.id, p.display_name, u.email::text
    from auth.users u
    left join public.profiles p on p.id = u.id
   where public.is_admin()
     and (exists (select 1 from public.feedback f where f.user_id = u.id)
       or exists (select 1 from public.message_ratings r where r.user_id = u.id));
$$;

revoke execute on function public.feedback_authors() from public, anon;
grant execute on function public.feedback_authors() to authenticated;
