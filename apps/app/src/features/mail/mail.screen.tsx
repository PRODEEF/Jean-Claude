import { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import {
  ChevronLeft,
  Download,
  Folder,
  Paperclip,
  RefreshCw,
  Search,
  X,
} from "lucide-react-native";
import type { MailAccount, MailAttachment, MailMessage, MailMessageSummary } from "@jc/domain";
import {
  groupByDay,
  INBOX_PATH,
  MAIL_MAX_LIMIT,
  MAIL_PAGE_SIZE,
  MAIL_PROVIDERS,
  type MailProviderId,
} from "@jc/domain";
import { MIN_TOUCH_TARGET } from "@jc/design";
import { useBreakpoint } from "@/shared/hooks/use-breakpoint";
import { formatFullDay, formatMailDate } from "@/shared/lib/dates";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { Input } from "@/shared/ui/input";
import { READING_MAX_WIDTH, ScreenShell } from "@/shared/ui/screen-shell";
import { SegmentedControl } from "@/shared/ui/segmented-control";
import { Text } from "@/shared/ui/text";
import { api } from "@/shared/lib/api";
import { MailAvatar } from "./MailAvatar";
import { MailBody } from "./MailBody";
import { CAN_DOWNLOAD, downloadFile } from "./download-file";
import { MailFolderTree, type MailView } from "./MailFolderTree";
import {
  useAllMailFolders,
  useConnectMail,
  useMailAccounts,
  useMailFolders,
  useMailInbox,
  useMailMessage,
  useMailMessages,
  useSetMailSeen,
  type MailListParams,
} from "./use-mail";

/**
 * Mails — lire ses boîtes.
 *
 * Disposition d'une messagerie classique (Outlook, Apple Mail, Gmail) : l'arbre
 * des boîtes et de leurs dossiers à gauche, la liste des mails au milieu, la
 * lecture à droite. Sur téléphone, une seule colonne à la fois, avec un retour.
 *
 * Plusieurs boîtes (OVH, Infomaniak…), demande de Yann du 20 novembre. Le mot de
 * passe part au serveur à la connexion et n'est plus jamais relu ici
 * (invariant 5).
 */
export function MailScreen() {
  const accounts = useMailAccounts();
  const connected = (accounts.data?.length ?? 0) > 0;

  return (
    <ScreenShell
      title="Mails"
      maxWidth={READING_MAX_WIDTH}
      // Une fois reliée, la boîte porte ses propres défilements, un par colonne.
      scrolls={!connected}
    >
      {accounts.isPending ? (
        <Text className="text-muted-foreground text-xs">Chargement…</Text>
      ) : accounts.isError ? (
        <Text className="text-destructive text-sm">
          Les boîtes mail n'ont pas pu être chargées. Réessayez dans un instant.
        </Text>
      ) : accounts.data.length === 0 ? (
        <ConnectForm />
      ) : (
        <Mailbox accounts={accounts.data} />
      )}
    </ScreenShell>
  );
}

function ConnectForm({ onDone }: { onDone?: () => void }) {
  const connect = useConnectMail();
  const [provider, setProvider] = useState<MailProviderId>(MAIL_PROVIDERS[0].id);
  const [address, setAddress] = useState("");
  const [password, setPassword] = useState("");
  const [host, setHost] = useState<string>(MAIL_PROVIDERS[0].host);

  const canSubmit = address.trim().length > 0 && password.length > 0 && !connect.isPending;
  const providerName = MAIL_PROVIDERS.find((entry) => entry.id === provider)?.label ?? "";

  return (
    <View className="gap-3">
      <Text className="text-sm">
        Reliez une boîte mail pour la lire ici. Vous ne pouvez pas encore en envoyer.
      </Text>

      <View className="gap-1">
        <Text className="text-muted-foreground text-xs">Fournisseur</Text>
        <SegmentedControl
          options={MAIL_PROVIDERS.map((entry) => ({ value: entry.id, label: entry.label }))}
          value={provider}
          onChange={(next) => {
            setProvider(next);
            // Le serveur suit le fournisseur choisi : l'utilisateur n'a pas à le connaître.
            const entry = MAIL_PROVIDERS.find((candidate) => candidate.id === next);
            if (entry) setHost(entry.host);
          }}
        />
      </View>

      <View className="gap-1">
        <Text className="text-muted-foreground text-xs">Adresse e-mail</Text>
        <Input
          value={address}
          onChangeText={setAddress}
          placeholder="vous@exemple.fr"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          accessibilityLabel="Adresse e-mail"
        />
      </View>

      <View className="gap-1">
        <Text className="text-muted-foreground text-xs">Mot de passe de la boîte</Text>
        <Input
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="current-password"
          textContentType="password"
          accessibilityLabel="Mot de passe de la boîte"
        />
      </View>

      <View className="gap-1">
        <Text className="text-muted-foreground text-xs">{`Serveur ${providerName}`}</Text>
        <Input
          value={host}
          onChangeText={setHost}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel={`Serveur ${providerName}`}
        />
      </View>

      {connect.isError ? (
        <Text className="text-destructive text-sm">
          {connect.error instanceof Error
            ? connect.error.message
            : "La connexion a échoué. Réessayez dans un instant."}
        </Text>
      ) : null}

      <View className="flex-row gap-2">
        <Button
          className="flex-1"
          disabled={!canSubmit}
          onPress={() =>
            connect.mutate({ address, password, host }, { onSuccess: () => onDone?.() })
          }
          accessibilityRole="button"
          accessibilityLabel="Relier ma boîte"
        >
          <Text>{connect.isPending ? "Connexion…" : "Relier ma boîte"}</Text>
        </Button>
        {onDone ? (
          <Button
            variant="outline"
            onPress={onDone}
            accessibilityRole="button"
            accessibilityLabel="Annuler"
          >
            <Text>Annuler</Text>
          </Button>
        ) : null}
      </View>
    </View>
  );
}

/** Ce qu'une seule colonne montre sur téléphone. */
type Stage = "folders" | "list" | "message";

function viewKey(view: MailView): string {
  return view.kind === "all" ? "all" : `${view.accountId}:${view.folder}`;
}

function Mailbox({ accounts }: { accounts: MailAccount[] }) {
  const expanded = useBreakpoint() === "expanded";
  const [chosen, setChosen] = useState<MailView | null>(null);
  const [adding, setAdding] = useState(false);
  const [stage, setStage] = useState<Stage>("list");
  const [opened, setOpened] = useState<{
    viewKey: string;
    accountId: string;
    folder: string;
    uid: number;
  } | null>(null);

  // La vue choisie peut viser une boîte qu'on vient de retirer : on revient alors
  // à la vue par défaut — toutes les boîtes s'il y en a plusieurs, sinon la seule.
  const first = accounts[0];
  const defaultView: MailView =
    accounts.length > 1 || !first
      ? { kind: "all" }
      : { kind: "folder", accountId: first.id, folder: INBOX_PATH };
  const chosenIsValid =
    chosen !== null &&
    (chosen.kind === "all"
      ? accounts.length > 1
      : accounts.some((account) => account.id === chosen.accountId));
  const view = chosen && chosenIsValid ? chosen : defaultView;

  const key = viewKey(view);

  // Recherche, filtre « non lus » et nombre de mails demandés. Chacun repart de
  // zéro quand on change de vue : « plus de mails » dans un dossier n'a pas de
  // sens dans un autre.
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [unseenOnly, setUnseenOnly] = useState(false);
  const [more, setMore] = useState<{ scope: string; limit: number } | null>(null);
  // Une recherche ne part qu'une fois la frappe posée : un appel par lettre
  // ferait travailler la boîte pour rien.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 400);
    return () => clearTimeout(timer);
  }, [search]);
  const scope = `${key}|${query}|${unseenOnly}`;
  const limit = more?.scope === scope ? more.limit : MAIL_PAGE_SIZE;
  const params: MailListParams = { limit, q: query, unseen: unseenOnly };
  // Le mail ouvert est lié à sa vue : un numéro n'a de sens que dans le dossier
  // où il a été lu, et une autre vue en ouvrirait un autre mail.
  const current = opened?.viewKey === key ? opened : null;

  const all = useMailInbox(view.kind === "all", params);
  const single = useMailMessages(
    view.kind === "folder" ? view.accountId : "",
    view.kind === "folder" ? view.folder : INBOX_PATH,
    view.kind === "folder",
    params,
  );
  const list = view.kind === "all" ? all : single;
  const messages = (view.kind === "all" ? all.data?.messages : single.data) ?? [];
  const unreachable = view.kind === "all" ? (all.data?.unreachableAccountIds ?? []) : [];

  const message = useMailMessage(
    current?.accountId ?? null,
    current?.folder ?? INBOX_PATH,
    current?.uid ?? null,
  );

  const folderQueries = useAllMailFolders(accounts);
  const allUnseen = folderQueries.reduce(
    (total, query) =>
      total + (query.data?.find((folder) => folder.path === INBOX_PATH)?.unseen ?? 0),
    0,
  );

  const activeFolders = useMailFolders(view.kind === "folder" ? view.accountId : (first?.id ?? ""));
  const title =
    view.kind === "all"
      ? "Tous les comptes"
      : (activeFolders.data?.find((folder) => folder.path === view.folder)?.name ?? "Mails");

  const addressOf = (accountId: string) =>
    accounts.find((account) => account.id === accountId)?.address ?? "";

  const foldersPane = adding ? (
    <ScrollView className="flex-1" contentContainerClassName="p-3">
      <ConnectForm
        onDone={() => {
          setAdding(false);
          setStage("folders");
        }}
      />
    </ScrollView>
  ) : (
    <MailFolderTree
      accounts={accounts}
      view={view}
      allUnseen={allUnseen}
      onSelect={(next) => {
        setChosen(next);
        setStage("list");
      }}
      onAdd={() => setAdding(true)}
    />
  );

  const listPane = (
    <ListPane
      title={title}
      messages={messages}
      loading={list.isPending}
      error={list.isError ? list.error : null}
      unreachable={unreachable.map(addressOf)}
      selected={current ? { accountId: current.accountId, uid: current.uid } : null}
      search={search}
      onSearch={setSearch}
      unseenOnly={unseenOnly}
      onUnseenOnly={setUnseenOnly}
      filtering={query !== "" || unseenOnly}
      hasMore={messages.length >= limit}
      onMore={() => setMore({ scope, limit: Math.min(limit + MAIL_PAGE_SIZE, MAIL_MAX_LIMIT) })}
      showAccount={view.kind === "all"}
      addressOf={addressOf}
      onRefresh={() => void list.refetch()}
      onSelect={(next) => {
        setOpened({
          viewKey: key,
          accountId: next.accountId,
          folder: view.kind === "folder" ? view.folder : INBOX_PATH,
          uid: next.uid,
        });
        setStage("message");
      }}
      onShowFolders={expanded ? undefined : () => setStage("folders")}
    />
  );

  const setSeen = useSetMailSeen();
  const readPane = (
    <ReadPane
      message={message.data}
      folder={current?.folder ?? INBOX_PATH}
      onMarkUnread={
        current
          ? () => {
              setSeen.mutate({
                accountId: current.accountId,
                folder: current.folder,
                uid: current.uid,
                seen: false,
              });
              if (!expanded) setStage("list");
            }
          : undefined
      }
      loading={current !== null && message.isPending}
      error={message.isError ? message.error : null}
      onBack={expanded ? undefined : () => setStage("list")}
    />
  );

  if (!expanded) {
    return (
      <View className="flex-1">
        {adding || stage === "folders" ? foldersPane : stage === "message" ? readPane : listPane}
      </View>
    );
  }

  return (
    <View className="flex-1 flex-row">
      <View style={{ width: 260 }} className="border-border border-r">
        {foldersPane}
      </View>
      <View style={{ width: 380 }} className="border-border border-r">
        {listPane}
      </View>
      <View className="min-w-0 flex-1">{readPane}</View>
    </View>
  );
}

