import { useState, type ReactNode } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import {
  ArrowRight,
  CalendarDays,
  Folder,
  ListChecks,
  MessageCircle,
  type LucideIcon,
} from "lucide-react-native";
import {
  addDays,
  eventsOfDay,
  listsOfDay,
  openTaskCount,
  startOfDay,
  type Conversation,
} from "@jc/domain";
import { useCalendarEvents } from "@/features/calendar/hooks/use-calendar-events";
import { UnreadBadge } from "@/features/navigation/SidebarSection";
import { useAssistantChannel, useSidebarData } from "@/features/navigation/use-sidebar-data";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { Text } from "@/shared/ui/text";
import { useBreakpoint } from "@/shared/hooks/use-breakpoint";
import { useCurrentUser } from "@/shared/hooks/use-current-user";
import { useAssistantName } from "@/shared/hooks/use-profile";
import { useTaskLists } from "@/shared/hooks/use-task-lists";
import { formatFullDay, formatRelativeTime, formatTime } from "@/shared/lib/dates";
import { cn } from "@/shared/lib/utils";

/**
 * Amorces proposées sous la saisie : elles remplissent le champ sans rien
 * envoyer. Une par sujet que l'assistant sait transformer en suggestion
 * (rendez-vous, liste, rangement), pour qu'un nouvel utilisateur découvre ce
 * qu'il peut demander sans lire de mode d'emploi.
 */
const STARTERS = [
  "Aide-moi à organiser ma semaine",
  "Note une liste de courses pour samedi",
  "Rappelle-moi un rendez-vous",
  "J'ai une idée à creuser",
] as const;

const RECENT_COUNT = 6;
const FOLDER_PREVIEW_COUNT = 3;

export type HomeDashboardProps = {
  /** La saisie de l'écran d'accueil, telle quelle : un seul chemin de création. */
  composer: ReactNode;
  /** Remplit la saisie avec une amorce, sans l'envoyer. */
  onStarter: (text: string) => void;
};

/**
 * Accueil de la variante « Accueil » (§4.3) : la journée plutôt qu'une page
 * vide.
 *
 * Sans barre latérale permanente, rien ne montrait plus ce qui attend
 * l'utilisateur. Cet écran le résume en une vue — rendez-vous et listes du
 * jour, conversations à reprendre, dossiers — sur le modèle de l'accueil de
 * Notion et de la vue Aujourd'hui de Things 3 et Todoist (§4.2). La saisie
 * reste en tête : l'écran sert d'abord à écrire (§13.4.1).
 */
export function HomeDashboard({ composer, onStarter }: HomeDashboardProps) {
  const expanded = useBreakpoint() === "expanded";
  const { firstName } = useCurrentUser();
  // Figé au montage : recalculé à chaque rendu, l'instant changerait la clé du
  // cache du calendrier et relancerait la requête en boucle.
  const [now] = useState(() => new Date());

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="items-center px-4 py-10"
    >
      <View className="w-full max-w-[960px] gap-8">
        <View className="gap-1">
          <Text className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            {formatFullDay(now)}
          </Text>
          <Text className="text-3xl font-semibold text-foreground">
            {greeting(now)}
            {firstName ? ` ${firstName}` : ""}.
          </Text>
        </View>

        <View className="gap-3">
          {composer}
          {/* Sur téléphone, une seule ligne qui défile : empilées, les amorces
              repoussaient la journée sous la ligne de flottaison. */}
          <ScrollView
            horizontal={!expanded}
            showsHorizontalScrollIndicator={false}
            contentContainerClassName={cn("gap-2", expanded && "flex-row flex-wrap")}
          >
            {STARTERS.map((starter) => (
              <Button
                key={starter}
                variant="outline"
                size="sm"
                onPress={() => onStarter(starter)}
                className="rounded-full"
              >
                <Text className="text-sm font-normal text-muted-foreground">{starter}</Text>
              </Button>
            ))}
          </ScrollView>
        </View>

        <ChannelNotice />

        <View className={cn("gap-4", expanded && "flex-row items-start")}>
          <View className={cn(expanded && "flex-1")}>
            <TodayCard now={now} />
          </View>
          <View className={cn(expanded && "flex-1")}>
            <RecentCard now={now} />
          </View>
        </View>

        <FoldersSection expanded={expanded} />
      </View>
    </ScrollView>
  );
}

/** « Bonsoir » passé 18h : un détail, mais c'est ce qu'on dit à cette heure-là. */
function greeting(now: Date): string {
  return now.getHours() >= 18 ? "Bonsoir" : "Bonjour";
}

