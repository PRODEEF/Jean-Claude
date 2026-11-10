/**
 * Message que Jean-Claude écrit dans le canal à l'heure d'un rappel.
 *
 * Écrit dans le fuseau de l'utilisateur : « 18h » pour lui n'est pas « 17h » à
 * Paris. Reste un message d'information : il ne propose rien et ne modifie rien
 * (§12.1).
 */
export function reminderMessage(input: {
  title: string;
  startsAt: string;
  allDay: boolean;
  reminderMinutesBefore: number;
  timezone: string;
}): string {
  const { title, startsAt, allDay, reminderMinutesBefore, timezone } = input;
  const start = new Date(startsAt);

  if (allDay) {
    return `Rappel : ${title}, ${formatDay(start, timezone)}.`;
  }

  const clock = formatClock(start, timezone);
  return reminderMinutesBefore > 0
    ? `Rappel : ${title}, à ${clock} (dans ${formatLead(reminderMinutesBefore)}).`
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
