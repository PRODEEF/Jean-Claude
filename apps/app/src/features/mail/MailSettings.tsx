import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { ChevronLeft } from "lucide-react-native";
import type { MailAccount } from "@jc/domain";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { Text } from "@/shared/ui/text";
import { ConnectForm } from "./ConnectForm";
import { useDisconnectMail } from "./use-mail";

/**
 * Paramètres de la messagerie : les boîtes reliées (avec « Retirer ») et l'ajout
 * d'une nouvelle. Remplace le bouton « Ajouter une boîte » et le « Retirer » qui
 * s'affichait à côté de chaque boîte dans l'arbre (demande de Yann, 23 novembre).
 */
export function MailSettings({
  accounts,
  onClose,
}: {
  accounts: MailAccount[];
  onClose: () => void;
}) {
  return (
    <View className="flex-1">
      <View className="border-border flex-row items-center border-b px-2 py-1">
        <Button
          variant="ghost"
          size="sm"
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Fermer les paramètres"
        >
          <Icon as={ChevronLeft} className="size-4" />
          <Text>Retour aux mails</Text>
        </Button>
      </View>

      <ScrollView className="flex-1" contentContainerClassName="gap-6 p-4">
        <View className="w-full max-w-[560px] gap-6 self-center">
          <Text className="text-lg font-semibold">Paramètres de la messagerie</Text>

          <View className="gap-2">
            <Text className="text-sm font-semibold">Mes boîtes</Text>
            {accounts.length === 0 ? (
              <Text className="text-muted-foreground text-sm">Aucune boîte reliée.</Text>
            ) : (
              accounts.map((account) => <AccountRow key={account.id} account={account} />)
            )}
          </View>

          <View className="gap-2">
            <Text className="text-sm font-semibold">Ajouter une boîte</Text>
            <ConnectForm onDone={onClose} />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function AccountRow({ account }: { account: MailAccount }) {
  const disconnect = useDisconnectMail();
  const [confirming, setConfirming] = useState(false);

  // Un seul appui ne retire pas la boîte : il demande confirmation, et l'oublie
  // au bout de quelques secondes.
  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setConfirming(false), 4000);
    return () => clearTimeout(timer);
  }, [confirming]);

  return (
    <View className="border-border gap-1 rounded-md border p-3">
      <View className="flex-row items-center gap-2">
        <View className="min-w-0 flex-1">
          <Text className="font-semibold" numberOfLines={1}>
            {account.address}
          </Text>
          <Text className="text-muted-foreground text-xs" numberOfLines={1}>
            {account.host}
          </Text>
        </View>
        <Button
          variant={confirming ? "destructive" : "outline"}
          size="sm"
          disabled={disconnect.isPending}
          onPress={() => (confirming ? disconnect.mutate(account.id) : setConfirming(true))}
          accessibilityRole="button"
          accessibilityLabel={
            confirming
              ? `Confirmer le retrait de la boîte ${account.address}`
              : `Retirer la boîte ${account.address}`
          }
        >
          <Text>{confirming ? "Retirer ?" : "Retirer"}</Text>
        </Button>
      </View>
      {confirming ? (
        <Text className="text-muted-foreground text-xs">
          Vos mails restent chez votre fournisseur ; seule la liaison avec Jean-Claude est coupée.
        </Text>
      ) : null}
      {disconnect.isError ? (
        <Text className="text-destructive text-xs">
          {disconnect.error instanceof Error
            ? disconnect.error.message
            : "La boîte n'a pas pu être retirée. Réessayez."}
        </Text>
      ) : null}
    </View>
  );
}
