import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Check, X } from "lucide-react-native";
import {
  addTaskListItemsPayloadSchema,
  assignFoldersPayloadSchema,
  createProjectFoldersPayloadSchema,
  createRecurringEventPayloadSchema,
  createTaskListsPayloadSchema,
  reportBugPayloadSchema,
  scheduleListsPayloadSchema,
  updateTaskListDueDatePayloadSchema,
  updateTaskListItemsPayloadSchema,
  type AssignFoldersPayload,
  type CreateTaskListsPayload,
  type FeedbackPlatform,
  type Suggestion,
  type TaskListKind,
} from "@jc/domain";
import { fontSize, fontWeight, MIN_TOUCH_TARGET, radius, spacing } from "@jc/design";
import { useFeedbackContext } from "@/features/feedback/hooks/use-feedback";
import { FONT_FAMILY } from "@/shared/lib/fonts";
import { api } from "@/shared/lib/api";
import { formatFullDay, formatTime } from "@/shared/lib/dates";
import { useTheme } from "@/shared/providers/theme-provider";

/** Ce qu'accepter transmet en plus de l'action, selon la nature de la proposition. */
export type SuggestionAcceptInput = {
  /**
   * Les dossiers restés cochés, quand la proposition en fait cocher.
   * `undefined` — rien n'a été décoché — laisse le serveur appliquer la
   * proposition entière.
   */
  folderSelection?: AssignFoldersPayload;
  /**
   * Les listes telles que relues et corrigées avant validation (§13.4.1, #17).
   * Toujours transmis pour une todoliste : contrairement au rangement, il n'y
   * a ici aucune donnée externe (arborescence) que la carte ignorerait encore.
   */
  taskListEdits?: CreateTaskListsPayload;
  /**
   * Contexte technique d'un signalement de bug (A.10), inconnu du modèle —
   * même contexte que celui joint automatiquement à la fenêtre d'avis général.
   */
  bugReportContext?: { platform: FeedbackPlatform; screen: string };
};

