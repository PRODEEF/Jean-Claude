# Suivi du backlog — Jean-Claude

Livrable du §10 du cahier des charges. Statut de chaque point de l'Annexe A et
des exigences transverses. **À mettre à jour chaque jour**, en même temps que
le report quotidien demandé au §0.1.

Légende : ✅ fait · 🟡 en cours · ⬜ non démarré · 🔵 socle posé (structure et
schéma prêts, comportement à écrire)

Dernière mise à jour : **2 septembre 2026** — le contexte remis au modèle, et la
robustesse du tour de dialogue.

**Ce que le modèle ignorait.** La consigne système ne portait ni date, ni heure, ni fuseau :
le modèle datait au jugé une échéance déduite de « lundi prochain », alors même que le canal
annonce comme premier sujet ce qui est important _aujourd'hui_. Elle porte désormais l'instant
du tour dans le fuseau du profil, le nom sous lequel s'adresser à l'utilisateur, et un cadre de
rédaction — la même réponse se lit sur un téléphone.

**Le canal savait promettre les rappels, pas les tenir.** Il reçoit maintenant l'agenda des
sept prochains jours, lu par `CalendarService` : « qu'est-ce que j'ai cette semaine ? » ne peut
plus produire qu'une invention. Choix assumé du contexte injecté plutôt que d'outils de lecture
— ces derniers imposeraient une boucle outil → résultat → second appel, donc une évolution du
port `LlmProvider`, hors du périmètre du sprint. Limite consignée : les séries récurrentes n'y
figurent qu'à leur première occurrence, faute d'expansion (A.11) ; la consigne le dit au modèle
plutôt que de le lui laisser deviner.

Il reçoit aussi les dossiers déjà créés. Il proposait jusqu'ici « je te crée un dossier Jardin ? »
alors que Jardin existait : le service ne le dupliquait pas, mais la phrase affichée était
fausse, ce que le §12.1 interdit précisément.

**Les propositions déjà faites** sur un fil, et leur sort, sont rappelées au modèle. Sans elles,
il reformulait au tour suivant une proposition que l'utilisateur venait d'écarter — l'inverse du
« suggestif et non intrusif ». Le garde-fou « une proposition en attente retire l'outil du jeu »
vaut désormais aussi pour le canal. Et un identifiant de dossier inventé n'emporte plus tout le
rangement : la ligne fautive est écartée, comme l'acceptation savait déjà le faire.

**Le tour de dialogue côté client** cesse d'être sans recours. Le bouton d'envoi devient un
bouton d'arrêt pendant la génération — l'`AbortSignal` était plombé de bout en bout depuis le
début, il n'était simplement pas branché ; rien n'est perdu, le serveur conserve le texte déjà
produit. Un message qui n'a pas atteint le serveur est rendu au champ de saisie au lieu de
disparaître avec l'erreur (et seulement celui-là : après enregistrement, le renvoyer le
dupliquerait). Une réponse tronquée ne se présente plus comme une réponse complète : le flux se
conclut par `done`, son absence après du texte est signalée. Enfin, un 401 passager n'éjecte
plus vers l'écran de connexion — la session est renouvelée et la requête rejouée une fois — et
le renouvellement automatique reprend au retour au premier plan, comme la documentation Supabase
React Native le demande.

Auparavant le même jour : ossature commune des écrans.

Conversation, canal permanent, todoliste et calendrier partagent désormais le même
`ScreenShell` : un bandeau de tête de hauteur fixe, pleine largeur, titre à gauche et
commande à droite, puis une colonne centrée à 80 % de la largeur disponible — c'est elle
qui défile, le bandeau reste en place. La colonne est plafonnée à 900 pt là où on lit du
texte et à 1100 pt là où on lit une grille : au-delà, l'œil perd sa ligne au retour ;
en deçà du point de rupture, elle prend toute la largeur moins 16 pt de marge. Le fil de
conversation garde son propre défilement — une `FlatList` dans un `ScrollView` perdrait sa
virtualisation — mais suit la même colonne, exportée par le shell.

