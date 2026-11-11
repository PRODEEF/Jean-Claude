-- ═══════════════════════════════════════════════════════════════════════════
-- Rappels de rendez-vous par e-mail
--
-- `profiles.remind_by_email` : l'utilisateur veut-il recevoir un e-mail à
-- l'heure d'un rappel, en plus du message dans le canal Jean-Claude ? Vrai par
-- défaut le temps des essais ; `reminders_sent` porte déjà le canal `email`.
-- Idempotent.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.profiles
  add column if not exists remind_by_email boolean not null default true;
