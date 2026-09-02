-- ═══════════════════════════════════════════════════════════════════════════
-- Réponses proposées sous une question de l'assistant
--
-- Portées par le message et non par une table à part : ce sont les réponses
-- possibles à cette question-là, elles naissent et disparaissent avec elle.
-- Une table de plus n'ajouterait qu'une jointure.
--
-- `jsonb` plutôt que `text[]` : le tableau voyage tel quel jusqu'au client,
-- qui le lit comme le reste de la charge utile JSON.
--
-- Au moins deux réponses : une question à choix unique n'est pas un choix.
-- Au plus six : au-delà, la liste devient un formulaire et l'utilisateur fait
-- plus vite d'écrire sa réponse.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.messages
  add column choices jsonb;

alter table public.messages
  add constraint messages_choices_valid check (
    choices is null
    or (
      jsonb_typeof(choices) = 'array'
      and jsonb_array_length(choices) between 2 and 6
    )
  );
