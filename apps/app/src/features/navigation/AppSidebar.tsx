import { useState } from "react";
import { ScrollView, View } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "expo-router";
import {
  CalendarDays,
  ChevronRight,
  Folder as FolderIcon,
  ListChecks,
  MoreHorizontal,
  Plus,
  Settings,
  Sparkles,
} from "lucide-react-native";
import type { Conversation, Folder } from "@jc/domain";
import { api } from "@/shared/lib/api";
import { FolderDialog, type FolderDialogTarget } from "@/features/folder/FolderDialog";
import { Button } from "@/shared/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/shared/ui/collapsible";
import { Icon } from "@/shared/ui/icon";
import { Separator } from "@/shared/ui/separator";
import { Text } from "@/shared/ui/text";
import { useSidebarData, type SidebarGroup } from "./use-sidebar-data";

/** Rangées de navigation vers les vues qui ne sont pas des conversations. */
const UTILITY_LINKS = [
  { href: "/todo", label: "Todoliste", icon: ListChecks },
  { href: "/calendar", label: "Calendrier", icon: CalendarDays },
  { href: "/settings", label: "Réglages", icon: Settings },
] as const;

export type AppSidebarProps = {
  /** Referme le tiroir après navigation — sans effet quand la barre est fixe. */
  onNavigate?: () => void;
};

/**
 * Barre latérale de navigation.
 *
 * Reprend la structure du bloc `sidebar` de shadcn : en-tête, sections
 * libellées, groupes repliables, pied de barre. Le bloc lui-même n'existe pas
 * dans react-native-reusables — il tient à Radix, donc au DOM — il est ici
 * recomposé depuis les primitives portées (`Collapsible`, `Button`,
 * `Separator`), ce qui le rend utilisable aussi sur iOS et Android.
 */
export function AppSidebar({ onNavigate }: AppSidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { groups, unfiled, isLoading, error } = useSidebarData();
  const [folderTarget, setFolderTarget] = useState<FolderDialogTarget | null>(null);

  const go = (href: string) => {
    router.push(href as never);
    onNavigate?.();
  };

  /**
   * Capture sans friction (§13.4.1) : la conversation naît sans qu'on demande
   * où la ranger. Le classement vient après, jamais avant.
   */
  const create = useMutation({
    mutationFn: () => api.conversations.create({ folderIds: [] }),
    onSuccess: async (conversation) => {
      await queryClient.invalidateQueries({ queryKey: ["conversations"] });
      go(`/chat/${conversation.id}`);
    },
  });

  const createRootFolder = () => setFolderTarget({ mode: "create", parent: null });

  return (
    <View className="h-full w-64 border-r border-border bg-secondary">
      <View className="gap-2 p-3">
        {/* Canal permanent Jean-Claude (A.10) : borné aux rappels, à
            l'organisation de l'outil et à la structure du projet. Il tient la
            place de l'en-tête de la barre parce qu'il n'est pas une
            conversation parmi d'autres. */}
        <Button
          variant="ghost"
          onPress={() => go("/assistant")}
          accessibilityLabel="Ouvrir le fil permanent avec Jean-Claude"
          className={cx("h-auto justify-start gap-3 px-2 py-2", pathname === "/assistant")}
        >
          <View className="size-8 items-center justify-center rounded-md bg-primary">
            <Icon as={Sparkles} size={16} className="text-primary-foreground" />
          </View>
          <View className="flex-1">
            <Text className="text-sm font-semibold text-foreground">Jean-Claude</Text>
            <Text className="text-xs text-muted-foreground">Canal permanent</Text>
          </View>
        </Button>

        <Button
          variant="outline"
          onPress={() => create.mutate()}
          disabled={create.isPending}
          accessibilityLabel="Démarrer une nouvelle conversation"
          className="justify-start gap-2"
        >
          <Icon as={Plus} size={16} />
          <Text>Nouvelle conversation</Text>
        </Button>
      </View>

      <ScrollView className="flex-1" contentContainerClassName="px-3 pb-4">
        <SectionLabel action={{ label: "Créer un dossier", onPress: createRootFolder }}>
          Dossiers
        </SectionLabel>

        {/* Message fixe, et non `error.message` : une erreur brute de fetch ou
            du serveur peut porter des fragments de requête, donc des données
            de l'utilisateur. */}
        {error ? (
          <Text className="px-2 py-1 text-xs text-destructive">
            Dossiers indisponibles pour le moment.
          </Text>
        ) : null}

        {!error && !isLoading && groups.length === 0 ? (
          <Button variant="ghost" onPress={createRootFolder} className="justify-start gap-2 px-2">
            <Icon as={Plus} size={14} className="text-muted-foreground" />
            <Text className="text-xs text-muted-foreground">Créer un premier dossier</Text>
          </Button>
        ) : null}

        {groups.map((group) => (
          <FolderGroup
            key={group.folder.id}
            group={group}
            pathname={pathname}
            onOpen={go}
            onEdit={(folder) => setFolderTarget({ mode: "edit", folder })}
          />
        ))}

        {unfiled.length > 0 ? (
          <>
            <SectionLabel>Sans dossier</SectionLabel>
            {unfiled.map((conversation) => (
              <ConversationRow
                key={conversation.id}
                conversation={conversation}
                pathname={pathname}
                onOpen={go}
              />
            ))}
          </>
        ) : null}
      </ScrollView>

      <Separator />

      <View className="gap-0.5 p-3">
        {UTILITY_LINKS.map((link) => (
          <Button
            key={link.href}
            variant="ghost"
            onPress={() => go(link.href)}
            className={cx("justify-start gap-3 px-2", pathname === link.href)}
          >
            <Icon as={link.icon} size={16} className="text-muted-foreground" />
            <Text className="text-sm text-foreground">{link.label}</Text>
          </Button>
        ))}
      </View>

      <FolderDialog
        target={folderTarget}
        onClose={() => setFolderTarget(null)}
        onAddChild={(parent) => setFolderTarget({ mode: "create", parent })}
      />
    </View>
  );
}

