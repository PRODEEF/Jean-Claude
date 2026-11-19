import { useState } from "react";
import { Pressable, View } from "react-native";
import { ChevronLeft, RefreshCw } from "lucide-react-native";
import type { MailMessageSummary } from "@jc/domain";
import { DEFAULT_MAIL_HOST } from "@jc/domain";
import { MIN_TOUCH_TARGET } from "@jc/design";
import { formatFullDay } from "@/shared/lib/dates";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { Input } from "@/shared/ui/input";
import { READING_MAX_WIDTH, ScreenShell } from "@/shared/ui/screen-shell";
import { Text } from "@/shared/ui/text";
import {
  useConnectMail,
  useDisconnectMail,
  useMailAccount,
  useMailMessage,
  useMailMessages,
} from "./use-mail";

/**
 * Mails — étape 1 : lire sa boîte, sans rien envoyer.
 *
 * Une seule boîte par personne pour l'instant (OVH d'abord, demande de Yann du
 * 19 novembre). Le mot de passe part au serveur à la connexion et n'est plus
 * jamais relu ici (invariant 5).
 */
export function MailScreen() {
  const account = useMailAccount();
  const [openedUid, setOpenedUid] = useState<number | null>(null);

  return (
    <ScreenShell title="Mails" maxWidth={READING_MAX_WIDTH}>
      {account.isPending ? (
        <Text className="text-muted-foreground text-xs">Chargement…</Text>
      ) : account.isError ? (
        <Text className="text-destructive text-sm">
          La boîte mail n'a pas pu être chargée. Réessayez dans un instant.
        </Text>
      ) : account.data === null ? (
        <ConnectForm />
      ) : openedUid !== null ? (
        <MessageView uid={openedUid} onBack={() => setOpenedUid(null)} />
      ) : (
        <Inbox address={account.data.address} onOpen={setOpenedUid} />
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

function Inbox({ address, onOpen }: { address: string; onOpen: (uid: number) => void }) {
  const messages = useMailMessages(true);
  const disconnect = useDisconnectMail();

  return (
    <View className="gap-3">
      <View className="flex-row items-center justify-between gap-2">
        <Text className="text-muted-foreground min-w-0 shrink text-xs" numberOfLines={1}>
          {address}
        </Text>
        <View className="flex-row items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onPress={() => void messages.refetch()}
            accessibilityRole="button"
            accessibilityLabel="Actualiser les mails"
          >
            <Icon as={RefreshCw} className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={disconnect.isPending}
            onPress={() => disconnect.mutate()}
            accessibilityRole="button"
            accessibilityLabel="Retirer cette boîte"
          >
            <Text>Retirer la boîte</Text>
          </Button>
        </View>
      </View>

      {messages.isPending ? (
        <Text className="text-muted-foreground text-xs">Chargement…</Text>
      ) : messages.isError ? (
        <Text className="text-destructive text-sm">
          {messages.error instanceof Error
            ? messages.error.message
            : "Les mails n'ont pas pu être chargés. Réessayez dans un instant."}
        </Text>
      ) : messages.data.length === 0 ? (
        <Text className="text-muted-foreground text-sm">
          Aucun mail dans la boîte de réception.
        </Text>
      ) : (
        <View className="border-border overflow-hidden rounded-xl border">
          {messages.data.map((message) => (
            <MessageRow key={message.uid} message={message} onOpen={() => onOpen(message.uid)} />
          ))}
        </View>
      )}
    </View>
  );
}

function MessageRow({ message, onOpen }: { message: MailMessageSummary; onOpen: () => void }) {
  const subject = message.subject || "(sans objet)";

  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`Ouvrir le mail de ${message.from} : ${subject}`}
      style={{ minHeight: MIN_TOUCH_TARGET }}
      className="border-border gap-0.5 border-b px-3 py-2"
    >
      <View className="flex-row items-center justify-between gap-2">
        <Text
          className={
            message.seen ? "min-w-0 shrink text-sm" : "min-w-0 shrink text-sm font-semibold"
          }
          numberOfLines={1}
        >
          {message.from || "(expéditeur inconnu)"}
        </Text>
        {message.date ? (
          <Text className="text-muted-foreground shrink-0 text-xs">
            {formatFullDay(new Date(message.date))}
          </Text>
        ) : null}
      </View>
      <Text
        className={message.seen ? "text-muted-foreground text-sm" : "text-sm font-semibold"}
        numberOfLines={1}
      >
        {subject}
      </Text>
    </Pressable>
  );
}

function MessageView({ uid, onBack }: { uid: number; onBack: () => void }) {
  const message = useMailMessage(uid);

  return (
    <View className="gap-3">
      <Button
        variant="ghost"
        size="sm"
        className="self-start"
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Retour à la boîte de réception"
      >
        <Icon as={ChevronLeft} className="size-4" />
        <Text>Boîte de réception</Text>
      </Button>

      {message.isPending ? (
        <Text className="text-muted-foreground text-xs">Chargement…</Text>
      ) : message.isError ? (
        <Text className="text-destructive text-sm">
          {message.error instanceof Error
            ? message.error.message
            : "Le mail n'a pas pu être chargé. Réessayez dans un instant."}
        </Text>
      ) : (
        <View className="gap-2">
          <Text className="text-lg font-semibold">{message.data.subject || "(sans objet)"}</Text>
          <Text className="text-muted-foreground text-xs">{`De : ${message.data.from}`}</Text>
          <Text className="text-muted-foreground text-xs">{`À : ${message.data.to}`}</Text>
          {message.data.date ? (
            <Text className="text-muted-foreground text-xs">
              {formatFullDay(new Date(message.data.date))}
            </Text>
          ) : null}
          <Text className="pt-2 text-sm" selectable>
            {message.data.text ??
              "Ce mail ne contient pas de texte (images ou pièces jointes seules)."}
          </Text>
        </View>
      )}
    </View>
  );
}
