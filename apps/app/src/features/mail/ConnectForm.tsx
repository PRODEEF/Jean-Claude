import { useState } from "react";
import { View } from "react-native";
import { MAIL_PROVIDERS, type MailProviderId } from "@jc/domain";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { SegmentedControl } from "@/shared/ui/segmented-control";
import { Text } from "@/shared/ui/text";
import { useConnectMail } from "./use-mail";

export function ConnectForm({ onDone }: { onDone?: () => void }) {
  const connect = useConnectMail();
  const [provider, setProvider] = useState<MailProviderId>(MAIL_PROVIDERS[0].id);
  const [address, setAddress] = useState("");
  const [password, setPassword] = useState("");
  const [host, setHost] = useState<string>(MAIL_PROVIDERS[0].host);

  const canSubmit = address.trim().length > 0 && password.length > 0 && !connect.isPending;
  const providerName = MAIL_PROVIDERS.find((entry) => entry.id === provider)?.label ?? "";

  return (
    <View className="gap-3">
      <Text className="text-sm">Reliez une boîte mail pour lire et écrire vos mails ici.</Text>

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
