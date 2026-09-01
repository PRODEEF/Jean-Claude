# Suivi du backlog — Jean-Claude

Livrable du §10 du cahier des charges. Statut de chaque point de l'Annexe A et
des exigences transverses. **À mettre à jour chaque jour**, en même temps que
le report quotidien demandé au §0.1.

Légende : ✅ fait · 🟡 en cours · ⬜ non démarré · 🔵 socle posé (structure et
schéma prêts, comportement à écrire)

Dernière mise à jour : **1er septembre 2026** — page Réglages basique (issue #12,
partielle). L'utilisateur voit son adresse e-mail (non modifiable), change son pseudo et
son thème (clair / sombre / système) ; le modèle IA y figure, affiché mais désactivé.
Côté serveur, cela ouvre le module `domain/user` et `/api/me` — jusqu'ici la table
`profiles` existait sans qu'aucune route n'y donne accès. Aucune migration : les colonnes
`display_name` et `theme` étaient déjà là. Le pseudo enregistré remplace partout le nom
dérivé de l'adresse e-mail. Restent ouverts dans #12 : nom et couleur de l'assistant,
périmètre du mode assistant (A.10).

Auparavant le 1er septembre : issues #5 et #7 terminées. #5 était déjà
couverte par le socle (table de liaison `conversation_folders`, colonne `source`, garde-fou
de profondeur) : vérifiée point par point puis clôturée. #7 rend les dossiers manipulables :
création, renommage et suppression, sous-dossiers visibles dans la barre latérale, et
rangement d'une conversation dans **plusieurs** dossiers à la fois (A.1).

Dans la foulée, la profondeur d'arborescence passe de 2 à **5 niveaux** — écart assumé au
§3 Phase A, à valider avec Yann. Conséquence non évidente : à 2 niveaux aucune boucle
n'était formable, à 5 un déplacement peut ranger un dossier sous l'un de ses propres
sous-dossiers. Le garde-fou de profondeur vérifie donc désormais aussi l'acyclicité, en
base comme dans le service.

Avant cela, le 31 août : issues #3 et #4 — abstraction IA via Vercel AI Gateway, fil de
conversation en flux, timeouts et quotas. API migrée de NestJS vers Hono en vue du
déploiement Vercel : périmètre fonctionnel inchangé, démarrage ramené de 2,4 s à 0,7 s.

---

## Exigences transverses

| Réf. | Exigence                                               | Statut | Note                                                                                                                                        |
| ---- | ------------------------------------------------------ | :----: | ------------------------------------------------------------------------------------------------------------------------------------------- |
| §5.1 | Moteur IA Claude en V1                                 |   ✅   | `anthropic/claude-opus-5` via Vercel AI Gateway                                                                                             |
| §5.1 | Abstraction multi-modèle                               |   ✅   | Port `LlmProvider` + Vercel AI Gateway. **Changer de modèle = changer `LLM_MODEL`**, zéro ligne de code                                     |
| §5.1 | Timeouts, quotas et erreurs                            |   ✅   | Timeout de 60 s (15 s au premier jeton en flux) ; 429 et 402 distingués d'une panne, testés                                                 |
| §5.1 | Choix du modèle par l'utilisateur                      |   🟡   | `LLM_MODEL` reste le défaut serveur, désormais exposé par `/api/health` et affiché **désactivé** dans les réglages. Reste à porter dans `userPreferences` |
| §5.1 | Indication « souverain » ou non                        |   ✅   | `isSovereign` déduit de l'éditeur du modèle, exposé par `/api/health`                                                                       |
| §5.2 | Relation conversation ↔ dossiers plusieurs-à-plusieurs |   ✅   | Table `conversation_folders`                                                                                                                |
| §5.3 | API commune web + mobile                               |   ✅   | REST sur Hono, arbitrage consigné dans `docs/ARCHITECTURE.md` ; client `@jc/api-client` partagé, l'app ne touche jamais la base directement |
| §4.1 | Design responsive, priorité mobile                     |   🟡   | Fil de conversation borné en largeur, cibles tactiles 44 pt, thèmes clair et sombre — ce dernier désormais choisi par l'utilisateur         |
| §4.4 | React Native                                           |   ✅   | Expo SDK 57, Expo Router, React 19                                                                                                          |
| §8   | Postgres portable, migration UE possible               |   ✅   | Aucune extension propriétaire                                                                                                               |
| §8   | **Créer le projet Supabase en région UE**              |   ⬜   | **À faire avant tout remplissage de données**                                                                                               |
| §10  | Repo structuré et documenté                            |   ✅   | `README.md`, `docs/ARCHITECTURE.md`, ce fichier                                                                                             |

