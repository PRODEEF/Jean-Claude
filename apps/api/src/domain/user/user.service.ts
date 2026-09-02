import type { UpdateUserProfile, UserProfile } from "@jc/domain";
import { httpError } from "../../core/http.js";
import type { IUserRepository, ProfilePatch, ProfileRecord } from "./user.repository.interface.js";

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
    const resolved = await this.resolve(owner, patch);
    const updated = await this.users.update(owner.id, resolved, owner.accessToken);
    return withEmail(updated, owner.email);
  }

  /**
   * Clôt la conversation d'accueil sans rien retenir (§6.3, A.13).
   *
   * C'est le bouton « Passer » : l'utilisateur n'a rien raconté, mais on ne
   * doit plus l'accueillir. Quand l'accueil va au bout, c'est le tour de
   * dialogue qui écrit la mémoire, pas cette route.
   */
  async completeOnboarding(owner: ProfileOwner): Promise<UserProfile> {
    const record = await this.users.completeOnboarding(owner.id, null, owner.accessToken);
    return withEmail(record, owner.email);
  }

  /**
   * Recompose le périmètre avant écriture (A.10).
   *
   * La page bascule un interrupteur à la fois, mais les capacités tiennent
   * dans une seule colonne `jsonb` : écrire le patch tel quel effacerait
   * celles qu'il ne mentionne pas.
   */
  private async resolve(owner: ProfileOwner, patch: UpdateUserProfile): Promise<ProfilePatch> {
    const { scope, ...rest } = patch;
    if (!scope) return rest;

    const current = await this.users.findById(owner.id, owner.accessToken);
    if (!current) throw httpError(404, "Profil introuvable.");

    // Fusion capacité par capacité plutôt qu'à la volée : une capacité ajoutée
    // au schéma fait alors échouer la compilation ici, là où un `spread` aurait
    // silencieusement laissé le nouveau réglage inapplicable.
    const base = current.preferences.scope;

    return {
      ...rest,
      scope: {
        morningReminders: scope.morningReminders ?? base.morningReminders,
        folderOrganization: scope.folderOrganization ?? base.folderOrganization,
        structureSuggestions: scope.structureSuggestions ?? base.structureSuggestions,
        proactiveTaskDetection: scope.proactiveTaskDetection ?? base.proactiveTaskDetection,
        proactiveScheduling: scope.proactiveScheduling ?? base.proactiveScheduling,
      },
    };
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
