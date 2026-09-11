-- ═══════════════════════════════════════════════════════════════════════════
-- Réaligner les créneaux d'agenda sur les todolistes qu'ils représentent
--
-- Le lien `task_lists.event_id` était tenu par deux répercussions partielles :
-- la modification d'une liste ne poussait que sa date, celle d'un rendez-vous
-- ne remontait que la sienne, et le titre n'était jamais projeté. Un créneau
-- pouvait donc annoncer autre chose que ce que sa liste portait — et
-- l'application le rattrapait à l'affichage, ce qui masquait la divergence
-- sans la corriger.
--
-- La liste est désormais la source, le rendez-vous en est la projection
-- (`slotForList`, packages/domain). Cette migration remet les créneaux déjà
-- écrits en accord avec elle ; les notes et le rappel, que la liste ne dit
-- pas, restent au rendez-vous.
--
-- Seules les paires cohérentes sont touchées. Une liste qui porterait un
-- créneau sans échéance ne devrait pas exister — l'ancien code refusait ce
-- geste — et rien ici ne supprime un rendez-vous de l'utilisateur.
-- ═══════════════════════════════════════════════════════════════════════════

update public.calendar_events as e
   set title     = l.title,
       starts_at = l.due_at,
       all_day   = l.due_all_day,
       -- Une heure pour un créneau, rien pour une journée entière : même
       -- durée que celle prêtée par `slotForList`.
       ends_at   = case when l.due_all_day then null else l.due_at + interval '1 hour' end
  from public.task_lists as l
 where l.event_id = e.id
   and l.due_at is not null
   and l.due_all_day is not null;
