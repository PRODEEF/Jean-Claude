# ROADMAP — Jean Claude

> Ce fichier résume les décisions, priorités et règles arrêtées côté chat de gestion de projet (claude.ai, Projet « JEAN CLAUDE »). Il sert de point de synchronisation pour toute session Claude Code sur `PRODEEF/Jean-Claude` : collez-y le résumé d'une décision prise côté chat, et toute session future pourra la lire.
>
> Le suivi détaillé et interactif (cases à cocher, progression) reste dans l'artifact HTML du chat de gestion de projet. Ce fichier-ci est volontairement condensé pour la lecture par Claude Code.
>
> **Ce fichier pilote** (quoi, dans quel ordre). `docs/SUIVI-BACKLOG.md` **constate** (où en est chaque point du cahier des charges). Les références `A.x` et `§x` renvoient à ce dernier.

**Complété le 5 novembre 2026** à partir du code de `dev` (dernier commit : 2 octobre) et de `docs/SUIVI-BACKLOG.md`. Les mentions **[ajout]** viennent de ce recoupement ; tes lignes d'origine sont conservées telles quelles. Légende : ✅ fait dans le code · 🟡 partiel · ⬜ non démarré · 👁 fait mais **à tester à la main** · ❓ non vérifiable dans le code. Aucun de ces statuts n'a été joué dans une vraie app : ils viennent du code, du backlog et de la CI.

## Vision

**Jean-Claude est un assistant IA conversationnel qui sert aussi de second cerveau personnel.** Tu lui parles comme à n'importe quelle IA, mais ce que tu lui dis ne se perd pas : il le range, le relie et te le ressort au bon moment. Il a vocation à remplacer les multiples todolistes Notion, avec en plus une IA qui aide à aller plus vite.

Tu ne choisis jamais où classer une information. Tu écris, il propose un rangement, et tu acceptes ou tu ignores d'un geste. Une conversation sur la mutuelle vit à la fois dans « Santé » et dans « Administratif ». Il détecte les tâches et les dates dans tes échanges, les transforme en todolistes et en rendez-vous, et te propose, sans jamais agir à ta place. Tout reste modifiable à la main, mais par défaut l'IA le définit mieux que nous.

Il vise le grand public, sans prérequis technique. C'est le contrepoint de Notion et d'Obsidian, puissants mais exigeants : ici, aucun jargon de gestion de connaissances, juste une conversation qui s'organise toute seule. Un seul code pour le web, iOS, Android et bientôt le desktop, avec un moteur IA interchangeable et des données hébergées en Europe.

## Règles permanentes

_(les trois premières sont tirées de `CLAUDE.md` ; les suivantes sont des propositions à valider)_

- **[ajout] Les 6 invariants d'architecture ne se discutent pas** : aucun SDK de modèle IA hors de `core/llm/providers/` ; aucune logique métier dans un écran ; l'app n'écrit jamais en base directement ; une conversation n'a pas de dossier parent unique (`conversation_folders`) ; aucun secret dans `apps/app` ; l'assistant propose, il n'exécute pas.
- **[ajout] Flux git** : `feat/<description>` → PR vers `dev` → PR `dev` → `main` → déploiement Vercel. Pas de push direct sur `dev` ni `main`. La CI (`verify`) doit être verte.
- **[ajout] Langue** : code en anglais ; commentaires, messages d'erreur, docs et commits en français (Conventional Commits).
- **[ajout, à confirmer] Ne jamais merger vers `main` sans validation explicite.** Une PR vers `main` est une mise en production.
- **[ajout, à confirmer] Tester à la main sur `dev` avant de proposer `dev` → `main`.** Aujourd'hui la CI ne vérifie que typage, tests de l'API et build.

## Priorités actuelles

### P5 — urgent

