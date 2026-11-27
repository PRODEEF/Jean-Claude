import { useRef, useState, type MouseEvent } from "react";
import { fontSize, MIN_TOUCH_TARGET, radius, spacing } from "@jc/design";
import { FONT_FAMILY } from "@/shared/lib/fonts";
import { useTheme } from "@/shared/providers/theme-provider";
import type { DateTimeFieldProps } from "./date-time-field";
import { TimeWheel } from "./time-wheel.web";

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
  if (mode === "time") {
    return (
      <TimeField
        value={value}
        onChange={onChange}
        accessibilityLabel={accessibilityLabel}
        clearable={clearable}
      />
    );
  }

  return (
    <>
      {/* L'icône d'horloge ou de calendrier disparaît : un appui sur le champ
          ouvre directement la liste d'heures ou le calendrier (demande de
          Yann, 23 novembre). */}
      <style>{`.jc-picker-field::-webkit-calendar-picker-indicator{display:none}`}</style>
      <input
        className="jc-picker-field"
        onClick={openPicker}
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
    </>
  );
}

/**
 * Champ d'heure : même sélecteur que l'heure en ligne (boucle, minutes de 5 en 5) plutôt
 * que la liste du navigateur, qui défile trop vite et ne boucle pas (Yann, 27 novembre).
 */
function TimeField({
  value,
  onChange,
  accessibilityLabel,
  clearable,
}: Pick<DateTimeFieldProps, "value" | "onChange" | "accessibilityLabel"> & {
  clearable: boolean;
}) {
  const { palette } = useTheme();
  const button = useRef<HTMLButtonElement>(null);
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <button
        ref={button}
        type="button"
        aria-label={accessibilityLabel}
        onClick={() => {
          const box = button.current?.getBoundingClientRect();
          if (box) setAt({ x: box.left, y: box.bottom + 4 });
        }}
        style={{
          width: "100%",
          boxSizing: "border-box",
          minHeight: MIN_TOUCH_TARGET,
          paddingLeft: spacing.md,
          paddingRight: clearable && value ? MIN_TOUCH_TARGET : spacing.md,
          textAlign: "left",
          cursor: "pointer",
          border: `1px solid ${palette.border}`,
          borderRadius: radius.md,
          backgroundColor: palette.background,
          color: value ? palette.text : palette.textMuted,
          fontFamily: FONT_FAMILY,
          fontSize: fontSize.sm,
        }}
      >
        {value || "--:--"}
      </button>
      {clearable && value ? (
        <button
          type="button"
          aria-label="Effacer l'heure"
          onClick={() => onChange("")}
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            width: MIN_TOUCH_TARGET,
            height: "100%",
            border: 0,
            background: "transparent",
            cursor: "pointer",
            color: palette.textMuted,
            fontSize: fontSize.md,
          }}
        >
          ×
        </button>
      ) : null}
      {at ? (
        <TimeWheel
          x={at.x}
          y={at.y}
          value={value}
          onClose={(picked) => {
            setAt(null);
            if (picked !== null && picked !== value) onChange(picked);
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * Ouvre le sélecteur du navigateur. `showPicker` exige un geste de l'utilisateur
 * et peut être refusé (navigateur ancien, champ désactivé) : le champ reste
 * alors saisissable au clavier, rien d'autre à faire.
 */
function openPicker(event: MouseEvent<HTMLInputElement>) {
  try {
    event.currentTarget.showPicker();
  } catch {
    // Saisie au clavier toujours possible.
  }
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