Auparavant le même jour : issue #10 : les todolistes.

Le module `domain/task` et `/api/tasks` ouvrent les tables `task_lists` / `tasks`,
restées sans route jusqu'ici : une seule lecture rend **toutes les listes avec leurs
tâches**, et la ressource est la liste, les tâches vivant sous elle en `/items`. Deux
règles vivent dans le service et sont testées : cocher horodate la complétion et décocher
l'efface, une tâche ajoutée prend la position suivant celles déjà prises.

L'onglet **TODOLISTE** offre deux lectures de la même donnée. La **semaine** montre les
tâches datées, un bloc par jour découpé en moments — MATIN, APRÈM, SOIRÉE, SOIR, comme la
maquette. Le moment est déduit de l'heure de l'échéance plutôt que stocké : demander « à
quel moment ? » en plus de « quand ? » aurait ajouté une question à chaque saisie. Une date
sans heure vaut « dans la journée ». **Mes listes** montre tout, y compris ce qui n'a pas
d'échéance — une liste d'achats n'en a jamais, et la cantonner à la semaine la rendrait
introuvable. Les deux vues se partagent un seul chargement : basculer ne redemande rien.

La capture ne réclame qu'un titre, tapé au bas d'une liste (§13.4.1) ; la date, les notes
et le dossier se posent ensuite. Une todoliste se lit aussi **dans son dossier thématique**,
sous ses conversations dans la barre latérale, et le menu contextuel d'un dossier permet
d'en créer une déjà rangée (A.2).

Enfin, une journée chargée de tâches **se voit depuis le calendrier** : compte dans la
cellule du mois, bandeau de titres au-dessus de la grille jour et semaine, et liste sous
les rendez-vous du jour sélectionné. Seul ce qui reste à faire compte — une journée
entièrement cochée cesse de se signaler. Les tâches y sont en lecture seule : on les coche
dans l'onglet Todoliste, qui reste leur écran.

Deux remontées dans `shared/lib` au passage, l'arithmétique de dates (`dates.ts`) et la
lecture des dates tapées (`date-input.ts`) : le calendrier et la todoliste s'appuient
désormais sur les mêmes semaines, les mêmes libellés et les mêmes formats de saisie.

Auparavant le même jour : questions à réponses proposées, et couleur
des interrupteurs.

L'assistant peut désormais **poser une question avec quelques réponses à choisir** :
l'outil `ask_question` attache les réponses au message qui porte la question (colonne
`messages.choices`), et le fil les rend au-dessus de la saisie, numérotées, avec « Autre
chose » qui rend la main au clavier et « Passer » qui referme. Réservé aux questions dont
quelques réponses couvrent l'essentiel des cas : la consigne système écarte explicitement
les questions ouvertes, où souffler quatre réponses priverait l'utilisateur de la sienne.
C'est d'abord l'accueil (§6.3) qui en profite.

⚠️ La migration `20260902160000_message_choices.sql` doit être appliquée
(`npx supabase db push` puis `npm run db:types`) **avant** de déployer : sans la colonne,
la lecture des messages échoue.

Les interrupteurs des réglages prennent la couleur de l'assistant (bouton) sur son aplat
atténué (rail) : sans `thumbColor`, React Native posait son vert par défaut, étranger à la
palette et à la couleur choisie (§4.5). Même correction sur l'interrupteur « journée
entière » du calendrier.

Auparavant le même jour : corrections après relecture : calendrier,
canal permanent, bannière et historique des propositions.

Le calendrier passe à **quatre vues — jour, semaine, mois (par défaut) et année**, la
bascule au centre de la barre d'outils comme dans les trois références du §4.2. La vue jour
est la grille horaire à une colonne, la vue année douze vignettes où un jour occupé est mis
en avant et où un appui ouvre le mois. La vue mois n'affiche plus six semaines fixes mais
seulement celles qui touchent le mois affiché : une semaine entièrement dans le mois voisin
n'apprenait rien et faisait croire à une erreur de navigation. Le défilement est celui de la
page et non plus celui de la grille — c'est ce décalage qui désalignait les colonnes de la
vue semaine de leurs en-têtes, la barre de défilement étant prise sur leur largeur ; les
deux vues horaires s'ouvrent toujours sur le matin, en cadrant la page.

