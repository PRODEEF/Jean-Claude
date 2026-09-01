import { useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Conversation } from "@jc/domain";
import { api } from "@/shared/lib/api";

/** Nombre de messages chargés à l'ouverture du fil. */
const THREAD_PAGE_SIZE = 50;

/**
 * Fil d'une conversation : lecture de l'historique et envoi d'un message.
 *
 * L'envoi n'est pas optimiste. Le serveur écrit le message de l'utilisateur
 * *avant* d'interroger le modèle, et le renvoie comme premier événement du
 * flux : une insertion optimiste locale ferait un doublon.
 */
export function useConversationThread(
  conversationId: string,
  /**
   * Appelé quand le canal permanent a jugé la demande hors de son périmètre
   * (A.10) : la conversation qui l'accueille existe déjà, il reste à y emmener
   * l'utilisateur avec sa question.
   */
  onRedirect?: (conversation: Conversation, content: string) => void,
) {
  const queryClient = useQueryClient();

  /**
   * Réponse en cours de génération. Volontairement hors du cache React Query :
   * ce n'est pas encore une donnée serveur, et l'y écrire la ferait survivre à
   * une invalidation qui, elle, doit repartir de la base.
   */
  const [streamingText, setStreamingText] = useState<string | null>(null);

  const messages = useQuery({
    queryKey: ["conversation", conversationId, "messages"],
    queryFn: () => api.conversations.messages(conversationId, { limit: THREAD_PAGE_SIZE }),
  });

  const send = useMutation({
    mutationFn: async (content: string) => {
      setStreamingText("");

      for await (const event of api.conversations.send(conversationId, {
        content,
        inputMode: "text",
      })) {
        if (event.type === "text") {
          setStreamingText((current) => (current ?? "") + event.text);
        } else if (event.type === "redirect") {
          onRedirect?.(event.conversation, content);
        } else if (event.type === "error") {
          // L'échec survient après le premier octet : il ne peut plus prendre
          // la forme d'un code HTTP, il arrive donc dans le flux.
          throw new Error(event.message);
        }
      }
    },
    // `onSettled` et non `onSuccess` : le serveur écrit le message de
    // l'utilisateur avant d'interroger le modèle. Si le moteur échoue, le
    // message existe malgré tout en base — ne pas rafraîchir le fil le ferait
    // disparaître de l'écran alors qu'il sera bien là au rechargement.
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["conversation", conversationId, "messages"],
      });
      // Le tri de la liste des conversations dépend de `lastMessageAt`, que
      // ce tour vient de déplacer.
      await queryClient.invalidateQueries({ queryKey: ["conversations"] });
      // Le tour a pu produire une proposition de l'assistant (§12.1) : elle
      // n'arrive pas dans le flux, elle se relit.
      await queryClient.invalidateQueries({
        queryKey: ["conversation", conversationId, "suggestions"],
      });
      // Après l'invalidation seulement : plus tôt, la bulle en cours
      // disparaîtrait avant que la version persistée n'ait pris sa place.
      setStreamingText(null);
    },
  });

  const submit = useCallback((content: string) => send.mutate(content), [send]);

  return { messages, send, submit, streamingText };
}
