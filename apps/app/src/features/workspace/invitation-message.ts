import { Platform } from "react-native";

/**
 * Texte à copier pour prévenir la personne, en plus de l'e-mail envoyé par l'API.
 *
 * Le lien n'est connu que sur le web, où l'adresse de la page fait foi ; sur
 * mobile, aucune variable d'environnement ne porte l'adresse publique de l'app.
 */
export function invitationMessage(workspaceName: string, email: string): string {
  const link = Platform.OS === "web" && typeof window !== "undefined" ? window.location.origin : "";
  const where = link ? `Connectez-vous sur ${link}` : "Connectez-vous à Jean-Claude";
  return `Bonjour, je vous invite à rejoindre l'espace « ${workspaceName} » sur Jean-Claude. ${where} avec l'adresse ${email} : l'invitation vous y attend.`;
}
