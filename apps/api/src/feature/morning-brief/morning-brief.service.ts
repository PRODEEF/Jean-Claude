import { logger } from "../../core/logger.js";
import type { BriefWriter } from "./morning-brief-writer.js";
import { briefMessage, dayBounds, fixedGreeting, isBriefTime, localDay } from "./morning-brief.js";
import type { IMorningBriefRepository } from "./morning-brief.repository.interface.js";

const SCOPE = "morning-brief";

export type MorningBriefRun = { sent: number; failed: number };

/**
 * Écrit le point du matin dans le canal Jean-Claude : la journée à venir, en une
 * introduction chaleureuse puis la liste de ce qui est prévu.
 *
 * Appelé par le planificateur, jamais par un utilisateur. Un seul point par jour
 * et par personne (`claim`), rien quand la journée est vide — un bonjour sans
 * rien à dire serait du bruit —, et un échec n'arrête pas les autres.
 */
export class MorningBriefService {
  constructor(
    private readonly briefs: IMorningBriefRepository,
    /** Absent, l'introduction est toujours la phrase fixe. */
    private readonly write?: BriefWriter,
  ) {}

  async run(now: Date = new Date()): Promise<MorningBriefRun> {
    const run: MorningBriefRun = { sent: 0, failed: 0 };

    for (const recipient of await this.briefs.findRecipients()) {
      if (!isBriefTime(now, recipient.timezone)) continue;

      const day = localDay(now, recipient.timezone);
      try {
        if (!(await this.briefs.claim(recipient.userId, day))) continue;
      } catch (error) {
        run.failed += 1;
        logger.warn(SCOPE, `Point du matin non réservé : ${reason(error)}`);
        continue;
      }

      try {
        const { from, to } = dayBounds(now, recipient.timezone);
        const items = await this.briefs.agendaOf(recipient.userId, from, to);
        // Journée vide : la réservation reste prise, le point ne sera pas retenté.
        if (items.length === 0) continue;

        const greeting = await this.greet(recipient, items.length);
        await this.briefs.postInChannel(
          recipient.userId,
          briefMessage(greeting, items, recipient.timezone),
        );
        run.sent += 1;
      } catch (error) {
        run.failed += 1;
        logger.warn(SCOPE, `Point du matin non envoyé : ${reason(error)}`);
        // Rendre la réservation, sans quoi le point ne serait jamais retenté.
        await this.briefs.release(recipient.userId, day).catch((releaseError: unknown) => {
          logger.warn(SCOPE, `Réservation non rendue : ${reason(releaseError)}`);
        });
      }
    }

    return run;
  }

  private async greet(
    recipient: { displayName: string | null; assistantName: string; memory: string | null },
    itemCount: number,
  ): Promise<string> {
    if (!this.write) return fixedGreeting(recipient.displayName);

    try {
      return await this.write(
        {
          displayName: recipient.displayName,
          assistantName: recipient.assistantName,
          memory: recipient.memory,
        },
        itemCount,
      );
    } catch (error) {
      logger.warn(SCOPE, `Introduction fixe, rédaction impossible : ${reason(error)}`);
      return fixedGreeting(recipient.displayName);
    }
  }
}

function reason(error: unknown): string {
  return error instanceof Error ? error.message : "erreur inconnue";
}
