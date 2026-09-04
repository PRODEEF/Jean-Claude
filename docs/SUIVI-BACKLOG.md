# Suivi du backlog — Jean-Claude

Livrable du §10 du cahier des charges. Statut de chaque point de l'Annexe A et
des exigences transverses. **À mettre à jour chaque jour**, en même temps que
le report quotidien demandé au §0.1.

Légende : ✅ fait · 🟡 en cours · ⬜ non démarré · 🔵 socle posé (structure et
schéma prêts, comportement à écrire)

Dernière mise à jour : **4 septembre 2026** — l'onglet Todoliste devient Mes
listes, sa vue Semaine est reprise dans le calendrier, et un raccourci direct
vers l'avis général rejoint la barre latérale.

**Mes listes perd sa vue Semaine, reprise dans le calendrier.** L'onglet
Todoliste s'appelle désormais Mes listes, et n'a plus qu'une lecture — la
liste, tous dossiers confondus. Sa vue Semaine (un bloc par jour, par moment,
pour les todolistes échues) faisait doublon avec celle du calendrier : elle
est retirée d'ici et reprise dans la vue Mois du calendrier, sous l'agenda du
jour sélectionné, élargie au mois entier plutôt que bornée à sept jours. Une
bascule masque par défaut les jours sans liste — sur un mois complet, les
afficher tous aurait noyé ceux qui comptent. Comme le reste du calendrier, ce
bloc reste en lecture seule : l'appui sur une liste ouvre Mes listes, qui en
reste l'écran d'édition (même principe déjà posé par `DayAgenda`).

**Un raccourci direct vers l'avis général rejoint la barre latérale.** Le
bouton « PROBLÈME », sous le canal permanent Jean-Claude, en reprend le
traitement visuel en rouge et ouvre la même fenêtre d'avis général déjà
accessible depuis le canal et les Réglages — un troisième point d'entrée,
pas un nouveau mécanisme.

Auparavant le même jour : un moyen de remonter un avis utilisateur (hors
cahier des charges), et deux points d'A.1 et A.4 vérifiés et complétés : le
classement matriciel multi-dossiers (#16) et les sous-dossiers automatiques de
projet (#19).

**Un moyen de remonter un avis existe, hors cahier des charges.** Deux formes :
un avis général (bug, idée, autre) accessible depuis le canal Jean-Claude et
depuis les Réglages, et un pouce haut/bas sous chaque réponse de l'assistant,
sur toutes les conversations — le pouce bas propose un commentaire facultatif.
Aucune des deux ne passe par le modèle : ce sont des gestes directs, comme
`PATCH /api/me`, le canal permanent reste borné à ses trois sujets (§12.1,
A.10). Restitution choisie délibérément minimale pour le sprint : les deux
tables (`feedback`, `message_ratings`) se lisent à la main dans Supabase
Studio pour composer le report quotidien — une route de lecture aurait exigé
un premier accès privilégié, qu'aucune RLS ne prévoit aujourd'hui. Le skill
`daily-report` porte désormais les requêtes prêtes à l'emploi.

**#16 est vérifiée, pas reconstruite.** Le rattachement manuel à plusieurs dossiers,
la proposition de rangement par l'assistant et l'affichage de la conversation sous
chacun des dossiers concernés existaient déjà, posés par #7 et #8 — seul manquait un
test sur le cas limite du détachement complet (`folderIds: []`), désormais couvert,
ainsi qu'un test sur la conversation introuvable. Point relevé au passage et non
corrigé ici, hors périmètre de l'issue : le rattachement manuel
(`PUT /conversations/:id/folders`) n'écarte pas les identifiants de dossier
inexistants avant de les écrire, contrairement au rangement proposé par l'assistant,
qui les vérifie déjà.

**#19 avance sur deux fronts.** La détection du « projet » ne reposait que sur le
jugement du modèle, sans qu'aucune consigne ne dise ce qui la caractérise : la
description de `suggest_project_folders` et le prompt du canal permanent portent
désormais un critère explicite — plusieurs actions de nature différente (idée, achat,
tâche, rendez-vous) sur plusieurs jours ou semaines, pas une question qui se referme
en un message. Et une todoliste acceptée depuis une conversation rangée sous un
dossier de projet rejoint maintenant son sous-dossier typé (ACHAT pour une liste de
courses, TODO pour une liste de tâches) plutôt que le dossier du projet lui-même,
quand ce sous-dossier existe — sinon le comportement d'origine s'applique. PRENDRE RDV
en reste exclu : les événements de `calendar_events` ne portent aucun dossier,
l'ajouter suppose une migration, écartée pour cette itération (dette consignée plus
bas). IDÉE reste un sous-dossier ordinaire, sans mécanisme de rattachement : aucun
concept de note n'existe dans le produit aujourd'hui pour y déposer quoi que ce soit
automatiquement — voir le point consigné plus bas sur la distinction dossier / projet.

Auparavant le même jour : corrections après relecture : fil de conversation,
calendrier, bannière et réglages.

**Fil de conversation** : la phrase d'accroche (« Écrivez ce que vous avez en
tête. Le rangement viendra ensuite. ») passe d'un état vide à un en-tête de
liste — elle ne restait affichée que tant qu'aucun message n'existait, et
disparaissait dès le premier échange plutôt que de rester au-dessus du fil.
Le message de l'assistant clignotait aussi en toute fin de réponse : la bulle
de streaming n'était effacée qu'après plusieurs invalidations de cache
indépendantes de son affichage (liste des conversations, titre, propositions,
profil), et restait donc visible en double le temps de leurs allers-retours
réseau.

