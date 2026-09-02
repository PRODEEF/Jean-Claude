import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CalendarRange, CreateCalendarEvent, UpdateCalendarEvent } from "@jc/domain";
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

  const create = useMutation({
    mutationFn: (input: CreateCalendarEvent) => api.calendar.create(input),
    onSuccess: refresh,
  });

  const update = useMutation({
    mutationFn: (variables: { id: string; patch: UpdateCalendarEvent }) =>
      api.calendar.update(variables.id, variables.patch),
    onSuccess: refresh,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.calendar.remove(id),
    onSuccess: refresh,
  });

  return { create, update, remove };
}
