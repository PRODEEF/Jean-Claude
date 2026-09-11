# Suivi du backlog — Jean-Claude

Livrable du §10 du cahier des charges. Statut de chaque point de l'Annexe A et
des exigences transverses. **À mettre à jour chaque jour**, en même temps que
le report quotidien demandé au §0.1.

Légende : ✅ fait · 🟡 en cours · ⬜ non démarré · 🔵 socle posé (structure et
schéma prêts, comportement à écrire)

Dernière mise à jour : **11 septembre 2026** — un message dicté puis envoyé
revenait se poser dans le champ suivant ; deux autres correctifs sur la dictée.

**Enchaîner deux messages dictés reposait le premier dans le champ.** Relecture
de la dictée, dans la foulée de celle de la lecture à voix haute. `sendDraft`
vide le brouillon (`ConversationThread.tsx`) sans que `useDictation` en sache
rien : `committed` gardait le texte envoyé et la reconnaissance continuait
d'écouter, `continuous` ne s'arrêtant jamais d'elle-même. Dicter « Bonjour »,
envoyer, puis continuer à parler produisait donc « Bonjour la suite » dans un
champ censé être vide. Le hook expose désormais une clôture de session,
appelée à l'envoi depuis `handleSubmit`. `abort` et non `stop` : `stop`
réclame un dernier résultat définitif, qui serait arrivé après coup et aurait
reposé le même texte — remettre `committed` à zéro n'aurait pas suffi. Comme
cet `abort` survient maintenant à chaque message envoyé, le code `aborted`
n'est plus journalisé : il signalait une panne à chaque dictée réussie.

**Le bouton s'annonçait en écoute avant que le micro soit autorisé.** `start`
passait `listening` à vrai avant d'appeler `requestPermissionsAsync` : à la
toute première dictée — le moment qui compte — le bouton pulsait et se disait
« Arrêter la dictée » pendant que l'utilisateur lisait la demande
d'autorisation du système, sans que rien soit enregistré. L'état d'écoute
n'est plus posé qu'une fois la permission obtenue.

**Les messages de panne parlaient de « navigateur » sur iOS et Android.** « La
dictée n'est pas disponible sur ce navigateur » et « Autorisez le microphone
pour ce site dans les réglages de votre navigateur » sont justes sur le web et
faux partout ailleurs, où l'autorisation se donne dans les réglages du
système : un utilisateur d'iPhone envoyé chercher les réglages de son
navigateur ne trouve rien (§13.4.4). Les deux messages sont désormais formulés
selon la plateforme.

Relevés sans être traités, faute d'avoir été reproduits ou jugés prioritaires :
taper au clavier pendant une dictée est écrasé par le fragment suivant,
`committed` étant figé au démarrage ; et `useSpeechRecognitionEvent` écoute le
module globalement, si bien que deux `Composer` montés en même temps —
plausible si Expo Router garde `/chat` sous `/chat/[id]`, non vérifié à
l'exécution — recevraient les mêmes résultats, le démontage de l'un coupant la
dictée de l'autre.

Dernière mise à jour : **11 septembre 2026** — trois correctifs sur la lecture
à voix haute, et le retrait d'un réglage qui ne pilotait rien.

**La lecture à voix haute pouvait rester bloquée toute une session sur la voix
par défaut du navigateur.** Relecture de l'existant, à la faveur d'une question
sur la personnalisation de la voix. `bestFrenchVoice` (`use-speech.ts`)
mémorisait sa résolution au niveau du module, y compris quand celle-ci ne
donnait rien. Or sur web, `speechSynthesis.getVoices()` rend classiquement une
liste vide au premier appel : les voix se chargent de façon asynchrone, le
navigateur le signale ensuite par un événement `voiceschanged`. Un premier clic
sur le haut-parleur tombant dans cette fenêtre figeait donc `null` pour toute la
session, et chaque lecture suivante repartait sur la voix par défaut du
navigateur — souvent anglaise — sans jamais réessayer. Une liste vide est
désormais traitée comme l'état transitoire qu'elle est : elle n'est pas retenue,
le prochain appel réinterroge le système. Une liste non vide sans voix française
reste, elle, une réponse définitive. Risque identifié par lecture du code et non
reproduit en conditions réelles — le premier clic arrive en général bien après
le chargement de la page.

**Les échecs de synthèse ne laissaient aucune trace.** Quatre `catch` vides dans
`use-speech.ts`, plus un `onError` qui se contentait de remettre l'icône en
place : la règle `000-general.md` les interdit, et le voisin direct —
`CopyAction`, dans `MessageRow.tsx` — faisait déjà les choses correctement. Ils
passent par un avertissement commun, sans message à l'écran : l'utilisateur n'a
rien demandé d'autre que d'écouter une réponse, et la lecture s'arrête d'elle-même.

**Un bloc de code n'est plus énoncé caractère par caractère.**
`markdownToSpeech` le donnait tel quel à la synthèse, ponctuation et indentation
comprises. Sa présence est maintenant annoncée d'un « Bloc de code », plutôt que
passée sous silence — une réponse qui n'en contient qu'un resterait sinon muette
sans qu'on sache pourquoi.

**Le réglage `speakResponses` est retiré (migration `20260911090000`).** La
colonne existait depuis le schéma initial, le Repository la mappait, le schéma
Zod la transportait jusqu'au client — et aucune ligne de `apps/app` ne la
lisait. Un réglage persisté mais inopérant, qu'une prochaine lecture du profil
aurait fini par faire passer pour actif. La lecture à voix haute reste
déclenchée au geste, par le bouton haut-parleur de chaque réponse : le besoin
est couvert, et une lecture automatique par défaut serait de toute façon
intrusive.

Écartée au passage : la pause et la reprise d'une lecture en cours.
`expo-speech` ne les expose que sur iOS et le web — `Speech.pause()` n'existe
pas sur Android, l'API `TextToSpeech` du système ne la proposant pas. Les câbler
ferait diverger le comportement d'un même bouton d'une plateforme à l'autre, ce
que le codebase unique cherche précisément à éviter. Interrompre une lecture la
reprend donc toujours du début.

Dernière mise à jour : **9 septembre 2026** — l'assistant peut désormais
proposer plusieurs rendez-vous ponctuels dans une seule carte, au lieu d'un
geste par rendez-vous.

**L'assistant peut poser plusieurs rendez-vous ponctuels en une seule
proposition (A.3, A.8).** Demande explicite. Jusqu'ici, seul
`suggest_recurring_event` posait un rendez-vous — une série portée par une
règle RRULE — et rien ne couvrait plusieurs rendez-vous indépendants
énumérés dans le même message (« pose-moi ces trois rendez-vous ») : le
modèle devait soit forcer une fausse récurrence, soit répéter l'appel un par
un et empiler une carte par rendez-vous, ce que le « non intrusif » du
§12.1 exclut. Nouvel outil `suggest_events` (nouvelle nature `create_events`),
sur le même principe que `suggest_task_list` pour les todolistes : une
entrée par rendez-vous dans un seul appel. `allDay` et la fin du créneau sont
dérivés à l'acceptation de la présence d'une heure dans `startsAt`, comme
pour un rendez-vous récurrent ou un créneau posé depuis une todoliste — le
modèle n'a donc à fournir qu'un titre et une date par rendez-vous. Filet de
robustesse identique à celui de `suggest_recurring_event` : une date sans
secondes ni fuseau est reformatée avant validation plutôt que de faire
perdre la proposition. Migration `20260909140000` pour la nouvelle valeur de
`kind`.

Dernière mise à jour : **9 septembre 2026** — `suggest_folders` pouvait
rattacher une conversation sans rapport à l'unique dossier existant de
l'utilisateur.

**`suggest_folders` pouvait rattacher une conversation à un dossier
existant sans le moindre rapport, quand c'était le seul disponible (branche
`fix/attachments`).** Signalé en usage réel, reproductible : un CV envoyé
en pièce jointe à un compte dont l'unique dossier est « Courses » se voyait
proposer aussi bien « Courses » lui-même que le parent du nouveau sous-dossier
« CV / Candidatures ». Le garde-fou déjà en place (`withVerifiedFolders`)
fonctionnait comme prévu — identifiant et nom recopiés depuis une même ligne
réelle, aucun dossier halluciné — ce n'était donc pas un identifiant mal
recopié mais un vrai choix du modèle, qui rattachait apparemment un nouveau
dossier au premier existant venu plutôt qu'à la racine dès qu'aucun dossier
pertinent n'existait. Le CV lui-même ne contient rien évoquant des courses :
le contenu n'explique pas le choix. La consigne (description de l'outil et
`buildSystemPrompt`) précise désormais explicitement, avec ce cas concret en
exemple négatif, que le rattachement à un dossier existant s'apprécie au
sujet et jamais au nombre de dossiers disponibles — sans dossier pertinent,
le nouveau dossier naît à la racine, sans `parent`. Correctif de prompt, non
déterministe par nature : à revérifier à l'usage plutôt que tenu pour
définitivement réglé.