**Calendrier** : la page ne recadre plus sur les heures ouvrées au
changement de vue (Jour/Semaine). Ce cadrage, posé le 3 septembre pour éviter
d'ouvrir sur des heures de nuit vides, masquait aussi le haut de page —
bandeau et barre d'outils — juste après avoir cliqué dessus. Retiré à la
demande ; la grille peut désormais s'ouvrir sur des heures vides.

**Bannière** : les onglets Calendrier et Todoliste n'avaient aucun style
actif — seul le survol s'affichait, sans rien indiquer quel onglet restait
ouvert une fois le geste terminé. Ils prennent maintenant le fond plein de la
couleur d'assistant tant que leur route est active.

**Réglages** : le choix du modèle passe en menu déroulant, à la place de la
liste de lignes cochables. Point relevé et non tranché ici : cette liste
suivait la règle des 3 apps (§4.2) — ChatGPT, Claude et Perplexity présentent
ce réglage en lignes plutôt qu'en menu déroulant — et le changement demandé
s'en écarte.

Auparavant le même jour : couleur brute pour l'assistant.

**La couleur de l'assistant admet désormais une teinte libre**, en plus des
huit pastilles de #12. Une neuvième option « Personnalisée » ouvre un
sélecteur (carré teinte/saturation, bande de teinte, champ hexadécimal) et se
coche d'elle-même quand la couleur active n'est déjà aucun des huit presets.
Le contraste n'est pas le problème que redoutait #12 : `buildPalette` calcule
déjà `accentText` et `accentSoft` dynamiquement pour n'importe quelle couleur
(luminance WCAG, mélange vers le blanc ou le noir selon le thème) — les huit
presets n'étaient qu'un raccourci, pas une garantie que seules elles
offraient.

Auparavant le 3 septembre 2026 : l'assistant sait compléter une todoliste
existante, et non plus seulement en créer. Auparavant le même jour : le contexte remis au
modèle a été repris — une proposition ne fait plus taire la réponse, et un dossier hors
sujet ne se glisse plus dans un rangement ; l'échéance est passée de la tâche à la liste,
les todolistes s'écrivent comme un texte, et le calendrier sait ouvrir une liste sur le
jour affiché.

**Une carte ne remplace plus la réponse.** Un tour où le modèle s'en tenait à son appel
d'outil n'écrivait aucun message : la carte s'affichait seule et la question posée restait
sans réponse. La consigne le dit maintenant explicitement — l'outil n'affiche qu'une carte,
il ne dispense pas de répondre — et le serveur rattrape le cas restant par un second appel,
sans outils, où la proposition déjà captée est rappelée pour qu'il ne la reformule pas. Deux
appels d'outils échappent au rattrapage : `open_new_conversation`, qui exige justement le
silence, et `ask_question`, dont la question fait déjà le texte du message.

