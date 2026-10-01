import { Children, Fragment, useState, type ComponentProps, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronRight,
  LogOut,
  MessageSquareText,
  Palette,
  type LucideIcon,
} from "lucide-react-native";
import { ASSISTANT_ACCENTS, DEFAULT_ACCENT, MIN_TOUCH_TARGET, softenAccent } from "@jc/design";
import { ASSISTANT_MODELS, toCatalogueModel, type AssistantScope, type Theme } from "@jc/domain";
import { FeedbackDialog } from "@/features/feedback/FeedbackDialog";
import { AccountDeleteDialog } from "@/features/settings/AccountDeleteDialog";
import { useBreakpoint } from "@/shared/hooks/use-breakpoint";
import { useCurrentUser } from "@/shared/hooks/use-current-user";
import { useProfile, useUpdateProfile } from "@/shared/hooks/use-profile";
import { useAuth } from "@/shared/providers/auth-provider";
import { useTheme } from "@/shared/providers/theme-provider";
import { api } from "@/shared/lib/api";
import { cn } from "@/shared/lib/utils";
import { Avatar, AvatarFallback } from "@/shared/ui/avatar";
import { Button } from "@/shared/ui/button";
import { ColorPicker } from "@/shared/ui/color-picker";
import { Icon } from "@/shared/ui/icon";
import { Input } from "@/shared/ui/input";
import { FORM_MAX_WIDTH, ScreenShell } from "@/shared/ui/screen-shell";
import { SegmentedControl } from "@/shared/ui/segmented-control";
import { Select } from "@/shared/ui/select";
import { Separator } from "@/shared/ui/separator";
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
const CAPABILITIES: {
  key: keyof AssistantScope;
  label: string;
  hint: string;
  /** Réglable, mais rien n'est encore envoyé : dit par une pastille plutôt que noyé dans la phrase. */
  soon?: boolean;
}[] = [
  {
    key: "morningReminders",
    label: "Rappels du matin",
    hint: "Ce qui compte aujourd'hui, et le point du lundi.",
    soon: true,
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
 * Des groupes de lignes « libellé / contrôle » posés dans des cartes : c'est
 * la présentation des réglages d'iOS, de ChatGPT et de Claude (§4.2). Le titre
 * de chaque groupe prime sur ses lignes — l'œil trouve d'abord la section,
 * puis le réglage — et la carte dit sans ambiguïté ce qui va ensemble.
 *
 * La déconnexion vit dans la carte Compte, en haut de page : c'est là qu'on la
 * cherche, sans avoir à parcourir la page, et elle libère le bandeau d'un
 * bouton rouge qui n'annonçait rien de destructeur.
 */
export function SettingsScreen() {
  const { signOut } = useAuth();
  const { palette } = useTheme();
  const { displayName, initials } = useCurrentUser();
  const { data: profile } = useProfile();
  const updateProfile = useUpdateProfile();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);

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

  // La pastille « Personnalisée » se rouvre d'elle-même si la couleur active
  // n'est déjà aucun des huit presets — sans quoi choisir une teinte brute
  // puis revenir sur cet écran ferait croire qu'elle a été perdue.
  const presetAccent = ASSISTANT_ACCENTS.find(
    (option) => option.value.toLowerCase() === accent.toLowerCase(),
  );
  const [customRequested, setCustomRequested] = useState(false);
  const showColorPicker = customRequested || !presetAccent;

  // Tant que rien n'a été choisi, c'est le modèle du serveur qui répond : on
  // coche l'entrée qui lui correspond plutôt que de n'en cocher aucune, sans
  // quoi la page laisserait croire qu'aucun modèle n'est actif.
  const chosenModel = profile?.preferences.llmModel ?? null;
  const servedModel = health.data ? toCatalogueModel(health.data.llm.model) : null;
  const activeModel = chosenModel ?? servedModel;
  const activeModelChoice = ASSISTANT_MODELS.find((model) => model.id === activeModel);

  return (
    <ScreenShell title="Réglages" maxWidth={FORM_MAX_WIDTH}>
      <View className="gap-8 pb-8">
        <Section title="Compte">
          <View className="flex-row items-center gap-3 px-4 py-4">
            <Avatar alt={`Avatar de ${displayName}`} className="size-11">
              <AvatarFallback className="bg-primary">
                <Text className="text-base font-semibold text-primary-foreground">{initials}</Text>
              </AvatarFallback>
            </Avatar>
            <View className="min-w-0 flex-1">
              <Text className="text-base font-semibold" numberOfLines={1}>
                {displayName}
              </Text>
              <Text className="text-sm text-muted-foreground" numberOfLines={1}>
                {profile?.email ?? ""}
              </Text>
            </View>
          </View>

          <SettingRow label="Pseudo" hint="Le nom affiché dans le bandeau." wide>
            <SaveableInput
              value={pseudo}
              onChangeText={setDraftPseudo}
              canSave={canSavePseudo}
              saving={updateProfile.isPending}
              onSave={() => updateProfile.mutate({ displayName: trimmedPseudo })}
              placeholder="Votre pseudo"
              maxLength={80}
              autoComplete="name"
              textContentType="nickname"
              accessibilityLabel="Pseudo"
            />
          </SettingRow>

          <ActionRow icon={LogOut} label="Se déconnecter" onPress={() => void signOut()} />
        </Section>

        <Section title="Assistant">
          <SettingRow label="Nom" hint="Comment il se présente dans vos conversations." wide>
            <SaveableInput
              value={assistantName}
              onChangeText={setDraftName}
              canSave={canSaveName}
              saving={updateProfile.isPending}
              onSave={() => updateProfile.mutate({ assistantName: trimmedName })}
              placeholder="Jean-Claude"
              maxLength={40}
              accessibilityLabel="Nom de l'assistant"
            />
          </SettingRow>

          <SettingRow
            label="Modèle"
            // Le bénéfice du modèle actif, sous le libellé : le menu fermé
            // n'en montre que le nom, qui ne dit rien à qui ne les connaît pas.
            hint={
              activeModelChoice
                ? `${activeModelChoice.benefit}${activeModelChoice.sovereign ? " Hébergé en Europe." : ""}`
                : "Aucun de ces modèles n'est actif pour l'instant : choisissez-en un."
            }
            wide
          >
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
          </SettingRow>

          <SettingRow label="Thème">
            <SegmentedControl
              options={THEMES}
              value={theme}
              onChange={(value) => updateProfile.mutate({ theme: value })}
            />
          </SettingRow>

          <View className="gap-3 px-4 py-3">
            <RowLabel
              label="Couleur"
              hint={
                presetAccent && !showColorPicker
                  ? `${presetAccent.label} · bandeau, bulles et boutons.`
                  : "Personnalisée · bandeau, bulles et boutons."
              }
            />

            {/* Chaque pastille montre la couleur telle qu'elle apparaîtra en
                thème clair et en thème sombre : c'est sur ces deux aplats
                qu'elle se voit vraiment — bannière et bulles — et l'un des deux
                seul ne dit rien du rendu de l'autre. Le cercle plein au centre
                donne la teinte franche, celle des boutons. */}
            <View className="flex-row flex-wrap gap-3" accessibilityRole="radiogroup">
              {ASSISTANT_ACCENTS.map((option) => {
                const color = option.value;
                const selected = !showColorPicker && color.toLowerCase() === accent.toLowerCase();

                return (
                  <Pressable
                    key={option.value}
                    onPress={() => {
                      setCustomRequested(false);
                      updateProfile.mutate({ assistantColor: color });
                    }}
                    disabled={updateProfile.isPending}
                    // Une rangée de pastilles de 44 pt paraîtrait grossière ;
                    // le `hitSlop` rétablit la cible tactile sans grossir le
                    // dessin, comme sur les boutons de la barre latérale.
                    hitSlop={(MIN_TOUCH_TARGET - SWATCH_SIZE) / 2}
                    style={[
                      styles.swatch,
                      { borderColor: selected ? color : palette.border },
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
                          { backgroundColor: softenAccent(color, "light") },
                        ]}
                      />
                      <View
                        style={[styles.swatchHalf, { backgroundColor: previewDarkHalf(color) }]}
                      />
                    </View>
                    <View style={[styles.swatchCore, { backgroundColor: color }]} />
                  </Pressable>
                );
              })}

              {/* Neuvième pastille, hors du catalogue fermé : elle ouvre le
                  sélecteur libre plutôt que d'appliquer une teinte à elle
                  seule, et se coche d'elle-même quand la couleur active n'est
                  déjà aucun des huit presets. */}
              <Pressable
                onPress={() => setCustomRequested(true)}
                disabled={updateProfile.isPending}
                hitSlop={(MIN_TOUCH_TARGET - SWATCH_SIZE) / 2}
                style={[
                  styles.swatch,
                  {
                    backgroundColor: palette.surface,
                    borderColor: showColorPicker ? accent : palette.border,
                  },
                  showColorPicker && styles.swatchSelected,
                ]}
                accessibilityRole="radio"
                accessibilityState={{ selected: showColorPicker }}
                accessibilityLabel="Couleur personnalisée"
              >
                <Icon as={Palette} size={18} className="text-muted-foreground" />
              </Pressable>
            </View>

            {showColorPicker ? (
              <ColorPicker
                value={accent}
                onChange={(hex) => updateProfile.mutate({ assistantColor: hex })}
              />
            ) : null}
          </View>
        </Section>

        <Section
          title="Ce qu'il peut vous proposer"
          description="Il propose toujours, il n'agit jamais seul : vous acceptez ou vous ignorez d'un geste. Ce qui est désactivé ici ne vous sera plus proposé."
        >
          {CAPABILITIES.map((capability) => (
            <SettingRow
              key={capability.key}
              label={capability.label}
              hint={capability.hint}
              soon={capability.soon}
            >
              <Switch
                value={scope?.[capability.key] ?? true}
                onValueChange={(value) =>
                  updateProfile.mutate({ scope: { [capability.key]: value } })
                }
                disabled={!scope || updateProfile.isPending}
                accessibilityLabel={capability.label}
              />
            </SettingRow>
          ))}
        </Section>

        <Section title="Aide">
          <ActionRow
            icon={MessageSquareText}
            label="Donner votre avis"
            hint="Une idée, une gêne, un bug : tout nous intéresse."
            onPress={() => setFeedbackOpen(true)}
            chevron
          />
        </Section>

        {/* À part et en dernier : une action irréversible ne se range pas
            parmi les réglages qu'on bascule sans y penser. */}
        <Section>
          <SettingRow
            label="Supprimer mon compte"
            hint="Efface définitivement vos conversations, dossiers, listes et calendrier."
            destructive
          >
            <Button
              variant="outline"
              size="sm"
              onPress={() => setDeleteAccountOpen(true)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Supprimer mon compte"
            >
              <Text className="text-destructive">Supprimer</Text>
            </Button>
          </SettingRow>
        </Section>

        {updateProfile.isError ? (
          <Text className="text-sm text-destructive">
            Vos réglages n'ont pas pu être enregistrés. Réessayez.
          </Text>
        ) : null}
      </View>

      <FeedbackDialog open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
      <AccountDeleteDialog open={deleteAccountOpen} onClose={() => setDeleteAccountOpen(false)} />
    </ScreenShell>
  );
}

/**
 * Groupe de réglages : un titre, puis ses lignes dans une carte.
 *
 * Le filet entre deux lignes est posé ici plutôt que par chaque ligne : une
 * ligne conditionnelle qui disparaît n'y laisse ni trait orphelin ni double
 * trait.
 */
function Section({
  title,
  description,
  children,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
}) {
  const rows = Children.toArray(children);

  return (
    <View className="gap-3">
      {title ? (
        <View className="gap-1 px-1">
          <Text className="text-base font-semibold" role="heading">
            {title}
          </Text>
          {description ? (
            <Text className="text-sm text-muted-foreground">{description}</Text>
          ) : null}
        </View>
      ) : null}

      <View className="overflow-hidden rounded-xl border border-border bg-card">
        {rows.map((row, index) => (
          <Fragment key={index}>
            {index > 0 ? <Separator /> : null}
            {row}
          </Fragment>
        ))}
      </View>
    </View>
  );
}

function RowLabel({
  label,
  hint,
  soon = false,
  destructive = false,
}: {
  label: string;
  hint?: string | undefined;
  soon?: boolean | undefined;
  destructive?: boolean;
}) {
  return (
    <View className="min-w-0 flex-1 gap-0.5">
      <View className="flex-row flex-wrap items-center gap-2">
        <Text className={cn("text-sm font-medium", destructive && "text-destructive")}>
          {label}
        </Text>
        {soon ? (
          <View className="rounded-full bg-muted px-2 py-0.5">
            <Text className="text-xs font-medium text-muted-foreground">Bientôt</Text>
          </View>
        ) : null}
      </View>
      {hint ? <Text className="text-sm text-muted-foreground">{hint}</Text> : null}
    </View>
  );
}

/**
 * Ligne « libellé / contrôle ».
 *
 * `wide` réserve au contrôle une largeur fixe — un champ ou un menu qui
 * prendrait sa largeur naturelle ferait onduler la colonne de droite d'une
 * ligne à l'autre. Sur téléphone, il passe sous le libellé : à côté, il ne
 * resterait de place ni à l'un ni à l'autre.
 */
function SettingRow({
  label,
  hint,
  soon,
  destructive,
  wide = false,
  children,
}: {
  label: string;
  hint?: string;
  soon?: boolean | undefined;
  destructive?: boolean;
  wide?: boolean;
  children: ReactNode;
}) {
  const compact = useBreakpoint() === "compact";
  const stacked = wide && compact;

  return (
    <View
      className={cn("gap-3 px-4 py-3", stacked ? "flex-col" : "flex-row items-center gap-4")}
      style={{ minHeight: MIN_TOUCH_TARGET + 12 }}
    >
      <RowLabel
        label={label}
        hint={hint}
        soon={soon}
        {...(destructive !== undefined ? { destructive } : {})}
      />
      <View className={cn(wide && (stacked ? "w-full" : "w-64"))}>{children}</View>
    </View>
  );
}

/** Ligne entière cliquable — ouvre une fenêtre ou déclenche une action. */
function ActionRow({
  icon,
  label,
  hint,
  onPress,
  chevron = false,
}: {
  icon: LucideIcon;
  label: string;
  hint?: string;
  onPress: () => void;
  chevron?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-3 px-4 py-3 active:bg-accent web:hover:bg-accent"
      style={{ minHeight: MIN_TOUCH_TARGET + 12 }}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Icon as={icon} size={18} className="text-muted-foreground" />
      <RowLabel label={label} hint={hint} />
      {chevron ? <Icon as={ChevronRight} size={16} className="text-muted-foreground" /> : null}
    </Pressable>
  );
}

/**
 * Champ d'identité à enregistrement explicite.
 *
 * Explicite plutôt qu'à la perte de focus : sur un champ d'identité,
 * l'utilisateur doit voir qu'il a validé. Le bouton n'apparaît qu'une fois la
 * valeur modifiée — grisé en permanence, il ajoutait deux boutons inertes à la
 * page — et disparaît à l'enregistrement, ce qui vaut confirmation.
 */
function SaveableInput({
  canSave,
  saving,
  onSave,
  ...inputProps
}: ComponentProps<typeof Input> & {
  canSave: boolean;
  saving: boolean;
  onSave: () => void;
}) {
  return (
    <View className="flex-row gap-2">
      <Input
        {...inputProps}
        onSubmitEditing={() => {
          if (canSave && !saving) onSave();
        }}
        returnKeyType="done"
        // 44 pt, la hauteur du menu Modèle : les contrôles de la colonne de
        // droite s'alignent d'une ligne à l'autre.
        className="h-11 flex-1 sm:h-11"
      />
      {canSave ? (
        <Button
          disabled={saving}
          onPress={onSave}
          className="h-11 sm:h-11"
          accessibilityRole="button"
        >
          <Text>Enregistrer</Text>
        </Button>
      ) : null}
    </View>
  );
}

/**
 * Aperçu de la moitié sombre de la pastille — cet écran seulement.
 *
 * `softenAccent(color, "dark")` mélange à 72 % de noir : c'est le bon aplat
 * pour une grande surface (bulles, calendrier), mais sur un disque de 20 px il
 * écrase la teinte au point de rendre les huit pastilles indiscernables les
 * unes des autres. Un mélange plus léger, propre à cet aperçu : l'aplat réel
 * du reste de l'app garde `softenAccent`, inchangé.
 */
function previewDarkHalf(hex: string): string {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) return hex;

  const kept = 0.55;
  const channel = (offset: number) =>
    Math.round(parseInt(normalized.slice(offset, offset + 2), 16) * kept);

  return `#${[0, 2, 4].map((offset) => channel(offset).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Pastille de couleur.
 *
 * En `StyleSheet` et non en classes utilitaires : les deux moitiés se
 * superposent en absolu et la teinte vient d'une donnée, pas d'un jeton — les
 * classes ne sauraient pas l'exprimer sans style en ligne de toute façon.
 */
const SWATCH_SIZE = 36;

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
