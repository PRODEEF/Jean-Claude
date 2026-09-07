-- ═══════════════════════════════════════════════════════════════════════════
-- Bandeau uni (désactivation du fond pastel)
--
-- Le bandeau du haut (`AppBanner`) reprend par défaut la couleur d'assistant
-- adoucie (`accent-soft`, §4.5). Ce réglage bascule ce seul bandeau sur un fond
-- neutre, sans toucher aux autres usages de `accent-soft` (bulles de
-- conversation, carte de question, événements du calendrier).
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.profiles
  add column flat_banner boolean not null default false;
