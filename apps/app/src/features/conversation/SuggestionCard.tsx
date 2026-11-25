import { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, ChevronRight, X } from "lucide-react-native";
import {
  addTaskListItemsPayloadSchema,
  assignFoldersPayloadSchema,
  createEventsPayloadSchema,
  createProjectFoldersPayloadSchema,
  createRecurringEventPayloadSchema,
  createTaskListsPayloadSchema,
  dateOfCalendarDay,
  reportBugPayloadSchema,
  rememberPayloadSchema,
  deleteItemPayloadSchema,
  updateEventPayloadSchema,
  scheduleListsPayloadSchema,
  updateTaskListDueDatePayloadSchema,
  updateTaskListItemsPayloadSchema,
  type AssignFoldersPayload,
  type CreateTaskListsPayload,
  type FeedbackCategory,
  type FeedbackPlatform,
  type ResolveSuggestion,
  type Suggestion,
  type TaskListKind,
} from "@jc/domain";
import { fontSize, fontWeight, MIN_TOUCH_TARGET, radius, spacing } from "@jc/design";
import { useFeedbackContext } from "@/features/feedback/hooks/use-feedback";
import { FONT_FAMILY } from "@/shared/lib/fonts";
import { cn } from "@/shared/lib/utils";
import { api } from "@/shared/lib/api";
import { useTaskLists } from "@/shared/hooks/use-task-lists";
import { formatFullDay, formatTime } from "@/shared/lib/dates";
import { useFolderChoices } from "@/shared/hooks/use-folder-choices";
import { TASK_ROW_HEIGHT } from "@/shared/lib/tasks";
import { useTheme } from "@/shared/providers/theme-provider";
import { Button } from "@/shared/ui/button";
import { ContextMenu, type ContextMenuItem } from "@/shared/ui/context-menu";
import { Icon } from "@/shared/ui/icon";
import { DueDialog } from "@/features/todo/ListDueDialog";
import {
  TaskListCardFrame,
  TaskListCardBody,
  TaskListCardHeader,
  TaskRowBlankCheckbox,
  taskRowStyle,
} from "@/shared/ui/task-list-card";
import { SpinningCog, useElapsedSeconds } from "./ThinkingIndicator";

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
  /**
   * Geste en cours d'envoi sur cette carte, `null` sinon : les deux gestes sont
   * neutralisés tant qu'il n'a pas abouti.
   */
  pendingAction: ResolveSuggestion["action"] | null;
  /**
   * Sans cadre ni plafond de largeur : dans le volet de droite, la carte est la
   * page elle-même, un cadre de plus l'enfermerait dans une boîte dans la boîte.
   */
  flat?: boolean;
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
  pendingAction,
  flat = false,
}: SuggestionCardProps) {
  const { palette } = useTheme();
  const isPending = pendingAction !== null;
  const accepting = pendingAction === "accept";
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

  const actions = (
    <View style={styles.actions}>
      <Pressable
        onPress={accept}
        disabled={isPending || emptied}
        accessibilityRole="button"
        accessibilityLabel={preview.acceptLabel}
        aria-busy={accepting}
        style={[
          styles.action,
          {
            backgroundColor: palette.accent,
            // Pleinement opaque pendant l'acceptation : c'est lui qui porte
            // la roue, grisé on ne la verrait plus tourner.
            opacity: (isPending && !accepting) || emptied ? 0.4 : 1,
          },
        ]}
      >
        {accepting ? (
          <AcceptingLabel color={palette.accentText} />
        ) : (
          <Text style={[styles.actionLabel, { color: palette.accentText }]}>
            {preview.acceptLabel}
          </Text>
        )}
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
  );

  return (
    <View
      style={[
        styles.card,
        flat
          ? styles.cardFlat
          : { backgroundColor: palette.surfaceElevated, borderColor: palette.border },
      ]}
    >
      <Text style={[styles.message, { color: palette.text }]}>{suggestion.message}</Text>

      {/* Les gestes d'abord pour une liste : elle peut être longue, et Valider ne
          doit pas se trouver au bas d'un défilement. */}
      {editableTaskLists ? actions : null}

      {editableTaskLists ? (
        <EditableTaskLists
          lists={editable.lists}
          disabled={isPending}
          onRenameList={editable.renameList}
          onRemoveList={editable.removeList}
          onChangeDue={editable.setDue}
          onChangeFolder={editable.setFolder}
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

      {editableTaskLists ? null : actions}
    </View>
  );
}

/**
 * Contenu du bouton d'acceptation le temps que le serveur crée ce qui a été
 * accepté, puis que le fil le relise.
 *
 * La carte se contentait de griser : rien ne distinguait une création lente
 * d'un clic perdu (retour de Yann, sur la création de dossiers). Même roue et
 * même compteur que l'attente d'une réponse.
 */
function AcceptingLabel({ color }: { color: string }) {
  const seconds = useElapsedSeconds();

  return (
    <View style={styles.accepting}>
      <SpinningCog size={14} color={color} />
      <Text style={[styles.actionLabel, { color }]}>
        En cours…{seconds > 0 ? ` ${seconds} s` : ""}
      </Text>
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

type EditableItem = { key: string; title: string; dueOn: string | null };
type EditableList = {
  key: string;
  title: string;
  kind: TaskListKind;
  dueAt: string | null;
  /** `undefined` : pas touché, le serveur range selon la conversation ; `null` : aucun dossier. */
  folderId?: string | null;
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
        dueOn: item.dueOn,
      })),
    }));
  });

  return {
    lists,
    renameList: (key: string, title: string) =>
      setLists((current) => current.map((list) => (list.key === key ? { ...list, title } : list))),
    removeList: (key: string) => setLists((current) => current.filter((list) => list.key !== key)),
    setDue: (key: string, dueAt: string | null) =>
      setLists((current) => current.map((list) => (list.key === key ? { ...list, dueAt } : list))),
    setFolder: (key: string, folderId: string | null) =>
      setLists((current) =>
        current.map((list) => (list.key === key ? { ...list, folderId } : list)),
      ),
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
        ...(list.folderId === undefined ? {} : { folderId: list.folderId }),
        items: list.items
          .map((item) => ({ title: item.title.trim(), dueOn: item.dueOn }))
          .filter((item) => item.title.length > 0),
      }))
      .filter((list) => list.title.length > 0 && list.items.length > 0),
  };
}

