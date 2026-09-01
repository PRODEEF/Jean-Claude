import { useState, type ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { Theme } from "@jc/domain";
import { useProfile, useUpdateProfile } from "@/shared/hooks/use-profile";
import { useAuth } from "@/shared/providers/auth-provider";
import { api } from "@/shared/lib/api";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Separator } from "@/shared/ui/separator";
import { Text } from "@/shared/ui/text";

const THEMES: { value: Theme; label: string }[] = [
  { value: "light", label: "Clair" },
  { value: "dark", label: "Sombre" },
  { value: "system", label: "Système" },
];

/**
 * Réglages du compte — seule page de compte de l'application.
 *
 * Identité et préférences ont d'abord vécu sur deux écrans, en pariant qu'on
 * ne vient jamais y faire les deux choses en même temps. À l'usage c'est
 * faux : l'écran de profil ne portait qu'un nom, une adresse et un lien vers
 * ici. Les deux sont donc fusionnés, et la pastille de la bannière ouvre
 * directement cette page.
 *
 * Une liste de lignes « libellé / contrôle » : ChatGPT, Claude et Perplexity
 * présentent tous leurs réglages ainsi (§4.2), et une page de préférences n'a
 * pas à attirer l'œil.
 */
export function SettingsScreen() {
  const { signOut } = useAuth();
  const { data: profile } = useProfile();
  const updateProfile = useUpdateProfile();

  const health = useQuery({ queryKey: ["health"], queryFn: () => api.health.check() });

  const [draftPseudo, setDraftPseudo] = useState<string | null>(null);
  const savedPseudo = profile?.displayName ?? "";
  // Tant que le champ n'a pas été touché, il suit la valeur du serveur : sinon
  // il resterait vide le temps que le profil arrive.
  const pseudo = draftPseudo ?? savedPseudo;
  const trimmedPseudo = pseudo.trim();
  const canSavePseudo = trimmedPseudo.length > 0 && trimmedPseudo !== savedPseudo;

  const theme = profile?.preferences.theme ?? "system";

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="p-6">
      <View className="w-full max-w-2xl gap-8 self-center">
        <Text className="text-2xl font-semibold text-foreground">Réglages</Text>

        <Section title="Compte">
          <Field label="Adresse e-mail" hint="Non modifiable">
            <Input
              value={profile?.email ?? ""}
              editable={false}
              accessibilityLabel="Adresse e-mail"
              autoComplete="email"
              textContentType="emailAddress"
              keyboardType="email-address"
            />
          </Field>

          <Field label="Pseudo">
            <View className="flex-row gap-2">
              <Input
                value={pseudo}
                onChangeText={setDraftPseudo}
                placeholder="Votre pseudo"
                maxLength={80}
                autoComplete="name"
                textContentType="nickname"
                accessibilityLabel="Pseudo"
                className="flex-1"
              />
              {/* Enregistrement explicite plutôt qu'à la perte de focus : sur
                  un champ d'identité, l'utilisateur doit voir qu'il a validé.
                  Aligné sur la hauteur du champ, le bouton descend sous les
                  44 pt de `MIN_TOUCH_TARGET` : le `hitSlop` les rétablit sans
                  désaligner la rangée, comme dans la barre latérale. */}
              <Button
                variant="outline"
                disabled={!canSavePseudo || updateProfile.isPending}
                onPress={() => updateProfile.mutate({ displayName: trimmedPseudo })}
                hitSlop={8}
                accessibilityRole="button"
              >
                <Text>Enregistrer</Text>
              </Button>
            </View>
          </Field>
        </Section>

        <Section title="Assistant">
          <Field label="Modèle" hint="Bientôt modifiable">
            <View className="h-10 justify-center rounded-md border border-border px-3 opacity-50 sm:h-9">
              <Text className="text-base text-foreground">{health.data?.llm.model ?? "—"}</Text>
            </View>
          </Field>
        </Section>

        <Section title="Apparence">
          <Field label="Thème">
            {/* Un groupe segmenté plutôt que trois boutons juxtaposés : les
                options sont exclusives, et celle en cours doit se lire d'un
                coup d'œil. */}
            <View
              className="flex-row gap-1 rounded-md border border-border p-1"
              accessibilityRole="radiogroup"
            >
              {THEMES.map((option) => (
                <Button
                  key={option.value}
                  variant={option.value === theme ? "default" : "ghost"}
                  disabled={updateProfile.isPending}
                  onPress={() => updateProfile.mutate({ theme: option.value })}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: option.value === theme }}
                  className="h-11 flex-1 sm:h-11"
                >
                  <Text>{option.label}</Text>
                </Button>
              ))}
            </View>
          </Field>
        </Section>

        {updateProfile.isError ? (
          <Text className="text-sm text-destructive">
            Vos réglages n'ont pas pu être enregistrés. Réessayez.
          </Text>
        ) : null}

        <Separator />

        <Button variant="outline" onPress={() => void signOut()} accessibilityRole="button">
          <Text className="text-destructive">Se déconnecter</Text>
        </Button>
      </View>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="gap-5">
      <Text className="text-sm font-medium text-muted-foreground">{title}</Text>
      {children}
    </View>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <View className="gap-2">
      <View className="flex-row items-baseline justify-between gap-3">
        <Text className="text-base text-foreground">{label}</Text>
        {hint ? <Text className="text-sm text-muted-foreground">{hint}</Text> : null}
      </View>
      {children}
    </View>
  );
}
