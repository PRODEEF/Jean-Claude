import { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { ASSISTANT_ACCENTS, DEFAULT_ACCENT, MIN_TOUCH_TARGET, softenAccent } from "@jc/design";
import { ASSISTANT_MODELS, type AssistantScope, type Theme } from "@jc/domain";
import { useProfile, useUpdateProfile } from "@/shared/hooks/use-profile";
import { useAuth } from "@/shared/providers/auth-provider";
import { useTheme } from "@/shared/providers/theme-provider";
import { api } from "@/shared/lib/api";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { FORM_MAX_WIDTH, ScreenShell } from "@/shared/ui/screen-shell";
import { Select } from "@/shared/ui/select";
import { Switch } from "@/shared/ui/switch";
import { Text } from "@/shared/ui/text";

const THEMES: { value: Theme; label: string }[] = [
  { value: "light", label: "Clair" },
  { value: "dark", label: "Sombre" },
  { value: "system", label: "Système" },
];

/**
 * Capacités que l'utilisateur laisse à l'assistant (A.10).
 *
 * Les cinq du schéma, et pas seulement les trois de la maquette : le serveur
 * les applique déjà toutes, et en cacher deux laisserait l'assistant agir de
 * lui-même sans que rien dans l'interface ne permette de l'en empêcher.
 *
 * Libellés sans jargon (§13.4.4) : on décrit ce que l'assistant fait, pas le
 * nom technique de la capacité.
 */
const CAPABILITIES: { key: keyof AssistantScope; label: string; hint: string }[] = [
  {
    key: "morningReminders",
    label: "Rappels du matin",
    hint: "Ce qui compte aujourd'hui, et le point du lundi sur la semaine.",
  },
  {
    key: "folderOrganization",
    label: "Aide au rangement",
    hint: "Proposer dans quels dossiers ranger une conversation.",
  },
  {
    key: "structureSuggestions",
    label: "Dossiers pour un projet",
    hint: "Proposer une structure de dossiers quand un projet se dessine.",
  },
  {
    key: "proactiveTaskDetection",
    label: "Listes repérées au fil de l'eau",
    hint: "Proposer une todoliste ou une liste d'achats née d'un échange.",
  },
  {
    key: "proactiveScheduling",
    label: "Échéances et rendez-vous",
    hint: "Proposer de poser une date sur ce qui en mérite une.",
  },
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
 *
 * Même ossature que les autres écrans : le titre vit dans le bandeau, et la
 * déconnexion en est la commande de droite — c'est la place des actions
 * d'écran ici, et un bouton perdu au bas d'une page longue se cherche.
 */
export function SettingsScreen() {
  const { signOut } = useAuth();
  const { palette } = useTheme();
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

  const [draftName, setDraftName] = useState<string | null>(null);
  const savedName = profile?.preferences.assistantName ?? "";
  const assistantName = draftName ?? savedName;
  const trimmedName = assistantName.trim();
  const canSaveName = trimmedName.length > 0 && trimmedName !== savedName;

  const theme = profile?.preferences.theme ?? "system";
  const accent = profile?.preferences.assistantColor ?? DEFAULT_ACCENT;
  const scope = profile?.preferences.scope;

  // Tant que rien n'a été choisi, c'est le modèle du serveur qui répond : on
  // coche l'entrée qui lui correspond plutôt que de n'en cocher aucune, sans
  // quoi la page laisserait croire qu'aucun modèle n'est actif.
  const chosenModel = profile?.preferences.llmModel ?? null;
  const servedModel = health.data?.llm.model ?? null;
  const activeModel = chosenModel ?? servedModel;

  return (
    <ScreenShell
      title="Réglages"
      maxWidth={FORM_MAX_WIDTH}
      action={
        <Button
          variant="outline"
          size="sm"
          onPress={() => void signOut()}
          accessibilityRole="button"
          accessibilityLabel="Se déconnecter"
        >
          <Text className="text-destructive">Se déconnecter</Text>
        </Button>
      }
    >
      <View className="gap-8">
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
          <Field label="Son nom">
            <View className="flex-row gap-2">
              <Input
                value={assistantName}
                onChangeText={setDraftName}
                placeholder="Jean-Claude"
                maxLength={40}
                accessibilityLabel="Nom de l'assistant"
                className="flex-1"
              />
              <Button
                variant="outline"
                disabled={!canSaveName || updateProfile.isPending}
                onPress={() => updateProfile.mutate({ assistantName: trimmedName })}
                hitSlop={8}
                accessibilityRole="button"
              >
                <Text>Enregistrer</Text>
              </Button>
            </View>
          </Field>

          <Field label="Sa couleur">
            {/* Chaque pastille montre la couleur telle qu'elle apparaîtra en
                thème clair et en thème sombre : c'est sur ces deux aplats
                qu'elle se voit vraiment — bannière et bulles — et l'un des deux
                seul ne dit rien du rendu de l'autre. Le cercle plein au centre
                donne la teinte franche, celle des boutons. */}
            <View className="flex-row flex-wrap gap-3" accessibilityRole="radiogroup">
              {ASSISTANT_ACCENTS.map((option) => {
                const selected = option.value.toLowerCase() === accent.toLowerCase();

                return (
                  <Pressable
                    key={option.value}
                    onPress={() => updateProfile.mutate({ assistantColor: option.value })}
                    disabled={updateProfile.isPending}
                    // Une rangée de pastilles de 44 pt paraîtrait grossière ;
                    // le `hitSlop` rétablit la cible tactile sans grossir le
                    // dessin, comme sur les boutons de la barre latérale.
                    hitSlop={(MIN_TOUCH_TARGET - SWATCH_SIZE) / 2}
                    style={[
                      styles.swatch,
                      { borderColor: selected ? option.value : palette.border },
                      selected && styles.swatchSelected,
                    ]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={option.label}
                  >
                    <View style={styles.swatchHalves}>
                      <View
                        style={[
                          styles.swatchHalf,
                          { backgroundColor: softenAccent(option.value, "light") },
                        ]}
                      />
                      <View
                        style={[
                          styles.swatchHalf,
                          { backgroundColor: softenAccent(option.value, "dark") },
                        ]}
                      />
                    </View>
                    <View style={[styles.swatchCore, { backgroundColor: option.value }]} />
                  </Pressable>
                );
              })}
            </View>
          </Field>

          <Field label="Modèle">
            <Select
              value={activeModel}
              options={ASSISTANT_MODELS.map((model) => ({
                value: model.id,
                label: model.label,
                description: model.sovereign
                  ? `${model.benefit} Hébergé en Europe.`
                  : model.benefit,
              }))}
              onChange={(id) => updateProfile.mutate({ llmModel: id })}
              placeholder="Choisir un modèle"
              disabled={updateProfile.isPending}
              accessibilityLabel="Modèle"
            />
            {activeModel === null ? (
              <Text className="text-sm text-muted-foreground">
                Aucun de ces modèles n'est actif pour l'instant : choisissez-en un.
              </Text>
            ) : null}
          </Field>
        </Section>

        <Section title="Ce qu'il peut proposer de lui-même">
          <Text className="-mt-3 text-sm text-muted-foreground">
            Il propose toujours, il n'agit jamais seul : vous acceptez ou vous ignorez d'un geste.
            Ce qui est désactivé ici ne vous sera plus proposé.
          </Text>

          {CAPABILITIES.map((capability) => (
            <View key={capability.key} className="flex-row items-center gap-3">
              <View className="flex-1">
                <Text className="text-base text-foreground">{capability.label}</Text>
                <Text className="text-sm text-muted-foreground">{capability.hint}</Text>
              </View>
              <Switch
                value={scope?.[capability.key] ?? true}
                onValueChange={(value) =>
                  updateProfile.mutate({ scope: { [capability.key]: value } })
                }
                disabled={!scope || updateProfile.isPending}
                accessibilityLabel={capability.label}
              />
            </View>
          ))}
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
      </View>
    </ScreenShell>
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

/**
 * Pastille de couleur.
 *
 * En `StyleSheet` et non en classes utilitaires : les deux moitiés se
 * superposent en absolu et la teinte vient d'une donnée, pas d'un jeton — les
 * classes ne sauraient pas l'exprimer sans style en ligne de toute façon.
 */
const SWATCH_SIZE = 40;

const styles = StyleSheet.create({
  swatch: {
    width: SWATCH_SIZE,
    height: SWATCH_SIZE,
    borderRadius: SWATCH_SIZE / 2,
    borderWidth: 2,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  swatchSelected: { borderWidth: 3 },
  swatchHalves: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    flexDirection: "row",
  },
  swatchHalf: { flex: 1 },
  swatchCore: { width: SWATCH_SIZE / 2.5, height: SWATCH_SIZE / 2.5, borderRadius: SWATCH_SIZE },
});

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
