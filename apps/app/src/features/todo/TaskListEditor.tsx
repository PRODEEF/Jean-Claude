import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  TextInput,
  View,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData,
} from "react-native";
import { Check, ChevronsLeft, ChevronsRight, GripVertical, NotebookPen } from "lucide-react-native";
import type { Task, TaskListWithTasks } from "@jc/domain";
import { dateOfCalendarDay } from "@jc/domain";
import { formatDayLabel, formatFullDay } from "@/shared/lib/dates";
import { FONT_FAMILY } from "@/shared/lib/fonts";
import { cn } from "@/shared/lib/utils";
import { TASK_CHECKBOX_SIZE, TASK_INDENT, TASK_ROW_HEIGHT, titleMatchesQuery } from "@/shared/lib/tasks";
import { useReplaceTasks, useTaskActions } from "@/shared/hooks/use-task-lists";
import { Icon } from "@/shared/ui/icon";
import { Text } from "@/shared/ui/text";
import { useTheme } from "@/shared/providers/theme-provider";
import { reorderTaskRows, taskDropIndex, useTaskRowDrag } from "./task-row-drag";

/** Délai avant d'enregistrer une frappe. Un mot se tape plus vite que ça. */
const AUTOSAVE_DELAY = 700;

/**
 * Une ligne de l'éditeur.
 *
 * `id` est absent tant que la ligne n'a pas été enregistrée. `key` lui survit :
 * c'est elle qui garde le focus au même endroit quand la sauvegarde renvoie
 * enfin l'identifiant du serveur.
 */
type Row = { key: string; id?: string; title: string; depth: 0 | 1; done: boolean };

export type TaskListEditorProps = {
  list: TaskListWithTasks;
  /** Recherche en cours : les lignes qui y répondent sont mises en avant. */
  query: string;
  /** Ouvre le détail d'une tâche — ses notes et son échéance. */
  onOpenTask: (task: Task) => void;
  /**
   * Tâches montrées, quand la liste n'est là que pour le jour de certaines
   * d'entre elles. Absentes, l'éditeur tient la liste entière.
   */
  visibleTaskIds?: readonly string[];
  /**
   * Jour des lignes nouvelles, quand on écrit depuis un autre jour que
   * l'échéance de la liste. Sans lui, elles la rejoindraient.
   */
  dueOnForNew?: string;
};

/**
 * Contenu d'une todoliste, édité comme on écrit dans une zone de texte.
 *
 * Une ligne vaut une tâche, l'indentation vaut la filiation : c'est le modèle
 * de Things 3, de Todoist et de Notion (§4.2), et c'est ce qui permet de vider
 * sa tête d'un trait sans quitter le clavier. Entrée ouvre la ligne suivante,
 * Retour arrière sur une ligne vide la referme, Tabulation la range sous la
 * précédente.
 *
 * L'état vit ici et non dans le serveur à chaque frappe : la liste entière est
 * réécrite en un appel, au repos ou à la sortie du champ. Insérer une ligne au
 * milieu décale toutes les suivantes — l'envoyer geste par geste laisserait la
 * liste incohérente entre deux appels.
 *
 * L'ordre se change en glissant une ligne (web). Le même appel réécrit les
 * positions : c'est l'ordre du tableau qui les porte.
 */
/**
 * Mémoïsé : `ListsBoard` en rend une par todoliste, et un rafraîchissement
 * du cache ne doit pas redessiner celles dont le contenu n'a pas changé.
 */
