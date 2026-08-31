import { Stack } from "expo-router";

/**
 * Pile de l'onglet Conversations : la liste, puis le fil.
 *
 * Sans ce layout, `[id]` remonterait dans le navigateur d'onglets et
 * apparaîtrait comme un onglet supplémentaire.
 */
export default function ChatLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
