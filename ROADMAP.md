# ROADMAP — Jean Claude

> Point de synchronisation entre le chat de gestion de projet (claude.ai, Projet « JEAN CLAUDE ») et toute session Claude Code sur `PRODEEF/Jean-Claude`. **Ce fichier est la source de vérité de la todo.** L'artifact interactif du chat n'en est que la vue : https://claude.ai/artifact/BBJxcEXZyvDXh6osuwifYG
>
> Il pilote (quoi, dans quel ordre). `docs/SUIVI-BACKLOG.md` constate (où en est chaque point du cahier des charges) ; les références `A.x` et `§x` y renvoient.

## Comment le tenir à jour

- **Une tâche = une ligne** : ``- [ ] `ZONE` `Page` **Titre** — détail ⏸ raison d'attente <!--id:identifiant-->``. Zones : `DATA`, `BACKEND`, `ALGO`, `FRONT`. Le `⏸` marque un « stand by » ; `[x]` une tâche faite.
- **Un groupe = un titre `###`**. L'ordre des groupes et des lignes est celui de l'artifact.
- **Quand une PR avance un point**, cocher la ligne et mettre le détail à jour (numéro de PR, ce qui reste).
- **À chaque merge**, ajouter une ligne en tête de « Quoi de neuf », en langage courant : ce qui change, où le voir, s'il est testé.
- **Pour régénérer l'artifact** : relire la version en ligne, y remplacer ses données par celles de ce fichier, republier. Cocher dans l'artifact ne met pas ce fichier à jour : redire à Claude ce qui a été coché.
- Dernier recoupement avec le code de `dev` et le backlog : 5 novembre 2026. Les statuts viennent du code, du backlog et de la CI ; rien n'a été joué dans une vraie app.

## Quoi de neuf

Les dernières modifications, en langage courant, la plus récente en haut. **« À tester »** veut dire : fait et vérifié par les contrôles automatiques, mais jamais regardé à l'écran.

### Sur `dev` (pas encore en production)

- **Calendrier › Jour et Semaine : on déplace une liste à la souris** (web). On la saisit et on la lâche sur un autre jour, à l'heure visée (arrondie au quart d'heure) ; lâchée dans le bandeau « listes », elle devient une échéance sans heure. Un jour déjà passé est refusé. *Où : Calendrier › Jour ou Semaine.* — À tester.
- **Calendrier › Todo : on déplace aussi une tâche seule vers un autre jour**, par la poignée de sa ligne (web). Le moment où on la lâche ne compte pas : une tâche n'a pas de créneau. *Où : Calendrier › Todo.* — À tester.
- **Calendrier › Todo : on déplace une liste au glisser-déposer** (web). Une poignée à gauche de la liste ; on la lâche sur un autre jour ou un autre moment (Matin, Après-midi, Soir, Dans la journée). Elle garde son heure si le moment ne change pas, sinon prend l'heure habituelle du moment. Un jour déjà passé est refusé. *Où : Calendrier › Todo.* — À tester.
- **Calendrier : les vues Jour et Semaine s'ouvrent sur l'heure en cours** quand aujourd'hui y figure, au lieu du premier rendez-vous. *Où : Calendrier › Jour ou Semaine.* — À tester.

### Réglage fait

- **Les aperçus Vercel fonctionnent** : dossiers, espaces et conversations s'y chargent. Un réglage de l'API (`CORS_ORIGIN`) a été ajouté.

### En production

