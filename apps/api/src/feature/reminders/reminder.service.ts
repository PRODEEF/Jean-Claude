import { logger } from "../../core/logger.js";
import { reminderMessage } from "./reminder-message.js";
import type { IReminderRepository, ReminderChannel } from "./reminder.repository.interface.js";
import {
  MAX_LEAD_MS,
  dueListReminders,
  dueReminders,
  type DueListReminder,
} from "./reminder-schedule.js";

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
    const from = new Date(now.getTime() - WINDOW_MS);
    const to = new Date(now.getTime() + MAX_LEAD_MS);

    const events = await this.reminders.findRemindable(from, to);
    const due = dueReminders(events, now, WINDOW_MS);
    const dueLists = await this.dueLists(from, to, now);
    if (due.length === 0 && dueLists.length === 0) return { sent: 0, failed: 0 };

    const recipients = new Map(
      (
        await this.reminders.findRecipients([
          ...new Set([
            ...due.map((item) => item.event.userId),
            ...dueLists.map((item) => item.list.userId),
          ]),
        ])
      ).map((recipient) => [recipient.userId, recipient]),
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
      const slot = {
        label: event.id,
        claim: (channel: ReminderChannel) => this.reminders.claim(event.id, occurrenceAt, channel),
        release: (channel: ReminderChannel) =>
          this.reminders.release(event.id, occurrenceAt, channel),
      };

      if (recipient.remindInChannel) {
        await this.deliver(run, slot, "assistant_channel", () =>
          this.reminders.postInChannel(event.userId, message),
        );
      }
      if (recipient.remindByEmail && recipient.email) {
        const mailTo = recipient.email;
        await this.deliver(run, slot, "email", () => this.sendEmail({ to: mailTo, message }));
      }
    }

    // Une panne côté listes (table absente, base injoignable) ne doit jamais
    // retenir les rappels des rendez-vous, qui partent avant.
    try {
      for (const { list, occurrenceAt } of dueLists) {
        const recipient = recipients.get(list.userId);
        if (!recipient) continue;

        const message = reminderMessage({
          title: list.title,
          startsAt: occurrenceAt,
          allDay: list.dueAllDay ?? false,
          reminderMinutesBefore: list.reminderMinutesBefore ?? 0,
          timezone: recipient.timezone,
        });
        const slot = {
          label: `liste ${list.id}`,
          claim: (channel: ReminderChannel) =>
            this.reminders.claimList(list.id, occurrenceAt, channel),
          release: (channel: ReminderChannel) =>
            this.reminders.releaseList(list.id, occurrenceAt, channel),
        };

        if (recipient.remindInChannel) {
          await this.deliver(run, slot, "assistant_channel", () =>
            this.reminders.postInChannel(list.userId, message),
          );
        }
        if (recipient.remindByEmail && recipient.email) {
          const mailTo = recipient.email;
          await this.deliver(run, slot, "email", () => this.sendEmail({ to: mailTo, message }));
        }
      }
    } catch (error) {
      run.failed += 1;
      logger.warn(
        SCOPE,
        `Rappels de listes interrompus : ${error instanceof Error ? error.message : "erreur inconnue"}`,
      );
    }

    return run;
  }

  /** Rappels de listes à envoyer ; une lecture qui échoue donne zéro rappel, pas une panne. */
  private async dueLists(from: Date, to: Date, now: Date): Promise<DueListReminder[]> {
    try {
      return dueListReminders(await this.reminders.findRemindableLists(from, to), now, WINDOW_MS);
    } catch (error) {
      logger.warn(
        SCOPE,
        `Lecture des listes à rappeler impossible : ${error instanceof Error ? error.message : "erreur inconnue"}`,
      );
      return [];
    }
  }

  private async deliver(
    run: ReminderRun,
    slot: {
      label: string;
      claim: (channel: ReminderChannel) => Promise<boolean>;
      release: (channel: ReminderChannel) => Promise<void>;
    },
    channel: ReminderChannel,
    send: () => Promise<void>,
  ): Promise<void> {
    if (!(await slot.claim(channel))) return;

    try {
      await send();
      run.sent += 1;
    } catch (error) {
      run.failed += 1;
      logger.warn(
        SCOPE,
        `Rappel (${channel}) non envoyé pour ${slot.label} : ${error instanceof Error ? error.message : "erreur inconnue"}`,
      );
      // Rendre la réservation, sans quoi le rappel ne serait jamais retenté.
      await slot.release(channel).catch((releaseError: unknown) => {
        logger.warn(
          SCOPE,
          `Réservation non rendue pour ${slot.label} : ${releaseError instanceof Error ? releaseError.message : "erreur inconnue"}`,
        );
      });
    }
  }
}
