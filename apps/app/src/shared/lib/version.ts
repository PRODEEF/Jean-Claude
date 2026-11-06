import Constants from "expo-constants";

/**
 * « 0.0.1 » s'affiche « V0.00.1 » : le format voulu par Yann, où le numéro du
 * milieu garde deux chiffres.
 */
export function formatVersion(semver: string): string {
  const [major = "0", minor = "0", patch = "0"] = semver.split(".");
  return `V${major}.${minor.padStart(2, "0")}.${patch}`;
}

/**
 * Version de l'application, lue dans `app.json` : c'est l'unique endroit où on
 * la change, et elle est la même sur le web, iOS et Android.
 */
export const APP_VERSION = formatVersion(Constants.expoConfig?.version ?? "0.0.0");
