-- ═══════════════════════════════════════════════════════════════════════════
-- Pièces jointes texte brut (.txt, .md, .csv)
--
-- Même mécanisme que le PDF : le fichier ne devient jamais un contenu envoyé
-- au modèle par un canal spécial, son texte est lu tel quel côté serveur à
-- l'upload et stocké dans `extracted_text` — aucune colonne nouvelle, la
-- migration précédente (`20260909100000`) les porte déjà toutes les deux.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.message_attachments
  drop constraint message_attachments_mime_type_check,
  add constraint message_attachments_mime_type_check
    check (mime_type in (
      'image/jpeg', 'image/png', 'image/webp', 'application/pdf',
      'text/plain', 'text/markdown', 'text/csv'
    ));

update storage.buckets
  set allowed_mime_types = array[
    'image/jpeg', 'image/png', 'image/webp', 'application/pdf',
    'text/plain', 'text/markdown', 'text/csv'
  ]
  where id = 'message-attachments';
