-- ═══════════════════════════════════════════════════════════════════════════
-- Choix du modèle par l'utilisateur (§5.1)
--
-- Jusqu'ici `LLM_MODEL` décidait pour tout le monde. Le §5.1 prévoit que
-- l'utilisateur choisisse le sien dans ses réglages, cette variable ne restant
-- que le repli.
--
-- `null` est donc une valeur pleine, et non une absence de réglage : elle
-- signifie « celui que le serveur a retenu ». C'est ce qui permet de changer
-- `LLM_MODEL` — pour un moteur souverain, ou parce qu'un éditeur devient
-- indisponible — sans réécrire les profils.
--
-- Aucune contrainte n'énumère les modèles acceptés : le catalogue est destiné
-- à bouger plus vite que le schéma, et il est déjà tenu par `@jc/domain`, qui
-- valide l'écriture côté API et alimente la liste côté application. Une valeur
-- qui n'y figure plus est relue comme `null`, sans rien à réparer en base.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.profiles
  add column llm_model text;

-- Forme `éditeur/modèle`, celle du Gateway. La contrainte n'énumère rien :
-- elle écarte seulement ce qui ne pourrait désigner aucun modèle.
alter table public.profiles
  add constraint profiles_llm_model_format check (
    llm_model is null
    or llm_model ~ '^[a-z0-9][a-z0-9._-]*/[a-z0-9][a-z0-9._-]*$'
  );