Dernière mise à jour : **9 septembre 2026** — le tiroir de navigation mobile
ne se refermait toujours pas au second appui sur le bouton, cette fois
seulement sur le web.

**Le tiroir de navigation ne se refermait toujours pas sur mobile, mais sur
le web seulement (branche `fix/attachments`, malgré le nom).** Un premier
correctif (8 septembre, ci-dessous) avait déjà diagnostiqué que la `View`
plein écran posée par-dessus le contenu une fois le tiroir ouvert captait le
second appui (fermeture) au lieu de le laisser atteindre le bouton, et
posé `pointerEvents: "box-none"` dans son `style` pour l'en empêcher. Ce
correctif est complet pour React Native natif, mais incomplet pour le web :
`react-native-web` ne sait traduire `pointerEvents` en CSS que si l'objet
`style` entier est statique, or il partage cet objet avec `paddingTop:
insets.top + 56`, calculé à l'exécution — l'ensemble bascule alors en style
inline brut, où `pointerEvents` finit écrit tel quel dans l'attribut HTML
`style`, une valeur invalide que le navigateur ignore silencieusement.
`pointerEvents="box-none"` est donc désormais posé en prop du composant,
seule forme que `react-native-web` traduit de façon fiable quel que soit le
reste du style (`apps/app/src/app/(app)/_layout.tsx`). Les autres usages du
même mécanisme dans l'app (calendrier, recherche) ne mélangent jamais
`pointerEvents` à une valeur dynamique dans le même objet — non concernés.

**Le contenu d'une pièce jointe pouvait ne pas atteindre le modèle au
premier tour, sans erreur visible (branche `fix/attachments`).** Signalé en
usage réel : un PDF joint à « tu penses quoi de mon CV ? » a produit une
réponse qui ne voyait aucun fichier, alors que son texte avait bien été
extrait à l'upload et restait consultable depuis la pièce jointe elle-même.
En cause, une course dans `streamMessage` (`conversation.service.ts`) : la
liaison de la pièce jointe au message (`linkToMessage`) partait en tâche de
fond, sans être attendue, juste avant que `generate` relise le fil depuis la
base pour construire la requête au modèle — `message_attachments` ne
rejoint son message que par `message_id`, donc une relecture trop rapide
renvoyait un message sans pièce jointe. Le `await` manquant a été ajouté ;
l'échec de la liaison reste best-effort et journalisé, comme avant.

Dernière mise à jour : **9 septembre 2026** — l'assistant lit désormais les
images, les PDF et les fichiers texte joints à un message, nouveau domaine
API `attachment` et port LLM étendu au contenu multimodal ; Jean-Claude peut
signaler un bug de sa propre initiative depuis le canal permanent, retenu
comme n'importe quelle suggestion jusqu'à validation ; une échéance de
todoliste qui porte une heure explicite (« à 10h ») n'est plus
systématiquement ramenée à minuit, et le créneau posé dans l'agenda pour une
échéance ainsi précisée devient un rendez-vous à heure fixe plutôt qu'une
journée entière ; un tour de dialogue sans texte ni proposition l'annonce
désormais plutôt que de se refermer en silence ; supprimer ou déplacer un
rendez-vous lié à une todoliste répercute enfin le changement dans Mes
listes et la barre latérale sans recharger la page ; modifier l'échéance
d'une todoliste déjà liée à un rendez-vous répercute désormais l'heure sur
ce rendez-vous ; le pied d'action d'une fenêtre modale ne se retrouve plus
rogné sur le web, et son corps défilant reçoit une marge de sécurité
supplémentaire ; et la fenêtre d'avis général est plus simple à remplir.

**L'assistant lit les images jointes à un message.** Nouveau geste de capture
(§13.2.1, §13.4.1 : « quel que soit son format — texte, voix, image, lien »),
absent jusqu'ici et sans point d'Annexe A dédié (contrairement au vocal, A.12).
Un trombone dans le Composer permet de joindre jusqu'à 4 images par message,
10 Mo chacune, JPEG/PNG/WebP : sélecteur de fichier, glisser-déposer et collage
d'une capture d'écran côté web, galerie ou appareil photo côté natif.
L'upload part dès la sélection, avant l'envoi du message — ce qui laisse le
trombone utilisable depuis l'écran d'accueil, sans conversation encore ouverte
— vers un nouveau domaine `attachment` (`POST /api/attachments`, bucket
Storage privé, URLs signées à la lecture, jamais publiques). Le port
`LlmProvider` (`core/llm/llm.port.ts`) accepte désormais un contenu
multi-parties (texte + images) en plus de la simple chaîne d'avant ; les cinq
modèles du catalogue (`preferences.schema.ts`) lisent tous les images d'après
leur documentation — un modèle qui ne le ferait pas verrait le serveur refuser
l'envoi (422) plutôt que de l'expédier dans le vide (§12.1, le serveur fait
respecter la règle). Pièces jointes affichées dans le fil, aperçu plein écran
à l'appui.

**L'assistant lit aussi les PDF joints.** Même trombone, même limite de 10 Mo,
mais un mécanisme différent : un PDF ne devient jamais un contenu image envoyé
au modèle — son texte est extrait côté serveur à l'upload (`core/pdf-text.ts`,
bibliothèque `unpdf`) et stocké une fois pour toutes sur la pièce jointe
(`extractedText`), plutôt que reparsé à chaque tour du fil. Décision prise
après vérification que la lecture native de PDF par le Vercel AI Gateway est
documentée comme instable (issue vercel/ai sur les « file content parts »),
contournée ainsi sur les cinq modèles à l'identique. Un PDF scanné, sans
couche de texte, est refusé à l'upload (422, message explicite) — pas d'OCR,
hors périmètre. Le texte extrait rejoint le texte du message dans le contexte
donné au modèle, avant les images ; `assertVisionCapable` ne compte que les
images, un PDF seul passe donc avec n'importe quel modèle. Sélecteur de
document natif (`expo-document-picker`) en plus de la photothèque et de
l'appareil photo côté mobile ; web reste au sélecteur de fichier, sans
glisser-déposer ni collage pour ce type.

**L'assistant lit aussi les fichiers texte joints (.txt, .md, .csv).** Même
mécanisme que le PDF, plus direct : le contenu est déjà du texte, il est lu
tel quel (`file.text()`) sans bibliothèque d'extraction, puis rejoint le
contexte donné au modèle exactement comme un PDF — jamais une image, jamais
besoin d'un modèle qui lit la vision. Un fichier vide une fois les espaces
retirés est refusé à l'upload (422), même logique que le PDF sans texte
exploitable. Le sélecteur de document natif accepte désormais ces trois types
en plus du PDF ; côté carte et aperçu, le critère de bascule entre vignette
image et carte de fichier est devenu « est-ce une image ? » plutôt que « est-ce
un PDF ? », pour ne pas avoir à réénumérer chaque nouveau type non-image.

Auparavant le même jour : **Jean-Claude peut signaler un bug depuis le canal
permanent, retenu comme suggestion à valider (A.10).** Jusqu'ici, remonter
un avis passait uniquement par la fenêtre d'avis général (posée le 4
septembre) — un geste
direct, jamais soumis au modèle. Le signalement conversationnel est un canal
supplémentaire, pas un remplacement : un nouveau kind `report_bug` rejoint
les six déjà connus d'`assistant_suggestions` (migration du jour), et le
canal permanent passe de trois à quatre sujets autorisés — les trois
premiers restent inchangés, `buildSystemPrompt` et
`.claude/rules/400-produit.md` (A.10) documentent désormais ce quatrième.
L'invariant du §12.1 tient sans exception : le modèle rédige un message de
confirmation et le texte du signalement, l'utilisateur voit ce texte dans la
carte de proposition et valide ou ignore, et ce n'est qu'à l'acceptation que
le serveur écrit dans `feedback` (catégorie « bug »), via le service déjà
existant — jamais depuis le tool_call lui-même. Ceci amende la doctrine
posée le 4 septembre, qui tenait `feedback` volontairement hors de portée du
modèle pour préserver le bornage du canal : la table elle-même ne change
pas, seule la façon d'y écrire depuis le canal permanent s'ouvre, sous
condition de validation. `platform` et `screen` — que le modèle ne peut pas
connaître — sont fournis par le client au moment de l'acceptation plutôt
qu'à la capture, en réutilisant le même contexte technique déjà joint à la
fenêtre d'avis général.

Auparavant le même jour : **une échéance de todoliste qui porte une heure
explicite n'est plus systématiquement ramenée à minuit, et le créneau
bloqué dans l'agenda pour elle devient un rendez-vous à heure fixe (A.3,
#18).** Signalé en usage
réel : « crée une liste de courses pour samedi à 10h » produisait une liste
échue le samedi mais sans l'heure, et un « Bloquer le créneau » accepté sur
cette liste posait un événement journée entière plutôt qu'un rendez-vous à
10h — l'heure donnée disparaissait purement et simplement. En cause, deux
mécanismes distincts, tous deux volontaires à l'origine (points du 7
septembre) : `withCorrectedDueDates` ramenait _toujours_ l'heure du modèle à
minuit, y compris une heure explicitement demandée ; et `scheduleTasks`
posait _toujours_ un créneau journée entière (`allDay: true`), sans jamais
regarder l'échéance de la liste.

