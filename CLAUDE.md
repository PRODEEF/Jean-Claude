# Jean-Claude — instructions d'agent

Assistant IA conversationnel et second cerveau personnel. Quatre plateformes
(web, iOS, Android, desktop) depuis un codebase Expo unique, servies par une API
NestJS commune.

Les références `§x` et `A.x` renvoient au cahier des charges v1.8 (24 août 2026).

---

## Les 6 invariants

Ne jamais les violer, quelle que soit la tâche.

1. **Aucun SDK de modèle IA hors de `apps/api/src/core/llm/providers/`.**
   Ailleurs, injecter `LLM_PROVIDER` et parler à l'interface `LlmProvider`.
   C'est ce qui rend le multi-modèle du §5.1 possible sans réécriture.

2. **Aucune logique métier dans un écran.**
   Elle vit dans `apps/api` (règles serveur) ou `packages/domain` (types et
   validation). Un écran qui décide d'une règle produit la fait diverger entre
   web et mobile.

3. **L'app cliente n'écrit jamais en base directement.**
   Supabase côté client sert uniquement à l'authentification. Tout le reste
   passe par l'API (§5.3).

4. **Une conversation n'a pas de dossier parent unique.**
   Toujours passer par `conversation_folders`. Ne jamais ajouter de colonne
   `folder_id` sur `conversations` (§5.2, A.1).

5. **Aucun secret dans `apps/app`.**
   Les variables `EXPO_PUBLIC_*` sont embarquées dans le bundle, donc publiques.

6. **L'assistant propose, il n'exécute pas.**
   Un appel d'outil du modèle devient une suggestion en attente, jamais une
   action directe. L'utilisateur accepte ou ignore d'un geste (§12.1).

---

## Rules — à lire avant de coder

Fichiers dans `.claude/rules/`. **Lire celui qui correspond à la zone touchée
avant de modifier des fichiers**, pas après.

| Zone touchée                         | Fichier à lire                 |
| ------------------------------------ | ------------------------------ |
| N'importe laquelle                   | `.claude/rules/000-general.md` |
| `apps/api/`                          | `.claude/rules/100-api.md`     |
| `apps/app/`                          | `.claude/rules/200-app.md`     |
| Un service, ou ajout de tests        | `.claude/rules/300-tests.md`   |
| Toute décision de conception produit | `.claude/rules/400-produit.md` |

`400-produit.md` encode ce qui distingue Jean-Claude d'une IA conversationnelle
générique. À lire avant toute décision de conception, pas seulement de code.

## Skills

Dans `.claude/skills/`, découverts automatiquement — inutile de les charger à la
main. Catalogue et détail : `.claude/README.md`.

`api-module` · `app-feature` · `llm-provider` · `supabase-migration` ·
`ui-decision` · `daily-report`

## Architecture

`docs/ARCHITECTURE.md` explique les quatre décisions structurantes et **pourquoi**
elles ont été prises. À lire avant toute modification structurelle.

`docs/SUIVI-BACKLOG.md` donne l'état d'avancement point par point — c'est un
livrable de fin de stage (§10), à tenir à jour.

---

## Structure

```md
apps/api/     NestJS — API commune  ·  core/ → domain/ → feature/
apps/app/     Expo Router — web + iOS + Android
packages/     domain (Zod) · api-client · design — partagés des deux côtés
supabase/     Schéma Postgres + RLS
.claude/      Rules et skills du dépôt
```

Sens des dépendances côté API : `feature/` → `domain/` → `core/`. Jamais l'inverse.

---

## Vérifier avant de committer

```bash
npm run typecheck
```

```bash
npm test
```

Puis mettre à jour `docs/SUIVI-BACKLOG.md` si un point du backlog a avancé.

## Contexte du sprint

10 jours effectifs, en solo. Le §0.1 impose un report **et** une démonstration
quotidiens à Yann — même partiels, bugués ou inachevés. Privilégier
systématiquement un périmètre réduit et stable à un périmètre large et instable
(Cible 2, §0.2).
