import { configureReanimatedLogger, ReanimatedLogLevel } from "react-native-reanimated";

// NativeWind lit des shared values Reanimated pour `hover:` / `active:`. Le
// mode strict prend cette lecture interne pour un mésusage applicatif. Ce
// module est importé en tête de `_layout` : la config doit précéder tout
// écran, sans quoi l'avertissement a déjà été émis.
configureReanimatedLogger({ level: ReanimatedLogLevel.warn, strict: false });