- [ ] Remodeler la structure et l'arborescence des dossiers de « Mes Collaborations » comme « Mes dossiers ». **[ajout] 👁 Fait dans le code** (PR #159 : chaque espace est une section au même format que « Mes dossiers »). À valider visuellement.
- [x] Invitation par mail — vérifier si cela invite aussi quelqu'un qui n'est pas encore sur Jean Claude (lien entrant avec mail, direct sur la vue « entrer le mot de passe à 8 chiffres » et go). **[ajout] ✅ Testé en production par Yann le 5 novembre : fonctionne très bien.** Le mail ne contient toujours pas de lien direct vers la saisie du code (il dit « connectez-vous sur {URL} avec l'adresse ») : à ne reprendre que si ce détour gêne vraiment.
- [ ] Vérifier le paramétrage des heures et du positionnement dans le calendrier. **[ajout] 👁** PR #161 : grilles qui défilent sans perdre l'en-tête. À tester (voir « À tester »).
- [ ] Même UX/UI partout pour ajouter une tâche dans un TODO (référence : ajout de tâche dans « Mes listes » — case à cocher + texte « Ajouter une tâche » en gros et clair). **[ajout] ❓** `TaskListEditor` a été réécrit en #161 ; à comparer écran par écran (Mes listes, calendrier, espaces).
- [ ] Déplacer les TODO en glissé-déposé. **[ajout] 🟡 Web fait** (PR #161). **Mobile non fait** : la PR dit « glisser-déposer web ».
- [ ] Mobile — le bouton qui fait apparaître la marge gauche ne fonctionne pas. **[ajout] ❓** La barre latérale a été refaite depuis (#159). À retester sur téléphone avant de corriger.
- [ ] Canal permanent → proposer une conversation classique quand l'échange devient « une conversation » (modèle pas assez performant en l'état). **[ajout] 🟡** La bascule existe (A.10). Le problème est la **qualité du modèle** : le défaut est `mistral/ministral-14b`. Arbitrage : consigne plus fine, ou modèle plus fort pour le canal.
- [ ] Mode réunion qui enregistre à la voix. **[ajout] ⬜** Seules la dictée d'un message et la lecture à voix haute existent (A.12).
- [ ] Parler du choix du modèle. **[ajout]** Le catalogue de 3 modèles est déjà dans les réglages (§5.1). Reste la **décision produit** : voir « Choisir le modèle dès la question » plus bas.
- [ ] Transformer une conversation solo en conversation collaborative (voir UX/UI). **[ajout] ⬜** Je n'ai rien trouvé à ce sujet dans le backlog.

### P4 — important

- [ ] Lenteur globale (roue dentée / dark pattern) — faire comme Claude, avec un compteur de secondes. **[ajout] 🟡 Le compteur existe** (`ThinkingIndicator`, `useElapsedSeconds`). La lenteur elle-même demeure : un modèle qui répond par un appel d'outil déclenche un second appel, ce qui **double l'attente** (dette connue).
- [ ] **[ajout, demande de Yann le 5 novembre]** Faire patienter pendant la réponse, façon chat conversationnel : Jean-Claude « réfléchit », argumente, puis écrit — un dark pattern d'attente assumé. **[ajout] 🟡 Fait : roue dentée + compteur de secondes, en tête-à-tête et désormais aussi dans les groupes (PR #171, 5 novembre).** Reste : aucun texte de réflexion n'est montré. À décider : afficher un court raisonnement du modèle (dépend de ce que le moteur renvoie) ou des étapes d'attente rédigées côté serveur (« je relis ton agenda… »).
- [ ] Test avec Clarisse — import des TODO Notion. **[ajout] ⬜ Hors code** : aucun import Notion n'existe. À mener avec Clarisse.
- [ ] Vue latérale droite (Calendrier / TODOs / etc.), comme sur Claude. **[ajout] ⬜** Notée au backlog (aperçu calendrier / listes en conversation, « 07 »), non implémentée, écran large seulement.
- [ ] Suggestion de nom de dossier pour ranger la conversation. **[ajout] 🟡** L'assistant propose déjà un rangement pour un fil non classé (A.1) et une arborescence de projet (A.4). Une suggestion de **nom** pour un dossier nouveau n'est pas dédiée.

## [ajout] Gros chantiers à démarrer

Classés pour l'objectif de la vision : remplacer les todolistes Notion. Ordre recommandé, à valider.

- [ ] **1. Import des TODO Notion** (P4, test avec Clarisse). Aucun import n'existe : sans lui, tout se ressaisit. Piste la plus simple : un import par fichier CSV.
- [ ] **2. Rappels et récurrences** (back-end, A.11). Aucun planificateur : un rendez-vous récurrent n'apparaît qu'à son premier créneau, aucun rappel ne part. Débloque aussi « Vocaux le matin ».
- [ ] **3. « Projet » et instructions par dossier** (P4, A.4/A.5). Un contexte partagé par dossier, comme les Projets de Claude. Le plus gros chantier de conception : trancher d'abord dossier ou projet.
- [ ] **4. Mode réunion à la voix** (P5, A.12). Dépend du choix du service de dictée, resté en suspens avec Antonin.

À côté, deux points hors code qui bloquent : projet Supabase en région UE, politique de confidentialité (voir la section « Hors code » plus bas).

## À tester

- [ ] Calendrier et todo au fil de l'eau — à l'ouverture, afficher le jour du jour en haut à gauche ; idem pour la TODO (ajustable à l'heure près, mobile ouvert sur l'heure en cours). **[ajout]** Le haut du calendrier est ancré depuis #161. **L'ouverture sur le jour courant et sur l'heure en cours sur mobile n'est pas vérifiée.**
- [ ] **[ajout]** Glisser-déposer des tâches : ordre conservé après rechargement, y compris sous les bandeaux du jour.
- [ ] **[ajout]** « Mes Collaborations » : mêmes gestes que « Mes dossiers » (déplacer, ranger, déplier).
- [ ] **[ajout]** Pastille rouge de non-lu (PR #157, en production) : thème clair et sombre, couleur d'assistant différente du rouge.
- [ ] **[ajout]** Application sur iOS et Android : presque rien n'y a été joué.

## Bugs connus

- Suggestion de dossier incohérente sur une deuxième conversation (dossier « Environnement » suggéré au lieu d'« Impôts »). **[ajout] Piste :** consigne de détection d'A.1/A.4, à rejouer avec ces deux conversations.
- Test jours travaillés / non travaillés (suite au test de Mégane). **[ajout] ❓** Aucune trace dans le code ni le backlog ; à décrire (quel écran, quel comportement attendu) avant de pouvoir le traiter.
- La pastille de discussion (notification) pose de temps en temps problème. **[ajout] Cause probable connue :** le compteur `unread_count` est incrémenté par trigger mais **jamais décrémenté** à la suppression. Après une édition ou une reprise de tour, il peut sur-compter. À confirmer par un cas reproductible.

## Backlog / idées (non priorisé pour le dev immédiat)

- Vocaux le matin + voix personnalisable (P4). **[ajout] Bloqué :** aucun planificateur n'existe, donc aucun rappel n'est délivré (A.11).
- Pas d'équivalent au « Projet » de Claude — mémoire partagée, contexte, instructions dédiées (P4). **[ajout]** Déjà au backlog : « distinguer dossier et projet » et « instructions par dossier » (décision de Yann, A.4/A.5).
- Outils de l'assistant peu clairs, équivalent de la commande « / » (P4)
- Modeler le calendrier à la demande (P3)
- Transformer le canal PROBLÈME en conversation (P3). **[ajout]** Lié à la décision sur le bouton « Signaler un problème » (Clarisse).
- Messages groupés à tous les users via Jean Claude (P3)
- Choisir le modèle dès la question, avec détection auto + suggestion de modèle selon le besoin (P3)
- Pas d'instructions perso — idée d'un onglet « Ma relation » (P3)
- Trop de questions posées par l'IA pour rien (P3)
- Todo liste multi-colonnes façon Notion / ClickUp (P2)
- Design des conversations façon chat, statut lu/non lu en marge (P2)
- Business model à réfléchir (P2)
- Business intelligence pédagogique (P2)
- Interface qui se métamorphose sur demande (P1)

---

## [ajout] Ce qui manquait : le reste du projet par couche

Ta roadmap suit surtout le produit visible. Ces points viennent de `SUIVI-BACKLOG.md` et ne sont pas dans les priorités ci-dessus.

### Hors code — à décider ou à faire (bloquants pour la suite)

- [ ] **Projet Supabase en région UE** — « à faire avant tout remplissage de données » (§8). Je ne sais pas si c'est fait.
- [ ] **`npx supabase config push`** — tant que non fait, le projet hébergé envoie un lien et non un code à 8 chiffres (§6.1). Lié à l'invitation par mail ci-dessus.
- [ ] **Politique de confidentialité** — obligatoire (données de santé et administratives).
- [ ] Comptes Apple Developer et Google Play (à voir avec Nicolas), fiches de store.
- [ ] Valider les **espaces d'équipe et discussions de groupe**, hors cahier des charges V1 (`docs/COLLABORATION.md`).
- [ ] Valider la **profondeur d'arborescence portée de 2 à 5** (écart assumé, §3).
- [ ] Décider du sort du bouton « Signaler un problème ».
- [ ] Arbitrer le service de dictée avec Antonin (natif provisoire).
- [ ] **7 PR Dependabot ouvertes** (#163 à #169) : merger celles dont la CI est verte ; #168 (zod 3 → 4) échoue et demande une migration.

### Back-end

- [ ] Planificateur de rappels (rappels du matin, alertes de rendez-vous) — débloque « Vocaux le matin ».
- [ ] Calcul des occurrences récurrentes (`rrule`, A.11) — aujourd'hui un rendez-vous récurrent n'apparaît qu'à son premier créneau.
- [ ] Rattacher un rendez-vous à un dossier (migration), pour « Prendre RDV » (A.4).
- [ ] Modèle de repli si le quota du moteur IA est atteint.
- [ ] `suggest_events` ne produit parfois qu'un rendez-vous quand le message en cite plusieurs.
- [ ] Corriger le décompte de non-lu (voir « Bugs connus »).
- [ ] 2FA par SMS (§6.2).

### Front

- [ ] Glisser-déposer des tâches sur mobile.
- [ ] Aperçu calendrier / listes dans la conversation (vue latérale droite).
- [ ] Restaurer le pouce sélectionné après rechargement (la notation est enregistrée mais pas renvoyée).
- [ ] Lisibilité de la barre latérale au 5e niveau de dossiers (à voir avec un vrai volume).

### Plus tard (phase C)

- [ ] Desktop (Tauri), gestion multi-dimensionnelle d'un projet (A.5), regroupement Perso/Pro (A.0), adaptation au rangement de l'utilisateur (A.7), processus de review des stores.

---

_Dernière synchronisation depuis le chat de gestion de projet : voir l'historique du Projet « JEAN CLAUDE » sur claude.ai._
