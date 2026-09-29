-- ═══════════════════════════════════════════════════════════════════════════
-- Dossiers d'un espace d'équipe — docs/COLLABORATION.md
--
-- Chaque espace a sa propre arborescence, commune à tous ses membres : tout
-- membre y crée, renomme, déplace et supprime des dossiers, et y range les
-- conversations de l'espace. Toujours par `conversation_folders` : une
-- conversation d'espace peut appartenir à plusieurs dossiers (invariant 4).
--
-- `user_id` reste le créateur du dossier. Les dossiers personnels gardent
-- leurs policies ; les nouvelles s'y ajoutent, et deux policies restrictives
-- empêchent de mêler les deux mondes.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.folders
  add column workspace_id uuid references public.workspaces(id) on delete cascade;

create index folders_workspace_idx on public.folders (workspace_id) where workspace_id is not null;

-- L'unicité du nom par parent était posée par compte. Dans un espace, elle vaut
-- pour l'espace entier — deux membres ne créent pas deux « Kermesse » côte à
-- côte — et un dossier d'espace ne doit pas buter sur un dossier personnel du
-- même nom.
alter table public.folders drop constraint folders_name_unique_per_parent;

create unique index folders_personal_name_unique
  on public.folders (user_id, parent_id, name) nulls not distinct
  where workspace_id is null;

create unique index folders_workspace_name_unique
  on public.folders (workspace_id, parent_id, name) nulls not distinct
  where workspace_id is not null;

-- ── RLS ─────────────────────────────────────────────────────────────────────
create policy folders_workspace_members on public.folders for all
  using (workspace_id is not null and public.is_workspace_member(workspace_id))
  with check (workspace_id is not null and public.is_workspace_member(workspace_id));

-- Restrictive : un dossier d'espace n'est accessible qu'aux membres de
-- l'espace, créateur compris une fois parti.
create policy folders_workspace_guard on public.folders
  as restrictive for all
  using (workspace_id is null or public.is_workspace_member(workspace_id))
  with check (workspace_id is null or public.is_workspace_member(workspace_id));

-- Restrictive : on ne crée un dossier qu'en son propre nom.
create policy folders_insert_as_self on public.folders
  as restrictive for insert
  with check (user_id = (select auth.uid()));

-- Une conversation et un dossier d'un même espace, tous deux lisibles de
-- l'appelant — la RLS des deux tables s'applique dans les sous-requêtes.
create policy conversation_folders_workspace on public.conversation_folders for all
  using (
    exists (select 1 from public.conversations c
             where c.id = conversation_id and c.workspace_id is not null)
    and exists (select 1 from public.folders f
                 where f.id = folder_id and f.workspace_id is not null)
  )
  with check (
    exists (select 1 from public.conversations c
             where c.id = conversation_id and c.workspace_id is not null)
    and exists (select 1 from public.folders f
                 where f.id = folder_id and f.workspace_id is not null)
  );

-- Même espace des deux côtés, ou personnel des deux côtés. Sans elle, le
-- créateur d'une conversation d'espace pourrait la ranger dans un de ses
-- dossiers personnels (`liaison : conversation et dossier possédés`).
create function public.same_space(p_conversation uuid, p_folder uuid) returns boolean
  language sql stable security definer
  set search_path = ''
as $$
  select coalesce((
    select c.workspace_id is not distinct from f.workspace_id
      from public.conversations c, public.folders f
     where c.id = p_conversation and f.id = p_folder
  ), false);
$$;

revoke execute on function public.same_space(uuid, uuid) from public, anon;
grant execute on function public.same_space(uuid, uuid) to authenticated;

create policy conversation_folders_same_space on public.conversation_folders
  as restrictive for all
  using (public.same_space(conversation_id, folder_id))
  with check (public.same_space(conversation_id, folder_id));

-- ── Invariant structurel ────────────────────────────────────────────────────
-- Un sous-dossier vit dans le même espace que son parent, et un dossier ne
-- change pas d'espace. `security definer` : le parent doit être lu tel qu'il
-- est, et non tel que la RLS le laisse voir à l'appelant.
create function public.keep_folder_space()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if tg_op = 'UPDATE' and new.workspace_id is distinct from old.workspace_id then
    raise exception 'Un dossier ne change pas d''espace.';
  end if;

  if new.parent_id is not null
     and (select f.workspace_id from public.folders f where f.id = new.parent_id)
         is distinct from new.workspace_id
  then
    raise exception 'Un sous-dossier appartient au même espace que son parent.';
  end if;

  return new;
end;
$fn$;

create trigger folders_keep_space
  before insert or update of parent_id, workspace_id on public.folders
  for each row execute function public.keep_folder_space();

-- Fonction de trigger : jamais appelée directement.
revoke execute on function public.keep_folder_space() from public, anon, authenticated;
