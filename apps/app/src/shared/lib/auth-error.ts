import { OTP_CODE_LENGTH, OTP_RESEND_COOLDOWN_SECONDS } from "@jc/domain";

/**
 * Traduit un échec d'authentification en message affichable.
 *
 * Deux raisons de ne jamais afficher l'erreur du fournisseur telle quelle :
 * elle est en anglais et technique (« Token has expired or is invalid »), et
 * elle peut exposer des détails d'implémentation. Le §13.4.4 proscrit par
 * ailleurs le jargon dans l'interface — l'utilisateur lit « code », jamais
 * « token » ni « OTP ».
 *
 * La fonction est totale : tout échec inconnu retombe sur un message générique
 * plutôt que de laisser passer une chaîne non maîtrisée.
 */

type ProviderFailure = {
  code: string | null;
  status: number | null;
  message: string;
};

const GENERIC = "Une erreur est survenue. Réessayez dans un instant.";

/**
 * Le fournisseur renvoie le même échec pour un code faux et pour un code
 * périmé — délibérément, pour ne pas indiquer à un attaquant lequel des deux
 * il a rencontré. Le message le reflète au lieu de trancher à tort.
 */
const INVALID_OR_EXPIRED =
  "Ce code est incorrect ou n'est plus valable. Vérifiez-le, ou demandez-en un nouveau.";

function readFailure(error: unknown): ProviderFailure {
  if (typeof error !== "object" || error === null) {
    // Une chaîne levée telle quelle reste exploitable ; le reste ne l'est pas.
    return { code: null, status: null, message: typeof error === "string" ? error : "" };
  }

  // L'opérateur `in` suffit à restreindre le type : pas de conversion forcée
  // sur une valeur dont on ne contrôle pas la forme.
  return {
    code: "code" in error && typeof error.code === "string" ? error.code : null,
    status: "status" in error && typeof error.status === "number" ? error.status : null,
    message: "message" in error && typeof error.message === "string" ? error.message : "",
  };
}

export function toAuthErrorMessage(error: unknown): string {
  const { code, status, message } = readFailure(error);
  const haystack = message.toLowerCase();

  // Panne réseau : distinguée du reste car elle appelle une action différente
  // de la part de l'utilisateur — vérifier sa connexion, pas son code.
  if (
    code === "network_error" ||
    haystack.includes("failed to fetch") ||
    haystack.includes("network request failed")
  ) {
    return "Connexion impossible. Vérifiez votre connexion internet, puis réessayez.";
  }

  switch (code) {
    case "otp_expired":
      return INVALID_OR_EXPIRED;
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return `Trop de demandes en peu de temps. Patientez ${OTP_RESEND_COOLDOWN_SECONDS} secondes avant de redemander un code.`;
    case "email_address_invalid":
    case "validation_failed":
      return "Cette adresse e-mail n'est pas valide.";
    case "email_address_not_authorized":
      return "Cette adresse ne peut pas recevoir de code pour le moment.";
    case "signup_disabled":
      return "Les inscriptions sont momentanément fermées.";
    case "user_banned":
      return "Ce compte est suspendu.";
    default:
      break;
  }

  // Les versions plus anciennes du fournisseur ne renseignent pas `code` :
  // on retombe sur le statut HTTP et sur le texte, faute de mieux.
  if (status === 429) {
    return `Trop de demandes en peu de temps. Patientez ${OTP_RESEND_COOLDOWN_SECONDS} secondes avant de redemander un code.`;
  }
  if (haystack.includes("token has expired") || haystack.includes("invalid")) {
    return INVALID_OR_EXPIRED;
  }
  if (haystack.includes("email")) {
    return "Cette adresse e-mail n'est pas valide.";
  }

  return GENERIC;
}

/** Message opposé à une saisie incomplète, avant même d'appeler le fournisseur. */
export const INCOMPLETE_CODE_MESSAGE = `Le code de connexion contient ${OTP_CODE_LENGTH} chiffres.`;