**Un dossier proposé se vérifie avant d'être affiché.** Le modèle rendait un identifiant
seul ; recopié de travers, il tombait sur un autre dossier réel de l'utilisateur — la
proposition paraissait sensée tout en rangeant la conversation dans un dossier étranger au
sujet. `suggest_folders` réclame désormais l'identifiant **et** le nom lus sur la même
ligne de la consigne, et le serveur écarte la ligne dont les deux ne se correspondent pas.
La charge utile persistée, elle, ne bouge pas : les cartes déjà en base restent lisibles.
La consigne demande en outre de ne retenir que les dossiers dont la conversation traite
réellement — la règle du §5.2 vaut toujours (une conversation relève de plusieurs dossiers),
mais le voisinage thématique n'en est pas un.

**L'attente dit combien de temps elle dure.** La roue d'attente est remplacée par
« <assistant> réfléchit… 4 s », le compteur montant tant qu'aucun jeton n'est arrivé — le
repère qu'affichent ChatGPT et Claude (§4.2). Côté serveur, les lectures qui précèdent
l'appel au modèle (fil, profil, propositions, arborescence, agenda) partent désormais
ensemble : deux allers-retours de base en moins avant le premier mot.

**La carte de réponses proposées se voit.** Elle reste au-dessus de la saisie, là où
ChatGPT, Claude et Perplexity posent les leurs (§4.2), mais porte la couleur d'accent et
non le gris des bordures ordinaires : discrète, elle se lisait comme un pied d'écran et se
traversait sans être vue.

**L'échéance appartient à la liste, plus à ses lignes** (A.2, A.3). « Les courses avant
samedi » date la liste, pas le paquet de farine : `due_at` quitte `tasks` pour
`task_lists`, et `event_id` suit le même déplacement — le créneau posé dans l'agenda vaut
désormais pour la liste entière. La migration ne perd rien : chaque liste hérite de la
plus proche des échéances que portaient ses tâches. Conséquence en cascade — la semaine
pose des listes sur leurs jours plutôt que des tâches éparpillées, le calendrier compte
ce qu'il reste à faire dans les listes échues, et l'assistant date la liste qu'il propose
puis n'offre plus qu'un créneau par liste au lieu d'un par ligne.

**Les todolistes s'écrivent comme on écrit un texte** (§13.4.1). Chaque ligne est un
champ : Entrée ouvre la suivante, Retour arrière sur une ligne vide la referme,
Tabulation la range sous la précédente — le modèle de Things 3, de Todoist et de Notion
(§4.2). Deux niveaux, pas trois : `tasks.parent_id` et une règle tenue par le service,
une tâche qui a un parent ne peut pas en être un. La liste part au serveur en un appel
(`PUT /api/tasks/:id/items`) plutôt qu'un geste à la fois : insérer une ligne au milieu
décale toutes les suivantes, et une suite d'appels unitaires laisserait la liste
incohérente entre deux d'entre eux. Le mode « supprimer des éléments » disparaît, devenu
redondant avec Retour arrière.

**L'assistant sait compléter une liste, plus seulement en créer** (§12.1, A.2). Le défaut
était net à l'usage : « complète la liste » faisait reproposer indéfiniment une liste
homonyme, avec une ligne bouche-trou « À compléter ». Trois causes cumulées — aucun outil
ne permettait d'ajouter à une liste existante, la consigne système ne disait rien des
todolistes du fil ni de leur contenu, et le garde-fou anti-répétition ne couvrait que les
propositions *en attente*, pas celles déjà acceptées. `suggest_task_list_items` et la
nature de suggestion `add_task_list_items` répondent au premier point ; la consigne reçoit
désormais les listes nées de la conversation avec leur identifiant et leurs lignes ; et la
phrase anti-répétition mentionne l'accepté. L'outil est retiré du jeu quand le fil n'a
produit aucune liste — sans identifiant à recevoir, le modèle en inventerait un.

**Un `<button>` dans un `<button>` corrigé dans la grille mensuelle.** La cellule de jour
était pressable et portait des pastilles de rendez-vous pressables : HTML invalide, et
React l'avertissait à chaque rendu. Le sélecteur de jour passe en fond
(`StyleSheet.absoluteFill`, comme le fait déjà la grille horaire), le contenu inerte laisse
passer l'appui (`pointerEvents`), les pastilles restent des boutons. Aucun changement
d'usage. Le défaut préexistait à la refonte.

