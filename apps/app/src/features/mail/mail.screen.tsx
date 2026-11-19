import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { ChevronLeft, Folder, FolderOpen, Inbox, RefreshCw } from "lucide-react-native";
import type { MailFolder, MailMessage, MailMessageSummary } from "@jc/domain";
import { DEFAULT_MAIL_HOST, INBOX_PATH } from "@jc/domain";
import { MIN_TOUCH_TARGET } from "@jc/design";
import { useBreakpoint } from "@/shared/hooks/use-breakpoint";
import { formatFullDay, formatMailDate } from "@/shared/lib/dates";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { Input } from "@/shared/ui/input";
import { READING_MAX_WIDTH, ScreenShell } from "@/shared/ui/screen-shell";
import { Text } from "@/shared/ui/text";
import { MailAvatar } from "./MailAvatar";
import {
  useConnectMail,
  useDisconnectMail,
  useMailAccount,
  useMailFolders,
  useMailMessage,
  useMailMessages,
} from "./use-mail";

/**
 * Mails — lire sa boîte, sans rien envoyer.
 *
 * Disposition d'une messagerie classique (Outlook, Apple Mail, Gmail) : les
 * dossiers à gauche, la liste des mails au milieu, la lecture à droite. Sur
 * téléphone, une seule colonne à la fois, avec un retour.
 *
 * Une seule boîte par personne pour l'instant (OVH d'abord, demande de Yann du
 * 19 novembre). Le mot de passe part au serveur à la connexion et n'est plus
 * jamais relu ici (invariant 5).
 */
export function MailScreen() {
  const account = useMailAccount();
  const connected = account.data != null;

  return (
    <ScreenShell
      title="Mails"
      maxWidth={READING_MAX_WIDTH}
      // La boîte porte ses propres défilements, un par colonne.
      scrolls={!connected}
    >
      {account.isPending ? (
        <Text className="text-muted-foreground text-xs">Chargement…</Text>
      ) : account.isError ? (
        <Text className="text-destructive text-sm">
          La boîte mail n'a pas pu être chargée. Réessayez dans un instant.
        </Text>
      ) : account.data == null ? (
        <ConnectForm />
      ) : (
        <Mailbox address={account.data.address} />
      )}
    </ScreenShell>
  );
}

function ConnectForm() {
  const connect = useConnectMail();
  const [address, setAddress] = useState("");
  const [password, setPassword] = useState("");
  const [host, setHost] = useState(DEFAULT_MAIL_HOST);

  const canSubmit = address.trim().length > 0 && password.length > 0 && !connect.isPending;

  return (
    <View className="gap-3">
      <Text className="text-sm">
        Reliez votre boîte OVH pour lire vos mails ici. Vous ne pouvez pas encore en envoyer.
      </Text>

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
        <Text className="text-muted-foreground text-xs">Serveur OVH</Text>
        <Input
          value={host}
          onChangeText={setHost}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Serveur OVH"
        />
      </View>

      {connect.isError ? (
        <Text className="text-destructive text-sm">
          {connect.error instanceof Error
            ? connect.error.message
            : "La connexion a échoué. Réessayez dans un instant."}
        </Text>
      ) : null}

      <Button
        disabled={!canSubmit}
        onPress={() => connect.mutate({ address, password, host })}
        accessibilityRole="button"
        accessibilityLabel="Relier ma boîte"
      >
        <Text>{connect.isPending ? "Connexion…" : "Relier ma boîte"}</Text>
      </Button>
    </View>
  );
}

/** Ce qu'une seule colonne montre sur téléphone. */
type Stage = "folders" | "list" | "message";

function Mailbox({ address }: { address: string }) {
  const expanded = useBreakpoint() === "expanded";
  const [folder, setFolder] = useState(INBOX_PATH);
  // Le mail ouvert est lié à son dossier : un numéro n'a de sens que dans le
  // dossier où il a été lu, et un autre dossier en ouvrirait un autre mail.
  const [opened, setOpened] = useState<{ folder: string; uid: number } | null>(null);
  const uid = opened?.folder === folder ? opened.uid : null;
  const [stage, setStage] = useState<Stage>("list");

  const folders = useMailFolders();
  const messages = useMailMessages(folder);
  const message = useMailMessage(folder, uid);
  const folderName = folders.data?.find((entry) => entry.path === folder)?.name ?? "Mails";

  const foldersPane = (
    <FolderPane
      address={address}
      folders={folders.data ?? []}
      loading={folders.isPending}
      error={folders.isError}
      current={folder}
      onSelect={(path) => {
        setFolder(path);
        setStage("list");
      }}
    />
  );

  const listPane = (
    <ListPane
      title={folderName}
      messages={messages.data ?? []}
      loading={messages.isPending}
      error={messages.isError ? messages.error : null}
      selected={uid}
      onRefresh={() => void messages.refetch()}
      onSelect={(next) => {
        setOpened({ folder, uid: next });
        setStage("message");
      }}
      onShowFolders={expanded ? undefined : () => setStage("folders")}
    />
  );

  const readPane = (
    <ReadPane
      message={message.data}
      loading={uid !== null && message.isPending}
      error={message.isError ? message.error : null}
      onBack={expanded ? undefined : () => setStage("list")}
    />
  );

  if (!expanded) {
    return (
      <View className="flex-1">
        {stage === "folders" ? foldersPane : stage === "message" ? readPane : listPane}
      </View>
    );
  }

  return (
    <View className="flex-1 flex-row">
      <View style={{ width: 240 }} className="border-border border-r">
        {foldersPane}
      </View>
      <View style={{ width: 380 }} className="border-border border-r">
        {listPane}
      </View>
      <View className="min-w-0 flex-1">{readPane}</View>
    </View>
  );
}

