/**
 * Analyseur Markdown minimal.
 *
 * Les modèles répondent en Markdown : titres, listes, gras, liens, tableaux.
 * Affiché tel quel, le texte se lit criblé d'astérisques et de barres
 * verticales.
 *
 * Écrit ici plutôt qu'emprunté à une bibliothèque : les portages React Native
 * existants sont soit abandonnés depuis React 16, soit sans tableaux — que le
 * modèle produit spontanément. Le périmètre est donc borné à ce qu'un modèle
 * émet réellement dans une réponse de conversation ; le reste (notes de bas de
 * page, HTML brut, images) est rendu en texte, jamais perdu.
 *
 * Analyseur pur : aucune dépendance à React, donc lisible et vérifiable seul.
 */

export type InlineNode =
  | { type: "text"; value: string }
  | { type: "strong"; children: InlineNode[] }
  | { type: "emphasis"; children: InlineNode[] }
  | { type: "strike"; children: InlineNode[] }
  | { type: "code"; value: string }
  | { type: "link"; href: string; children: InlineNode[] };

export type ListItem = {
  content: InlineNode[];
  /** Liste imbriquée sous cet élément, le cas échéant. */
  children: MarkdownBlock[];
};

export type MarkdownBlock =
  | { type: "paragraph"; content: InlineNode[] }
  | { type: "heading"; level: number; content: InlineNode[] }
  | { type: "list"; ordered: boolean; items: ListItem[] }
  | { type: "codeBlock"; value: string }
  | { type: "quote"; blocks: MarkdownBlock[] }
  | { type: "table"; header: InlineNode[][]; rows: InlineNode[][][] }
  | { type: "rule" };

const HEADING = /^ {0,3}(#{1,6})\s+(.*)$/;
const RULE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const BULLET = /^(\s*)[-*+][ \t]+(.*)$/;
const ORDERED = /^(\s*)\d+[.)][ \t]+(.*)$/;
const QUOTE = /^ {0,3}>[ \t]?(.*)$/;
const FENCE = /^ {0,3}```/;

/** Découpe une source Markdown en blocs. */
export function parseMarkdown(source: string): MarkdownBlock[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";

    if (line.trim().length === 0) {
      index += 1;
      continue;
    }

    if (FENCE.test(line)) {
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !FENCE.test(lines[index] ?? "")) {
        body.push(lines[index] ?? "");
        index += 1;
      }
      // Une clôture manquante ne doit pas faire perdre le contenu : la fin de
      // la réponse ferme le bloc. Le cas se produit à chaque jeton reçu en
      // flux, tant que le modèle n'a pas fini d'écrire.
      index += 1;
      blocks.push({ type: "codeBlock", value: body.join("\n") });
      continue;
    }

    if (RULE.test(line)) {
      blocks.push({ type: "rule" });
      index += 1;
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({
        type: "heading",
        level: (heading[1] ?? "#").length,
        content: parseInline(stripTrailingHashes(heading[2] ?? "")),
      });
      index += 1;
      continue;
    }

    if (QUOTE.test(line)) {
      const body: string[] = [];
      while (index < lines.length) {
        const quoted = QUOTE.exec(lines[index] ?? "");
        if (!quoted) break;
        body.push(quoted[1] ?? "");
        index += 1;
      }
      blocks.push({ type: "quote", blocks: parseMarkdown(body.join("\n")) });
      continue;
    }

    const table = readTable(lines, index);
    if (table) {
      blocks.push(table.block);
      index = table.next;
      continue;
    }

    if (BULLET.test(line) || ORDERED.test(line)) {
      const list = readList(lines, index);
      blocks.push(list.block);
      index = list.next;
      continue;
    }

    // Paragraphe : les lignes s'accumulent jusqu'à la première ligne vide ou
    // le premier début d'un autre bloc.
    //
    // La ligne courante est prise d'office, avant même le test. C'est ce qui
    // garantit que la boucle avance toujours : une ligne que `startsBlock`
    // reconnaît sans qu'aucune branche ne sache la consommer — un « | » isolé,
    // sans ligne de séparation dessous, donc pas un tableau — serait sinon
    // relue indéfiniment, et le rendu n'afficherait plus rien du tout.
    const paragraph: string[] = [line.trim()];
    index += 1;

    while (index < lines.length) {
      const current = lines[index] ?? "";
      if (current.trim().length === 0 || startsBlock(current)) break;
      paragraph.push(current.trim());
      index += 1;
    }
    blocks.push({ type: "paragraph", content: parseInline(paragraph.join(" ")) });
  }

  return blocks;
}

function startsBlock(line: string): boolean {
  return (
    FENCE.test(line) ||
    RULE.test(line) ||
    HEADING.test(line) ||
    QUOTE.test(line) ||
    BULLET.test(line) ||
    ORDERED.test(line) ||
    isTableRow(line)
  );
}

/** `## Titre ##` — la seconde série de dièses est décorative. */
function stripTrailingHashes(text: string): string {
  return text.replace(/\s*#+\s*$/, "").trim();
}

/**
 * Lit une liste et ses imbrications.
 *
 * Le niveau se déduit de l'indentation : un élément plus rentré que le
 * précédent ouvre une sous-liste, un élément moins rentré la referme. C'est le
 * seul indice dont on dispose, le modèle n'émettant pas de balises.
 */
function readList(lines: string[], start: number): { block: MarkdownBlock; next: number } {
  const first = lines[start] ?? "";
  const ordered = ORDERED.test(first) && !BULLET.test(first);
  const baseIndent = indentOf(first);

  const items: ListItem[] = [];
  let index = start;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (line.trim().length === 0) {
      // Une ligne vide n'interrompt la liste que si la suivante n'en fait pas
      // partie : les modèles aèrent volontiers leurs listes.
      const following = lines[index + 1] ?? "";
      if (!BULLET.test(following) && !ORDERED.test(following)) break;
      index += 1;
      continue;
    }

    const match = BULLET.exec(line) ?? ORDERED.exec(line);
    if (!match) break;

    const indent = indentOf(line);
    if (indent < baseIndent) break;

    if (indent > baseIndent) {
      const nested = readList(lines, index);
      const parent = items[items.length - 1];
      if (parent) parent.children.push(nested.block);
      else items.push({ content: [], children: [nested.block] });
      index = nested.next;
      continue;
    }

    items.push({ content: parseInline(match[2] ?? ""), children: [] });
    index += 1;
  }

  return { block: { type: "list", ordered, items }, next: index };
}