**Trois ajustements d'interface.** « Mes listes » passe devant « Semaine » — c'est la
lecture complète, la semaine n'en est qu'un filtre daté — et une loupe s'ouvre à
l'extrême droite, qui filtre listes et tâches sur ce qui est déjà chargé, sans aller au
serveur. L'icône de dossier qui coiffait une todoliste est remplacée par celle de la
barre latérale : une liste n'est pas un dossier. Dans le calendrier, un bouton
« + Tâches » ouvre une liste datée sur le jour affiché puis conduit à son éditeur —
plutôt que d'y reproduire une seconde saisie.

**Le choix du modèle passe à l'utilisateur** (§5.1). Cinq modèles sont proposés dans les
réglages — un par éditeur, chacun présenté par ce qu'il apporte plutôt que par ce qu'il
est : la page ne demande pas de savoir ce qu'est un modèle de langage pour en changer
(§13.4.4). Mistral porte la mention « hébergé en Europe », déduite de l'éditeur et non
écrite à la main, pour que la promesse affichée soit exactement celle que `/api/health`
calcule (§13.4.6).

Deux réserves sur la liste retenue. Sonar cherche sur le web et raisonne avant de répondre :
la première réponse tarde davantage, et rien ne garantit qu'il produise des appels d'outils —
un modèle qui n'en produit pas laisse la conversation utilisable mais l'assistant muet, plus
une seule proposition (§12.1). Et l'éligibilité au palier gratuit du Gateway n'a pas pu être
vérifiée : seuls les identifiants l'ont été, contre le catalogue que le SDK embarque.

La préférence vit sur le profil (`profiles.llm_model`), et `LLM_MODEL` devient le repli :
`null` n'est pas une absence de réglage mais la valeur « celui que le serveur a retenu »,
ce qui permet d'en changer par configuration sans réécrire les profils. Un modèle retiré du
catalogue est relu comme `null` plutôt que de rendre le profil illisible. Côté moteur, le
modèle voyage désormais sur la requête et non sur l'adaptateur — une instance par
utilisateur aurait reconstruit le port à chaque message — et l'éditeur remonté avec la
réponse est celui qui a réellement répondu, puisqu'il peut changer en cours de fil.

Rien n'est tenté sur un second moteur en cas de refus : un quota atteint reste un quota
atteint, et l'utilisateur en change dans ses réglages. La dette « aucun modèle de repli »
reste donc ouverte.

**Un dossier se glisse dans un autre**, à la souris, et sa branche entière le suit —
sous-dossiers, conversations et todolistes gardent leur rangement relatif. L'en-tête de
section « Dossiers » sert de zone racine : sans elle, le geste n'aurait su que ranger, jamais
ressortir. Rien de nouveau côté serveur, `PATCH /folders/:id` faisait déjà office de
déplacement, garde-fous d'acyclicité et de profondeur compris. Un seul défaut que le geste
exposait : deux dossiers homonymes sous le même parent ressortaient en 500 générique, ils
rendent maintenant un 409 qui dit ce qui s'est passé.

**Les rangées de la barre latérale portent un « … » au survol** (web), qui ouvre exactement
le menu du clic droit. Le clic droit reste le geste, mais rien n'indiquait qu'il existait.
Au doigt, où il n'y a pas de survol, l'appui long continue de tenir ce rôle et le bouton
n'est pas rendu. Au passage, la graisse des rangées non sélectionnées disparaît : le
`Button` de react-native-reusables publie `font-medium` par son contexte de texte, dont
toute rangée héritait — l'arborescence entière paraissait sélectionnée.

**La carte d'une todoliste se replie et se resserre.** Les rangées se touchaient à 8 pt
d'écart pour rien, la hauteur tactile de 44 pt les séparant déjà. Le crayon cède la place à
un « … » portant trois actions — modifier, supprimer des éléments, supprimer la liste — et
les corbeilles quittent les rangées : elles ne reviennent que le temps du mode suppression.
Cocher est le geste courant, supprimer l'exception, et les deux se touchaient du doigt. Un
chevron replie la liste, dépliée par défaut.

**Les todos se lisent et se filtrent par dossier.** Dans l'agenda du jour du calendrier,
elles sont groupées sous l'intitulé de leur dossier — une journée mêle le jardin et les
impôts, l'intitulé dit de quoi relève ce qui suit ; le groupe unique n'en porte pas, il ne
distinguerait rien. Dans l'onglet Todoliste, une rangée de boutons filtre par dossier, et
elle agit sur les deux vues d'un coup, la semaine n'étant qu'une autre lecture des mêmes
tâches. Seuls les dossiers portant au moins une liste sont proposés. Arriver depuis la barre
latérale sur une liste précise relâche le filtre : on a demandé celle-là.

