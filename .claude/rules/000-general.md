# 000 — Règles générales

S'appliquent à tout le dépôt.

## Périmètre

**Faire ce qui est demandé, rien de plus.** Tout ce qui déborde de la demande —
refactor opportuniste, abstraction « pour plus tard », option de configuration
que personne n'a réclamée, fichier annexe créé au passage — se **demande
d'abord**.

- ✅ Repérer un problème hors périmètre → le signaler en une phrase, puis
  poursuivre la tâche demandée
- ❌ Le corriger sans avoir demandé, même si la correction tient en trois lignes

Le sprint fait 10 jours et impose une démonstration quotidienne (§0.1). Chaque
ligne écrite en dehors du besoin est une ligne à relire, tester et maintenir.

## Le code minimal qui marche

Écrire la plus petite implémentation qui satisfait le besoin **actuel**, pas
celui qu'on anticipe.

| ❌                                        | ✅                                 |
| ----------------------------------------- | ---------------------------------- |
| Une abstraction pour un seul appelant     | L'appel direct                     |
| Un objet d'options « au cas où »          | Les arguments réellement utilisés  |
| Un composant générique à 12 props         | Le composant du cas d'usage        |
| Couvrir un cas d'usage non spécifié       | L'ignorer jusqu'à ce qu'il existe  |
| Un fichier de plus pour « bien découper » | Le garder dans le fichier existant |

**Les invariants d'architecture ne relèvent pas de cette règle.** Le port
`LlmProvider` (§5.1) et la table `conversation_folders` (§5.2, A.1) paraissent
surdimensionnés aujourd'hui : ils répondent à un besoin déjà inscrit au cahier
des charges. Ils restent en place.

## Langue

- Code (variables, fonctions, fichiers) en **anglais**
- Commentaires, TSDoc, messages d'erreur et documentation en **français**
- Commits en **français**, format Conventional Commits

## TypeScript — interdits

- ❌ `any` explicite → utiliser `unknown` puis narrow, ou typer précisément
- ❌ `@ts-ignore` / `@ts-expect-error` sans commentaire justifiant et datant la dette
- ❌ `as SomeType` sauf garantie contextuelle → préférer un type guard
- ❌ `!` (non-null assertion) sans vérification préalable
- ✅ `type` pour les alias, `interface` pour les shapes destinés à être implémentés

`strict` est actif, y compris `noUncheckedIndexedAccess` et
`exactOptionalPropertyTypes`. Un accès indexé renvoie `T | undefined` : le
gérer, ne pas le contourner.

**Exception documentée** : `apps/api/src/core/supabase/database.types.ts` est un
fichier généré. Son stub actuel utilise `any` volontairement — il sera remplacé
par `npm run db:types`. Ne pas l'éditer à la main.

## Secrets

- ❌ Aucune clé d'API, token ou URL de base en dur dans le code
- ❌ Aucun accès à `process.env` hors de `apps/api/src/core/config/configuration.ts`
  et `apps/app/src/shared/lib/env.ts`
- ❌ Aucun secret dans `apps/app` : les variables `EXPO_PUBLIC_*` sont embarquées
  dans le bundle, donc publiques
- ✅ Backend : passer par `ConfigService`

## Erreurs

- ❌ Jamais de `catch` vide
- ❌ Jamais d'erreur avalée sans au minimum un `logger.warn()`
- ✅ Dans un `catch`, vérifier `error instanceof Error` avant d'accéder à `.message`
- ✅ Ne jamais renvoyer au client une erreur brute d'un fournisseur externe :
  elle peut contenir des fragments de prompt, donc des données utilisateur

## Logs

- ❌ Pas de `console.log` en production
- ✅ Backend : `console.error` sur un chemin d’erreur, jamais ailleurs
- ✅ App : retirer les logs avant de committer

## Nommage

| Élément              | Convention                                             |
| -------------------- | ------------------------------------------------------ |
| Fichiers             | `kebab-case`, sauf composants React (`PascalCase.tsx`) |
| Variables, fonctions | `camelCase`                                            |
| Types, classes       | `PascalCase`                                           |
| Constantes exportées | `SCREAMING_SNAKE_CASE`                                 |
| Hooks                | préfixe `use`                                          |
| Symboles d'injection | `SCREAMING_SNAKE_CASE`, ex. `FOLDER_REPOSITORY`        |

## Commentaires

Un commentaire explique **pourquoi**, jamais **quoi**. Un commentaire qui
paraphrase la ligne suivante est du bruit et doit être supprimé.

```ts
// ❌ Incrémente le compteur
count += 1;

// ✅ Le compteur du parent inclut les sous-dossiers : l'utilisateur raisonne
// en « ce que contient Santé », pas en « ce qui est à sa racine ».
count += childCount;
```

## Git

Deux branches permanentes :

| Branche | Rôle                                                          |
| ------- | ------------------------------------------------------------- |
| `main`  | Production — Vercel y déploie l'API et le web automatiquement |
| `dev`   | Intégration — branche par défaut, cible de **toutes** les PR  |

Le flux, sans exception :

```
feat/<description>  →  PR vers dev  →  PR dev → main  →  déploiement Vercel
```

- ❌ Pas de push direct sur `dev` ni sur `main` : les deux sont protégés par un
  ruleset GitHub — PR obligatoire, force-push et suppression refusés
- La CI (job `verify`) doit être verte pour merger. Elle joue `npm ci`,
  `npm run typecheck`, `npm test`, `npm run build` — donc jouer ces commandes
  **en local avant d'ouvrir la PR**, pas après le rouge
- Une PR vers `main` est une mise en production : ne la proposer que quand
  `dev` est démontrable
- Branches : `feat/<description>`, `fix/<description>`, `chore/<description>`,
  créées depuis `dev` à jour
- Commits : `feat: ajouter la conversion conversation → todoliste`
- ❌ Pas de message vague : `fix`, `wip`, `update`, `changes`
- Un commit = une intention atomique

Le dépôt est **public** : secret scanning et push protection sont actifs. Un
secret poussé par erreur fait échouer le push — et s'il passe malgré tout, il
est compromis : le révoquer, ne pas se contenter de le retirer de l'historique.

## Ce qu'on ne fait pas ici

- ❌ Pas de classe utilitaire statique `XxxUtils` / `XxxHelper` → fonctions exportées
- ❌ Pas de classe à instancier pour un service sans état → module de fonctions
- ❌ Pas de logique métier dans une route ou un écran → Service / hook
- ❌ Pas de `class-validator` → Zod uniquement, depuis `packages/domain`
