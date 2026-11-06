import { MAX_FOLDER_DEPTH, type Folder } from "@jc/domain";
import { ContextMenu, type ContextMenuItem } from "@/shared/ui/context-menu";

/** Dossier visé et point où le menu doit s'ouvrir, en coordonnées écran. */
export type FolderMenuTarget = {
  folder: Folder;
  /** 1 pour un dossier racine — dit s'il peut encore accueillir un sous-dossier. */
  depth: number;
  x: number;
  y: number;
};

export type FolderContextMenuProps = {
  /** `null` = menu fermé. */
  target: FolderMenuTarget | null;
  onClose: () => void;
  onNewConversation: (target: FolderMenuTarget) => void;
  onRename: (target: FolderMenuTarget) => void;
  onAddChild: (target: FolderMenuTarget) => void;
  onAddTaskList: (target: FolderMenuTarget) => void;
  onDelete: (target: FolderMenuTarget) => void;
};

/** Menu contextuel d'un dossier : ce qu'on peut en faire d'un clic droit. */
export function FolderContextMenu({
  target,
  onClose,
  onNewConversation,
  onRename,
  onAddChild,
  onAddTaskList,
  onDelete,
}: FolderContextMenuProps) {
  if (!target) return null;

  // Même ordre que le menu d'un espace (`WorkspaceSidebarBody`) : ce qu'on crée
  // d'abord, puis renommer, puis supprimer à part.
  const items: ContextMenuItem[] = [
    // Une conversation créée d'ici naît déjà rangée dans ce dossier.
    { label: "Nouvelle conversation", onPress: () => onNewConversation(target) },

    // Une todoliste créée d'ici naît déjà rangée : elle restera visible dans ce
    // dossier comme dans l'onglet Mes listes (A.2).
    { label: "Nouvelle todoliste", onPress: () => onAddTaskList(target) },

    // L'arborescence est bornée à `MAX_FOLDER_DEPTH` niveaux : au dernier, un
    // sous-dossier ne rentre plus. Le serveur le refuse déjà, autant ne pas
    // proposer le geste.
    ...(target.depth < MAX_FOLDER_DEPTH
      ? [{ label: "Ajouter un sous-dossier", onPress: () => onAddChild(target) }]
      : []),

    { label: "Renommer", onPress: () => onRename(target) },

    { label: "Supprimer", destructive: true, onPress: () => onDelete(target) },
  ];

  return <ContextMenu x={target.x} y={target.y} items={items} onClose={onClose} />;
}
