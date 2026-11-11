import { logger } from "../../core/logger.js";
import { reminderMessage } from "./reminder-message.js";
import type { IReminderRepository, ReminderChannel } from "./reminder.repository.interface.js";
import { MAX_LEAD_MS, dueReminders } from "./reminder-schedule.js";

const SCOPE = "reminders";

/**
 * Fenêtre rattrapée à chaque passage. Plus longue que la cadence (5 minutes) :
 * un passage retardé ne fait rien perdre.
 */
const WINDOW_MS = 15 * 60_000;

export type ReminderRun = { sent: number; failed: number };

/** Envoi d'un e-mail de rappel : injecté, pour que le service se teste sans réseau. */
export type ReminderMailer = (mail: { to: string; message: string }) => Promise<void>;

/**
 * Envoie les rappels de rendez-vous arrivés à l'heure (A.11).
 *
 * Appelé par le planificateur, jamais par un utilisateur. Un rappel qui échoue
 * ne retient pas les autres, et se retente au passage suivant tant qu'il reste
 * dans la fenêtre. Chaque canal (message dans le canal Jean-Claude, e-mail) se
 * réserve et se retente séparément : l'échec de l'un ne rejoue pas l'autre.
 */
export class ReminderService {
  constructor(
    private readonly reminders: IReminderRepository,
    private readonly sendEmail: ReminderMailer,
  ) {}

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

    const run: ReminderRun = { sent: 0, failed: 0 };

    for (const { event, occurrenceAt } of due) {
      const recipient = recipients.get(event.userId);
      if (!recipient) continue;

      const message = reminderMessage({
        title: event.title,
        startsAt: occurrenceAt,
        allDay: event.allDay,
        reminderMinutesBefore: event.reminderMinutesBefore ?? 0,
        timezone: recipient.timezone,
      });

      if (recipient.remindInChannel) {
        await this.deliver(run, event.id, occurrenceAt, "assistant_channel", () =>
          this.reminders.postInChannel(event.userId, message),
        );
      }
      if (recipient.remindByEmail && recipient.email) {
        const to = recipient.email;
        await this.deliver(run, event.id, occurrenceAt, "email", () =>
          this.sendEmail({ to, message }),
        );
      }
    }

    return run;
  }

  private async deliver(
    run: ReminderRun,
    eventId: string,
    occurrenceAt: string,
    channel: ReminderChannel,
    send: () => Promise<void>,
  ): Promise<void> {
    if (!(await this.reminders.claim(eventId, occurrenceAt, channel))) return;

    try {
      await send();
      run.sent += 1;
    } catch (error) {
      run.failed += 1;
      logger.warn(
        SCOPE,
        `Rappel (${channel}) non envoyé pour ${eventId} : ${error instanceof Error ? error.message : "erreur inconnue"}`,
      );
      // Rendre la réservation, sans quoi le rappel ne serait jamais retenté.
      await this.reminders
        .release(eventId, occurrenceAt, channel)
        .catch((releaseError: unknown) => {
          logger.warn(
            SCOPE,
            `Réservation non rendue pour ${eventId} : ${releaseError instanceof Error ? releaseError.message : "erreur inconnue"}`,
          );
        });
    }
  }
}
