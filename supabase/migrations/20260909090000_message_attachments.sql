-- ═══════════════════════════════════════════════════════════════════════════
-- Pièces jointes (images) sur les messages
--
-- Une image uploadée n'est pas rattachée à un message dès le départ : le
-- trombone est utilisable depuis l'écran d'accueil, avant qu'aucune
-- conversation n'existe (§13.4.1 — capture sans friction). `message_id` naît
-- donc à `null` et se pose au moment de l'envoi (cf. `linkToMessage` du
-- Repository côté API).
--
-- Bucket privé : une image jointe peut porter une capture d'écran sensible
-- (§8, §13.4.6). Toute lecture passe par une URL signée à courte durée de
-- vie, jamais par une URL publique directe.
--
-- Pas de trigger `updated_at` : une ligne n'a qu'une seule transition dans sa
-- vie (`message_id` de `null` vers une valeur), même raisonnement que
-- `assistant_suggestions` et `feedback`, qui n'en ont pas non plus.
-- ═══════════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'message-attachments',
  'message-attachments',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
);

create table public.message_attachments (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users(id) on delete cascade,
  message_id   uuid        references public.messages(id) on delete cascade,
  storage_path text        not null unique,
  mime_type    text        not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  byte_size    integer     not null check (byte_size > 0 and byte_size <= 10485760),
  created_at   timestamptz not null default now()
);

create index message_attachments_message_idx on public.message_attachments (message_id);

-- Pièces en attente de liaison, par utilisateur — la vue que consulte la
-- liaison au moment de l'envoi.
create index message_attachments_pending_idx on public.message_attachments (user_id, created_at)
  where message_id is null;

alter table public.message_attachments enable row level security;

create policy "message_attachments_owner_access"
  on public.message_attachments for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ── storage.objects ─────────────────────────────────────────────────────
-- Convention de chemin : `{user_id}/{attachment_id}.{ext}`. Les policies
-- lisent ce premier segment, pas de jointure vers `message_attachments` —
-- plus rapide, et le chemin porte déjà l'identité du propriétaire.
create policy "message_attachments_storage_select"
  on storage.objects for select
  using (
    bucket_id = 'message-attachments'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "message_attachments_storage_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'message-attachments'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "message_attachments_storage_delete"
  on storage.objects for delete
  using (
    bucket_id = 'message-attachments'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
-- Pas de policy `update` : remplacer une pièce jointe est un delete + un
-- nouvel insert, jamais une modification en place.