**Canal permanent** : le bandeau de tête est désormais celui des conversations classiques,
partagé et non recopié — les deux avaient divergé de hauteur et de taille de titre. Le
message d'accueil est posé dès qu'un accueil reste à faire et que le fil est vide, et non
plus seulement à la création du canal : un canal ouvert avant que l'accueil n'existe restait
muet alors que l'écran annonçait des questions.

**Bannière** : « <nom>, ton assistant perso » ouvre le canal permanent. La fenêtre de
recherche s'élargit à 780 pt et ses filtres de période passent à la ligne au lieu de défiler
latéralement — un raccourci sorti du cadre ne se devine pas.

**Historique des propositions** : `GET /assistant/suggestions` rend aussi celles qui ont été
tranchées, et le fil les replace à leur date sous forme d'une ligne « Dossiers créés — … »
ou « Proposition ignorée ». Sans elle, des dossiers apparaissaient dans la barre latérale
sans que rien dans la conversation n'explique d'où ils venaient.

Auparavant le même jour : issue #9 : le calendrier, vues mois et semaine.
Le module `domain/calendar` et `/api/calendar` ouvrent la table `calendar_events`, restée
sans route jusqu'ici : lecture sur une fenêtre bornée par l'appelant, création, modification
et suppression. Les deux vues n'appellent pas deux routes différentes — elles demandent deux
fenêtres à la même, ce qui fait revenir du cache un mois déjà consulté.

La vue mois reprend la grille de la maquette web (six semaines fixes, débords atténués sur
les mois voisins). La vue semaine est une grille horaire à sept colonnes, forme commune au
Calendrier iOS, à Google Calendar et à Fantastical (§4.2) : les rendez-vous simultanés se
partagent la largeur du jour au lieu de se masquer, la journée entière sort de l'échelle
dans un bandeau, et un appui sur un créneau libre ouvre la création à l'heure visée. Sur
téléphone, la cellule du mois ne porte que des pastilles et le détail passe dans la liste
du jour sélectionné, comme le font ces mêmes références à cette largeur.

Non traité et consigné : l'**expansion des séries récurrentes**. Une ligne portant une
`rrule` n'apparaît qu'à la date de son premier créneau — déployer les occurrences et poser
les rappels relève d'A.11, qui est le point où les deux se tiennent.

Auparavant le même jour : issues #12 et #14 : le paramétrage complet
et l'accueil conversationnel.

**#12 est close.** La page Réglages porte désormais le nom de l'assistant, sa couleur et
les cinq interrupteurs du périmètre (A.10), qui se branchent sur la règle serveur posée par
#8. Le nom choisi se propage partout — bannière, barre latérale, titre du canal — et
jusque dans la consigne système : sans cela, l'assistant aurait continué de se présenter
comme Jean-Claude. La couleur alimente `buildPalette`, donc aussi bien les `StyleSheet`
que les classes NativeWind. Elle se choisit parmi huit pastilles et non dans un sélecteur
libre : la teinte est posée sur des aplats clairs **et** sombres, et une couleur prise au
hasard y perd son contraste. Chaque pastille montre pour cette raison les deux rendus.

Cinq interrupteurs et non les trois de la maquette : le serveur applique déjà les cinq
capacités, et en cacher deux aurait laissé l'assistant proposer des todolistes et des
créneaux sans moyen de l'en empêcher.

**#14 : l'accueil se déroule dans le canal permanent**, pas dans un écran dédié. Le
compte qui vient d'être créé y est redirigé et y trouve une question plutôt qu'un fil
vide ; l'assistant mène trois ou quatre échanges ouverts, puis appelle `finish_onboarding`,
qui écrit ce qu'il a retenu dans `profiles.memory` et horodate l'accueil. Cette mémoire est
ensuite rappelée au modèle à chaque tour, dans les deux registres de conversation. Le
bornage du canal est suspendu le temps de l'accueil : appliqué, il aurait ouvert une
conversation dédiée au premier projet évoqué, alors qu'on cherche justement à en entendre
parler. Un lien « Passer » clôt l'étape sans rien retenir.

