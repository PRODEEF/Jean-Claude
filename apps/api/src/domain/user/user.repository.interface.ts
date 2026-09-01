import type { UpdateUserProfile, UserProfile } from "@jc/domain";

/**
 * Profil tel que la table `profiles` le porte.
 *
 * L'e-mail en est absent : il vit dans `auth.users`, hors de portée du
 * Repository. C'est le Service qui le rapporte depuis le contexte
 * d'authentification pour former un `UserProfile` complet.
 */
export type ProfileRecord = Omit<UserProfile, "email">;

export interface IUserRepository {
  findById(userId: string, accessToken: string): Promise<ProfileRecord | null>;
  update(userId: string, patch: UpdateUserProfile, accessToken: string): Promise<ProfileRecord>;
}
