import { useCallback, useEffect, useRef, useState } from "react";
import * as Speech from "expo-speech";
import type { Language } from "@jc/domain";
import { markdownToSpeech } from "@/shared/lib/markdown";
import { useProfile } from "@/shared/hooks/use-profile";

/**
 * Meilleure voix disponible sur l'appareil pour chaque langue, résolue une fois
 * que le système a répondu puis partagée entre tous les appels : la liste des
 * voix ne change pas en cours de session.
 *
 * Une voix « Enhanced » — quand le système en propose une, surtout sur iOS —
 * sonne nettement moins robotique que la voix « Default » prise sans
 * précision. `null` laisse le système choisir lui-même, en dernier recours.
 */
const voices = new Map<Language, Promise<string | null>>();

/**
 * Consigne un échec de synthèse.
 *
 * Aucun de ces échecs ne vaut d'interrompre l'utilisateur par un message : il
 * n'a rien demandé d'autre que d'écouter une réponse, et la lecture s'arrête
 * d'elle-même. Ils ne doivent pas pour autant disparaître sans trace.
 */
function warnSpeechFailure(context: string, error: unknown): void {
  console.warn(`${context} :`, error instanceof Error ? error.message : "raison inconnue");
}

/** Coupe la lecture en cours. */
function stopSpeech(): void {
  Speech.stop().catch((error: unknown) =>
    warnSpeechFailure("Arrêt de la lecture impossible", error),
  );
}

/** Code de langue du système de synthèse pour chaque langue de l'assistant. */
const SPEECH_LOCALES: Record<Language, string> = {
  fr: "fr-FR",
  en: "en-US",
  es: "es-ES",
  de: "de-DE",
  it: "it-IT",
  pt: "pt-PT",
};

/**
 * Meilleure voix du système pour la langue choisie. Une voix par langue est
 * retenue : changer de langue dans les réglages change la voix à la lecture
 * suivante, sans rechargement.
 */
function bestVoice(language: Language): Promise<string | null> {
  const cached = voices.get(language);
  if (cached) return cached;

  const resolving = Speech.getAvailableVoicesAsync()
    .then((available) => {
      // Sur web, `speechSynthesis.getVoices()` rend une liste vide tant que le
      // navigateur n'a pas fini de charger ses voix — un état transitoire, pas
      // une réponse. La retenir condamnerait toute la session à la voix par
      // défaut du navigateur, souvent anglaise ; on laisse donc le prochain
      // appel réinterroger le système.
      if (available.length === 0) {
        voices.delete(language);
        return null;
      }

      const matching = available.filter((voice) =>
        voice.language.toLowerCase().startsWith(language),
      );
      if (matching.length === 0) return null;

      const score = (voice: Speech.Voice) =>
        (voice.language.toLowerCase() === SPEECH_LOCALES[language].toLowerCase() ? 2 : 0) +
        (voice.quality === Speech.VoiceQuality.Enhanced ? 1 : 0);

      return [...matching].sort((a, b) => score(b) - score(a))[0]?.identifier ?? null;
    })
    .catch((error: unknown) => {
      warnSpeechFailure("Voix du système illisibles", error);
      voices.delete(language);
      return null;
    });

  voices.set(language, resolving);
  return resolving;
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
      stopSpeech();
    };
  }, []);

  const language = useProfile().data?.preferences.language ?? "fr";
  const toggle = useCallback(
    (messageId: string, content: string) => {
      if (speakingIdRef.current === messageId) {
        // Peut couper une lecture qui n'a pas encore démarré : `bestFrenchVoice`
        // résout de façon asynchrone, et un stop dans cette fenêtre ne doit pas
        // laisser la lecture partir malgré tout une fois la voix connue.
        speakingIdRef.current = null;
        setSpeakingId(null);
        stopSpeech();
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

      stopSpeech();
      speakingIdRef.current = messageId;
      setSpeakingId(messageId);

      const text = markdownToSpeech(content);
      bestVoice(language).then((voice) => {
        // Un stop ou un autre message a pu passer devant pendant la résolution.
        if (speakingIdRef.current !== messageId) return;
        Speech.speak(text, {
          language: SPEECH_LOCALES[language],
          voice: voice ?? undefined,
          onDone: () => finish(messageId),
          onStopped: () => finish(messageId),
          onError: (error) => {
            warnSpeechFailure("Lecture impossible", error);
            finish(messageId);
          },
        });
      });
    },
    [language],
  );

  return { speakingId, toggle };
}
