import { useCallback, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Conversation, Message, MessageStreamEvent, Paginated } from "@jc/domain";
import { api } from "@/shared/lib/api";
import { PROFILE_KEY } from "@/shared/hooks/use-profile";

/** Nombre de messages chargés à l'ouverture du fil. */
const THREAD_PAGE_SIZE = 50;

/**
 * Ce qui déclenche un tour de dialogue.
 *
 * Les trois produisent la même suite d'événements et ne diffèrent que par ce
 * qu'ils demandent au serveur de faire du fil avant d'appeler le modèle : une
 * seule mutation les porte donc toutes.
 */
type Turn =
  | { kind: "send"; content: string }
  | { kind: "edit"; messageId: string; content: string }
  | { kind: "retry"; messageId: string };

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
   * Appelé quand l'utilisateur a validé la bascule proposée par le canal
   * permanent (A.10) : la conversation dédiée vient d'être ouverte, il reste à
   * y emmener l'utilisateur avec sa question.
   */
  onSwitched?: (conversation: Conversation, content: string) => void,
  /**
   * Appelé quand le tour a échoué **avant** que le serveur n'enregistre le
   * message : il n'existe alors nulle part, et l'écran peut le rendre à
   * l'utilisateur. Après l'enregistrement, au contraire, le renvoyer le
   * dupliquerait.
   */
  onLostBeforeSending?: (content: string) => void,
) {
  const queryClient = useQueryClient();

  /**
   * Génération en cours, pour pouvoir l'interrompre.
   *
   * Le serveur écrit dans son `finally` le texte déjà produit : couper le flux
   * ne perd donc pas la réponse partielle, elle revient à l'invalidation de fin
   * de tour.
   */
  const abort = useRef<AbortController | null>(null);

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
    mutationFn: async (turn: Turn) => {
      // Seul l'envoi a un message à montrer avant le serveur : une correction
      // ou une reprise partent d'un texte qui est déjà à l'écran.
      if (turn.kind === "send") setPendingUserText(turn.content);
      setStreamingText("");

      // Le serveur efface la suite du fil avant de rejouer : sans ce raccord,
      // les messages qu'il vient de supprimer resteraient affichés pendant
      // toute la génération, sous la réponse qui les remplace.
      if (turn.kind !== "send") {
        queryClient.setQueryData<Paginated<Message>>(
          ["conversation", conversationId, "messages"],
          (current) => (current ? { ...current, items: truncated(current.items, turn) } : current),
        );
      }

      const controller = new AbortController();
      abort.current = controller;

      /** Le serveur a-t-il confirmé avoir enregistré le message ? */
      let stored = false;
      /** Du texte est-il arrivé ? Le tour s'est-il conclu de lui-même ? */
      let streamed = false;
      let closed = false;

      try {
        for await (const event of turnEvents(conversationId, turn, controller.signal)) {
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
            stored = true;
          } else if (event.type === "text") {
            streamed = true;
            setStreamingText((current) => (current ?? "") + event.text);
          } else if (event.type === "done") {
            closed = true;
          } else if (event.type === "error") {
            // L'échec survient après le premier octet : il ne peut plus prendre
            // la forme d'un code HTTP, il arrive donc dans le flux.
            throw new Error(event.message);
          }
        }
      } catch (error) {
        // Une génération que l'utilisateur a lui-même coupée n'est pas un
        // échec : le serveur a conservé le texte déjà produit, et
        // l'invalidation de fin de tour le ramènera à l'écran.
        if (!controller.signal.aborted) throw error;
        return;
      }

      // Rien n'a été enregistré : le message n'existe que dans cet appel, et le
      // rendre à l'utilisateur est la seule façon de ne pas le perdre. Après
      // l'enregistrement, au contraire, le renvoyer le dupliquerait. Une
      // reprise n'a rien à rendre — son texte est resté en base.
      if (!stored && turn.kind === "send") onLostBeforeSending?.(turn.content);

      // Le serveur clôt par `done` dès qu'il a produit du texte, et le fait
      // depuis un `finally` : du texte sans `done`, c'est un flux coupé en
      // route. Sans ce contrôle, une réponse tronquée se présentait exactement
      // comme une réponse complète.
      if (streamed && !closed) {
        throw new Error("La réponse a été interrompue : elle s'affiche telle qu'elle est arrivée.");
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
      abort.current = null;
    },
  });

  /**
   * Ouvre la conversation dédiée que le canal permanent a proposée (A.10).
   *
   * L'échange bascule alors hors du contexte du canal, côté serveur : le fil
   * est relu pour que la carte de validation disparaisse.
   */
  const switchAside = useMutation({
    mutationFn: (input: { messageId: string; draft: string }) =>
      api.conversations.switchAside(conversationId, input.messageId),
    onSuccess: async (conversation, input) => {
      await queryClient.invalidateQueries({ queryKey: ["conversations"] });
      await queryClient.invalidateQueries({
        queryKey: ["conversation", conversationId, "messages"],
      });
      onSwitched?.(conversation, input.draft);
    },
  });

  const submit = useCallback((content: string) => send.mutate({ kind: "send", content }), [send]);

  /** Corrige un message envoyé : la suite du fil part avec l'ancien texte. */
  const edit = useCallback(
    (messageId: string, content: string) => send.mutate({ kind: "edit", messageId, content }),
    [send],
  );

  /** Redemande une réponse au modèle à partir de ce point du fil. */
  const retry = useCallback(
    (messageId: string) => send.mutate({ kind: "retry", messageId }),
    [send],
  );

  /**
   * Interrompt la génération en cours.
   *
   * Ce que font les trois références du §4.2 : le bouton d'envoi devient un
   * bouton d'arrêt pendant que le modèle écrit. Rien n'est perdu — le serveur
   * conserve le texte déjà produit.
   */
  const stop = useCallback(() => abort.current?.abort(), []);

  return { messages, send, submit, edit, retry, stop, switchAside, streamingText, pendingUserText };
}

/**
 * Le fil tel qu'il sera après que le serveur ait rejoué ce tour.
 *
 * Une correction remplace le texte et emporte ce qui suivait ; une réponse
 * rejouée disparaît, une demande rejouée reste en tête.
 */
function truncated(items: Message[], turn: Turn): Message[] {
  if (turn.kind === "send") return items;

  const index = items.findIndex((item) => item.id === turn.messageId);
  const target = items[index];
  if (!target) return items;

  if (turn.kind === "retry") {
    return target.role === "assistant" ? items.slice(0, index) : items.slice(0, index + 1);
  }

  return [...items.slice(0, index), { ...target, content: turn.content }];
}

/** Le flux d'événements correspondant à la forme du tour demandé. */
function turnEvents(
  conversationId: string,
  turn: Turn,
  signal: AbortSignal,
): AsyncIterable<MessageStreamEvent> {
  if (turn.kind === "edit") {
    return api.conversations.editMessage(
      conversationId,
      turn.messageId,
      { content: turn.content },
      signal,
    );
  }
  if (turn.kind === "retry") {
    return api.conversations.retryMessage(conversationId, turn.messageId, signal);
  }
  return api.conversations.send(
    conversationId,
    { content: turn.content, inputMode: "text" },
    signal,
  );
}
