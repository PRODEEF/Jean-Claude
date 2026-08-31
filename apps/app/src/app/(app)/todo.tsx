import { ScreenScaffold, NotBuiltYet } from "@/shared/ui/screen-scaffold";

/** Vue centralisée des todolistes, tous dossiers confondus (A.2). */
export default function TodoScreen() {
  return (
    <ScreenScaffold title="Todoliste" subtitle="Toutes vos listes, tous dossiers confondus.">
      <NotBuiltYet
        phase="Phase B / C"
        items={[
          "Vue hebdomadaire des tâches",
          "Listes de tâches et listes d'achats distinctes (§12.1)",
          "Conversion d'une conversation en todoliste (A.2)",
          "Tâches datées poussées dans le calendrier (A.3)",
        ]}
      />
    </ScreenScaffold>
  );
}
