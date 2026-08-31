import { useQuery } from "@tanstack/react-query";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { fontSize, radius, spacing } from "@jc/design";
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

  const { data, isLoading, error } = useQuery({
    queryKey: ["conversations"],
    queryFn: () => api.conversations.list({ limit: 30 }),
  });

  return (
    <ScreenScaffold
      title="Conversations"
      subtitle="Vos échanges, rangés par dossier."
    >
      {isLoading ? <ActivityIndicator color={palette.accent} /> : null}

      {error ? (
        <Text style={[styles.error, { color: palette.danger }]}>
          {error instanceof Error ? error.message : "Chargement impossible."}
        </Text>
      ) : null}

      {data?.items.map((conversation) => (
        <View
          key={conversation.id}
          style={[styles.row, { backgroundColor: palette.surface, borderColor: palette.border }]}
        >
          <Text style={[styles.rowTitle, { color: palette.text }]}>{conversation.title}</Text>
          <Text style={[styles.rowMeta, { color: palette.textMuted }]}>
            {conversation.folderIds.length === 0
              ? "Non classée"
              : `${conversation.folderIds.length} dossier${conversation.folderIds.length > 1 ? "s" : ""}`}
          </Text>
        </View>
      ))}

      {data && data.items.length === 0 ? (
        <Text style={[styles.empty, { color: palette.textMuted }]}>
          Aucune conversation pour le moment.
        </Text>
      ) : null}

      <NotBuiltYet
        phase="Phase A / B"
        items={[
          "Fil de conversation et saisie de message",
          "Sidebar / tiroir des dossiers (2 niveaux)",
          "Dictée vocale en entrée (§12.3)",
          "Recherche par filtres (A.6)",
        ]}
      />
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  row: { padding: spacing.lg, borderRadius: radius.md, borderWidth: 1, gap: spacing.xs },
  rowTitle: { fontSize: fontSize.md },
  rowMeta: { fontSize: fontSize.xs },
  error: { fontSize: fontSize.sm },
  empty: { fontSize: fontSize.sm, fontStyle: "italic" },
});
