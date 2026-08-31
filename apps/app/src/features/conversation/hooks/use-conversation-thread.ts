import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/lib/api";

/** Nombre de messages chargés à l'ouverture du fil. */
const THREAD_PAGE_SIZE = 50;

/**
 * Fil d'une conversation : lecture de l'historique et envoi d'un message.
 *
 * L'envoi n'est pas optimiste. Le serveur écrit le message de l'utilisateur
 * *avant* d'interroger le modèle : si le moteur échoue, le message est bien
 * conservé côté base, et une insertion optimiste locale ferait apparaître un
 * doublon au rechargement.
 */
export function useConversationThread(conversationId: string) {
  const queryClient = useQueryClient();

  const messages = useQuery({
    queryKey: ["conversation", conversationId, "messages"],
    queryFn: () => api.conversations.messages(conversationId, { limit: THREAD_PAGE_SIZE }),
  });

  const send = useMutation({
    mutationFn: (content: string) =>
      api.conversations.send(conversationId, { content, inputMode: "text" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["conversation", conversationId, "messages"],
      });
      // Le tri de la liste des conversations dépend de `lastMessageAt`, que
      // ce tour vient de déplacer.
      await queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });

  return { messages, send };
}
