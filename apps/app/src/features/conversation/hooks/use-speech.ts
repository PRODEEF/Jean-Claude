import { useCallback, useEffect, useRef, useState } from "react";
import * as Speech from "expo-speech";
import { markdownToSpeech } from "@/shared/lib/markdown";

/**
 * Lecture à voix haute d'une réponse de l'assistant (§12.3, A.12).
 *
 * Un seul message se lit à la fois : démarrer une lecture coupe la précédente,
 * comme le ferait n'importe quel lecteur audio, plutôt que de les empiler en
 * file d'attente — ce que fait `Speech.speak()` par défaut.
 */
export function useSpeech() {
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  // Lu depuis les callbacks de `expo-speech`, qui ferment sur sa valeur au
  // moment de l'appel à `speak` — l'état React, lui, y serait périmé.
  const speakingIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Le fil peut être démonté en cours de lecture (changement de
    // conversation, navigation) : la voix continuerait sinon seule.
    return () => {
      Speech.stop().catch(() => {});
    };
  }, []);

  const toggle = useCallback((messageId: string, content: string) => {
    if (speakingIdRef.current === messageId) {
      Speech.stop().catch(() => {});
      return;
    }

    // Interrompt la lecture en cours plutôt que de mettre celle-ci en file :
    // son callback `onStopped` arrive après coup, une fois l'id courant déjà
    // celui de la nouvelle lecture — `finish` l'ignore pour cette raison.
    const finish = (finishedId: string) => {
      if (speakingIdRef.current !== finishedId) return;
      speakingIdRef.current = null;
      setSpeakingId(null);
    };

    Speech.stop().catch(() => {});
    speakingIdRef.current = messageId;
    setSpeakingId(messageId);
    Speech.speak(markdownToSpeech(content), {
      language: "fr-FR",
      onDone: () => finish(messageId),
      onStopped: () => finish(messageId),
      onError: () => finish(messageId),
    });
  }, []);

  return { speakingId, toggle };
}
