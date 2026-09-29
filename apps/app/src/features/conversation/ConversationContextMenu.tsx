import type { Conversation } from "@jc/domain";
import { ContextMenu, type ContextMenuItem } from "@/shared/ui/context-menu";

/**
 * Conversation visée et point où le menu doit s'ouvrir, en coordonnées écran.
 * Personnelle par défaut ; une conversation d'espace (`Group`) passe par le
 * même menu.
 */
export type ConversationMenuTarget<T = Conversation> = {
  conversation: T;
  x: number;
  y: number;
};

export type ConversationContextMenuProps<T = Conversation> = {
  /** `null` = menu fermé. */
  target: ConversationMenuTarget<T> | null;
  onClose: () => void;
  /** Absent pour une conversation d'espace, qui ne se renomme pas encore. */
  onRename?: (target: ConversationMenuTarget<T>) => void;
  onFile: (target: ConversationMenuTarget<T>) => void;
  /** Conversion à la demande, plutôt que d'attendre une suggestion (A.2, #17). */
  onConvertToTaskList: (target: ConversationMenuTarget<T>) => void;
  /** Absent pour une conversation d'espace, qui ne se supprime pas encore. */
  onDelete?: (target: ConversationMenuTarget<T>) => void;
};

/**
 * Menu contextuel d'une conversation, dans la barre latérale.
 *
 * « Ranger dans des dossiers » et non « Déplacer vers un dossier » : une
 * conversation appartient à plusieurs dossiers à la fois, ce n'est pas une
 * duplication mais la même donnée vue de plusieurs endroits (§5.2, A.1). Le
 * libellé doit dire ce que la fenêtre permet réellement.
 */
export function ConversationContextMenu<T = Conversation>({
  target,
  onClose,
  onRename,
  onFile,
  onConvertToTaskList,
  onDelete,
}: ConversationContextMenuProps<T>) {
  if (!target) return null;

  const items: ContextMenuItem[] = [
    ...(onRename ? [{ label: "Renommer", onPress: () => onRename(target) }] : []),
    { label: "Ranger dans des dossiers", onPress: () => onFile(target) },
    { label: "Convertir en todoliste", onPress: () => onConvertToTaskList(target) },
    ...(onDelete
      ? [{ label: "Supprimer", destructive: true, onPress: () => onDelete(target) }]
      : []),
  ];

  return <ContextMenu x={target.x} y={target.y} items={items} onClose={onClose} />;
}