/**
 * Le canal permanent n'apparaît ici que lorsqu'il a quelque chose à dire : un
 * rappel proactif ou une question restée sans réponse (A.10). Le reste du
 * temps, l'onglet de la barre suffit.
 */
function ChannelNotice() {
  const router = useRouter();
  const assistantName = useAssistantName();
  const channel = useAssistantChannel().data;
  if (!channel || (channel.unreadCount === 0 && !channel.hasPendingQuestion)) return null;

  const message = channel.hasPendingQuestion
    ? `${assistantName} attend votre réponse`
    : channel.unreadCount > 1
      ? `${assistantName} vous a laissé ${channel.unreadCount} messages`
      : `${assistantName} vous a laissé un message`;

  return (
    <Pressable
      onPress={() => router.push("/assistant")}
      accessibilityRole="button"
      accessibilityLabel={message}
      className="min-h-11 flex-row items-center gap-3 rounded-xl bg-accent-soft px-4 py-3"
    >
      <View className="size-8 items-center justify-center rounded-full bg-primary">
        <Icon as={MessageCircle} size={16} className="text-primary-foreground" />
      </View>
      <Text className="flex-1 text-sm font-medium text-accent-soft-foreground">{message}</Text>
      <Icon as={ArrowRight} size={16} className="text-accent-soft-foreground" />
    </Pressable>
  );
}

/** Rendez-vous et listes dus aujourd'hui, dans l'ordre de la journée. */
function TodayCard({ now }: { now: Date }) {
  const router = useRouter();
  const [range] = useState(() => {
    const start = startOfDay(now);
    return { from: start.toISOString(), to: addDays(start, 1).toISOString() };
  });
  const events = useCalendarEvents(range);
  const lists = useTaskLists();

  // Rendez-vous et listes dans une seule suite, dans l'ordre de la journée :
  // c'est ainsi qu'on lit son programme, pas par type d'objet.
  const agenda: AgendaItem[] = [
    ...eventsOfDay(events.data ?? [], now).map((event) => ({
      key: event.id,
      at: event.startsAt,
      leading: event.allDay ? "Journée" : formatTime(event.startsAt),
      label: event.title,
      href: "/calendar",
    })),
    ...listsOfDay(lists.data ?? [], now).map((list) => {
      const remaining = openTaskCount(list);
      return {
        key: list.id,
        at: list.dueAt ?? "",
        leading: list.dueAllDay || !list.dueAt ? "Journée" : formatTime(list.dueAt),
        icon: ListChecks,
        label: list.title,
        trailing: remaining > 0 ? `${remaining} à faire` : "Terminée",
        href: `/todo?list=${list.id}`,
      };
    }),
  ].sort((x, y) => x.at.localeCompare(y.at));
  const loading = events.isLoading || lists.isLoading;

  return (
    <Card
      icon={CalendarDays}
      title="Aujourd'hui"
      action={{ label: "Calendrier", onPress: () => router.push("/calendar") }}
    >
      {events.error ? <Muted>Rendez-vous indisponibles pour le moment.</Muted> : null}
      {!loading && agenda.length === 0 ? (
        <Muted>Rien au programme. Une journée pour vous.</Muted>
      ) : null}

      {agenda.map(({ key, href, ...item }) => (
        <Row key={key} {...item} onPress={() => router.push(href as never)} />
      ))}
    </Card>
  );
}

type AgendaItem = {
  key: string;
  /** Horodatage ISO servant au tri. */
  at: string;
  leading: string;
  icon?: LucideIcon;
  label: string;
  trailing?: string;
  href: string;
};

/** Les dernières conversations, pour reprendre là où on s'était arrêté. */
function RecentCard({ now }: { now: Date }) {
  const router = useRouter();
  const { all, isLoading, error } = useSidebarData();
  const recent = [...all].sort(byLastActivity).slice(0, RECENT_COUNT);

  return (
    <Card icon={MessageCircle} title="Reprendre">
      {error ? <Muted>Conversations indisponibles pour le moment.</Muted> : null}
      {!isLoading && !error && recent.length === 0 ? (
        <Muted>Vos conversations apparaîtront ici.</Muted>
      ) : null}

      {recent.map((conversation) => (
        <Row
          key={conversation.id}
          label={conversation.title}
          trailing={formatRelativeTime(lastActivity(conversation), now)}
          badge={
            <UnreadBadge
              count={conversation.unreadCount}
              pendingQuestion={conversation.hasPendingQuestion}
            />
          }
          onPress={() => router.push(`/chat/${conversation.id}` as never)}
        />
      ))}
    </Card>
  );
}

