import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

/**
 * Stockage du jeton de session, adapté à la plateforme.
 *
 * iOS/Android : Keychain / Keystore via SecureStore — le chiffrement est
 * assuré par l'OS, ce qui est le minimum pour un produit traitant des données
 * de santé et administratives (§8).
 *
 * Web : `localStorage`, faute d'équivalent. SecureStore n'existe pas sur web
 * et échouerait silencieusement si on l'appelait quand même.
 */
const isWeb = Platform.OS === "web";

export const tokenStorage = {
  async get(key: string): Promise<string | null> {
    if (isWeb) {
      try {
        return globalThis.localStorage?.getItem(key) ?? null;
      } catch {
        // Navigation privée ou stockage bloqué : on dégrade en session non
        // persistée plutôt que de faire planter le démarrage de l'app.
        return null;
      }
    }
    return SecureStore.getItemAsync(key);
  },

  async set(key: string, value: string): Promise<void> {
    if (isWeb) {
      try {
        globalThis.localStorage?.setItem(key, value);
      } catch {
        /* voir ci-dessus */
      }
      return;
    }
    await SecureStore.setItemAsync(key, value);
  },

  async remove(key: string): Promise<void> {
    if (isWeb) {
      try {
        globalThis.localStorage?.removeItem(key);
      } catch {
        /* voir ci-dessus */
      }
      return;
    }
    await SecureStore.deleteItemAsync(key);
  },
};
