# Jean-Claude

Assistant IA conversationnel et second cerveau personnel — web, iOS, Android,
desktop.

> Projet de stage · Porteur : Yann · Cadrage : Antonin · Stores : Nicolas
> Cahier des charges v1.8 (24 août 2026)

---

## Démarrage

### Prérequis

- Node.js ≥ 20
- Un projet [Supabase](https://supabase.com) — **créer en région UE**
  (`eu-west-3` Paris ou `eu-central-1` Francfort), voir `docs/ARCHITECTURE.md` §4
- Une clé d'API Anthropic

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

### Lancer

```bash
npm run dev:api
```

```bash
npm run dev:web
```

L'API écoute sur `http://localhost:3000`, sa documentation sur
`http://localhost:3000/api/docs`. L'application web démarre sur le port 8081.

Pour le mobile : `npm run dev:ios` ou `npm run dev:android`.

---

## Structure

```
jean-claude/
├── apps/
│   ├── api/          NestJS — API commune aux quatre plateformes (§5.3)
│   └── app/          Expo Router — web, iOS, Android depuis un codebase
├── packages/
│   ├── domain/       Types, schémas Zod, règles métier — partagés
│   ├── api-client/   Client HTTP typé
│   └── design/       Jetons de design
├── supabase/
│   └── migrations/   Schéma Postgres + RLS
└── docs/
    ├── ARCHITECTURE.md    Décisions techniques et leur justification
    └── SUIVI-BACKLOG.md   Statut de chaque point du backlog (livrable §10)
```

**Commencer par [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — il explique les
quatre décisions qui conditionnent tout le reste.

---

## Commandes

| Commande | Effet |
|---|---|
| `npm run dev:api` | API en mode watch |
| `npm run dev:web` | Application web |
| `npm run dev:ios` / `dev:android` | Application mobile |
| `npm run typecheck` | Vérification des types sur tout le monorepo |
| `npm test` | Tests unitaires |
| `npm run db:types` | Régénère les types de la base depuis le schéma |

---

## Conventions

- **Français** pour les commentaires, les messages d'erreur et la documentation.
- **Anglais** pour les identifiants de code.
- Les commentaires expliquent *pourquoi*, pas *quoi*.
- Toute règle métier vit dans `apps/api` ou `packages/domain`, jamais dans un
  écran.
- Aucun appel direct à un SDK de modèle IA hors de `core/llm/providers/`.

Détail dans [CLAUDE.md](CLAUDE.md).

---

## État

Socle technique posé. Modules `folder` et `conversation` complets et servant de
référence pour les suivants. Voir [docs/SUIVI-BACKLOG.md](docs/SUIVI-BACKLOG.md)
pour le statut point par point.
