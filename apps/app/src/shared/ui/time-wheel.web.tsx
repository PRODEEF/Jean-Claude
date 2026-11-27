import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { fontSize, radius, spacing } from "@jc/design";
import { formatTimeOfDay, roundTimeToStep, TIME_PICKER_MINUTE_STEP, wrapIndex } from "@jc/domain";
import { FONT_FAMILY } from "@/shared/lib/fonts";
import { useTheme } from "@/shared/providers/theme-provider";
import { AnchoredPanel } from "./anchored-panel";

const HOUR_COUNT = 24;
const MINUTE_COUNT = 60 / TIME_PICKER_MINUTE_STEP;
/** Lignes visibles de chaque côté de la valeur retenue. */
const ROWS_AROUND = 2;
const ROW_HEIGHT = 34;
/**
 * Distance de molette pour avancer d'une valeur : une cran de souris (≈ 100 px)
 * avance d'un, et un pavé tactile — qui envoie des dizaines de petits deltas —
 * n'emballe plus la liste (demande de Yann, 27 novembre : « plus lent »).
 */
const WHEEL_PX_PER_STEP = 70;
const DEFAULT_TIME = "09:00";
const PANEL_WIDTH = 188;
const PANEL_HEIGHT = ROW_HEIGHT * (ROWS_AROUND * 2 + 1) + 64;

type Field = "hour" | "minute";

/**
 * Sélecteur d'heure, version web : deux colonnes qui bouclent (23 h puis 00 h,
 * 55 puis 00) et des minutes de 5 en 5 (Yann, 27 novembre).
 *
 * Remplace la liste du navigateur, qu'on ne règle pas : elle s'arrête à 00:00,
 * avance à la minute et défile vite. Un clic sur une valeur la choisit, la
 * molette et les flèches du clavier avancent d'un cran ; fermer le panneau (clic à
 * côté, Échap, « OK ») enregistre — une seule fois, pas à chaque cran, pour ne pas
 * écrire en base à chaque tour de molette.
 */
export function TimeWheel({
  x,
  y,
  value,
  onClose,
}: {
  x: number;
  y: number;
  /** « HH:MM » ou vide. Arrondi au pas de 5 minutes à l'ouverture. */
  value: string;
  /** L'heure choisie, ou `null` quand rien n'a bougé : fermer sans rien toucher ne change rien. */
  onClose: (picked: string | null) => void;
}) {
  const { palette } = useTheme();
  const start = roundTimeToStep(value) ?? { hour: 9, minute: 0 };
  const [hour, setHour] = useState(start.hour);
  const [minuteIndex, setMinuteIndex] = useState(start.minute / TIME_PICKER_MINUTE_STEP);
  const [active, setActive] = useState<Field>("hour");
  const touched = useRef(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => root.current?.focus(), []);

  const stepHour = (delta: number) => {
    touched.current = true;
    setHour((current) => wrapIndex(current + delta, HOUR_COUNT));
  };
  const stepMinute = (delta: number) => {
    touched.current = true;
    setMinuteIndex((current) => wrapIndex(current + delta, MINUTE_COUNT));
  };

  const finish = () =>
    onClose(
      touched.current
        ? formatTimeOfDay({ hour, minute: minuteIndex * TIME_PICKER_MINUTE_STEP })
        : null,
    );

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = active === "hour" ? stepHour : stepMinute;
    if (event.key === "ArrowUp") step(-1);
    else if (event.key === "ArrowDown") step(1);
    else if (event.key === "ArrowLeft") setActive("hour");
    else if (event.key === "ArrowRight") setActive("minute");
    else if (event.key === "Enter") finish();
    else return;
    event.preventDefault();
  };

  return (
    <AnchoredPanel x={x} y={y} width={PANEL_WIDTH} height={PANEL_HEIGHT} onClose={finish}>
      <div
        ref={root}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        role="group"
        aria-label="Choisir l'heure"
        style={{ outline: "none", display: "flex", flexDirection: "column", gap: spacing.sm }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
          <Column
            label="Heures"
            count={HOUR_COUNT}
            index={hour}
            format={(index) => String(index).padStart(2, "0")}
            onStep={stepHour}
            onPick={(index) => {
              touched.current = true;
              setHour(index);
            }}
            focused={active === "hour"}
            onFocus={() => setActive("hour")}
          />
          <span style={{ color: palette.text, fontFamily: FONT_FAMILY, fontWeight: 700 }}>:</span>
          <Column
            label="Minutes"
            count={MINUTE_COUNT}
            index={minuteIndex}
            format={(index) => String(index * TIME_PICKER_MINUTE_STEP).padStart(2, "0")}
            onStep={stepMinute}
            onPick={(index) => {
              touched.current = true;
              setMinuteIndex(index);
            }}
            focused={active === "minute"}
            onFocus={() => setActive("minute")}
          />
        </div>
        <button
          type="button"
          onClick={finish}
          style={{
            minHeight: 36,
            border: 0,
            borderRadius: radius.md,
            cursor: "pointer",
            backgroundColor: palette.accent,
            color: palette.accentText,
            fontFamily: FONT_FAMILY,
            fontSize: fontSize.sm,
            fontWeight: 600,
          }}
        >
          OK
        </button>
      </div>
    </AnchoredPanel>
  );
}

/**
 * Une colonne qui boucle : la valeur retenue au milieu, ses voisines autour, calculées
 * modulo `count` — il n'y a ni début ni fin à atteindre.
 */
function Column({
  label,
  count,
  index,
  format,
  onStep,
  onPick,
  focused,
  onFocus,
}: {
  label: string;
  count: number;
  index: number;
  format: (index: number) => string;
  onStep: (delta: number) => void;
  onPick: (index: number) => void;
  focused: boolean;
  onFocus: () => void;
}) {
  const { palette } = useTheme();
  const column = useRef<HTMLDivElement>(null);
  const travelled = useRef(0);
  const step = useRef(onStep);
  step.current = onStep;

  // Écouteur natif : React pose les siens en mode passif, et sans `preventDefault`
  // la page défilerait derrière le panneau.
  useEffect(() => {
    const element = column.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      // Firefox compte en lignes, pas en pixels.
      travelled.current += event.deltaMode === 1 ? event.deltaY * 40 : event.deltaY;
      while (Math.abs(travelled.current) >= WHEEL_PX_PER_STEP) {
        const direction = Math.sign(travelled.current);
        travelled.current -= direction * WHEEL_PX_PER_STEP;
        step.current(direction);
      }
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, []);

  const offsets = Array.from({ length: ROWS_AROUND * 2 + 1 }, (_, i) => i - ROWS_AROUND);

  return (
    <div
      ref={column}
      role="listbox"
      aria-label={label}
      onMouseEnter={onFocus}
      style={{
        width: 64,
        borderRadius: radius.md,
        outline: focused ? `1px solid ${palette.border}` : "none",
        userSelect: "none",
      }}
    >
      {offsets.map((offset) => {
        const value = wrapIndex(index + offset, count);
        const selected = offset === 0;
        return (
          <div
            key={offset}
            role="option"
            aria-selected={selected}
            onClick={() => onPick(value)}
            style={{
              height: ROW_HEIGHT,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              borderRadius: radius.md,
              fontFamily: FONT_FAMILY,
              fontSize: fontSize.md,
              fontWeight: selected ? 700 : 500,
              backgroundColor: selected ? palette.accent : "transparent",
              color: selected ? palette.accentText : palette.text,
              opacity: selected ? 1 : Math.abs(offset) === 1 ? 0.6 : 0.3,
            }}
          >
            {format(value)}
          </div>
        );
      })}
    </div>
  );
}
