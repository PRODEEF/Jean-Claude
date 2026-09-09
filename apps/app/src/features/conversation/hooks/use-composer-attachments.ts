import { useCallback, useRef, useState } from "react";
import { MESSAGE_ATTACHMENT_MAX_BYTES, MESSAGE_ATTACHMENT_MAX_COUNT } from "@jc/domain";
import { api } from "@/shared/lib/api";
import type { PickedFile } from "./use-attachment-picker";

export type ComposerAttachment =
  | { localId: string; previewUri: string; status: "uploading" }
  | { localId: string; previewUri: string; status: "done"; id: string }
  | { localId: string; previewUri: string; status: "error"; message: string };

let nextLocalId = 0;

/**
 * État des pièces jointes en cours de composition, avant l'envoi du message.
 *
 * L'upload se déclenche dès la sélection d'un fichier, pas à l'envoi : c'est
 * ce qui permet au trombone de fonctionner depuis l'écran d'accueil, avant
 * qu'aucune conversation n'existe — un upload n'a alors aucun identifiant de
 * conversation à quoi se rattacher, il ne dépend que de l'utilisateur
 * authentifié.
 */
export function useComposerAttachments() {
  const [items, setItems] = useState<ComposerAttachment[]>([]);
  // Lu par `add`/`remove` pour connaître l'état courant sans en dépendre : un
  // `setState` doit rester pur, l'upload et la suppression distante ne
  // peuvent donc pas vivre dans son updater.
  const itemsRef = useRef<ComposerAttachment[]>(items);
  itemsRef.current = items;

  const upload = useCallback((localId: string, file: PickedFile) => {
    const formData = new FormData();
    file.appendTo(formData);

    api.attachments
      .upload(formData)
      .then((attachment) => {
        setItems((current) =>
          current.map((item) =>
            item.localId === localId
              ? { localId, previewUri: item.previewUri, status: "done", id: attachment.id }
              : item,
          ),
        );
      })
      .catch((error: unknown) => {
        setItems((current) =>
          current.map((item) =>
            item.localId === localId
              ? {
                  localId,
                  previewUri: item.previewUri,
                  status: "error",
                  message: error instanceof Error ? error.message : "Envoi impossible.",
                }
              : item,
          ),
        );
      });
  }, []);

  const add = useCallback(
    (files: PickedFile[]) => {
      const room = Math.max(0, MESSAGE_ATTACHMENT_MAX_COUNT - itemsRef.current.length);
      const accepted = files.slice(0, room);
      if (accepted.length === 0) return;

      const added: ComposerAttachment[] = accepted.map((file) => {
        const localId = `att-${nextLocalId++}`;
        return file.size > MESSAGE_ATTACHMENT_MAX_BYTES
          ? {
              localId,
              previewUri: file.uri,
              status: "error" as const,
              message: "Image trop lourde : 10 Mo maximum.",
            }
          : { localId, previewUri: file.uri, status: "uploading" as const };
      });

      setItems((current) => [...current, ...added]);

      accepted.forEach((file, index) => {
        const item = added[index];
        if (item?.status === "uploading") upload(item.localId, file);
      });
    },
    [upload],
  );

  const remove = useCallback((localId: string) => {
    const item = itemsRef.current.find((i) => i.localId === localId);
    // Best-effort : si l'appel échoue, la pièce jointe reste en base mais
    // jamais liée à un message — rien à réparer côté utilisateur.
    if (item?.status === "done") void api.attachments.remove(item.id).catch(() => undefined);
    setItems((current) => current.filter((i) => i.localId !== localId));
  }, []);

  const reset = useCallback(() => setItems([]), []);

  const readyIds = items.flatMap((item) => (item.status === "done" ? [item.id] : []));
  const uploading = items.some((item) => item.status === "uploading");

  return { items, add, remove, reset, readyIds, uploading };
}
