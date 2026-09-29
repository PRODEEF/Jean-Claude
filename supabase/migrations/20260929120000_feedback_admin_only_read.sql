-- ═══════════════════════════════════════════════════════════════════════════
-- Retours : lecture réservée aux admins
--
-- Un testeur envoie ses retours, il ne les relit pas : aucun écran ne les lui
-- montre, et la revue appartient à l'équipe. Seule la policy de lecture du
-- propriétaire disparaît ; l'envoi (`feedback_owner_insert`) et la lecture
-- admin (`feedback_admin_read`) restent.
--
-- Conséquence côté API : un `insert … returning` échouerait désormais, la
-- ligne n'étant plus visible de son auteur. Le Repository compose donc le
-- retour sans le relire.
--
-- Les notations (`message_ratings`) gardent leur lecture propriétaire :
-- renoter un message passe par un `upsert`, que Postgres refuse sans elle.
--
-- Ordre de déploiement : cette migration APRÈS le code qui n'a plus besoin
-- de relire la ligne insérée. Avant, l'envoi d'un avis échouerait.
-- ═══════════════════════════════════════════════════════════════════════════

drop policy feedback_owner_read on public.feedback;
