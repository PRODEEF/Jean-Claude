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
  // Ce qui était dans le champ avant le geste, puis chaque segment que la
  // reconnaissance continue a confirmé comme définitif. En continu, chaque
  // résultat — final ou non — ne couvre que le segment en cours depuis le
  // dernier résultat final, jamais le cumul de la session : un résultat
  // provisoire s'affiche par-dessus ce texte sans jamais y être ajouté, et ne
  // s'y intègre qu'au moment où il devient définitif.
  const committed = useRef("");

  useSpeechRecognitionEvent("result", (event) => {
    const transcript = event.results[0]?.transcript ?? "";
    if (event.isFinal) {
      committed.current = joinDictation(committed.current, transcript);
      onTranscript(committed.current);
    } else {
      onTranscript(joinDictation(committed.current, transcript));
    }
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
    committed.current = currentText;
    setListening(true);
    ExpoSpeechRecognitionModule.requestPermissionsAsync()
      .then((permission) => {
        if (!permission.granted) {
          setListening(false);
          return;
        }
        // Sans `continuous`, le reconnaisseur s'arrête de lui-même à la
        // première pause de parole détectée : le bouton semblait se
        // désactiver tout seul après une phrase, avant même que
        // l'utilisateur ait fini de dicter. Il ne s'arrête maintenant que
        // sur `stop()` — le geste explicite de l'utilisateur.
        ExpoSpeechRecognitionModule.start({
          lang: "fr-FR",
          interimResults: true,
          continuous: true,
        });
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
