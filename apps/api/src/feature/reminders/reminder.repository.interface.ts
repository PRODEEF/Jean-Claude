import type { ReminderEvent, RemindableList } from "./reminder-schedule.js";

/** Ce que le planificateur retient d'un utilisateur. */
export type ReminderRecipient = {
  userId: string;
  timezone: string;
  /** Veut-il les rappels dans le canal Jean-Claude ? */
  remindInChannel: boolean;
  /** Veut-il aussi un e-mail ? */
  remindByEmail: boolean;
  /** Adresse de connexion, qui vit dans `auth.users` ; `null` si elle est introuvable. */
  email: string | null;
};

/** Là où un rappel peut partir : sert de clé à `reminders_sent`. */
export type ReminderChannel = "assistant_channel" | "email";

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
  /**
   * Listes datées qui portent un rappel et dont une occurrence peut tomber entre
   * `from` et `to`, avec les exceptions de leurs séries.
   *
   * Une liste née de la conversion d'un rendez-vous qui existe encore est écartée :
   * le rendez-vous rappelle déjà, la liste le ferait une seconde fois.
   */
  findRemindableLists(from: Date, to: Date): Promise<RemindableList[]>;
  findRecipients(userIds: string[]): Promise<ReminderRecipient[]>;
  /**
   * Réserve l'envoi d'un rappel. Faux si une autre exécution l'a déjà pris :
   * c'est ce qui empêche d'écrire deux fois le même rappel.
   */
  claim(eventId: string, occurrenceAt: string, channel: ReminderChannel): Promise<boolean>;
  /** Rend la réservation, quand l'envoi a échoué et doit pouvoir être retenté. */
  release(eventId: string, occurrenceAt: string, channel: ReminderChannel): Promise<void>;
  /** Comme `claim`, pour une occurrence de liste. */
  claimList(listId: string, occurrenceAt: string, channel: ReminderChannel): Promise<boolean>;
  releaseList(listId: string, occurrenceAt: string, channel: ReminderChannel): Promise<void>;
  /** Écrit un message de Jean-Claude dans le canal de l'utilisateur, en le créant au besoin. */
  postInChannel(userId: string, content: string): Promise<void>;
}
