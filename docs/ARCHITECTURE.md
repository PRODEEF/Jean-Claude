# Architecture — Jean-Claude

Ce document explique **pourquoi** le projet est structuré ainsi. Les références
`§x` et `A.x` renvoient au cahier des charges v1.8 du 24 août 2026.

---

## 1. Vue d'ensemble

```
┌─────────────────────────────────────────────────────────────┐
│  apps/app — Expo Router (React Native + react-native-web)   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────┐  │
│  │   Web    │  │   iOS    │  │ Android  │  │   Desktop   │  │
│  │          │  │          │  │          │  │ (Phase C)   │  │
│  └──────────┘  └──────────┘  └──────────┘  └─────────────┘  │
└───────────────────────────┬─────────────────────────────────┘
                            │  @jc/api-client (HTTP typé)
                            │  @jc/domain     (types + Zod)
                            │  @jc/design     (jetons)
┌───────────────────────────▼─────────────────────────────────┐
│  apps/api — Hono                    API commune (§5.3)      │
│                                                              │
│   core/     config · supabase · auth · llm · http           │
│   domain/   folder · conversation · task · calendar · user  │
│   feature/  assistant · search · health                     │
└───────────────────────────┬─────────────────────────────────┘
                            │
        ┌───────────────────┴────────────────────┐
        ▼                                        ▼
┌───────────────────┐                  ┌────────────────────┐
│ Supabase Postgres │                  │  LlmProvider (port)│
│ RLS · Auth OTP    │                  │  └─ Claude (V1)    │
│                   │                  │  └─ Mistral  ⋯     │
└───────────────────┘                  └────────────────────┘
```

---

## 2. Les quatre décisions structurantes

### 2.1 Un seul codebase UI pour les quatre plateformes

**Décision.** `apps/app` est une application Expo Router unique qui produit le
web, iOS et Android. Le desktop sera un wrapper (Tauri) autour du build web.

**Pourquoi.** Le §A.9 demande quatre plateformes avec une expérience cohérente,
le §4.4 impose React Native, et le §3 rappelle que le backlog complet
représente « plusieurs mois de développement standard » pour 10 jours
disponibles. Écrire l'UI deux fois — chat, dossiers, calendrier, todolist,
recherche, réglages, auth, onboarding — n'était pas tenable dans ce temps.

**Comment on respecte quand même le §4.5** (« adapter aux patterns natifs
plutôt que recopier ») : la divergence entre plateformes se gère dans le même
codebase, par deux mécanismes.

| Mécanisme                                | Usage                                                                                               |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `useBreakpoint()`                        | `compact` (< 768 pt) → onglets + tiroir ; `expanded` → sidebar permanente comme sur la maquette web |
| `Fichier.web.tsx` / `Fichier.native.tsx` | Quand un composant doit être franchement différent (ex. le calendrier mois)                         |

**Ce que ça coûte.** Les primitives sont celles de React Native (`View`,
`Text`, `Pressable`), pas du HTML/CSS. Les vues denses de type calendrier
desktop demandent plus de travail qu'en HTML.

---

### 2.2 Toute la logique métier vit dans l'API

**Décision.** L'application cliente n'écrit jamais en base directement. Elle
n'utilise Supabase que pour l'authentification ; tout le reste passe par
`apps/api`.

**Pourquoi.**

1. Le §5.3 l'exige explicitement — une API commune pour éviter la duplication
   de la logique de classement, todolist, calendrier, recherche et bornage.
2. La clé du moteur IA ne peut pas se trouver dans un bundle client. Un bundle
   mobile est décompilable ; une clé qui y figure est une clé publiée.
3. Le bornage du canal permanent (A.10) et la détection proactive (§12.1) sont
   des règles produit : elles doivent valoir identiquement sur les quatre
   plateformes, sans réimplémentation.

**REST plutôt que GraphQL.** Le §5.3 laisse le choix ouvert. L'API est REST :
JSON sur HTTP, un chemin par ressource, pagination par curseur (jamais par
offset), `201` à la création, `204` à la suppression, et une forme d'erreur
unique portée par `core/http.ts`.

**Pourquoi.**