function FolderPane({
  address,
  folders,
  loading,
  error,
  current,
  onSelect,
}: {
  address: string;
  folders: MailFolder[];
  loading: boolean;
  error: boolean;
  current: string;
  onSelect: (path: string) => void;
}) {
  const disconnect = useDisconnectMail();

  return (
    <ScrollView className="flex-1" contentContainerClassName="gap-0.5 p-2">
      {loading ? <Text className="text-muted-foreground px-2 text-xs">Chargement…</Text> : null}
      {error ? (
        <Text className="text-destructive px-2 text-sm">
          Les dossiers n'ont pas pu être chargés.
        </Text>
      ) : null}

      {folders.map((entry) => {
        const active = entry.path === current;
        return (
          <Pressable
            key={entry.path}
            onPress={() => onSelect(entry.path)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`Ouvrir le dossier ${entry.name}`}
            style={{ minHeight: MIN_TOUCH_TARGET - 8, paddingLeft: 8 + entry.depth * 16 }}
            className={cn(
              "flex-row items-center gap-2 rounded-md pr-2",
              active ? "bg-muted" : "active:bg-muted",
            )}
          >
            <Icon
              as={entry.path === INBOX_PATH ? Inbox : active ? FolderOpen : Folder}
              size={16}
              className={active ? "text-primary" : "text-muted-foreground"}
            />
            <Text
              className={cn("min-w-0 shrink text-sm", active ? "text-primary font-semibold" : "")}
              numberOfLines={1}
            >
              {entry.name}
            </Text>
          </Pressable>
        );
      })}

      <View className="border-border mt-3 gap-1 border-t px-2 pt-3">
        <Text className="text-muted-foreground text-xs" numberOfLines={1}>
          {address}
        </Text>
        <Button
          variant="ghost"
          size="sm"
          className="self-start"
          disabled={disconnect.isPending}
          onPress={() => disconnect.mutate()}
          accessibilityRole="button"
          accessibilityLabel="Retirer cette boîte"
        >
          <Text>Retirer la boîte</Text>
        </Button>
      </View>
    </ScrollView>
  );
}

function ListPane({
  title,
  messages,
  loading,
  error,
  selected,
  onRefresh,
  onSelect,
  onShowFolders,
}: {
  title: string;
  messages: MailMessageSummary[];
  loading: boolean;
  error: unknown;
  selected: number | null;
  onRefresh: () => void;
  onSelect: (uid: number) => void;
  /** Absent quand les dossiers sont déjà visibles à côté. */
  onShowFolders: (() => void) | undefined;
}) {
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
          <Text className="text-muted-foreground p-3 text-sm">Aucun mail dans ce dossier.</Text>
        ) : (
          messages.map((message) => (
            <MessageRow
              key={message.uid}
              message={message}
              active={message.uid === selected}
              onOpen={() => onSelect(message.uid)}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}

function MessageRow({
  message,
  active,
  onOpen,
}: {
  message: MailMessageSummary;
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
          {message.date ? (
            <Text className="text-muted-foreground shrink-0 text-xs">
              {formatMailDate(message.date)}
            </Text>
          ) : null}
        </View>
        <Text
          className={cn("text-sm", message.seen ? "text-muted-foreground" : "font-semibold")}
          numberOfLines={1}
        >
          {subject}
        </Text>
      </View>
    </Pressable>
  );
}

function ReadPane({
  message,
  loading,
  error,
  onBack,
}: {
  message: MailMessage | undefined;
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
            <Text className="pt-2 text-sm" selectable>
              {message.text ??
                "Ce mail ne contient pas de texte (images ou pièces jointes seules)."}
            </Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}
