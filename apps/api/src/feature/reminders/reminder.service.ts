import { logger } from "../../core/logger.js";
import { reminderMessage } from "./reminder-message.js";
import type { IReminderRepository } from "./reminder.repository.interface.js";
import { MAX_LEAD_MS, dueReminders } from "./reminder-schedule.js";

const SCOPE = "reminders";

/**
 * Fenêtre rattrapée à chaque passage. Plus longue que la cadence (5 minutes) :
 * un passage retardé ne fait rien perdre.
 */
const WINDOW_MS = 15 * 60_000;

export type ReminderRun = { sent: number; failed: number };

/**
 * Envoie les rappels de rendez-vous arrivés à l'heure (A.11).
 *
 * Appelé par le planificateur, jamais par un utilisateur. Un rappel qui échoue
 * ne retient pas les autres, et se retente au passage suivant tant qu'il reste
 * dans la fenêtre.
 */
export class ReminderService {
  constructor(private readonly reminders: IReminderRepository) {}

  async run(now: Date = new Date()): Promise<ReminderRun> {
    const events = await this.reminders.findRemindable(
      new Date(now.getTime() - WINDOW_MS),
      new Date(now.getTime() + MAX_LEAD_MS),
    );
    const due = dueReminders(events, now, WINDOW_MS);
    if (due.length === 0) return { sent: 0, failed: 0 };

    const recipients = new Map(
      (await this.reminders.findRecipients([...new Set(due.map((item) => item.event.userId))])).map(
        (recipient) => [recipient.userId, recipient],
      ),
    );

    let sent = 0;
    let failed = 0;

    for (const { event, occurrenceAt } of due) {
      const recipient = recipients.get(event.userId);
      if (!recipient?.remindInChannel) continue;
      if (!(await this.reminders.claim(event.id, occurrenceAt))) continue;

      try {
        await this.reminders.postInChannel(
          event.userId,
          reminderMessage({
            title: event.title,
            startsAt: occurrenceAt,
            allDay: event.allDay,
            reminderMinutesBefore: event.reminderMinutesBefore ?? 0,
            timezone: recipient.timezone,
          }),
        );
        sent += 1;
      } catch (error) {
        failed += 1;
        logger.warn(
          SCOPE,
          `Rappel non envoyé pour ${event.id} : ${error instanceof Error ? error.message : "erreur inconnue"}`,
        );
        // Rendre la réservation, sans quoi le rappel ne serait jamais retenté.
        await this.reminders.release(event.id, occurrenceAt).catch((releaseError: unknown) => {
          logger.warn(
            SCOPE,
            `Réservation non rendue pour ${event.id} : ${releaseError instanceof Error ? releaseError.message : "erreur inconnue"}`,
          );
        });
      }
    }

    return { sent, failed };
  }
}
