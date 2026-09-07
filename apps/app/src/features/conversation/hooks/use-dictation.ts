import { useCallback, useEffect, useRef, useState } from "react";
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from "expo-speech-recognition";

/**
 * Dictée d'un message (§12.3, A.12).
 *
 * `onTranscript` reçoit le texte du champ tel qu'il doit devenir : ce qui y
 * était avant le geste, suivi de ce qui est reconnu depuis — la dictée
 * complète un brouillon déjà tapé plutôt que de l'effacer.
 */
export function useDictation(onTranscript: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const baseText = useRef("");

  useSpeechRecognitionEvent("result", (event) => {
    const transcript = event.results[0]?.transcript ?? "";
    onTranscript(joinDictation(baseText.current, transcript));
  });

  useSpeechRecognitionEvent("end", () => setListening(false));

  useSpeechRecognitionEvent("error", (event) => {
    // Le refus de permission arrive aussi ici (code "not-allowed") : rien de
    // plus à faire que revenir à l'état de repos, le geste n'a produit aucun
    // texte à perdre.
    console.warn("Dictée impossible :", event.message);
    setListening(false);
  });

  const start = useCallback((currentText: string) => {
    baseText.current = currentText;
    setListening(true);
    ExpoSpeechRecognitionModule.requestPermissionsAsync()
      .then((permission) => {
        if (!permission.granted) {
          setListening(false);
          return;
        }
        ExpoSpeechRecognitionModule.start({ lang: "fr-FR", interimResults: true });
      })
      .catch((error: unknown) => {
        console.warn("Dictée impossible :", error instanceof Error ? error.message : error);
        setListening(false);
      });
  }, []);

  const stop = useCallback(() => ExpoSpeechRecognitionModule.stop(), []);

  useEffect(() => {
    // Le champ peut disparaître en pleine dictée (changement de conversation,
    // navigation) : `abort`, pas `stop` — plus personne n'écoutera le
    // résultat final, autant couper court plutôt que d'attendre la réponse
    // du reconnaisseur.
    return () => ExpoSpeechRecognitionModule.abort();
  }, []);

  return { listening, start, stop };
}

/**
 * Le texte du champ après un fragment dicté : ce qui y était, puis ce qui est
 * reconnu — jamais l'inverse, la dictée poursuit ce que l'utilisateur a déjà
 * commencé à taper.
 */
function joinDictation(base: string, transcript: string): string {
  const trimmedBase = base.trim();
  if (trimmedBase.length === 0) return transcript;
  if (transcript.length === 0) return trimmedBase;
  return `${trimmedBase} ${transcript}`;
}
