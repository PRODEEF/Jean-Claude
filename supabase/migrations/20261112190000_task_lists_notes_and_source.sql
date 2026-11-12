-- ═══════════════════════════════════════════════════════════════════════════
-- Fusion rendez-vous et todo — étape 3a : de quoi recevoir un rendez-vous converti
--
--   · `notes`           le texte libre d'un rendez-vous, que la liste n'avait pas ;
--   · `source_event_id` le rendez-vous d'origine d'une liste née de la conversion.
--
-- `source_event_id` n'est PAS `event_id`. `event_id` veut dire « cette liste a un
-- créneau dans l'agenda » : le serveur y répercute chaque changement de la liste,
-- et supprime l'événement quand on supprime la liste. S'en servir pour retrouver
-- l'origine d'une conversion ferait modifier ou effacer le rendez-vous d'origine
-- à chaque geste sur la copie. Ici, aucun lien vivant : une simple trace, sans
-- clé étrangère, qui sert à ne convertir un rendez-vous qu'une fois.
--
-- Rien ne lit ces colonnes et rien ne change à l'écran. Idempotent.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.task_lists
  add column if not exists notes           text,
  add column if not exists source_event_id uuid;

-- Unique : c'est ce qui garantit qu'un rendez-vous ne devient pas deux listes,
-- même si la conversion est rejouée ou jouée deux fois en parallèle.
create unique index if not exists task_lists_source_event_idx
  on public.task_lists (source_event_id) where source_event_id is not null;