**Le sélecteur de vue du calendrier porte un cinquième segment, « Todo »**, qui n'est pas
une période mais un passage vers l'onglet Todoliste — c'est là que l'œil cherche les autres
lectures du temps. Sur téléphone, la bascule défile plutôt que de déborder : cinq segments
et les trois commandes de navigation ne tiennent pas sur 375 pt, et c'est la navigation qui
doit rester entière.

**Toute l'interface passe en Arial.** Elle tournait jusqu'ici sur la police système, qui
diffère d'une plateforme à l'autre. Un jeton unique, appliqué en `style` et non en classe
utilitaire : la moitié des vues — menus contextuels, fenêtres, écrans d'authentification —
est rendue par `StyleSheet`, hors de portée de NativeWind. Le monospace du code reste
monospace. Sur Android, où Arial n'existe pas, le système retombe sur Roboto : écart assumé,
aucune police n'est embarquée dans le bundle.

Auparavant le 2 septembre : la conversation se reprend, se corrige
et se range au geste ; et l'assistant sait proposer une todoliste.

**Un message n'est plus figé.** Au survol, chaque message porte son ancienneté et ses
commandes, comme dans ChatGPT et Claude (§4.2) : copier, redemander une réponse, et — sur
sa propre parole — corriger le texte. Corriger rejoue le tour à partir de là et emporte ce
qui suivait, puisque cela répondait à un texte qui n'existe plus ; redemander une réponse la
remplace au lieu de la doubler. Deux routes s'ajoutent pour cela
(`PUT /conversations/:id/messages/:messageId` et `.../retry`), toutes deux en flux : la
génération est extraite du tour d'envoi et partagée par les trois gestes, plutôt que
recopiée trois fois.

**La bascule hors périmètre du canal permanent demande désormais son accord** (A.10). Le
serveur n'ouvre plus la conversation dédiée de lui-même : il pose une annonce générique — la
même à chaque fois, c'est elle qui porte le geste — et attend le bouton « Basculer ».
L'assistant propose, il n'exécute pas (§12.1) ; au passage, une bascule que l'utilisateur
laisse venir ne laisse plus derrière elle une conversation vide. Une fois validée, l'échange
sort du contexte du canal : la demande et son annonce cessent d'être relues à chaque tour,
faute de quoi le canal reviendrait sur un sujet dont il vient justement de se dessaisir.
Deux colonnes portent cela sur `messages`, pas une table de plus : la proposition naît et
meurt avec le message qui l'annonce.

**Une réponse choisie d'un appui se relit.** Sous une carte de questions, « Oui » seul ne
disait plus à quoi il répondait une fois le fil remonté : la bulle affiche maintenant la
question puis la réponse. Reconstitué à l'affichage, pas enregistré — c'est bien la réponse
seule que l'utilisateur a envoyée. Les réponses proposées s'éclairent par ailleurs au survol,
qu'aucun retour ne distinguait jusqu'ici d'une liste à puces.

**L'écran d'accueil ouvre sur une saisie** et non plus sur un bouton « Nouvelle
conversation » : le premier message suffit à créer le fil, et faire cliquer avant d'écrire
ajoutait un geste sans rien demander de plus (§13.4.1). La saisie est le composant du fil,
partagé.

**Le rangement se fait au geste dans la barre latérale.** Clic droit sur une conversation —
appui long au doigt — pour la renommer sur place, la ranger ou la supprimer ; et, à la
souris, glisser-déposer sur un dossier. Le dépôt pose la question plutôt que de trancher :
ajouter le dossier aux autres, ou n'y laisser que celui-là. Les deux sont légitimes — une
conversation appartient à plusieurs dossiers à la fois (§5.2, A.1) alors que le geste dit
« déplacer » dans tout explorateur de fichiers. Le glisser-déposer est web seulement : au
doigt, un glissement se confondrait avec le défilement de la barre, et le menu contextuel
couvre le même besoin. Le menu contextuel des dossiers et celui des conversations partagent
désormais une même coque dans `shared/ui`.

