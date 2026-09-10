import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Image, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import {
  Check,
  Copy,
  Pencil,
  RotateCcw,
  ThumbsDown,
  ThumbsUp,
  Volume2,
  VolumeX,
} from "lucide-react-native";
import type { Message, MessageAttachment, MessageRatingValue } from "@jc/domain";
import { fontSize, fontWeight, MIN_TOUCH_TARGET, radius, spacing } from "@jc/design";
import { FONT_FAMILY } from "@/shared/lib/fonts";
import { useFeedbackContext, useRateMessage } from "@/features/feedback/hooks/use-feedback";
import { Markdown } from "@/shared/ui/Markdown";
import { Modal } from "@/shared/ui/modal";
import { formatRelativeTime } from "@/shared/lib/dates";
import { useTheme } from "@/shared/providers/theme-provider";
import { AttachmentFileCard } from "./AttachmentFileCard";
import { AttachmentThumbnail } from "./AttachmentThumbnail";

/** Retour visuel après une copie réussie, avant de revenir à l'icône normale. */
const COPIED_FEEDBACK_MS = 1500;

/**
 * Délai de grâce avant de masquer les commandes.
 *
 * Le curseur qui descend du texte vers une icône traverse plusieurs zones
 * survolables, et chaque frontière franchie produit une sortie de survol. Sans
 * ce délai, la commande disparaissait sous le curseur juste avant le clic.
 */
const HOVER_GRACE_MS = 150;

/**
 * Revient à l'état neutre après l'échec d'une notation optimiste.
 *
 * Ne revient en arrière que si le pouce affiché est encore celui de la
 * notation qui a échoué : un second appui pendant que le premier échouait
 * encore ne doit pas effacer ce second choix.
 */
function rollback(
  current: MessageRatingValue | null,
  attempted: MessageRatingValue,
): MessageRatingValue | null {
  return current === attempted ? null : current;
}

export type MessageRowProps = {
  message: Message;
  /**
   * Question de l'assistant à laquelle ce message répond, quand la réponse a
   * été choisie d'un appui plutôt qu'écrite. Le fil affiche alors les deux
   * ensemble : « Oui » seul, relu plus tard, ne dit plus à quoi il répondait.
   */
  answeredQuestion?: string | null;
  /**
   * Redemande une réponse au modèle à partir de ce point du fil.
   *
   * Reçoit l'identifiant plutôt qu'être déjà lié au message : `renderItem`
   * peut ainsi transmettre la même référence à chaque ligne, condition pour
   * que la mémoïsation de ce composant serve à quelque chose.
   */
  onRetry: (messageId: string) => void;
  /** Remplace le texte du message et rejoue le tour. Même raison pour l'identifiant. */
  onEdit: (messageId: string, content: string) => void;
  /** Un tour est déjà en cours : les deux gestes sont neutralisés. */
  busy: boolean;
  /** Ce message est celui en cours de lecture à voix haute (§12.3, A.12). */
  speaking: boolean;
  /** Démarre la lecture à voix haute de ce message, ou l'arrête si en cours. */
  onToggleSpeech: (messageId: string, content: string) => void;
};

/**
 * Un message du fil, et ce qu'on peut en faire.
 *
 * Les commandes apparaissent sous le message au survol, comme dans ChatGPT et
 * Claude (§4.2) : elles ne sont pas assez fréquentes pour occuper l'écran en
 * permanence, et assez utiles pour être à portée. Leur place est réservée même
 * quand elles sont invisibles — sinon le fil se décale sous le curseur à chaque
 * passage de souris.
 *
 * Le survol vaut pour la rangée entière, horodatage et commandes compris, et
 * non pour le seul texte : viser une icône revient sinon à quitter la zone qui
 * l'a fait apparaître.
 *
 * Sans souris, `onHoverIn` ne se déclenche jamais : l'appui long prend le
 * relais, comme partout ailleurs dans l'application.
 *
 * Mémoïsé : `renderItem` en rend un par message du fil, et l'arrivée d'un
 * nouveau message ne doit pas redessiner tous les précédents.
 */