1. L'argument principal de GraphQL — un contrat typé partagé entre le serveur
   et ses clients — est déjà obtenu autrement ici. `@jc/domain` porte les
   schémas Zod, le backend valide avec, `@jc/api-client` renvoie les mêmes
   types : une divergence de contrat casse la compilation **des deux côtés**,
   sans schéma ni codegen à maintenir en plus.
2. L'API n'a qu'un seul client — `apps/app`, dont le même codebase produit les
   quatre plateformes. Le sur-fetch que GraphQL corrige suppose plusieurs
   clients aux besoins divergents : ce n'est pas la situation.
3. La réponse de l'assistant arrive au fil de sa génération. En REST c'est une
   route qui répond en `text/event-stream` ; en GraphQL il aurait fallu des
   subscriptions, donc un transport WebSocket de plus à faire tenir sur le web,
   iOS et Android.
4. Le §8 demande d'éviter les dépendances qui rendraient coûteuse une migration
   UE ultérieure. Hono ne dépend d'aucun service tiers : l'API se redéploie
   telle quelle sur n'importe quel hébergeur Node ou runtime edge.

**Ce que ça coûte.** Une vue qui agrège plusieurs ressources demande plusieurs
appels, ou un endpoint dédié dans `feature/` — c'est précisément le rôle de
cette couche.

---

### 2.3 Le moteur IA est derrière un port, lui-même branché sur un routeur

**Décision.** `core/llm/llm.port.ts` définit l'interface `LlmProvider`. Un seul
fichier de l'application importe un SDK de modèle IA :
`providers/gateway.provider.ts`, adaptateur de **Vercel AI Gateway**.

**Pourquoi.** Le §5.1 demande de pouvoir brancher Mistral, DeepSeek ou Qwen
« sans réécriture majeure ». Le Gateway expose ces éditeurs — et des centaines
d'autres — derrière une clé unique et un identifiant de la forme
`éditeur/modèle`. La promesse du §5.1 se trouve donc dépassée : il n'y a pas
de réécriture _du tout_.

**Comment changer de moteur.**

```bash
LLM_MODEL=mistral/mistral-large
```

C'est tout. Aucun fichier n'est touché, aucune seconde clé d'API à obtenir.
`LLM_MODEL` est le modèle **par défaut** du serveur : à terme, l'utilisateur
choisira le sien dans ses préférences, et cette valeur deviendra le repli.

**Pourquoi garder le port, alors, s'il n'a qu'une implémentation ?** Parce que
c'est lui qui tient l'invariant : aucun service métier n'importe un SDK de
modèle, tous importent `llm` et parlent à l’interface. C'est aussi ce
qui rend `ConversationService` testable sans réseau. Un second adaptateur ne
sera écrit que le jour où un moteur devra être appelé hors Gateway — ce qui
n'est pas prévu.

**Souveraineté.** L'interface porte `isSovereign`, exposé par `/api/health`,
pour signaler à l'utilisateur si le modèle qui traite ses données est hébergé
en UE — exigence croisée du §5.1 et du §13.4.6. La valeur se lit sur l'**éditeur**
du modèle (le préfixe de `LLM_MODEL`), pas sur le Gateway : celui-ci n'est
qu'un routeur, c'est bien Mistral ou Anthropic qui traite le contenu des
conversations. Pour la même raison, chaque message persiste dans
`messages.provider` l'éditeur qui l'a produit, et non `gateway`.

**Le point le moins évident** : les suggestions proactives du §12.1 passent par
le _tool use_ du modèle (`core/llm/llm.tools.ts`), pas par une analyse du texte
de la réponse. Demander au modèle d'appeler `suggest_task_list` donne une
sortie structurée et vérifiable ; parser « on dirait qu'une liste se dessine »
en langage naturel serait fragile.

---

### 2.4 Le rangement matriciel est dans le schéma dès le départ

**Décision.** Table de liaison `conversation_folders`, jamais de colonne
`folder_id` sur `conversations`.

**Pourquoi.** Le §5.2 et le point A.1 le demandent. Surtout : c'est le genre de
choix qu'on ne peut pas différer. Passer d'un parent unique à une relation
plusieurs-à-plusieurs en cours de route implique de migrer les données, de
réécrire les requêtes et de reprendre l'UI. Le coût de le poser tout de suite
est nul ; le coût de le rattraper en Phase C ne l'est pas.

