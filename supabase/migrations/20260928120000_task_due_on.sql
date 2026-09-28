-- ═══════════════════════════════════════════════════════════════════════════
-- Une échéance par tâche, en plus de celle de la liste
--
-- Le 3 septembre, l'échéance a quitté la tâche pour la liste : « les courses
-- avant samedi » date la liste, pas la farine. Signalé en usage réel : « refaire
-- le site pour le 12, les groupes pour le 14, l'onboarding pour le 20 » n'avait
-- plus où s'écrire. Le modèle a contourné en proposant la même liste deux fois
-- — une sans dates, une avec la date dans le titre de chaque ligne —, et le
-- calendrier a tout posé sur le 12. Things 3, Todoist et TickTick datent la
-- tâche (§4.2).
--
-- La liste garde son échéance ; la tâche en porte une à elle, facultative.
--
-- Un jour civil et non un instant : « pour le 12 » ne vise pas une heure, et
-- un `date` se lit identiquement dans toutes les horloges — là où un instant a
-- demandé `task_lists.due_all_day` pour cesser de changer de jour hors
-- d'Europe/Paris. Pas d'index : aucune lecture ne filtre encore sur ce champ,
-- les tâches arrivent toujours avec leur liste.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.tasks
  add column due_on date;