export const MessageRow = memo(function MessageRow({
  message,
  answeredQuestion = null,
  onRetry,
  onEdit,
  busy,
  speaking,
  onToggleSpeech,
}: MessageRowProps) {
  const { palette } = useTheme();
  const [revealed, setRevealed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const [previewAttachment, setPreviewAttachment] = useState<MessageAttachment | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isUser = message.role === "user";

  // Notation d'une réponse (§12.1 — geste utilisateur direct, jamais une
  // suggestion de l'assistant). L'état du pouce sélectionné reste local à la
  // session : la notation n'est pas encore renvoyée avec les messages, donc
  // rien ne la restaure après un rechargement — la donnée, elle, est bien
  // persistée côté serveur.
  const [rating, setRating] = useState<MessageRatingValue | null>(null);
  // `null` = pas de champ ouvert ; une chaîne (vide au départ) = champ ouvert.
  const [commentDraft, setCommentDraft] = useState<string | null>(null);
  const rateMessage = useRateMessage();
  const feedbackContext = useFeedbackContext();

  const reveal = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = null;
    setRevealed(true);
  }, []);

  const scheduleHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setRevealed(false), HOVER_GRACE_MS);
  }, []);

  useEffect(() => () => (hideTimer.current ? clearTimeout(hideTimer.current) : undefined), []);

  if (editing) {
    return (
      <MessageEditor
        value={draft}
        onChangeText={setDraft}
        onCancel={() => {
          setEditing(false);
          setDraft(message.content);
        }}
        onSubmit={() => {
          const content = draft.trim();
          if (content.length === 0 || content === message.content) {
            setEditing(false);
            setDraft(message.content);
            return;
          }
          setEditing(false);
          onEdit(message.id, content);
        }}
      />
    );
  }

  return (
    <>
      <Pressable
        onHoverIn={reveal}
        onHoverOut={scheduleHide}
        onLongPress={() => setRevealed((current) => !current)}
        style={isUser ? styles.rowEnd : styles.rowStart}
      >
        <View
          style={[
            styles.bubble,
            isUser
              ? { alignSelf: "flex-end", backgroundColor: palette.accentSoft }
              : // La réponse de l'assistant n'a ni fond ni cadre : c'est le corps
                // du texte, pas une pièce rapportée. Seule la parole de
                // l'utilisateur est encadrée, ce que font ChatGPT et Claude.
                styles.plain,
          ]}
        >
          {/* Le message de l'utilisateur reste du texte brut : c'est ce qu'il a
              tapé, l'interpréter ferait disparaître ses astérisques. Celui du
              modèle est du Markdown, et se lit criblé de signes sans rendu. */}
          {isUser ? (
            <>
              {message.attachments.length > 0 ? (
                <View style={styles.attachmentsRow}>
                  {message.attachments.map((attachment) =>
                    !attachment.mimeType.startsWith("image/") ? (
                      <AttachmentFileCard
                        key={attachment.id}
                        fileName={attachment.fileName}
                        byteSize={attachment.byteSize}
                        status="done"
                        onPress={() => setPreviewAttachment(attachment)}
                      />
                    ) : (
                      <AttachmentThumbnail
                        key={attachment.id}
                        uri={attachment.url}
                        status="done"
                        onPress={() => setPreviewAttachment(attachment)}
                      />
                    ),
                  )}
                </View>
              ) : null}
              {answeredQuestion ? (
                <Text style={[styles.question, { color: palette.textMuted }]}>
                  Q&nbsp;: {answeredQuestion}
                </Text>
              ) : null}
              {message.content.length > 0 ? (
                <Text style={[styles.bubbleText, { color: palette.accentSoftText }]}>
                  {answeredQuestion ? `R : ${message.content}` : message.content}
                </Text>
              ) : null}
            </>
          ) : (
            <Markdown>{message.content}</Markdown>
          )}
        </View>

        {/* Emplacement toujours présent : rendu conditionnellement, il ferait
            sauter le fil d'une trentaine de points à chaque survol. */}
        <View style={[styles.actions, isUser ? styles.actionsEnd : styles.actionsStart]}>
          {revealed ? (
            <>
              <Text style={[styles.elapsed, { color: palette.textMuted }]}>
                {formatRelativeTime(message.createdAt)}
              </Text>

              <IconAction
                icon={RotateCcw}
                label="Réessayer"
                onPress={() => onRetry(message.id)}
                disabled={busy}
                onHoverIn={reveal}
                onHoverOut={scheduleHide}
              />

              {/* Corriger n'a de sens que sur sa propre parole : le fil est la
                  trace de ce que l'assistant a répondu, pas un brouillon. */}
              {isUser ? (
                <IconAction
                  icon={Pencil}
                  label="Modifier"
                  onPress={() => {
                    setDraft(message.content);
                    setEditing(true);
                  }}
                  disabled={busy}
                  onHoverIn={reveal}
                  onHoverOut={scheduleHide}
                />
              ) : null}

              <CopyAction content={message.content} onHoverIn={reveal} onHoverOut={scheduleHide} />

              {/* Seules les réponses de l'assistant se lisent ou se notent :
                  le fil est sa parole à lui, pas celle de l'utilisateur. */}
              {message.role === "assistant" ? (
                <>
                  <IconAction
                    icon={speaking ? VolumeX : Volume2}
                    label={speaking ? "Arrêter la lecture" : "Écouter"}
                    active={speaking}
                    disabled={false}
                    onHoverIn={reveal}
                    onHoverOut={scheduleHide}
                    onPress={() => onToggleSpeech(message.id, message.content)}
                  />
                  <IconAction
                    icon={ThumbsUp}
                    label="Utile"
                    active={rating === "up"}
                    disabled={false}
                    onHoverIn={reveal}
                    onHoverOut={scheduleHide}
                    onPress={() => {
                      reveal();
                      setRating("up");
                      setCommentDraft(null);
                      rateMessage.mutate(
                        { messageId: message.id, rating: "up", ...feedbackContext },
                        { onError: () => setRating((current) => rollback(current, "up")) },
                      );
                    }}
                  />
                  <IconAction
                    icon={ThumbsDown}
                    label="Pas utile"
                    active={rating === "down"}
                    disabled={false}
                    onHoverIn={reveal}
                    onHoverOut={scheduleHide}
                    onPress={() => {
                      reveal();
                      setRating("down");
                      // Révèle un champ de commentaire facultatif — jamais côté
                      // pouce haut, ça n'a de sens que pour dire ce qui a manqué.
                      setCommentDraft("");
                      rateMessage.mutate(
                        { messageId: message.id, rating: "down", ...feedbackContext },
                        { onError: () => setRating((current) => rollback(current, "down")) },
                      );
                    }}
                  />
                </>
              ) : null}
            </>
          ) : null}
        </View>

        {/* Rendu hors du bloc `revealed` : une fois ouvert, le champ reste
            jusqu'à l'envoi ou l'abandon, même si le survol quitte la rangée. */}
        {commentDraft !== null ? (
          <RatingCommentBox
            value={commentDraft}
            onChangeText={setCommentDraft}
            onCancel={() => setCommentDraft(null)}
            onSubmit={() => {
              const comment = commentDraft.trim();
              rateMessage.mutate(
                {
                  messageId: message.id,
                  rating: "down",
                  comment: comment.length > 0 ? comment : null,
                  ...feedbackContext,
                },
                { onError: () => setRating((current) => rollback(current, "down")) },
              );
              setCommentDraft(null);
            }}
          />
        ) : null}
      </Pressable>

      {/* Hors de la bulle : l'aperçu plein écran n'est pas un élément du fil,
          c'est une fenêtre par-dessus — même point d'entrée modal que le
          reste de l'application (`shared/ui/modal.tsx`). Un PDF ou un fichier
          texte n'y montre jamais le fichier lui-même, seulement le texte
          qu'on en a extrait — c'est la même donnée que celle relue par le
          modèle. */}
      {message.attachments.length > 0 ? (
        <Modal
          open={previewAttachment !== null}
          onClose={() => setPreviewAttachment(null)}
          title={
            previewAttachment && !previewAttachment.mimeType.startsWith("image/")
              ? previewAttachment.fileName
              : "Image jointe"
          }
          actions={[{ label: "Fermer", onPress: () => setPreviewAttachment(null) }]}
        >
          {previewAttachment && !previewAttachment.mimeType.startsWith("image/") ? (
            <Text style={[styles.previewText, { color: palette.text }]}>
              {previewAttachment.extractedText}
            </Text>
          ) : previewAttachment ? (
            <Image source={{ uri: previewAttachment.url }} style={styles.previewImage} resizeMode="contain" />
          ) : null}
        </Modal>
      ) : null}
    </>
  );
});

