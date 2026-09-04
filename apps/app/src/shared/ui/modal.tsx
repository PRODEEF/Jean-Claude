import { Fragment, type ReactNode } from "react";
import { Platform, ScrollView, View, type GestureResponderEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as DialogPrimitive from "@rn-primitives/dialog";
import { X } from "lucide-react-native";
import { spacing } from "@jc/design";
import { FadeIn, FadeOut, ReduceMotion } from "react-native-reanimated";
import { FullWindowOverlay as RNFullWindowOverlay } from "react-native-screens";
import { useBreakpoint } from "@/shared/hooks/use-breakpoint";
import { useTheme } from "@/shared/providers/theme-provider";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { NativeOnlyAnimatedView } from "@/shared/ui/native-only-animated-view";
import { Text } from "@/shared/ui/text";

/** Sur iOS, la fenêtre doit sortir de la hiérarchie de l'écran pour couvrir la barre d'état. */
const FullWindowOverlay = Platform.OS === "ios" ? RNFullWindowOverlay : Fragment;

/** Un bouton du pied. Le dernier de la liste porte l'action principale. */
export type ModalAction = {
  label: string;
  onPress: () => void;
  /** Défaut `outline` ; `default` pour l'action principale. */
  variant?: "default" | "outline" | "destructive" | "ghost";
  disabled?: boolean;
};

export type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Phrase sous le titre : elle porte la question en `confirm`, précise en `form`. */
  description?: string;
  /**
   * `form` — une saisie : le titre est posé sur un bandeau, le corps défile
   * sous lui, le pied reste visible.
   * `confirm` — une question fermée et ses réponses : ni corps ni défilement,
   * et une colonne plus étroite, la lecture tenant en deux lignes.
   */
  variant?: "form" | "confirm";
  /** Corps du formulaire. Sans objet en `confirm`. */
  children?: ReactNode;
  /**
   * Message écrit pour l'utilisateur, affiché au-dessus des boutons. Jamais
   * celui d'un fournisseur externe : il peut porter des fragments de requête.
   */
  error?: string | null;
  actions: ModalAction[];
  /** Suppression : isolée à l'opposé des actions de validation. */
  destructiveAction?: ModalAction;
};

