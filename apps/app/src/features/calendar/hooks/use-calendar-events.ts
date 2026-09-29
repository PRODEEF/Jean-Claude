import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CalendarEntry,
  CalendarRange,
  CreateCalendarEvent,
  UpdateCalendarEvent,
  UpdateWorkspaceEvent,
} from "@jc/domain";
import { api } from "@/shared/lib/api";

/**
 * Événements de la fenêtre affichée.
 *
 * Les bornes entrent dans la clé de cache : passer d'août à septembre est un
 * autre jeu de données, pas une invalidation du précédent — revenir en arrière
 * réaffiche alors le mois déjà chargé sans requête.
 */
export function useCalendarEvents(range: CalendarRange) {
  return useQuery({
    queryKey: ["calendar", range.from, range.to],
    queryFn: () => api.calendar.list(range),
  });
}

export function useCalendarActions() {
  const queryClient = useQueryClient();

  // Toutes les fenêtres sont invalidées, pas seulement celle affichée : un
  // événement déplacé d'un mois à l'autre disparaît d'une fenêtre et apparaît
  // dans une autre, et les deux sont en cache.
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["calendar"] });

  // Déplacer ou supprimer un rendez-vous peut aussi changer une todoliste
  // liée (A.3) : le serveur répercute déjà la date ou détache le lien, mais
  // Mes listes, la barre latérale et la vue Todo du calendrier partagent la
  // même clé de cache que le calendrier, qui doit être invalidée avec elle.
  const refreshWithLinkedTaskLists = () => {
    refresh();
    queryClient.invalidateQueries({ queryKey: ["taskLists"] });
  };

  // Un événement d'espace laisse une ligne dans le fil de sa conversation :
  // le fil ouvert doit la montrer sans attendre le temps réel.
  const refreshShared = () => {
    refresh();
    queryClient.invalidateQueries({ queryKey: ["group"] });
  };

  /** `groupId` : l'événement va au calendrier de tous les membres de cette conversation. */
  const create = useMutation({
    mutationFn: async ({ groupId, ...input }: CreateCalendarEvent & { groupId?: string }) => {
      if (!groupId) return void (await api.calendar.create(input));
      await api.workspaceEvents.create({
        groupId,
        title: input.title,
        notes: input.notes ?? null,
        startsAt: input.startsAt,
        endsAt: input.endsAt ?? null,
        allDay: input.allDay,
        reminderMinutesBefore: input.reminderMinutesBefore ?? null,
      });
    },
    onSuccess: (_event, variables) => (variables.groupId ? refreshShared() : refresh()),
  });

  const update = useMutation({
    mutationFn: async ({ event, patch }: { event: EntryRef; patch: UpdateCalendarEvent }) => {
      if (event.space) await api.workspaceEvents.update(event.id, sharedFields(patch));
      else await api.calendar.update(event.id, patch);
    },
    onSuccess: (_event, { event }) =>
      event.space ? refreshShared() : refreshWithLinkedTaskLists(),
  });

  const remove = useMutation({
    mutationFn: (event: EntryRef) =>
      event.space ? api.workspaceEvents.remove(event.id) : api.calendar.remove(event.id),
    onSuccess: (_result, event) => (event.space ? refreshShared() : refreshWithLinkedTaskLists()),
  });

  return { create, update, remove };
}

/** Ce qui suffit à savoir où écrire : un événement d'espace porte `space`. */
type EntryRef = Pick<CalendarEntry, "id" | "space">;

/**
 * Les champs qu'un événement d'espace connaît : ni récurrence ni dossier
 * propre. Écrit clé par clé, un `undefined` laissant la valeur intacte.
 */
function sharedFields(input: UpdateCalendarEvent): UpdateWorkspaceEvent {
  const fields: UpdateWorkspaceEvent = {};
  if (input.title !== undefined) fields.title = input.title;
  if (input.notes !== undefined) fields.notes = input.notes;
  if (input.startsAt !== undefined) fields.startsAt = input.startsAt;
  if (input.endsAt !== undefined) fields.endsAt = input.endsAt;
  if (input.allDay !== undefined) fields.allDay = input.allDay;
  if (input.reminderMinutesBefore !== undefined) {
    fields.reminderMinutesBefore = input.reminderMinutesBefore;
  }
  return fields;
}