La colonne `source` (`user` | `assistant`) sur la liaison enregistre qui a
décidé du rangement. C'est la matière première du point A.7 : quand
l'utilisateur corrige un classement automatique, c'est un signal
d'apprentissage.

---

## 3. Organisation du code

### `packages/` — partagé, sans dépendance de plateforme

| Package          | Contenu                             | Règle                                                           |
| ---------------- | ----------------------------------- | --------------------------------------------------------------- |
| `@jc/domain`     | Types + schémas Zod + règles métier | Aucune dépendance à Hono, React, Supabase                       |
| `@jc/api-client` | Client HTTP typé                    | `fetch` seul — pas d'axios, pas d'API de plateforme             |
| `@jc/design`     | Jetons de design                    | Valeurs numériques, consommables par `StyleSheet` et par le web |

`@jc/domain` est importé **par les deux côtés**. Un changement de contrat casse
la compilation de l'API _et_ de l'app, au lieu de produire une divergence
silencieuse détectée à l'exécution.

### `apps/api/src/` — trois couches

```
core/      Infrastructure transverse : config, supabase, auth, llm, filters
domain/    Une entité métier par module : folder, conversation, task, calendar
feature/   Cas d'usage transverses composant plusieurs domaines
```

**Règle de dépendance** : `feature/` peut dépendre de `domain/`. L'inverse est
interdit. C'est ce qui garde les modules `domain/` réutilisables.

**Chaque module `domain/` suit le même découpage** :

```
folder/
  folder.routes.ts                HTTP — validation Zod, pas de logique
  folder.service.ts               Logique métier — testable sans base
  folder.repository.interface.ts  Contrat consommé par le service
  folder.repository.ts            Supabase — seul endroit avec du snake_case
  folder.service.spec.ts          Tests unitaires sur doubles
```

Le service reçoit l’**interface** du Repository, jamais la classe concrète.
C'est ce qui permet de tester la logique métier avec un double, sans base.

---

## 4. Sécurité et RGPD

| Mesure                                           | Où                          | Pourquoi                                               |
| ------------------------------------------------ | --------------------------- | ------------------------------------------------------ |
| RLS activée sur toutes les tables                | `supabase/migrations/`      | Dernier rempart même en cas de bug applicatif          |
| Requêtes métier sous l'identité de l'utilisateur | `SupabaseService.forUser()` | `admin` (bypass RLS) réservé aux traitements planifiés |
| Jeton en Keychain / Keystore                     | `token-storage.ts`          | §8 — données de santé et administratives               |
| Erreurs fournisseur jamais renvoyées au client   | `claude.provider.ts`        | Elles peuvent contenir des fragments de prompt         |
| Postgres standard, sans extension propriétaire   | migration initiale          | §8 — migration UE = `pg_dump` / `pg_restore`           |

**Pour la migration UE (§8)** : créer le projet Supabase en région
`eu-west-3` (Paris) ou `eu-central-1` (Francfort) dès maintenant. C'est gratuit
à faire au départ et coûteux à rattraper. Supabase étant open source et
auto-hébergeable, aucun verrou ne subsiste au-delà de ce choix de région — le
point restant à trancher plus tard étant le moteur IA, Claude étant hébergé
hors UE.

---

## 5. Ce qui n'est pas encore là

Tous les modules `domain/` du socle sont écrits — `folder`, `conversation`,
`calendar`, `task`, `user`, `suggestion` — ainsi que `feature/assistant` et
`feature/search`. Restent, en suivant exactement le même découpage :

- la conversion d'une conversation en todoliste (A.2) : `domain/task` existe,
  mais un appel `suggest_task_list` du modèle n'a pas encore de traduction en
  proposition, ni d'exécution à l'acceptation
- l'expansion des séries récurrentes et la délivrance des rappels (A.11), qui
  demandent un planificateur dont le projet ne dispose pas encore

Le modèle **lit** aujourd'hui l'agenda par contexte injecté dans la consigne du
canal permanent, et non par appel d'outil : le port `LlmProvider` ne transporte
pas de résultat d'outil, et lui en faire transporter ouvrirait une boucle
outil → résultat → second appel. C'est un choix de périmètre, réversible : le
jour où plusieurs sources devront être interrogées à la demande, c'est le port
qu'il faudra faire évoluer, pas les services.

Le suivi point par point est dans [SUIVI-BACKLOG.md](SUIVI-BACKLOG.md).