---

## Authentification (§6)

| Réf.        | Point                                            | Statut | Note                                                                                                                                                  |
| ----------- | ------------------------------------------------ | :----: | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| §6.1        | E-mail + code à usage unique                     |   ✅   | Parcours complet : envoi, saisie, vérification automatique, renvoi avec délai d'attente, erreurs traduites. Gabarit d'e-mail forcé sur `{{ .Token }}` |
| §6.1        | Règles de validation partagées                   |   ✅   | `packages/domain/src/auth/auth.schema.ts`, 14 tests. Plus aucune règle de saisie dans l'écran                                                         |
| §6.1        | Gabarit d'e-mail à pousser sur le projet hébergé |   ⬜   | `npx supabase config push` — **tant que ce n'est pas fait, le projet hébergé envoie un lien et non un code**                                          |
| §6.2        | 2FA par SMS                                      |   ⬜   | Étape 2. Si non fait dans le sprint → priorité immédiate du backlog restant                                                                           |
| §6.3 / A.13 | Onboarding conversationnel                       |   ⬜   | Champs `memory` et `onboarding_completed_at` prêts en base                                                                                            |

---

## Annexe A — backlog fonctionnel

| Réf. | Point                                                 | Statut | Note                                                                                                                                                      |
| ---- | ----------------------------------------------------- | :----: | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A.0  | Regroupement Perso / Pro                              |   🔵   | Colonne `category` posée, non exploitée — volontaire (option à activer plus tard)                                                                         |
| A.1  | Conversations multi-dossiers, rangement matriciel     |   ✅   | Schéma, `PUT /conversations/:id/folders` et interface de rangement par cases à cocher multiples. L'origine `user`/`assistant` est déjà distinguée en base |
| A.2  | Conversion conversation → todoliste                   |   🔵   | Tables `task_lists` / `tasks` prêtes, outil `suggest_task_list` défini. Module `domain/task` à écrire                                                     |
| A.3  | Détection de tâches datées                            |   🔵   | Champ `dueAt` dans l'outil IA. Extraction et création à écrire                                                                                            |
| A.4  | Sous-dossiers automatiques de projet                  |   🔵   | Colonne `purpose` (idea/todo/purchase/appointment) posée                                                                                                  |
| A.5  | Gestion multi-dimensionnelle d'un projet              |   ⬜   | Phase C ou au-delà                                                                                                                                        |
| A.6  | Recherche avancée par filtres                         |   🔵   | Index plein texte français créés, `searchFiltersSchema` défini. `feature/search` à écrire                                                                 |
| A.7  | Adaptation à la logique de rangement de l'utilisateur |   🔵   | Colonne `source` (user/assistant) sur la liaison — la matière première est capturée                                                                       |
| A.8  | Assistant proactif                                    |   🔵   | Outils IA définis, table `assistant_suggestions` prête. `feature/assistant` à écrire                                                                      |
| A.9  | Multi-plateforme                                      |   🟡   | Web / iOS / Android depuis un codebase, fil de conversation en flux compris. Desktop (Tauri) en Phase C                                                   |
| A.10 | Bornage du mode assistant                             |   🟡   | Canal unique en base, prompt de bornage testé, onglet Jean-Claude opérationnel. Bascule automatique hors périmètre et réglages de périmètre à faire       |
| A.11 | Rendez-vous récurrents + alerte                       |   🔵   | Colonnes `rrule` et `reminder_minutes_before` posées, outil IA défini. Expansion et rappels à écrire                                                      |
| A.12 | Interaction vocale bout en bout                       |   ⬜   | `expo-speech` en dépendance ; STT à arbitrer avec Antonin (§12.3)                                                                                         |
| A.13 | Onboarding conversationnel                            |   ⬜   | Voir §6.3                                                                                                                                                 |

