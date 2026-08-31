# Jean-Claude

Assistant IA conversationnel et second cerveau personnel — web, iOS, Android,
desktop.

> Projet de stage · Porteur : Yann · Cadrage : Antonin · Stores : Nicolas
> Cahier des charges v1.8 (24 août 2026)

---

## Démarrage

### Prérequis

- Node.js ≥ 22.12
- Un projet [Supabase](https://supabase.com) — **créer en région UE**
  (`eu-west-3` Paris ou `eu-central-1` Francfort), voir `docs/ARCHITECTURE.md` §4
- Une clé [Vercel AI Gateway](https://vercel.com/docs/ai-gateway) (`vck_…`)

### Installation

```bash
npm install
```

Copier la configuration et la remplir :

```bash
cp .env.example .env
```

Appliquer le schéma de base :

```bash
npx supabase db push
```

Puis générer les types TypeScript de la base — sans cette étape, les requêtes
Supabase ne sont pas typées :

```bash
npm run db:types
```

### Configurer l'envoi du code de connexion

Sans cette étape, Supabase enverrait son gabarit par défaut — un **lien
cliquable** et non un code, ce que le §6.1 écarte explicitement. La
configuration vit dans `supabase/config.toml` et `supabase/templates/` ;
il reste à la pousser sur le projet hébergé :

```bash
npx supabase config push
```

À défaut, coller le contenu de `supabase/templates/otp-code.html` dans les
gabarits **Confirm signup** et **Magic Link** du tableau de bord Supabase
(Authentication → Email Templates), et régler la longueur du code sur 6.

### Lancer

```bash
npm run dev:api
```

```bash
npm run dev:web
```

L’API écoute sur `http://localhost:3000`, l’application web sur le port 8081.

Pour le mobile : `npm run dev:ios` ou `npm run dev:android`.

---

## Déployer

Deux projets Vercel sur le même dépôt. L'API et le web se déploient
indépendamment : un build cassé d'un côté ne bloque pas la démonstration de
l'autre, et l'URL de l'API reste stable pour iOS et Android, qui ne passent pas
par Vercel. Les fichiers de configuration sont déjà versionnés
(`apps/api/vercel.json`, `apps/app/vercel.json`).

### 1. Projet API

| Réglage          | Valeur                               |
| ---------------- | ------------------------------------ |
| Root Directory   | `apps/api`                           |
| Framework Preset | Other                                |
| Build Command    | `cd ../.. && npm run build:packages` |
| Output Directory | `public`                             |
| Node.js Version  | 22.x                                 |
| Region           | Paris (`cdg1`)                       |

La région n'est pas cosmétique : elle évite un aller-retour Washington ↔
Supabase UE à chaque requête, et prépare la migration du §8.

Variables : `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`AI_GATEWAY_API_KEY`, `LLM_MODEL`, `CORS_ORIGIN`. Toutes sont exigées au
démarrage — une seule manquante fait échouer le boot plutôt que de produire une
erreur 500 au premier appel.

### 2. Projet web

| Réglage          | Valeur                                                                        |
| ---------------- | ----------------------------------------------------------------------------- |
| Root Directory   | `apps/app`                                                                    |
| Framework Preset | Other                                                                         |
| Build Command    | `cd ../.. && npm run build:packages && npm run build:web --workspace @jc/app` |
| Output Directory | `dist`                                                                        |
| Node.js Version  | 22.x                                                                          |

Variables, à cocher sur **Production et Preview** — les `EXPO_PUBLIC_*` sont
figées dans le bundle au moment du build, les changer impose un redéploiement :

| Variable                        | Valeur              |
| ------------------------------- | ------------------- |
| `EXPO_PUBLIC_API_URL`           | l'URL du projet API |
| `EXPO_PUBLIC_SUPABASE_URL`      | idem `.env`         |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | idem `.env`         |

### 3. Boucler

`CORS_ORIGIN`, sur le projet API, doit lister l'URL du web **et** le motif de
ses previews, dont l'URL est tirée au sort à chaque déploiement :

```
https://<projet-web>.vercel.app,https://<projet-web>-*.vercel.app
```

Le joker ne remplace qu'un segment, sans point — voir
`apps/api/src/core/allowed-origin.ts`. Redéployer l'API après l'avoir renseigné.

Ajouter enfin l'URL du web dans Supabase → Authentication → URL Configuration →
_Redirect URLs_, faute de quoi la connexion par code renvoie vers `localhost`.

Vérification : `https://<projet-api>.vercel.app/api/health` doit rendre
`{"status":"ok","llm":{…}}`.

---

## Structure

```md
jean-claude/
├── apps/
│ ├── api/ Hono — API commune aux quatre plateformes (§5.3)
│ └── app/ Expo Router — web, iOS, Android depuis un codebase
├── packages/
│ ├── domain/ Types, schémas Zod, règles métier — partagés
│ ├── api-client/ Client HTTP typé
│ └── design/ Jetons de design
├── supabase/
│ └── migrations/ Schéma Postgres + RLS
└── docs/
├── ARCHITECTURE.md Décisions techniques et leur justification
└── SUIVI-BACKLOG.md Statut de chaque point du backlog (livrable §10)
```

**Commencer par [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — il explique les
quatre décisions qui conditionnent tout le reste.

---

## Commandes

| Commande                          | Effet                                                               |
| --------------------------------- | ------------------------------------------------------------------- |
| `npm run dev:api`                 | API en mode watch                                                   |
| `npm run dev:web`                 | Application web                                                     |
| `npm run dev:ios` / `dev:android` | Application mobile                                                  |
| `npm run typecheck`               | Vérification des types sur tout le monorepo                         |
| `npm test`                        | Tests unitaires                                                     |
| `npm run db:types`                | Régénère les types de la base depuis le schéma                      |
| `npx supabase config push`        | Pousse la configuration d'authentification et les gabarits d'e-mail |

---

## Conventions

- **Français** pour les commentaires, les messages d'erreur et la documentation.
- **Anglais** pour les identifiants de code.
- Les commentaires expliquent _pourquoi_, pas _quoi_.
- Toute règle métier vit dans `apps/api` ou `packages/domain`, jamais dans un
  écran.
- Aucun appel direct à un SDK de modèle IA hors de `core/llm/providers/`.

Détail dans [CLAUDE.md](CLAUDE.md).

---

## État

Socle technique posé. Authentification par e-mail et code à usage unique (§6.1)
opérationnelle. Modules `folder` et `conversation` complets et servant de
référence pour les suivants. Voir [docs/SUIVI-BACKLOG.md](docs/SUIVI-BACKLOG.md)
pour le statut point par point.
