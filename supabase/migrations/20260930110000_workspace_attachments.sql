-- ═══════════════════════════════════════════════════════════════════════════
-- Fichiers d'espace — lot 7 de docs/COLLABORATION.md (§10)
--
-- Une pièce jointe envoyée dans une conversation d'espace est lue par les
-- membres de cette conversation, et d'eux seuls : un fichier posé dans une
-- conversation à deux ne s'ouvre pas chez toute l'équipe. Même bucket que le
-- fil personnel, sous `workspaces/{workspace_id}/{attachment_id}.{ext}`.
--
-- Une pièce supprimée garde sa ligne — le message affiche « Fichier
-- supprimé » — mais perd son objet Storage et son texte extrait : supprimer un
-- fichier doit en effacer le contenu, pas seulement le cacher.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.message_attachments
  add column workspace_id uuid references public.workspaces(id) on delete cascade,
  add column deleted_at   timestamptz,
  add constraint message_attachments_deleted_has_no_text
    check (deleted_at is null or extracted_text is null);

-- Page « Fichiers » d'un espace : les pièces envoyées et non supprimées.
create index message_attachments_workspace_idx
  on public.message_attachments (workspace_id, created_at desc)
  where workspace_id is not null and message_id is not null and deleted_at is null;

-- ── Lecture et écriture ────────────────────────────────────────────────────
-- `message_attachments_owner_access` (auteur) reste. S'y ajoutent la lecture
-- par les membres de la conversation, et la suppression par un admin.

create policy message_attachments_member_read on public.message_attachments for select
  using (
    workspace_id is not null
    and message_id is not null
    and exists (
      select 1 from public.messages m
       where m.id = message_id
         and public.is_conversation_member(m.conversation_id)
    )
  );

create policy message_attachments_admin_delete on public.message_attachments for update
  using (workspace_id is not null and public.is_workspace_admin(workspace_id))
  with check (workspace_id is not null and public.is_workspace_admin(workspace_id));

-- On ne dépose un fichier dans un espace qu'en en étant membre.
create policy message_attachments_workspace_guard on public.message_attachments
  as restrictive for insert
  with check (workspace_id is null or public.is_workspace_member(workspace_id));

-- ── Invariants structurels ─────────────────────────────────────────────────
-- Tenus quel que soit le chemin d'écriture :
--   • une pièce rejoint un message du même espace (personnel compris) : sans
--     quoi un fichier personnel pourrait être lu par tout un groupe ;
--   • une pièce ne change pas d'espace, et une suppression est définitive ;
--   • qui n'est pas l'auteur (un admin) ne fait que supprimer.
create function public.guard_message_attachment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.workspace_id is distinct from old.workspace_id then
      raise exception 'Une pièce jointe ne change pas d''espace.' using errcode = 'check_violation';
    end if;
    if old.deleted_at is not null and new.deleted_at is null then
      raise exception 'Une pièce jointe supprimée ne se restaure pas.' using errcode = 'check_violation';
    end if;
    if old.user_id <> (select auth.uid()) and (
         new.user_id is distinct from old.user_id
      or new.message_id is distinct from old.message_id
      or new.storage_path is distinct from old.storage_path
      or new.file_name is distinct from old.file_name
      or new.mime_type is distinct from old.mime_type
      or new.byte_size is distinct from old.byte_size
      or new.deleted_at is null
    ) then
      raise exception 'Seul l''auteur modifie une pièce jointe ; un admin ne peut que la supprimer.'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  if new.message_id is not null
     and (tg_op = 'INSERT' or new.message_id is distinct from old.message_id)
     and not exists (
       select 1 from public.messages m
         join public.conversations c on c.id = m.conversation_id
        where m.id = new.message_id
          and c.workspace_id is not distinct from new.workspace_id
     ) then
    raise exception 'La pièce jointe et le message n''appartiennent pas au même espace.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger message_attachments_guard
  before insert or update on public.message_attachments
  for each row execute function public.guard_message_attachment();

-- ── storage.objects ─────────────────────────────────────────────────────────
-- Chemin `workspaces/{workspace_id}/…`. Le dépôt se juge sur le chemin, avant
-- que la ligne n'existe. La lecture et l'effacement suivent la ligne : on voit
-- l'objet d'une pièce qu'on peut lire, on efface celui d'une pièce dont on est
-- l'auteur ou l'admin de l'espace. Le filtre sur le format évite qu'un
-- segment malformé fasse échouer la conversion en `uuid`.
create policy workspace_attachments_storage_insert
  on storage.objects for insert
  with check (
    bucket_id = 'message-attachments'
    and (storage.foldername(name))[1] = 'workspaces'
    and (storage.foldername(name))[2] ~ '^[0-9a-f-]{36}$'
    and public.is_workspace_member(((storage.foldername(name))[2])::uuid)
  );

create policy workspace_attachments_storage_select
  on storage.objects for select
  using (
    bucket_id = 'message-attachments'
    and (storage.foldername(name))[1] = 'workspaces'
    and exists (select 1 from public.message_attachments a where a.storage_path = name)
  );

create policy workspace_attachments_storage_delete
  on storage.objects for delete
  using (
    bucket_id = 'message-attachments'
    and (storage.foldername(name))[1] = 'workspaces'
    and exists (
      select 1 from public.message_attachments a
       where a.storage_path = name
         and (a.user_id = (select auth.uid()) or public.is_workspace_admin(a.workspace_id))
    )
  );

-- ── Temps réel ───────────────────────────────────────────────────────────────
-- Une pièce rejoint son message quelques millisecondes après lui : les autres
-- membres relisaient le fil à l'arrivée du message, avant la liaison, et ne
-- voyaient le fichier qu'au rechargement. L'app écoute aussi les mises à jour
-- des pièces jointes — liaison et suppression. Realtime applique la RLS de
-- l'abonné. Sans effet sur un Postgres nu (portabilité UE, §8).
do $do$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'message_attachments'
     )
  then
    alter publication supabase_realtime add table public.message_attachments;
  end if;
end;
$do$;
