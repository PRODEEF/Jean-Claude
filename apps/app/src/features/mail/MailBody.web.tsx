import { useMemo, useState } from "react";
import { View } from "react-native";
import { Text } from "@/shared/ui/text";

/**
 * Corps d'un mail, version web : le HTML dans un cadre isolé.
 *
 * Trois protections, en plus du nettoyage fait par le serveur :
 * - le cadre n'a aucun droit (`sandbox` sans scripts), seuls les liens peuvent
 *   s'ouvrir dans un autre onglet ;
 * - une règle de sécurité (`Content-Security-Policy`) interdit tout sauf le style
 *   et les images intégrées ;
 * - les images distantes ne sont chargées qu'à la demande (`showImages`) : une
 *   image distante dit à l'expéditeur que le mail a été ouvert.
 */
export function MailBody({
  html,
  text,
  showImages,
}: {
  html: string | null;
  text: string | null;
  showImages: boolean;
}) {
  const [height, setHeight] = useState(200);

  const document = useMemo(() => {
    if (html === null) return null;
    const images = showImages ? "data: https: http:" : "data:";
    return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${images}; style-src 'unsafe-inline'">
<base target="_blank">
<style>body{margin:0;font:14px/1.5 -apple-system,BlinkMacSystemFont,sans-serif;word-wrap:break-word;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{max-width:100%}a{color:#107fea}</style>
</head><body>${html}</body></html>`;
  }, [html, showImages]);

  if (document === null) {
    return (
      <Text className="pt-2 text-sm" selectable>
        {text ?? "Ce mail ne contient pas de texte (images ou pièces jointes seules)."}
      </Text>
    );
  }

  return (
    <View style={{ height }}>
      <iframe
        title="Contenu du mail"
        srcDoc={document}
        // Sans `allow-scripts`, rien ne s'exécute. `allow-same-origin` ne sert
        // qu'à mesurer la hauteur du contenu pour ne pas avoir un cadre qui défile.
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        style={{ border: 0, width: "100%", height: "100%", background: "transparent" }}
        onLoad={(event) => {
          const body = event.currentTarget.contentDocument?.documentElement;
          if (body) setHeight(Math.max(120, body.scrollHeight + 8));
        }}
      />
    </View>
  );
}