L'amorce proactive demandée par l'issue tombe d'elle-même : `suggest_project_folders` reste
exposé pendant l'accueil, donc un projet mentionné devient une proposition de dossiers à
valider d'un geste (§12.1).

Reste ouvert sur #14 : le **vocal**. Aucune brique STT n'existe encore dans l'application —
le point est traité par l'issue #25, et `inputMode` est déjà au contrat pour l'accueillir.

Auparavant le 2 septembre : issue #11 : la recherche par filtres (A.6).
Le bouton de recherche cherche désormais **dans le contenu des messages** et plus seulement
dans les titres, côté serveur, via les index plein texte français — un fil se retrouve sans
qu'on se rappelle comment il s'appelait, et le passage trouvé est affiché sous le titre.
S'y ajoutent les filtres attendus par A.6 : six raccourcis de période, une plage de dates
saisie, un ou plusieurs dossiers, et l'inclusion des conversations archivées. Les périodes
sont résolues côté serveur dans le fuseau du profil : « le mois dernier » ne peut pas se
calculer sur quatre plateformes sans risquer quatre résultats. Une migration remplace la
configuration de recherche `french` par `french_unaccent`, sans quoi « sante » ne trouvait
pas « santé ».

Le même jour : issue #8 terminée, le périmètre du mode assistant (A.10) devient une règle
appliquée par le serveur. Chaque capacité de `assistant_scope` — détection de todolistes,
planification, aide au rangement, suggestions de structure — commande l'outil
correspondant : coupée, l'outil n'entre plus dans le jeu remis au modèle, la consigne cesse
de le réclamer, et un appel qui arriverait malgré tout est écarté avant de devenir une
proposition. Deux capacités échappent au réglage et c'est volontaire : nommer une
conversation, et basculer une demande hors périmètre vers une conversation classique —
désactiver la seconde reviendrait à supprimer A.10.

Le réglage vit donc côté serveur avant d'exister dans l'interface : les interrupteurs de
la page Réglages restent à l'issue #12, qui n'aura qu'à les brancher sur une règle déjà
en vigueur sur les quatre plateformes.

Non traité ici, et consigné : les **rappels du matin**. La capacité `morningReminders`
existe et se lit, mais aucun planificateur n'existe dans le projet. Faire proposer par
l'assistant un rappel qu'on ne saurait pas délivrer contredirait le §12.1 — la mise en
œuvre relève des issues #26 et #20.

Auparavant le 1er septembre : issue #8, les appels d'outils du modèle
deviennent des propositions en attente (`feature/assistant`) au lieu d'être perdus, et le
§12.1 est appliqué de bout en bout pour la première fois. Depuis le canal permanent,
Jean-Claude propose une arborescence de dossiers que l'utilisateur crée d'un geste ; une
demande étrangère à son périmètre ouvre une conversation classique où la question est
reposée ; et une conversation sans dossier se nomme à partir de son contenu (§5.2) puis
propose où se ranger (A.1).

Plus tôt le 1er septembre : la page Réglages basique (issue #12,
partielle). L'utilisateur voit son adresse e-mail (non modifiable), change son pseudo et
son thème (clair / sombre / système) ; le modèle IA y figure, affiché mais désactivé.
Côté serveur, cela ouvre le module `domain/user` et `/api/me` — jusqu'ici la table
`profiles` existait sans qu'aucune route n'y donne accès. Aucune migration : les colonnes
`display_name` et `theme` étaient déjà là. Le pseudo enregistré remplace partout le nom
dérivé de l'adresse e-mail. Restaient alors ouverts dans #12 : nom et couleur de
l'assistant, périmètre du mode assistant (A.10) — clos le 2 septembre.

