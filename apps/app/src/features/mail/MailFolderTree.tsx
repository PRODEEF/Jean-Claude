import { Pressable, ScrollView, View } from "react-native";
import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  Inbox,
  Mails,
  PenSquare,
  Plus,
} from "lucide-react-native";
import type { MailAccount, MailFolder } from "@jc/domain";
import { INBOX_PATH } from "@jc/domain";
import { MIN_TOUCH_TARGET } from "@jc/design";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { Text } from "@/shared/ui/text";
import { useCollapsed } from "./use-collapsed";
import { useMailFolders } from "./use-mail";

/** Ce que la liste de droite montre : tout, ou un dossier d'une boîte. */
export type MailView = { kind: "all" } | { kind: "folder"; accountId: string; folder: string };

/** Identifiant d'une ligne repliable : la boîte, ou un dossier de cette boîte. */
const accountKey = (accountId: string) => `account:${accountId}`;
const folderKey = (accountId: string, path: string) => `${accountId}:${path}`;

/**
 * Arbre de gauche : « Tous les comptes », puis chaque boîte avec ses dossiers.
 *
 * Chaque boîte et chaque dossier qui a des sous-dossiers porte un chevron pour
 * se replier, comme dans Outlook (demande de Yann, 20 novembre).
 */
export function MailFolderTree({
  accounts,
  view,
  allUnseen,
  onSelect,
  onSettings,
  onCompose,
}: {
  accounts: MailAccount[];
  view: MailView;
  /** Non lus des boîtes de réception, toutes boîtes comprises. */
  allUnseen: number;
  onSelect: (view: MailView) => void;
  onSettings: () => void;
  onCompose: () => void;
}) {
  const [collapsed, toggle] = useCollapsed();

  return (
    <View className="flex-1">
      {/* Hors du défilement : la barre de défilement, quand elle apparaît, ne
          doit pas rétrécir ni décaler « Nouveau message » et « Tous les
          comptes » (retour de Yann, 25 novembre). */}
      <View className="gap-0.5 px-2 pt-2">
        <Button
          className="mb-2"
          onPress={onCompose}
          accessibilityRole="button"
          accessibilityLabel="Nouveau message"
        >
          <Icon as={PenSquare} className="size-4" />
          <Text>Nouveau message</Text>
        </Button>

        {accounts.length > 1 ? (
          <TreeRow
            label="Tous les comptes"
            icon={Inbox}
            unseen={allUnseen}
            active={view.kind === "all"}
            depth={0}
            onPress={() => onSelect({ kind: "all" })}
          />
        ) : null}
      </View>

      <ScrollView className="flex-1" contentContainerClassName="gap-0.5 p-2 pt-0.5">
        {accounts.map((account) => (
          <AccountNode
            key={account.id}
            account={account}
            view={view}
            collapsed={collapsed}
            onToggle={toggle}
            onSelect={onSelect}
          />
        ))}

        <View className="border-border mt-3 border-t px-1 pt-2">
          <Button
            onPress={onSettings}
            accessibilityRole="button"
            accessibilityLabel="Paramètres de la messagerie"
          >
            <Icon as={Plus} className="size-4" />
            <Text>Paramètres</Text>
          </Button>
        </View>
      </ScrollView>
    </View>
  );
}

