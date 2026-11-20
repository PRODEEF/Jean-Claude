import xss from "xss";

// `xss` est un module CommonJS : Node refuse d'en lire les exports nommés en ESM
// (le serveur plantait au démarrage, en production seulement). Seul l'import par
// défaut passe, et il porte les mêmes fonctions — d'où ce cast, sans autre risque
// que la déclaration de types, qui ne décrit pas cette forme.
const { escapeAttrValue, filterXSS, getDefaultWhiteList, safeAttrValue } =
  xss as unknown as typeof import("xss");

const COMMON = ["style", "dir"];

/** Balises de mise en forme courante, avec les attributs que chacune garde. */
const ALLOWED_TAGS: Record<string, string[]> = {
  ...Object.fromEntries(
    Object.entries(getDefaultWhiteList()).map(([tag, attrs]) => [
      tag,
      [...(attrs ?? []), ...COMMON],
    ]),
  ),
  img: ["src", "alt", "width", "height", ...COMMON],
  td: ["colspan", "rowspan", "align", "valign", "width", ...COMMON],
  th: ["colspan", "rowspan", "align", "valign", "width", ...COMMON],
  table: ["width", "cellpadding", "cellspacing", "align", ...COMMON],
  font: ["color", "size"],
  span: COMMON,
  center: [],
};

const ALLOWED_STYLES = {
  color: true,
  "background-color": true,
  "text-align": true,
  "font-weight": true,
  "font-style": true,
  "font-size": true,
  "text-decoration": true,
};

/**
 * Nettoie le HTML d'un mail avant de l'envoyer à l'écran.
 *
 * Un mail est du contenu venu d'un inconnu : scripts, formulaires, cadres,
 * gestionnaires d'événements et liens `javascript:` sont retirés ici, côté
 * serveur, pour que les quatre plateformes reçoivent la même chose propre.
 * La mise en forme courante (gras, listes, tableaux, couleurs, images) reste.
 */
export function sanitizeMailHtml(html: string): string {
  return filterXSS(html, {
    whiteList: ALLOWED_TAGS,
    // Un tag inconnu disparaît, son texte reste ; un script ou une feuille de
    // style disparaît avec tout son contenu.
    stripIgnoreTag: true,
    stripIgnoreTagBody: ["script", "style"],
    // Seules les propriétés d'allure inoffensives passent : pas de position, ni
    // de `url()` en arrière-plan qui irait chercher une image sans qu'on le sache.
    css: { whiteList: ALLOWED_STYLES },
    onTag(tag, rawHtml, options) {
      // Un lien s'ouvre à part : il ne doit pas remplacer l'application.
      if (tag !== "a" || options.isClosing) return undefined;
      const href = /href\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(rawHtml);
      const safe = href ? safeHref(href[1] ?? href[2] ?? "") : "";
      return safe ? `<a href="${safe}" target="_blank" rel="noopener noreferrer nofollow">` : "<a>";
    },
    safeAttrValue(tag, name, value, cssFilter) {
      // Un style qui appelle une adresse (`url(…)`, `@import`) ou cache du code
      // (`expression`, échappements) est écarté en entier : l'écran n'ira rien
      // chercher qu'on ne lui ait pas demandé.
      if (name === "style" && /url\s*\(|@import|expression|\\|javascript:/i.test(value)) return "";
      if (tag === "img" && name === "src")
        return /^(https?:|data:image\/)/i.test(value) ? escapeAttrValue(value) : "";
      return safeAttrValue(tag, name, value, cssFilter);
    },
  });
}

/** Une adresse de lien n'est gardée que si elle ouvre une page, un mail ou un appel. */
function safeHref(value: string): string {
  const trimmed = value.trim();
  return /^(https?:|mailto:|tel:)/i.test(trimmed) ? escapeAttrValue(trimmed) : "";
}

/** Image intégrée à un mail (`cid:`), avec ce qu'il faut pour la poser en ligne. */
export type InlineImage = { contentId: string; contentType: string; content: Buffer };

/** Au-delà, une image intégrée alourdirait la réponse plus qu'elle n'aide. */
const INLINE_IMAGE_MAX_BYTES = 300_000;

/**
 * Remplace les images intégrées (`src="cid:logo"`) par leur contenu, posé en
 * ligne : le mail s'affiche alors comme chez l'expéditeur sans aller les
 * chercher ailleurs. Une image trop lourde, ou absente, reste telle quelle et
 * s'affichera comme une image manquante.
 */
export function inlineCidImages(html: string, images: readonly InlineImage[]): string {
  let result = html;
  for (const image of images) {
    if (image.content.length > INLINE_IMAGE_MAX_BYTES) continue;
    if (!image.contentType.startsWith("image/")) continue;

    const id = image.contentId.replace(/^<|>$/g, "");
    const dataUri = `data:${image.contentType};base64,${image.content.toString("base64")}`;
    result = result.split(`cid:${id}`).join(dataUri);
  }
  return result;
}
