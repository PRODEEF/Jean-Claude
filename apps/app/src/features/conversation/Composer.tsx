import type { RefObject } from "react";
import { Platform, Pressable, StyleSheet, TextInput, View } from "react-native";
import { ArrowUp, Square } from "lucide-react-native";
import { MESSAGE_MAX_LENGTH } from "@jc/domain";
import { fontSize, MIN_TOUCH_TARGET, radius, spacing } from "@jc/design";
import { useTheme } from "@/shared/providers/theme-provider";

export type ComposerProps = {
  value: string;
  onChangeText: (value: string) => void;
  /** Appelé sur Entrée comme sur la flèche. À l'appelant de vider le champ. */
  onSubmit: () => void;
  placeholder: string;
  /** Un tour est en cours : la flèche devient un bouton d'arrêt. */
  busy?: boolean;
  onStop?: () => void;
  inputRef?: RefObject<TextInput | null>;
  autoFocus?: boolean;
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
}: ComposerProps) {
  const { palette } = useTheme();
  const empty = value.trim().length === 0;
  const stoppable = busy && onStop !== undefined;

  return (
    <View style={[styles.shell, { backgroundColor: palette.surface, borderColor: palette.border }]}>
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={palette.textMuted}
        autoFocus={autoFocus}
        multiline
        // Bornée ici comme elle l'est au contrat partagé : sans cela, un texte
        // trop long partait au serveur, revenait en 400 générique, et le
        // brouillon était perdu en chemin.
        maxLength={MESSAGE_MAX_LENGTH}
        onSubmitEditing={onSubmit}
        // `submit` sur web envoie avec Entrée ; sur mobile le clavier garde un
        // retour à la ligne, la saisie multiligne y étant la norme.
        blurOnSubmit={Platform.OS === "web"}
        accessibilityLabel={placeholder}
        // Le cadre est porté par la coque : celui du champ ferait double trait.
        // `web:` seulement — sur mobile, `outline` n'existe pas et le retrait
        // du liseré de focus enlèverait le repère de navigation au clavier,
        // qui est ici la coque elle-même.
        className="web:outline-none"
        style={[styles.input, { color: palette.text }]}
        // Un `textarea` s'ouvre sur deux rangées par défaut : le champ naissait
        // donc deux fois trop haut, texte collé en haut et flèche en bas. Sur
        // mobile, `numberOfLines` bornerait au contraire la saisie à une ligne.
        {...(Platform.OS === "web" ? { numberOfLines: 1 } : {})}
      />

      {/* Pendant la génération, le même bouton arrête la réponse plutôt que de
          rester grisé : c'est ce que font ChatGPT, Claude et Perplexity (§4.2),
          et rien n'est perdu — le serveur conserve le texte déjà produit. */}
      <Pressable
        onPress={stoppable ? onStop : onSubmit}
        disabled={stoppable ? false : busy || empty}
        accessibilityRole="button"
        accessibilityLabel={stoppable ? "Arrêter la réponse en cours" : "Envoyer le message"}
        // 32 pt de côté pour tenir dans la hauteur d'une ligne de saisie, plus
        // 8 pt de `hitSlop` : la zone touchable atteint les 44 pt de
        // `MIN_TOUCH_TARGET` sans faire grandir le champ.
        hitSlop={8}
        style={[
          styles.send,
          {
            backgroundColor: palette.accent,
            opacity: !stoppable && (busy || empty) ? 0.4 : 1,
          },
        ]}
      >
        {stoppable ? (
          <Square size={14} fill={palette.accentText} color={palette.accentText} />
        ) : (
          <ArrowUp size={18} color={palette.accentText} />
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    minHeight: MIN_TOUCH_TARGET,
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.lg,
  },
  input: {
    flex: 1,
    maxHeight: 140,
    paddingVertical: spacing.xs,
    fontSize: fontSize.md,
  },
  send: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
  },
});
