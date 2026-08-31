# Suivi du backlog — Jean-Claude

Livrable du §10 du cahier des charges. Statut de chaque point de l'Annexe A et
des exigences transverses. **À mettre à jour chaque jour**, en même temps que
le report quotidien demandé au §0.1.

Légende : ✅ fait · 🟡 en cours · ⬜ non démarré · 🔵 socle posé (structure et
schéma prêts, comportement à écrire)

Dernière mise à jour : **31 août 2026** — issues #3 et #4 terminées : abstraction IA via
Vercel AI Gateway, fil de conversation en flux, timeouts et quotas. Critère de recette
§11 Phase A validé. API migrée de NestJS vers Hono dans la foulée, en vue du
déploiement Vercel : périmètre fonctionnel inchangé, démarrage ramené de 2,4 s à 0,7 s.

---

## Exigences transverses

| Réf. | Exigence                                               | Statut | Note                                                                                                    |
| ---- | ------------------------------------------------------ | :----: | ------------------------------------------------------------------------------------------------------- |
| §5.1 | Moteur IA Claude en V1                                 |   ✅   | `anthropic/claude-opus-5` via Vercel AI Gateway                                                         |
| §5.1 | Abstraction multi-modèle                               |   ✅   | Port `LlmProvider` + Vercel AI Gateway. **Changer de modèle = changer `LLM_MODEL`**, zéro ligne de code |
| §5.1 | Timeouts, quotas et erreurs                            |   ✅   | Timeout de 60 s (15 s au premier jeton en flux) ; 429 et 402 distingués d'une panne, testés             |
| §5.1 | Choix du modèle par l'utilisateur                      |   ⬜   | `LLM_MODEL` est le défaut serveur. À porter dans `userPreferences` + panneau de réglages                |
| §5.1 | Indication « souverain » ou non                        |   ✅   | `isSovereign` déduit de l'éditeur du modèle, exposé par `/api/health`                                   |
| §5.2 | Relation conversation ↔ dossiers plusieurs-à-plusieurs |   ✅   | Table `conversation_folders`                                                                            |
| §5.3 | API commune web + mobile                               |   ✅   | Hono ; l'app ne touche jamais la base directement                                                         |
| §4.1 | Design responsive, priorité mobile                     |   🟡   | Fil de conversation borné en largeur, cibles tactiles 44 pt, thèmes clair et sombre                     |
| §4.4 | React Native                                           |   ✅   | Expo SDK 57, Expo Router, React 19                                                                      |
| §8   | Postgres portable, migration UE possible               |   ✅   | Aucune extension propriétaire                                                                           |
| §8   | **Créer le projet Supabase en région UE**              |   ⬜   | **À faire avant tout remplissage de données**                                                           |
| §10  | Repo structuré et documenté                            |   ✅   | `README.md`, `docs/ARCHITECTURE.md`, ce fichier                                                         |

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

| Réf. | Point                                                 | Statut | Note                                                                                                                                   |
| ---- | ----------------------------------------------------- | :----: | -------------------------------------------------------------------------------------------------------------------------------------- |
| A.0  | Regroupement Perso / Pro                              |   🔵   | Colonne `category` posée, non exploitée — volontaire (option à activer plus tard)                                                      |
| A.1  | Conversations multi-dossiers, rangement matriciel     |   🔵   | Schéma, repository et `PUT /conversations/:id/folders` faits. UI à construire                                                          |
| A.2  | Conversion conversation → todoliste                   |   🔵   | Tables `task_lists` / `tasks` prêtes, outil `suggest_task_list` défini. Module `domain/task` à écrire                                  |
| A.3  | Détection de tâches datées                            |   🔵   | Champ `dueAt` dans l'outil IA. Extraction et création à écrire                                                                         |
| A.4  | Sous-dossiers automatiques de projet                  |   🔵   | Colonne `purpose` (idea/todo/purchase/appointment) posée                                                                               |
| A.5  | Gestion multi-dimensionnelle d'un projet              |   ⬜   | Phase C ou au-delà                                                                                                                     |
| A.6  | Recherche avancée par filtres                         |   🔵   | Index plein texte français créés, `searchFiltersSchema` défini. `feature/search` à écrire                                              |
| A.7  | Adaptation à la logique de rangement de l'utilisateur |   🔵   | Colonne `source` (user/assistant) sur la liaison — la matière première est capturée                                                    |
| A.8  | Assistant proactif                                    |   🔵   | Outils IA définis, table `assistant_suggestions` prête. `feature/assistant` à écrire                                                   |
| A.9  | Multi-plateforme                                      |   🟡   | Web / iOS / Android depuis un codebase, fil de conversation en flux compris. Desktop (Tauri) en Phase C                                |
| A.10 | Bornage du mode assistant                             |   🟡   | Canal unique en base, prompt de bornage testé, onglet Jean-Claude opérationnel. Bascule automatique hors périmètre et réglages à faire |
| A.11 | Rendez-vous récurrents + alerte                       |   🔵   | Colonnes `rrule` et `reminder_minutes_before` posées, outil IA défini. Expansion et rappels à écrire                                   |
| A.12 | Interaction vocale bout en bout                       |   ⬜   | `expo-speech` en dépendance ; STT à arbitrer avec Antonin (§12.3)                                                                      |
| A.13 | Onboarding conversationnel                            |   ⬜   | Voir §6.3                                                                                                                              |

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

| Sujet                                             | Réf.  | Interlocuteur                                                |
| ------------------------------------------------- | ----- | ------------------------------------------------------------ |
| Région d'hébergement Supabase (UE recommandé)     | §8    | Antonin                                                      |
| Service de reconnaissance vocale (natif ou tiers) | §12.3 | Antonin — budget / latence                                   |
| Date réelle du rendez-vous de cadrage             | §0    | Yann — le document signale l'incohérence du « 31 septembre » |
| Jeu d'icônes de la navigation                     | §4.2  | — lucide-react-native en place (défaut react-native-reusables) |

## Points nécessitant un A/B testing humain (§4.3)

Aucun à ce stade — aucune décision d'interface contestable n'a encore été
tranchée. À alimenter dès que les écrans réels seront construits.

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

| Élément                      | Réf.     | Impact                                                                                                                       |
| ---------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `maquette-interface-ia.html` | §1, §4.5 | Référence visuelle et fonctionnelle du web — **manquante**. Nécessaire pour construire les écrans conformément à la maquette |
