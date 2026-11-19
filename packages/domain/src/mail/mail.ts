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