---

## Déploiement stores (§7)

| Point                                        | Statut | Note                                                    |
| -------------------------------------------- | :----: | ------------------------------------------------------- |
| Identifiants de bundle réservés              |   ✅   | `fr.prodeef.jeanclaude` (iOS + Android) dans `app.json` |
| Permissions micro déclarées                  |   ✅   | `NSMicrophoneUsageDescription`, `RECORD_AUDIO`          |
| Compte Apple Developer                       |   ⬜   | À voir avec Nicolas                                     |
| Compte Google Play Console                   |   ⬜   | À voir avec Nicolas                                     |
| Fiches store (icônes, captures, description) |   ⬜   | Phase C                                                 |
| Politique de confidentialité                 |   ⬜   | **Obligatoire** — données de santé et administratives   |
| Processus de review documenté                |   ⬜   | Phase C                                                 |

---

## Points à arbitrer

| Sujet                                             | Réf.  | Interlocuteur                                                  |
| ------------------------------------------------- | ----- | -------------------------------------------------------------- |
| Région d'hébergement Supabase (UE recommandé)     | §8    | Antonin                                                        |
| Service de reconnaissance vocale (natif ou tiers) | §12.3 | Antonin — budget / latence                                     |
| Date réelle du rendez-vous de cadrage             | §0    | Yann — le document signale l'incohérence du « 31 septembre »   |
| **Profondeur d'arborescence portée de 2 à 5**     | §3    | Yann — écart assumé au cahier des charges, à valider           |
| Jeu d'icônes de la navigation                     | §4.2  | — lucide-react-native en place (défaut react-native-reusables) |

## Points nécessitant un A/B testing humain (§4.3)

| Sujet                                      | Ce qui a été tranché, faute de mieux                                                                                                                                                                                                                                                                  |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Actions d'un dossier et d'une conversation | Une **fenêtre unique** portant toutes les actions, ouverte par un « … ». Les applications de référence ne convergent pas : ChatGPT et Claude posent un menu déroulant au survol, Notion et Apple Notes un menu contextuel — or ni le survol ni le clic droit n'existent au doigt (§4.2 non concluant) |
| Lisibilité de la barre au 5e niveau        | Chaque niveau ajoute un retrait et un filet vertical. Au 5e, la barre est très entamée à gauche et les libellés se tronquent. L'aplatissement a été écarté — il perdrait la filiation — mais le point demande à être vu avec un vrai volume de dossiers                                               |

## Dette technique connue

| Point                                | Détail                                                                                                                                                              |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pagination remontante du fil absente | Le fil charge les 50 derniers messages ; au-delà, l'historique n'est pas atteignable. `nextCursor` est déjà renvoyé par l'API                                       |
| Titre de conversation non généré     | Toute conversation créée s'appelle « Nouvelle conversation ». Le §5.2 prévoit un titre déduit des premiers messages                                                 |
| `toolCalls` non exploités            | Le modèle produit bien des appels `suggest_task_list` / `suggest_folders`, le service les reçoit et ne les persiste pas. C'est `feature/assistant`, Phase B (§12.1) |
| Node ≥ 22.12 requis                  | Le SDK `ai` est ESM-only et l'API compile en CommonJS : `require(esm)` n'est natif qu'à partir de Node 22.12. `engines` a été relevé en conséquence                 |

Le `.env` racine est chargé par l'API (`ConfigModule`) et par Expo
(`app.config.js` / `metro.config.js`).

## Éléments du cahier des charges non disponibles

Aucun. Les deux maquettes annoncées aux §1 et §4.5 sont dans `models/` —
`maquette-interface-ia.html` (web) et `maquette-interface-mobile.html`. La
barre latérale en reprend la structure : entrée Jean-Claude en tête, bouton
« Nouvelle conversation », « + » d'ajout de dossier sur l'en-tête de section,
groupes de dossiers repliables, « … » dans l'en-tête de conversation.
