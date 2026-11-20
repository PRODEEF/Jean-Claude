import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { ChevronLeft } from "lucide-react-native";
import type { MailAccount, MailDraft } from "@jc/domain";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { Input } from "@/shared/ui/input";
import { Text } from "@/shared/ui/text";
import { useSendMail } from "./use-mail";

/** Le temps pour se raviser : le mail ne part qu'une fois ce délai écoulé. */
const UNDO_DELAY_MS = 5000;

/** « a@b.fr, c@d.fr » → liste d'adresses ; la validation fine reste au serveur. */
function parseRecipients(value: string): string[] {
  return value
    .split(/[\s,;]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/**
 * Rédaction d'un mail (nouveau, réponse, transfert).
 *
 * Écrit par l'utilisateur lui-même : l'assistant ne rédige ni n'envoie jamais
 * à sa place (§12.1). Texte seul, pas de pièce jointe à l'envoi pour l'instant.
 */
export function MailCompose({
  accounts,
  accountId,
  draft,
  onClose,
}: {
  accounts: MailAccount[];
  accountId: string;
  draft: MailDraft;
  onClose: () => void;
}) {
  const send = useSendMail();
  const [from, setFrom] = useState(accountId);
  const [to, setTo] = useState(draft.to.join(", "));
  const [cc, setCc] = useState(draft.cc.join(", "));
  const [bcc, setBcc] = useState("");
  const [showCopies, setShowCopies] = useState(draft.cc.length > 0);
  const [subject, setSubject] = useState(draft.subject);
  const [text, setText] = useState(draft.text);
  // Compte à rebours de « Annuler l'envoi » : non nul tant que le mail n'est pas parti.
  const [leaving, setLeaving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const recipients = parseRecipients(to);
  const canSend = recipients.length + parseRecipients(cc).length + parseRecipients(bcc).length > 0;

  const startSending = () => {
    setLeaving(true);
    timer.current = setTimeout(() => {
      send.mutate(
        {
          accountId: from,
          mail: {
            to: recipients,
            cc: parseRecipients(cc),
            bcc: parseRecipients(bcc),
            subject,
            text,
            ...(draft.inReplyTo ? { inReplyTo: draft.inReplyTo } : {}),
          },
        },
        {
          onSuccess: onClose,
          // Parti de travers : on rend la main, le brouillon est intact.
          onError: () => setLeaving(false),
        },
      );
    }, UNDO_DELAY_MS);
  };

  const cancelSending = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setLeaving(false);
  };

  const locked = leaving;

  return (
    <View className="flex-1">
      <View className="border-border flex-row items-center justify-between border-b px-2 py-1">
        <Button
          variant="ghost"
          size="sm"
          onPress={onClose}
          disabled={locked}
          accessibilityRole="button"
          accessibilityLabel="Fermer sans envoyer"
        >
          <Icon as={ChevronLeft} className="size-4" />
          <Text>Fermer</Text>
        </Button>
        {leaving ? (
          <Button
            variant="outline"
            size="sm"
            onPress={cancelSending}
            disabled={send.isPending}
            accessibilityRole="button"
            accessibilityLabel="Annuler l'envoi"
          >
            <Text>{send.isPending ? "Envoi…" : "Annuler l'envoi"}</Text>
          </Button>
        ) : (
          <Button
            size="sm"
            disabled={!canSend}
            onPress={startSending}
            accessibilityRole="button"
            accessibilityLabel="Envoyer"
          >
            <Text>Envoyer</Text>
          </Button>
        )}
      </View>

      <ScrollView className="flex-1" contentContainerClassName="gap-3 p-4">
        {leaving && !send.isPending ? (
          <Text className="text-muted-foreground text-xs">
            Le mail part dans quelques secondes. Appuyez sur « Annuler l'envoi » pour le retenir.
          </Text>
        ) : null}

        {accounts.length > 1 ? (
          <View className="gap-1">
            <Text className="text-muted-foreground text-xs">De</Text>
            <View className="flex-row flex-wrap gap-1">
              {accounts.map((account) => (
                <Pressable
                  key={account.id}
                  disabled={locked}
                  onPress={() => setFrom(account.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: from === account.id }}
                  accessibilityLabel={`Écrire depuis ${account.address}`}
                  className={
                    from === account.id
                      ? "bg-primary rounded-md px-3 py-2"
                      : "border-border rounded-md border px-3 py-2"
                  }
                >
                  <Text
                    className={from === account.id ? "text-primary-foreground text-sm" : "text-sm"}
                  >
                    {account.address}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : (
          <Text className="text-muted-foreground text-xs">
            {`De : ${accounts.find((account) => account.id === from)?.address ?? ""}`}
          </Text>
        )}

        <View className="gap-1">
          <Text className="text-muted-foreground text-xs">À</Text>
          <Input
            value={to}
            onChangeText={setTo}
            editable={!locked}
            placeholder="destinataire@exemple.fr"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            accessibilityLabel="Destinataires"
          />
        </View>

        {showCopies ? (
          <>
            <View className="gap-1">
              <Text className="text-muted-foreground text-xs">Cc</Text>
              <Input
                value={cc}
                onChangeText={setCc}
                editable={!locked}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                accessibilityLabel="Destinataires en copie"
              />
            </View>
            <View className="gap-1">
              <Text className="text-muted-foreground text-xs">Cci (copie cachée)</Text>
              <Input
                value={bcc}
                onChangeText={setBcc}
                editable={!locked}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                accessibilityLabel="Destinataires en copie cachée"
              />
            </View>
          </>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="self-start"
            onPress={() => setShowCopies(true)}
            accessibilityRole="button"
            accessibilityLabel="Ajouter Cc et Cci"
          >
            <Text>Cc / Cci</Text>
          </Button>
        )}

        <View className="gap-1">
          <Text className="text-muted-foreground text-xs">Objet</Text>
          <Input
            value={subject}
            onChangeText={setSubject}
            editable={!locked}
            accessibilityLabel="Objet"
          />
        </View>

        <View className="gap-1">
          <Text className="text-muted-foreground text-xs">Message</Text>
          <Input
            value={text}
            onChangeText={setText}
            editable={!locked}
            multiline
            textAlignVertical="top"
            className="h-auto min-h-[240px] py-2"
            accessibilityLabel="Message"
          />
        </View>

        {send.isError ? (
          <Text className="text-destructive text-sm">
            {send.error instanceof Error
              ? send.error.message
              : "Le mail n'a pas pu être envoyé. Réessayez."}
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}
