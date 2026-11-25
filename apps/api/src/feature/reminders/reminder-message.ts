/**
 * Message que Jean-Claude écrit dans le canal à l'heure d'un rappel.
 *
 * Écrit dans le fuseau de l'utilisateur : « 18h » pour lui n'est pas « 17h » à
 * Paris. Reste un message d'information : il ne propose rien et ne modifie rien
 * (§12.1).
 */
export type ReminderMessageInput = {
  title: string;
  startsAt: string;
  allDay: boolean;
  reminderMinutesBefore: number;
  timezone: string;
};

/**
 * Ce qu'un rappel dit, en mots : le jour, l'heure et l'avance, déjà écrits dans
 * le fuseau de l'utilisateur. La phrase fixe et le rédacteur de phrases
 * (`reminder-writer.ts`) partent de ces mêmes mots, donc ne se contredisent pas.
 */
export function describeReminder(input: ReminderMessageInput): {
  day: string;
  clock: string | null;
  lead: string | null;
} {
  const start = new Date(input.startsAt);
  const day = formatDay(start, input.timezone);
  if (input.allDay) return { day, clock: null, lead: null };

  return {
    day,
    clock: formatClock(start, input.timezone),
    lead: input.reminderMinutesBefore > 0 ? formatLead(input.reminderMinutesBefore) : null,
  };
}

/**
 * La phrase fixe : celle qui part quand le modèle ne répond pas ou se trompe.
 * Sèche, mais toujours juste.
 */
export function reminderMessage(input: ReminderMessageInput): string {
  const { title } = input;
  const { day, clock, lead } = describeReminder(input);

  if (clock === null) return `Rappel : ${title}, ${day}.`;
  return lead !== null
    ? `Rappel : ${title}, à ${clock} (dans ${lead}).`
    : `Rappel : ${title}, c'est maintenant (${clock}).`;
}

/** « 18h » ou « 18h30 ». */
function formatClock(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = parts.find((part) => part.type === "hour")?.value ?? "";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";

  return minute === "00" ? `${hour}h` : `${hour}h${minute}`;
}

/** « jeudi 12 novembre ». */
function formatDay(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: timezone,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
}

/** « 30 minutes », « 2 heures », « 1 jour ». */
function formatLead(minutes: number): string {
  if (minutes % 1_440 === 0) return plural(minutes / 1_440, "jour");
  if (minutes % 60 === 0) return plural(minutes / 60, "heure");
  return plural(minutes, "minute");
}

function plural(count: number, unit: string): string {
  return `${count} ${unit}${count > 1 ? "s" : ""}`;
}
