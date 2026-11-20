import { inlineCidImages, sanitizeMailHtml } from "./html.js";

describe("sanitizeMailHtml", () => {
  it("retire les scripts", () => {
    expect(sanitizeMailHtml("<p>Salut</p><script>alert(1)</script>")).toBe("<p>Salut</p>");
  });

  it("retire les gestionnaires d'événements", () => {
    const result = sanitizeMailHtml('<img src="https://x.fr/a.png" onerror="alert(1)">');

    expect(result).not.toContain("onerror");
    expect(result).toContain("https://x.fr/a.png");
  });

  it("retire les liens javascript:", () => {
    expect(sanitizeMailHtml('<a href="javascript:alert(1)">clic</a>')).not.toContain("javascript");
  });

  it("garde la mise en forme courante", () => {
    const result = sanitizeMailHtml("<p><b>Gras</b> <i>italique</i></p><ul><li>un</li></ul>");

    expect(result).toBe("<p><b>Gras</b> <i>italique</i></p><ul><li>un</li></ul>");
  });

  it("ouvre les liens à part, sans donner accès à l'application", () => {
    const result = sanitizeMailHtml('<a href="https://exemple.fr">lien</a>');

    expect(result).toContain('target="_blank"');
    expect(result).toContain("noopener");
  });

  it("retire les cadres, formulaires et feuilles de style", () => {
    const result = sanitizeMailHtml(
      '<iframe src="https://x.fr"></iframe><form action="/x"><input></form><style>p{color:red}</style><p>ok</p>',
    );

    expect(result).toBe("<p>ok</p>");
  });

  it("garde les couleurs mais pas le positionnement", () => {
    const result = sanitizeMailHtml('<p style="color: #333; position: fixed; top: 0">x</p>');

    expect(result).toContain("color:#333");
    expect(result).not.toContain("position");
  });

  it("ne laisse pas un fond d'image aller chercher une adresse", () => {
    const result = sanitizeMailHtml('<p style="background-color: url(https://x.fr/p.gif)">x</p>');

    expect(result).not.toContain("x.fr");
  });

  it("garde une image intégrée en ligne (data:)", () => {
    expect(sanitizeMailHtml('<img src="data:image/png;base64,AAAA">')).toContain("data:image/png");
  });
});

describe("inlineCidImages", () => {
  const image = (contentId: string, size = 10) => ({
    contentId,
    contentType: "image/png",
    content: Buffer.alloc(size, 1),
  });

  it("remplace une image intégrée par son contenu", () => {
    const result = inlineCidImages('<img src="cid:logo">', [image("<logo>")]);

    expect(result).toContain('src="data:image/png;base64,');
    expect(result).not.toContain("cid:");
  });

  it("laisse telle quelle une image trop lourde", () => {
    const result = inlineCidImages('<img src="cid:gros">', [image("gros", 400_000)]);

    expect(result).toContain("cid:gros");
  });

  it("laisse telle quelle une image qu'aucune pièce ne porte", () => {
    expect(inlineCidImages('<img src="cid:absent">', [])).toContain("cid:absent");
  });

  it("n'intègre pas ce qui n'est pas une image", () => {
    const result = inlineCidImages('<a href="cid:doc">x</a>', [
      { contentId: "doc", contentType: "application/pdf", content: Buffer.alloc(5) },
    ]);

    expect(result).toContain("cid:doc");
  });
});
