import type {
  CalendarRange,
  CreateWorkspaceEvent,
  EventSpace,
  UpdateWorkspaceEvent,
  WorkspaceEvent,
} from "@jc/domain";

/** Un événement d'espace, avec l'espace et la conversation qui le portent. */
export type WorkspaceEventWithSpace = WorkspaceEvent & { space: EventSpace };

/** Ce qui signe la ligne laissée dans le fil, et le fuseau où l'écrire. */
export type EventAuthor = { displayName: string | null; timezone: string };

export interface IWorkspaceEventRepository {
  /** L'espace de la conversation, `null` si `userId` n'en est pas membre. */
  findSpace(groupId: string, userId: string, accessToken: string): Promise<EventSpace | null>;
  /** `null` si l'événement n'existe pas ou si l'appelant n'est pas membre de sa conversation. */
  findById(id: string, accessToken: string): Promise<WorkspaceEvent | null>;
  /** Événements des conversations de l'appelant qui chevauchent la fenêtre. */
  findInRange(range: CalendarRange, accessToken: string): Promise<WorkspaceEventWithSpace[]>;
  create(
    userId: string,
    input: CreateWorkspaceEvent,
    createdByAssistant: boolean,
    accessToken: string,
  ): Promise<WorkspaceEvent>;
  update(id: string, patch: UpdateWorkspaceEvent, accessToken: string): Promise<WorkspaceEvent>;
  delete(id: string, accessToken: string): Promise<void>;
  findAuthor(userId: string, accessToken: string): Promise<EventAuthor>;
  /** Ligne du fil qui garde la trace d'un geste sur un événement (`role = 'system'`). */
  appendSystemMessage(
    groupId: string,
    userId: string,
    content: string,
    accessToken: string,
  ): Promise<void>;
}