/** Saisie qui prend la place du message le temps de le corriger. */
function MessageEditor({
  value,
  onChangeText,
  onCancel,
  onSubmit,
}: {
  value: string;
  onChangeText: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const { palette } = useTheme();

  return (
    <View style={styles.editor}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        multiline
        autoFocus
        accessibilityLabel="Corriger le message"
        onSubmitEditing={onSubmit}
        blurOnSubmit={Platform.OS === "web"}
        className="web:outline-none"
        style={[
          styles.editorInput,
          { backgroundColor: palette.accentSoft, color: palette.accentSoftText },
        ]}
      />
      <View style={styles.editorActions}>
        <Pressable
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel="Abandonner la correction"
          style={[styles.editorButton, { borderColor: palette.border }]}
        >
          <Text style={[styles.editorLabel, { color: palette.textMuted }]}>Annuler</Text>
        </Pressable>
        <Pressable
          onPress={onSubmit}
          accessibilityRole="button"
          accessibilityLabel="Envoyer le message corrigé"
          style={[styles.editorButton, { backgroundColor: palette.accent }]}
        >
          <Text style={[styles.editorLabel, { color: palette.accentText }]}>Envoyer</Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * Copie du message dans le presse-papier.
 *
 * L'icône se change en coche le temps d'un battement : sans ce retour, rien à
 * l'écran ne dit que l'appui a fait quelque chose.
 */
function CopyAction({
  content,
  onHoverIn,
  onHoverOut,
}: {
  content: string;
  onHoverIn: () => void;
  onHoverOut: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => (timer.current ? clearTimeout(timer.current) : undefined), []);

  return (
    <IconAction
      icon={copied ? Check : Copy}
      label={copied ? "Message copié" : "Copier"}
      disabled={false}
      onHoverIn={onHoverIn}
      onHoverOut={onHoverOut}
      onPress={() => {
        Clipboard.setStringAsync(content)
          .then(() => {
            setCopied(true);
            timer.current = setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
          })
          .catch((error: unknown) => {
            // Le presse-papier peut être refusé par le navigateur : l'échec ne
            // vaut pas un message d'erreur, mais il ne doit pas disparaître.
            console.warn(
              "Copie impossible :",
              error instanceof Error ? error.message : "raison inconnue",
            );
          });
      }}
    />
  );
}

/**
 * Commande d'une rangée de message.
 *
 * 28 pt de côté pour ne pas alourdir le fil, plus 8 pt de `hitSlop` : la zone
 * réellement touchable atteint les 44 pt de `MIN_TOUCH_TARGET`.
 *
 * Elle relaie le survol à la rangée : la survoler, c'est encore survoler le
 * message, et c'est ce qui la maintient affichée le temps du clic.
 */
function IconAction({
  icon: Glyph,
  label,
  onPress,
  disabled,
  onHoverIn,
  onHoverOut,
  active = false,
}: {
  icon: typeof Copy;
  label: string;
  onPress: () => void;
  disabled: boolean;
  onHoverIn: () => void;
  onHoverOut: () => void;
  /** Marque une commande à état, ex. le pouce déjà choisi sur ce message. */
  active?: boolean;
}) {
  const { palette } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      onHoverIn={onHoverIn}
      onHoverOut={onHoverOut}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      style={[styles.iconAction, { opacity: disabled ? 0.4 : 1 }]}
    >
      <Glyph size={14} color={active ? palette.accent : palette.textMuted} />
    </Pressable>
  );
}

/**
 * Commentaire facultatif après un pouce bas.
 *
 * Ouvert d'un geste, jamais imposé : la notation part déjà au clic sur le
 * pouce, ce champ ne fait qu'en préciser la raison si l'utilisateur le
 * souhaite.
 */
function RatingCommentBox({
  value,
  onChangeText,
  onCancel,
  onSubmit,
}: {
  value: string;
  onChangeText: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const { palette } = useTheme();

  return (
    <View style={styles.commentBox}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder="Qu'est-ce qui n'allait pas ? (facultatif)"
        placeholderTextColor={palette.textMuted}
        autoFocus
        onSubmitEditing={onSubmit}
        blurOnSubmit={Platform.OS === "web"}
        className="web:outline-none"
        style={[styles.commentInput, { borderColor: palette.border, color: palette.text }]}
      />
      <View style={styles.editorActions}>
        <Pressable
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel="Ne pas commenter"
          style={[styles.editorButton, { borderColor: palette.border }]}
        >
          <Text style={[styles.editorLabel, { color: palette.textMuted }]}>Annuler</Text>
        </Pressable>
        <Pressable
          onPress={onSubmit}
          accessibilityRole="button"
          accessibilityLabel="Envoyer le commentaire"
          style={[styles.editorButton, { backgroundColor: palette.accent }]}
        >
          <Text style={[styles.editorLabel, { color: palette.accentText }]}>Envoyer</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rowStart: { alignItems: "flex-start" },
  rowEnd: { alignItems: "flex-end" },
  attachmentsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  previewImage: { width: "100%", aspectRatio: 1 },
  previewText: { fontFamily: FONT_FAMILY, fontSize: fontSize.sm, lineHeight: 20 },
  bubble: {
    maxWidth: "85%",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
  },
  /**
   * Réponse de l'assistant : sans fond, elle n'a plus de raison d'être bornée
   * à 85 % ni d'être rentrée de son propre padding — elle se lit sur toute la
   * colonne, alignée sur les autres textes de l'écran.
   */
  plain: { alignSelf: "flex-start", maxWidth: "100%", paddingHorizontal: 0 },
  bubbleText: { fontFamily: FONT_FAMILY, fontSize: fontSize.md, lineHeight: 22 },
  question: {
    fontFamily: FONT_FAMILY,
    fontSize: fontSize.sm,
    lineHeight: 20,
    marginBottom: spacing.xs,
  },
  actions: {
    height: 28,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  actionsStart: { justifyContent: "flex-start" },
  actionsEnd: { justifyContent: "flex-end" },
  elapsed: { fontFamily: FONT_FAMILY, fontSize: fontSize.xs, marginRight: spacing.xs },
  iconAction: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
  },
  commentBox: { gap: spacing.sm, alignSelf: "stretch", marginTop: spacing.xs },
  commentInput: {
    fontFamily: FONT_FAMILY,
    minHeight: MIN_TOUCH_TARGET,
    padding: spacing.md,
    borderWidth: 1,
    borderRadius: radius.lg,
    fontSize: fontSize.sm,
  },
  editor: { gap: spacing.sm, alignSelf: "stretch" },
  editorInput: {
    fontFamily: FONT_FAMILY,
    minHeight: MIN_TOUCH_TARGET,
    maxHeight: 220,
    padding: spacing.md,
    borderRadius: radius.lg,
    fontSize: fontSize.md,
    lineHeight: 22,
  },
  editorActions: { flexDirection: "row", justifyContent: "flex-end", gap: spacing.sm },
  editorButton: {
    minHeight: 32,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: "transparent",
    borderRadius: radius.md,
  },
  editorLabel: { fontFamily: FONT_FAMILY, fontSize: fontSize.sm, fontWeight: fontWeight.medium },
});
