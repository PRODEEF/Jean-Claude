/**
 * Arithmétique de dates et libellés français.
 *
 * Aucune dépendance : `Date` couvre le besoin sur les trois cibles, et une
 * bibliothèque de dates pèserait plus lourd dans le bundle que les quelques
 * fonctions ci-dessous. `Intl` est écarté volontairement — le moteur Hermes
 * n'embarque pas toutes les locales sur Android, et une date en anglais
 * passerait inaperçue jusqu'à un test sur appareil.
 *
 * Les horodatages de l'API sont en UTC ; toutes les fonctions d'ici rendent
 * des dates dans le fuseau de l'appareil, parce que c'est celui dans lequel
 * l'utilisateur lit son agenda et sa semaine.
 */

/** Lundi en tête : convention française, et celle de la maquette web. */
export const WEEKDAY_LABELS = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."] as const;

const WEEKDAY_FULL = [
  "lundi",
  "mardi",
  "mercredi",
  "jeudi",
  "vendredi",
  "samedi",
  "dimanche",
] as const;

const MONTH_NAMES = [
  "Janvier",
  "Février",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Août",
  "Septembre",
  "Octobre",
  "Novembre",
  "Décembre",
] as const;

export function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

export function addYears(date: Date, years: number): Date {
  return new Date(date.getFullYear() + years, 0, 1);
}

export function addMonths(date: Date, months: number): Date {
  // Le jour est ramené au 1er avant le décalage : sans cela, le 31 mars moins
  // un mois donnerait le 3 mars, février n'ayant pas de 31e jour.
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

/** Lundi de la semaine contenant `date`. */
export function startOfWeek(date: Date): Date {
  const day = startOfDay(date);
  const offset = (day.getDay() + 6) % 7;
  return addDays(day, -offset);
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Semaines couvrant le mois de `anchor`, débordant sur les mois voisins.
 *
 * Quatre à six semaines selon le mois, et jamais une de plus : une semaine
 * dont aucun jour n'appartient au mois affiché n'apprend rien et fait croire à
 * une erreur de navigation.
 */
export function monthGrid(anchor: Date): Date[] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const daysInMonth = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate();
  const offset = (first.getDay() + 6) % 7;
  const weeks = Math.ceil((offset + daysInMonth) / 7);
  const start = startOfWeek(first);

  return Array.from({ length: weeks * 7 }, (_, index) => addDays(start, index));
}

/** Les douze mois de l'année de `anchor`, chacun ramené à son premier jour. */
export function monthsOfYear(anchor: Date): Date[] {
  return Array.from({ length: 12 }, (_, month) => new Date(anchor.getFullYear(), month, 1));
}

/**
 * Premier et dernier jour de l'année.
 *
 * Deux dates et non les 365 : seules les bornes servent, `rangeOf` ne lit que
 * les extrémités de ce qu'on lui donne.
 */
export function yearBounds(anchor: Date): Date[] {
  return [new Date(anchor.getFullYear(), 0, 1), new Date(anchor.getFullYear(), 11, 31)];
}

export function weekDays(anchor: Date): Date[] {
  const monday = startOfWeek(anchor);
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

export function monthLabel(anchor: Date): string {
  return `${MONTH_NAMES[anchor.getMonth()] ?? ""} ${anchor.getFullYear()}`;
}

/** Nom du mois seul, pour l'en-tête d'une vignette de la vue année. */
export function monthName(anchor: Date): string {
  return MONTH_NAMES[anchor.getMonth()] ?? "";
}

export function yearLabel(anchor: Date): string {
  return String(anchor.getFullYear());
}

/** Ex. « Semaine du 7 au 13 septembre 2026 ». */
export function weekLabel(anchor: Date): string {
  const days = weekDays(anchor);
  const first = days[0] ?? anchor;
  const last = days[6] ?? anchor;
  const monthOf = (date: Date) => (MONTH_NAMES[date.getMonth()] ?? "").toLowerCase();

  if (first.getMonth() === last.getMonth()) {
    return `Semaine du ${first.getDate()} au ${last.getDate()} ${monthOf(last)} ${last.getFullYear()}`;
  }
  return `Semaine du ${first.getDate()} ${monthOf(first)} au ${last.getDate()} ${monthOf(last)} ${last.getFullYear()}`;
}

/** Ex. « mercredi 2 septembre 2026 » — la période affichée en vue jour. */
export function dayLabel(date: Date): string {
  return `${formatFullDay(date)} ${date.getFullYear()}`;
}

/** Ex. « 14h30 », « 9h ». Format parlé plutôt que « 14:30 », comme la maquette. */
export function formatTime(iso: string): string {
  const date = new Date(iso);
  const minutes = date.getMinutes();
  return minutes === 0
    ? `${date.getHours()}h`
    : `${date.getHours()}h${String(minutes).padStart(2, "0")}`;
}

export function formatDayLabel(date: Date): string {
  return `${WEEKDAY_LABELS[(date.getDay() + 6) % 7] ?? ""} ${date.getDate()}`;
}

/** Ex. « lundi 7 septembre ». */
export function formatFullDay(date: Date): string {
  const weekday = WEEKDAY_FULL[(date.getDay() + 6) % 7] ?? "";
  const month = (MONTH_NAMES[date.getMonth()] ?? "").toLowerCase();
  return `${weekday} ${date.getDate()} ${month}`;
}
