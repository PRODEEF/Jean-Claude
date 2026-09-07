import { CalendarDays, ListChecks } from "lucide-react-native";

/**
 * Vues qui ne sont pas des conversations.
 *
 * Partagées par le pied de la barre latérale et par la bannière : la barre se
 * replie, la bannière non, et les deux doivent donc offrir les mêmes
 * destinations. Deux listes juxtaposées auraient divergé dès la troisième vue.
 */
export const UTILITY_LINKS = [
  { href: "/todo", label: "Mes listes", icon: ListChecks },
  { href: "/calendar", label: "Calendrier", icon: CalendarDays },
] as const;
