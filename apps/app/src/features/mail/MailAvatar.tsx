import { View } from "react-native";
import { ASSISTANT_ACCENTS, DEFAULT_ACCENT, readableTextOn } from "@jc/design";
import { colorIndexOf, initialsOf } from "@jc/domain";
import { Text } from "@/shared/ui/text";

/**
 * Pastille ronde d'un expéditeur : ses initiales sur une couleur qui lui reste
 * propre. Les couleurs sont celles des réglages (`ASSISTANT_ACCENTS`), retenues
 * pour rester lisibles en thème clair comme en thème sombre.
 */
export function MailAvatar({ sender, size = 40 }: { sender: string; size?: number }) {
  const accent = ASSISTANT_ACCENTS[colorIndexOf(sender, ASSISTANT_ACCENTS.length)];
  const background = accent?.value ?? DEFAULT_ACCENT;

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: background,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text
        style={{ color: readableTextOn(background), fontSize: size * 0.38 }}
        className="font-semibold"
      >
        {initialsOf(sender)}
      </Text>
    </View>
  );
}
