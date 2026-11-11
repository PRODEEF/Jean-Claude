import { config } from "../config.js";

export type ReminderMail = {
  to: string;
  /** Phrase déjà rédigée, la même que dans le canal : « Rappel : Kiné, à 18h… ». */
  message: string;
};

/**
 * Envoie l'e-mail d'un rappel via Resend.
 *
 * Contrairement à l'invitation, un échec doit remonter : le planificateur rend
 * alors la réservation et retente au passage suivant. Sans clé ou sans
 * expéditeur vérifié, c'est une erreur, pas un envoi silencieusement perdu.
 */
export async function sendReminderEmail(mail: ReminderMail): Promise<void> {
  if (!config.resendApiKey || !config.resendFrom) {
    throw new Error("RESEND_API_KEY ou RESEND_FROM manquant.");
  }

  const text = [mail.message, "", config.appUrl || "Jean-Claude"].join("\n");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: config.resendFrom,
      to: [mail.to],
      subject: mail.message.replace(/\.$/, ""),
      text,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Resend a refusé l'envoi (${response.status}) : ${detail}`);
  }
}
