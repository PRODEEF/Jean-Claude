import { useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Conversation, Message, Paginated } from "@jc/domain";
import { api } from "@/shared/lib/api";
import { PROFILE_KEY } from "@/shared/hooks/use-profile";

/** Nombre de messages chargés à l'ouverture du fil. */
const THREAD_PAGE_SIZE = 50;

/**
 * Fil d'une conversation : lecture de l'historique et envoi d'un message.
 *
 * Le message de l'utilisateur s'affiche en deux temps. D'abord tel qu'il a été
 * tapé, hors du cache, dès l'appui sur « Envoyer » : rien ne justifie de lui
 * faire attendre un aller-retour réseau pour relire son propre texte. Puis le
 * serveur, qui l'écrit en base *avant* d'interroger le modèle, le renvoie comme
 * premier événement du flux : la version persistée entre alors dans le cache et
 * la provisoire disparaît, dans le même rendu — jamais les deux à la fois.
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

  /**
   * Message que l'utilisateur vient d'envoyer, affiché avant que le serveur ne
   * l'ait confirmé.
   *
   * Sans lui, la bulle n'apparaît qu'au retour de l'écriture en base : sur une
   * connexion ordinaire, on voit le champ se vider et rien s'afficher pendant
   * une seconde. Le texte n'est pas écrit dans le cache — il vit à côté, et
   * cède la place à la version persistée dès qu'elle arrive, ce qui interdit
   * le doublon.
   */
  const [pendingUserText, setPendingUserText] = useState<string | null>(null);

  const messages = useQuery({
    queryKey: ["conversation", conversationId, "messages"],
    queryFn: () => api.conversations.messages(conversationId, { limit: THREAD_PAGE_SIZE }),
  });

  const send = useMutation({
    mutationFn: async (content: string) => {
      setPendingUserText(content);
      setStreamingText("");

      for await (const event of api.conversations.send(conversationId, {
        content,
        inputMode: "text",
      })) {
        if (event.type === "message") {
          // Le serveur vient de persister le message de l'utilisateur, avant
          // même d'interroger le modèle. L'écrire dans le cache le fait
          // apparaître aussitôt : sans cela, il n'arrivait qu'avec
          // l'invalidation de fin de tour, soit plusieurs secondes après avoir
          // été tapé — le temps d'écrire la réponse.
          queryClient.setQueryData<Paginated<Message>>(
            ["conversation", conversationId, "messages"],
            (current) => {
              if (!current) return current;
              if (current.items.some((item) => item.id === event.message.id)) return current;
              return { ...current, items: [...current.items, event.message] };
            },
          );
          // Dans le même rendu que l'insertion : la bulle provisoire disparaît
          // à l'instant où la persistée la remplace, sans clignotement.
          setPendingUserText(null);
        } else if (event.type === "text") {
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
      // Le titre a pu être posé par l'assistant pendant ce tour (§5.2).
      await queryClient.invalidateQueries({ queryKey: ["conversation", conversationId] });
      // Le tour a pu produire une proposition de l'assistant (§12.1) : elle
      // n'arrive pas dans le flux, elle se relit.
      await queryClient.invalidateQueries({
        queryKey: ["conversation", conversationId, "suggestions"],
      });
      // Le tour a pu clore la conversation d'accueil et écrire ce qu'elle a
      // appris (§6.3) : sans relecture, l'écran continuerait d'offrir de la
      // passer. Une requête de plus est négligeable à l'échelle d'un appel au
      // modèle.
      await queryClient.invalidateQueries({ queryKey: PROFILE_KEY });
      // Après l'invalidation seulement : plus tôt, la bulle en cours
      // disparaîtrait avant que la version persistée n'ait pris sa place.
      setStreamingText(null);
      // Filet : un tour interrompu avant l'événement `message` laisserait
      // sinon la bulle provisoire à l'écran indéfiniment.
      setPendingUserText(null);
    },
  });

  const submit = useCallback((content: string) => send.mutate(content), [send]);

  return { messages, send, submit, streamingText, pendingUserText };
}
