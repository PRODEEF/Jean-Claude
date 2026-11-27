/**
 * Répétition d'un rendez-vous, telle que l'utilisateur la choisit.
 *
 * Quatre choix simples, ceux de Google Agenda et du Calendrier iOS (§4.2) ; le
 * reste — « sauf en février », « dix fois », « jusqu'à fin juin » — vient de
 * l'assistant et s'écrit directement dans la règle (RRULE). Une règle qui n'est
 * pas l'un des quatre choix est `custom` : le formulaire la montre telle quelle
 * et ne la touche pas tant que l'utilisateur n'en choisit pas une autre.
 */
export type RecurrencePreset = "none" | "daily" | "weekly" | "monthly" | "yearly" | "custom";

/** Les choix proposés, dans l'ordre où on les montre. `custom` n'en est pas un. */
export const RECURRENCE_CHOICES: { preset: Exclude<RecurrencePreset, "custom">; label: string }[] =
  [
    { preset: "none", label: "Une seule fois" },
    { preset: "daily", label: "Tous les jours" },
    { preset: "weekly", label: "Toutes les semaines" },
    { preset: "monthly", label: "Tous les mois" },
    { preset: "yearly", label: "Tous les ans" },
  ];

/** Jours au format RRULE, indexés comme `Date#getDay` (dimanche = 0). */
const WEEKDAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;

/**
 * Règle d'un choix. `null` pour « une seule fois » : une liste ponctuelle n'a pas de
 * règle. Le jour de la semaine, du mois ou de l'année vient du début de la liste,
 * que la série reprend comme point de départ.
 */
export function rruleForPreset(
  preset: Exclude<RecurrencePreset, "custom">,
  start: Date,
): string | null {
  switch (preset) {
    case "none":
      return null;
    case "daily":
      return "FREQ=DAILY";
    case "weekly":
      return `FREQ=WEEKLY;BYDAY=${WEEKDAYS[start.getDay()]}`;
    case "monthly":
      return "FREQ=MONTHLY";
    case "yearly":
      return "FREQ=YEARLY";
  }
}

/**
 * Le choix que représente une règle, ou `custom` quand elle dit autre chose.
 *
 * Une règle hebdomadaire qui vise un autre jour que celui du début, ou plusieurs
 * jours, reste `custom` : la ramener à « toutes les semaines » changerait les
 * jours de la série sans le dire.
 */
export function presetOfRrule(rrule: string | null, start: Date): RecurrencePreset {
  if (rrule === null || rrule.trim().length === 0) return "none";

  const parts = new Map<string, string>();
  for (const part of rrule
    .trim()
    .replace(/^RRULE:/i, "")
    .split(";")) {
    const [key, value] = part.split("=");
    if (key === undefined || value === undefined) return "custom";
    parts.set(key.toUpperCase(), value.toUpperCase());
  }

  const freq = parts.get("FREQ");
  const onlyFreq = parts.size === 1;

  if (freq === "DAILY" && onlyFreq) return "daily";
  if (freq === "MONTHLY" && onlyFreq) return "monthly";
  if (freq === "YEARLY" && onlyFreq) return "yearly";
  if (freq === "WEEKLY") {
    if (onlyFreq) return "weekly";
    if (parts.size === 2 && parts.get("BYDAY") === WEEKDAYS[start.getDay()]) return "weekly";
  }
  return "custom";
}

const WEEKDAY_NAMES: Record<string, string> = {
  MO: "lundi",
  TU: "mardi",
  WE: "mercredi",
  TH: "jeudi",
  FR: "vendredi",
  SA: "samedi",
  SU: "dimanche",
};

const WORKING_WEEK = ["MO", "TU", "WE", "TH", "FR"];

/**
 * Une règle dite en français — « du lundi au vendredi » plutôt que le mot
 * générique « Répétition » ou `FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR`.
 *
 * Ne lit que `FREQ` et `BYDAY` : une règle qui porte autre chose (« sauf en
 * février », « dix fois ») rend `undefined` plutôt qu'une phrase qui en
 * omettrait la moitié.
 */
export function describeRrule(rrule: string): string | undefined {
  const parts = new Map<string, string>();
  for (const part of rrule
    .trim()
    .replace(/^RRULE:/i, "")
    .split(";")) {
    const [key, value] = part.split("=");
    if (key === undefined || value === undefined) return undefined;
    parts.set(key.toUpperCase(), value.toUpperCase());
  }

  const freq = parts.get("FREQ");
  const byday = parts.get("BYDAY");
  const known = parts.size === (byday === undefined ? 1 : 2);
  if (!known) return undefined;

  if (byday === undefined) {
    if (freq === "DAILY") return "tous les jours";
    if (freq === "MONTHLY") return "tous les mois";
    if (freq === "YEARLY") return "tous les ans";
    return undefined;
  }
  if (freq !== "WEEKLY") return undefined;

  const days = byday.split(",");
  if (days.some((code) => WEEKDAY_NAMES[code] === undefined)) return undefined;

  const same = (expected: string[]) =>
    days.length === expected.length && expected.every((code) => days.includes(code));
  if (same(WORKING_WEEK)) return "du lundi au vendredi";
  if (same(["SA", "SU"])) return "le week-end";
  if (days.length === 7) return "tous les jours";

  const names = days.map((code) => WEEKDAY_NAMES[code]);
  return days.length === 1 ? `tous les ${names[0]}s` : `chaque ${names.join(", ")}`;
}
