import { ScrollView } from "react-native";
import { Users } from "lucide-react-native";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { Text } from "@/shared/ui/text";

export type WorkspaceSidebarBodyProps = {
  workspaceId: string;
  pathname: string;
  onNavigate: (href: string) => void;
};

/**
 * Corps de la barre latérale quand un espace d'équipe est sélectionné.
 *
 * Les dossiers et conversations personnels s'effacent, comme les canaux d'un
 * autre espace dans Slack : on ne mêle pas ce qui est à soi et ce qui est à
 * l'équipe. Les groupes de l'espace prendront place ici au lot 3.
 */
export function WorkspaceSidebarBody({
  workspaceId,
  pathname,
  onNavigate,
}: WorkspaceSidebarBodyProps) {
  const href = `/workspace/${workspaceId}`;
  const active = pathname === href;

  return (
    <ScrollView className="flex-1" contentContainerClassName="gap-2 px-3 pb-4">
      <Button
        variant="ghost"
        onPress={() => onNavigate(href)}
        className={cn("justify-start gap-3 px-2", active && "bg-accent")}
      >
        <Icon as={Users} size={16} className="text-muted-foreground" />
        <Text className={cn("text-sm text-foreground", active ? "font-medium" : "font-normal")}>
          Membres et invitations
        </Text>
      </Button>

      <Text className="px-2 text-xs text-muted-foreground">
        Les discussions de groupe arrivent au prochain lot.
      </Text>
    </ScrollView>
  );
}
