import {
  describeEventChange,
  type CalendarEntry,
  type CalendarRange,
  type CreateWorkspaceEvent,
  type EventChange,
  type UpdateWorkspaceEvent,
  type WorkspaceEvent,
} from "@jc/domain";
import { httpError } from "../../core/http.js";
import type {
  IWorkspaceEventRepository,
  WorkspaceEventWithSpace,
} from "./workspace-event.repository.interface.js";

/**
 * Événements d'espace (lot 8) : tout membre de la conversation les crée, les
 * modifie, les retire, et chaque geste laisse une ligne dans le fil — c'est
 * ainsi que les autres membres l'apprennent.
 */
export class WorkspaceEventService {
  constructor(private readonly events: IWorkspaceEventRepository) {}

  /**
   * `byAssistant` : l'événement vient d'une proposition de Jean-Claude
   * acceptée par `userId`, qui reste l'auteur du geste.
   */
  async create(
    userId: string,
    input: CreateWorkspaceEvent,
    accessToken: string,
    byAssistant = false,
  ): Promise<WorkspaceEvent> {
    const space = await this.events.findSpace(input.groupId, userId, accessToken);
    if (!space) throw httpError(404, "Conversation introuvable.");
    assertOrderedRange(input.startsAt, input.endsAt ?? null);

    const event = await this.events.create(userId, input, byAssistant, accessToken);
    await this.trace(event.groupId, userId, { kind: "created", event }, accessToken);
    return event;
  }

  /** Le contrôle d'horaire porte sur l'événement tel qu'il sera, pas sur le seul patch. */
  async update(
    id: string,
    userId: string,
    patch: UpdateWorkspaceEvent,
    accessToken: string,
  ): Promise<WorkspaceEvent> {
    const before = await this.require(id, accessToken);
    assertOrderedRange(
      patch.startsAt ?? before.startsAt,
      patch.endsAt !== undefined ? patch.endsAt : before.endsAt,
    );

    const event = await this.events.update(id, patch, accessToken);
    await this.trace(event.groupId, userId, { kind: "updated", event, before }, accessToken);
    return event;
  }

  async delete(id: string, userId: string, accessToken: string): Promise<void> {
    const event = await this.require(id, accessToken);
    await this.events.delete(id, accessToken);
    await this.trace(event.groupId, userId, { kind: "deleted", event }, accessToken);
  }

  /** Les événements des conversations de l'appelant, sous la forme du calendrier. */
  async listForCalendar(range: CalendarRange, accessToken: string): Promise<CalendarEntry[]> {
    return (await this.events.findInRange(range, accessToken)).map(toCalendarEntry);
  }

  private async require(id: string, accessToken: string): Promise<WorkspaceEvent> {
    const event = await this.events.findById(id, accessToken);
    if (!event) throw httpError(404, "Événement introuvable.");
    return event;
  }

  private async trace(
    groupId: string,
    userId: string,
    change: EventChange,
    accessToken: string,
  ): Promise<void> {
    const author = await this.events.findAuthor(userId, accessToken);
    const content = describeEventChange(
      author.displayName?.trim() || "Un membre",
      change,
      author.timezone,
    );
    await this.events.appendSystemMessage(groupId, userId, content, accessToken);
  }
}

/**
 * Un événement d'espace sous la forme d'une entrée du calendrier : ponctuel,
 * rangé nulle part en propre, rattaché à sa conversation.
 */
export function toCalendarEntry(event: WorkspaceEventWithSpace): CalendarEntry {
  return {
    id: event.id,
    title: event.title,
    notes: event.notes,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    allDay: event.allDay,
    rrule: null,
    reminderMinutesBefore: event.reminderMinutesBefore,
    folderId: null,
    conversationId: event.groupId,
    createdByAssistant: event.createdByAssistant,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
    space: event.space,
  };
}

/** Même règle que le calendrier personnel : un 400 lisible plutôt qu'une contrainte en 500. */
function assertOrderedRange(startsAt: string, endsAt: string | null): void {
  if (endsAt !== null && new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
    throw httpError(400, "La fin de l'événement doit suivre son début.");
  }
}
