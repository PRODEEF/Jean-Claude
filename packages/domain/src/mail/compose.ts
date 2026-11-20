import type { MailMessage } from "./mail.schema";

export type ComposeKind = "new" | "reply" | "replyAll" | "forward";

/** Brouillon prêt à remplir l'écran de rédaction. */
export type MailDraft = {
  to: string[];
  cc: string[];
  subject: string;
  text: string;
  /** Renseigné pour une réponse : garde la conversation groupée chez les destinataires. */
  inReplyTo?: string;
};

export const EMPTY_DRAFT: MailDraft = { to: [], cc: [], subject: "", text: "" };

function unique(addresses: string[]): string[] {
  return [...new Set(addresses.map((address) => address.toLowerCase()))];
}

// « Re : Re : » qui s'empile n'apprend rien au destinataire.
function withPrefix(prefix: "Re" | "Tr", subject: string): string {
  const pattern = prefix === "Re" ? /^\s*(re|réf)\s*:\s*/i : /^\s*(tr|fwd?)\s*:\s*/i;
  return `${prefix} : ${subject.replace(pattern, "").trim()}`.trim();
}

/** Le texte cité sous la réponse : chaque ligne préfixée, comme dans toute messagerie. */
function quoted(message: MailMessage): string {
  const when = message.date
    ? new Date(message.date).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" })
    : "";
  const head = `${when ? `Le ${when}, ` : ""}${message.from || "l'expéditeur"} a écrit :`;
  const body = (message.text ?? "").trim().split("\n");
  return `\n\n${head}\n${body.map((line) => `> ${line}`).join("\n")}`;
}

/**
 * Brouillon d'une réponse, d'une réponse à tous ou d'un transfert.
 *
 * `own` est l'adresse de la boîte qui écrit : « répondre à tous » ne doit pas
 * s'envoyer le mail à soi-même.
 */
export function draftFor(
  kind: Exclude<ComposeKind, "new">,
  message: MailMessage,
  own: string,
): MailDraft {
  const me = own.toLowerCase();
  if (kind === "forward") {
    const header = [
      "---------- Message transféré ----------",
      `De : ${message.from}`,
      `À : ${message.to}`,
      `Objet : ${message.subject}`,
    ].join("\n");
    return {
      to: [],
      cc: [],
      subject: withPrefix("Tr", message.subject),
      text: `\n\n${header}\n\n${message.text ?? ""}`,
    };
  }

  const to = unique(message.replyTo).filter((address) => address !== me);
  const cc =
    kind === "replyAll"
      ? unique([...message.toList, ...message.ccList]).filter(
          (address) => address !== me && !to.includes(address),
        )
      : [];
  return {
    to,
    cc,
    subject: withPrefix("Re", message.subject),
    text: quoted(message),
    ...(message.messageId ? { inReplyTo: message.messageId } : {}),
  };
}
