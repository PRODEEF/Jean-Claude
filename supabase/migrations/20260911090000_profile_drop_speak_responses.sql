-- ═══════════════════════════════════════════════════════════════════════════
-- Retrait du réglage de lecture automatique des réponses
--
-- La colonne était lue, mappée et transportée jusqu'au client sans qu'aucun
-- écran ne la pilote ni ne la consulte : un réglage persisté mais inopérant,
-- que la prochaine lecture du profil aurait fini par faire passer pour actif.
--
-- La lecture à voix haute (§12.3, A.12) reste déclenchée au geste, par le
-- bouton haut-parleur de chaque réponse.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.profiles
  drop column speak_responses;
