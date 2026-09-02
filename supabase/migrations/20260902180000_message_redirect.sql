-- ═══════════════════════════════════════════════════════════════════════════
-- Bascule vers une conversation dédiée, validée par l'utilisateur (A.10)
--
-- Le canal permanent n'ouvre plus le fil dédié de lui-même : il pose la
-- question, et l'utilisateur valide. La proposition est portée par le message
-- qui l'annonce plutôt que par `assistant_suggestions` — elle n'écrit rien
-- dans les données de l'utilisateur, elle choisit seulement où la réponse sera
-- donnée, et elle doit rester lisible à sa place dans le fil après un
-- rechargement.
--
-- `redirect_accepted_at` sert deux fois : il referme la carte de validation,
-- et il retire l'échange du contexte remis au modèle — la réponse est donnée
-- ailleurs, la relire ici ferait revenir le canal sur un sujet dont il vient
-- justement de se dessaisir.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.messages
  add column redirect_title text,
  add column redirect_accepted_at timestamptz;

-- Même borne que `labelSchema` côté `@jc/domain` : le titre part tel quel dans
-- `conversations.title`.
alter table public.messages
  add constraint messages_redirect_title_length check (
    redirect_title is null
    or length(trim(redirect_title)) between 1 and 120
  );

-- Une bascule acceptée sans proposition n'a pas de sens : elle rendrait le
-- message invisible du modèle sans que rien ne l'explique.
alter table public.messages
  add constraint messages_redirect_accepted_needs_title check (
    redirect_accepted_at is null or redirect_title is not null
  );
