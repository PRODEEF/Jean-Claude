import { fontSize, MIN_TOUCH_TARGET, radius, spacing } from "@jc/design";
import { FONT_FAMILY } from "@/shared/lib/fonts";
import { useTheme } from "@/shared/providers/theme-provider";
import type { DateTimeFieldProps } from "./date-time-field";

/**
 * Sélecteur de date ou d'heure, version web.
 *
 * Le champ `<input type="date">` / `type="time"` du navigateur : il porte son
 * propre calendrier, sa saisie au clavier et, quand le champ n'est pas requis,
 * son bouton d'effacement. `react-native-web` n'a pas d'équivalent, d'où
 * l'élément DOM. Même contrat que la version native (`date-time-field.tsx`).
 *
 * Styles en ligne tirés de la palette : le champ s'affiche le plus souvent dans
 * une fenêtre modale, rendue hors de l'arbre où les variables CSS du thème
 * sont posées.
 */
export function DateTimeField({
  mode,
  value,
  onChange,
  accessibilityLabel,
  clearable = false,
}: DateTimeFieldProps) {
  const { palette, scheme } = useTheme();

  return (
    <input
      type={mode}
      value={mode === "date" ? toIsoDate(value) : value}
      onChange={(event) => {
        const next = event.currentTarget.value;
        onChange(mode === "date" ? fromIsoDate(next) : next);
      }}
      required={!clearable}
      aria-label={accessibilityLabel}
      style={{
        width: "100%",
        boxSizing: "border-box",
        minHeight: MIN_TOUCH_TARGET,
        paddingLeft: spacing.md,
        paddingRight: spacing.md,
        borderWidth: 1,
        borderStyle: "solid",
        borderColor: palette.border,
        borderRadius: radius.md,
        backgroundColor: palette.background,
        color: palette.text,
        fontFamily: FONT_FAMILY,
        fontSize: fontSize.sm,
        // Le calendrier déroulant du navigateur suit le thème de l'app, pas
        // celui du système.
        colorScheme: scheme,
      }}
    />
  );
}

/** `JJ/MM/AAAA` → `AAAA-MM-JJ`, la seule forme qu'accepte le champ HTML. */
function toIsoDate(value: string): string {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim());
  if (!match) return "";
  const [, day = "", month = "", year = ""] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

/** `AAAA-MM-JJ` → `JJ/MM/AAAA` ; vide quand le navigateur n'a pas de date complète. */
function fromIsoDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return "";
  const [, year = "", month = "", day = ""] = match;
  return `${day}/${month}/${year}`;
}
