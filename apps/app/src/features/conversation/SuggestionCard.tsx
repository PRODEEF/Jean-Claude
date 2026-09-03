import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react-native";
import {
  addTaskListItemsPayloadSchema,
  assignFoldersPayloadSchema,
  createProjectFoldersPayloadSchema,
  createTaskListsPayloadSchema,
  scheduleListsPayloadSchema,
  type AssignFoldersPayload,
  type Suggestion,
} from "@jc/domain";
import { fontSize, fontWeight, MIN_TOUCH_TARGET, radius, spacing } from "@jc/design";
import { FONT_FAMILY } from "@/shared/lib/fonts";
import { api } from "@/shared/lib/api";
import { formatFullDay, formatTime } from "@/shared/lib/dates";
import { useTheme } from "@/shared/providers/theme-provider";

export type SuggestionCardProps = {
  suggestion: Suggestion;
  /**
   * Les dossiers restés cochés, quand la proposition en fait cocher.
   * `undefined` — rien n'a été décoché — laisse le serveur appliquer la
   * proposition entière.
   */
  onAccept: (folderSelection?: AssignFoldersPayload) => void;
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

  // Les dossiers écartés, et non ceux retenus : un rangement propose de
  // ranger, pas de choisir à partir de rien. Décochés plutôt que cochés aussi
  // parce que les lignes arrivent avec l'arborescence — une liste de cochés
  // figée au premier rendu les laisserait toutes décochées.
  const [excluded, setExcluded] = useState<readonly string[]>([]);

  const selection = selectedFolders(preview.lines, excluded);
  const choosable = preview.lines.some((line) => line.choice);
  const emptied =
    choosable && selection.existingFolderIds.length + selection.newFolderNames.length === 0;

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
        <View
          style={choosable ? styles.choices : [styles.tree, { borderLeftColor: palette.border }]}
        >
          {preview.lines.map((line) =>
            line.choice ? (
              <FolderChoice
                key={line.key}
                line={line}
                checked={!excluded.includes(line.key)}
                disabled={isPending}
                onToggle={() =>
                  setExcluded((current) =>
                    current.includes(line.key)
                      ? current.filter((key) => key !== line.key)
                      : [...current, line.key],
                  )
                }
              />
            ) : (
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
            ),
          )}
        </View>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          // Rien n'est envoyé tant que rien n'a été décoché : le serveur
          // applique alors la proposition entière, y compris un dossier que
          // l'arborescence en cache ne sait pas encore nommer.
          onPress={() => onAccept(excluded.length > 0 ? selection : undefined)}
          disabled={isPending || emptied}
          accessibilityRole="button"
          accessibilityLabel={preview.acceptLabel}
          style={[
            styles.action,
            { backgroundColor: palette.accent, opacity: isPending || emptied ? 0.4 : 1 },
          ]}
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
 * Dossier d'un rangement, à cocher ou décocher avant d'accepter (§5.2, A.1).
 *
 * Une case et non un choix unique : une conversation appartient à plusieurs
 * dossiers à la fois — « Maison » *et* « Travaux », pas l'un ou l'autre. C'est
 * la forme retenue par Notion et Apple Notes pour le même geste (§4.2).
 */
function FolderChoice({
  line,
  checked,
  disabled,
  onToggle,
}: {
  line: PreviewLine;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const { palette } = useTheme();

  return (
    <Pressable
      onPress={onToggle}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      accessibilityLabel={line.label}
      style={[styles.choice, { opacity: disabled ? 0.4 : 1 }]}
    >
      <View
        style={[
          styles.box,
          checked
            ? { backgroundColor: palette.accent, borderColor: palette.accent }
            : { borderColor: palette.border },
        ]}
      >
        {checked ? <Check size={14} color={palette.accentText} /> : null}
      </View>

      <Text style={[styles.folder, { color: palette.text }]}>
        {line.label}
        {line.hint ? (
          <Text style={[styles.hint, { color: palette.textMuted }]}> · {line.hint}</Text>
        ) : null}
      </Text>
    </Pressable>
  );
}

/**
 * Dossiers restés cochés, dans la forme attendue par l'API.
 *
 * Les lignes qui ne portent pas de case — les todolistes, les sous-dossiers
 * d'un projet — sont ignorées : elles ne se cochent pas.
 */
function selectedFolders(lines: PreviewLine[], excluded: readonly string[]): AssignFoldersPayload {
  const kept = lines.filter((line) => line.choice && !excluded.includes(line.key));

  return {
    existingFolderIds: kept.flatMap((line) =>
      line.choice && "existingFolderId" in line.choice ? [line.choice.existingFolderId] : [],
    ),
    newFolderNames: kept.flatMap((line) =>
      line.choice && "newFolderName" in line.choice ? [line.choice.newFolderName] : [],
    ),
  };
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
    case "add_task_list_items":
      return "Liste complétée";
    case "schedule_task":
      return "Créneaux posés";
    default:
      return "Dossiers créés";
  }
}

type PreviewLine = {
  key: string;
  label: string;
  nested: boolean;
  hint?: string;
  /** Dossier cochable, et ce qu'il vaut dans la réponse envoyée au serveur. */
  choice?: { existingFolderId: string } | { newFolderName: string };
};

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
              ...hintOf(list.kind, list.dueAt),
            },
            ...list.items.map((item) => ({
              key: `${list.title}/${item.title}`,
              label: item.title,
              nested: true,
            })),
          ])
        : [],
    };
  }

  // Compléter une liste, plutôt qu'en ouvrir une seconde : la liste visée est
  // nommée dans la phrase de l'assistant, l'aperçu ne montre donc que ce qui
  // s'y ajoute.
  if (suggestion.kind === "add_task_list_items") {
    const proposed = addTaskListItemsPayloadSchema.safeParse(suggestion.payload);

    return {
      acceptLabel: "Ajouter à la liste",
      lines: proposed.success
        ? proposed.data.items.map((item) => ({
            key: `${proposed.data.listId}/${item.title}`,
            label: item.title,
            nested: false,
          }))
        : [],
    };
  }

  if (suggestion.kind === "schedule_task") {
    const proposed = scheduleListsPayloadSchema.safeParse(suggestion.payload);

    return {
      acceptLabel: "Bloquer les créneaux",
      lines: proposed.success
        ? proposed.data.lists.map((list) => ({
            key: list.listId,
            label: list.title,
            nested: false,
            hint: dueLabel(list.dueAt),
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
        return name
          ? [{ key: id, label: name, nested: false, choice: { existingFolderId: id } }]
          : [];
      }),
      ...proposed.data.newFolderNames.map((name) => ({
        key: `nouveau:${name}`,
        label: name,
        nested: false,
        hint: "nouveau dossier",
        choice: { newFolderName: name },
      })),
    ],
  };
}

