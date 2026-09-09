-- ═══════════════════════════════════════════════════════════════════════════
-- Pièces jointes PDF
--
-- Le PDF ne devient jamais un contenu image envoyé au modèle (§13.4.1) : son
-- texte est extrait côté serveur à l'upload (`core/pdf-text.ts`) et stocké
-- une fois pour toutes — le relire au fournisseur IA à chaque tour du fil
-- aurait reparsé le même fichier à chaque message.
--
-- `file_name` devient nécessaire pour les deux types de pièce jointe : une
-- vignette suffit à identifier une image, un PDF sans nom n'est qu'une icône
-- anonyme. `not null` sur les lignes déjà en base (aucune n'existe hors de ce
-- schéma, jamais déployé sur une instance réelle avant cette migration) via
-- une valeur par défaut retirée aussitôt après.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.message_attachments
  add column file_name text not null default '',
  add column extracted_text text;

alter table public.message_attachments
  alter column file_name drop default;

alter table public.message_attachments
  drop constraint message_attachments_mime_type_check,
  add constraint message_attachments_mime_type_check
    check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf'));

update storage.buckets
  set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
  where id = 'message-attachments';
