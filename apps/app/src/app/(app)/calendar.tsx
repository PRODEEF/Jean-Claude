import { ScreenScaffold, NotBuiltYet } from "@/shared/ui/screen-scaffold";

/** Calendrier — vues mois et semaine de la maquette. */
export default function CalendarScreen() {
  return (
    <ScreenScaffold title="Calendrier" subtitle="Vos rendez-vous et échéances.">
      <NotBuiltYet
        phase="Phase B"
        items={[
          "Vue mois et vue semaine",
          "Événements récurrents avec rappel automatique (A.11)",
          "Création d'un créneau depuis une suggestion de l'assistant",
        ]}
      />
    </ScreenScaffold>
  );
}
