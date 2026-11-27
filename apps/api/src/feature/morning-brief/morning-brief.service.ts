import { logger } from "../../core/logger.js";
import type { BriefWriter } from "./morning-brief-writer.js";
import type { BriefRecipient } from "./morning-brief.repository.interface.js";
import {
  afternoonMessage,
  BRIEF_KINDS,
  briefMessage,
  dayBounds,
  eveningMessage,
  fixedGreeting,
  isBriefTime,
  localDay,
  tomorrowBounds,
  type BriefItem,
  type BriefKind,
} from "./morning-brief.js";
import type { IMorningBriefRepository } from "./morning-brief.repository.interface.js";

const SCOPE = "morning-brief";

export type MorningBriefRun = { sent: number; failed: number };

/**
 * Écrit les points de la journée dans le canal Jean-Claude : le matin ce qui est
 * prévu, l'après-midi ce qu'il reste à faire, le soir le bilan et le programme.
 *
 * Appelé par le planificateur, jamais par un utilisateur. Un seul point de chaque
 * sorte par jour et par personne (`claim`) et un échec n'arrête pas les autres.
 * Le matin ne dit rien d'une journée vide ; l'après-midi et le soir, eux, disent
 * qu'elle est calme.
 */
export class MorningBriefService {
  constructor(
    private readonly briefs: IMorningBriefRepository,
    /** Absent, l'introduction est toujours la phrase fixe. */
    private readonly write?: BriefWriter,
  ) {}

  async run(now: Date = new Date()): Promise<MorningBriefRun> {
    const run: MorningBriefRun = { sent: 0, failed: 0 };
    for (const kind of BRIEF_KINDS) await this.runKind(kind, now, run);
    return run;
  }

  private async runKind(kind: BriefKind, now: Date, run: MorningBriefRun): Promise<void> {
    for (const recipient of await this.briefs.findRecipients(kind)) {
      if (!isBriefTime(now, recipient.timezone, kind, recipient.bounds)) continue;

      const day = localDay(now, recipient.timezone);
      try {
        if (!(await this.briefs.claim(recipient.userId, day, kind))) continue;
      } catch (error) {
        run.failed += 1;
        logger.warn(SCOPE, `Point ${kind} non réservé : ${reason(error)}`);
        continue;
      }

      try {
        const { from, to } = dayBounds(now, recipient.timezone);
        const today = await this.briefs.agendaOf(recipient.userId, from, to);
        const message = await this.compose(kind, recipient, today, now);
        // Journée vide du matin : la réservation reste prise, le point ne sera pas retenté.
        if (message === null) continue;

        await this.briefs.postInChannel(recipient.userId, message);
        run.sent += 1;
      } catch (error) {
        run.failed += 1;
        logger.warn(SCOPE, `Point ${kind} non envoyé : ${reason(error)}`);
        // Rendre la réservation, sans quoi le point ne serait jamais retenté.
        await this.briefs.release(recipient.userId, day, kind).catch((releaseError: unknown) => {
          logger.warn(SCOPE, `Réservation non rendue : ${reason(releaseError)}`);
        });
      }
    }
  }

  /** Le texte du point, ou `null` quand le matin n'a rien à dire. */
  private async compose(
    kind: BriefKind,
    recipient: BriefRecipient,
    today: BriefItem[],
    now: Date,
  ): Promise<string | null> {
    if (kind === "morning") {
      // Ce qui est déjà fait n'est plus « à faire aujourd'hui ».
      const open = today.filter((item) => !item.done);
      if (open.length === 0) return null;
      return briefMessage(await this.greet(recipient, open.length, kind), open, recipient.timezone);
    }

    if (kind === "afternoon") {
      return afternoonMessage(
        await this.greet(recipient, today.length, kind),
        today,
        now,
        recipient.timezone,
      );
    }

    const tomorrowRange = tomorrowBounds(now, recipient.timezone);
    const tomorrow = await this.briefs.agendaOf(
      recipient.userId,
      tomorrowRange.from,
      tomorrowRange.to,
    );
    return eveningMessage(
      await this.greet(recipient, today.length, kind),
      today,
      tomorrow,
      now,
      recipient.timezone,
      recipient.bounds,
    );
  }

  private async greet(
    recipient: BriefRecipient,
    itemCount: number,
    kind: BriefKind,
  ): Promise<string> {
    if (!this.write) return fixedGreeting(recipient.displayName, kind);

    try {
      return await this.write(
        {
          displayName: recipient.displayName,
          assistantName: recipient.assistantName,
          memory: recipient.memory,
        },
        itemCount,
        kind,
      );
    } catch (error) {
      logger.warn(SCOPE, `Introduction fixe, rédaction impossible : ${reason(error)}`);
      return fixedGreeting(recipient.displayName, kind);
    }
  }
}

function reason(error: unknown): string {
  return error instanceof Error ? error.message : "erreur inconnue";
}