Plutôt que de déduire une « heure volontaire » depuis le calcul de date du
modèle (`dueAt`), risqué — un modèle qui se trompe de fuseau y pose parfois
une heure qui n'est ni minuit ni une heure demandée, un cas déjà couvert par
un test existant sur une correction de date — un nouveau champ explicite,
`dueTime` (« HH:mm », `suggest_task_list` et `suggest_task_list_due_date`),
porte l'heure uniquement quand l'utilisateur en a donné une. `resolveDueAt`
(`conversation.service.ts`) combine désormais le jour (filet de date relative
ou calcul du modèle, inchangé) et cette heure (`dueTime`, nouveau) ; sans
elle, l'échéance reste à minuit exactement comme avant ce champ — aucun des
tests existants sur la correction de dates n'a dû changer. Côté agenda,
`AssistantService.scheduleTasks` reçoit `IUserRepository` (même pattern que
`TaskService.syncLinkedEvent` pour le sens inverse) et pose `allDay` selon
`hasWallTime`, désormais partagée depuis `core/timezone.ts` plutôt que
dupliquée. Le créneau à heure fixe dure une heure par défaut, même
convention que celle déjà simulée à l'affichage pour un événement sans fin.

**Un tour de dialogue qui ne produit ni texte ni proposition l'annonce
désormais, plutôt que de se refermer en silence.** Un modèle qui répond sans
erreur technique mais sans le moindre appel d'outil — Sonar (§5.1) peut le
faire — laissait jusqu'ici la conversation utilisable mais l'assistant muet,
sans aucun signal : ni carte, ni message, ni bannière, le mécanisme d'erreur
déjà en place (`llm-error.ts` : 429 quota, 402 crédit épuisé, 503 panne) ne
couvrant que les échecs techniques du moteur, pas une réponse vide et
techniquement réussie. `ConversationService.generate` lève désormais une
erreur (502) quand le tour se referme sans message d'assistant ni suggestion
capturée, empruntant le même canal `type: "error"` du flux déjà affiché au
fil. Le message de l'utilisateur, lui, reste acquis : seule la réponse
manque. Reste hors périmètre, dette déjà consignée : aucun repli automatique
sur un second moteur si celui choisi refuse ou reste muet, l'utilisateur doit
encore aller en changer lui-même dans Réglages.

