import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { ArrowUp, Mic, Paperclip, Square } from "lucide-react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { MESSAGE_ATTACHMENT_MAX_COUNT, MESSAGE_MAX_LENGTH, type MessageInputMode } from "@jc/domain";
import { fontSize, MIN_TOUCH_TARGET, radius, spacing } from "@jc/design";
import { FONT_FAMILY } from "@/shared/lib/fonts";
import { useTheme } from "@/shared/providers/theme-provider";
import { AttachmentFileCard } from "./AttachmentFileCard";
import { AttachmentThumbnail } from "./AttachmentThumbnail";
import { useDictation } from "./hooks/use-dictation";
import type { ComposerAttachment } from "./hooks/use-composer-attachments";

/**
 * Part de la hauteur de fenêtre au-delà de laquelle la saisie cesse de
 * grandir. Un brouillon doit se relire entier avant d'être envoyé — mais passé
 * cette part, c'est la conversation qu'il chasserait de l'écran.
 */
const MAX_HEIGHT_RATIO = 0.45;

/** Hauteur d'une ligne : le champ naît là, et n'y redescend qu'une fois vidé. */
const MIN_INPUT_HEIGHT = 24;

/**
 * Le nœud que react-native-web rend pour une saisie multiligne.
 *
 * Un `instanceof` plutôt qu'un `as` : sur iOS et Android, la référence n'est
 * pas un élément du DOM, et le contrôle doit donc être fait à l'exécution.
 */
function asTextArea(node: unknown): HTMLTextAreaElement | null {
  return typeof HTMLTextAreaElement !== "undefined" && node instanceof HTMLTextAreaElement
    ? node
    : null;
}

export type ComposerProps = {
  value: string;
  onChangeText: (value: string) => void;
  /**
   * Appelé sur Entrée comme sur la flèche. À l'appelant de vider le champ.
   *
   * Porte le mode d'entrée du message qui part : « voice » si le dernier
   * geste sur ce brouillon a été un fragment dicté, « text » sinon — retapé
   * par-dessus, il n'y a plus lieu de le lire à voix haute (§12.3, A.12).
   */
  onSubmit: (inputMode: MessageInputMode) => void;
  placeholder: string;
  /** Un tour est en cours : la flèche devient un bouton d'arrêt. */
  busy?: boolean;
  onStop?: () => void;
  inputRef?: RefObject<TextInput | null>;
  autoFocus?: boolean;
  /** Images et PDF en cours de composition, affichés au-dessus du champ (§13.4.1). */
  attachments: ComposerAttachment[];
  onRemoveAttachment: (localId: string) => void;
  /** Résultat de `useAttachmentPicker`, instancié par l'appelant — voir ce hook. */
  picker: { pick: () => void; dropRef: RefObject<View | null>; isOver: boolean };
};

/**
 * Champ de saisie d'un message.
 *
 * Le bouton est dans le champ, et le champ seul porte le cadre : la saisie se
 * lit comme un objet unique posé sur le fil, sans bandeau qui la sépare de la
 * conversation. C'est ce que font ChatGPT, Claude et Perplexity (§4.2).
 *
 * Partagé par le fil et l'écran d'accueil : c'est la même saisie, et deux
 * copies auraient divergé au premier ajustement.
 *
 * Le champ grandit avec ce qu'on y écrit, jusqu'à une fraction de l'écran :
 * relire son message avant de l'envoyer ne doit pas demander de le faire
 * défiler dans une fenêtre de deux lignes.
 *
 * La coque entière donne le focus au champ : elle se lit comme une zone de
 * saisie, et ses marges internes — celle de gauche, celle du haut, la
 * gouttière qui précède la flèche — n'avaient aucune raison de rester mortes
 * au clic. Le bouton d'envoi, lui, prend le geste avant elle : un enfant
 * pressable retient le toucher plutôt que de le laisser remonter.
 */
