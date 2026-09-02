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
  onRename: (target: FolderMenuTarget) => void;
  onAddChild: (target: FolderMenuTarget) => void;
  onAddTaskList: (target: FolderMenuTarget) => void;
  onDelete: (target: FolderMenuTarget) => void;
};

/** Menu contextuel d'un dossier : ce qu'on peut en faire d'un clic droit. */
export function FolderContextMenu({
  target,
  onClose,
  onRename,
  onAddChild,
  onAddTaskList,
  onDelete,
}: FolderContextMenuProps) {
  if (!target) return null;

  const items: ContextMenuItem[] = [
    { label: "Renommer", onPress: () => onRename(target) },

    // L'arborescence est bornée à `MAX_FOLDER_DEPTH` niveaux : au dernier, un
    // sous-dossier ne rentre plus. Le serveur le refuse déjà, autant ne pas
    // proposer le geste.
    ...(target.depth < MAX_FOLDER_DEPTH
      ? [{ label: "Ajouter un sous-dossier", onPress: () => onAddChild(target) }]
      : []),

    // Une todoliste créée d'ici naît déjà rangée : elle restera visible dans ce
    // dossier comme dans l'onglet Todoliste (A.2).
    { label: "Nouvelle todoliste", onPress: () => onAddTaskList(target) },

    { label: "Supprimer", destructive: true, onPress: () => onDelete(target) },
  ];

  return <ContextMenu x={target.x} y={target.y} items={items} onClose={onClose} />;
}
