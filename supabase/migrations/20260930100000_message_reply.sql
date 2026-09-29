-- ═══════════════════════════════════════════════════════════════════════════
-- Réponse citée dans les conversations d'espace — lot 6 de docs/COLLABORATION.md
--
-- Un message peut en citer un autre du même fil, façon WhatsApp. Pas de fil
-- secondaire : la réponse reste dans la conversation, elle porte seulement
-- une référence au message cité.
--
-- `on delete set null` : le message cité peut disparaître (conversation
-- vidée, compte supprimé) sans emporter les réponses, qui ont leur propre
-- valeur ; elles s'affichent alors sans citation.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.messages
  add column reply_to_id uuid references public.messages(id) on delete set null;

-- Sert le `set null` d'une suppression : sans lui, chaque message supprimé
-- balaierait toute la table pour retrouver ses réponses.
create index messages_reply_to_idx on public.messages (reply_to_id)
  where reply_to_id is not null;

-- Invariante structurelle, tenue quel que soit le chemin d'écriture : on ne
-- cite qu'un message du même fil. Sans elle, citer l'identifiant d'un message
-- d'une autre conversation en ferait lire le texte à tous les membres.
-- Exécutée avec les droits de l'appelant : un message qu'il ne peut pas lire
-- est introuvable, donc refusé.
create function public.check_message_reply()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.reply_to_id is null then
    return new;
  end if;

  if new.reply_to_id = new.id or not exists (
    select 1 from public.messages m
     where m.id = new.reply_to_id
       and m.conversation_id = new.conversation_id
  ) then
    raise exception 'Le message cité n''appartient pas à cette conversation.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger messages_check_reply
  before insert or update of reply_to_id, conversation_id on public.messages
  for each row execute function public.check_message_reply();
