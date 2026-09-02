import type { AssistantScope, UpdateUserProfile, UserProfile } from "@jc/domain";

/**
 * Profil tel que la table `profiles` le porte.
 *
 * L'e-mail en est absent : il vit dans `auth.users`, hors de portée du
 * Repository. C'est le Service qui le rapporte depuis le contexte
 * d'authentification pour former un `UserProfile` complet.
 */
export type ProfileRecord = Omit<UserProfile, "email">;

/**
 * Patch déjà résolu par le Service, prêt à être écrit tel quel.
 *
 * Il ne diffère d'`UpdateUserProfile` que sur le périmètre : celui-ci occupe
 * une unique colonne `jsonb`, qu'un patch partiel amputerait des capacités
 * qu'il ne mentionne pas. Le Service le recompose donc en entier avant de
 * descendre ici, et le type le dit.
 */
export type ProfilePatch = Omit<UpdateUserProfile, "scope"> & { scope?: AssistantScope };

export interface IUserRepository {
  findById(userId: string, accessToken: string): Promise<ProfileRecord | null>;
  update(userId: string, patch: ProfilePatch, accessToken: string): Promise<ProfileRecord>;
  /**
   * Clôt la conversation d'accueil (§6.3, A.13).
   *
   * `memory` à `null` laisse la mémoire intacte : c'est le cas de l'utilisateur
   * qui passe l'étape, dont on n'a rien appris mais qu'il ne faut plus accueillir.
   */
  completeOnboarding(
    userId: string,
    memory: string | null,
    accessToken: string,
  ): Promise<ProfileRecord>;
}