/**
 * Fenêtre modale de l'application — la seule.
 *
 * Trois zones franches et non un empilement de blocs à écart constant : un
 * bandeau de titre, un corps, un pied. C'est ce découpage qui permet au corps
 * de défiler seul, donc au titre de rester lisible et aux boutons d'être
 * toujours atteignables — sur un formulaire d'événement comme sur une liste de
 * dossiers à cocher.
 *
 * Feuille remontant du bas sous le point de rupture, dialogue centré au-delà :
 * c'est ce que font Things 3, Todoist et TickTick (§4.2), et cela règle le cas
 * du clavier logiciel, qui recouvre un dialogue centré sans jamais recouvrir un
 * pied déjà collé au bas de l'écran.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  variant = "form",
  children,
  error = null,
  actions,
  destructiveAction,
}: ModalProps) {
  const compact = useBreakpoint() === "compact";
  const insets = useSafeAreaInsets();

  // Sur web, le fond ne ferme pas de lui-même : la primitive ne pose le geste
  // que sur les plateformes natives.
  const onOverlayPress = (event: GestureResponderEvent) => {
    if (event.target === event.currentTarget && !event.isDefaultPrevented()) onClose();
  };

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <FullWindowOverlay>
          <DialogPrimitive.Overlay
            className={cn(
              "absolute bottom-0 left-0 right-0 top-0 flex bg-black/60",
              compact ? "justify-end" : "items-center justify-center p-4",
              Platform.select({ web: "fixed cursor-default [&>*]:cursor-auto" }),
            )}
            onPress={Platform.select({ web: onOverlayPress })}
            asChild={Platform.OS !== "web"}
          >
            <NativeOnlyAnimatedView
              entering={FadeIn.duration(180).reduceMotion(ReduceMotion.System)}
              exiting={FadeOut.duration(120).reduceMotion(ReduceMotion.System)}
              as="Pressable"
            >
              <DialogPrimitive.Content
                className={cn(
                  "bg-background border-border w-full flex-col overflow-hidden border shadow-lg shadow-black/20",
                  compact
                    ? "max-h-[88%] rounded-t-2xl border-b-0"
                    : cn("max-h-[85%] rounded-xl", variant === "confirm" ? "max-w-md" : "max-w-lg"),
                )}
              >
                {/* Poignée : elle dit qu'on est devant une feuille et non
                    devant un écran, et rend la fermeture prévisible. */}
                {compact ? <View className="bg-border mx-auto mt-3 h-1 w-10 rounded-full" /> : null}

                <View
                  className={cn(
                    "flex-row items-start gap-4 px-6 pb-5 pt-5",
                    variant === "form" && "border-border border-b",
                  )}
                >
                  <View className="flex-1 gap-1.5">
                    <DialogPrimitive.Title className="text-foreground text-lg font-semibold leading-6">
                      {title}
                    </DialogPrimitive.Title>
                    {description ? (
                      <DialogPrimitive.Description className="text-muted-foreground text-sm leading-5">
                        {description}
                      </DialogPrimitive.Description>
                    ) : null}
                  </View>

                  {/* Dans le flux et non en position absolue : posé par-dessus,
                      il chevauchait le titre dès que celui-ci passait à la ligne. */}
                  <DialogPrimitive.Close
                    className={cn(
                      "-mr-2 -mt-1 size-8 items-center justify-center rounded-full",
                      "active:bg-muted",
                      Platform.select({ web: "hover:bg-muted transition-colors" }),
                    )}
                    hitSlop={8}
                    accessibilityLabel="Fermer"
                  >
                    <Icon as={X} size={16} className="text-muted-foreground" />
                  </DialogPrimitive.Close>
                </View>

                {variant === "form" ? (
                  <ScrollView
                    className="shrink"
                    contentContainerClassName="gap-5 px-6 py-5"
                    keyboardShouldPersistTaps="handled"
                  >
                    {children}
                  </ScrollView>
                ) : null}

                <View
                  className="border-border gap-4 border-t px-6 pb-5 pt-5"
                  // La feuille touche le bord bas de l'écran : sans ce retrait,
                  // le bouton principal passerait sous l'indicateur d'accueil.
                  style={compact ? { paddingBottom: insets.bottom + spacing.xl } : undefined}
                >
                  {error ? <Text className="text-destructive text-sm">{error}</Text> : null}

                  {/* En colonne inversée sous le point de rupture : l'action
                      principale, dernière de la liste, remonte alors en tête —
                      c'est elle que le pouce atteint. */}
                  <View
                    className={cn(
                      "gap-3",
                      compact ? "flex-col-reverse" : "flex-row items-center justify-end",
                    )}
                  >
                    {destructiveAction ? (
                      <FooterButton
                        action={destructiveAction}
                        compact={compact}
                        className={compact ? undefined : "mr-auto"}
                        destructive
                      />
                    ) : null}

                    {actions.map((action) => (
                      <FooterButton key={action.label} action={action} compact={compact} />
                    ))}
                  </View>
                </View>
              </DialogPrimitive.Content>
            </NativeOnlyAnimatedView>
          </DialogPrimitive.Overlay>
        </FullWindowOverlay>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/**
 * Bouton du pied.
 *
 * Pleine largeur et plus haut sous le point de rupture : un pied en colonne n'a
 * pas de raison de laisser des boutons étroits au milieu, et 44 pt est la cible
 * tactile minimale.
 */
function FooterButton({
  action,
  compact,
  className,
  destructive = false,
}: {
  action: ModalAction;
  compact: boolean;
  className?: string | undefined;
  destructive?: boolean;
}) {
  const { palette } = useTheme();
  const variant = action.variant ?? (destructive ? "ghost" : "outline");

  // L'action principale porte la couleur d'assistant choisie par l'utilisateur
  // (§5.1). Peinte depuis la palette et non par le jeton `primary` : la classe
  // passe par une variable CSS, qu'une fenêtre sortie de l'arbre — le portail
  // sur web, l'overlay plein écran sur iOS — n'hérite pas toujours. La palette,
  // elle, vient du contexte React et suit la fenêtre partout.
  const filled = variant === "default";

  return (
    <Button
      variant={variant}
      size={compact ? "lg" : "default"}
      onPress={action.onPress}
      disabled={action.disabled ?? false}
      accessibilityRole="button"
      className={cn(compact && "w-full", className)}
      {...(filled ? { style: { backgroundColor: palette.accent } } : {})}
    >
      {/* Sans fond, c'est au libellé de porter la mise en garde ; sur un fond
          rouge, il la porterait deux fois et ne se lirait plus. */}
      <Text
        className={destructive && variant === "ghost" ? "text-destructive" : undefined}
        {...(filled ? { style: { color: palette.accentText } } : {})}
      >
        {action.label}
      </Text>
    </Button>
  );
}
