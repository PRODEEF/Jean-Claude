import type { CalendarEvent, CreateCalendarEvent } from "@jc/domain";

/**
 * Saisie du formulaire d'événement, sous la forme tapée par l'utilisateur.
 *
 * Les dates et heures restent des chaînes tant que la saisie est en cours :
 * un champ à moitié tapé n'est pas une date, et le convertir à chaque frappe
 * ferait sauter le curseur.
 */
export type EventFormValues = {
  title: string;
  /** `JJ/MM/AAAA`. */
  date: string;
  /** `HH:MM`. Ignoré si `allDay`. */
  startTime: string;
  /** `HH:MM`, vide si l'événement n'a pas d'heure de fin. */
  endTime: string;
  allDay: boolean;
  reminderMinutesBefore: number | null;
  notes: string;
};

/** Délais de rappel proposés — ceux du Calendrier iOS et de Google Calendar (§4.2). */
export const REMINDER_CHOICES = [
  { minutes: null, label: "Aucun" },
  { minutes: 10, label: "10 min avant" },
  { minutes: 30, label: "30 min avant" },
  { minutes: 60, label: "1 h avant" },
  { minutes: 1_440, label: "La veille" },
] as const;

export function emptyForm(day: Date): EventFormValues {
  return {
    title: "",
    date: formatDateInput(day),
    startTime: "09:00",
    endTime: "10:00",
    allDay: false,
    reminderMinutesBefore: null,
    notes: "",
  };
}

export function formFromEvent(event: CalendarEvent): EventFormValues {
  const start = new Date(event.startsAt);
  return {
    title: event.title,
    date: formatDateInput(start),
    startTime: formatTimeInput(start),
    endTime: event.endsAt ? formatTimeInput(new Date(event.endsAt)) : "",
    allDay: event.allDay,
    reminderMinutesBefore: event.reminderMinutesBefore,
    notes: event.notes ?? "",
  };
}

export type ParseResult = { ok: true; value: CreateCalendarEvent } | { ok: false; message: string };

/**
 * Convertit la saisie en charge utile d'API, ou dit ce qui cloche.
 *
 * Les horaires sont interprétés dans le fuseau de l'appareil puis convertis en
 * UTC par `toISOString` : « 14h30 » veut dire 14h30 là où se trouve
 * l'utilisateur, pas à Greenwich.
 *
 * La règle « la fin suit le début » n'est pas vérifiée ici : elle vit dans
 * l'API, qui la fait valoir pour les quatre plateformes à la fois.
 */
export function parseForm(values: EventFormValues): ParseResult {
  const title = values.title.trim();
  if (title.length === 0) return { ok: false, message: "Donnez un titre à l'événement." };

  const day = parseDateInput(values.date);
  if (day === "malformed") return { ok: false, message: "Date attendue au format JJ/MM/AAAA." };
  if (day === "impossible") return { ok: false, message: "Ce jour n'existe pas dans ce mois." };

  // Une journée entière est ancrée à minuit et n'a pas de fin : une seule
  // journée suffit au besoin actuel, l'événement sur plusieurs jours n'est pas
  // encore au périmètre.
  if (values.allDay) {
    return {
      ok: true,
      value: {
        title,
        startsAt: day.toISOString(),
        endsAt: null,
        allDay: true,
        reminderMinutesBefore: values.reminderMinutesBefore,
        notes: values.notes.trim() || null,
      },
    };
  }

  const start = parseTimeInput(values.startTime);
  if (!start) return { ok: false, message: "Heure de début attendue au format HH:MM." };

  const startsAt = withTime(day, start);

  let endsAt: string | null = null;
  if (values.endTime.trim().length > 0) {
    const end = parseTimeInput(values.endTime);
    if (!end) return { ok: false, message: "Heure de fin attendue au format HH:MM." };
    endsAt = withTime(day, end);
  }

  return {
    ok: true,
    value: {
      title,
      startsAt,
      endsAt,
      allDay: false,
      reminderMinutesBefore: values.reminderMinutesBefore,
      notes: values.notes.trim() || null,
    },
  };
}

function formatDateInput(date: Date): string {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${date.getFullYear()}`;
}

function formatTimeInput(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/**
 * Minuit local du jour saisi.
 *
 * Les deux échecs sont distingués : un format non reconnu et un jour qui
 * n'existe pas n'appellent pas la même correction de la part de qui saisit.
 */
function parseDateInput(value: string): Date | "malformed" | "impossible" {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim());
  if (!match) return "malformed";

  const [day, month, year] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(year, month - 1, day);

  // `new Date(2026, 1, 31)` ne lève pas, il glisse au 3 mars : on refuse une
  // date qui ne s'est pas conservée à la construction.
  if (date.getDate() !== day || date.getMonth() !== month - 1) return "impossible";
  return date;
}

/** Accepte `14:30`, `14h30` et `14h`. */
function parseTimeInput(value: string): { hours: number; minutes: number } | null {
  const match = /^(\d{1,2})\s*[:hH]\s*(\d{2})?$/.exec(value.trim());
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = match[2] ? Number(match[2]) : 0;
  if (hours > 23 || minutes > 59) return null;
  return { hours, minutes };
}

function withTime(day: Date, time: { hours: number; minutes: number }): string {
  const date = new Date(day);
  date.setHours(time.hours, time.minutes, 0, 0);
  return date.toISOString();
}
