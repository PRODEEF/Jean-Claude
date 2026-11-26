-- ═══════════════════════════════════════════════════════════════════════════
-- Apparence : taille du texte ; Assistant : langue
--
-- `profiles.font_scale` : taille du texte de l'application (quatre crans).
-- `profiles.language`   : langue dans laquelle l'assistant répond.
-- Idempotent.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.profiles
  add column if not exists font_scale text not null default 'normal'
  check (font_scale in ('small', 'normal', 'large', 'xlarge'));

alter table public.profiles
  add column if not exists language text not null default 'fr'
  check (language in ('fr', 'en', 'es', 'de', 'it', 'pt'));