/**
 * Les dossiers racine, en tuiles, avec leurs dernières conversations.
 *
 * Un dossier n'est pas une destination en soi : la tuile donne accès à ce
 * qu'il contient, pas à une page de dossier qui n'existe pas. Une
 * conversation rangée dans deux dossiers apparaît dans les deux tuiles (§5.2,
 * A.1).
 */
function FoldersSection({ expanded }: { expanded: boolean }) {
  const router = useRouter();
  const { groups } = useSidebarData();
  if (groups.length === 0) return null;

  return (
    <View className="gap-3">
      <Text className="text-sm font-semibold text-muted-foreground">Vos dossiers</Text>
      <View className="flex-row flex-wrap gap-3">
        {groups.map((group) => (
          <View
            key={group.folder.id}
            className={cn(
              "gap-2 rounded-xl border border-border bg-card p-4",
              expanded ? "w-[31%] min-w-[220px] grow" : "w-full",
            )}
          >
            <View className="flex-row items-center gap-2">
              <Icon as={Folder} size={16} className="text-muted-foreground" />
              <Text className="flex-1 text-sm font-semibold text-foreground" numberOfLines={1}>
                {group.folder.name}
              </Text>
              <Text className="text-xs text-muted-foreground">
                {group.folder.conversationCount}
              </Text>
            </View>

            {group.conversations.slice(0, FOLDER_PREVIEW_COUNT).map((conversation) => (
              <Pressable
                key={conversation.id}
                onPress={() => router.push(`/chat/${conversation.id}` as never)}
                accessibilityRole="button"
                className="min-h-8 justify-center"
              >
                <Text className="text-sm text-muted-foreground" numberOfLines={1}>
                  {conversation.title}
                </Text>
              </Pressable>
            ))}

            {group.conversations.length === 0 ? (
              <Pressable
                onPress={() => router.push(`/chat?folderId=${group.folder.id}` as never)}
                accessibilityRole="button"
                className="min-h-8 justify-center"
              >
                <Text className="text-sm text-primary">Démarrer une conversation ici</Text>
              </Pressable>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}

function Card({
  icon,
  title,
  action,
  children,
}: {
  icon: LucideIcon;
  title: string;
  action?: { label: string; onPress: () => void };
  children: ReactNode;
}) {
  return (
    <View className="gap-1 rounded-xl border border-border bg-card p-4">
      <View className="mb-1 flex-row items-center gap-2">
        <Icon as={icon} size={16} className="text-primary" />
        <Text className="flex-1 text-sm font-semibold text-foreground">{title}</Text>
        {action ? (
          <Button variant="ghost" size="sm" onPress={action.onPress} className="gap-1 px-2">
            <Text className="text-xs font-normal text-muted-foreground">{action.label}</Text>
            <Icon as={ArrowRight} size={12} className="text-muted-foreground" />
          </Button>
        ) : null}
      </View>
      {children}
    </View>
  );
}

function Row({
  leading,
  icon,
  label,
  trailing,
  badge,
  onPress,
}: {
  leading?: string;
  icon?: LucideIcon;
  label: string;
  trailing?: string;
  badge?: ReactNode;
  onPress: () => void;
}) {
  return (
    <Button
      variant="ghost"
      onPress={onPress}
      accessibilityLabel={label}
      className="-mx-2 justify-start gap-3 px-2"
    >
      {leading ? (
        <Text className="w-14 text-xs font-medium tabular-nums text-primary">{leading}</Text>
      ) : null}
      <Text className="min-w-0 flex-1 text-sm font-normal text-foreground" numberOfLines={1}>
        {label}
      </Text>
      {/* L'icône à droite et non devant le libellé : les titres restent
          alignés sur la même colonne, rendez-vous comme liste. */}
      {badge || icon || trailing ? (
        <View className="shrink-0 flex-row items-center gap-1.5">
          {badge}
          {icon ? <Icon as={icon} size={14} className="text-muted-foreground" /> : null}
          {trailing ? <Text className="text-xs text-muted-foreground">{trailing}</Text> : null}
        </View>
      ) : null}
    </Button>
  );
}

function Muted({ children }: { children: ReactNode }) {
  return <Text className="py-2 text-sm text-muted-foreground">{children}</Text>;
}

/** Dernier message, ou création pour un fil encore vide. */
function lastActivity(conversation: Conversation): string {
  return conversation.lastMessageAt ?? conversation.createdAt;
}

function byLastActivity(a: Conversation, b: Conversation): number {
  return lastActivity(b).localeCompare(lastActivity(a));
}