export const TaskListEditor = memo(function TaskListEditor({
  list,
  query,
  onOpenTask,
  visibleTaskIds,
  dueOnForNew,
}: TaskListEditorProps) {
  const { palette } = useTheme();
  const { updateTask } = useTaskActions();
  const replaceTasks = useReplaceTasks(list.id);

  const [rows, setRows] = useState<Row[]>(() => seed(list, visibleTaskIds));
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  /** Trait d'insertion du glisser-déposer : index de la ligne devant laquelle on lâche. */
  const [insertBefore, setInsertBefore] = useState<number | null>(null);

  const inputs = useRef(new Map<string, TextInput>());
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const listRef = useRef(list);
  listRef.current = list;
  const visibleRef = useRef(visibleTaskIds);
  visibleRef.current = visibleTaskIds;
  const dueOnRef = useRef(dueOnForNew);
  dueOnRef.current = dueOnForNew;
  const nextKey = useRef(0);
  /** Ligne à laquelle rendre le focus une fois l'état appliqué. */
  const pendingFocus = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Sortie d'édition différée : le focus passe souvent d'une ligne à sa voisine. */
  const leaving = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Des frappes attendent d'être enregistrées : ne pas les écraser. */
  const dirty = useRef(false);
  const focused = useRef(false);
  /** Dernier contenu enregistré, pour ne pas réécrire une liste inchangée. */
  const saved = useRef(contentSignature(list.tasks));
  /** Dernier état du serveur déjà repris dans l'éditeur, complétion comprise. */
  const seeded = useRef(stateSignature(list.tasks));

  const makeKey = () => `local-${nextKey.current++}`;

  /**
   * Envoie le contenu au serveur, puis reprend les identifiants qu'il attribue.
   *
   * Sans cette reprise, chaque sauvegarde suivante renverrait les mêmes lignes
   * sans identifiant : le serveur les prendrait pour des lignes neuves et
   * effacerait au passage ce que l'éditeur ne transporte pas — la complétion
   * et les notes.
   */
  const flush = useCallback(
    (current: Row[]) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;

      const written = current.filter((row) => row.title.trim().length > 0);
      const dueOn = dueOnRef.current;
      const edited = written.map((row) => ({
        ...(row.id ? { id: row.id } : {}),
        title: row.title.trim(),
        depth: row.depth,
        // Seulement les lignes neuves : une ligne déjà là garde le jour que
        // le serveur lui connaît, et le renvoyer l'écraserait.
        ...(!row.id && dueOn ? { dueOn } : {}),
      }));
      const visible = visibleRef.current;
      const merged = visible
        ? mergeVisibleItems(listRef.current.tasks, new Set(visible), edited)
        : null;
      const items = merged?.items ?? edited;

      const sent = payloadSignature(items);
      if (sent === saved.current) {
        dirty.current = false;
        return;
      }

      dirty.current = false;
      replaceTasks.mutate(
        { items },
        {
          onSuccess: (tasks) => {
            saved.current = contentSignature(tasks);
            seeded.current = stateSignature(tasks);
            setFailed(false);
            setRows((now) => adopt(now, newIdsByKey(items, tasks, written)));
          },
          onError: () => {
            dirty.current = true;
            setFailed(true);
          },
        },
      );
    },
    [replaceTasks],
  );

  // Les frappes sont regroupées : une sauvegarde par pause, pas une par
  // caractère. Les gestes de structure, eux, partent tout de suite — ce sont
  // eux qui donnent son identifiant à une ligne neuve.
  const apply = (next: Row[], immediate: boolean) => {
    setRows(next);
    dirty.current = true;

    if (timer.current) clearTimeout(timer.current);
    timer.current = null;

    if (immediate) {
      flush(next);
      return;
    }

    // Une ligne déjà enregistrée qu'on vient de vider est en cours de
    // réécriture, pas de suppression — celle-ci se demande par Retour arrière.
    // L'enregistrer derrière le dos de qui tape l'effacerait du serveur avec sa
    // complétion et ses notes, et la retaper en créerait une neuve. Seul
    // l'enregistrement automatique attend : sortir du champ, lui, tranche.
    if (isBeingRewritten(next)) return;

    timer.current = setTimeout(() => flush(next), AUTOSAVE_DELAY);
  };

  // Rien n'est réécrit tant que l'utilisateur tape ou garde le curseur dans la
  // liste : le rechargement qui suit une sauvegarde lui reprendrait sa ligne
  // en cours de route.
  const serverSignature = stateSignature(list.tasks);
  useEffect(() => {
    if (dirty.current || focused.current || seeded.current === serverSignature) return;
    seeded.current = serverSignature;
    saved.current = contentSignature(list.tasks);
    setRows(seed(list, visibleRef.current));
  }, [list, serverSignature]);

  useEffect(() => {
    const key = pendingFocus.current;
    if (!key) return;
    pendingFocus.current = null;
    inputs.current.get(key)?.focus();
  }, [rows]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (leaving.current) clearTimeout(leaving.current);
    },
    [],
  );

  const focus = (key: string) => {
    pendingFocus.current = key;
    inputs.current.get(key)?.focus();
  };

  const edit = (index: number, title: string) => {
    const next = [...rows];
    const row = next[index];
    if (!row) return;
    next[index] = { ...row, title };
    apply(next, false);
  };

  const insertBelow = (index: number) => {
    const row = rows[index];
    if (!row) return;

    const created: Row = { key: makeKey(), title: "", depth: row.depth, done: false };
    const next = [...rows.slice(0, index + 1), created, ...rows.slice(index + 1)];
    pendingFocus.current = created.key;
    // Une ligne vide ne change rien à ce qui est enregistré : inutile
    // d'appeler le serveur avant qu'elle porte du texte.
    setRows(next);
  };

  /**
   * Retour arrière sur une ligne vide.
   *
   * Une ligne indentée remonte d'abord d'un niveau, comme dans Notion : c'est
   * le geste attendu, et supprimer d'emblée ferait perdre une ligne qu'on
   * voulait seulement sortir de son parent.
   */
  const backspace = (index: number) => {
    const row = rows[index];
    if (!row || row.title.length > 0) return;

    if (row.depth === 1) {
      const next = [...rows];
      next[index] = { ...row, depth: 0 };
      apply(next, true);
      return;
    }

    if (rows.length === 1) return;

    const previous = rows[index - 1];
    const next = rows.filter((_, position) => position !== index);
    if (previous) pendingFocus.current = previous.key;
    apply(next, true);
  };

  const move = (index: number, direction: 1 | -1) => {
    const target = rows[index + direction];
    if (target) focus(target.key);
  };

  const indent = (index: number) => {
    if (!canIndent(rows, index)) return;
    const row = rows[index];
    if (!row) return;

    const next = [...rows];
    next[index] = { ...row, depth: 1 };
    apply(next, true);
  };

  const outdent = (index: number) => {
    const row = rows[index];
    if (!row || row.depth === 0) return;

    const next = [...rows];
    next[index] = { ...row, depth: 0 };
    apply(next, true);
  };

  const toggle = (index: number) => {
    const row = rows[index];
    if (!row?.id) return;

    const { key: toggled, id } = row;
    const done = !row.done;
    setRows((now) => withDone(now, toggled, done));

    updateTask.mutate(
      { listId: list.id, taskId: id, patch: { done } },
      {
        // Sans ce retour en arrière, une case cochée dont l'enregistrement
        // échoue le reste à l'écran : le rechargement ne la corrigerait pas
        // non plus, l'éditeur ayant déjà pris sa nouvelle valeur pour acquise.
        onError: () => setRows((now) => withDone(now, toggled, !done)),
      },
    );
  };

  const showInsert = (index: number | null) => {
    if (index === null) {
      setInsertBefore((current) => (current === null ? current : null));
      return;
    }
    const draftAt = rowsRef.current.findIndex((row) => row.key === "draft");
    const shown = draftAt >= 0 && index > draftAt ? draftAt : index;
    setInsertBefore((current) => (current === shown ? current : shown));
  };

  const dropRow = (sourceKey: string, index: number) => {
    const next = commitReorder(rowsRef.current, sourceKey, index);
    setInsertBefore(null);
    if (!next) return;
    apply(next, true);
  };

  const key = (event: KeyPressEvent, index: number) => {
    const pressed = event.nativeEvent.key;

    if (pressed === "Tab") {
      event.preventDefault();
      if (event.nativeEvent.shiftKey) outdent(index);
      else indent(index);
      return;
    }

    if (pressed === "Backspace") {
      backspace(index);
      return;
    }

    if (pressed === "ArrowUp" || pressed === "ArrowDown") {
      event.preventDefault();
      move(index, pressed === "ArrowUp" ? -1 : 1);
      return;
    }

    // Sur le web, la touche Entrée passe ici ; ailleurs, elle passe par
    // `onSubmitEditing`. La traiter des deux côtés créerait deux lignes.
    if (pressed === "Enter" && Platform.OS === "web") {
      event.preventDefault();
      insertBelow(index);
    }
  };

  return (
    <View className="gap-0.5">
      {rows.map((row, index) => (
        <EditorRow
          key={row.key}
          row={row}
          index={index}
          listId={list.id}
          listTitle={list.title}
          kind={list.kind}
          isLast={index === rows.length - 1}
          active={focusedKey === row.key}
          matched={titleMatchesQuery(row.title, query)}
          task={row.id ? list.tasks.find((candidate) => candidate.id === row.id) : undefined}
          canIndentRow={canIndent(rows, index)}
          insertBefore={insertBefore}
          placeholderColor={palette.textMuted}
          textColor={row.done ? palette.textMuted : palette.text}
          onToggle={() => toggle(index)}
          onEdit={(title) => edit(index, title)}
          onKeyPress={(event) => key(event, index)}
          onSubmit={() => {
            if (Platform.OS !== "web") insertBelow(index);
          }}
          onFocus={() => {
            if (leaving.current) clearTimeout(leaving.current);
            leaving.current = null;
            focused.current = true;
            setFocusedKey(row.key);
          }}
          onBlur={() => {
            if (dirty.current) flush(rows);
            // Entrée, Tabulation et les flèches font passer le focus d'une
            // ligne à l'autre : entre les deux, l'éditeur est brièvement
            // sans curseur. S'en remettre au blur seul rouvrirait cette
            // fenêtre-là au rechargement, qui reprendrait la ligne en cours.
            if (leaving.current) clearTimeout(leaving.current);
            leaving.current = setTimeout(() => {
              leaving.current = null;
              focused.current = false;
              setFocusedKey(null);
            }, 0);
          }}
          onOutdent={() => outdent(index)}
          onIndent={() => indent(index)}
          onOpenTask={onOpenTask}
          registerInput={(instance) => {
            if (instance) inputs.current.set(row.key, instance);
            else inputs.current.delete(row.key);
          }}
          resolveDrop={(sourceKey, targetIndex, place) =>
            taskDropIndex(rowsRef.current, sourceKey, targetIndex, place)
          }
          onHover={showInsert}
          onDrop={dropRow}
        />
      ))}

      {failed ? (
        <Text className="text-destructive text-xs">
          La liste n'a pas pu être enregistrée. Elle repartira à la prochaine modification.
        </Text>
      ) : null}
    </View>
  );
});

