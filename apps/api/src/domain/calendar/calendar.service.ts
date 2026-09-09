import type {
  CalendarEvent,
  CalendarRange,
  CreateCalendarEvent,
  UpdateCalendarEvent,
} from "@jc/domain";
import { httpError } from "../../core/http.js";
import type { ITaskRepository } from "../task/task.repository.interface.js";
import type { ICalendarRepository } from "./calendar.repository.interface.js";

export class CalendarService {
  /**
   * `taskLists` : un service `domain/` qui en consulte un autre directement
   * (au lieu de passer par `feature/`), comme `TaskService` le fait dans
   * l'autre sens avec `ICalendarRepository`. Le lien qu'il sert à
   * maintenir — `task_lists.event_id` — appartient à la todoliste, pas au
   * rendez-vous, mais c'est bien depuis la fiche du rendez-vous que
   * l'utilisateur peut aussi déplacer la date des deux à la fois (A.3).
   */
  constructor(
    private readonly events: ICalendarRepository,
    private readonly taskLists: ITaskRepository,
  ) {}

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

    const updated = await this.events.update(id, patch, accessToken);

    // La liste ne le sait pas tant qu'on ne le lui dit pas : sans ce geste,
    // la fiche du rendez-vous et l'échéance de la todoliste qu'il représente
    // divergent en silence dès qu'on déplace l'un des deux depuis l'agenda.
    if (patch.startsAt !== undefined) {
      await this.syncLinkedTaskList(id, updated.startsAt, accessToken);
    }

    return updated;
  }

  /**
   * Répercute la date d'un rendez-vous sur l'échéance de la todoliste qui
   * s'y rattache, quand il en existe une (A.3).
   *
   * Sans effet pour l'immense majorité des événements, qui ne représentent
   * aucune liste — la lecture reste donc silencieuse plutôt que de faire
   * échouer la modification du rendez-vous.
   */
  private async syncLinkedTaskList(
    eventId: string,
    startsAt: string,
    accessToken: string,
  ): Promise<void> {
    const list = await this.taskLists.findByEventId(eventId, accessToken);
    if (!list) return;

    await this.taskLists.updateList(list.id, { dueAt: startsAt }, accessToken);
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
