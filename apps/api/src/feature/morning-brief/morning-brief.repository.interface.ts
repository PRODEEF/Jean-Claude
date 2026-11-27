import type { DayPartBounds } from "@jc/domain";
import type { BriefItem, BriefKind } from "./morning-brief.js";

/** Ce que le planificateur retient d'un utilisateur pour son point du matin. */
export type BriefRecipient = {
  userId: string;
  timezone: string;
  displayName: string | null;
  assistantName: string;
  memory: string | null;
  /** Limites « Après-midi » et « Soir » de ses Réglages : elles règlent l'heure des deux derniers points. */
  bounds: DayPartBounds;
};

/**
 * Accès système du point du matin : il lit l'agenda de chacun et écrit dans son
 * canal, ce qu'aucune requête d'utilisateur ne fait.
 */
export interface IMorningBriefRepository {
  /**
   * Utilisateurs qui veulent ce point et les messages dans le canal : le matin
   * est activé d'office, l'après-midi et le soir seulement s'ils l'ont demandé.
   */
  findRecipients(kind: BriefKind): Promise<BriefRecipient[]>;
  /** Réserve le point du jour. Faux s'il est déjà parti : un seul point de chaque sorte par jour. */
  claim(userId: string, day: string, kind: BriefKind): Promise<boolean>;
  release(userId: string, day: string, kind: BriefKind): Promise<void>;
  /** Ce qui est prévu entre `from` et `to` : rendez-vous et listes datées, séries dépliées, faits compris. */
  agendaOf(userId: string, from: Date, to: Date): Promise<BriefItem[]>;
  postInChannel(userId: string, content: string): Promise<void>;
}