Auparavant le même jour : les premières suggestions de todolistes.

**L'assistant sait enfin proposer une todoliste (#13).** `suggest_task_list` était exposé au
modèle depuis le début, mais son appel partait en `console.warn` : le modèle était invité à
proposer des listes et aucune carte n'apparaissait. Le tuyau est raccordé de bout en bout —
l'appel devient une proposition en attente, l'acceptation crée les listes et leurs tâches.
L'exemple du jardin du §12.1 fonctionne : les achats et le travail à faire arrivent en deux
listes distinctes, jamais fusionnées.

Les listes héritent du dossier de la conversation quand elle en a un. C'est le §13.4.1 tenu à la
lettre : on ne demande jamais où ranger au moment de créer, mais le rangement que la conversation
exprime déjà vaut pour ce qui en sort (A.2).

**Le second temps du §12.1 est là aussi** — « puis proposer d'y associer des dates ». Accepter des
listes dont certaines tâches portent une échéance fait naître une seconde proposition, qui pose un
créneau par tâche datée. Elle est écrite par le serveur et non par le modèle : à ce stade il n'y a
plus rien à interpréter, et un second appel au moteur n'ajouterait qu'une latence et le risque
qu'il réponde autre chose qu'une question. La tâche est rattachée à son créneau
(`tasks.event_id`), sans quoi le calendrier montrerait deux fois la même échéance — la tâche
datée et l'événement posé pour elle.

Auparavant le même jour : le contexte remis au modèle, et la robustesse du tour de dialogue.

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
| §5.1 | Choix du modèle par l'utilisateur                      |   ✅   | Catalogue de trois modèles dans `@jc/domain`, choisi dans les réglages et porté par `profiles.llm_model`. `LLM_MODEL` devient le repli, servi tant que rien n'est choisi                                                                                                                                                                                                                  |
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

