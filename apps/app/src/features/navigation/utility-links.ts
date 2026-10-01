import { CalendarDays, ListChecks } from "lucide-react-native";

/**
 * Vues qui ne sont pas des conversations.
 *
 * Destinations hors arborescence, reprises dans l'en-tête de la barre.
 * Une seule liste : deux copies auraient divergé dès la troisième vue.
 */
export const UTILITY_LINKS = [
  { href: "/todo", label: "Mes listes", icon: ListChecks },
  { href: "/calendar", label: "Calendrier", icon: CalendarDays },
] as const;