function indentOf(line: string): number {
  const match = /^\s*/.exec(line);
  // La tabulation vaut 4 colonnes, comme dans CommonMark.
  return (match?.[0] ?? "").replace(/\t/g, "    ").length;
}

function isTableRow(line: string): boolean {
  return line.trim().startsWith("|") && line.includes("|", line.indexOf("|") + 1);
}

/** Une ligne de séparation : `|---|:--:|` et ses variantes d'alignement. */
function isTableDelimiter(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.includes("-") && trimmed.includes("|") && /^[|\-:\s]+$/.test(trimmed);
}

function readTable(
  lines: string[],
  start: number,
): { block: MarkdownBlock; next: number } | null {
  const header = lines[start] ?? "";
  const delimiter = lines[start + 1] ?? "";
  if (!isTableRow(header) || !isTableDelimiter(delimiter)) return null;

  const rows: InlineNode[][][] = [];
  let index = start + 2;
  while (index < lines.length && isTableRow(lines[index] ?? "")) {
    rows.push(splitRow(lines[index] ?? ""));
    index += 1;
  }

  return { block: { type: "table", header: splitRow(header), rows }, next: index };
}

function splitRow(line: string): InlineNode[][] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => parseInline(cell.trim()));
}

const INLINE =
  /(`[^`]+`)|(\*\*[^*]+\*\*)|(__[^_]+__)|(~~[^~]+~~)|(\*[^*\n]+\*)|(_[^_\n]+_)|(\[[^\]]*\]\([^)\s]+\))/;

/**
 * Découpe une ligne en fragments stylés.
 *
 * Le code entre accents graves est reconnu en premier : à l'intérieur, les
 * astérisques sont du texte, pas du gras.
 */
export function parseInline(source: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  let rest = source;

  while (rest.length > 0) {
    const match = INLINE.exec(rest);
    if (!match || match.index === undefined) break;

    if (match.index > 0) nodes.push({ type: "text", value: rest.slice(0, match.index) });
    const token = match[0];

    if (token.startsWith("`")) {
      nodes.push({ type: "code", value: token.slice(1, -1) });
    } else if (token.startsWith("**") || token.startsWith("__")) {
      nodes.push({ type: "strong", children: parseInline(token.slice(2, -2)) });
    } else if (token.startsWith("~~")) {
      nodes.push({ type: "strike", children: parseInline(token.slice(2, -2)) });
    } else if (token.startsWith("[")) {
      const separator = token.indexOf("](");
      nodes.push({
        type: "link",
        href: token.slice(separator + 2, -1),
        children: parseInline(token.slice(1, separator)),
      });
    } else {
      nodes.push({ type: "emphasis", children: parseInline(token.slice(1, -1)) });
    }

    rest = rest.slice(match.index + token.length);
  }

  if (rest.length > 0) nodes.push({ type: "text", value: rest });
  return nodes;
}
