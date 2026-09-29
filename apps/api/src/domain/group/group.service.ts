import type {
  CreateGroup,
  CursorPagination,
  Group,
  GroupMessage,
  Paginated,
  SendGroupMessage,
} from "@jc/domain";
import { httpError } from "../../core/http.js";
import type { IGroupRepository } from "./group.repository.interface.js";

/**
 * Discussions de groupe d'un espace d'équipe.
 *
 * Jean-Claude n'y intervient pas encore (lot 4 de docs/COLLABORATION.md) :
 * un message envoyé ici n'appelle aucun modèle.
 */
export class GroupService {
  constructor(private readonly groups: IGroupRepository) {}

  async list(workspaceId: string, userId: string, accessToken: string): Promise<Group[]> {
    await this.requireWorkspaceMembers(workspaceId, userId, accessToken);
    return this.groups.findByWorkspace(workspaceId, userId, accessToken);
  }

  async create(userId: string, input: CreateGroup, accessToken: string): Promise<Group> {
    const workspaceMembers = await this.requireWorkspaceMembers(
      input.workspaceId,
      userId,
      accessToken,
    );

    // Le créateur est membre d'office : le cocher en plus ne doit ni doubler
    // sa ligne ni compter comme « une autre personne ».
    const others = [...new Set(input.memberIds)].filter((id) => id !== userId);
    if (others.length === 0) throw httpError(400, "Choisissez au moins une personne.");
    if (others.some((id) => !workspaceMembers.includes(id))) {
      throw httpError(400, "Une des personnes choisies ne fait pas partie de l'espace.");
    }

    return this.groups.create(userId, { ...input, memberIds: others }, accessToken);
  }

  async get(id: string, userId: string, accessToken: string): Promise<Group> {
    const group = await this.groups.findById(id, userId, accessToken);
    if (!group) throw httpError(404, "Groupe introuvable.");
    return group;
  }

  async listMessages(
    id: string,
    userId: string,
    pagination: CursorPagination,
    accessToken: string,
  ): Promise<Paginated<GroupMessage>> {
    await this.get(id, userId, accessToken);
    return this.groups.findMessages(
      id,
      {
        ...(pagination.cursor ? { cursor: pagination.cursor } : {}),
        limit: pagination.limit,
      },
      accessToken,
    );
  }

  async send(
    id: string,
    userId: string,
    input: SendGroupMessage,
    accessToken: string,
  ): Promise<GroupMessage> {
    await this.get(id, userId, accessToken);
    return this.groups.appendMessage(id, userId, input.content, accessToken);
  }

  async markRead(id: string, userId: string, accessToken: string): Promise<Group> {
    const group = await this.get(id, userId, accessToken);
    if (group.unreadCount === 0) return group;

    await this.groups.markRead(id, userId, accessToken);
    return { ...group, unreadCount: 0 };
  }

  /** Un non-membre reçoit un 404 : il n'a pas à apprendre que l'espace existe. */
  private async requireWorkspaceMembers(
    workspaceId: string,
    userId: string,
    accessToken: string,
  ): Promise<string[]> {
    const members = await this.groups.findWorkspaceMemberIds(workspaceId, accessToken);
    if (!members.includes(userId)) throw httpError(404, "Espace introuvable.");
    return members;
  }
}
