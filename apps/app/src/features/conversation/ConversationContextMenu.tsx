import type { Conversation } from "@jc/domain";
import { ContextMenu, type ContextMenuItem } from "@/shared/ui/context-menu";

/** Conversation visée et point où le menu doit s'ouvrir, en coordonnées écran. */
export type ConversationMenuTarget = {
  conversation: Conversation;
  x: number;
  y: number;
};

export type ConversationContextMenuProps = {
  /** `null` = menu fermé. */
  target: ConversationMenuTarget | null;
  onClose: () => void;
  onRename: (target: ConversationMenuTarget) => void;
  onFile: (target: ConversationMenuTarget) => void;
  onDelete: (target: ConversationMenuTarget) => void;
};

/**
 * Menu contextuel d'une conversation, dans la barre latérale.
 *
 * « Ranger dans des dossiers » et non « Déplacer vers un dossier » : une
 * conversation appartient à plusieurs dossiers à la fois, ce n'est pas une
 * duplication mais la même donnée vue de plusieurs endroits (§5.2, A.1). Le
 * libellé doit dire ce que la fenêtre permet réellement.
 */
export function ConversationContextMenu({
  target,
  onClose,
  onRename,
  onFile,
  onDelete,
}: ConversationContextMenuProps) {
  if (!target) return null;

  const items: ContextMenuItem[] = [
    { label: "Renommer", onPress: () => onRename(target) },
    { label: "Ranger dans des dossiers", onPress: () => onFile(target) },
    { label: "Supprimer", destructive: true, onPress: () => onDelete(target) },
  ];

  return <ContextMenu x={target.x} y={target.y} items={items} onClose={onClose} />;
}