/**
 * Listes proposées, éditables avant validation (§13.4.1, #17).
 *
 * Même carte que « Mes listes » : on valide ce qu'on retrouvera ensuite. L'en-tête
 * est celui de la vraie carte, et l'échéance comme le dossier se changent d'un
 * appui, comme là-bas. Un champ de texte par titre plutôt que l'éditeur complet
 * (`TaskListEditor`) : il n'y a qu'à corriger ce que le modèle a extrait, pas à
 * composer une liste — pas d'indentation, pas de nouvelle ligne au clavier.
 */
function EditableTaskLists({
  lists,
  disabled,
  onRenameList,
  onRemoveList,
  onChangeDue,
  onChangeFolder,
  onRenameItem,
  onRemoveItem,
}: {
  lists: EditableList[];
  disabled: boolean;
  onRenameList: (key: string, title: string) => void;
  onRemoveList: (key: string) => void;
  onChangeDue: (key: string, dueAt: string | null) => void;
  onChangeFolder: (key: string, folderId: string | null) => void;
  onRenameItem: (listKey: string, itemKey: string, title: string) => void;
  onRemoveItem: (listKey: string, itemKey: string) => void;
}) {
  const { palette } = useTheme();
  const folders = useFolderChoices();
  const [folderMenu, setFolderMenu] = useState<{ key: string; x: number; y: number } | null>(null);
  const [menu, setMenu] = useState<{ key: string; x: number; y: number } | null>(null);
  const [editingDue, setEditingDue] = useState<string | null>(null);
  const [folded, setFolded] = useState<readonly string[]>([]);
  const editedList = lists.find((list) => list.key === editingDue);
  const folderMenuList = lists.find((list) => list.key === folderMenu?.key);
  const menuList = lists.find((list) => list.key === menu?.key);

  const folderItems: ContextMenuItem[] = folderMenuList
    ? [
        {
          label: "Aucun dossier",
          onPress: () => {
            onChangeFolder(folderMenuList.key, null);
            setFolderMenu(null);
          },
        },
        ...folders.map((folder) => ({
          label: folder.name,
          onPress: () => {
            onChangeFolder(folderMenuList.key, folder.id);
            setFolderMenu(null);
          },
        })),
      ]
    : [];

  return (
    <View style={styles.editableLists}>
      {lists.map((list) => (
        <TaskListCardFrame key={list.key} desktop>
          <TaskListCardHeader
            title={list.title}
            shopping={list.kind === "shopping"}
            folderName={folders.find((folder) => folder.id === list.folderId)?.name}
            due={proposedDueLabel(list.dueAt) ?? undefined}
            onFolderPress={(event) =>
              !disabled &&
              setFolderMenu({
                key: list.key,
                x: event.nativeEvent.pageX,
                y: event.nativeEvent.pageY,
              })
            }
            onDuePress={() => !disabled && setEditingDue(list.key)}
            onMenuPress={(event) =>
              !disabled &&
              setMenu({ key: list.key, x: event.nativeEvent.pageX, y: event.nativeEvent.pageY })
            }
            menuLabel={`Actions pour ${list.title || "la liste"}`}
            leading={
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  hitSlop={8}
                  accessibilityLabel={
                    folded.includes(list.key) ? `Déplier ${list.title}` : `Replier ${list.title}`
                  }
                  className="-ml-1 size-8"
                  onPress={() =>
                    setFolded((current) =>
                      current.includes(list.key)
                        ? current.filter((key) => key !== list.key)
                        : [...current, list.key],
                    )
                  }
                >
                  <Icon
                    as={folded.includes(list.key) ? ChevronRight : ChevronDown}
                    size={16}
                    className="text-muted-foreground"
                  />
                </Button>
                <TaskRowBlankCheckbox />
                <TextInput
                  value={list.title}
                  onChangeText={(text) => onRenameList(list.key, text)}
                  editable={!disabled}
                  accessibilityLabel={`Titre de la liste ${list.title}`}
                  style={{
                    fontFamily: FONT_FAMILY,
                    color: palette.text,
                    width: titleWidth(list.title),
                    minHeight: TASK_ROW_HEIGHT,
                  }}
                  className={cn("text-sm font-semibold", Platform.select({ web: "outline-none" }))}
                />
              </>
            }
          />

          {/* Même zone, mêmes lignes que la vraie carte : hauteur, écart et
              retrait viennent des mêmes mesures, la croix tenant la place de la
              poignée de déplacement. */}
          <TaskListCardBody desktop>
            {(folded.includes(list.key) ? [] : list.items).map((item) => (
              <View
                key={item.key}
                style={taskRowStyle(0)}
                className="relative flex-row items-center gap-2 rounded-md"
              >
                <TaskRowBlankCheckbox />
                <TextInput
                  value={item.title}
                  onChangeText={(text) => onRenameItem(list.key, item.key, text)}
                  editable={!disabled}
                  accessibilityLabel={`Élément ${item.title} de la liste ${list.title}`}
                  style={{ fontFamily: FONT_FAMILY, color: palette.text }}
                  className={cn("flex-1 text-sm", Platform.select({ web: "outline-none" }))}
                />
                {item.dueOn === null ? null : (
                  <Text style={[styles.hint, { color: palette.textMuted }]}>
                    {dueOnLabel(item.dueOn)}
                  </Text>
                )}
                <RemoveButton
                  label={`Supprimer ${item.title || "cette ligne"}`}
                  disabled={disabled}
                  onPress={() => onRemoveItem(list.key, item.key)}
                />
              </View>
            ))}
          </TaskListCardBody>
        </TaskListCardFrame>
      ))}

      {menu && menuList ? (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={[
            {
              label: "Retirer la liste",
              destructive: true,
              onPress: () => {
                onRemoveList(menuList.key);
                setMenu(null);
              },
            },
          ]}
          onClose={() => setMenu(null)}
        />
      ) : null}
      {folderMenu && folderMenuList ? (
        <ContextMenu
          x={folderMenu.x}
          y={folderMenu.y}
          items={folderItems}
          onClose={() => setFolderMenu(null)}
        />
      ) : null}
      {editedList ? (
        <DueDialog
          title={editedList.title}
          dueAt={editedList.dueAt}
          dueAllDay={editedList.dueAt === null ? null : isMidnight(editedList.dueAt)}
          pending={false}
          failure={null}
          onSubmit={(due) => {
            onChangeDue(editedList.key, due.dueAt);
            setEditingDue(null);
          }}
          onClose={() => setEditingDue(null)}
        />
      ) : null}
    </View>
  );
}