Mise en production du 5 novembre au soir (PR #184, avec les deux migrations déjà appliquées) :

- **Matin / Après-midi / Soir : les heures sont réglables.** Midi et 19h par défaut ; on les change dans Réglages › Ma journée, et la fenêtre d'échéance comme le calendrier suivent. *Où : Réglages.* — À tester. Migration appliquée.
- **Mes listes : l'en-tête d'une liste tient sur une ligne.** Chevron, titre, icône, type, dossier, puis la date. On change le **dossier** et la **date** d'un appui, avec un choix Journée / Matin / Après-midi / Soir. *Où : Mes listes.* — Testé par toi le 5 novembre : fonctionne.
- **Espaces : « Ajouter une tâche »** est maintenant la ligne pâle de « Mes listes », au lieu d'un champ avec un bouton. *Où : une liste d'un espace.* — Testé par toi le 5 novembre : fonctionne.
- **Espaces : les tâches d'une liste se réordonnent au glisser-déposer** (web), avec une poignée à gauche de chaque ligne ; l'ordre est enregistré pour tout le monde. *Où : une liste d'un espace.* — À tester.
- **Espaces : l'en-tête d'une liste montre le type, le dossier et l'échéance**, modifiables d'un appui, comme dans « Mes listes ». *Où : une liste d'un espace.* — À tester. Le serveur est déployé : l'échéance s'enregistre.
- **Espaces : les listes ont un type (tâches ou achats) et une échéance** côté base et serveur. Rien ne change encore à l'écran : l'affichage suit. — Base de données prête.
- **Un bloc `{"title": …}` ne s'affiche plus dans la réponse de Jean-Claude** sur une nouvelle conversation (le titre recopié en texte est retiré, y compris du message enregistré). *Où : une nouvelle conversation.* — À tester en production, avec un modèle réel.
- **Groupes : Jean-Claude affiche « réfléchit… » avec la roue et les secondes**, comme en tête-à-tête. *Où : une discussion de groupe.* — Testé par toi le 5 novembre : fonctionne.

Avant :

- **La pastille de non-lu est rouge**, quel que soit le thème.
- **L'invitation par mail** fonctionne (testé par toi le 5 novembre).

### En attente de ta décision

- Rien pour l'instant.

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

## Gros chantiers à démarrer

Classés pour l'objectif de la vision : remplacer les todolistes Notion. Ordre recommandé, à valider.

- [ ] **1. Import des TODO Notion** (P4, test avec Clarisse). Aucun import n'existe : sans lui, tout se ressaisit. Piste la plus simple : un import par fichier CSV.
- [ ] **2. Rappels et récurrences** (back-end, A.11). Aucun planificateur : un rendez-vous récurrent n'apparaît qu'à son premier créneau, aucun rappel ne part. Débloque aussi « Vocaux le matin ».
- [ ] **3. « Projet » et instructions par dossier** (P4, A.4/A.5). Un contexte partagé par dossier, comme les Projets de Claude. Le plus gros chantier de conception : trancher d'abord dossier ou projet.
- [ ] **4. Mode réunion à la voix** (P5, A.12). Dépend du choix du service de dictée, resté en suspens avec Antonin.

À côté, deux points hors code qui bloquent : projet Supabase en région UE, politique de confidentialité (voir la section « Hors code » plus bas).

## Todo

### Dossiers & Collaboration

- [ ] `FRONT` `Mes Collaborations` **Remodeler la structure et l'arborescence des dossiers de « Mes Collaborations » comme « Mes dossiers »** — Priorité initiale : P5. Fait dans le code : PR #159, chaque espace est une section au même format que « Mes dossiers ». À valider visuellement. <!--id:c-remodeler-collaborations-->
- [ ] `FRONT` `Mes listes / TODO` **Même UX/UI partout pour ajouter une tâche dans un TODO** — Priorité initiale : P5. Référence : ajout de tâche dans « Mes listes » — case à cocher + texte « Ajouter une tâche » en gros et clair. TaskListEditor réécrit en #161 ; à comparer écran par écran (Mes listes, calendrier, espaces). Liste d'espace alignée (PR #174) ; calendrier et autres écrans à comparer. Ligne « Ajouter une tâche » des espaces testée le 5 novembre : fonctionne. <!--id:c-ux-ajout-tache-->
- [ ] `FRONT` `TODO` **Déplacer les TODO en glissé-déposé** — Priorité initiale : P5. Web fait (PR #161). Mobile non fait. <!--id:y-glisse-depose-->
- [ ] `FRONT` `Mobile` **Le bouton qui fait apparaître la marge gauche ne fonctionne pas** — Priorité initiale : P5. Barre latérale refaite depuis (#159). À retester sur téléphone avant de corriger. <!--id:mobile-marge-->
- [ ] `ALGO` `Dossiers` **Suggestion de nom de dossier pour ranger la conversation** — Priorité initiale : P4. L'assistant propose déjà un rangement pour un fil non classé et une arborescence de projet ; une suggestion de nom pour un dossier nouveau n'est pas dédiée. <!--id:y-suggestion-nom-dossier-->
- [ ] `FRONT` `Mes Collaborations` **Vérifier les mêmes gestes que « Mes dossiers » (déplacer, ranger, déplier)** — À tester à la main. <!--id:y-test-collaborations-gestes-->
- [ ] `FRONT` `Mes Collaborations` **Aligner le format des todos dans Collaboration sur celui de « Mes listes » classique (mêmes options)** — Aujourd'hui une todo d'espace collaboratif (ex. « Suivi des mesures des ailerons ») est une simple liste à cocher avec auteur et suppression — moins modulable que « Mes listes » : pas de glissé-déposé, pas d'ajout de tâche inline « Ajouter une tâche », pas d'icône de type de liste ni de date, pas de menu options / repli-dépli. Reprendre le même format et les mêmes options que « Mes listes » dans les todos des espaces collaboratifs. Capture jointe : « Mes listes » est fonctionnelle mais note l'utilisateur, demande encore à évoluer un peu. Avancement au 5 novembre : ligne « Ajouter une tâche » alignée (PR #174) ; type et échéance ajoutés aux listes d'espace côté base et API (PR #175, migration appliquée). Restent l'en-tête, les sous-tâches, le glisser-déposer et le partage de l'éditeur. En-tête de la liste d'un espace fait (5 novembre) : type, dossier et échéance modifiables d'un appui, comme dans « Mes listes ». À tester. Restent les sous-tâches, le glisser-déposer et le partage de l'éditeur. Glisser-déposer des tâches fait sur web (5 novembre) : poignée à gauche de chaque ligne, ordre enregistré. À tester. Restent les sous-tâches et le partage de l'éditeur. <!--id:c-format-todo-collab-mes-listes-->

### Calendrier

- [ ] `FRONT` `Calendrier` **Vérifier le paramétrage des heures et du positionnement dans le calendrier** — Priorité initiale : P5. PR #161 : grilles qui défilent sans perdre l'en-tête. À tester à la main. <!--id:y-heures-calendrier-->
- [ ] `FRONT` `Calendrier / TODO` **Calendrier et todo au fil de l'eau** — Priorité initiale : P4. À l'ouverture (vue Mois / Semaine / autre), afficher le jour du jour en haut à gauche. Idem pour la TODO : ajustable à l'heure près, et sur mobile s'ouvrir directement sur l'heure (donc le jour) en cours. Le haut du calendrier est ancré depuis #161. Fait (5 novembre) : les vues Jour et Semaine s'ouvrent sur l'heure en cours quand aujourd'hui est affiché ; à tester sur mobile. Reste la Todo à l'heure près. <!--id:y-fil-de-leau-->
- [ ] `FRONT` `Calendrier` **Modeler le calendrier à la demande** — Idée (Boîte à idées, P3). Pouvoir façonner le calendrier à la demande, ajuster un rendez-vous à la demande, et cumuler/filtrer les rdv selon certains critères (ex : rdv « standby » affichés dans une couleur dédiée). <!--id:y-modeler-calendrier-->
- [ ] `ALGO` `Calendrier` **Demander à l'IA d'ajouter des tâches au calendrier, une ou plusieurs, y compris récurrentes** — Demande de Yann le 5 novembre. Dans une conversation, dire à l'IA d'ajouter des tâches simples au calendrier, voire plusieurs d'un coup : donner un planning, ou dire « un cours tous les jeudis à 18h, sauf en février ». Reste une suggestion que l'on accepte d'un geste, jamais une action directe (§12.1). Les récurrences avec exceptions dépendent du calcul des occurrences ci-dessous. <!--id:y-ia-ajoute-calendrier-->
- [ ] `BACKEND` `Calendrier` **Calcul des occurrences récurrentes (rrule) et rappels de rendez-vous** — Gros chantier back-end. Aujourd'hui un rendez-vous récurrent n'apparaît qu'à son premier créneau ; aucun rappel ne part. Débloque « Vocaux le matin ». <!--id:y-rappel-rdv-recurrence-->
- [ ] `DATA` `Calendrier` **Rattacher un rendez-vous à un dossier (migration), pour « Prendre RDV »** — Chantier back-end identifié dans le suivi backlog. <!--id:y-rdv-rattache-dossier-->
- [ ] `ALGO` `Calendrier` **suggest_events ne produit parfois qu'un rendez-vous quand le message en cite plusieurs** — Chantier back-end identifié dans le suivi backlog. <!--id:y-suggest-events-bug-->
- [ ] `BACKEND` `Calendrier` **Lier le calendrier Jean Claude aux calendriers iPhone/iOS et Google, simplement** — Synchronisation simple avec le calendrier natif iOS et avec Google Calendar. <!--id:y-sync-calendrier-ios-google-->
- [ ] `BACKEND` `Calendrier / TODO` **Découpage MATIN / APRÈS-MIDI / SOIRÉE / SOIR sur la date d'une tâche (todo liste et calendrier)** — Dans la logique du calendrier, et au moment de mettre une date sur un élément de la todo liste, pouvoir choisir un créneau MATIN / APRÈS-MIDI / SOIRÉE / SOIR plutôt qu'une heure précise uniquement. Fait pour la todo liste (PR #173) : matin avant 12h, après-midi, soir dès 19h, sans « soirée » distincte du soir. Les heures de bascule sont réglables dans Réglages › Ma journée (midi et 19h par défaut) et suivent aussi la trame du calendrier. Demande la migration `20261105180000_profile_day_part_bounds.sql` sur la vraie base avant le déploiement. Reste le déplacement au geste dans le calendrier. <!--id:y-decoupage-matin-apresmidi-soir-->
- [x] `FRONT` `TODO` **Pouvoir modifier ce créneau (MATIN / APRÈS-MIDI / SOIRÉE / SOIR) directement dans le header de la todo liste** — Permettre de changer le créneau horaire d'une tâche sans sortir de la todo liste, en le modifiant directement depuis son en-tête. Lié à « Découpage MATIN / APRÈS-MIDI / SOIRÉE / SOIR ». Fait (PR #173, 5 novembre) : l'échéance et son moment (Journée / Matin / Après-midi / Soir) se changent depuis l'en-tête. À tester à la main. Testé par Yann le 5 novembre : fonctionne. <!--id:y-modif-creneau-header-todo-->
- [ ] `FRONT` `Calendrier` **Pouvoir déplacer des tâches, et des tâches avec leur todo liste, dans le calendrier** — Demande de Yann le 5 novembre. Changer le jour (ou le moment) d'une tâche ou d'une todo liste au geste, web d'abord. Déjà au backlog (« Glisser-déposer des tâches au calendrier », A.3), noté non implémenté ; la PR #161 permet seulement de réordonner les listes, y compris sous les bandeaux du jour. Faits (web, vue Todo du calendrier) : une liste se glisse par sa poignée vers un autre jour ou un autre moment, en gardant son heure si le moment ne change pas ; une tâche seule se glisse par sa poignée vers un autre jour. Fait aussi dans la grille Jour/Semaine : on saisit une liste et on la lâche sur un autre jour, à l'heure visée (au quart d'heure), ou dans le bandeau « listes » pour une échéance sans heure. Reste : le mobile, et les rendez-vous eux-mêmes. La vue Mois n'affiche que des compteurs, il n'y a rien à y saisir. <!--id:y-deplacer-calendrier-->

### Conversations & Canal permanent

- [ ] `ALGO` `Canal permanent` **Canal permanent → proposer une conversation classique quand l'échange devient « une conversation »** — Priorité initiale : P5. Modèle pas assez performant en l'état. La bascule existe déjà ; le problème est la qualité du modèle (défaut mistral/ministral-14b) : consigne plus fine, ou modèle plus fort pour le canal. <!--id:y-canal-permanent-->
- [ ] `BACKEND` `Conversations` **Transformer une conversation solo en conversation collaborative** — Priorité initiale : P5 (voir UX/UI). Rien trouvé dans le backlog ; à spécifier. <!--id:y-transformer-solo-collaborative-->
- [ ] `BACKEND` `Conversations` **Mode réunion qui enregistre à la voix** — Priorité initiale : P5. Seules la dictée d'un message et la lecture à voix haute existent. ⏸ Dépend du choix du service de dictée, resté en suspens avec Antonin. <!--id:y-mode-reunion-vocal-->
- [ ] `ALGO` `Conversations` **Parler du choix du modèle** — Priorité initiale : P5. Le catalogue de 3 modèles est déjà dans les réglages. Reste la décision produit (voir « Choisir le modèle dès la question »). <!--id:y-parler-choix-modele-->
- [ ] `ALGO` `Conversations` **Choisir le modèle dès la question, type Mammouth AI** — Idée (P3). 1. Détection automatique du modèle en fonction de ce que l'on cherche à faire. 2. Si la conversation nécessite une performance particulière, Jean Claude peut suggérer de passer sur tel ou tel modèle (implique une IA associée par conversation). <!--id:y-choix-modele-question-->
- [ ] `BACKEND` `Conversations` **Lenteur globale (roue dentée / dark pattern) — faire comme Claude, avec un compteur de secondes** — Priorité initiale : P4. Le compteur existe (ThinkingIndicator, useElapsedSeconds). La lenteur demeure : un appel d'outil double parfois l'attente (dette connue). <!--id:y-lenteur-globale-->
- [ ] `FRONT` `Conversations` **Faire patienter pendant la réponse, façon chat conversationnel (Jean Claude « réfléchit », argumente, puis écrit)** — Demande de Yann le 5 novembre. Fait : roue dentée + compteur, en tête-à-tête et désormais en groupe (PR #171). Reste à décider : afficher un raisonnement du modèle ou des étapes d'attente rédigées côté serveur. Testé par Yann le 5 novembre : la roue et le compteur fonctionnent en groupe. <!--id:y-attente-reflexion-->
- [ ] `FRONT` `Conversations` **Remplacer la roue dentée de « Jean-Claude réfléchit » par une animation qui bouge, partout (tête-à-tête, deux ou trois personnes)** — Demande de Yann le 5 novembre, après avoir testé le compteur en groupe : il préfère « une espèce de warm qui bouge » à la roue, dans toutes les conversations. Forme exacte à préciser (ver ? vague ? points qui rebondissent ?). Aujourd'hui : roue dentée et compteur de secondes (`ThinkingIndicator`). Précisé le 5 novembre : « une animation pixelisée » (style pixel-art), à la place de la roue. <!--id:y-animation-attente-->
- [ ] `BACKEND` `Projets` **Pas d'équivalent au « Projet » de Claude (mémoire partagée, contexte, instructions dédiées)** — Idée (P4). Gros chantier — à relier à « Compte collaboratif » (P5) : ne proposer le travail collaboratif que sur les Projets. Déjà au backlog : distinguer dossier et projet, instructions par dossier (décision de Yann). <!--id:c-pas-equivalent-projet-->
- [ ] `ALGO` `Canal permanent` **Transformer le canal PROBLÈME en conversation** — Idée (P3). Le canal permanent Jean Claude pourrait être le point d'entrée pour faire progresser Jean Claude. Lié à la décision sur le bouton « Signaler un problème ». <!--id:y-canal-probleme-->
- [ ] `FRONT` `Calendrier / TODOs` **Interface en 3 parties : dossiers à gauche, conversation au centre, vue latérale droite (Calendrier / TODOs / etc.)** — Priorité initiale : P4. Structure : marge de gauche avec les dossiers, centre pour la conversation, et une marge de droite avec une vue Calendrier ou vue Todo liste (etc.), comme sur Claude. Notée au backlog (aperçu calendrier / listes en conversation), non implémentée, écran large seulement. <!--id:y-vue-laterale-droite-->

### Notifications

- [ ] `FRONT` `Notifications` **Pastille rouge de non-lu : vérifier en thème clair/sombre avec une couleur d'assistant différente du rouge** — En production (PR #157). À tester à la main. <!--id:y-test-pastille-non-lu-->

### BUG

- [ ] `ALGO` `Suggestion de dossier` **Suggestion de dossier incohérente sur une deuxième conversation** — Sur une deuxième conversation, après une question sur un autre sujet, Jean Claude a suggéré de mettre la conversation dans le même dossier qu'avant alors que cela n'avait rien à voir. Autre cas : bon dossier suggéré, mais avec en même temps l'ancien dossier sans rapport — « Environnement » suggéré alors qu'on parlait de la date de déclaration d'impôts, « Impôts » étant le bon. Piste : consigne de détection, à rejouer avec ces deux conversations. <!--id:bug-suggestion-dossier-->
- [ ] `ALGO` `Calendrier` **Test jours travaillés / non travaillés (suite au test de Mégane)** — En lui demandant d'ajouter que tel ou tel jour on travaille et tel ou tel jour on ne travaille pas. Aucune trace dans le code ni le backlog ; à décrire (quel écran, quel comportement attendu) avant de pouvoir le traiter. <!--id:bug-jc-jours-travail-->
- [ ] `DATA` `Notifications` **La pastille de discussion (notification) pose de temps en temps problème** — Cause probable connue : le compteur unread_count est incrémenté par trigger mais jamais décrémenté à la suppression. Après une édition ou une reprise de tour, il peut sur-compter. À confirmer par un cas reproductible. <!--id:bug-pastille-discussion-->
- [ ] `ALGO` `Conversations` **Un bloc {"title": …} s'affiche dans la réponse de Jean-Claude** — Vu le 5 novembre sur une nouvelle conversation (« Bonjour ») : le modèle écrit le titre en JSON dans sa réponse, avec le texte « Nouvelle conversation ». Le filtre de fuites ne regarde que le tout début de la réponse ; ici le bloc arrive après la phrase d'accueil. Correctif prévu : retirer aussi ce bloc quand il arrive plus loin, dans le message enregistré. Cause de fond : le modèle par défaut (ministral-14b) est peu fiable sur les outils. Corrigé sur `dev` (PR #178, 5 novembre) : le bloc est retiré, y compris du message enregistré. À retester après le déploiement en production. <!--id:bug-titre-json-visible-->

### Accès aux données

- [ ] `DATA` `Import` **Test avec Clarisse — import des TODO Notion** — Priorité initiale : P4. Hors code : aucun import Notion n'existe. Piste la plus simple : un import par fichier CSV. <!--id:y-import-notion-->
- [ ] `ALGO` `Moteur IA` **Modèle de repli si le quota du moteur IA est atteint** — Chantier back-end identifié dans le suivi backlog. <!--id:y-modele-repli-quota-->
- [ ] `BACKEND` `Connexion` **2FA par SMS** — Chantier back-end identifié dans le suivi backlog (§6.2). <!--id:y-2fa-sms-->

### Connexion

- [x] `BACKEND` `Invitation` **L'invitation par mail fonctionne ok mais est-ce que cela invite aussi quelqu'un qui n'est pas sur Jean Claude ?** — Priorité initiale : P5. Lien entrant avec mail, direct sur la vue « entrer le mot de passe à 8 chiffres » et go. Testé en production par Yann le 5 novembre : fonctionne très bien. Le mail ne contient pas de lien direct vers la saisie du code (texte « connectez-vous sur {URL} avec l'adresse »). <!--id:c-invitation-mail-->

### Infra

- [x] `BACKEND` `Infra` **Projet Supabase en région UE** — « À faire avant tout remplissage de données » (§8). Statut non confirmé. Confirmé le 5 novembre : projet « Jean-Claude », région West EU (Paris). <!--id:infra-supabase-ue-->
- [ ] `BACKEND` `Infra` **npx supabase config push** — Tant que non fait, le projet hébergé envoie un lien et non un code à 8 chiffres (§6.1). Lié à l'invitation par mail (Connexion). <!--id:infra-supabase-config-push-->
- [ ] `BACKEND` `Infra` **7 PR Dependabot ouvertes (#163 à #169)** — Merger celles dont la CI est verte. #168 (zod 3 → 4) échoue et demande une migration. <!--id:infra-dependabot-->
- [ ] `BACKEND` `Infra` **Réparer l'historique des migrations Supabase** — La base connaît 5 migrations absentes du dépôt (versions 20260928080757, 20260928092328, 20260929073035, 20260929075602, 20260929085857), appliquées directement dans Supabase : `supabase db push` refuse de tourner. La migration 20261105160000 a donc été passée à la main dans l'éditeur SQL le 5 novembre. Ne pas lancer `migration repair --status reverted` : il ferait rejouer des migrations déjà appliquées. À traiter à froid, après comparaison du schéma distant et du dépôt. <!--id:infra-historique-migrations-->
- [ ] `BACKEND` `Infra` **Adapter supabase/config.toml au CLI Supabase 3** — Le CLI 3 refuse la section [inbucket] (remplacée par [local_smtp]). Contournement actuel : utiliser `npx supabase@2`. Le format exact du nouveau réglage est à vérifier dans la documentation Supabase. <!--id:infra-config-toml-cli3-->
- [x] `BACKEND` `Infra` **Autoriser les aperçus Vercel dans CORS_ORIGIN** — Fait le 5 novembre : `CORS_ORIGIN` du projet Vercel `jean-claude` (l'API, jean-claude-rust.vercel.app) contient maintenant `https://jean-claude-web-*.vercel.app`, et l'API a été redéployée. Sans cela, les aperçus affichaient « indisponible » partout. Le site de production est jean-claude-web-lilac.vercel.app. <!--id:infra-cors-apercus-->

### Comptes

- [ ] `BACKEND` `Stores` **Comptes Apple Developer et Google Play, fiches de store** — À voir avec Nicolas. <!--id:comptes-apple-google-->
- [ ] `BACKEND` `Conformité` **Politique de confidentialité** — Obligatoire (données de santé et administratives). <!--id:comptes-confidentialite-->

### Support

- [ ] `FRONT` `Signaler un problème` **Décider du sort du bouton « Signaler un problème »** — Lié à la réflexion sur le canal PROBLÈME transformé en conversation. <!--id:support-signaler-probleme-->
- [ ] `BACKEND` `Mode réunion vocal` **Arbitrer le service de dictée avec Antonin** — Dictée native provisoire. Bloque « Mode réunion qui enregistre à la voix ». ⏸ À trancher avec Antonin — bloque « Mode réunion vocal ». <!--id:support-dictee-antonin-->

### À tester

- [ ] `FRONT` `TODO` **Glisser-déposer des tâches : vérifier que l'ordre est conservé après rechargement** — Y compris sous les bandeaux du jour. <!--id:test-glisse-depose-ordre-->
- [ ] `FRONT` `Mobile` **Application sur iOS et Android** — Presque rien n'y a été joué. <!--id:test-ios-android-->
- [ ] `FRONT` `Feedback` **Restaurer le pouce sélectionné après rechargement** — La notation est enregistrée mais pas renvoyée. <!--id:front-pouce-reload-->
- [ ] `FRONT` `Dossiers` **Lisibilité de la barre latérale au 5e niveau de dossiers** — À voir avec un vrai volume. <!--id:front-lisibilite-5e-niveau-->

### Plus tard

- [ ] `BACKEND` `Notifications` **Vocaux le matin + voix personnalisable** — Idée (P4). Jean Claude écrit, mais peut aussi parler : messages vocaux le matin, assistant renommable, voix au choix (dont voix « imitation »). Ces options pourraient faire partie du pack payant. ⏸ Dépend du planificateur de rappels (chantier back-end, Accès aux données). <!--id:idea-vocaux-matin-->
- [ ] `FRONT` `Assistant` **Outils de l'assistant peu clairs, équivalent de la commande « / »** — Idée (P4). Pas moyen de savoir les outils précis de l'assistant. Ajouter des notions claires à l'assistant outillé. <!--id:idea-outils-flous-->
- [ ] `BACKEND` `Admin` **Messages groupés à tous les users via Jean Claude** — Idée (P3). Notifs et/ou SMS, avec réglage de cadence et de mode de sollicitation. <!--id:idea-messages-groupes-->
- [ ] `FRONT` `Réglages` **Pas d'instructions perso, même globales** — Idée (P3). Claude un peu intrusif, à voir comment le réguler. Idée : onglet « Ma relation » dans l'admin — degré d'intrusivité, longueur des réponses, cadence de relance, sujet en cours, fréquence. <!--id:idea-pas-instructions-perso-->
- [ ] `ALGO` `Assistant` **Trop de questions posées par l'IA pour rien** — Idée (P3). <!--id:idea-trop-questions-->
- [ ] `FRONT` `TODO` **Todo liste multi-colonnes façon Notion / ClickUp** — Idée (P2). Plusieurs dimensions/colonnes (date / sujet / contact / partie dev / etc.), pas juste une liste à puces. <!--id:idea-todo-multicolonnes-->
- [ ] `FRONT` `Conversations` **Design des conversations façon chat, statut lu/non lu en marge** — Idée (P2). Façon WhatsApp. <!--id:idea-design-conversations-->
- [ ] `BACKEND` `Produit` **Business model à réfléchir** — Idée (P2). Qu'est-ce qui est dans le pack payant vs gratuit ? Adapter le coût aux moyens financiers de la personne. <!--id:idea-business-model-->
- [ ] `FRONT` `Produit` **Business intelligence pédagogique** — Idée (P2). Éduquer les gens à l'usage, bonnes pratiques, astuces. <!--id:idea-business-intelligence-->
- [ ] `FRONT` `Interface` **Interface qui se métamorphose sur demande** — Idée (P1). L'utilisateur peut demander à Claude de changer l'interface, en stockant les versions « design » pour y revenir. <!--id:idea-interface-metamorphose-->
- [ ] `BACKEND` `Projets` **« Projet » et instructions par dossier, comme les Projets de Claude** — Gros chantier. Le plus gros chantier de conception : trancher d'abord dossier ou projet. <!--id:idea-projet-collaboratif-chantier-->
- [ ] `FRONT` `Desktop` **Desktop (Tauri)** — Phase C — plus tard. <!--id:phase-c-desktop-->
- [ ] `BACKEND` `Projets` **Gestion multi-dimensionnelle d'un projet** — Phase C — plus tard. <!--id:phase-c-multidim-projet-->
- [ ] `FRONT` `Organisation` **Regroupement Perso/Pro** — Phase C — plus tard. <!--id:phase-c-perso-pro-->
- [ ] `ALGO` `Organisation` **Adaptation au rangement de l'utilisateur** — Phase C — plus tard. <!--id:phase-c-adaptation-rangement-->
- [ ] `BACKEND` `Stores` **Processus de review des stores** — Phase C — plus tard. <!--id:phase-c-review-stores-->
- [ ] `BACKEND` `Collaboration` **Valider les espaces d'équipe et discussions de groupe** — Hors cahier des charges V1 (docs/COLLABORATION.md). <!--id:hors-code-espaces-equipe-->
- [ ] `DATA` `Dossiers` **Valider la profondeur d'arborescence portée de 2 à 5** — Écart assumé (§3). <!--id:hors-code-profondeur-arbo-->
