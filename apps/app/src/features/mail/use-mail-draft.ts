import AsyncStorage from "@react-native-async-storage/async-storage";

/** Ce que l'utilisateur a tapé, champ par champ : retrouvé tel quel à la réouverture. */
export type SavedDraft = {
  from: string;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  text: string;
};

const PREFIX = "jc.mail.draft.";

function isSavedDraft(value: unknown): value is SavedDraft {
  if (typeof value !== "object" || value === null) return false;
  const record: Record<string, unknown> = { ...value };
  return ["from", "to", "cc", "bcc", "subject", "text"].every(
    (field) => typeof record[field] === "string",
  );
}

/**
 * Brouillon retenu sur l'appareil, un par message : « nouveau », ou une réponse
 * précise à un mail. Fermer l'écran sans envoyer ne perd donc rien. Il ne quitte
 * pas l'appareil — le serveur ne le voit qu'à l'envoi.
 */
export async function loadMailDraft(key: string): Promise<SavedDraft | null> {
  try {
    const stored = await AsyncStorage.getItem(PREFIX + key);
    if (!stored) return null;
    const parsed: unknown = JSON.parse(stored);
    return isSavedDraft(parsed) ? parsed : null;
  } catch {
    // Stockage indisponible (navigation privée) : on repart d'une feuille blanche.
    return null;
  }
}

export function saveMailDraft(key: string, draft: SavedDraft): void {
  AsyncStorage.setItem(PREFIX + key, JSON.stringify(draft)).catch(() => undefined);
}

export function clearMailDraft(key: string): void {
  AsyncStorage.removeItem(PREFIX + key).catch(() => undefined);
}