/**
 * Largeur d'un titre de liste : celle de son texte, pour que le type et le dossier
 * viennent à sa suite comme sur la vraie carte, au lieu de passer à la ligne
 * derrière un champ plus large que ce qu'il contient.
 */
function titleWidth(title: string): number {
  return Math.max(title.length, 4) * 9 + 8;
}

/** Une échéance à minuit vaut « dans la journée » : l'heure n'a pas été choisie. */
function isMidnight(iso: string): boolean {
  const date = new Date(iso);
  return date.getHours() === 0 && date.getMinutes() === 0;
}

/**
 * Échéance d'une liste proposée, comme sur la carte de « Mes listes » :
 * l'heure d'abord — « 10h · mardi 17 novembre ». L'heure est omise à minuit,
 * que le modèle pose faute de mieux quand on ne lui a donné qu'un jour.
 */
function proposedDueLabel(iso: string | null): string | null {
  if (iso === null) return null;
  const date = new Date(iso);
  const day = formatFullDay(date);
  return isMidnight(iso) ? day : `${formatTime(iso)} · ${day}`;
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

  // Gabarit de la poignée de la vraie carte : la croix ne change ni la hauteur de
  // la ligne ni l'alignement du bord droit.
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
 * sans que rien n'explique d'où ils viennent. En une ligne et non en carte —
 * c'est de l'historique, plus une action à mener.
 *
 * Elle se lit comme une réponse de l'assistant, dans la même typographie et
 * sans cadre (demande de Yann) : « Dossiers créés » est une réplique comme une
 * autre, pas une pièce rapportée qui change l'allure du fil. Seule la coche
 * reste, pour dire que c'est fait.
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
    <View style={styles.note}>
      {accepted ? <Check size={16} color={palette.accent} style={styles.noteCheck} /> : null}
      {/* Une proposition écartée n'a rien fait : elle reste en retrait. */}
      <Text style={[styles.noteLabel, { color: accepted ? palette.text : palette.textMuted }]}>
        {outcomeLabel(suggestion)}
        {/* Un signalement n'a rien à relire dans le fil : le texte technique
            s'adresse à l'équipe, pas à l'utilisateur qui vient de valider. */}
        {accepted && suggestion.kind !== "report_bug" && names.length > 0 ? ` — ${names}` : ""}
      </Text>
    </View>
  );
}

