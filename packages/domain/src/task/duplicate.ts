import { calendarDayOf } from "../planning/planning";
import type { CreateTaskList, ReplaceTasks, TaskListWithTasks } from "./task.schema";

/** Ce qu'il faut écrire pour dupliquer une liste : la liste, puis ses lignes. */
export type ListDuplicate = { list: CreateTaskList; items: ReplaceTasks["items"] };

/**
 * Copie d'une liste, posée au même endroit (demande de Yann, 24 novembre) :
 * même jour, même heure, même dossier, mêmes notes et même rappel.
 *
 * Deux choses ne suivent pas :
 * - **la répétition** — une copie est une liste ponctuelle ; dupliquer une
 *   série en créerait une seconde, qui doublerait chaque occurrence ;
 * - **ce qui est coché** — la copie repart de zéro, c'est ce qu'on duplique
 *   une liste pour refaire.
 *
 * Le jour d'une ligne (`dueOn`) n'est gardé que s'il n'est pas révolu : le
 * serveur refuse d'écrire une nouvelle ligne dans le passé.
 *
 * L'appelant passe la liste telle qu'affichée : pour une date d'une série,
 * c'est l'échéance de cette date qu'il met dans `dueAt`, pas celle du début de
 * la série.
 */
export function duplicateOfList(list: TaskListWithTasks, today: Date): ListDuplicate {
  const todayKey = calendarDayOf(today);
  const ordered = [...list.tasks].sort((a, b) => a.position - b.position);

  return {
    list: {
      title: list.title,
      kind: list.kind,
      folderId: list.folderId,
      dueAt: list.dueAt,
      ...(list.dueAt === null ? {} : { dueAllDay: list.dueAllDay ?? true }),
      endsAt: list.endsAt,
      reminderMinutesBefore: list.reminderMinutesBefore,
      notes: list.notes,
      location: list.location,
    },
    items: ordered.map((task) => ({
      title: task.title,
      depth: task.parentId === null ? 0 : 1,
      ...(task.dueOn && task.dueOn >= todayKey ? { dueOn: task.dueOn } : {}),
    })),
  };
}
