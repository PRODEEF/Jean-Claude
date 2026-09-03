import { useCallback, useEffect, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  TextInput,
  View,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData,
} from "react-native";
import { Check, ChevronsLeft, ChevronsRight, NotebookPen } from "lucide-react-native";
import type { Task, TaskListWithTasks } from "@jc/domain";
import { MIN_TOUCH_TARGET } from "@jc/design";
import { FONT_FAMILY } from "@/shared/lib/fonts";
import { cn } from "@/shared/lib/utils";
import { titleMatchesQuery } from "@/shared/lib/tasks";
import { useTaskActions } from "@/shared/hooks/use-task-lists";
import { Icon } from "@/shared/ui/icon";
import { Text } from "@/shared/ui/text";
import { useTheme } from "@/shared/providers/theme-provider";

/** Retrait d'un niveau, en points. Assez pour se lire, assez peu pour tenir sur un téléphone. */
const INDENT = 22;

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
  /** Ouvre le détail d'une tâche — ses notes. */
  onOpenTask: (task: Task) => void;
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
 */
export function TaskListEditor({ list, query, onOpenTask }: TaskListEditorProps) {
  const { palette } = useTheme();
  const { replaceTasks, updateTask } = useTaskActions();

  const [rows, setRows] = useState<Row[]>(() => seed(list));
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const inputs = useRef(new Map<string, TextInput>());
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
  const saved = useRef(signature(list.tasks));
  /** Dernier état du serveur déjà repris dans l'éditeur. */
  const seeded = useRef(signature(list.tasks));

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

      const items = current
        .filter((row) => row.title.trim().length > 0)
        .map((row) => ({
          ...(row.id ? { id: row.id } : {}),
          title: row.title.trim(),
          depth: row.depth,
        }));

      const sent = items.map((item) => `${item.title}#${item.depth}`).join("|");
      if (sent === saved.current) {
        dirty.current = false;
        return;
      }

      dirty.current = false;
      replaceTasks.mutate(
        { listId: list.id, input: { items } },
        {
          onSuccess: (tasks) => {
            saved.current = sent;
            seeded.current = sent;
            setFailed(false);
            // L'identité du tableau dit si l'utilisateur a écrit entre-temps :
            // dans ce cas les lignes ont bougé et l'ordre rendu ne leur
            // correspond plus.
            setRows((now) => (now === current ? adopt(current, tasks) : now));
          },
          onError: () => {
            dirty.current = true;
            setFailed(true);
          },
        },
      );
    },
    [list.id, replaceTasks],
  );

  // Les frappes sont regroupées : une sauvegarde par pause, pas une par
  // caractère. Les gestes de structure, eux, partent tout de suite — ce sont
  // eux qui donnent son identifiant à une ligne neuve.
  const apply = (next: Row[], immediate: boolean) => {
    setRows(next);
    dirty.current = true;

    if (timer.current) clearTimeout(timer.current);
    if (immediate) flush(next);
    else timer.current = setTimeout(() => flush(next), AUTOSAVE_DELAY);
  };

  // Rien n'est réécrit tant que l'utilisateur tape ou garde le curseur dans la
  // liste : le rechargement qui suit une sauvegarde lui reprendrait sa ligne
  // en cours de route.
  const serverSignature = signature(list.tasks);
  useEffect(() => {
    if (dirty.current || focused.current || seeded.current === serverSignature) return;
    seeded.current = serverSignature;
    saved.current = serverSignature;
    setRows(seed(list));
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

    const next = [...rows];
    next[index] = { ...row, done: !row.done };
    setRows(next);
    updateTask.mutate({ listId: list.id, taskId: row.id, patch: { done: !row.done } });
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
      {rows.map((row, index) => {
        const active = focusedKey === row.key;
        const matched = titleMatchesQuery(row.title, query);
        const task = row.id ? list.tasks.find((candidate) => candidate.id === row.id) : undefined;

        return (
          <View
            key={row.key}
            style={{ paddingLeft: row.depth * INDENT, minHeight: MIN_TOUCH_TARGET }}
            className={`flex-row items-center gap-2 rounded-md ${matched ? "bg-accent-soft" : ""}`}
          >
            <Pressable
              onPress={() => toggle(index)}
              disabled={!row.id}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: row.done, disabled: !row.id }}
              accessibilityLabel={row.done ? `Décocher ${row.title}` : `Cocher ${row.title}`}
              hitSlop={8}
              style={{ minWidth: MIN_TOUCH_TARGET / 2, minHeight: MIN_TOUCH_TARGET }}
              className="items-center justify-center"
            >
              <View
                className={`size-5 items-center justify-center rounded border ${
                  row.done ? "border-primary bg-primary" : "border-border"
                } ${row.id ? "" : "opacity-40"}`}
              >
                {row.done ? (
                  <Icon as={Check} size={14} className="text-primary-foreground" />
                ) : null}
              </View>
            </Pressable>

            <TextInput
              ref={(instance) => {
                if (instance) inputs.current.set(row.key, instance);
                else inputs.current.delete(row.key);
              }}
              value={row.title}
              onChangeText={(text) => edit(index, text)}
              onKeyPress={(event: KeyPressEvent) => key(event, index)}
              onSubmitEditing={() => {
                if (Platform.OS !== "web") insertBelow(index);
              }}
              submitBehavior="submit"
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
              placeholder={index === rows.length - 1 ? placeholder(list.kind) : ""}
              placeholderTextColor={palette.textMuted}
              accessibilityLabel={`Ligne ${index + 1} de ${list.title}`}
              style={{
                fontFamily: FONT_FAMILY,
                color: row.done ? palette.textMuted : palette.text,
                textDecorationLine: row.done ? "line-through" : "none",
              }}
              className={cn("flex-1 text-sm", Platform.select({ web: "outline-none" }))}
            />

            {/* Les commandes de retrait ne s'affichent que sur la ligne active :
                à demeure, elles doubleraient la hauteur de chaque rangée et
                feraient de la liste un formulaire. */}
            {active ? (
              <View className="flex-row items-center">
                <RowButton
                  icon={ChevronsLeft}
                  label={`Sortir ${row.title || "cette ligne"} de son parent`}
                  disabled={row.depth === 0}
                  onPress={() => outdent(index)}
                />
                <RowButton
                  icon={ChevronsRight}
                  label={`Ranger ${row.title || "cette ligne"} sous la précédente`}
                  disabled={!canIndent(rows, index)}
                  onPress={() => indent(index)}
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
      })}

      {failed ? (
        <Text className="text-destructive text-xs">
          La liste n'a pas pu être enregistrée. Elle repartira à la prochaine modification.
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Identifiants rendus par le serveur, replacés sur les lignes qui les ont
 * produits.
 *
 * L'ordre suffit à les apparier : la charge utile a été construite en
 * parcourant les lignes non vides, et le serveur les rend triées par position.
 */
function adopt(rows: Row[], tasks: Task[]): Row[] {
  let index = 0;
  return rows.map((row) => {
    if (row.title.trim().length === 0) return row;
    const task = tasks[index++];
    return task ? { ...row, id: task.id } : row;
  });
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
function seed(list: TaskListWithTasks): Row[] {
  const rows: Row[] = list.tasks.map((task) => ({
    key: task.id,
    id: task.id,
    title: task.title,
    depth: task.parentId === null ? 0 : 1,
    done: task.done,
  }));

  return [...rows, { key: "draft", title: "", depth: 0, done: false }];
}

/** Ce que porte la liste côté serveur, à comparer à ce que l'éditeur tient. */
function signature(tasks: Task[]): string {
  return tasks.map((task) => `${task.title}#${task.parentId === null ? 0 : 1}`).join("|");
}

function placeholder(kind: TaskListWithTasks["kind"]): string {
  return kind === "shopping" ? "Ajouter un achat" : "Ajouter une tâche";
}
