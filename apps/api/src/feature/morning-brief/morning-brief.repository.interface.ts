import type { BriefItem } from "./morning-brief.js";

/** Ce que le planificateur retient d'un utilisateur pour son point du matin. */
export type BriefRecipient = {
  userId: string;
  timezone: string;
  displayName: string | null;
  assistantName: string;
  memory: string | null;
};

/**
 * Accès système du point du matin : il lit l'agenda de chacun et écrit dans son
 * canal, ce qu'aucune requête d'utilisateur ne fait.
 */
export interface IMorningBriefRepository {
  /** Utilisateurs qui ont gardé « points du matin » et les messages dans le canal. */
  findRecipients(): Promise<BriefRecipient[]>;
  /** Réserve le point du jour. Faux s'il est déjà parti : un seul point par jour. */
  claim(userId: string, day: string): Promise<boolean>;
  release(userId: string, day: string): Promise<void>;
  /** Ce qui est prévu entre `from` et `to` : rendez-vous et listes datées, séries dépliées. */
  agendaOf(userId: string, from: Date, to: Date): Promise<BriefItem[]>;
  postInChannel(userId: string, content: string): Promise<void>;
}
