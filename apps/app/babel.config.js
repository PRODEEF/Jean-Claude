module.exports = function (api) {
  api.cache(true);
  return {
    // `jsxImportSource: "nativewind"` fait passer chaque élément JSX par le
    // wrapper de NativeWind, qui traduit `className` en styles React Native.
    // Sans lui, les classes utilitaires seraient ignorées sur iOS et Android.
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
    // Pas de `react-native-reanimated/plugin` ici : depuis Reanimated 4, le
    // plugin a migré vers `react-native-worklets/plugin`, que `babel-preset-expo`
    // ajoute déjà de lui-même dès que le paquet est installé. Le déclarer une
    // seconde fois le ferait s'appliquer deux fois aux mêmes fichiers.
  };
};