Le même jour, avant cela : issues #5 et #7 terminées. #5 était déjà
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

| Réf. | Exigence                                               | Statut | Note                                                                                                                                                                                                                                                                                                                                                                                      |
| ---- | ------------------------------------------------------ | :----: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| §5.1 | Moteur IA Claude en V1                                 |   ✅   | `anthropic/claude-opus-5` via Vercel AI Gateway                                                                                                                                                                                                                                                                                                                                           |
| §5.1 | Abstraction multi-modèle                               |   ✅   | Port `LlmProvider` + Vercel AI Gateway. **Changer de modèle = changer `LLM_MODEL`**, zéro ligne de code                                                                                                                                                                                                                                                                                   |
| §5.1 | Timeouts, quotas et erreurs                            |   ✅   | Timeout de 60 s (15 s au premier jeton en flux) ; 429 et 402 distingués d'une panne, testés                                                                                                                                                                                                                                                                                               |
| §5.1 | Choix du modèle par l'utilisateur                      |   🟡   | `LLM_MODEL` reste le défaut serveur, désormais exposé par `/api/health` et affiché **désactivé** dans les réglages. Reste à porter dans `userPreferences`                                                                                                                                                                                                                                 |
| §5.1 | Indication « souverain » ou non                        |   ✅   | `isSovereign` déduit de l'éditeur du modèle, exposé par `/api/health`                                                                                                                                                                                                                                                                                                                     |
| §5.2 | Relation conversation ↔ dossiers plusieurs-à-plusieurs |   ✅   | Table `conversation_folders`                                                                                                                                                                                                                                                                                                                                                              |
| §5.3 | API commune web + mobile                               |   ✅   | REST sur Hono, arbitrage consigné dans `docs/ARCHITECTURE.md` ; client `@jc/api-client` partagé, l'app ne touche jamais la base directement                                                                                                                                                                                                                                               |
| §4.1 | Design responsive, priorité mobile                     |   🟡   | Fil de conversation borné en largeur, cibles tactiles 44 pt, thèmes clair et sombre — ce dernier désormais choisi par l'utilisateur. Réponses du modèle rendues en Markdown (titres, listes, tableaux, liens) ; barre latérale redimensionnable au geste ; calendrier divergent par point de rupture, pastilles et liste du jour en `compact`, barre d'outils sur deux lignes sous 768 pt |
| §4.4 | React Native                                           |   ✅   | Expo SDK 57, Expo Router, React 19                                                                                                                                                                                                                                                                                                                                                        |
| §8   | Postgres portable, migration UE possible               |   ✅   | Aucune extension propriétaire                                                                                                                                                                                                                                                                                                                                                             |
| §8   | **Créer le projet Supabase en région UE**              |   ⬜   | **À faire avant tout remplissage de données**                                                                                                                                                                                                                                                                                                                                             |
| §10  | Repo structuré et documenté                            |   ✅   | `README.md`, `docs/ARCHITECTURE.md`, ce fichier                                                                                                                                                                                                                                                                                                                                           |

---

## Authentification (§6)

| Réf.        | Point                                            | Statut | Note                                                                                                                                                                                               |
| ----------- | ------------------------------------------------ | :----: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| §6.1        | E-mail + code à usage unique                     |   ✅   | Parcours complet : envoi, saisie, vérification automatique, renvoi avec délai d'attente, erreurs traduites. Gabarit d'e-mail forcé sur `{{ .Token }}`                                              |
| §6.1        | Règles de validation partagées                   |   ✅   | `packages/domain/src/auth/auth.schema.ts`, 14 tests. Plus aucune règle de saisie dans l'écran                                                                                                      |
| §6.1        | Gabarit d'e-mail à pousser sur le projet hébergé |   ⬜   | `npx supabase config push` — **tant que ce n'est pas fait, le projet hébergé envoie un lien et non un code**                                                                                       |
| §6.2        | 2FA par SMS                                      |   ⬜   | Étape 2. Si non fait dans le sprint → priorité immédiate du backlog restant                                                                                                                        |
| §6.3 / A.13 | Onboarding conversationnel                       |   🟡   | Accueil mené dans le canal permanent au premier accès : questions ouvertes ou à réponses proposées (`ask_question`), mémoire écrite par `finish_onboarding`, lien « Passer ». Reste le vocal → #25 |