/** Ajoute le fond de survol shadcn quand la rangée est celle de la route courante. */
function cx(base: string, active: boolean): string {
  return active ? `${base} bg-accent` : base;
}

function SectionLabel({
  children,
  action,
}: {
  children: string;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View className="flex-row items-center justify-between pb-1 pt-3">
      <Text className="px-2 text-xs font-medium text-muted-foreground">{children}</Text>
      {action ? <RowAction icon={Plus} label={action.label} onPress={action.onPress} /> : null}
    </View>
  );
}

/**
 * Bouton d'action d'une rangée.
 *
 * 32 pt de côté pour ne pas épaissir la barre, plus 8 pt de `hitSlop` de
 * chaque côté : la zone réellement touchable atteint les 44 pt de
 * `MIN_TOUCH_TARGET` sans que la rangée ne grandisse.
 */
function RowAction({
  icon,
  label,
  onPress,
}: {
  icon: typeof Plus;
  label: string;
  onPress: () => void;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      onPress={onPress}
      hitSlop={8}
      accessibilityLabel={label}
      className="size-8"
    >
      <Icon as={icon} size={16} className="text-muted-foreground" />
    </Button>
  );
}

/** Un dossier, ses sous-dossiers et leurs conversations, repliables d'un geste. */
function FolderGroup({
  group,
  pathname,
  onOpen,
  onEdit,
}: {
  group: SidebarGroup;
  pathname: string;
  onOpen: (href: string) => void;
  onEdit: (folder: Folder) => void;
}) {
  const [open, setOpen] = useState(true);
  const isEmpty = group.conversations.length === 0 && group.children.length === 0;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <View className="flex-row items-center">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="flex-1 justify-start gap-2 px-2">
            <Icon
              as={ChevronRight}
              size={14}
              className={open ? "rotate-90 text-muted-foreground" : "text-muted-foreground"}
            />
            <Icon as={FolderIcon} size={16} className="text-muted-foreground" />
            <Text className="flex-1 text-sm text-foreground" numberOfLines={1}>
              {group.folder.name}
            </Text>
          </Button>
        </CollapsibleTrigger>
        <RowAction
          icon={MoreHorizontal}
          label={`Modifier le dossier ${group.folder.name}`}
          onPress={() => onEdit(group.folder)}
        />
      </View>

      <CollapsibleContent>
        {/* Le filet vertical est ce qui rattache visuellement les
            conversations à leur dossier, comme dans le bloc shadcn. */}
        <View className="ml-4 border-l border-border pl-2">
          {group.conversations.map((conversation) => (
            <ConversationRow
              key={conversation.id}
              conversation={conversation}
              pathname={pathname}
              onOpen={onOpen}
            />
          ))}

          {/* Les sous-dossiers ne sont pas repliables à leur tour : replier le
              dossier racine escamote déjà l'ensemble, et l'arborescence est
              bornée à 2 niveaux — un second cran n'aurait rien à cacher. */}
          {group.children.map((child) => (
            <View key={child.folder.id}>
              <View className="flex-row items-center">
                <View className="h-9 flex-1 flex-row items-center gap-2 px-2">
                  <Icon as={FolderIcon} size={14} className="text-muted-foreground" />
                  <Text
                    className="flex-1 text-xs font-medium text-muted-foreground"
                    numberOfLines={1}
                  >
                    {child.folder.name}
                  </Text>
                </View>
                <RowAction
                  icon={MoreHorizontal}
                  label={`Modifier le dossier ${child.folder.name}`}
                  onPress={() => onEdit(child.folder)}
                />
              </View>

              <View className="ml-3 border-l border-border pl-2">
                {child.conversations.length === 0 ? (
                  <EmptyRow />
                ) : (
                  child.conversations.map((conversation) => (
                    <ConversationRow
                      key={conversation.id}
                      conversation={conversation}
                      pathname={pathname}
                      onOpen={onOpen}
                    />
                  ))
                )}
              </View>
            </View>
          ))}

          {isEmpty ? <EmptyRow /> : null}
        </View>
      </CollapsibleContent>
    </Collapsible>
  );
}

function EmptyRow() {
  return <Text className="px-2 py-1 text-xs italic text-muted-foreground">Vide</Text>;
}

function ConversationRow({
  conversation,
  pathname,
  onOpen,
}: {
  conversation: Conversation;
  pathname: string;
  onOpen: (href: string) => void;
}) {
  const active = pathname === `/chat/${conversation.id}`;

  return (
    <Button
      variant="ghost"
      size="sm"
      onPress={() => onOpen(`/chat/${conversation.id}`)}
      className={cx("w-full justify-start px-2", active)}
    >
      <Text
        className={
          active
            ? "flex-1 text-sm font-medium text-foreground"
            : "flex-1 text-sm text-muted-foreground"
        }
        numberOfLines={1}
      >
        {conversation.title}
      </Text>
    </Button>
  );
}
