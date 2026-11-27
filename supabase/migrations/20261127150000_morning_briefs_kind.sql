-- ═══════════════════════════════════════════════════════════════════════════
-- Points de l'après-midi et du soir (suite du point du matin)
--
-- `morning_briefs_sent` retenait un point par utilisateur et par jour. Il y en a
-- maintenant trois sortes — matin, après-midi, soir — : la réservation se fait par
-- (utilisateur, jour, sorte). Les lignes existantes sont celles du matin.
--
-- Idempotent : relançable sans effet une fois la clé à trois colonnes posée.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.morning_briefs_sent
  add column if not exists kind text not null default 'morning'
  check (kind in ('morning', 'afternoon', 'evening'));

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.morning_briefs_sent'::regclass
      and contype = 'p'
      and array_length(conkey, 1) = 3
  ) then
    alter table public.morning_briefs_sent drop constraint morning_briefs_sent_pkey;
    alter table public.morning_briefs_sent add primary key (user_id, day, kind);
  end if;
end
$$;
