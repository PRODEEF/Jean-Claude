import { useRef, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { ListChecks, Plus, ShoppingBasket } from "lucide-react-native";
import type { TaskListWithTasks } from "@jc/domain";
import { dueOnForDay, momentsOfDay, openTaskCount } from "@jc/domain";
import { ApiError } from "@jc/api-client";
import { MIN_TOUCH_TARGET } from "@jc/design";
import { formatFullDay, formatTime, isSameDay } from "@/shared/lib/dates";
import { useBreakpoint } from "@/shared/hooks/use-breakpoint";
import { useTaskActions, useTaskLists } from "@/shared/hooks/use-task-lists";
import { TaskRow } from "@/features/todo/TaskRow";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { Input } from "@/shared/ui/input";
import { Text } from "@/shared/ui/text";

export type DueListsBoardProps = {
  /** Les jours à afficher, dans l'ordre — une semaine ou un mois selon l'appelant. */
  days: Date[];
  lists: TaskListWithTasks[];
};

/**
 * Todolistes échues, un bloc par jour découpé en moments (A.2).
 *
 * Cochable directement : le calendrier dit ce que porte chaque jour, et rayer
 * ce qui est fait ne doit pas obliger à changer d'onglet. Une tâche s'y ajoute
 * aussi, au « + » de sa liste ; le titre de la liste conduit vers Mes listes,
 * pour l'édition complète — renommer, réordonner, indenter.
 */
export function DueListsBoard({ days, lists }: DueListsBoardProps) {
  const today = new Date();
  // Resserré sur grand écran seulement : un mois entier de listes tient mal
  // sur téléphone où l'espace généreux protège du doigt, mais gagne à se
  // resserrer sur un écran large où plusieurs semaines sont visibles à la fois.
  const desktop = useBreakpoint() === "expanded";
  // Les listes telles qu'enregistrées : une entrée de `lists` peut n'être que
  // la projection d'une liste sur le jour de certaines de ses tâches, avec une
  // échéance remplacée par ce jour.
  const { data: savedLists } = useTaskLists();

  return (
    <View className={desktop ? "gap-2" : "gap-3"}>
      {days.map((day) => {
        const groups = momentsOfDay(lists, day);
        const remaining = groups.reduce(
          (count, group) => count + group.lists.reduce((sum, list) => sum + openTaskCount(list), 0),
          0,
        );
        const isToday = isSameDay(day, today);

        return (
          <View
            key={day.toISOString()}
            className={`gap-2 rounded-xl border ${desktop ? "p-2" : "p-3"} ${
              isToday ? "border-primary" : "border-border"
            }`}
          >
            <View className="flex-row items-center justify-between gap-2">
              <Text
                className={`text-base font-bold uppercase ${
                  isToday ? "text-primary" : "text-foreground"
                }`}
              >
                {formatFullDay(day)}
              </Text>
              {remaining > 0 ? (
                <Text className="text-muted-foreground text-xs">{remaining} à faire</Text>
              ) : null}
            </View>

            {groups.map((group) => (
              <View key={group.moment.key} className={desktop ? "gap-1" : "gap-2"}>
                {/* Bandeau gris sur toute la largeur et corps plus grand que
                    celui des tâches (demande de Yann) : le moment structure
                    la journée, il doit se lire avant ce qu'il contient.
                    `bg-border` et non `bg-muted` : ce dernier vaut la teinte
                    de fond des surfaces, quasi blanche, et le bandeau ne se
                    détachait presque pas de la carte du jour. */}
                <View className="bg-border rounded-md px-2 py-1">
                  <Text className="text-foreground text-[15px] font-semibold uppercase">
                    {group.moment.label}
                  </Text>
                </View>
                {group.lists.map((list) => (
                  <DueList
                    key={list.id}
                    list={list}
                    dueOn={dueOnForDay(
                      savedLists?.find((saved) => saved.id === list.id) ?? list,
                      day,
                    )}
                    desktop={desktop}
                  />
                ))}
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}

/**
 * Une liste échue ce jour-là, avec ce qu'elle contient.
 *
 * Le contenu est montré et non résumé : « Courses » sans ses lignes n'apprend
 * rien de ce qu'il reste à faire. L'en-tête (icône, heure, titre) ouvre la
 * liste dans Mes listes ; les tâches se cochent ici, via `TaskRow`, et le
 * « + » en ajoute sans changer d'onglet.
 */
function DueList({
  list,
  dueOn,
  desktop,
}: {
  list: TaskListWithTasks;
  /** Jour à donner aux tâches ajoutées ici — `null` s'il est celui de la liste. */
  dueOn: string | null;
  desktop: boolean;
}) {
  const router = useRouter();
  const shopping = list.kind === "shopping";
  const time = timeLabel(list);
  const [adding, setAdding] = useState(false);

  return (
    <View
      className={`border-border gap-0.5 rounded-lg border border-dashed ${desktop ? "p-1.5" : "p-2"}`}
    >
      <View className="flex-row items-center gap-1">
        {/* L'heure précède le titre, comme dans un agenda papier : c'est elle
            qui situe la liste dans le moment, avant ce qu'elle contient. */}
        <Pressable
          onPress={() => router.push(`/todo?list=${list.id}` as never)}
          accessibilityRole="button"
          accessibilityLabel={`Ouvrir la liste ${list.title}`}
          style={{ minHeight: MIN_TOUCH_TARGET }}
          className="min-w-0 flex-1 flex-row items-center gap-2"
        >
          <Icon
            as={shopping ? ShoppingBasket : ListChecks}
            size={14}
            className="text-muted-foreground"
          />
          {time ? <Text className="text-sm font-bold">{time}</Text> : null}
          <Text className="min-w-0 flex-1 text-sm font-medium" numberOfLines={1}>
            {list.title}
          </Text>
        </Pressable>

        <Button
          variant="ghost"
          size="icon"
          hitSlop={8}
          onPress={() => setAdding(true)}
          accessibilityRole="button"
          accessibilityLabel={`Ajouter une tâche à ${list.title}`}
          className="size-8"
        >
          <Icon as={Plus} size={16} className="text-muted-foreground" />
        </Button>
      </View>

      {list.tasks.length === 0 && !adding ? (
        <Text className="text-muted-foreground text-xs">Liste vide.</Text>
      ) : (
        list.tasks.map((task) => <TaskRow key={task.id} task={task} />)
      )}

      {adding ? <QuickAdd list={list} dueOn={dueOn} onClose={() => setAdding(false)} /> : null}
    </View>
  );
}

/**
 * Saisie d'une tâche à la volée, en bas de sa liste.
 *
 * Une ligne tapée devient une case à cocher, comme partout ailleurs dans les
 * todolistes (choix produit du 28 septembre : pas de puce non cochable). Entrée
 * enregistre et rouvre une ligne vide, pour vider sa tête d'un trait ; quitter
 * le champ vide le referme. La tâche prend le jour où on l'a tapée
 * (`dueOnForDay`).
 */
function QuickAdd({
  list,
  dueOn,
  onClose,
}: {
  list: TaskListWithTasks;
  dueOn: string | null;
  onClose: () => void;
}) {
  const { addTask } = useTaskActions();
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const input = useRef<TextInput>(null);

  const submit = () => {
    // Un second Entrée pendant l'aller-retour ajouterait la même tâche deux
    // fois : le champ n'est pas encore vidé.
    if (addTask.isPending) return;

    const trimmed = title.trim();
    if (trimmed.length === 0) {
      onClose();
      return;
    }

    setError(null);
    addTask.mutate(
      { listId: list.id, input: { title: trimmed, dueOn } },
      {
        onSuccess: () => {
          setTitle("");
          input.current?.focus();
        },
        // Le texte reste dans le champ : le perdre sur un échec réseau
        // obligerait à le retaper.
        onError: (cause) => setError(toMessage(cause)),
      },
    );
  };

  return (
    <View className="gap-1 pt-1">
      <Input
        ref={input}
        autoFocus
        value={title}
        onChangeText={setTitle}
        onSubmitEditing={submit}
        onBlur={() => {
          if (title.trim().length === 0 && !addTask.isPending) onClose();
        }}
        submitBehavior="submit"
        returnKeyType="done"
        placeholder="Nouvelle tâche"
        accessibilityLabel={`Nouvelle tâche dans ${list.title}`}
      />
      {error ? <Text className="text-destructive text-xs">{error}</Text> : null}
    </View>
  );
}

/**
 * Heure de l'échéance, quand elle en vise une.
 *
 * Une échéance « dans la journée » n'en affiche pas — c'est déjà ce que dit
 * l'intitulé du moment, et l'écrire « 0h » ferait croire à une échéance
 * nocturne.
 */
function timeLabel(list: TaskListWithTasks): string | undefined {
  if (list.dueAt === null || list.dueAllDay !== false) return undefined;
  return formatTime(list.dueAt);
}

/**
 * Un 400 vient de nos propres règles et porte un message écrit pour
 * l'utilisateur — ex. une tâche datée d'un jour déjà passé. Tout le reste est
 * remplacé : une panne technique peut transporter des fragments de requête.
 */
function toMessage(cause: Error): string {
  if (cause instanceof ApiError && cause.status === 400) return cause.message;
  return "La tâche n'a pas pu être ajoutée. Réessayez dans un instant.";
}
