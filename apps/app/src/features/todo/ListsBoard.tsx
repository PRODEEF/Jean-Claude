import type { RefObject } from "react";
import { ScrollView, View } from "react-native";
import type { Task, TaskList, TaskListWithTasks } from "@jc/domain";
import { Text } from "@/shared/ui/text";
import { useBreakpoint } from "@/shared/hooks/use-breakpoint";
import { useFolderChoices } from "@/shared/hooks/use-folder-choices";
import { ListCard, type FoldCommand } from "./ListCard";

// Les importeurs existants lisent ces deux noms ici : ils ne bougent pas.
export { dueLabel } from "./ListCard";
export type { FoldCommand } from "./ListCard";

export type ListsBoardProps = {
  lists: TaskListWithTasks[];
  /** Liste ouverte depuis la barre latérale : mise en avant à l'arrivée. */
  highlightedId?: string;
  /**
   * Liste sur laquelle l'écran s'ouvre (celle du moment) : amenée à l'écran
   * sans bordure, contrairement à la liste visée depuis la barre latérale.
   */
  landingId?: string;
  /** Défilement de l'écran — pour amener la liste mise en avant à l'écran. */
  scrollRef?: RefObject<ScrollView | null>;
  /** Recherche en cours, transmise aux lignes pour les mettre en avant. */
  query: string;
  /** Dernier ordre « tout replier / tout déplier ». */
  fold?: FoldCommand;
  onEditList: (list: TaskList) => void;
  onDeleteList: (list: TaskList) => void;
  onOpenTask: (task: Task) => void;
};

/**
 * Toutes les listes, tous dossiers confondus (A.2).
 *
 * Les listes d'achats et les listes de tâches cohabitent sans être fusionnées :
 * une conversation sur le jardin en produit typiquement une de chaque, et les
 * réunir ferait perdre la distinction (§12.1).
 */
export function ListsBoard({
  lists,
  highlightedId,
  landingId,
  scrollRef,
  query,
  fold,
  onEditList,
  onDeleteList,
  onOpenTask,
}: ListsBoardProps) {
  const folders = useFolderChoices();
  // Resserré sur grand écran seulement : au doigt, l'espace généreux laisse
  // de la marge à l'erreur, alors que la souris pointe avec précision et
  // profite d'en voir plus à la fois.
  const desktop = useBreakpoint() === "expanded";

  if (lists.length === 0) {
    return (
      <Text className="text-muted-foreground text-sm">
        Aucune liste pour l'instant. Créez-en une, ou laissez Jean-Claude vous en proposer une au
        fil d'une conversation.
      </Text>
    );
  }

  return (
    <View className={desktop ? "gap-2" : "gap-3"}>
      {lists.map((list) => (
        <ListCard
          key={list.id}
          list={list}
          folders={folders}
          highlighted={list.id === highlightedId}
          landing={list.id === landingId}
          desktop={desktop}
          {...(scrollRef ? { scrollRef } : {})}
          query={query}
          {...(fold ? { fold } : {})}
          onEdit={() => onEditList(list)}
          onDelete={() => onDeleteList(list)}
          onOpenTask={onOpenTask}
        />
      ))}
    </View>
  );
}
