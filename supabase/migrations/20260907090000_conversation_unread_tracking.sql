-- ═══════════════════════════════════════════════════════════════════════════
-- Pastille de non-lu sur les conversations
--
-- Compteur maintenu par trigger plutôt que dérivé à la lecture : la liste des
-- conversations est rechargée à chaque ouverture de la barre latérale, et
-- recalculer un agrégat sur `messages` à ce rythme coûterait une jointure par
-- conversation. Le trigger suit le même geste que le Repository applique déjà
-- à `last_message_at` dans `appendMessage` — ici en base, parce que deux
-- compteurs à tenir à jour à chaque message valent une règle unique plutôt que
-- sa duplication dans chaque appelant.
--
-- `pending_question` répond au même besoin pour une question de l'assistant
-- restée sans réponse : l'utilisateur a pu ouvrir la conversation sans y
-- répondre, auquel cas `unread_count` retombe à zéro mais la question, elle,
-- reste en attente. Posée par tout message assistant portant `choices`, levée
-- par le prochain message utilisateur — peu importe qu'il choisisse une
-- réponse proposée ou écrive autre chose.
--
-- Limite connue : une correction ou une reprise de tour supprime des messages
-- assistant déjà comptés sans décrémenter `unread_count`, le trigger ne
-- réagissant qu'à l'insertion. Sans conséquence en pratique — ces deux gestes
-- supposent que l'utilisateur a la conversation ouverte, et `markRead` la
-- remet alors à zéro dans le même geste.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.conversations
  add column unread_count     integer not null default 0,
  add column pending_question boolean not null default false;

create or replace function public.touch_conversation_on_message()
returns trigger
language plpgsql
as $fn$
begin
  update public.conversations
  set
    unread_count = case when new.role = 'assistant' then unread_count + 1 else unread_count end,
    pending_question = case
      when new.role = 'assistant' then new.choices is not null
      when new.role = 'user' then false
      else pending_question
    end
  where id = new.conversation_id;
  return new;
end;
$fn$;

create trigger messages_touch_conversation
  after insert on public.messages
  for each row execute function public.touch_conversation_on_message();
