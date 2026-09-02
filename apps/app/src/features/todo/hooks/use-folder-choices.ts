import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { FolderTreeNode } from "@jc/domain";
import { api } from "@/shared/lib/api";

export type FolderChoice = { id: string; name: string };

/**
 * Dossiers de l'utilisateur, mis à plat pour être proposés en liste.
 *
 * Le chemin complet plutôt que le seul nom : deux dossiers « Assurances » sous
 * deux parents différents seraient indiscernables dans un choix.
 *
 * Même clé de cache que la barre latérale : l'arborescence est déjà chargée
 * quand cet écran s'ouvre.
 */
export function useFolderChoices(): FolderChoice[] {
  const { data } = useQuery({
    queryKey: ["folders"],
    queryFn: () => api.folders.tree(),
  });

  return useMemo(() => flatten(data ?? [], ""), [data]);
}

function flatten(nodes: FolderTreeNode[], prefix: string): FolderChoice[] {
  return nodes.flatMap((node) => {
    const name = prefix ? `${prefix} › ${node.name}` : node.name;
    return [{ id: node.id, name }, ...flatten(node.children, name)];
  });
}
