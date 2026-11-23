import type { MouseEvent, ReactNode } from "react";

export type InlinePickerProps = {
  mode: "date" | "time";
  /** `JJ/MM/AAAA` ou `HH:MM`, vide si rien n'est posé. */
  value: string;
  onChange: (value: string) => void;
  accessibilityLabel: string;
  /** Ce qu'on voit : l'heure ou la date, tel que la carte l'écrit. */
  children: ReactNode;
  /** Sans objet sur le web, où le sélecteur du navigateur s'ouvre directement. */
  onNativePress?: (event: unknown) => void;
};

/**
 * Un libellé (heure, date) qui ouvre sur place le sélecteur du navigateur
 * quand on appuie dessus : la liste des heures, ou le calendrier, sans fenêtre
 * ni panneau (demande de Yann, 23 novembre).
 *
 * Un champ natif transparent est posé par-dessus le libellé : il porte le
 * clavier, le focus et le sélecteur, et n'a aucun style à lui. Version native
 * dans `inline-picker.tsx`.
 */
export function InlinePicker({
  mode,
  value,
  onChange,
  accessibilityLabel,
  children,
}: InlinePickerProps) {
  return (
    <div style={{ position: "relative", display: "inline-flex", cursor: "pointer" }}>
      <style>{`.jc-inline-picker::-webkit-calendar-picker-indicator{display:none}`}</style>
      {children}
      <input
        className="jc-inline-picker"
        type={mode}
        value={mode === "date" ? toIsoDate(value) : value}
        aria-label={accessibilityLabel}
        onClick={openPicker}
        onChange={(event) => {
          const next = event.currentTarget.value;
          // Un champ vidé ne dit pas « enlève la date » : on n'écrit que ce qui est choisi.
          if (next === "") return;
          onChange(mode === "date" ? fromIsoDate(next) : next);
        }}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          opacity: 0,
          cursor: "pointer",
          border: 0,
          padding: 0,
        }}
      />
    </div>
  );
}

function openPicker(event: MouseEvent<HTMLInputElement>) {
  try {
    event.currentTarget.showPicker();
  } catch {
    // Saisie au clavier toujours possible.
  }
}

/** `JJ/MM/AAAA` → `AAAA-MM-JJ`. */
function toIsoDate(value: string): string {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim());
  if (!match) return "";
  const [, day = "", month = "", year = ""] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

/** `AAAA-MM-JJ` → `JJ/MM/AAAA`. */
function fromIsoDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return "";
  const [, year = "", month = "", day = ""] = match;
  return `${day}/${month}/${year}`;
}