function AccountNode({
  account,
  view,
  collapsed,
  onToggle,
  onSelect,
}: {
  account: MailAccount;
  view: MailView;
  collapsed: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (view: MailView) => void;
}) {
  const folders = useMailFolders(account.id);
  const open = !collapsed.has(accountKey(account.id));
  const list = folders.data ?? [];
  // La pastille de la boîte compte les non lus de sa réception, comme « Tous les comptes ».
  const inboxUnseen = list.find((folder) => folder.path === INBOX_PATH)?.unseen ?? 0;
  const inboxActive =
    view.kind === "folder" && view.accountId === account.id && view.folder === INBOX_PATH;
  // Un dossier est caché dès qu'un de ses ancêtres est replié : on suit la
  // profondeur en descendant la liste, qui range chaque enfant sous son parent.
  const parents = new Set<string>();
  list.forEach((folder, index) => {
    const next = list[index + 1];
    if (next && next.depth > folder.depth) parents.add(folder.path);
  });
  const visible: MailFolder[] = [];
  let hiddenBelow: number | null = null;
  for (const folder of list) {
    if (hiddenBelow !== null && folder.depth > hiddenBelow) continue;
    hiddenBelow = null;
    visible.push(folder);
    if (collapsed.has(folderKey(account.id, folder.path))) hiddenBelow = folder.depth;
  }

  return (
    <View>
      <View className="flex-row items-center">
        <Pressable
          onPress={() => onToggle(accountKey(account.id))}
          accessibilityRole="button"
          accessibilityLabel={`${open ? "Replier" : "Déplier"} la boîte ${account.address}`}
          hitSlop={8}
          style={{ minHeight: MIN_TOUCH_TARGET - 8 }}
          className="items-center justify-center pl-1 pr-1 active:opacity-70"
        >
          <Icon
            as={open ? ChevronDown : ChevronRight}
            size={16}
            className="text-muted-foreground"
          />
        </Pressable>
        <Pressable
          // Un appui sur la boîte ouvre sa réception et déplie ses dossiers : on
          // vient pour lire, pas pour ranger l'arbre. Le chevron seul replie.
          onPress={() => {
            if (!open) onToggle(accountKey(account.id));
            onSelect({ kind: "folder", accountId: account.id, folder: INBOX_PATH });
          }}
          accessibilityRole="button"
          accessibilityState={{ selected: inboxActive }}
          accessibilityLabel={`Ouvrir la boîte de réception de ${account.address}${inboxUnseen > 0 ? `, ${inboxUnseen} non lus` : ""}`}
          style={{ minHeight: MIN_TOUCH_TARGET - 8 }}
          className="min-w-0 flex-1 flex-row items-center gap-2 rounded-md pr-2 active:bg-muted"
        >
          <Icon as={Mails} size={18} className="text-primary" />
          <Text className="min-w-0 shrink text-sm font-semibold" numberOfLines={1}>
            {account.address}
          </Text>
          {inboxUnseen > 0 ? (
            <View
              accessibilityElementsHidden
              className="bg-primary ml-auto min-w-5 shrink-0 items-center rounded-full px-1.5 py-0.5"
            >
              <Text className="text-primary-foreground text-xs font-semibold">{inboxUnseen}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>

      {open ? (
        folders.isPending ? (
          <Text className="text-muted-foreground px-8 py-1 text-xs">Chargement…</Text>
        ) : folders.isError ? (
          <Text className="text-destructive px-8 py-1 text-xs">Boîte injoignable.</Text>
        ) : (
          visible.map((folder) => {
            const hasChildren = parents.has(folder.path);
            const active =
              view.kind === "folder" &&
              view.accountId === account.id &&
              view.folder === folder.path;

            return (
              <TreeRow
                key={folder.path}
                label={folder.name}
                icon={folder.path === INBOX_PATH ? Inbox : active ? FolderOpen : Folder}
                unseen={folder.unseen}
                active={active}
                // Un cran de plus que la boîte, qui a son propre chevron.
                depth={folder.depth + 1}
                chevron={
                  hasChildren
                    ? collapsed.has(folderKey(account.id, folder.path))
                      ? "closed"
                      : "open"
                    : undefined
                }
                onChevron={() => onToggle(folderKey(account.id, folder.path))}
                onPress={() =>
                  onSelect({ kind: "folder", accountId: account.id, folder: folder.path })
                }
              />
            );
          })
        )
      ) : null}
    </View>
  );
}

function TreeRow({
  label,
  icon,
  unseen,
  active,
  depth,
  chevron,
  onChevron,
  onPress,
}: {
  label: string;
  icon: typeof Folder;
  unseen: number;
  active: boolean;
  depth: number;
  chevron?: "open" | "closed" | undefined;
  onChevron?: (() => void) | undefined;
  onPress: () => void;
}) {
  return (
    <View
      style={{ minHeight: MIN_TOUCH_TARGET - 8, paddingLeft: 4 + depth * 14 }}
      className={cn("flex-row items-center rounded-md pr-2", active ? "bg-muted" : "")}
    >
      {chevron ? (
        <Pressable
          onPress={onChevron}
          accessibilityRole="button"
          accessibilityLabel={`${chevron === "open" ? "Replier" : "Déplier"} ${label}`}
          hitSlop={8}
          className="w-5 items-center justify-center"
        >
          <Icon
            as={chevron === "open" ? ChevronDown : ChevronRight}
            size={14}
            className="text-muted-foreground"
          />
        </Pressable>
      ) : (
        // Garde les libellés alignés avec les dossiers qui ont un chevron.
        <View className="w-5" />
      )}
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        accessibilityLabel={`Ouvrir ${label}${unseen > 0 ? `, ${unseen} non lus` : ""}`}
        style={{ minHeight: MIN_TOUCH_TARGET - 8 }}
        className="min-w-0 flex-1 flex-row items-center gap-2 active:opacity-70"
      >
        <Icon as={icon} size={16} className={active ? "text-primary" : "text-muted-foreground"} />
        <Text
          className={cn(
            "min-w-0 shrink text-sm",
            active ? "text-primary font-semibold" : unseen > 0 ? "font-semibold" : "",
          )}
          numberOfLines={1}
        >
          {label}
        </Text>
        {unseen > 0 ? (
          <Text className="text-muted-foreground ml-auto shrink-0 text-xs">{unseen}</Text>
        ) : null}
      </Pressable>
    </View>
  );
}
