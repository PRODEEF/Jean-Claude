import { Redirect } from "expo-router";

/** Point d'entrée : la conversation est l'écran d'accueil, comme sur la maquette. */
export default function Index() {
  return <Redirect href="/(app)/chat" />;
}