export function Composer({
  value,
  onChangeText,
  onSubmit,
  placeholder,
  busy = false,
  onStop,
  inputRef,
  autoFocus = false,
  attachments,
  onRemoveAttachment,
  picker,
}: ComposerProps) {
  const { palette } = useTheme();
  const { height: windowHeight } = useWindowDimensions();
  const hasText = value.trim().length > 0;
  // Un message peut se composer d'une image seule, sans texte — comme chez
  // Claude (§13.4.1).
  const hasReadyAttachment = attachments.some((a) => a.status === "done");
  const uploading = attachments.some((a) => a.status === "uploading");
  const atAttachmentLimit = attachments.length >= MESSAGE_ATTACHMENT_MAX_COUNT;
  const stoppable = busy && onStop !== undefined;

  const node = useRef<TextInput | null>(null);
  const [contentHeight, setContentHeight] = useState(MIN_INPUT_HEIGHT);
  const maxHeight = Math.max(MIN_INPUT_HEIGHT * 3, Math.round(windowHeight * MAX_HEIGHT_RATIO));

  // Origine du brouillon courant (§12.3, A.12) : local au composant, jamais
  // remonté tant que rien n'est envoyé. Un caractère retapé au clavier
  // ramène en « text » — un message qu'on a soi-même corrigé n'est plus
  // fidèlement ce qui a été dit.
  const [inputMode, setInputMode] = useState<MessageInputMode>("text");

  const handleChangeText = useCallback(
    (text: string) => {
      setInputMode("text");
      onChangeText(text);
    },
    [onChangeText],
  );

  const dictation = useDictation((text) => {
    setInputMode("voice");
    onChangeText(text);
  });

  // Pulsation tant que la dictée écoute : avec l'icône, le seul repère que
  // l'enregistrement est actif — sans elle, le bouton ne se distinguait que
  // par la couleur de son fond, fixe.
  const reducedMotion = useReducedMotion();
  const micPulse = useSharedValue(1);

  useEffect(() => {
    micPulse.value =
      dictation.listening && !reducedMotion
        ? withRepeat(withTiming(1.3, { duration: 650, easing: Easing.inOut(Easing.ease) }), -1, true)
        : withTiming(1, { duration: 150 });
  }, [dictation.listening, reducedMotion, micPulse]);

  const micPulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: micPulse.value }],
  }));

  const handleSubmit = useCallback(() => {
    onSubmit(inputMode);
    setInputMode("text");
  }, [onSubmit, inputMode]);

  // L'appelant garde la main sur le champ — le fil y rend le focus après un
  // envoi — sans que le composant perde la référence dont il a besoin ici.
  const attach = useCallback(
    (instance: TextInput | null) => {
      node.current = instance;
      if (inputRef) inputRef.current = instance;
    },
    [inputRef],
  );

  // Un `textarea` ne suit pas son contenu : sa hauteur est remise à zéro puis
  // calée sur ce que le navigateur mesure. `onContentSizeChange`, lui, ne sert
  // que les plateformes natives.
  useLayoutEffect(() => {
    if (Platform.OS !== "web") return;
    const textArea = asTextArea(node.current);
    if (!textArea) return;

    textArea.style.height = "auto";
    textArea.style.height = `${Math.min(textArea.scrollHeight, maxHeight)}px`;
  }, [value, maxHeight]);

  return (
    <View style={styles.root}>
      {attachments.length > 0 ? (
        <View style={styles.attachmentsRow}>
          {attachments.map((attachment) =>
            attachment.mimeType === "application/pdf" ? (
              <AttachmentFileCard
                key={attachment.localId}
                fileName={attachment.fileName}
                byteSize={attachment.byteSize}
                status={attachment.status}
                onRemove={() => onRemoveAttachment(attachment.localId)}
              />
            ) : (
              <AttachmentThumbnail
                key={attachment.localId}
                uri={attachment.previewUri}
                status={attachment.status}
                onRemove={() => onRemoveAttachment(attachment.localId)}
              />
            ),
          )}
        </View>
      ) : null}

      <Pressable
        ref={picker.dropRef}
        onPress={() => node.current?.focus()}
        // Rien à annoncer : le champ, le trombone et la flèche portent déjà
        // leurs libellés, et une cible de plus dans l'ordre de lecture ne
        // dirait rien de neuf.
        accessible={false}
        className="web:cursor-text"
        style={[
          styles.shell,
          {
            backgroundColor: palette.surface,
            // Web seulement : `isOver` reste toujours `false` côté natif,
            // aucun dépôt de fichier n'y étant possible.
            borderColor: picker.isOver ? palette.accent : palette.border,
          },
        ]}
      >
        <Pressable
          onPress={picker.pick}
          disabled={atAttachmentLimit}
          accessibilityRole="button"
          accessibilityLabel="Joindre un fichier"
          hitSlop={8}
          style={[styles.attach, { opacity: atAttachmentLimit ? 0.4 : 1 }]}
        >
          <Paperclip size={16} color={palette.textMuted} />
        </Pressable>

        <TextInput
          ref={attach}
          value={value}
          onChangeText={handleChangeText}
          placeholder={placeholder}
          placeholderTextColor={palette.textMuted}
          autoFocus={autoFocus}
          multiline
          // Bornée ici comme elle l'est au contrat partagé : sans cela, un
          // texte trop long partait au serveur, revenait en 400 générique, et
          // le brouillon était perdu en chemin.
          maxLength={MESSAGE_MAX_LENGTH}
          onSubmitEditing={handleSubmit}
          // `submit` sur web envoie avec Entrée ; sur mobile le clavier garde
          // un retour à la ligne, la saisie multiligne y étant la norme.
          blurOnSubmit={Platform.OS === "web"}
          accessibilityLabel={placeholder}
          // Le cadre est porté par la coque : celui du champ ferait double
          // trait. `web:` seulement — sur mobile, `outline` n'existe pas et
          // le retrait du liseré de focus enlèverait le repère de navigation
          // au clavier, qui est ici la coque elle-même.
          className="web:outline-none"
          onContentSizeChange={(event) => setContentHeight(event.nativeEvent.contentSize.height)}
          style={[
            styles.input,
            { color: palette.text, maxHeight },
            // Sur web, la hauteur est posée sur le nœud lui-même : un style
            // de plus ici la remettrait à sa valeur de rendu à chaque frappe.
            Platform.OS === "web"
              ? null
              : { height: Math.min(Math.max(contentHeight, MIN_INPUT_HEIGHT), maxHeight) },
          ]}
          // Un `textarea` s'ouvre sur deux rangées par défaut : le champ
          // naissait donc deux fois trop haut, texte collé en haut et flèche
          // en bas. Sur mobile, `numberOfLines` bornerait au contraire la
          // saisie à une ligne.
          {...(Platform.OS === "web" ? { numberOfLines: 1 } : {})}
        />

        {/* Seconde porte d'entrée vers le même champ, jamais un mode à part
            (§12.3, A.12) : la dictée complète ce qui est déjà tapé, elle ne
            l'efface pas. Visible même pendant `busy` — le champ, lui, reste
            éditable pendant qu'une réponse se génère. */}
        <Pressable
          onPress={() => (dictation.listening ? dictation.stop() : dictation.start(value))}
          accessibilityRole="button"
          accessibilityLabel={dictation.listening ? "Arrêter la dictée" : "Dicter le message"}
          hitSlop={8}
        >
          <Animated.View
            style={[
              styles.mic,
              dictation.listening ? { backgroundColor: palette.accent } : null,
              micPulseStyle,
            ]}
          >
            {dictation.listening ? (
              <Square size={14} fill={palette.accentText} color={palette.accentText} />
            ) : (
              <Mic size={16} color={palette.textMuted} />
            )}
          </Animated.View>
        </Pressable>

        {/* Pendant la génération, le même bouton arrête la réponse plutôt que
            de rester grisé : c'est ce que font ChatGPT, Claude et Perplexity
            (§4.2), et rien n'est perdu — le serveur conserve le texte déjà
            produit. */}
        <Pressable
          onPress={stoppable ? onStop : handleSubmit}
          disabled={stoppable ? false : busy || uploading || (!hasText && !hasReadyAttachment)}
          accessibilityRole="button"
          accessibilityLabel={stoppable ? "Arrêter la réponse en cours" : "Envoyer le message"}
          // 32 pt de côté pour tenir dans la hauteur d'une ligne de saisie,
          // plus 8 pt de `hitSlop` : la zone touchable atteint les 44 pt de
          // `MIN_TOUCH_TARGET` sans faire grandir le champ.
          hitSlop={8}
          style={[
            styles.send,
            {
              backgroundColor: palette.accent,
              opacity:
                !stoppable && (busy || uploading || (!hasText && !hasReadyAttachment)) ? 0.4 : 1,
            },
          ]}
        >
          {stoppable ? (
            <Square size={14} fill={palette.accentText} color={palette.accentText} />
          ) : (
            <ArrowUp size={18} color={palette.accentText} />
          )}
        </Pressable>
      </Pressable>

      {dictation.error ? (
        <Text style={[styles.notice, { color: palette.textMuted }]}>{dictation.error}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.xs },
  attachmentsRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  notice: { fontFamily: FONT_FAMILY, fontSize: fontSize.xs, paddingHorizontal: spacing.md },
  shell: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    minHeight: MIN_TOUCH_TARGET,
    paddingLeft: spacing.sm,
    paddingRight: spacing.sm,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.lg,
  },
  attach: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
  },
  input: {
    fontFamily: FONT_FAMILY,
    flex: 1,
    paddingVertical: spacing.xs,
    fontSize: fontSize.md,
  },
  mic: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
  },
  send: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
  },
});
