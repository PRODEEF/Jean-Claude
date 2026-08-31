import { ScreenScaffold, NotBuiltYet } from "@/shared/ui/screen-scaffold";

/**
 * Canal permanent Jean-Claude (A.10).
 *
 * Distinct des conversations classiques : périmètre borné aux rappels, à
 * l'organisation de l'outil et à la structure du projet. Le bornage est
 * appliqué côté serveur (`buildSystemPrompt`), pas ici.
 */
export default function AssistantScreen() {
  return (
    <ScreenScaffold
      title="Jean-Claude"
      subtitle="Rappels, organisation et structure de votre espace."
    >
      <NotBuiltYet
        phase="Phase B"
        items={[
          "Fil du canal permanent",
          "Cartes de suggestion à accepter ou ignorer (§12.1)",
          "Rappels du matin et de début de semaine (A.10)",
          "Bascule automatique vers une conversation classique hors périmètre",
        ]}
      />
    </ScreenScaffold>
  );
}
