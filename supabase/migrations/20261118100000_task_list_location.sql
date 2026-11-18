-- ═══════════════════════════════════════════════════════════════════════════
-- Lieu d'un rendez-vous
--
-- Un rendez-vous (une liste datée, depuis la fusion rendez-vous / todo) peut
-- porter son lieu — « Cabinet dentaire, rue de la Paix » — comme dans le
-- formulaire de Google Agenda (demande de Yann, 18 novembre). Texte libre,
-- sans adresse structurée : aucune des applications de référence n'en impose.
--
-- Colonne nullable : les listes existantes n'ont pas de lieu, rien à remplir.
-- Les RLS de `task_lists` couvrent la colonne ; idempotent.
--
-- À passer AVANT de déployer l'API : elle lit désormais `location`, et sans la
-- colonne la lecture des listes échouerait.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.task_lists
  add column if not exists location text;

do $do$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'task_lists_location_length'
       and conrelid = 'public.task_lists'::regclass
  ) then
    alter table public.task_lists
      add constraint task_lists_location_length
      check (location is null or char_length(location) <= 200);
  end if;
end;
$do$;
