import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from "expo-speech-recognition";

/**
 * Message affiché à l'utilisateur pour toute panne qui n'est pas un refus de
 * permission.
 *
 * Formulé selon la plateforme : l'autorisation se donne dans le navigateur sur
 * le web, dans les réglages du système sur iOS et Android. Parler de
 * « navigateur » à quelqu'un sur son téléphone l'enverrait chercher un écran
 * qui n'existe pas.
 */
const GENERIC_UNAVAILABLE =
  Platform.OS === "web"
    ? "La dictée n'est pas disponible sur ce navigateur."
    : "La dictée n'est pas disponible sur cet appareil.";

/** Message affiché quand le micro est explicitement refusé, plutôt qu'indisponible. */
const PERMISSION_DENIED =
  Platform.OS === "web"
    ? "Autorisez le microphone pour ce site dans les réglages de votre navigateur."
    : "Autorisez le microphone dans les réglages de votre appareil.";

/**
 * Dictée d'un message (§12.3, A.12).
 *
 * `onTranscript` reçoit le texte du champ tel qu'il doit devenir : ce qui y
 * était avant le geste, suivi de ce qui est reconnu depuis — la dictée
 * complète un brouillon déjà tapé plutôt que de l'effacer.
 */
export function useDictation(onTranscript: (text: string) => void) {
  const [listening, setListening] = useState(false);
  // Message à montrer à l'utilisateur, `null` s'il n'y a rien à signaler.
  //
  // Pas de vérification en amont façon `isRecognitionAvailable()` : sur le
  // web, Brave expose `webkitSpeechRecognition` comme n'importe quel
  // navigateur issu de Chromium — l'objet existe, seul le service qu'il
  // pilote est bloqué à l'exécution. Impossible donc de le savoir avant
  // d'essayer ; seul un vrai essai le révèle, par l'événement `error`.
  const [error, setError] = useState<string | null>(null);
  // Ce qui était dans le champ avant le geste, puis chaque segment que la
  // reconnaissance continue a confirmé comme définitif. En continu, chaque
  // résultat — final ou non — ne couvre que le segment en cours depuis le
  // dernier résultat final, jamais le cumul de la session : un résultat
  // provisoire s'affiche par-dessus ce texte sans jamais y être ajouté, et ne
  // s'y intègre qu'au moment où il devient définitif.
  const committed = useRef("");

  useSpeechRecognitionEvent("result", (event) => {
    setError(null);
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
    setListening(false);
    // Ni l'un ni l'autre n'est une panne à signaler : un silence n'empêche pas
    // de réessayer de parler, et `aborted` ne vient que de nos propres
    // `abort()` — clôture de la session à l'envoi, ou démontage du champ. Le
    // premier survient à chaque message envoyé : le journaliser reviendrait à
    // signaler une panne à chaque fois qu'une dictée aboutit.
    if (event.error === "no-speech" || event.error === "aborted") return;
    // `event.error` porte le code (ex. "not-allowed", "network") ;
    // `event.message`, lui, reste vide sur la plupart des navigateurs — le
    // logger sans le code ne dit jamais pourquoi.
    console.warn("Dictée impossible :", event.error, event.message);
    setError(event.error === "not-allowed" ? PERMISSION_DENIED : GENERIC_UNAVAILABLE);
  });

  const start = useCallback((currentText: string) => {
    setError(null);
    committed.current = currentText;
    ExpoSpeechRecognitionModule.requestPermissionsAsync()
      .then((permission) => {
        if (!permission.granted) {
          setError(PERMISSION_DENIED);
          return;
        }
        // Pas plus tôt : à la première dictée, la permission passe par une
        // boîte de dialogue du système, et le bouton se serait annoncé en
        // écoute — pulsation et libellé « Arrêter la dictée » — pendant tout
        // le temps où l'utilisateur la lit, sans que rien soit enregistré.
        setListening(true);
        // Sans `continuous`, le reconnaisseur s'arrête de lui-même à la
        // première pause de parole détectée : le bouton semblait se
        // désactiver tout seul après une phrase, avant même que
        // l'utilisateur ait fini de dicter. Il ne s'arrête maintenant que sur
        // un geste — `stop()` sur le bouton, `cancel()` à l'envoi du message.
        ExpoSpeechRecognitionModule.start({
          lang: "fr-FR",
          interimResults: true,
          continuous: true,
        });
      })
      .catch((error: unknown) => {
        console.warn("Dictée impossible :", error instanceof Error ? error.message : error);
        setListening(false);
        setError(GENERIC_UNAVAILABLE);
      });
  }, []);

  const stop = useCallback(() => ExpoSpeechRecognitionModule.stop(), []);

  /**
   * Clôt la session sans en attendre le moindre résultat, le brouillon qu'elle
   * alimentait étant parti.
   *
   * `abort` et non `stop` : `stop` réclame un dernier résultat définitif, qui
   * arriverait une fois le champ vidé et y reposerait le message déjà envoyé.
   * Remettre `committed` à zéro ne suffirait donc pas.
   */
  const cancel = useCallback(() => {
    committed.current = "";
    setListening(false);
    ExpoSpeechRecognitionModule.abort();
  }, []);

  useEffect(() => {
    // Le champ peut disparaître en pleine dictée (changement de conversation,
    // navigation) : `abort`, pas `stop` — plus personne n'écoutera le
    // résultat final, autant couper court plutôt que d'attendre la réponse
    // du reconnaisseur.
    return () => ExpoSpeechRecognitionModule.abort();
  }, []);

  return { listening, error, start, stop, cancel };
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