/**
 * Identifiants des lignes neuves, dans l'ordre où l'éditeur les a écrites.
 *
 * Le serveur rend toute la charge, y compris les tâches d'un autre jour qui
 * encadrent celles-ci : on ne peut pas apparier par simple index de l'éditeur.
 * Les lignes neuves sont celles parties sans identifiant, et elles reviennent
 * dans le même ordre.
 */
function newIdsByKey(
  sent: { id?: string }[],
  returned: Task[],
  written: Row[],
): Map<string, string> {
  const created: string[] = [];
  sent.forEach((item, index) => {
    const task = returned[index];
    if (item.id === undefined && task) created.push(task.id);
  });

  const assigned = new Map<string, string>();
  let cursor = 0;
  for (const row of written) {
    if (row.id) continue;
    const id = created[cursor];
    cursor += 1;
    if (id) assigned.set(row.key, id);
  }
  return assigned;
}

function adopt(rows: Row[], assigned: Map<string, string>): Row[] {
  let changed = false;
  const next = rows.map((row) => {
    const id = assigned.get(row.key);
    // Jamais sur une ligne vide : la ligne vierge du bas porte toujours la clé
    // `draft`, et un réamorçage pendant l'aller-retour lui ferait adopter
    // l'identifiant de celle qui l'a précédée — donc écraser une autre tâche à
    // la frappe suivante.
    if (id === undefined || row.id === id || row.title.trim().length === 0) return row;
    changed = true;
    return { ...row, id };
  });

  // Rendre le tableau inchangé plutôt qu'une copie : une sauvegarde qui
  // n'attribue aucun identifiant ne doit pas redessiner les champs de saisie
  // sous le curseur de qui est en train d'écrire.
  return changed ? next : rows;
}

