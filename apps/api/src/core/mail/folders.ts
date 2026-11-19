import type { MailFolder } from "@jc/domain";
import { INBOX_PATH } from "@jc/domain";

/** Dossier tel que le serveur de courrier le décrit. */
export type RawFolder = {
  path: string;
  name: string;
  /** Rôle annoncé par le serveur (`\\Sent`, `\\Trash`…), quelle que soit la langue du nom. */
  specialUse?: string | undefined;
  /** Séparateur de niveaux dans `path` (`/` ou `.`), absent d'un serveur à plat. */
  delimiter?: string | undefined;
  /** Faux pour un simple conteneur de sous-dossiers, qu'on ne peut pas ouvrir. */
  selectable: boolean;
};

/**
 * Noms français et ordre des dossiers usuels.
 *
 * Le rôle vient du serveur, pas du nom : un dossier « Sent Items » ou
 * « Éléments envoyés » doit s'afficher « Envoyés » de la même façon, c'est ce
 * qui rend la liste identique d'une boîte à l'autre.
 */
const KNOWN: ReadonlyArray<{ use: string; label: string }> = [
  { use: "\\Inbox", label: "Boîte de réception" },
  { use: "\\Drafts", label: "Brouillons" },
  { use: "\\Sent", label: "Envoyés" },
  { use: "\\Archive", label: "Archives" },
  { use: "\\Junk", label: "Courrier indésirable" },
  { use: "\\Trash", label: "Corbeille" },
];

function roleOf(folder: RawFolder): string | undefined {
  if (folder.path.toUpperCase() === INBOX_PATH) return "\\Inbox";
  return folder.specialUse;
}

/**
 * Niveau d'emboîtement. Les dossiers usuels sont à la racine, et ce qui est
 * rangé sous la boîte de réception (`INBOX.Banque`) y est compté depuis elle :
 * c'est ainsi qu'une messagerie classique les montre.
 */
function depthOf(folder: RawFolder, known: boolean): number {
  const { delimiter } = folder;
  if (known || !delimiter) return 0;

  const inboxPrefix = `${INBOX_PATH}${delimiter}`;
  const relative = folder.path.toUpperCase().startsWith(inboxPrefix)
    ? folder.path.slice(inboxPrefix.length)
    : folder.path;
  return relative.split(delimiter).length - 1;
}

/**
 * Dossiers à montrer : ceux qu'on peut ouvrir, les usuels d'abord (boîte de
 * réception en tête), puis les autres par ordre alphabétique.
 */
export function presentFolders(raw: readonly RawFolder[]): MailFolder[] {
  const entries = raw
    .filter((folder) => folder.selectable)
    .map((folder) => {
      const rank = KNOWN.findIndex((known) => known.use === roleOf(folder));
      return { folder, rank };
    });

  entries.sort((a, b) => {
    const rankA = a.rank === -1 ? KNOWN.length : a.rank;
    const rankB = b.rank === -1 ? KNOWN.length : b.rank;
    return rankA - rankB || a.folder.path.localeCompare(b.folder.path, "fr");
  });

  return entries.map(({ folder, rank }) => ({
    path: folder.path,
    name: KNOWN[rank]?.label ?? folder.name,
    depth: depthOf(folder, rank !== -1),
  }));
}
