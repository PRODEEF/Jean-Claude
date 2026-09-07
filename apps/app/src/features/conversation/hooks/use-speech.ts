import { useCallback, useEffect, useRef, useState } from "react";
import * as Speech from "expo-speech";
import { markdownToSpeech } from "@/shared/lib/markdown";

/**
 * Meilleure voix française disponible sur l'appareil, résolue une seule fois
 * et partagée entre tous les appels : `getAvailableVoicesAsync` interroge le
 * système, et la liste ne change pas en cours de session.
 *
 * Une voix « Enhanced » — quand le système en propose une, surtout sur iOS —
 * sonne nettement moins robotique que la voix « Default » prise sans
 * précision. `null` laisse le système choisir lui-même, en dernier recours.
 */
let frenchVoice: Promise<string | null> | null = null;

function bestFrenchVoice(): Promise<string | null> {
  if (!frenchVoice) {
    frenchVoice = Speech.getAvailableVoicesAsync()
      .then((voices) => {
        const french = voices.filter((voice) => voice.language.toLowerCase().startsWith("fr"));
        if (french.length === 0) return null;

        const score = (voice: Speech.Voice) =>
          (voice.language.toLowerCase() === "fr-fr" ? 2 : 0) +
          (voice.quality === Speech.VoiceQuality.Enhanced ? 1 : 0);

        return [...french].sort((a, b) => score(b) - score(a))[0]?.identifier ?? null;
      })
      .catch(() => null);
  }
  return frenchVoice;
}

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
      // Peut couper une lecture qui n'a pas encore démarré : `bestFrenchVoice`
      // ne résout de façon asynchrone qu'au tout premier appel de la session,
      // et un stop dans cette fenêtre ne doit pas laisser la lecture partir
      // malgré tout une fois la voix connue.
      speakingIdRef.current = null;
      setSpeakingId(null);
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

    const text = markdownToSpeech(content);
    bestFrenchVoice().then((voice) => {
      // Un stop ou un autre message a pu passer devant pendant la résolution.
      if (speakingIdRef.current !== messageId) return;
      Speech.speak(text, {
        language: "fr-FR",
        voice: voice ?? undefined,
        onDone: () => finish(messageId),
        onStopped: () => finish(messageId),
        onError: () => finish(messageId),
      });
    });
  }, []);

  return { speakingId, toggle };
}
