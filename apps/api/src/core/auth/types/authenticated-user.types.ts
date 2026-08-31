/** Utilisateur résolu par le guard et attaché à la requête. */
export type AuthenticatedUser = {
  id: string;
  email: string;
  /**
   * Access token d'origine, retransmis aux Repositories pour que les requêtes
   * Postgres s'exécutent sous l'identité de l'utilisateur (RLS actives).
   */
  accessToken: string;
  emailConfirmedAt: string | null;
};
