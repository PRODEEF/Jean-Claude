-- ═══════════════════════════════════════════════════════════════════════════
-- llm_rate_limits — restreindre l'utilisateur à la lecture
--
-- La policy initiale (`for all`) laissait un utilisateur authentifié écrire
-- directement sur sa propre ligne via l'API PostgREST, hors de l'API Hono —
-- y compris remettre ses propres compteurs à zéro pour contourner le
-- rate-limiting applicatif (`core/rate-limit`). Ce n'est pas une fuite entre
-- utilisateurs (RLS filtre toujours par `user_id`), mais un contournement
-- d'un contrôle de sécurité applicatif.
--
-- Seule la lecture a encore besoin de passer par le jeton de l'utilisateur
-- (`core/rate-limit/rate-limit.repository.ts:find`). L'écriture passe
-- désormais par le rôle `service_role`, qui n'est pas soumis aux RLS — voir
-- l'exception documentée sur `rateLimitRepository.save`.
-- ═══════════════════════════════════════════════════════════════════════════

drop policy "llm_rate_limits_owner_access" on public.llm_rate_limits;

create policy "llm_rate_limits_owner_read"
  on public.llm_rate_limits for select
  using (user_id = (select auth.uid()));