/**
 * Une ligne déjà enregistrée est-elle momentanément vide ?
 *
 * C'est le signe qu'on la réécrit, pas qu'on la supprime : la suppression se
 * demande par Retour arrière.
 */
function isBeingRewritten(rows: Row[]): boolean {
  return rows.some((row) => row.id !== undefined && row.title.trim().length === 0);
}

/** Complétion d'une ligne, désignée par sa clé — l'index bouge, pas elle. */
function withDone(rows: Row[], key: string, done: boolean): Row[] {
  return rows.map((row) => (row.key === key ? { ...row, done } : row));
}

function EditorRow({
  row,
  index,
  listId,
  listTitle,
  kind,
  isLast,
  active,
  matched,
  task,
  canIndentRow,
  insertBefore,
  placeholderColor,
  textColor,
  onToggle,
  onEdit,
  onKeyPress,
  onSubmit,
  onFocus,
  onBlur,
  onOutdent,
  onIndent,
  onOpenTask,
  registerInput,
  resolveDrop,
  onHover,
  onDrop,
}: {
  row: Row;
  index: number;
  listId: string;
  listTitle: string;
  kind: TaskListWithTasks["kind"];
  isLast: boolean;
  active: boolean;
  matched: boolean;
  task: Task | undefined;
  canIndentRow: boolean;
  insertBefore: number | null;
  placeholderColor: string;
  textColor: string;
  onToggle: () => void;
  onEdit: (title: string) => void;
  onKeyPress: (event: KeyPressEvent) => void;
  onSubmit: () => void;
  onFocus: () => void;
  onBlur: () => void;
  onOutdent: () => void;
  onIndent: () => void;
  onOpenTask: (task: Task) => void;
  registerInput: (instance: TextInput | null) => void;
  resolveDrop: (
    sourceKey: string,
    targetIndex: number,
    place: "before" | "after",
  ) => number | null;
  onHover: (insertBefore: number | null) => void;
  onDrop: (sourceKey: string, insertBefore: number) => void;
}) {
  const draggable =
    Platform.OS === "web" &&
    row.key !== "draft" &&
    (row.id !== undefined || row.title.trim().length > 0);
  const { rowRef, gripRef } = useTaskRowDrag(listId, row.key, draggable, {
    rowIndex: index,
    resolveDrop,
    onHover,
    onDrop,
  });

  const marked = insertBefore === index;

  return (
    <View
      ref={rowRef}
      style={{ paddingLeft: row.depth * TASK_INDENT, minHeight: TASK_ROW_HEIGHT }}
      className={`relative flex-row items-center gap-2 rounded-md ${matched ? "bg-accent-soft" : ""}`}
    >
      {marked ? <View className="bg-primary absolute inset-x-0 top-0 h-0.5" /> : null}
      {Platform.OS === "web" ? (
        draggable ? (
          <View
            ref={gripRef}
            accessibilityLabel={`Déplacer ${row.title || "cette ligne"}`}
            style={{ minWidth: TASK_ROW_HEIGHT / 2, minHeight: TASK_ROW_HEIGHT }}
            className="items-center justify-center"
          >
            <Icon as={GripVertical} size={14} className="text-muted-foreground" />
          </View>
        ) : (
          // Même largeur que la poignée : la ligne vierge du bas reste alignée
          // sur le texte des tâches, elle n'a simplement rien à déplacer.
          <View style={{ width: TASK_ROW_HEIGHT / 2 }} />
        )
      ) : null}

      <Pressable
        onPress={onToggle}
        disabled={!row.id}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: row.done, disabled: !row.id }}
        accessibilityLabel={row.done ? `Décocher ${row.title}` : `Cocher ${row.title}`}
        hitSlop={8}
        style={{ minWidth: TASK_ROW_HEIGHT / 2, minHeight: TASK_ROW_HEIGHT }}
        className="items-center justify-center"
      >
        <View
          style={{ width: TASK_CHECKBOX_SIZE, height: TASK_CHECKBOX_SIZE }}
          className={`items-center justify-center rounded border ${
            row.done ? "border-primary bg-primary" : "border-border"
          } ${row.id ? "" : "opacity-40"}`}
        >
          {row.done ? <Icon as={Check} size={11} className="text-primary-foreground" /> : null}
        </View>
      </Pressable>

      <TextInput
        ref={registerInput}
        value={row.title}
        onChangeText={onEdit}
        onKeyPress={onKeyPress}
        onSubmitEditing={onSubmit}
        submitBehavior="submit"
        onFocus={onFocus}
        onBlur={onBlur}
        placeholder={isLast ? placeholder(kind) : ""}
        placeholderTextColor={placeholderColor}
        accessibilityLabel={`Ligne ${index + 1} de ${listTitle}`}
        style={{
          fontFamily: FONT_FAMILY,
          color: textColor,
          textDecorationLine: row.done ? "line-through" : "none",
        }}
        className={cn("flex-1 text-sm", Platform.select({ web: "outline-none" }))}
      />

      {/* Le jour d'une tâche datée reste lisible sur sa ligne, comme dans
          Things 3 et Todoist ; il se change depuis le détail. */}
      {task?.dueOn ? (
        <Pressable
          onPress={() => onOpenTask(task)}
          accessibilityRole="button"
          accessibilityLabel={`${row.title} est due ${formatFullDay(
            dateOfCalendarDay(task.dueOn),
          )}. Modifier l'échéance`}
          hitSlop={8}
          style={{ minHeight: TASK_ROW_HEIGHT }}
          className="justify-center"
        >
          <Text className="text-muted-foreground text-xs">
            {formatDayLabel(dateOfCalendarDay(task.dueOn))}
          </Text>
        </Pressable>
      ) : null}

      {/* Les commandes de retrait ne s'affichent que sur la ligne active :
          à demeure, elles doubleraient la hauteur de chaque rangée et
          feraient de la liste un formulaire. */}
      {active ? (
        <View className="flex-row items-center">
          <RowButton
            icon={ChevronsLeft}
            label={`Sortir ${row.title || "cette ligne"} de son parent`}
            disabled={row.depth === 0}
            onPress={onOutdent}
          />
          <RowButton
            icon={ChevronsRight}
            label={`Ranger ${row.title || "cette ligne"} sous la précédente`}
            disabled={!canIndentRow}
            onPress={onIndent}
          />
          <RowButton
            icon={NotebookPen}
            label={`Ouvrir le détail de ${row.title || "cette ligne"}`}
            disabled={!task}
            onPress={() => {
              if (task) onOpenTask(task);
            }}
          />
        </View>
      ) : null}
    </View>
  );
}