export type SuggestionCardProps = {
  suggestion: Suggestion;
  onAccept: (input?: SuggestionAcceptInput) => void;
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
  const editableTaskLists = suggestion.kind === "create_task_list";
  const isBugReport = suggestion.kind === "report_bug";
  const editable = useEditableTaskLists(suggestion);
  // Même contexte que celui joint automatiquement à la fenêtre d'avis général :
  // le modèle ne peut pas le connaître, il n'arrive qu'ici, à l'acceptation.
  const bugReportContext = useFeedbackContext();

  // Les dossiers écartés, et non ceux retenus : un rangement propose de
  // ranger, pas de choisir à partir de rien. Décochés plutôt que cochés aussi
  // parce que les lignes arrivent avec l'arborescence — une liste de cochés
  // figée au premier rendu les laisserait toutes décochées.
  const [excluded, setExcluded] = useState<readonly string[]>([]);

  const selection = selectedFolders(preview.lines, excluded);
  const choosable = preview.lines.some((line) => line.choice);
  const editedPayload = editablePayload(editable.lists);
  const emptied = editableTaskLists
    ? editedPayload.lists.length === 0
    : choosable && selection.existingFolderIds.length + selection.newFolders.length === 0;

  const accept = () => {
    if (editableTaskLists) {
      onAccept({ taskListEdits: editedPayload });
      return;
    }
    if (isBugReport) {
      onAccept({ bugReportContext });
      return;
    }
    // Rien n'est envoyé tant que rien n'a été décoché : le serveur applique
    // alors la proposition entière, y compris un dossier que l'arborescence
    // en cache ne sait pas encore nommer.
    onAccept(excluded.length > 0 ? { folderSelection: selection } : undefined);
  };

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: palette.surfaceElevated, borderColor: palette.border },
      ]}
    >
      <Text style={[styles.message, { color: palette.text }]}>{suggestion.message}</Text>

      {editableTaskLists ? (
        <EditableTaskLists
          lists={editable.lists}
          disabled={isPending}
          onRenameList={editable.renameList}
          onRemoveList={editable.removeList}
          onRenameItem={editable.renameItem}
          onRemoveItem={editable.removeItem}
        />
      ) : /* L'aperçu est un confort : une charge utile illisible ne doit pas
             empêcher l'utilisateur de trancher. */
      preview.lines.length > 0 ? (
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
          onPress={accept}
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

type EditableItem = { key: string; title: string };
type EditableList = {
  key: string;
  title: string;
  kind: TaskListKind;
  dueAt: string | null;
  items: EditableItem[];
};

/**
 * État d'édition d'une proposition `create_task_list` avant validation (#17).
 *
 * Le brouillon reste local à la carte : rien n'est écrit en base tant que
 * l'utilisateur n'a pas validé, comme pour n'importe quelle autre suggestion
 * (§12.1). Les clés sont générées une fois à l'initialisation, pas recalculées
 * à partir de l'index — supprimer une ligne du milieu ne doit pas faire
 * sauter le focus sur sa voisine.
 */
function useEditableTaskLists(suggestion: Suggestion) {
  const [lists, setLists] = useState<EditableList[]>(() => {
    if (suggestion.kind !== "create_task_list") return [];
    const parsed = createTaskListsPayloadSchema.safeParse(suggestion.payload);
    if (!parsed.success) return [];

    return parsed.data.lists.map((list, listIndex) => ({
      key: `list-${listIndex}`,
      title: list.title,
      kind: list.kind,
      dueAt: list.dueAt,
      items: list.items.map((item, itemIndex) => ({
        key: `item-${listIndex}-${itemIndex}`,
        title: item.title,
      })),
    }));
  });

  return {
    lists,
    renameList: (key: string, title: string) =>
      setLists((current) => current.map((list) => (list.key === key ? { ...list, title } : list))),
    removeList: (key: string) => setLists((current) => current.filter((list) => list.key !== key)),
    renameItem: (listKey: string, itemKey: string, title: string) =>
      setLists((current) =>
        current.map((list) =>
          list.key === listKey
            ? {
                ...list,
                items: list.items.map((item) => (item.key === itemKey ? { ...item, title } : item)),
              }
            : list,
        ),
      ),
    // Une liste vidée de ses lignes disparaît avec la dernière : la garder à
    // l'écran, vide, n'inviterait qu'à se demander pourquoi le bouton refuse
    // de valider.
    removeItem: (listKey: string, itemKey: string) =>
      setLists((current) =>
        current
          .map((list) =>
            list.key === listKey
              ? { ...list, items: list.items.filter((item) => item.key !== itemKey) }
              : list,
          )
          .filter((list) => list.items.length > 0),
      ),
  };
}

/**
 * Charge utile telle qu'elle partirait vers le serveur.
 *
 * Une ligne réduite à un titre blanc — vidé sans passer par le bouton de
 * suppression — est écartée ici plutôt que d'échouer la validation côté
 * serveur avec un titre vide.
 */
function editablePayload(lists: EditableList[]): CreateTaskListsPayload {
  return {
    lists: lists
      .map((list) => ({
        title: list.title.trim(),
        kind: list.kind,
        dueAt: list.dueAt,
        items: list.items
          .map((item) => ({ title: item.title.trim() }))
          .filter((item) => item.title.length > 0),
      }))
      .filter((list) => list.title.length > 0 && list.items.length > 0),
  };
}

/**
 * Listes proposées, éditables avant validation (§13.4.1, #17).
 *
 * Un champ de texte par titre plutôt que l'éditeur complet des todolistes
 * réelles (`TaskListEditor`) : ici il n'y a qu'à corriger ce que le modèle a
 * extrait, pas à composer une liste — pas d'indentation, pas de nouvelle
 * ligne au clavier.
 */
function EditableTaskLists({
  lists,
  disabled,
  onRenameList,
  onRemoveList,
  onRenameItem,
  onRemoveItem,
}: {
  lists: EditableList[];
  disabled: boolean;
  onRenameList: (key: string, title: string) => void;
  onRemoveList: (key: string) => void;
  onRenameItem: (listKey: string, itemKey: string, title: string) => void;
  onRemoveItem: (listKey: string, itemKey: string) => void;
}) {
  const { palette } = useTheme();

  return (
    <View style={styles.editableLists}>
      {lists.map((list) => (
        <View key={list.key} style={styles.editableList}>
          <View style={styles.editableRow}>
            <TextInput
              value={list.title}
              onChangeText={(text) => onRenameList(list.key, text)}
              editable={!disabled}
              accessibilityLabel={`Titre de la liste ${list.title}`}
              style={[styles.input, styles.listTitleInput, { color: palette.text }]}
            />
            <RemoveButton
              label={`Supprimer la liste ${list.title || "sans titre"}`}
              disabled={disabled}
              onPress={() => onRemoveList(list.key)}
            />
          </View>

          {list.items.map((item) => (
            <View key={item.key} style={[styles.editableRow, styles.editableNested]}>
              <TextInput
                value={item.title}
                onChangeText={(text) => onRenameItem(list.key, item.key, text)}
                editable={!disabled}
                accessibilityLabel={`Élément ${item.title} de la liste ${list.title}`}
                style={[styles.input, { color: palette.text }]}
              />
              <RemoveButton
                label={`Supprimer ${item.title || "cette ligne"}`}
                disabled={disabled}
                onPress={() => onRemoveItem(list.key, item.key)}
              />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function RemoveButton({
  label,
  disabled,
  onPress,
}: {
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const { palette } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.removeButton, { opacity: disabled ? 0.4 : 1 }]}
    >
      <X size={14} color={palette.textMuted} />
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
    newFolders: kept.flatMap((line) =>
      line.choice && "newFolder" in line.choice ? [line.choice.newFolder] : [],
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
        {/* Un signalement n'a rien à relire dans le fil : le texte technique
            s'adresse à l'équipe, pas à l'utilisateur qui vient de valider. */}
        {accepted && suggestion.kind !== "report_bug" && names.length > 0 ? ` — ${names}` : ""}
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
    case "create_recurring_event":
      return "Rendez-vous posé";
    case "update_task_list_due_date":
      return "Échéance déplacée";
    case "update_task_list_items":
      return "Liste mise à jour";
    case "report_bug":
      return "Bug signalé, merci pour le retour !";
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
  choice?: { existingFolderId: string } | { newFolder: { name: string; parentId?: string } };
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

  if (suggestion.kind === "create_recurring_event") {
    const proposed = createRecurringEventPayloadSchema.safeParse(suggestion.payload);

    return {
      acceptLabel: "Poser le rendez-vous",
      lines: proposed.success
        ? [
            {
              key: "event",
              label: proposed.data.title,
              nested: false,
              hint: `${dueLabel(proposed.data.startsAt)} · ${rruleHint(proposed.data.rrule)}`,
            },
          ]
        : [],
    };
  }

  // Cocher ou renommer : la liste est déjà nommée dans la phrase, l'aperçu
  // ne montre que ce qui change sur chaque ligne.
  if (suggestion.kind === "update_task_list_items") {
    const proposed = updateTaskListItemsPayloadSchema.safeParse(suggestion.payload);

    return {
      acceptLabel: "Mettre à jour la liste",
      lines: proposed.success
        ? proposed.data.items.map((item) => ({
            key: item.taskId,
            label: updateItemLabel(item),
            nested: false,
          }))
        : [],
    };
  }

  // La liste visée est déjà nommée dans la phrase de l'assistant (« Je décale
  // Courses à vendredi ? ») : l'aperçu se limite à la nouvelle date.
  if (suggestion.kind === "update_task_list_due_date") {
    const proposed = updateTaskListDueDatePayloadSchema.safeParse(suggestion.payload);

    return {
      acceptLabel: "Décaler la liste",
      lines: proposed.success
        ? [{ key: proposed.data.listId, label: dueLabel(proposed.data.dueAt), nested: false }]
        : [],
    };
  }

  // Le texte rédigé par le modèle, pour relecture avant de le transmettre :
  // c'est ce que `content` deviendra dans `feedback`, tel quel.
  if (suggestion.kind === "report_bug") {
    const proposed = reportBugPayloadSchema.safeParse(suggestion.payload);

    return {
      acceptLabel: "Signaler le bug",
      lines: proposed.success
        ? [{ key: "content", label: proposed.data.content, nested: false }]
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
      ...proposed.data.newFolders.map((folder) => ({
        key: `nouveau:${folder.parentId ?? ""}:${folder.name}`,
        label: folder.name,
        nested: false,
        hint: folder.parentId
          ? `nouveau sous-dossier de ${byId.get(folder.parentId) ?? "dossier existant"}`
          : "nouveau dossier",
        choice: { newFolder: folder },
      })),
    ],
  };
}

/**
 * Ce que la carte dit d'une ligne à modifier : le nouveau titre s'il y en a
 * un, sinon le seul changement d'état — on n'a pas l'ancien titre sous la
 * main, la phrase de l'assistant le porte déjà.
 */
function updateItemLabel(item: { title?: string; done?: boolean }): string {
  const state =
    item.done === true ? "faite" : item.done === false ? "à faire" : null;
  if (item.title !== undefined && state !== null) return `${item.title} (${state})`;
  if (item.title !== undefined) return item.title;
  if (state === "faite") return "Marquer comme faite";
  if (state === "à faire") return "Remettre à faire";
  return "Modifier";
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

/**
 * Récurrence lisible pour la carte — « tous les mardis » plutôt que
 * `FREQ=WEEKLY;BYDAY=TU`. Un format hors des cas courants retombe sur
 * « récurrent » : mieux vaut un libellé sobre qu'une chaîne technique.
 */
function rruleHint(rrule: string): string {
  const freq = /FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)/i.exec(rrule)?.[1]?.toUpperCase();
  const byday = /BYDAY=([A-Z,]+)/i.exec(rrule)?.[1]?.toUpperCase();

  if (freq === "DAILY") return "tous les jours";
  if (freq === "WEEKLY" && byday) {
    const days = byday
      .split(",")
      .map((code) => WEEKDAY_FR[code])
      .filter((label): label is string => label !== undefined);
    if (days.length === 1) return `tous les ${days[0]}s`;
    if (days.length > 1) return `chaque ${days.join(", ")}`;
  }
  if (freq === "MONTHLY") return "tous les mois";
  if (freq === "YEARLY") return "tous les ans";
  return "récurrent";
}

const WEEKDAY_FR: Record<string, string> = {
  MO: "lundi",
  TU: "mardi",
  WE: "mercredi",
  TH: "jeudi",
  FR: "vendredi",
  SA: "samedi",
  SU: "dimanche",
};

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
  editableLists: { gap: spacing.sm },
  editableList: { gap: spacing.xs },
  editableRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  editableNested: { paddingLeft: spacing.md },
  input: {
    flex: 1,
    fontFamily: FONT_FAMILY,
    fontSize: fontSize.sm,
    minHeight: MIN_TOUCH_TARGET,
  },
  listTitleInput: { fontWeight: fontWeight.semibold },
  removeButton: {
    width: MIN_TOUCH_TARGET / 2,
    height: MIN_TOUCH_TARGET / 2,
    alignItems: "center",
    justifyContent: "center",
  },
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
