import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Check, Copy, Pencil, RotateCcw } from "lucide-react-native";
import type { Message } from "@jc/domain";
import { fontSize, fontWeight, MIN_TOUCH_TARGET, radius, spacing } from "@jc/design";
import { Markdown } from "@/shared/ui/Markdown";
import { formatRelativeTime } from "@/shared/lib/dates";
import { useTheme } from "@/shared/providers/theme-provider";

/** Retour visuel après une copie réussie, avant de revenir à l'icône normale. */
const COPIED_FEEDBACK_MS = 1500;

export type MessageRowProps = {
  message: Message;
  /**
   * Question de l'assistant à laquelle ce message répond, quand la réponse a
   * été choisie d'un appui plutôt qu'écrite. Le fil affiche alors les deux
   * ensemble : « Oui » seul, relu plus tard, ne dit plus à quoi il répondait.
   */
  answeredQuestion?: string | null;
  /** Redemande une réponse au modèle à partir de ce point du fil. */
  onRetry: () => void;
  /** Remplace le texte du message et rejoue le tour. */
  onEdit: (content: string) => void;
  /** Un tour est déjà en cours : les deux gestes sont neutralisés. */
  busy: boolean;
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
 * Sans souris, `onHoverIn` ne se déclenche jamais : l'appui long prend le
 * relais, comme partout ailleurs dans l'application.
 */
export function MessageRow({
  message,
  answeredQuestion = null,
  onRetry,
  onEdit,
  busy,
}: MessageRowProps) {
  const { palette } = useTheme();
  const [revealed, setRevealed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);

  const isUser = message.role === "user";

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
          onEdit(content);
        }}
      />
    );
  }

  return (
    <Pressable
      onHoverIn={() => setRevealed(true)}
      onHoverOut={() => setRevealed(false)}
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
            {answeredQuestion ? (
              <Text style={[styles.question, { color: palette.textMuted }]}>
                Q&nbsp;: {answeredQuestion}
              </Text>
            ) : null}
            <Text style={[styles.bubbleText, { color: palette.accentSoftText }]}>
              {answeredQuestion ? `R : ${message.content}` : message.content}
            </Text>
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

            <IconAction icon={RotateCcw} label="Réessayer" onPress={onRetry} disabled={busy} />

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
              />
            ) : null}

            <CopyAction content={message.content} />
          </>
        ) : null}
      </View>
    </Pressable>
  );
}

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
function CopyAction({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => (timer.current ? clearTimeout(timer.current) : undefined), []);

  return (
    <IconAction
      icon={copied ? Check : Copy}
      label={copied ? "Message copié" : "Copier"}
      disabled={false}
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
 */
function IconAction({
  icon: Glyph,
  label,
  onPress,
  disabled,
}: {
  icon: typeof Copy;
  label: string;
  onPress: () => void;
  disabled: boolean;
}) {
  const { palette } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.iconAction, { opacity: disabled ? 0.4 : 1 }]}
    >
      <Glyph size={14} color={palette.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  rowStart: { alignItems: "flex-start" },
  rowEnd: { alignItems: "flex-end" },
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
  bubbleText: { fontSize: fontSize.md, lineHeight: 22 },
  question: { fontSize: fontSize.sm, lineHeight: 20, marginBottom: spacing.xs },
  actions: {
    height: 28,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  actionsStart: { justifyContent: "flex-start" },
  actionsEnd: { justifyContent: "flex-end" },
  elapsed: { fontSize: fontSize.xs, marginRight: spacing.xs },
  iconAction: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
  },
  editor: { gap: spacing.sm, alignSelf: "stretch" },
  editorInput: {
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
  editorLabel: { fontSize: fontSize.sm, fontWeight: fontWeight.medium },
});
