import type { ReminderEvent } from "./reminder-schedule.js";

/** Ce que le planificateur retient d'un utilisateur. */
export type ReminderRecipient = {
  userId: string;
  timezone: string;
  /** Veut-il les rappels dans le canal Jean-Claude ? */
  remindInChannel: boolean;
};

/**
 * Accès système du planificateur : il lit les rendez-vous de tous et écrit dans
 * le canal de chacun, ce qu'aucune requête d'utilisateur ne fait.
 */
export interface IReminderRepository {
  /**
   * Rendez-vous qui portent un rappel et dont une occurrence peut tomber entre
   * `from` et `to` : les ponctuels qui commencent dans cette fenêtre, et toutes
   * les séries commencées avant `to`.
   */
  findRemindable(from: Date, to: Date): Promise<ReminderEvent[]>;
  findRecipients(userIds: string[]): Promise<ReminderRecipient[]>;
  /**
   * Réserve l'envoi d'un rappel. Faux si une autre exécution l'a déjà pris :
   * c'est ce qui empêche d'écrire deux fois le même rappel.
   */
  claim(eventId: string, occurrenceAt: string): Promise<boolean>;
  /** Rend la réservation, quand l'envoi a échoué et doit pouvoir être retenté. */
  release(eventId: string, occurrenceAt: string): Promise<void>;
  /** Écrit un message de Jean-Claude dans le canal de l'utilisateur, en le créant au besoin. */
  postInChannel(userId: string, content: string): Promise<void>;
}
