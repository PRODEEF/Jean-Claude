-- Heures où l'après-midi et le soir commencent, réglables dans les Réglages.
-- Le matin va de minuit à la première. Défauts : midi et 19h.
--
-- Deux plages disjointes (10-15h, 17-22h) : l'après-midi commence toujours
-- avant le soir, sans contrainte croisée. Mêmes bornes que
-- `AFTERNOON_FROM_CHOICES` / `EVENING_FROM_CHOICES` dans `@jc/domain`.
alter table public.profiles
  add column if not exists day_part_afternoon_from smallint not null default 12,
  add column if not exists day_part_evening_from smallint not null default 19;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_day_part_afternoon_from_check') then
    alter table public.profiles
      add constraint profiles_day_part_afternoon_from_check
      check (day_part_afternoon_from between 10 and 15);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_day_part_evening_from_check') then
    alter table public.profiles
      add constraint profiles_day_part_evening_from_check
      check (day_part_evening_from between 17 and 22);
  end if;
end $$;