---

## Annexe A — backlog fonctionnel

| Réf. | Point                                                 | Statut | Note                                                                                                                                                                                                                                                                                                                                                    |
| ---- | ----------------------------------------------------- | :----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A.0  | Regroupement Perso / Pro                              |   🔵   | Colonne `category` posée, non exploitée — volontaire (option à activer plus tard)                                                                                                                                                                                                                                                                       |
| A.1  | Conversations multi-dossiers, rangement matriciel     |   ✅   | Schéma, `PUT /conversations/:id/folders`, rangement manuel par cases à cocher multiples, et proposition de rangement par l'assistant pour un fil non classé                                                                                                                                                                                             |
| A.2  | Conversion conversation → todoliste                   |   🟡   | `domain/task` et `/api/tasks` écrits : listes et tâches se créent, se cochent, se datent et se rangent. Onglet TODOLISTE (semaine + toutes les listes), todolistes visibles dans leur dossier. Reste la conversion depuis une conversation → #17                                                                                                        |
| A.3  | Détection de tâches datées                            |   🔵   | `dueAt` se saisit et se lit désormais de bout en bout — semaine, calendrier. Reste l'extraction automatique depuis la conversation → #18                                                                                                                                                                                                                |
| A.4  | Sous-dossiers automatiques de projet                  |   🟡   | L'assistant propose une arborescence (`suggest_project_folders`), l'utilisateur la crée d'un geste. Détection automatique du « projet » à affiner                                                                                                                                                                                                       |
| A.5  | Gestion multi-dimensionnelle d'un projet              |   ⬜   | Phase C ou au-delà                                                                                                                                                                                                                                                                                                                                      |
| A.6  | Recherche avancée par filtres                         |   ✅   | `feature/search` et `GET /api/search` : mot-clé plein texte sur les titres **et** le contenu des messages, filtres par dossiers, par période (6 raccourcis) ou par dates saisies, conversations archivées incluses au choix                                                                                                                             |
| A.7  | Adaptation à la logique de rangement de l'utilisateur |   🔵   | Colonne `source` désormais réellement alimentée par les rangements acceptés — la matière première est capturée, rien ne l'exploite encore                                                                                                                                                                                                               |
| A.8  | Assistant proactif                                    |   🟡   | `feature/assistant` écrit : les appels d'outils deviennent des propositions acceptées ou ignorées d'un geste, dont le fil garde la trace une fois tranchées — et que le modèle relit au tour suivant, pour ne pas reproposer ce qui vient d'être écarté. Restent la todoliste et les rendez-vous                                                        |
| A.9  | Multi-plateforme                                      |   🟡   | Web / iOS / Android depuis un codebase, fil de conversation en flux compris. Desktop (Tauri) en Phase C                                                                                                                                                                                                                                                 |
| A.10 | Bornage du mode assistant                             |   ✅   | Canal unique, jeu d'outils propre au canal, bascule automatique hors périmètre, et périmètre `assistant_scope` appliqué côté serveur. Interrupteurs des cinq capacités dans la page Réglages. Le canal reçoit l'agenda des 7 jours et les dossiers existants — il peut enfin répondre sur le premier de ses trois sujets ; délivrance des rappels → #26 |
| A.11 | Rendez-vous récurrents + alerte                       |   🔵   | `domain/calendar` et les quatre vues écrits : `rrule` et `reminder_minutes_before` se saisissent et se stockent. Restent l'expansion des occurrences et la délivrance des rappels                                                                                                                                                                       |
| A.12 | Interaction vocale bout en bout                       |   ⬜   | `expo-speech` en dépendance ; STT à arbitrer avec Antonin (§12.3)                                                                                                                                                                                                                                                                                       |
| A.13 | Onboarding conversationnel                            |   🟡   | Voir §6.3 — fait en texte, vocal renvoyé à #25                                                                                                                                                                                                                                                                                                          |

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