/**
 * Libellés d'un retour transmis depuis le canal, selon sa nature (A.10). Une
 * proposition illisible retombe sur le bug, comme le fait le serveur.
 */
const REPORT_LABELS: Record<FeedbackCategory, { accept: string; outcome: string }> = {
  bug: { accept: "Signaler le bug", outcome: "Bug signalé, merci pour le retour !" },
  idea: { accept: "Transmettre l'idée", outcome: "Idée transmise, merci !" },
  other: { accept: "Transmettre", outcome: "Retour transmis, merci !" },
};

function reportLabels(suggestion: Suggestion): { accept: string; outcome: string } {
  const proposed = reportBugPayloadSchema.safeParse(suggestion.payload);
  return REPORT_LABELS[proposed.success ? proposed.data.category : "bug"];
}

/** Ce qui est arrivé à la proposition, dit du point de vue de l'utilisateur. */
function outcomeLabel(suggestion: Suggestion): string {
  if (suggestion.status === "dismissed") return "Proposition ignorée";
  // Seul producteur de ce statut : une proposition de todolistes corrigée
  // pendant qu'elle attendait, que la suivante remplace.
  if (suggestion.status === "expired") return "Proposition remplacée";

  switch (suggestion.kind) {
    case "assign_folders":
      return "Conversation rangée";
    case "create_project_folders":
      return "Dossiers créés";
    case "create_task_list":
      return "Todolistes créées";
    case "add_task_list_items":
      return "Liste complétée";
    case "schedule_task":
      return "Créneaux posés";
    case "create_recurring_event":
      return "Rendez-vous posé";
    case "create_events":
      return "Rendez-vous posés";
    case "update_task_list_due_date":
      return "Échéance déplacée";
    case "update_task_list_items":
      return "Liste mise à jour";
    case "report_bug":
      return reportLabels(suggestion).outcome;
    case "remember":
      return "C'est retenu";
    case "update_event":
      return "Rendez-vous modifié";
    case "delete_item":
      return "C'est supprimé";
    default: {
      // Exhaustivité vérifiée à la compilation : un `kind` ajouté à
      // `suggestionKindSchema` sans mise à jour de ce switch fait échouer le
      // typecheck plutôt que d'afficher ici un libellé faux.
      const exhaustive: never = suggestion.kind;
      return exhaustive;
    }
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
  // Une ligne retirée n'est désignée que par son identifiant : son titre est
  // relu depuis les listes, déjà en cache — la même clé que Mes listes.
  const taskLists = useTaskLists({ enabled: suggestion.kind === "update_task_list_items" });

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
      acceptLabel: "Valider",
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
              ...(item.dueOn === null ? {} : { hint: dueOnLabel(item.dueOn) }),
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

  // Plusieurs rendez-vous ponctuels, chacun avec sa propre date — distinct
  // d'un rendez-vous récurrent, qui n'affiche qu'une seule ligne.
  if (suggestion.kind === "create_events") {
    const proposed = createEventsPayloadSchema.safeParse(suggestion.payload);

    return {
      acceptLabel: "Poser les rendez-vous",
      lines: proposed.success
        ? proposed.data.events.map((event, index) => ({
            key: `event-${index}`,
            label: event.title,
            nested: false,
            hint: dueLabel(event.startsAt),
          }))
        : [],
    };
  }

  // Cocher, renommer, retirer, ajouter : la liste est déjà nommée dans la
  // phrase, l'aperçu ne montre que ce qui change, ligne par ligne.
  if (suggestion.kind === "update_task_list_items") {
    const proposed = updateTaskListItemsPayloadSchema.safeParse(suggestion.payload);
    const titles = new Map(
      (taskLists.data ?? []).flatMap((list) => list.tasks).map((task) => [task.id, task.title]),
    );

    return {
      acceptLabel: "Mettre à jour la liste",
      lines: proposed.success
        ? [
            ...proposed.data.items.map((item) => ({
              key: item.taskId,
              label:
                item.remove === true
                  ? removedItemLabel(titles.get(item.taskId))
                  : updateItemLabel(item),
              nested: false,
            })),
            ...proposed.data.added.map((item, index) => ({
              key: `ajout-${index}`,
              label: `${item.title} (ajoutée)`,
              nested: false,
            })),
          ]
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

  // Ce qui change, en clair : le nouveau titre et le nouveau début. Le
  // rendez-vous visé est déjà nommé dans la phrase de l'assistant.
  if (suggestion.kind === "update_event") {
    const proposed = updateEventPayloadSchema.safeParse(suggestion.payload);
    const lines: PreviewLine[] = [];
    if (proposed.success) {
      if (proposed.data.title !== undefined) {
        lines.push({ key: "title", label: proposed.data.title, nested: false });
      }
      if (proposed.data.startsAt !== undefined) {
        lines.push({ key: "startsAt", label: dueLabel(proposed.data.startsAt), nested: false });
      }
    }
    return { acceptLabel: "Modifier le rendez-vous", lines };
  }

  // Ce qui part, nommé sur la carte : on supprime en connaissance de cause.
  if (suggestion.kind === "delete_item") {
    const proposed = deleteItemPayloadSchema.safeParse(suggestion.payload);
    return {
      acceptLabel: "Supprimer",
      lines: proposed.success
        ? [{ key: proposed.data.itemId, label: proposed.data.title, nested: false }]
        : [],
    };
  }

  // Le texte rédigé par le modèle, pour relecture avant de le transmettre :
  // c'est ce que `content` deviendra dans `feedback`, tel quel.
  if (suggestion.kind === "report_bug") {
    const proposed = reportBugPayloadSchema.safeParse(suggestion.payload);

    return {
      acceptLabel: reportLabels(suggestion).accept,
      lines: proposed.success
        ? [{ key: "content", label: proposed.data.content, nested: false }]
        : [],
    };
  }

  // La phrase qui sera retenue, telle quelle : c'est elle que l'utilisateur
  // retrouvera et pourra corriger dans « Ce que Jean-Claude sait de moi ».
  if (suggestion.kind === "remember") {
    const proposed = rememberPayloadSchema.safeParse(suggestion.payload);

    return {
      acceptLabel: "Retenir",
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
  const state = item.done === true ? "faite" : item.done === false ? "à faire" : null;
  if (item.title !== undefined && state !== null) return `${item.title} (${state})`;
  if (item.title !== undefined) return item.title;
  if (state === "faite") return "Marquer comme faite";
  if (state === "à faire") return "Remettre à faire";
  return "Modifier";
}

/**
 * Ce que la carte dit d'une ligne retirée. Son titre n'est plus en cache une
 * fois la modification acceptée : la trace du fil dit alors seulement qu'une
 * ligne est partie.
 */
function removedItemLabel(title: string | undefined): string {
  return title === undefined ? "Ligne retirée" : `${title} (retirée)`;
}

/**
 * Ce que la carte dit d'une liste proposée : sa nature, puis son échéance.
 *
 * L'échéance est celle de la liste entière ; le jour propre d'une ligne
 * s'affiche sur la ligne (`dueOnLabel`).
 */
function hintOf(kind: "todo" | "shopping", dueAt: string | null): { hint?: string } {
  const parts = [
    ...(kind === "shopping" ? ["achats"] : []),
    ...(dueAt === null ? [] : [dueLabel(dueAt)]),
  ];
  return parts.length === 0 ? {} : { hint: parts.join(" · ") };
}

/** Jour d'une ligne proposée — « samedi 12 septembre ». */
function dueOnLabel(dueOn: string): string {
  return formatFullDay(dateOfCalendarDay(dueOn));
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
  cardFlat: { alignSelf: "stretch", maxWidth: "100%", padding: 0, borderWidth: 0 },
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
  removeButton: {
    minWidth: TASK_ROW_HEIGHT / 2,
    minHeight: TASK_ROW_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  // Mêmes corps, interligne et marge verticale qu'une réponse de l'assistant
  // (`MessageRow`) : la trace s'aligne sur le texte qui la précède.
  note: {
    alignSelf: "flex-start",
    maxWidth: "100%",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.xs,
    paddingVertical: spacing.md,
  },
  noteCheck: { marginTop: 3 },
  noteLabel: { fontFamily: FONT_FAMILY, fontSize: fontSize.md, lineHeight: 22, flexShrink: 1 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  action: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
  },
  secondary: { borderWidth: 1 },
  accepting: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  actionLabel: { fontFamily: FONT_FAMILY, fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
});