| Réf. | Point                                                 | Statut | Note                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---- | ----------------------------------------------------- | :----: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A.0  | Regroupement Perso / Pro                              |   🔵   | Colonne `category` posée, non exploitée — volontaire (option à activer plus tard)                                                                                                                                                                                                                                                                                                                                           |
| A.1  | Conversations multi-dossiers, rangement matriciel     |   ✅   | Schéma, `PUT /conversations/:id/folders`, rangement manuel par cases à cocher multiples, glisser-déposer d'une conversation sur un dossier (ajouter ou déplacer, au choix) **et d'un dossier dans un autre**, et proposition de rangement par l'assistant pour un fil non classé                                                                                                                                                                                                 |
| A.2  | Conversion conversation → todoliste                   |   🟡   | `domain/task` et `/api/tasks` écrits : listes et tâches se créent, se cochent, se datent et se rangent. Onglet Mes listes (une seule lecture, filtrable par dossier, cherchable à la loupe ; la lecture par semaine vit désormais dans le calendrier, vue Mois), todolistes visibles dans leur dossier, cartes repliables portant leurs actions dans un menu. Le contenu s'édite comme un texte — une ligne par tâche, deux niveaux d'indentation, réécrit en un appel. Listes groupées par dossier dans l'agenda du calendrier, où « + Tâches » en ouvre une sur le jour affiché. L'assistant propose désormais les listes de lui-même et les crée d'un geste, rangées dans le dossier de la conversation. Restent la conversion à la demande et l'édition avant validation → #17                              |
| A.3  | Détection de tâches datées                            |   🟡   | `dueAt` se saisit et se lit de bout en bout — semaine, calendrier — et se déduit de la conversation. L'échéance porte désormais sur la **liste** et non sur ses lignes : le modèle date la liste qu'il propose, puis une seconde proposition bloque un créneau d'agenda par liste datée. Reste le parsing des dates relatives, laissé au modèle pour l'instant → #18                                                                                             |
| A.4  | Sous-dossiers automatiques de projet                  |   🟡   | L'assistant propose une arborescence (`suggest_project_folders`), l'utilisateur la crée d'un geste — consigne de détection reprise, avec un critère explicite (#19). Une todoliste acceptée rejoint son sous-dossier typé (ACHAT, TODO) quand il existe, au lieu du dossier de projet. Restent PRENDRE RDV — `calendar_events` ne porte aucun dossier — et IDÉE, faute de concept de note dans le produit                |
| A.5  | Gestion multi-dimensionnelle d'un projet              |   ⬜   | Phase C ou au-delà                                                                                                                                                                                                                                                                                                                                                                                                          |
| A.6  | Recherche avancée par filtres                         |   ✅   | `feature/search` et `GET /api/search` : mot-clé plein texte sur les titres **et** le contenu des messages, filtres par dossiers, par période (6 raccourcis) ou par dates saisies, conversations archivées incluses au choix                                                                                                                                                                                                 |
| A.7  | Adaptation à la logique de rangement de l'utilisateur |   🔵   | Colonne `source` désormais réellement alimentée par les rangements acceptés — la matière première est capturée, rien ne l'exploite encore                                                                                                                                                                                                                                                                                   |
| A.8  | Assistant proactif                                    |   🟡   | `feature/assistant` écrit : les appels d'outils deviennent des propositions acceptées ou ignorées d'un geste, dont le fil garde la trace une fois tranchées — et que le modèle relit au tour suivant, pour ne reproposer ni ce qui a été écarté ni ce qui a été accepté. Quatre natures branchées sur cinq : dossiers de projet, rangement, todolistes, complétion d'une todoliste existante et leurs créneaux. Reste le rendez-vous récurrent (A.11)                            |
| A.9  | Multi-plateforme                                      |   🟡   | Web / iOS / Android depuis un codebase, fil de conversation en flux compris. Desktop (Tauri) en Phase C                                                                                                                                                                                                                                                                                                                     |
| A.10 | Bornage du mode assistant                             |   ✅   | Canal unique, jeu d'outils propre au canal, bascule hors périmètre proposée puis validée par l'utilisateur (et retirée du contexte une fois faite), et périmètre `assistant_scope` appliqué côté serveur. Interrupteurs des cinq capacités dans la page Réglages. Le canal reçoit l'agenda des 7 jours et les dossiers existants — il peut enfin répondre sur le premier de ses trois sujets ; délivrance des rappels → #26 |
| A.11 | Rendez-vous récurrents + alerte                       |   🔵   | `domain/calendar` et les quatre vues écrits : `rrule` et `reminder_minutes_before` se saisissent et se stockent. Restent l'expansion des occurrences et la délivrance des rappels                                                                                                                                                                                                                                           |
| A.12 | Interaction vocale bout en bout                       |   ⬜   | `expo-speech` en dépendance ; STT à arbitrer avec Antonin (§12.3)                                                                                                                                                                                                                                                                                                                                                           |
| A.13 | Onboarding conversationnel                            |   🟡   | Voir §6.3 — fait en texte, vocal renvoyé à #25                                                                                                                                                                                                                                                                                                                                                                              |

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
| Distinguer dossier et « projet »                  | A.4/A.5 | Yann — un projet gagnerait à être un format de dossier à part, avec mémoire globale et structure propre, plutôt qu'un dossier ordinaire portant des sous-dossiers typés. Piste soulevée pendant #19, non implémentée |

## Points nécessitant un A/B testing humain (§4.3)

| Sujet                                      | Ce qui a été tranché, faute de mieux                                                                                                                                                                                                                                                                  |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Actions d'un dossier et d'une conversation | Les deux chemins cohabitent : menu contextuel au clic droit (appui long au doigt) **et** bouton « … » au survol sur web, ouvrant le même menu. Les applications de référence ne convergent pas — ChatGPT et Claude posent un menu au survol, Notion et Apple Notes un menu contextuel (§4.2 non concluant) — mais ni le survol ni le clic droit n'existant au doigt, il fallait de toute façon les deux |
| Lisibilité de la barre au 5e niveau        | Chaque niveau ajoute un retrait et un filet vertical. Au 5e, la barre est très entamée à gauche et les libellés se tronquent. L'aplatissement a été écarté — il perdrait la filiation — mais le point demande à être vu avec un vrai volume de dossiers                                               |

## Dette technique connue