| Point                                   | Détail                                                                                                                                                                                                                                                                                                                                        |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pagination remontante du fil absente    | Le fil charge les 50 derniers messages ; au-delà, l'historique n'est pas atteignable. `nextCursor` est déjà renvoyé par l'API                                                                                                                                                                                                                 |
| Rappels du matin non délivrés           | La capacité `morningReminders` est réglable et lue, mais aucun planificateur n'existe : l'assistant ne peut rien proposer qu'on saurait délivrer (→ #26, #20)                                                                                                                                                                                 |
| Todoliste et rendez-vous non captés     | `feature/assistant` ne traduit que les propositions de dossiers. `domain/task` et `domain/calendar` existent désormais tous les deux, mais `suggest_task_list` et `suggest_recurring_event` partent toujours en `console.warn` : le modèle est invité à proposer une todoliste et aucune carte n'apparaît. Raccordement à faire (→ #17, A.11) |
| Séries récurrentes non déployées        | Une `rrule` se saisit et se stocke, mais les occurrences ne sont pas calculées : l'événement n'apparaît qu'à son premier créneau. La dépendance `rrule` est déjà au `package.json` de l'API (A.11)                                                                                                                                            |
| Dates saisies au clavier                | Le formulaire d'événement demande `JJ/MM/AAAA` et `HH:MM` en texte, faute de sélecteur natif partagé par les trois cibles. Fonctionnel, mais en deçà des références du §4.2                                                                                                                                                                   |
| Node ≥ 22.12 requis                     | Le SDK `ai` est ESM-only et l'API compile en CommonJS : `require(esm)` n'est natif qu'à partir de Node 22.12. `engines` a été relevé en conséquence                                                                                                                                                                                           |
| Aucune limite de débit par compte       | `POST /conversations/:id/messages` n'est borné que par la taille d'une réponse (`MAX_OUTPUT_TOKENS`). Rien ne borne le nombre d'appels : un seul compte peut consommer le budget du Gateway                                                                                                                                                   |
| Aucun modèle de repli                   | `llm-error.ts` distingue proprement 429 et 402, mais il n'y a qu'un `LLM_MODEL` : un quota atteint tue le tour au lieu de basculer sur un second moteur                                                                                                                                                                                       |
| Un timeout se présente en panne         | Les délais de `gateway.provider.ts` (60 s, 15 s au premier jeton) retombent dans le `default` de `toHttpException` : l'utilisateur lit « moteur indisponible » et attend une panne qui n'existe pas                                                                                                                                           |
| Erreurs du SDK `ai` non interceptées    | Aucun `onError` n'est posé sur `streamText`. Si le SDK route certaines erreurs vers ce rappel plutôt que par exception, un 429 produirait une réponse vide sans message — à vérifier par un test                                                                                                                                              |
| Historique ouvert par un tour assistant | Le canal commence par le message d'accueil, donc l'historique remis au modèle débute par un tour `assistant`. Toléré ou refusé selon le moteur routé par le Gateway — à couvrir avant de changer `LLM_MODEL`                                                                                                                                  |
| `listPending` sans appelant             | `ConversationService` lit désormais `listForConversation` et en déduit les propositions en attente. La méthode reste en place le temps que l'implémentation des todolistes atterrisse, pour ne pas conflitter                                                                                                                                 |

Le `.env` racine est chargé par l'API (`ConfigModule`) et par Expo
(`app.config.js` / `metro.config.js`).

## Éléments du cahier des charges non disponibles

Aucun. Les deux maquettes annoncées aux §1 et §4.5 sont dans `models/` —
`maquette-interface-ia.html` (web) et `maquette-interface-mobile.html`. La
barre latérale en reprend la structure : entrée Jean-Claude en tête, bouton
« Nouvelle conversation », « + » d'ajout de dossier sur l'en-tête de section,
groupes de dossiers repliables, « … » dans l'en-tête de conversation.
