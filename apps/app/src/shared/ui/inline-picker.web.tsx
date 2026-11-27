import { useRef, type ReactNode } from "react";

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
  const input = useRef<HTMLInputElement>(null);

  return (
    <div style={{ position: "relative", display: "inline-flex", cursor: "pointer" }}>
      <style>{`.jc-inline-picker::-webkit-calendar-picker-indicator{display:none}`}</style>
      {children}
      {/* Le champ natif porte le clavier et le sélecteur, mais ne reçoit plus la souris :
          ses chiffres imposaient leur propre flèche, et la main ne se voyait que sur une
          partie de l'heure (photos et vidéos de Yann, 27 novembre). */}
      <input
        ref={input}
        className="jc-inline-picker"
        type={mode}
        value={mode === "date" ? toIsoDate(value) : value}
        aria-label={accessibilityLabel}
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
          pointerEvents: "none",
          border: 0,
          padding: 0,
        }}
      />
      {/* Une couche, et une seule, reçoit la souris : la main sur toute la surface, quel
          que soit le moteur du navigateur. */}
      <div
        aria-hidden="true"
        onClick={() => openPicker(input.current)}
        style={{ position: "absolute", inset: 0, cursor: "pointer" }}
      />
    </div>
  );
}

function openPicker(field: HTMLInputElement | null) {
  if (!field) return;
  try {
    field.showPicker();
  } catch {
    // Pas de sélecteur dans ce navigateur : le champ prend le focus, la saisie au clavier reste possible.
    field.focus();
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
