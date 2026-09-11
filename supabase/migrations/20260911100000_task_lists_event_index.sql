-- ═══════════════════════════════════════════════════════════════════════════
-- Index manquant sur le lien todoliste → rendez-vous
--
-- `findByEventId` s'exécute à chaque modification d'un rendez-vous :
-- `CalendarService.update` cherche la todoliste que l'événement représente
-- pour lui répercuter sa nouvelle date (A.3). Sans index, chaque déplacement
-- de rendez-vous balaie toutes les listes du compte — et ce balayage n'a lieu
-- que pour découvrir, l'immense majorité du temps, qu'aucune liste n'est liée.
--
-- Partiel : la colonne est nulle pour toutes les listes dont le créneau n'a
-- pas été posé, et l'index n'a rien à dire de celles-là.
-- ═══════════════════════════════════════════════════════════════════════════

create index task_lists_event_idx on public.task_lists (event_id)
  where event_id is not null;
