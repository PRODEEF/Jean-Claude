import type {
  CalendarEvent,
  CalendarRange,
  CreateCalendarEvent,
  UpdateCalendarEvent,
} from "@jc/domain";

export interface ICalendarRepository {
  /**
   * Événements qui chevauchent la fenêtre demandée, du plus ancien au plus
   * récent — la vue mois et la vue semaine ne diffèrent que par ses bornes.
   */
  findInRange(range: CalendarRange, accessToken: string): Promise<CalendarEvent[]>;
  findById(id: string, accessToken: string): Promise<CalendarEvent | null>;
  create(userId: string, input: CreateCalendarEvent, accessToken: string): Promise<CalendarEvent>;
  update(id: string, patch: UpdateCalendarEvent, accessToken: string): Promise<CalendarEvent>;
  delete(id: string, accessToken: string): Promise<void>;
}
