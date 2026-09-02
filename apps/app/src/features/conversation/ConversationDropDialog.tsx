import { View } from "react-native";
import type { Conversation, Folder } from "@jc/domain";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Text } from "@/shared/ui/text";
import { useConversationActions } from "./hooks/use-conversation-actions";

/** Conversation lâchée sur un dossier. */
export type ConversationDrop = {
  conversation: Conversation;
  folder: Folder;
};

export type ConversationDropDialogProps = {
  /** `null` = fenêtre fermée. */
  drop: ConversationDrop | null;
  onClose: () => void;
};

/**
 * Ce qu'on fait d'une conversation lâchée sur un dossier.
 *
 * La question est posée plutôt que devinée parce que les deux réponses sont
 * légitimes : une conversation appartient à plusieurs dossiers à la fois — ce
 * n'est pas une duplication, c'est la même donnée vue de plusieurs endroits
 * (§5.2, A.1) — mais le geste du glisser-déposer, lui, dit « déplacer » dans
 * tous les explorateurs de fichiers. Trancher à notre place ferait perdre des
 * rangements dans un cas, en laisserait de vieux dans l'autre.
 *
 * Quand la conversation n'est rangée nulle part, les deux réponses donneraient
 * le même résultat : la fenêtre ne propose alors qu'un seul geste.
 */
export function ConversationDropDialog({ drop, onClose }: ConversationDropDialogProps) {
  return (
    <Dialog
      open={drop !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        {drop ? <DropChoice key={drop.conversation.id} drop={drop} onClose={onClose} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function DropChoice({ drop, onClose }: { drop: ConversationDrop; onClose: () => void }) {
  const { file } = useConversationActions(drop.conversation.id);
  const { conversation, folder } = drop;
  const filedElsewhere = conversation.folderIds.some((id) => id !== folder.id);

  const apply = (folderIds: string[]) => file.mutate(folderIds, { onSuccess: onClose });

  return (
    <>
      <DialogHeader>
        <DialogTitle>Ranger dans « {folder.name} » ?</DialogTitle>
        <DialogDescription>
          {filedElsewhere
            ? `« ${conversation.title} » est déjà rangée ailleurs. Elle peut appartenir aux deux endroits à la fois.`
            : `« ${conversation.title} » rejoindra ce dossier.`}
        </DialogDescription>
      </DialogHeader>

      {/* Message fixe, et non `error.message` : une erreur remontée du serveur
          peut porter des fragments de requête. */}
      {file.isError ? (
        <Text className="text-sm text-destructive">
          Le rangement a échoué. Réessayez dans un instant.
        </Text>
      ) : null}

      <View className="gap-2">
        <Button
          onPress={() => apply([...conversation.folderIds, folder.id])}
          disabled={file.isPending}
        >
          <Text>{filedElsewhere ? "Ajouter à ce dossier" : "Ranger ici"}</Text>
        </Button>

        {/* Le glisser-déposer dit « déplacer » dans tous les explorateurs de
            fichiers : le geste reste offert, il n'est simplement plus le seul. */}
        {filedElsewhere ? (
          <Button variant="outline" onPress={() => apply([folder.id])} disabled={file.isPending}>
            <Text>Déplacer ici seulement</Text>
          </Button>
        ) : null}

        <Button variant="ghost" onPress={onClose} disabled={file.isPending}>
          <Text>Annuler</Text>
        </Button>
      </View>
    </>
  );
}
