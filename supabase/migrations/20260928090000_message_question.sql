-- ═══════════════════════════════════════════════════════════════════════════
-- Question posée par l'assistant, à côté de ses réponses proposées
--
-- Jusqu'ici seules les réponses étaient retenues, et le texte entier du
-- message tenait lieu de question. Signalé en usage réel : quand la question
-- clôt une longue réponse, la carte affichait le début de cette réponse, et
-- la bulle de l'utilisateur qui répond d'un appui recopiait toute la réponse
-- de l'assistant après « Q : » — comme s'il l'avait écrite lui-même.
--
-- Même bornes que `askedQuestionSchema` (@jc/domain), et jamais sans
-- réponses proposées : seule une question à choisir d'un appui en porte une.
-- Les messages déjà écrits restent à `null`, faute de pouvoir retrouver la
-- question dans leur texte.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.messages
  add column question text;

alter table public.messages
  add constraint messages_question_valid check (
    question is null
    or (choices is not null and char_length(trim(question)) between 1 and 200)
  );
