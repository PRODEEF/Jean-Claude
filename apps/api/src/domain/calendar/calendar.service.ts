import type {
  CalendarEvent,
  CalendarRange,
  CreateCalendarEvent,
  UpdateCalendarEvent,
} from "@jc/domain";
import { httpError } from "../../core/http.js";
import type { ICalendarRepository } from "./calendar.repository.interface.js";

export class CalendarService {
  constructor(private readonly events: ICalendarRepository) {}

  /**
   * Événements de la fenêtre demandée.
   *
   * Les séries récurrentes ne sont pas encore expansées : une ligne portant
   * une `rrule` n'apparaît qu'à la date de son premier créneau. Le déploiement
   * des occurrences relève d'A.11, qui traite aussi le rappel automatique.
   */
  list(range: CalendarRange, accessToken: string): Promise<CalendarEvent[]> {
    return this.events.findInRange(range, accessToken);
  }

  // `async` malgré l'absence d'`await` : la validation lève, et une méthode
  // qui annonce une promesse doit la rejeter plutôt qu'échouer avant de la
  // rendre — sinon l'appelant devrait l'entourer d'un try/catch en plus.
  async create(
    userId: string,
    input: CreateCalendarEvent,
    accessToken: string,
  ): Promise<CalendarEvent> {
    assertOrderedRange(input.startsAt, input.endsAt ?? null);
    return this.events.create(userId, input, accessToken);
  }

  /**
   * Modifie un événement.
   *
   * Le contrôle de cohérence porte sur l'événement tel qu'il sera après la
   * modification, et non sur le seul patch : avancer la fin d'un rendez-vous
   * sans toucher à son début doit être refusé si elle passe devant lui.
   */
  async update(
    id: string,
    patch: UpdateCalendarEvent,
    accessToken: string,
  ): Promise<CalendarEvent> {
    const existing = await this.events.findById(id, accessToken);
    if (!existing) throw httpError(404, "Événement introuvable.");

    assertOrderedRange(
      patch.startsAt ?? existing.startsAt,
      patch.endsAt !== undefined ? patch.endsAt : existing.endsAt,
    );

    return this.events.update(id, patch, accessToken);
  }

  async delete(id: string, accessToken: string): Promise<void> {
    const existing = await this.events.findById(id, accessToken);
    if (!existing) throw httpError(404, "Événement introuvable.");
    await this.events.delete(id, accessToken);
  }
}

/**
 * Doublon volontaire de la contrainte `calendar_events_range_valid`.
 *
 * La base reste le garde-fou ultime, quel que soit le chemin d'écriture, mais
 * elle ne sait rendre qu'une erreur Postgres brute — donc un 500 opaque. Un
 * 400 lisible ici vaut mieux pour le formulaire qui a produit la saisie.
 */
function assertOrderedRange(startsAt: string, endsAt: string | null): void {
  if (endsAt !== null && new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
    throw httpError(400, "La fin de l'événement doit suivre son début.");
  }
}