/**
 * La ligne vierge du bas reste la dernière : c'est elle qui fait de la liste
 * une zone de texte. Un dépôt « après » elle ne doit pas la remonter.
 */
function commitReorder(rows: Row[], sourceKey: string, insertBefore: number): Row[] | null {
  const moved = reorderTaskRows(rows, sourceKey, insertBefore);
  if (!moved) return null;

  const draftIndex = moved.findIndex((row) => row.key === "draft");
  const draft = draftIndex >= 0 ? moved[draftIndex] : undefined;
  const pinned =
    draft && draftIndex !== moved.length - 1
      ? [...moved.filter((row) => row.key !== "draft"), draft]
      : moved;

  if (pinned.every((row, index) => row.key === rows[index]?.key)) return null;
  return pinned;
}

function RowButton({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: React.ComponentProps<typeof Icon>["as"];
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      className={`size-8 items-center justify-center rounded-md ${disabled ? "opacity-30" : ""}`}
    >
      <Icon as={icon} size={14} className="text-muted-foreground" />
    </Pressable>
  );
}

/**
 * Événement clavier tel que le web le transmet.
 *
 * `shiftKey` n'est pas dans le type de React Native — aucune plateforme mobile
 * ne l'émet — mais react-native-web le fait suivre, et c'est ce qui distingue
 * Tabulation de Maj+Tabulation.
 */
