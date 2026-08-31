import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";
import { fontSize, fontWeight, MIN_TOUCH_TARGET, radius, spacing } from "@jc/design";
import { api } from "@/shared/lib/api";
import { useTheme } from "@/shared/providers/theme-provider";
import { NotBuiltYet, ScreenScaffold } from "@/shared/ui/screen-scaffold";

/**
 * Liste des conversations.
 *
 * Écran de vérification du socle : il traverse toute la chaîne — session
 * Supabase, client d'API partagé, guard JWT, RLS Postgres. S'il affiche une
 * liste (même vide) sans erreur, l'ensemble de l'architecture est câblé.
 */
export default function ChatScreen() {
  const { palette } = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["conversations"],
    queryFn: () => api.conversations.list({ limit: 30 }),
  });

  /**
   * Capture sans friction (§13.4.1) : la conversation est créée sans demander
   * dans quel dossier la ranger. Le classement vient après, jamais avant.
   */
  const create = useMutation({
    mutationFn: () => api.conversations.create({ folderIds: [] }),
    onSuccess: async (conversation) => {
      await queryClient.invalidateQueries({ queryKey: ["conversations"] });
      router.push(`/chat/${conversation.id}`);
    },
  });

  return (
    <ScreenScaffold title="Conversations" subtitle="Vos échanges, rangés par dossier.">
      <Pressable
        onPress={() => create.mutate()}
        disabled={create.isPending}
        accessibilityRole="button"
        accessibilityLabel="Démarrer une nouvelle conversation"
        style={[
          styles.newButton,
          { backgroundColor: palette.accent, opacity: create.isPending ? 0.4 : 1 },
        ]}
      >
        <Text style={[styles.newLabel, { color: palette.accentText }]}>Nouvelle conversation</Text>
      </Pressable>

      {isLoading ? <ActivityIndicator color={palette.accent} /> : null}

      {error || create.error ? (
        <Text style={[styles.error, { color: palette.danger }]}>
          {(error ?? create.error) instanceof Error
            ? (error ?? create.error)?.message
            : "Chargement impossible."}
        </Text>
      ) : null}

      {data?.items.map((conversation) => (
        <Pressable
          key={conversation.id}
          onPress={() => router.push(`/chat/${conversation.id}`)}
          accessibilityRole="button"
          style={[styles.row, { backgroundColor: palette.surface, borderColor: palette.border }]}
        >
          <Text style={[styles.rowTitle, { color: palette.text }]}>{conversation.title}</Text>
          <Text style={[styles.rowMeta, { color: palette.textMuted }]}>
            {conversation.folderIds.length === 0
              ? "Non classée"
              : `${conversation.folderIds.length} dossier${conversation.folderIds.length > 1 ? "s" : ""}`}
          </Text>
        </Pressable>
      ))}

      {data && data.items.length === 0 ? (
        <Text style={[styles.empty, { color: palette.textMuted }]}>
          Aucune conversation pour le moment.
        </Text>
      ) : null}

      <NotBuiltYet
        phase="Phase A / B"
        items={[
          "Titre de conversation généré depuis les premiers messages",
          "Sidebar / tiroir des dossiers (2 niveaux)",
          "Dictée vocale en entrée (§12.3)",
          "Recherche par filtres (A.6)",
        ]}
      />
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  newButton: {
    minHeight: MIN_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
  },
  newLabel: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  row: { padding: spacing.lg, borderRadius: radius.md, borderWidth: 1, gap: spacing.xs },
  rowTitle: { fontSize: fontSize.md },
  rowMeta: { fontSize: fontSize.xs },
  error: { fontSize: fontSize.sm },
  empty: { fontSize: fontSize.sm, fontStyle: "italic" },
});
