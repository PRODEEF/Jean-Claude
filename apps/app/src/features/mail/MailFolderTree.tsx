import { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { ChevronDown, ChevronRight, Folder, FolderOpen, Inbox, Plus } from "lucide-react-native";
import type { MailAccount, MailFolder } from "@jc/domain";
import { INBOX_PATH } from "@jc/domain";
import { MIN_TOUCH_TARGET } from "@jc/design";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { Text } from "@/shared/ui/text";
import { useCollapsed } from "./use-collapsed";
import { useDisconnectMail, useMailFolders } from "./use-mail";

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
  onAdd,
}: {
  accounts: MailAccount[];
  view: MailView;
  /** Non lus des boîtes de réception, toutes boîtes comprises. */
  allUnseen: number;
  onSelect: (view: MailView) => void;
  onAdd: () => void;
}) {
  const [collapsed, toggle] = useCollapsed();

  return (
    <ScrollView className="flex-1" contentContainerClassName="gap-0.5 p-2">
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
          variant="ghost"
          size="sm"
          className="self-start"
          onPress={onAdd}
          accessibilityRole="button"
          accessibilityLabel="Ajouter une boîte"
        >
          <Icon as={Plus} className="size-4" />
          <Text>Ajouter une boîte</Text>
        </Button>
      </View>
    </ScrollView>
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
  const disconnect = useDisconnectMail();
  const open = !collapsed.has(accountKey(account.id));
  const [confirming, setConfirming] = useState(false);

  // Un seul appui ne retire pas la boîte : il demande confirmation, et l'oublie
  // au bout de quelques secondes.
  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setConfirming(false), 4000);
    return () => clearTimeout(timer);
  }, [confirming]);

  const list = folders.data ?? [];
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
          className="min-w-0 flex-1 flex-row items-center gap-1 rounded-md pl-1 pr-2 active:bg-muted"
        >
          <Icon
            as={open ? ChevronDown : ChevronRight}
            size={16}
            className="text-muted-foreground"
          />
          <Text className="min-w-0 shrink text-sm font-semibold" numberOfLines={1}>
            {account.address}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => (confirming ? disconnect.mutate(account.id) : setConfirming(true))}
          accessibilityRole="button"
          accessibilityLabel={
            confirming
              ? `Confirmer le retrait de la boîte ${account.address}`
              : `Retirer la boîte ${account.address}`
          }
          hitSlop={8}
          className="shrink-0 rounded-md px-2 py-1"
        >
          <Text
            className={cn("text-xs", confirming ? "text-destructive" : "text-muted-foreground")}
          >
            {confirming ? "Retirer ?" : "Retirer"}
          </Text>
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