**Supprimer ou déplacer un rendez-vous lié à une todoliste répercute enfin le
changement dans Mes listes, la barre latérale et la vue Todo, sans recharger
la page (A.3).** Le serveur détachait déjà `task_lists.event_id` à la
suppression (contrainte `on delete set null`, posée le 3 septembre) et
mettait déjà à jour l'échéance au déplacement (`CalendarService.
syncLinkedTaskList`, point du 7 septembre) : la donnée était cohérente en
base dès ce jour-là. Ce qui ne suivait pas, c'est le cache : `useCalendarActions()`
n'invalidait que la clé `["calendar"]`, jamais `["taskLists"]`, que
partagent pourtant les trois écrans qui affichent les todolistes
(`use-task-lists.ts`) — la liste continuait donc de s'afficher à sa date ou
son créneau d'origine jusqu'à ce qu'un autre geste déclenche un rechargement.
`update` et `remove` invalident désormais `["taskLists"]` en plus du
calendrier. Le point noté le 7 septembre comme dette (« la suppression d'un
rendez-vous lié... ne détache pas encore task_lists.event_id ») décrivait en
réalité ce trou de cache, pas une incohérence en base.

**Modifier l'échéance d'une todoliste déjà liée à un rendez-vous répercute
désormais l'heure sur ce rendez-vous (A.3).** Signalé en usage réel,
prolongement direct du point d'hier sur le calendrier Jour/Semaine : une
todoliste dont le créneau avait déjà été posé (« Bloquer le créneau »
accepté) restait affichée toute la journée dans le calendrier même après
avoir précisé une heure sur la liste, la modification ne portant que sur
`task_lists.due_at`. `CalendarService.syncLinkedTaskList` faisait déjà ce
travail dans l'autre sens (déplacer le rendez-vous met à jour la liste) ;
`TaskService.updateList` fait maintenant de même vers le rendez-vous quand
`eventId` est renseigné, `allDay` étant dérivé de l'heure murale du profil —
minuit vaut « dans la journée », comme partout ailleurs dans le produit.
`TaskService` reçoit à cette occasion `ICalendarRepository` et
`IUserRepository` en plus de son Repository propre, symétriquement à
`CalendarService`, qui consultait déjà `ITaskRepository` — deuxième et non
plus seul endroit du projet où un service `domain/` en consulte un autre
directement plutôt que de passer par `feature/`.

**Le pied d'action d'une fenêtre modale ne se retrouve plus rogné sur le
web.** Signalé en usage réel, urgent, sur la confirmation de suppression de
compte — mais affectait potentiellement toute `Modal` dont le contenu
dépassait une certaine hauteur. En cause, `@rn-primitives/dialog` insère sur
le web un `<div>` intermédiaire (le `Dialog.Content` de Radix) sans hauteur
explicitement posée : `max-h-[85%]`/`max-h-[88%]` n'avait alors plus de bloc
englobant défini pour se résoudre, et Chromium le calculait contre la
hauteur intrinsèque du dialogue lui-même — toujours plus petite que son
contenu réel, d'où la troncature silencieuse par `overflow-hidden`. Remplacé
par `max-h-[85vh]`/`max-h-[88vh]` sur le web uniquement (`Platform.select`),
qui se résout contre la fenêtre sans dépendre de cette chaîne ; le natif
n'était pas concerné.

**Le corps défilant d'une fenêtre modale reçoit `min-h-0`, en renfort du
correctif précédent.** Un enfant flex garde par défaut pour hauteur minimale
celle de son contenu (`min-height: auto`) et refuse de s'y réduire — sur
certains moteurs de rendu, cela suffit à repousser le pied hors de
`max-h-[85vh]`/`[88vh]` même une fois la cause initiale ci-dessus corrigée.
Repéré en creusant un nouveau signalement sur la fenêtre d'avis général, sans
qu'aucune combinaison de taille de fenêtre ne le reproduise ici (testé sur
Chromium jusqu'à 480 px de haut, fix précédent inclus ou non) : traité par
prudence plutôt que laissé en l'état, faute de pouvoir tester tous les
moteurs de rendu depuis cet environnement.

**La fenêtre d'avis général (bug, idée, autre) gagne trois détails
d'ergonomie.** Le champ de texte affiche une piste selon la catégorie choisie
plutôt qu'un seul texte générique (« Que s'est-il passé ? Qu'attendiez-vous à
la place ? » pour un bug, par exemple) ; il reçoit le focus dès l'ouverture,
comme les autres formulaires courts de l'app ; et l'envoi affiche désormais
une confirmation avant de se refermer — jusque-là la fenêtre se contentait de
disparaître, sans rien dire de l'issue de l'envoi.

Dernière mise à jour : **8 septembre 2026** — une todoliste à heure précise
s'affiche enfin à son heure dans la grille Jour/Semaine du calendrier, une
suggestion de l'assistant ne peut plus en faire disparaître une autre du même
tour, la todoliste se lit plus dense, et le tiroir de navigation se referme
correctement sur mobile.

**Une todoliste à heure précise s'affiche enfin à son heure, pas comme
« toute la journée ».** Signalé en usage réel. En cause, `TimeGrid` (vues
Jour et Semaine) plaçait systématiquement les todolistes échues dans un
bandeau plat au-dessus de la grille horaire, sans jamais regarder si leur
`dueAt` portait une heure précise — à la différence des rendez-vous, où seuls
ceux marqués `allDay` y échappent. `layoutDayLists` (`calendar-dates.ts`)
sépare désormais les deux cas avec la même convention que `momentOf` :
minuit pile vaut « dans la journée », une heure précise se place dans la
grille comme un rendez-vous.

**Une suggestion de l'assistant ne peut plus en faire disparaître une autre
du même tour.** Signalé en usage réel (« l'IA ne propose parfois que le
1er choix »). Deux causes cumulées. D'abord, la contrainte CHECK de
`assistant_suggestions.kind` n'avait jamais été mise à jour pour
`update_task_list_due_date`, introduit plus tôt dans la journée : toute
reprogrammation de todoliste échouait donc en base — et comme la boucle qui
capture les suggestions d'un tour n'isolait pas ses erreurs, cet échec
interrompait aussi la capture de toutes celles qui suivaient dans le même
tour. La migration ajoute le kind manquant, et chaque capture est désormais
isolée dans son propre `try`/`catch` (`conversation.service.ts`). Ensuite,
plus étroit : le geste explicite « Extraire la todoliste » ne gardait que le
premier appel d'outil (`toolCalls.find`) quand le modèle répondait par
plusieurs appels `suggest_task_list` séparés plutôt qu'un seul groupé —
`mergeTaskListCalls` les regroupe désormais avant capture.

**La todoliste se lit plus dense.** Demandé directement. Les lignes de
`TaskListEditor` et de `TaskRow` se rapprochent et la case à cocher rétrécit
(`TASK_ROW_HEIGHT` : 32 pt, `TASK_CHECKBOX_SIZE` : 16 px) — sous
`MIN_TOUCH_TARGET` (44 pt) par dérogation explicite à la règle
d'accessibilité du projet (200-app.md), acceptée pour cette liste en
particulier.

**Le tiroir de navigation se referme correctement sur mobile.** Signalé en
usage réel : le bouton l'ouvrait mais ne le refermait pas. En cause, la `View`
plein écran posée par-dessus le contenu une fois le tiroir ouvert couvrait
aussi la bannière, sans y porter aucun enfant — le second appui (fermeture)
était capté par cette zone vide avant d'atteindre le bouton, qui ne pouvait
donc qu'ouvrir le tiroir, jamais le refermer. Il lui manquait
`pointerEvents: "box-none"`, déjà en usage ailleurs dans le calendrier pour
le même besoin.

Dernière mise à jour : **8 septembre 2026** — le bandeau du calendrier reprend
la disposition de Google Agenda sur desktop.

**Le bandeau du calendrier reprend la disposition de Google Agenda, sur
desktop (§4.2).** Demande explicite, clarifiée point par point avant
implémentation. Une seule ligne, packée à gauche : bascule de vue, « Aujourd'hui »,
période affichée, puis les deux flèches — remplace la disposition à trois
zones (grand titre séparé au-dessus, bascule centrée, navigation à droite) et
fusionne ce grand titre avec le texte qui vivait jusque-là entre les flèches.
Un seul texte de période subsiste ; en vue Semaine, il affiche le mois plutôt
que la plage complète (« Semaine du 7 au 13 septembre »), qui ne tenait plus à
côté des autres commandes. `weekLabel` et `weekdayLabel` (`shared/lib/dates.ts`)
sont retirées, devenues inutilisées. Le mode compact (téléphone) garde son
organisation actuelle en deux lignes, déjà pensée pour cette largeur — seul le
layout ≥768pt change.

Dernière mise à jour : **8 septembre 2026** — la moitié sombre des pastilles
de couleur des réglages n'était plus qu'un aplat noir, le modèle IA par
défaut sort du catalogue de test pour rejoindre celui des réglages, cliquer
une todoliste échue depuis les vues Jour/Semaine/Mois ouvre enfin son détail
au lieu d'une fiche de rendez-vous vide, la vue Todo du calendrier se coche
directement, et le texte entre les flèches de navigation varie selon la vue.

**La moitié sombre des pastilles de couleur, en réglages, n'était plus
qu'un aplat noir.** Signalé en usage réel : les huit pastilles de « Sa
couleur » devenaient indiscernables les unes des autres côté thème sombre.
En cause, `softenAccent(couleur, "dark")` mélange 72 % de noir — le bon aplat
pour une grande surface (bulles, calendrier), mais qui écrase toute teinte
sur un disque de 20 px. Un aperçu propre à cet écran (`previewDarkHalf`,
réglages.screen.tsx, mélange à 55 %) remplace ce demi-cercle ; l'aplat réel
utilisé ailleurs dans l'app (bulles de conversation, calendrier en thème
sombre) n'a volontairement pas changé.

**Le modèle IA par défaut sort du catalogue de test pour rejoindre celui
des réglages (§5.1).** Signalé en usage réel : à l'inscription comme pour
tout profil n'ayant encore rien choisi, le sélecteur de « Modèle » n'affichait
rien de coché. En cause, `LLM_MODEL` par défaut (`anthropic/claude-opus-5`)
n'appartenait pas aux cinq modèles du catalogue de `@jc/domain` — geste
délibéré à l'origine (« éprouver un moteur avant de le proposer »), mais qui
laisse un profil neuf sans rien coché ni expliqué. Le défaut serveur passe à
`mistral/mistral-medium-3.5`, dans le catalogue. Une variable d'environnement
`LLM_MODEL` déjà positionnée explicitement sur un déploiement (Vercel) prime
toujours sur ce défaut de code et reste à mettre à jour séparément si besoin.

**Cliquer une todoliste échue depuis les vues Jour/Semaine/Mois ouvre enfin
son détail, cochable.** Signalé en usage réel : une todoliste dont le
créneau est représenté par un rendez-vous (« Bloquer le créneau » accepté)
ouvrait, au clic, la fiche générique d'un événement — sans la liste, rien à
cocher, et un bouton « Fermer » qui doublonnait la croix de fermeture du
bandeau. En cause, la grille route tout clic sur un événement vers
`EventDetailDialog`, qu'il représente une todoliste ou non. `calendar.screen`
cherche désormais la todoliste que l'événement représente (`list.eventId`)
et ouvre `TaskListDetailDialog` à sa place ; celle-ci embarque la liste,
cochable via `TaskRow` (déjà écrit, jamais branché nulle part), plutôt que de
renvoyer systématiquement vers Mes listes. Le bouton « Fermer » superflu est
retiré de `EventDetailDialog`, et `Modal` n'affiche plus de pied vide quand
il ne reste aucune action.

**La vue Todo du calendrier se coche directement.** Jusqu'ici en lecture
seule par choix assumé (« on coche dans Mes listes, qui en reste l'écran »).
`DueListsBoard` sépare désormais l'en-tête de chaque carte (icône, titre,
heure — toujours pressable, toujours vers Mes listes) du contenu, rendu par
`TaskRow` au lieu d'un simple texte barré.

**Le texte entre les flèches de navigation du calendrier varie selon la
vue.** Avant, toujours l'année — y compris en vue Jour ou Semaine, où ça ne
dit rien de la période affichée et double le titre en vue Mois. Vue Jour : le
jour de la semaine seul (« lundi »). Semaine et Mois : mois et année. Année :
inchangé.

Dernière mise à jour : **8 septembre 2026** — l'assistant sait reprogrammer
une todoliste existante et ne peut plus lui en proposer une dans le passé, la
vue Todo du calendrier retrouve les listes déjà liées à un rendez-vous,
déplacer un rendez-vous lié à une todoliste met désormais à jour son
échéance, sélectionner une liste depuis la barre latérale y fait désormais
défiler l'écran, et Mes listes comme la vue Todo du calendrier se resserrent
sur grand écran.

**L'assistant sait reprogrammer une todoliste existante (§12.1, A.2).**
Jusqu'ici, seule la création portait une échéance : « décale les courses à
vendredi » n'avait aucun outil à sa portée. Un nouvel outil,
`suggest_task_list_due_date`, et une nouvelle nature de suggestion,
`update_task_list_due_date`, suivent exactement le même principe que le
reste — une proposition en attente, jamais une écriture directe (§12.1). Il
n'est offert que si le fil a déjà produit au moins une liste, et jamais deux
fois de suite pour la même reprogrammation en attente, comme
`suggest_task_list_items`. La consigne système porte désormais l'échéance
actuelle de chaque liste du fil, pas seulement son contenu : sans elle,
« décale-la de 3 jours » n'aurait rien à décaler _depuis_. Même filet
déterministe que la création (`dueAtText`, `parseRelativeDateFr`) pour les
tournures relatives au jour même.

**Une todoliste proposée par l'assistant ne peut plus tomber dans le
passé.** Signalé en relecture : rien n'empêchait le modèle de proposer une
échéance déjà passée, ni à la création ni à la reprogrammation. Le calcul
d'une date reste faillible (arithmétique de jours de semaine, fuseau), et le
filet `withCorrectedDueDates` ne couvrait que la mise à minuit, pas la
question du jour. Une échéance de création qui retombe dans le passé est
désormais effacée plutôt que gardée — même philosophie qu'une date illisible,
la liste vaut mieux sans échéance que pas de liste du tout. Une
reprogrammation dans le passé, elle, n'a rien d'autre à proposer : la
suggestion entière est abandonnée plutôt que persistée.

**La vue Todo du calendrier retrouve les listes déjà liées à un
rendez-vous.** Signalé en usage réel : une todoliste dont le créneau avait
été posé dans l'agenda (proposition « Bloquer le créneau » acceptée)
disparaissait purement et simplement de l'onglet Todo. En cause,
`unscheduledLists` exclut à raison les listes déjà représentées par un
rendez-vous — pour ne pas doubler la même échéance dans les vues Jour/
Semaine/Mois, qui affichent les deux ensemble. Mais la vue Todo, elle,
n'affiche aucun rendez-vous : une liste ainsi exclue n'avait donc plus nulle
part où apparaître. Le calendrier calcule maintenant deux ensembles distincts
— les listes non représentées par un événement pour les grilles, toutes les
listes datées pour l'onglet Todo, qui n'a rien avec quoi faire double emploi.

**Sélectionner une todoliste depuis la barre latérale y fait défiler
l'écran.** La liste visée était déjà mise en avant d'une bordure à
l'arrivée sur Mes listes, mais rien ne l'amenait à l'écran : sur une liste de
todolistes assez longue pour déborder, la carte mise en avant restait hors
champ. `ListsBoard` mesure désormais la carte visée par rapport au
défilement de l'écran (`measureLayout`, indépendant du nombre de vues
intermédiaires) et y défile une fois, à l'arrivée.

**Mes listes et la vue Todo du calendrier se resserrent, sur grand écran
seulement.** Paddings de carte et espacements entre listes diminuent d'un
cran quand `useBreakpoint()` rend `"expanded"`. Les rangées cochables
(`TaskRow`, `TaskListEditor`) gardent leur hauteur plancher de 44 pt partout
— c'est l'invariant tactile du projet (200-app.md), pas un simple choix de
densité — le resserrement ne touche donc qu'à ce qui les entoure. Sur
téléphone, l'espacement ne change pas : la marge au doigt reste ce qu'elle
était.

**Déplacer un rendez-vous lié à une todoliste met à jour son échéance.**
Signalé en usage réel : « la date d'une todoliste ne se met pas à jour quand
on la modifie depuis le calendrier ». Le circuit direct
(`TaskListDetailDialog` → « Modifier » → `TaskListDialog`) a été relu de bout
en bout sans y trouver de défaut — le geste en cause était en réalité la
fiche du _rendez-vous_ d'une liste déjà pourvue d'un créneau (« Bloquer le
créneau » accepté, cf. point précédent) : `domain/calendar` ne touchait
jamais `task_lists`, les deux dates vivaient donc de façon indépendante dès
qu'on déplaçait l'une des deux depuis sa propre fiche. `CalendarService`
reçoit désormais aussi `ITaskRepository` — geste délibérément signalé plutôt
que tranché seul, c'est le seul endroit du projet où un service `domain/` en
consulte directement un autre plutôt que de passer par `feature/`, la
composition résidant normalement là. `update()` retrouve, après avoir écrit
le rendez-vous, la todoliste dont `event_id` le désigne (`findByEventId`,
au plus une par rendez-vous) et lui applique la même date — silencieusement
quand aucune liste n'y est rattachée, ce qui couvre l'immense majorité des
événements. Reste délibérément hors périmètre : le sens inverse (modifier la
liste déplacerait le rendez-vous) n'a pas été demandé et n'est pas construit
ici ; la suppression d'un rendez-vous lié, elle, ne détache pas encore
`task_lists.event_id`, dette préexistante et distincte de ce point.

Dernière mise à jour : **7 septembre 2026** — un message peut désormais se
dicter dans la conversation, les réponses de l'assistant peuvent s'écouter à
voix haute, une todoliste datée pose désormais un créneau journée entière
plutôt qu'un rendez-vous à heure fixe, pastille de non-lu sur les
conversations, réglage « bandeau uni », section « Discussions et tâches »
dans la barre latérale, trois ajustements du calendrier (clic sur un jour,
détail d'un événement, détail d'une todoliste), et les issues #17, #18 et
#20 qui se referment.

**Un message peut désormais se dicter dans la conversation, au même titre
qu'un message tapé.** Second étage de l'issue #25 (§12.3, A.12), après la
lecture à voix haute des réponses. Un bouton micro dans `Composer` démarre
une reconnaissance vocale (`expo-speech-recognition`, service natif du
téléphone ou du navigateur — choix provisoire, l'arbitrage formel avec
Antonin reste ouvert) et complète le brouillon au fil de ce qui est reconnu,
sans effacer ce qui était déjà tapé. `inputMode` — jusqu'ici figé à `"text"`
dans `use-conversation-thread.ts` — porte enfin l'origine réelle du message
envoyé, jusqu'en base ; un caractère retapé au clavier y ramène aussitôt, un
message qu'on a soi-même corrigé n'étant plus fidèlement ce qui a été dit.
Le geste est disponible partout où `Composer` l'est déjà, canal permanent et
onboarding compris — c'est la même saisie (§12.3, « une porte d'entrée, pas
un mode »). Reste hors de portée : le tout premier message envoyé depuis
l'écran d'accueil (avant l'ouverture du fil) part toujours en `"text"`,
faute de faire voyager `inputMode` jusqu'à la conversation qui naît avec lui.

**Les réponses de l'assistant peuvent désormais s'écouter à voix haute.**
Premier étage de l'issue #25 (§12.3, A.12) : un bouton « Écouter » apparaît au
survol de chaque réponse dans `MessageRow`, à côté de Copier — le geste manuel
plutôt qu'une lecture automatique, pour rester sur le périmètre le plus simple
avant d'attaquer la dictée. `useSpeech` (`features/conversation/hooks`) pilote
`expo-speech` : un seul message se lit à la fois, démarrer une lecture coupe la
précédente au lieu de l'empiler en file. Le Markdown est aplati en texte
continu avant d'être donné à la synthèse (`markdownToSpeech`, dans
`shared/lib/markdown.ts`) — lu tel quel, il ferait prononcer les astérisques
d'un gras et l'URL entière d'un lien. Reste la dictée (STT) : le service
(natif ou tiers) n'est pas tranché avec Antonin, et le natif sert de défaut
pour ne pas bloquer la suite.

Dernière mise à jour : **7 septembre 2026** — une todoliste datée pose
désormais un créneau journée entière plutôt qu'un rendez-vous à heure fixe,
pastille de non-lu sur les conversations, réglage « bandeau uni », section
« Discussions et tâches » dans la barre latérale, trois ajustements du
calendrier (clic sur un jour, détail d'un événement, détail d'une todoliste),
et les issues #17, #18 et #20 qui se referment.

**Une todoliste datée pose désormais un créneau journée entière, jamais un
rendez-vous à heure fixe.** Signalé en usage réel : un événement créé par
l'assistant n'était jamais journée entière et semblait commencer à 23h59.
`scheduleTasks` (`feature/assistant`) forçait `allDay: false` sur tout
événement né d'une todoliste acceptée — la seule voie par laquelle l'assistant
pose un rendez-vous, `suggest_recurring_event` restant sans module pour
l'exécuter (A.11). Il pose maintenant systématiquement un créneau journée
entière (`allDay: true`, `endsAt: null`), la même convention que la création
manuelle d'un événement journée entière (`event-form.ts`) : une todoliste date
un jour, jamais un horaire. En cause aussi, `dueAt` n'atterrissait pas
toujours à minuit : le filet déterministe (`parseRelativeDateFr`) ne corrige
que les tournures qu'il reconnaît (« lundi prochain », « dans 3 jours »...),
et pour le reste — dates absolues, tournures non couvertes — le calcul du
modèle restait tel quel ; un LLM laissé libre retombe souvent sur une
convention de « fin de journée » (23h59) plutôt que sur minuit, malgré la
consigne qui le demande. `withCorrectedDueDates` ramène désormais
systématiquement l'heure à minuit dans le fuseau du profil, que l'expression
source soit reconnue ou non ; `extractTaskList` (geste explicite
« convertis en todoliste ») passe maintenant par ce même filet, qu'il
court-circuitait jusqu'ici.
Dernière mise à jour : **7 septembre 2026** — le rangement d'une conversation
peut désormais être revu après coup et un nouveau dossier peut naître en
sous-dossier d'un dossier existant, pastille de non-lu sur les conversations,
réglage « bandeau uni », section « Discussions et tâches » dans la barre
latérale, trois ajustements du calendrier (clic sur un jour, détail d'un
événement, détail d'une todoliste), et les issues #17, #18 et #20 qui se
referment.

**Le rangement d'une conversation peut être revu après coup, et un nouveau
dossier peut naître comme sous-dossier d'un dossier existant.** Signalé en
retour d'un rangement fait en conditions réelles : demander explicitement un
sous-dossier ou un déplacement n'aboutissait qu'à une promesse non tenue de
l'assistant. En cause, `suggest_folders` disparaissait du jeu d'outils dès la
conversation classée une première fois — l'outil reste désormais disponible
tant que `folderOrganization` est actif, mais la consigne l'engage à ne s'en
resservir que si l'utilisateur le demande explicitement (proposer de soi-même
de revoir un rangement déjà fait resterait intrusif, §12.1) et lui indique le
rangement actuel, puisque l'appel remplace l'ensemble plutôt que d'y ajouter
(§5.2, A.1). Le nouveau dossier proposé (`newFolders`, qui remplace
`newFolderNames`) porte en outre un `parent` optionnel, vérifié comme
n'importe quel dossier repris dans la proposition (identifiant et nom
recopiés de la même ligne), pour se poser en sous-dossier plutôt qu'à la
racine — un parent halluciné ou supprimé entre-temps n'empêche pas la
création, le dossier naît alors à la racine.

**Pastille de non-lu sur les conversations**, hors cahier des charges. Un
compteur de messages assistant reçus depuis la dernière ouverture s'affiche à
droite de chaque conversation — canal Jean-Claude compris — et un « ? »
remplace le chiffre quand une question de l'assistant reste sans réponse
malgré une ouverture déjà faite (0 message non lu au sens strict). Maintenu
par trigger Postgres sur l'insertion d'un message plutôt que recalculé à la
lecture : la liste des conversations se recharge à chaque ouverture de la
barre latérale, un agrégat par conversation y coûterait une jointure. Limite
connue et consignée dans la migration : une correction ou une reprise de tour
supprime des messages assistant déjà comptés sans décrémenter le compteur, le
trigger ne réagissant qu'à l'insertion — sans conséquence en pratique, les
deux gestes supposant la conversation déjà ouverte, et `markRead` la remet
alors à zéro dans le même geste.

**Réglage « bandeau uni »**, hors cahier des charges, demandé directement.
Une option dans Réglages > Apparence bascule le bandeau du haut sur un fond
neutre plutôt que la couleur d'assistant adoucie ; les autres usages de cette
teinte (bulles de conversation, carte de question, événements du calendrier)
ne sont pas concernés.

**La section « Discussions et tâches » regroupe le canal Jean-Claude et
toutes les conversations, dossiers ou non.** Le canal passe à une ligne,
cadre et icône réduits ; il restait déjà non déplaçable. La liste à plat
n'est pas une duplication : une conversation déjà rangée dans un dossier
reste visible à la fois ici et sous « Dossiers », même principe que le
rangement multi-dossiers du §5.2. Point relevé au passage : un commit poussé
directement sur `dev` juste avant cette demande avait renommé la section
« Sans dossier » en « Discussions et tâches » sans en changer le contenu —
elle retrouve ici son nom, qui distingue toujours les conversations non
classées sous « Dossiers ».

**Trois ajustements du calendrier, à la manière de Google Calendar (§4.2).**
Un clic sur un jour en vue mois ouvre directement la création d'un
événement, jusque-là réservée aux créneaux vides des vues jour et semaine.
Point non tranché, à surveiller : la sélection du jour, qui alimente aussi
l'agenda affiché sous la grille, se fait toujours au même geste — sur
téléphone, un simple survol de plusieurs jours sans intention de créer ouvre
donc désormais une modale à chaque fois, un usage que la vue mois `compact`
permettait jusqu'ici. Un clic sur un événement ou sur une todoliste échue
ouvre par ailleurs un **détail** — titre, date, notes, icônes supprimer et
modifier — avant tout formulaire de modification, qui reste un pas de plus.
`Modal` (`shared/ui`) gagne au passage un slot d'icônes de bandeau
(`headerActions`), qu'un futur usage pourra réemployer.

Auparavant le même jour : l'issue #18 se referme à son tour : le parsing des
dates relatives passe d'un calcul confié au seul modèle à un filet de
sécurité déterministe sur les tournures les plus sujettes à erreur.

**#18 est close.** `chrono-node`, la bibliothèque candidate évidente pour ce
point, a été testée et rejetée : son support français calcule un jour de la
semaine déjà passé au lieu du prochain (« vendredi » un lundi y renvoie le
vendredi précédent), et ne reconnaît aucun week-end — moins fiable que le
modèle lui-même sur exactement les cas qui comptent.

`core/relative-date.ts` couvre à la place un nombre restreint de tournures
fréquentes et non ambiguës (jours de semaine — toujours la prochaine
occurrence, jamais celle déjà passée —, demain/après-demain, dans N
jours/semaines, ce/le week-end, avant le week-end), en filet de sécurité et
non en remplacement : `suggest_task_list` gagne un champ `dueAtText` où le
modèle recopie l'expression source, et le serveur ne corrige `dueAt` que si
le motif est reconnu avec certitude — sinon le calcul du modèle reste
inchangé, sans régression possible sur ce qu'il faisait déjà correctement.
Les conversions de fuseau horaire (DST compris) sortent au passage de
`feature/search/date-range.ts`, qui en avait besoin seul jusqu'ici, vers
`core/timezone.ts` — un second appelant justifiait de ne plus les dupliquer.

Auparavant le même jour : les issues #17 et #20 se referment également —
conversion d'une conversation en todoliste à la demande, avec édition avant
validation ; et l'assistant sait prendre les devants même hors sujet
actionnable explicite. La durée par défaut sur les créneaux nés d'une
échéance, elle, faisait partie du premier lot de #18 — le point qui restait
ouvert ce jour-là.

**#17 est close.** Deux points restaient ouverts depuis le suivi du 2
septembre : la conversion à la demande, et l'édition avant validation. Le
premier prend la forme d'une entrée « Convertir en todoliste » dans le menu
contextuel d'une conversation (`POST /conversations/:id/extract-task-list`) :
un appel dédié au modèle, hors du tour de dialogue ordinaire, où un seul outil
(`suggest_task_list`) lui est proposé sur l'historique du fil — rien n'est
écrit dans la conversation, seule la carte de proposition apparaît, comme pour
n'importe quelle suggestion spontanée. La consigne système reçoit en
complément une phrase dédiée : une demande tapée explicitement (« convertis ça
en todoliste ») doit être honorée tout de suite plutôt que décrite en texte.

Le second point ouvre l'édition dans la carte elle-même — titres de liste et
lignes deviennent des champs de texte, chacun avec sa croix de suppression —
sans reprendre l'éditeur complet des todolistes réelles (`TaskListEditor`), qui
suppose une liste déjà en base. Le brouillon reste local à la carte, comme le
veut le §12.1 : rien n'est créé avant validation, et `ResolveSuggestion` porte
désormais `taskListEdits`, du même schéma que la proposition d'origine — ici,
contrairement au rangement, ce n'est pas un sous-ensemble de ce qui a été
proposé : l'utilisateur corrige un titre, il ne se contente pas d'en écarter
une partie.

Auparavant le même jour : **#20 est close.** Le mécanisme technique — outils
de suggestion déjà exposés sur les conversations classiques, périmètre
`assistant_scope` déjà appliqué aux deux registres — existait depuis les
premières suggestions proactives. Le trou tenait à la consigne : hors du canal
permanent, elle ne poussait qu'à repérer un contenu déjà actionnable (une
liste, une échéance), jamais à déduire une suite après une réponse sur un
sujet qui n'en a lui-même rien — l'exemple des assureurs de l'issue. Une
instruction complète désormais le prompt classique, calibrée pour rester
suggestive (§12.1) : réservée aux suites concrètes et nettes, silencieuse dans
le doute plutôt que systématique à chaque réponse.

Auparavant le même jour : **#18 avance** sur la durée des créneaux, son point
resté ouvert depuis le 3 septembre. Un créneau né d'une todoliste datée posait
jusqu'ici `endsAt: null` — choix assumé à l'époque, pour ne pas prêter à
l'utilisateur une durée qu'il n'avait jamais donnée. Il prend désormais la
même durée que celle que le calendrier simulait déjà à l'affichage pour un
événement sans fin (une heure) : rien ne change à ce qui se voit, mais le
créneau porte enfin une fin exploitable. Le parsing des dates relatives, lui,
reste volontairement confié au modèle plutôt qu'à un parseur déterministe —
fonctionnel d'après ce suivi, et le sprint ne justifie pas la charge d'un
second mécanisme pour un gain marginal ; ce point reste donc consigné comme
dette assumée plutôt que traité.

Auparavant le 4 septembre 2026 : l'onglet Todoliste devient Mes listes, sa vue
Semaine rejoint le calendrier comme cinquième vue « Todo » (mois complet), et
un raccourci direct vers l'avis général rejoint la barre latérale.

**Mes listes perd sa vue Semaine, reprise dans le calendrier.** L'onglet
Todoliste s'appelle désormais Mes listes, et n'a plus qu'une lecture — la
liste, tous dossiers confondus, loupe désormais alignée sur la même ligne que
les dossiers plutôt que reléguée au-dessus. Sa vue Semaine (un bloc par jour,
par moment, pour les todolistes échues) faisait doublon avec celle du
calendrier : elle est retirée d'ici. Le segment « Todo » du calendrier, qui
n'était jusque-là qu'un raccourci vers cet onglet, en devient la cinquième vue
à part entière — élargie au mois entier plutôt que bornée à sept jours, avec
une bascule qui masque par défaut les jours sans liste (sur un mois complet,
les afficher tous aurait noyé ceux qui comptent). Comme le reste du
calendrier, cette vue reste en lecture seule : l'appui sur une liste ouvre Mes
listes, qui en reste l'écran d'édition (même principe déjà posé par
`DayAgenda`).

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
propositions _en attente_, pas celles déjà acceptées. `suggest_task_list_items` et la
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

| Réf.         | Exigence                                                | Statut | Note                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------ | ------------------------------------------------------- | :----: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| §5.1         | Moteur IA Claude en V1                                  |   ✅   | Défaut serveur ramené à `mistral/mistral-medium-3.5` (8 sept.) : `anthropic/claude-opus-5`, hors catalogue utilisateur, laissait le sélecteur des réglages sans rien coché tant que rien n'était choisi. Claude reste joignable via `LLM_MODEL`, hors défaut                                                                                                                              |
| §5.1         | Abstraction multi-modèle                                |   ✅   | Port `LlmProvider` + Vercel AI Gateway. **Changer de modèle = changer `LLM_MODEL`**, zéro ligne de code                                                                                                                                                                                                                                                                                   |
| §5.1         | Timeouts, quotas et erreurs                             |   ✅   | Timeout de 60 s (15 s au premier jeton en flux) ; 429 et 402 distingués d'une panne, testés                                                                                                                                                                                                                                                                                               |
| §5.1         | Choix du modèle par l'utilisateur                       |   ✅   | Catalogue de trois modèles dans `@jc/domain`, choisi dans les réglages et porté par `profiles.llm_model`. `LLM_MODEL` devient le repli, servi tant que rien n'est choisi                                                                                                                                                                                                                  |
| §5.1         | Indication « souverain » ou non                         |   ✅   | `isSovereign` déduit de l'éditeur du modèle, exposé par `/api/health`                                                                                                                                                                                                                                                                                                                     |
| §5.2         | Relation conversation ↔ dossiers plusieurs-à-plusieurs  |   ✅   | Table `conversation_folders`                                                                                                                                                                                                                                                                                                                                                              |
| §5.3         | API commune web + mobile                                |   ✅   | REST sur Hono, arbitrage consigné dans `docs/ARCHITECTURE.md` ; client `@jc/api-client` partagé, l'app ne touche jamais la base directement                                                                                                                                                                                                                                               |
| §4.1         | Design responsive, priorité mobile                      |   🟡   | Fil de conversation borné en largeur, cibles tactiles 44 pt, thèmes clair et sombre — ce dernier désormais choisi par l'utilisateur. Réponses du modèle rendues en Markdown (titres, listes, tableaux, liens) ; barre latérale redimensionnable au geste ; calendrier divergent par point de rupture, pastilles et liste du jour en `compact`, barre d'outils sur deux lignes sous 768 pt |
| §4.4         | React Native                                            |   ✅   | Expo SDK 57, Expo Router, React 19                                                                                                                                                                                                                                                                                                                                                        |
| §8           | Postgres portable, migration UE possible                |   ✅   | Aucune extension propriétaire                                                                                                                                                                                                                                                                                                                                                             |
| §8 / §13.4.6 | Droit à l'effacement — suppression de son propre compte |   ✅   | `DELETE /api/me`, confirmation dans les réglages. `admin.auth.admin.deleteUser` sur `auth.users` ; la cascade SQL déjà en place efface profil, dossiers, conversations, messages, todolistes, calendrier, suggestions et feedback. Immédiat, sans délai de grâce                                                                                                                          |
| §8           | **Créer le projet Supabase en région UE**               |   ⬜   | **À faire avant tout remplissage de données**                                                                                                                                                                                                                                                                                                                                             |
| §10          | Repo structuré et documenté                             |   ✅   | `README.md`, `docs/ARCHITECTURE.md`, ce fichier                                                                                                                                                                                                                                                                                                                                           |

---

## Authentification (§6)

| Réf.        | Point                                            | Statut | Note                                                                                                                                                                                                                                                                                  |
| ----------- | ------------------------------------------------ | :----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| §6.1        | E-mail + code à usage unique                     |   ✅   | Parcours complet : envoi, saisie, vérification automatique, renvoi avec délai d'attente, erreurs traduites. Gabarit d'e-mail forcé sur `{{ .Token }}`                                                                                                                                 |
| §6.1        | Règles de validation partagées                   |   ✅   | `packages/domain/src/auth/auth.schema.ts`, 14 tests. Plus aucune règle de saisie dans l'écran                                                                                                                                                                                         |
| §6.1        | Gabarit d'e-mail à pousser sur le projet hébergé |   ⬜   | `npx supabase config push` — **tant que ce n'est pas fait, le projet hébergé envoie un lien et non un code**                                                                                                                                                                          |
| §6.2        | 2FA par SMS                                      |   ⬜   | Étape 2. Si non fait dans le sprint → priorité immédiate du backlog restant                                                                                                                                                                                                           |
| §6.3 / A.13 | Onboarding conversationnel                       |   🟡   | Accueil mené dans le canal permanent au premier accès : questions ouvertes ou à réponses proposées (`ask_question`), mémoire écrite par `finish_onboarding`, lien « Passer ». Vocal compris, même `Composer` que le reste (#25) ; reste à arbitrer le service de dictée avec Antonin. |

---

## Annexe A — backlog fonctionnel

| Réf. | Point                                                 | Statut | Note                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---- | ----------------------------------------------------- | :----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A.0  | Regroupement Perso / Pro                              |   🔵   | Colonne `category` posée, non exploitée — volontaire (option à activer plus tard)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| A.1  | Conversations multi-dossiers, rangement matriciel     |   ✅   | Schéma, `PUT /conversations/:id/folders`, rangement manuel par cases à cocher multiples, glisser-déposer d'une conversation sur un dossier (ajouter ou déplacer, au choix) **et d'un dossier dans un autre**, et proposition de rangement par l'assistant pour un fil non classé                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| A.2  | Conversion conversation → todoliste                   |   ✅   | `domain/task` et `/api/tasks` écrits : listes et tâches se créent, se cochent, se datent et se rangent. Onglet Mes listes (une seule lecture, filtrable par dossier, cherchable à la loupe ; la lecture par semaine vit désormais dans le calendrier, vue Todo — mois complet), todolistes visibles dans leur dossier, cartes repliables portant leurs actions dans un menu. Le contenu s'édite comme un texte — une ligne par tâche, deux niveaux d'indentation, réécrit en un appel. Listes groupées par dossier dans l'agenda du calendrier, où « + Tâches » en ouvre une sur le jour affiché. L'assistant propose les listes de lui-même et les crée d'un geste, rangées dans le dossier de la conversation ; l'utilisateur peut aussi la demander (menu contextuel ou message tapé) et corriger les tâches extraites avant validation (#17) |
| A.3  | Détection de tâches datées                            |   ✅   | `dueAt` se saisit et se lit de bout en bout — semaine, calendrier — et se déduit de la conversation. L'échéance porte sur la **liste** et non sur ses lignes : le modèle date la liste qu'il propose, puis une seconde proposition bloque un créneau d'agenda par liste datée, avec une durée par défaut plutôt que sans fin. Le calcul de date relative du modèle est doublé d'un filet de sécurité déterministe sur les tournures les plus sujettes à erreur — jours de semaine, demain/après-demain, dans N jours/semaines, week-end (#18)                                                                                                                                                                                                                                                                                                    |
| A.4  | Sous-dossiers automatiques de projet                  |   🟡   | L'assistant propose une arborescence (`suggest_project_folders`), l'utilisateur la crée d'un geste — consigne de détection reprise, avec un critère explicite (#19). Une todoliste acceptée rejoint son sous-dossier typé (ACHAT, TODO) quand il existe, au lieu du dossier de projet. Restent PRENDRE RDV — `calendar_events` ne porte aucun dossier — et IDÉE, faute de concept de note dans le produit                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| A.5  | Gestion multi-dimensionnelle d'un projet              |   ⬜   | Phase C ou au-delà                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| A.6  | Recherche avancée par filtres                         |   ✅   | `feature/search` et `GET /api/search` : mot-clé plein texte sur les titres **et** le contenu des messages, filtres par dossiers, par période (6 raccourcis) ou par dates saisies, conversations archivées incluses au choix                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| A.7  | Adaptation à la logique de rangement de l'utilisateur |   🔵   | Colonne `source` désormais réellement alimentée par les rangements acceptés — la matière première est capturée, rien ne l'exploite encore                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| A.8  | Assistant proactif                                    |   🟡   | `feature/assistant` écrit : les appels d'outils deviennent des propositions acceptées ou ignorées d'un geste, dont le fil garde la trace une fois tranchées — et que le modèle relit au tour suivant, pour ne reproposer ni ce qui a été écarté ni ce qui a été accepté. Natures branchées : dossiers de projet, rangement, todolistes, complétion **et modification** d'une todoliste existante (cocher, renommer), créneaux, échéance, rendez-vous récurrent (`suggest_recurring_event` → `create_recurring_event`), **plusieurs rendez-vous ponctuels en un seul geste** (`suggest_events` → `create_events`). Reste l'expansion des occurrences (A.11)                                                                                                                                                                                                                                                                              |
| A.9  | Multi-plateforme                                      |   🟡   | Web / iOS / Android depuis un codebase, fil de conversation en flux compris. Desktop (Tauri) en Phase C                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| A.10 | Bornage du mode assistant                             |   ✅   | Canal unique, jeu d'outils propre au canal, bascule hors périmètre proposée puis validée par l'utilisateur (et retirée du contexte une fois faite), et périmètre `assistant_scope` appliqué côté serveur. Interrupteurs des cinq capacités dans la page Réglages. Le canal reçoit l'agenda des 7 jours et les dossiers existants — il peut enfin répondre sur le premier de ses trois sujets ; délivrance des rappels → #26                                                                                                                                                                                                                                                                                                                                                                                                                      |
| A.11 | Rendez-vous récurrents + alerte                       |   🔵   | `domain/calendar` et les quatre vues écrits : `rrule` et `reminder_minutes_before` se saisissent et se stockent. Restent l'expansion des occurrences et la délivrance des rappels                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| A.12 | Interaction vocale bout en bout                       |   🟡   | Lecture à voix haute des réponses et dictée d'un message, toutes deux sur `expo-speech` / `expo-speech-recognition` (natif). Reste l'arbitrage du service avec Antonin — choix provisoire pour ne pas bloquer le sprint.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| A.13 | Onboarding conversationnel                            |   🟡   | Voir §6.3 — fait en texte et en vocal, le même `Composer` que le reste de la conversation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

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

| Sujet                                             | Réf.    | Interlocuteur                                                                                                                                                                                                        |
| ------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Région d'hébergement Supabase (UE recommandé)     | §8      | Antonin                                                                                                                                                                                                              |
| Service de reconnaissance vocale (natif ou tiers) | §12.3   | Antonin — choix provisoire du natif en attendant, budget / latence à trancher                                                                                                                                        |
| Date réelle du rendez-vous de cadrage             | §0      | Yann — le document signale l'incohérence du « 31 septembre »                                                                                                                                                         |
| **Profondeur d'arborescence portée de 2 à 5**     | §3      | Yann — écart assumé au cahier des charges, à valider                                                                                                                                                                 |
| Jeu d'icônes de la navigation                     | §4.2    | — lucide-react-native en place (défaut react-native-reusables)                                                                                                                                                       |
| Distinguer dossier et « projet »                  | A.4/A.5 | Yann — un projet gagnerait à être un format de dossier à part, avec mémoire globale et structure propre, plutôt qu'un dossier ordinaire portant des sous-dossiers typés. Piste soulevée pendant #19, non implémentée |

## Points nécessitant un A/B testing humain (§4.3)

| Sujet                                      | Ce qui a été tranché, faute de mieux                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Actions d'un dossier et d'une conversation | Les deux chemins cohabitent : menu contextuel au clic droit (appui long au doigt) **et** bouton « … » au survol sur web, ouvrant le même menu. Les applications de référence ne convergent pas — ChatGPT et Claude posent un menu au survol, Notion et Apple Notes un menu contextuel (§4.2 non concluant) — mais ni le survol ni le clic droit n'existant au doigt, il fallait de toute façon les deux |
| Lisibilité de la barre au 5e niveau        | Chaque niveau ajoute un retrait et un filet vertical. Au 5e, la barre est très entamée à gauche et les libellés se tronquent. L'aplatissement a été écarté — il perdrait la filiation — mais le point demande à être vu avec un vrai volume de dossiers                                                                                                                                                 |

## Dette technique connue

| Point                                                    | Détail                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pagination remontante du fil absente                     | Le fil charge les 50 derniers messages ; au-delà, l'historique n'est pas atteignable. `nextCursor` est déjà renvoyé par l'API                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Rappels du matin non délivrés                            | La capacité `morningReminders` est réglable et lue, mais aucun planificateur n'existe : l'assistant ne peut rien proposer qu'on saurait délivrer (→ #26)                                                                                                                                                                                                                                                                                                                                                                                                                              |
| RDV de projet non rattaché à PRENDRE RDV                 | `calendar_events` ne porte aucun `folder_id`, contrairement à `task_lists` : un rendez-vous créé depuis un projet ne peut pas rejoindre son sous-dossier typé comme le font déjà les todolistes vers ACHAT et TODO (A.4). Demanderait une migration, écartée pour l'itération de #19                                                                                                                                                                                                                                                                                                  |
| Sauvegarde de liste en écrasement                        | `PUT /tasks/:id/items` réécrit la liste entière depuis ce que l'éditeur tient. Deux appareils ouverts sur la même liste se recouvrent donc l'un l'autre — le dernier à écrire gagne. Sans effet à un seul utilisateur, à revoir si l'édition partagée arrive                                                                                                                                                                                                                                                                                                                          |
| Séries récurrentes non déployées                         | Une `rrule` se saisit et se stocke, mais les occurrences ne sont pas calculées : l'événement n'apparaît qu'à son premier créneau. La dépendance `rrule` est déjà au `package.json` de l'API (A.11)                                                                                                                                                                                                                                                                                                                                                                                    |
| Dates saisies au clavier                                 | Le formulaire d'événement demande `JJ/MM/AAAA` et `HH:MM` en texte, faute de sélecteur natif partagé par les trois cibles. Fonctionnel, mais en deçà des références du §4.2                                                                                                                                                                                                                                                                                                                                                                                                           |
| Node ≥ 22.12 requis                                      | Le SDK `ai` est ESM-only et l'API compile en CommonJS : `require(esm)` n'est natif qu'à partir de Node 22.12. `engines` a été relevé en conséquence                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Aucun modèle de repli                                    | `llm-error.ts` distingue proprement 429 et 402, mais il n'y a qu'un `LLM_MODEL` : un quota atteint tue le tour au lieu de basculer sur un second moteur                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Un timeout se présente en panne                          | Les délais de `gateway.provider.ts` (60 s, 15 s au premier jeton) retombent dans le `default` de `toHttpException` : l'utilisateur lit « moteur indisponible » et attend une panne qui n'existe pas                                                                                                                                                                                                                                                                                                                                                                                   |
| Historique ouvert par un tour assistant                  | Le canal commence par le message d'accueil, donc l'historique remis au modèle débute par un tour `assistant`. Toléré ou refusé selon le moteur routé par le Gateway — à couvrir avant de changer `LLM_MODEL`                                                                                                                                                                                                                                                                                                                                                                          |
| Rattrapage de réponse au prix d'un tour                  | Un modèle qui s'en tient à son appel d'outil déclenche un second appel : la réponse arrive, mais l'attente double. La consigne cherche à rendre ce cas rare — reste à mesurer sa fréquence par moteur                                                                                                                                                                                                                                                                                                                                                                                 |
| `suggest_events` parfois incomplet sur plusieurs rdv     | Signalé en usage réel : un message citant plusieurs rendez-vous ponctuels distincts peut ne produire qu'une entrée dans `events` au lieu d'une par rendez-vous, malgré la consigne « un seul appel, une entrée par rendez-vous ». La chaîne outil → suggestion → acceptation gère déjà un tableau de 1 à 8 (testé), donc la perte se joue au moment où le modèle construit l'appel. Consigne renforcée le 10 septembre (comptage explicite + exemple à deux rendez-vous dans `buildSystemPrompt`), sans garantie de correction totale — dépend du moteur routé par le Gateway. À surveiller par moteur, comme la ligne ci-dessus |
| `listPending` sans appelant                              | `ConversationService` lit `listForConversation` et en déduit les propositions en attente. La méthode du Repository n'a plus d'appelant : à retirer, ou à consommer là où la déduction se fait                                                                                                                                                                                                                                                                                                                                                                                         |
| État visuel de la notation par message                   | Le pouce sélectionné n'est pas restauré après un rechargement : la notation n'est pas renvoyée avec les messages aujourd'hui. La donnée est bien persistée (`message_ratings`), seul l'indicateur visuel est local à la session                                                                                                                                                                                                                                                                                                                                                       |
| Pagination des dossiers absente, décision assumée        | `GET /api/folders` rend toujours l'arborescence complète, contrairement aux tâches et aux conversations. `FolderService.getTree()` doit de toute façon recharger tous les dossiers en mémoire pour vérifier profondeur et acyclicité, y compris à l'écriture (`create`/`update`) : paginer la réponse réduirait la taille du JSON renvoyé, pas la charge réelle du serveur, pour un coût de développement réel (reprendre l'agrégation des compteurs par dossier). Aucun compte n'approche aujourd'hui un volume de dossiers qui le justifie — à revisiter si un vrai volume apparaît |
| Compteur de non-lu sur-compte après édition ou reprise   | `unread_count` est incrémenté par trigger à l'insertion d'un message assistant, jamais décrémenté à la suppression. Une correction de message ou une reprise de tour supprime des messages déjà comptés puis en insère de nouveaux : le compteur peut monter sans qu'aucun message ne reste réellement non lu. Sans conséquence observée — ces deux gestes supposent la conversation déjà ouverte, et `markRead` la remet à zéro dans le même geste                                                                                                                                   |
| `--experimental-vm-modules` requis pour `npm test` (API) | `unpdf` charge son moteur PDF.js par un `import()` dynamique interne, y compris depuis son propre build CommonJS — sans ce flag Node, Jest échoue avec `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING_FLAG` dès qu'un test touche réellement `core/pdf-text.ts`. Ajouté au script `test` de `apps/api/package.json`, pas seulement en local : sans lui la CI casserait aussi                                                                                                                                                                                                                 |

Le `.env` racine est chargé par l'API (`ConfigModule`) et par Expo
(`app.config.js` / `metro.config.js`).

## Éléments du cahier des charges non disponibles

Aucun. Les deux maquettes annoncées aux §1 et §4.5 sont dans `models/` —
`maquette-interface-ia.html` (web) et `maquette-interface-mobile.html`. La
barre latérale en reprend la structure : entrée Jean-Claude en tête, bouton
« Nouvelle conversation », « + » d'ajout de dossier sur l'en-tête de section,
groupes de dossiers repliables, « … » dans l'en-tête de conversation.
