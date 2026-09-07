-- ═══════════════════════════════════════════════════════════════════════════
-- Limite de débit sur les messages envoyés au moteur IA
--
-- Une ligne par utilisateur, deux fenêtres glissantes (minute et heure) :
-- une seule fenêtre laisserait passer soit une rafale, soit un script qui
-- reste juste en dessous du seuil pendant des heures. La fenêtre elle-même
-- est calculée côté API (core/rate-limit) et non ici : décider quand elle
-- expire est une règle produit, pas une invariante structurelle de la table.
-- ═══════════════════════════════════════════════════════════════════════════

create table public.llm_rate_limits (
  user_id             uuid        primary key references auth.users(id) on delete cascade,
  minute_window_start timestamptz not null,
  minute_count        integer     not null default 0,
  hour_window_start   timestamptz not null,
  hour_count          integer     not null default 0,
  updated_at          timestamptz not null default now()
);

alter table public.llm_rate_limits enable row level security;

create policy "llm_rate_limits_owner_access"
  on public.llm_rate_limits for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create trigger llm_rate_limits_touch_updated_at
  before update on public.llm_rate_limits
  for each row execute function public.touch_updated_at();
