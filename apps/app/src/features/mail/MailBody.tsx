import { Text } from "@/shared/ui/text";

/**
 * Corps d'un mail, version téléphone : le texte seul.
 *
 * La mise en forme (HTML) demande une vue web isolée, que le web a
 * (`MailBody.web.tsx`) et que le téléphone n'a pas encore : mieux vaut un texte
 * lisible qu'un affichage à moitié sûr.
 */
export function MailBody({
  text,
}: {
  html: string | null;
  text: string | null;
  showImages: boolean;
}) {
  return (
    <Text className="pt-2 text-sm" selectable>
      {text ?? "Ce mail ne contient pas de texte (images ou pièces jointes seules)."}
    </Text>
  );
}
