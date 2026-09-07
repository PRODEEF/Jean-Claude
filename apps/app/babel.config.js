module.exports = function (api) {
  api.cache(true);
  return {
    // `jsxImportSource: "nativewind"` fait passer chaque élément JSX par le
    // wrapper de NativeWind, qui traduit `className` en styles React Native.
    // Sans lui, les classes utilitaires seraient ignorées sur iOS et Android.
    //
    // `nativewind/babel` n'est pas utilisé tel quel : il ré-enregistre le
    // plugin worklets sans options, et ce plugin prend `option.value` dans un
    // `style={}` pour un shared value Reanimated — d'où le déluge d'avertissements
    // à chaque pastille, bouton ou classe `hover:`. On le pose nous-mêmes, en
    // dernier (les presets s'exécutent en ordre inverse).
    presets: [
      {
        plugins: [["react-native-worklets/plugin", { disableInlineStylesWarning: true }]],
      },
      [
        "babel-preset-expo",
        {
          jsxImportSource: "nativewind",
          worklets: false,
          reanimated: false,
        },
      ],
    ],
    plugins: [require("react-native-css-interop/dist/babel-plugin").default],
  };
};
