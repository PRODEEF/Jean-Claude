import { Pressable, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react-native";
import {
  assignFoldersPayloadSchema,
  createProjectFoldersPayloadSchema,
  createTaskListsPayloadSchema,
  scheduleTasksPayloadSchema,
  type Suggestion,
} from "@jc/domain";
import { fontSize, fontWeight, MIN_TOUCH_TARGET, radius, spacing } from "@jc/design";
import { api } from "@/shared/lib/api";
import { formatFullDay, formatTime } from "@/shared/lib/dates";
import { useTheme } from "@/shared/providers/theme-provider";

export type SuggestionCardProps = {
  suggestion: Suggestion;
  onAccept: () => void;
  onDismiss: () => void;
  /** Une réponse est en cours d'envoi : les deux gestes sont neutralisés. */
  isPending: boolean;
};

/**
 * Proposition de l'assistant, acceptée ou ignorée d'un geste (§12.1).
 *
 * Rendue en fin de fil et non dans la bulle du message : c'est là que ChatGPT,
 * Claude et Perplexity posent leurs cartes d'action (§4.2), et une proposition
 * n'est de toute façon rattachée à aucun message en particulier.
 */
export function SuggestionCard({
  suggestion,
  onAccept,
  onDismiss,
  isPending,
}: SuggestionCardProps) {
  const { palette } = useTheme();
  const preview = useSuggestionPreview(suggestion);

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: palette.surfaceElevated, borderColor: palette.border },
      ]}
    >
      <Text style={[styles.message, { color: palette.text }]}>{suggestion.message}</Text>

      {/* L'aperçu est un confort : une charge utile illisible ne doit pas
          empêcher l'utilisateur de trancher. */}
      {preview.lines.length > 0 ? (
        <View style={[styles.tree, { borderLeftColor: palette.border }]}>
          {preview.lines.map((line) => (
            <Text
              key={line.key}
              style={[
                styles.folder,
                line.nested ? styles.nested : null,
                { color: line.nested ? palette.textMuted : palette.text },
              ]}
            >
              {line.label}
              {line.hint ? (
                <Text style={[styles.hint, { color: palette.textMuted }]}> · {line.hint}</Text>
              ) : null}
            </Text>
          ))}
        </View>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          onPress={onAccept}
          disabled={isPending}
          accessibilityRole="button"
          accessibilityLabel={preview.acceptLabel}
          style={[styles.action, { backgroundColor: palette.accent, opacity: isPending ? 0.4 : 1 }]}
        >
          <Text style={[styles.actionLabel, { color: palette.accentText }]}>
            {preview.acceptLabel}
          </Text>
        </Pressable>

        <Pressable
          onPress={onDismiss}
          disabled={isPending}
          accessibilityRole="button"
          accessibilityLabel="Ignorer la proposition"
          style={[
            styles.action,
            styles.secondary,
            { borderColor: palette.border, opacity: isPending ? 0.4 : 1 },
          ]}
        >
          <Text style={[styles.actionLabel, { color: palette.textMuted }]}>Ignorer</Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * Trace d'une proposition déjà tranchée, rendue à sa place dans le fil.
 *
 * Ce que l'assistant a fait reste lisible dans la conversation qui l'a
 * provoqué : sans elle, des dossiers apparaîtraient dans la barre latérale
 * sans que rien n'explique d'où ils viennent. En une ligne discrète et non en
 * carte — c'est de l'historique, plus une action à mener.
 */
export function ResolvedSuggestionNote({ suggestion }: { suggestion: Suggestion }) {
  const { palette } = useTheme();
  const preview = useSuggestionPreview(suggestion);
  const accepted = suggestion.status === "accepted";

  // Les tâches sont laissées de côté : une todoliste se relit dans son onglet,
  // et déplier ses lignes ici ferait de l'historique du fil une seconde liste.
  const names = preview.lines
    .filter((line) => !line.nested || suggestion.kind === "create_project_folders")
    .map((line) => line.label)
    .join(", ");

  return (
    <View style={[styles.note, { borderColor: palette.border }]}>
      {accepted ? <Check size={14} color={palette.accent} /> : null}
      <Text style={[styles.noteLabel, { color: palette.textMuted }]}>
        {outcomeLabel(suggestion)}
        {accepted && names.length > 0 ? ` — ${names}` : ""}
      </Text>
    </View>
  );
}

/** Ce qui est arrivé à la proposition, dit du point de vue de l'utilisateur. */
function outcomeLabel(suggestion: Suggestion): string {
  if (suggestion.status === "dismissed") return "Proposition ignorée";
  if (suggestion.status === "expired") return "Proposition expirée";

  switch (suggestion.kind) {
    case "assign_folders":
      return "Conversation rangée";
    case "create_task_list":
      return "Todolistes créées";
    case "schedule_task":
      return "Créneaux posés";
    default:
      return "Dossiers créés";
  }
}

type PreviewLine = { key: string; label: string; nested: boolean; hint?: string };

/**
 * Ce que la carte montre, selon la nature de la proposition.
 *
 * Un rangement ne transporte que des identifiants : les noms sont relus depuis
 * l'arborescence, déjà en cache — c'est la même clé que la barre latérale.
 */
function useSuggestionPreview(suggestion: Suggestion): {
  lines: PreviewLine[];
  acceptLabel: string;
} {
  const folders = useQuery({
    queryKey: ["folders"],
    queryFn: () => api.folders.tree(),
    enabled: suggestion.kind === "assign_folders",
  });

  if (suggestion.kind === "create_project_folders") {
    const proposed = createProjectFoldersPayloadSchema.safeParse(suggestion.payload);

    return {
      acceptLabel: "Créer les dossiers",
      lines: proposed.success
        ? proposed.data.folders.flatMap((folder) => [
            { key: folder.name, label: folder.name, nested: false },
            ...folder.children.map((child) => ({
              key: `${folder.name}/${child.name}`,
              label: child.name,
              nested: true,
            })),
          ])
        : [],
    };
  }

  // Les listes sont montrées avec leurs tâches : c'est la seule façon de voir
  // que les achats et le travail à faire n'ont pas été mélangés (§12.1), et
  // l'aperçu tient lieu de relecture avant de valider.
  if (suggestion.kind === "create_task_list") {
    const proposed = createTaskListsPayloadSchema.safeParse(suggestion.payload);

    return {
      acceptLabel: "Créer les listes",
      lines: proposed.success
        ? proposed.data.lists.flatMap((list) => [
            {
              key: list.title,
              label: list.title,
              nested: false,
              ...(list.kind === "shopping" ? { hint: "achats" } : {}),
            },
            ...list.items.map((item) => ({
              key: `${list.title}/${item.title}`,
              label: item.title,
              nested: true,
              ...(item.dueAt === null ? {} : { hint: dueLabel(item.dueAt) }),
            })),
          ])
        : [],
    };
  }

  if (suggestion.kind === "schedule_task") {
    const proposed = scheduleTasksPayloadSchema.safeParse(suggestion.payload);

    return {
      acceptLabel: "Poser les créneaux",
      lines: proposed.success
        ? proposed.data.tasks.map((task) => ({
            key: task.taskId,
            label: task.title,
            nested: false,
            hint: dueLabel(task.dueAt),
          }))
        : [],
    };
  }

  const acceptLabel = "Ranger la conversation";
  const proposed = assignFoldersPayloadSchema.safeParse(suggestion.payload);
  if (!proposed.success) return { acceptLabel, lines: [] };

  const byId = new Map(
    (folders.data ?? []).flatMap((node) => [node, ...node.children]).map((f) => [f.id, f.name]),
  );

  return {
    acceptLabel,
    lines: [
      // Un dossier que l'arborescence ne connaît pas encore n'est pas affiché :
      // mieux vaut une ligne de moins qu'un identifiant technique à l'écran.
      ...proposed.data.existingFolderIds.flatMap((id) => {
        const name = byId.get(id);
        return name ? [{ key: id, label: name, nested: false }] : [];
      }),
      ...proposed.data.newFolderNames.map((name) => ({
        key: `nouveau:${name}`,
        label: name,
        nested: false,
        hint: "nouveau dossier",
      })),
    ],
  };
}

/**
 * Échéance telle qu'elle se lit dans la carte — « lundi 7 septembre, 9h ».
 *
 * L'heure est omise à minuit : le modèle la pose faute de mieux quand la
 * conversation ne dit qu'un jour, et l'afficher ferait passer une date
 * approximative pour un horaire décidé.
 */
function dueLabel(iso: string): string {
  const date = new Date(iso);
  const day = formatFullDay(date);
  return date.getHours() === 0 && date.getMinutes() === 0 ? day : `${day}, ${formatTime(iso)}`;
}

const styles = StyleSheet.create({
  card: {
    alignSelf: "flex-start",
    maxWidth: "85%",
    gap: spacing.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderRadius: radius.lg,
  },
  message: { fontSize: fontSize.md, lineHeight: 22 },
  tree: { gap: spacing.xs, paddingLeft: spacing.md, borderLeftWidth: 2 },
  folder: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  nested: { paddingLeft: spacing.md, fontWeight: fontWeight.regular },
  hint: { fontSize: fontSize.xs, fontWeight: fontWeight.regular },
  note: {
    alignSelf: "flex-start",
    maxWidth: "85%",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderRadius: radius.pill,
  },
  noteLabel: { fontSize: fontSize.xs, flexShrink: 1 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  action: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
  },
  secondary: { borderWidth: 1 },
  actionLabel: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
});
