import { config } from "../config.js";
import { logger } from "../logger.js";

const SCOPE = "mail.invitation";

export type InvitationMail = {
  to: string;
  workspaceName: string;
};

/**
 * Envoie l'e-mail d'invitation via Resend.
 *
 * L'invitation est déjà enregistrée : un échec ici ne doit pas l'annuler.
 * Sans clé ou sans expéditeur vérifié, on n'appelle pas Resend.
 */
export async function sendInvitationEmail(mail: InvitationMail): Promise<void> {
  if (!config.resendApiKey || !config.resendFrom) {
    logger.warn(
      SCOPE,
      "E-mail non envoyé : RESEND_API_KEY ou RESEND_FROM manquant.",
    );
    return;
  }

  const where = config.appUrl
    ? `Connectez-vous sur ${config.appUrl}`
    : "Connectez-vous à Jean-Claude";
  const text = [
    "Bonjour,",
    "",
    `Vous êtes invité à rejoindre l'espace « ${mail.workspaceName} » sur Jean-Claude.`,
    `${where} avec l'adresse ${mail.to} : l'invitation vous y attend.`,
  ].join("\n");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: config.resendFrom,
      to: [mail.to],
      subject: `Invitation à rejoindre « ${mail.workspaceName} »`,
      text,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Resend a refusé l'envoi (${response.status}) : ${detail}`);
  }
}
