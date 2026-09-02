import { Text } from "@/shared/ui/text";
import { NotBuiltYet } from "@/shared/ui/not-built-yet";
import { ScreenShell } from "@/shared/ui/screen-shell";

/** Vue centralisée des todolistes, tous dossiers confondus (A.2). */
export default function TodoScreen() {
  return (
    <ScreenShell title="Todoliste">
      <Text className="text-muted-foreground text-base">
        Toutes vos listes, tous dossiers confondus.
      </Text>

      <NotBuiltYet
        phase="Phase B / C"
        items={[
          "Vue hebdomadaire des tâches",
          "Listes de tâches et listes d'achats distinctes (§12.1)",
          "Conversion d'une conversation en todoliste (A.2)",
          "Tâches datées poussées dans le calendrier (A.3)",
        ]}
      />
    </ScreenShell>
  );
}
