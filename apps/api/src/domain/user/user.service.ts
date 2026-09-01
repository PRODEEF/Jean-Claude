import type { UpdateUserProfile, UserProfile } from "@jc/domain";
import { httpError } from "../../core/http.js";
import type { IUserRepository, ProfileRecord } from "./user.repository.interface.js";

/** Identité de l'appelant, telle que le middleware d'authentification la pose. */
export type ProfileOwner = {
  id: string;
  email: string;
  accessToken: string;
};

export class UserService {
  constructor(private readonly users: IUserRepository) {}

  async getProfile(owner: ProfileOwner): Promise<UserProfile> {
    const record = await this.users.findById(owner.id, owner.accessToken);
    if (!record) throw httpError(404, "Profil introuvable.");
    return withEmail(record, owner.email);
  }

  async updateProfile(owner: ProfileOwner, patch: UpdateUserProfile): Promise<UserProfile> {
    const updated = await this.users.update(owner.id, patch, owner.accessToken);
    return withEmail(updated, owner.email);
  }
}

/**
 * L'e-mail ne vient pas de `profiles` mais du jeton de session.
 *
 * Le dupliquer en base obligerait à le resynchroniser à chaque changement
 * d'adresse ; le lire du jeton garantit qu'on affiche celle qui ouvre
 * effectivement la session.
 */
function withEmail(record: ProfileRecord, email: string): UserProfile {
  return { ...record, email };
}
