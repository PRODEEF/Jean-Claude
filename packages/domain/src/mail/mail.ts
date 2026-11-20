/**
 * Pastille ronde d'un expéditeur : ses initiales, et une couleur qui lui reste
 * propre d'un mail à l'autre. Une règle de produit, donc ici et non dans un
 * écran — le web, iOS et Android doivent montrer la même pastille.
 */

/** Une ou deux lettres : « Grégoire Rouquette » → « GR », « vercel[bot] » → « V ». */
export function initialsOf(sender: string): string {
  const first = sender.split(",")[0] ?? "";
  const words = first
    .replace(/<[^>]*>/g, " ")
    .split(/[\s.@_-]+/)
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter((word) => word.length > 0);

  const letters = words.slice(0, 2).map((word) => Array.from(word)[0] ?? "");
  return letters.join("").toLocaleUpperCase("fr") || "?";
}

/** Indice stable dans une liste de `count` couleurs : le même expéditeur, la même teinte. */
export function colorIndexOf(sender: string, count: number): number {
  if (count <= 0) return 0;

  const key = (sender.split(",")[0] ?? "").trim().toLowerCase();
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
  return hash % count;
}

/** Un paquet de mails sous un même repère de date (« Aujourd'hui », « Hier »…). */
export type MailDateGroup<T> = { label: string; items: T[] };

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/**
 * Range des mails déjà classés du plus récent au plus ancien sous des repères
 * de date, comme Outlook : Aujourd'hui, Hier, Cette semaine, Plus ancien.
 *
 * Un mail sans date va dans « Date inconnue », à la fin ; un mail daté d'après
 * l'instant (horloge de l'expéditeur en avance) compte pour aujourd'hui. Les
 * paquets vides n'existent pas, et l'ordre reçu est gardé à l'intérieur de
 * chacun.
 */
export function groupByDay<T extends { date: string | null }>(
  items: readonly T[],
  now: Date = new Date(),
): MailDateGroup<T>[] {
  const today = startOfDay(now);
  // La semaine commence le lundi, comme le reste du calendrier.
  const weekStart = today - ((now.getDay() + 6) % 7) * DAY_MS;

  const groups = new Map<string, T[]>();
  const push = (label: string, item: T) => {
    const group = groups.get(label);
    if (group) group.push(item);
    else groups.set(label, [item]);
  };

  for (const item of items) {
    if (item.date === null) {
      push("Date inconnue", item);
      continue;
    }
    const day = startOfDay(new Date(item.date));
    if (day >= today) push("Aujourd'hui", item);
    else if (day >= today - DAY_MS) push("Hier", item);
    else if (day >= weekStart) push("Cette semaine", item);
    else push("Plus ancien", item);
  }

  const order = ["Aujourd'hui", "Hier", "Cette semaine", "Plus ancien", "Date inconnue"];
  return order.flatMap((label) => {
    const group = groups.get(label);
    return group ? [{ label, items: group }] : [];
  });
}
