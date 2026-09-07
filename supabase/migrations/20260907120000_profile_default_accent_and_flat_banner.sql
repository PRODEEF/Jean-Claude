-- ═══════════════════════════════════════════════════════════════════════════
-- Nouveaux défauts : couleur d'assistant et bandeau uni
--
-- Ne change que le défaut appliqué aux nouveaux profils (`handle_new_user`
-- insère sans lister ces colonnes, cf. 20260831090000_init.sql) — les profils
-- existants gardent la valeur déjà enregistrée.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.profiles
  alter column assistant_color set default '#107FEA';

alter table public.profiles
  alter column flat_banner set default true;