| Point                                   | Détail                                                                                                                                                                                                                  |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pagination remontante du fil absente    | Le fil charge les 50 derniers messages ; au-delà, l'historique n'est pas atteignable. `nextCursor` est déjà renvoyé par l'API                                                                                           |
| Rappels du matin non délivrés           | La capacité `morningReminders` est réglable et lue, mais aucun planificateur n'existe : l'assistant ne peut rien proposer qu'on saurait délivrer (→ #26, #20)                                                           |
| Rendez-vous récurrent non capté         | `suggest_task_list` est désormais traduit et exécuté. `suggest_recurring_event` part toujours en `console.warn` : le modèle est invité à proposer une série et aucune carte n'apparaît. Raccordement à faire (→ A.11)   |
| Créneaux posés à l'heure de l'échéance  | Un créneau reprend le `dueAt` de sa liste, sans durée : le calendrier lui en donne une implicite à l'affichage. Une échéance déduite d'une conversation dit quand, pas combien de temps — la durée réelle relève de #18 |
| RDV de projet non rattaché à PRENDRE RDV | `calendar_events` ne porte aucun `folder_id`, contrairement à `task_lists` : un rendez-vous créé depuis un projet ne peut pas rejoindre son sous-dossier typé comme le font déjà les todolistes vers ACHAT et TODO (A.4). Demanderait une migration, écartée pour l'itération de #19 |
| Sauvegarde de liste en écrasement       | `PUT /tasks/:id/items` réécrit la liste entière depuis ce que l'éditeur tient. Deux appareils ouverts sur la même liste se recouvrent donc l'un l'autre — le dernier à écrire gagne. Sans effet à un seul utilisateur, à revoir si l'édition partagée arrive       |
| Séries récurrentes non déployées        | Une `rrule` se saisit et se stocke, mais les occurrences ne sont pas calculées : l'événement n'apparaît qu'à son premier créneau. La dépendance `rrule` est déjà au `package.json` de l'API (A.11)                      |
| Dates saisies au clavier                | Le formulaire d'événement demande `JJ/MM/AAAA` et `HH:MM` en texte, faute de sélecteur natif partagé par les trois cibles. Fonctionnel, mais en deçà des références du §4.2                                             |
| Node ≥ 22.12 requis                     | Le SDK `ai` est ESM-only et l'API compile en CommonJS : `require(esm)` n'est natif qu'à partir de Node 22.12. `engines` a été relevé en conséquence                                                                     |
| Aucune limite de débit par compte       | `POST /conversations/:id/messages` n'est borné que par la taille d'une réponse (`MAX_OUTPUT_TOKENS`). Rien ne borne le nombre d'appels : un seul compte peut consommer le budget du Gateway                             |
| Aucun modèle de repli                   | `llm-error.ts` distingue proprement 429 et 402, mais il n'y a qu'un `LLM_MODEL` : un quota atteint tue le tour au lieu de basculer sur un second moteur                                                                 |
| Un timeout se présente en panne         | Les délais de `gateway.provider.ts` (60 s, 15 s au premier jeton) retombent dans le `default` de `toHttpException` : l'utilisateur lit « moteur indisponible » et attend une panne qui n'existe pas                     |
| Historique ouvert par un tour assistant | Le canal commence par le message d'accueil, donc l'historique remis au modèle débute par un tour `assistant`. Toléré ou refusé selon le moteur routé par le Gateway — à couvrir avant de changer `LLM_MODEL`            |
| Rattrapage de réponse au prix d'un tour  | Un modèle qui s'en tient à son appel d'outil déclenche un second appel : la réponse arrive, mais l'attente double. La consigne cherche à rendre ce cas rare — reste à mesurer sa fréquence par moteur                                                                     |
| `listPending` sans appelant             | `ConversationService` lit `listForConversation` et en déduit les propositions en attente. La méthode du Repository n'a plus d'appelant : à retirer, ou à consommer là où la déduction se fait                           |
| État visuel de la notation par message  | Le pouce sélectionné n'est pas restauré après un rechargement : la notation n'est pas renvoyée avec les messages aujourd'hui. La donnée est bien persistée (`message_ratings`), seul l'indicateur visuel est local à la session |

Le `.env` racine est chargé par l'API (`ConfigModule`) et par Expo
(`app.config.js` / `metro.config.js`).

## Éléments du cahier des charges non disponibles

Aucun. Les deux maquettes annoncées aux §1 et §4.5 sont dans `models/` —
`maquette-interface-ia.html` (web) et `maquette-interface-mobile.html`. La
barre latérale en reprend la structure : entrée Jean-Claude en tête, bouton
« Nouvelle conversation », « + » d'ajout de dossier sur l'en-tête de section,
groupes de dossiers repliables, « … » dans l'en-tête de conversation.