/**
 * Ce que la carte dit d'une liste proposée : sa nature, puis son échéance.
 *
 * L'échéance est celle de la liste entière — c'est ce que la conversation a
 * donné, et l'accrocher à une de ses lignes ferait croire à une date par item.
 */
function hintOf(kind: "todo" | "shopping", dueAt: string | null): { hint?: string } {
  const parts = [
    ...(kind === "shopping" ? ["achats"] : []),
    ...(dueAt === null ? [] : [dueLabel(dueAt)]),
  ];
  return parts.length === 0 ? {} : { hint: parts.join(" · ") };
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
  message: { fontFamily: FONT_FAMILY, fontSize: fontSize.md, lineHeight: 22 },
  tree: { gap: spacing.xs, paddingLeft: spacing.md, borderLeftWidth: 2 },
  // Pas de filet vertical ici : les cases alignent déjà les lignes entre elles.
  choices: { gap: spacing.xs },
  choice: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: MIN_TOUCH_TARGET,
  },
  box: {
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: radius.sm,
  },
  folder: { fontFamily: FONT_FAMILY, fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  nested: { paddingLeft: spacing.md, fontWeight: fontWeight.regular },
  hint: { fontFamily: FONT_FAMILY, fontSize: fontSize.xs, fontWeight: fontWeight.regular },
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
  noteLabel: { fontFamily: FONT_FAMILY, fontSize: fontSize.xs, flexShrink: 1 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  action: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
  },
  secondary: { borderWidth: 1 },
  actionLabel: { fontFamily: FONT_FAMILY, fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
});