type KeyPressEvent = NativeSyntheticEvent<TextInputKeyPressEventData & { shiftKey?: boolean }>;

/**
 * Une ligne peut-elle descendre d'un niveau ?
 *
 * Non si elle est en tête — il n'y a personne au-dessus pour l'accueillir — et
 * non si elle porte déjà des sous-tâches : la todoliste s'arrête à deux niveaux
 * (§4.2), et indenter un parent en créerait un troisième.
 */
function canIndent(rows: Row[], index: number): boolean {
  const row = rows[index];
  if (!row || index === 0 || row.depth === 1) return false;
  return rows[index + 1]?.depth !== 1;
}

/**
 * Lignes de départ : celles du serveur, plus une ligne vierge au bout.
 *
 * La ligne vierge est ce qui fait de la liste une zone de texte — il y a
 * toujours où écrire, sans avoir à viser un bouton d'ajout.
 */
/**
 * Réinsère les lignes éditées dans la liste entière.
 *
 * La vue d'un jour ne montre parfois que les tâches dues ce jour-là. Les
 * envoyer seules ferait supprimer les autres : le serveur prend la charge
 * pour le contenu complet. Elles reprennent la place du premier bloc visible,
 * les tâches d'un autre jour restent où elles étaient.
 */
type ListedItem = { id?: string; title: string; depth: 0 | 1; dueOn?: string };