function ListPane({
  title,
  messages,
  loading,
  error,
  unreachable,
  selected,
  search,
  onSearch,
  unseenOnly,
  onUnseenOnly,
  filtering,
  hasMore,
  onMore,
  showAccount,
  addressOf,
  onRefresh,
  onSelect,
  onShowFolders,
}: {
  title: string;
  messages: MailMessageSummary[];
  loading: boolean;
  error: unknown;
  /** Adresses des boîtes qui n'ont pas répondu, dans la vue « Tous les comptes ». */
  unreachable: string[];
  selected: { accountId: string; uid: number } | null;
  search: string;
  onSearch: (value: string) => void;
  unseenOnly: boolean;
  onUnseenOnly: (value: boolean) => void;
  /** Une recherche ou un filtre est en cours : la liste vide ne veut pas dire « dossier vide ». */
  filtering: boolean;
  /** Il y a probablement des mails plus anciens à charger. */
  hasMore: boolean;
  onMore: () => void;
  /** Montre la boîte de chaque mail : utile quand plusieurs sont réunies. */
  showAccount: boolean;
  addressOf: (accountId: string) => string;
  onRefresh: () => void;
  onSelect: (message: MailMessageSummary) => void;
  /** Absent quand les dossiers sont déjà visibles à côté. */
  onShowFolders: (() => void) | undefined;
}) {
  const [searching, setSearching] = useState(false);
  const groups = groupByDay(messages);

  return (
    <View className="flex-1">
      <View className="border-border flex-row items-center justify-between gap-2 border-b px-3 py-2">
        <View className="min-w-0 shrink flex-row items-center gap-1">
          {onShowFolders ? (
            <Button
              variant="ghost"
              size="sm"
              onPress={onShowFolders}
              accessibilityRole="button"
              accessibilityLabel="Voir les dossiers"
            >
              <Icon as={Folder} className="size-4" />
            </Button>
          ) : null}
          <Text className="min-w-0 shrink font-semibold" numberOfLines={1}>
            {title}
          </Text>
        </View>
        <View className="flex-row items-center">
          <Button
            variant="ghost"
            size="sm"
            onPress={() => {
              // Refermer la recherche l'efface : une liste filtrée à l'insu de
              // l'utilisateur ferait croire à un dossier presque vide.
              if (searching) onSearch("");
              setSearching(!searching);
            }}
            accessibilityRole="button"
            accessibilityLabel={searching ? "Fermer la recherche" : "Chercher un mail"}
          >
            <Icon as={searching ? X : Search} className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onPress={onRefresh}
            accessibilityRole="button"
            accessibilityLabel="Actualiser les mails"
          >
            <Icon as={RefreshCw} className="size-4" />
          </Button>
        </View>
      </View>

      <View className="border-border gap-2 border-b px-3 py-2">
        {searching ? (
          <Input
            value={search}
            onChangeText={onSearch}
            placeholder="Expéditeur, objet ou texte"
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel="Chercher un mail"
          />
        ) : null}
        <SegmentedControl
          options={[
            { value: "all", label: "Tous" },
            { value: "unseen", label: "Non lus" },
          ]}
          value={unseenOnly ? "unseen" : "all"}
          onChange={(value) => onUnseenOnly(value === "unseen")}
        />
      </View>

      {unreachable.length > 0 ? (
        <Text className="text-destructive px-3 py-2 text-xs">
          {`Boîte injoignable : ${unreachable.join(", ")}.`}
        </Text>
      ) : null}

      <ScrollView className="flex-1">
        {loading ? (
          <Text className="text-muted-foreground p-3 text-xs">Chargement…</Text>
        ) : error ? (
          <Text className="text-destructive p-3 text-sm">
            {error instanceof Error
              ? error.message
              : "Les mails n'ont pas pu être chargés. Réessayez dans un instant."}
          </Text>
        ) : messages.length === 0 ? (
          <Text className="text-muted-foreground p-3 text-sm">
            {filtering ? "Aucun mail ne correspond." : "Aucun mail dans ce dossier."}
          </Text>
        ) : (
          <>
            {groups.map((group) => (
              <View key={group.label}>
                <Text className="text-muted-foreground bg-muted/40 px-3 py-1 text-xs font-semibold">
                  {group.label}
                </Text>
                {group.items.map((message) => (
                  <MessageRow
                    key={`${message.accountId}:${message.uid}`}
                    message={message}
                    account={showAccount ? addressOf(message.accountId) : undefined}
                    active={
                      selected?.accountId === message.accountId && selected.uid === message.uid
                    }
                    onOpen={() => onSelect(message)}
                  />
                ))}
              </View>
            ))}
            {hasMore ? (
              <View className="p-3">
                <Button
                  variant="outline"
                  size="sm"
                  onPress={onMore}
                  accessibilityRole="button"
                  accessibilityLabel="Afficher des mails plus anciens"
                >
                  <Text>Afficher des mails plus anciens</Text>
                </Button>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function MessageRow({
  message,
  account,
  active,
  onOpen,
}: {
  message: MailMessageSummary;
  /** Adresse de la boîte, montrée quand plusieurs boîtes sont réunies. */
  account: string | undefined;
  active: boolean;
  onOpen: () => void;
}) {
  const subject = message.subject || "(sans objet)";
  const sender = message.from || "(expéditeur inconnu)";

  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`Ouvrir le mail de ${sender} : ${subject}`}
      style={{ minHeight: MIN_TOUCH_TARGET }}
      className={cn(
        "border-border flex-row items-center gap-3 border-b px-3 py-2",
        active ? "bg-muted" : "active:bg-muted",
      )}
    >
      <MailAvatar sender={message.from} />
      <View className="min-w-0 flex-1 gap-0.5">
        <View className="flex-row items-center justify-between gap-2">
          <Text
            className={cn("min-w-0 shrink text-sm", message.seen ? "" : "font-semibold")}
            numberOfLines={1}
          >
            {sender}
          </Text>
          <View className="shrink-0 flex-row items-center gap-1">
            {message.hasAttachments ? (
              <Icon as={Paperclip} size={12} className="text-muted-foreground" />
            ) : null}
            {message.date ? (
              <Text className="text-muted-foreground text-xs">{formatMailDate(message.date)}</Text>
            ) : null}
          </View>
        </View>
        <Text
          className={cn("text-sm", message.seen ? "text-muted-foreground" : "font-semibold")}
          numberOfLines={1}
        >
          {subject}
        </Text>
        {message.preview ? (
          <Text className="text-muted-foreground text-xs" numberOfLines={1}>
            {message.preview}
          </Text>
        ) : null}
        {account ? (
          <Text className="text-muted-foreground text-xs" numberOfLines={1}>
            {account}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function ReadPane({
  message,
  folder,
  loading,
  error,
  onBack,
  onMarkUnread,
}: {
  message: MailMessage | undefined;
  /** Dossier où le mail est ouvert. */
  folder: string;
  /** Remet le mail ouvert en non lu ; absent quand rien n'est ouvert. */
  onMarkUnread: (() => void) | undefined;
  loading: boolean;
  error: unknown;
  /** Absent quand la liste est déjà visible à côté. */
  onBack: (() => void) | undefined;
}) {
  return (
    <View className="flex-1">
      {onBack ? (
        <View className="border-border border-b px-2 py-1">
          <Button
            variant="ghost"
            size="sm"
            className="self-start"
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel="Retour à la liste des mails"
          >
            <Icon as={ChevronLeft} className="size-4" />
            <Text>Retour</Text>
          </Button>
        </View>
      ) : null}

      <ScrollView className="flex-1" contentContainerClassName="gap-3 p-4">
        {loading ? (
          <Text className="text-muted-foreground text-xs">Chargement…</Text>
        ) : error ? (
          <Text className="text-destructive text-sm">
            {error instanceof Error
              ? error.message
              : "Le mail n'a pas pu être chargé. Réessayez dans un instant."}
          </Text>
        ) : !message ? (
          <Text className="text-muted-foreground text-sm">Sélectionnez un mail pour le lire.</Text>
        ) : (
          <>
            <Text className="text-lg font-semibold">{message.subject || "(sans objet)"}</Text>
            <View className="flex-row items-center gap-3">
              <MailAvatar sender={message.from} size={48} />
              <View className="min-w-0 flex-1 gap-0.5">
                <Text className="font-semibold" numberOfLines={1}>
                  {message.from || "(expéditeur inconnu)"}
                </Text>
                <Text className="text-muted-foreground text-xs" numberOfLines={2}>
                  {`À : ${message.to}`}
                </Text>
                {message.date ? (
                  <Text className="text-muted-foreground text-xs">
                    {formatFullDay(new Date(message.date))}
                  </Text>
                ) : null}
              </View>
            </View>
            {onMarkUnread ? (
              <Button
                variant="outline"
                size="sm"
                className="self-start"
                onPress={onMarkUnread}
                accessibilityRole="button"
                accessibilityLabel="Marquer comme non lu"
              >
                <Text>Marquer comme non lu</Text>
              </Button>
            ) : null}
            <MessageContent message={message} folder={folder} />
          </>
        )}
      </ScrollView>
    </View>
  );
}

/** Les images distantes d'un mail sont-elles à charger ? Il y en a-t-il seulement ? */
function hasRemoteImages(html: string | null): boolean {
  return html !== null && /<img[^>]+src=["']https?:/i.test(html);
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} Mo`;
}

/**
 * Le contenu d'un mail ouvert : son texte ou sa mise en forme, puis ses pièces
 * jointes. Les images distantes ne se chargent qu'à la demande : une image
 * distante dit à l'expéditeur que le mail a été ouvert.
 */
function MessageContent({ message, folder }: { message: MailMessage; folder: string }) {
  const [shown, setShown] = useState<string | null>(null);
  const showImages = shown === `${message.accountId}:${message.uid}`;

  return (
    <>
      {hasRemoteImages(message.html) && !showImages ? (
        <View className="bg-muted flex-row items-center justify-between gap-2 rounded-md px-3 py-2">
          <Text className="text-muted-foreground min-w-0 shrink text-xs">
            Les images de ce mail ne sont pas affichées.
          </Text>
          <Button
            variant="outline"
            size="sm"
            onPress={() => setShown(`${message.accountId}:${message.uid}`)}
            accessibilityRole="button"
            accessibilityLabel="Afficher les images"
          >
            <Text>Afficher les images</Text>
          </Button>
        </View>
      ) : null}

      <MailBody html={message.html} text={message.text} showImages={showImages} />

      {message.attachments.length > 0 ? (
        <View className="border-border gap-1 border-t pt-3">
          <Text className="text-muted-foreground text-xs font-semibold">
            {message.attachments.length > 1 ? "Pièces jointes" : "Pièce jointe"}
          </Text>
          {message.attachments.map((attachment) => (
            <AttachmentRow
              key={attachment.index}
              message={message}
              folder={folder}
              attachment={attachment}
            />
          ))}
        </View>
      ) : null}
    </>
  );
}

function AttachmentRow({
  message,
  folder,
  attachment,
}: {
  message: MailMessage;
  /** Dossier où le mail a été ouvert : le serveur y cherche la pièce jointe. */
  folder: string;
  attachment: MailAttachment;
}) {
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const download = async () => {
    if (!CAN_DOWNLOAD) {
      setState("error");
      setError("Le téléchargement n'est pas encore disponible sur téléphone.");
      return;
    }
    setState("loading");
    setError(null);
    try {
      const blob = await api.mail.attachment(
        message.accountId,
        message.uid,
        attachment.index,
        folder,
      );
      downloadFile(blob, attachment.filename);
      setState("idle");
    } catch (failure) {
      setState("error");
      setError(failure instanceof Error ? failure.message : "Le téléchargement a échoué.");
    }
  };

  return (
    <View>
      <Pressable
        onPress={() => void download()}
        disabled={state === "loading"}
        accessibilityRole="button"
        accessibilityLabel={`Télécharger ${attachment.filename}`}
        style={{ minHeight: MIN_TOUCH_TARGET - 8 }}
        className="flex-row items-center gap-2 rounded-md py-1 active:opacity-70"
      >
        <Icon as={Paperclip} size={16} className="text-muted-foreground" />
        <Text className="min-w-0 shrink text-sm" numberOfLines={1}>
          {attachment.filename}
        </Text>
        <Text className="text-muted-foreground shrink-0 text-xs">
          {state === "loading" ? "Téléchargement…" : formatSize(attachment.size)}
        </Text>
        <Icon as={Download} size={14} className="text-muted-foreground" />
      </Pressable>
      {state === "error" && error ? (
        <Text className="text-destructive text-xs">{error}</Text>
      ) : null}
    </View>
  );
}