function mergeVisibleItems(
  tasks: Task[],
  visibleIds: ReadonlySet<string>,
  edited: ListedItem[],
): { items: ListedItem[] } {
  // Les lignes neuves passent en fin de liste : les glisser au milieu
  // d'une famille que ce jour ne montre pas leur donnerait un autre parent,
  // le serveur lisant la filiation dans l'ordre des profondeurs.
  const fresh = edited.filter((item) => item.id === undefined);
  const kept = edited.filter((item) => item.id !== undefined);
  const items: ListedItem[] = [];
  let inserted = false;

  for (const task of tasks) {
    if (!visibleIds.has(task.id)) {
      items.push({
        id: task.id,
        title: task.title,
        depth: task.parentId === null ? 0 : 1,
      });
      continue;
    }
    if (!inserted) {
      items.push(...kept);
      inserted = true;
    }
  }

  if (!inserted) items.push(...kept);
  items.push(...fresh);

  return { items };
}

function seed(list: TaskListWithTasks, visibleTaskIds: readonly string[] | undefined): Row[] {
  const allowed = visibleTaskIds === undefined ? null : new Set(visibleTaskIds);
  const tasks = allowed === null ? list.tasks : list.tasks.filter((task) => allowed.has(task.id));
  const rows: Row[] = tasks.map((task) => ({
    key: task.id,
    id: task.id,
    title: task.title,
    depth: task.parentId === null ? 0 : 1,
    done: task.done,
  }));

  return [...rows, { key: "draft", title: "", depth: 0, done: false }];
}

/**
 * Ce que l'éditeur compare pour ne pas réécrire une liste inchangée.
 *
 * L'identifiant y figure : deux lignes au même texte restent distinctes, et
 * les échanger doit partir au serveur. Même forme que `payloadSignature`.
 */
function contentSignature(tasks: Task[]): string {
  return tasks
    .map((task) => `${task.id}#${task.title}#${task.parentId === null ? 0 : 1}`)
    .join("|");
}

/**
 * Même forme que `contentSignature`, pour les lignes pas encore enregistrées.
 *
 * L'identifiant entre dans la signature : deux tâches au même texte restent
 * distinctes, et les échanger doit bien partir au serveur.
 */
function payloadSignature(items: { id?: string; title: string; depth: number }[]): string {
  return items.map((item) => `${item.id ?? ""}#${item.title}#${item.depth}`).join("|");
}

/**
 * Ce que porte la liste côté serveur, complétion comprise.
 *
 * La complétion entre ici mais pas dans `contentSignature` : l'éditeur ne
 * l'envoie pas, mais elle change bien ce qu'il doit afficher. Sans elle, une
 * tâche cochée ailleurs — depuis le calendrier, ou sur un autre appareil —
 * restait affichée dans son état d'avant, l'éditeur ne voyant aucune raison de
 * se resynchroniser.
 */
function stateSignature(tasks: Task[]): string {
  return tasks
    .map(
      (task) =>
        `${task.id}#${task.title}#${task.parentId === null ? 0 : 1}#${task.done ? 1 : 0}`,
    )
    .join("|");
}

function placeholder(kind: TaskListWithTasks["kind"]): string {
  return kind === "shopping" ? "Ajouter un achat" : "Ajouter une tâche";
}
