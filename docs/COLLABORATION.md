# Espaces d'équipe — spécification

Plusieurs personnes travaillent ensemble dans Jean-Claude : une association, une
petite entreprise. Elles discutent entre elles dans des groupes, façon WhatsApp,
et Jean-Claude y prend part quand il a quelque chose d'utile à apporter.

Les références `§x` et `A.x` renvoient au cahier des charges v1.8 du 24 août 2026.

> **Hors cahier des charges.** Le §1 fixe une V1 mono-utilisateur et demande
> seulement que l'authentification ne bloque pas une ouverture multi-utilisateurs
> ultérieure. Cette fonctionnalité touche le schéma, les RLS et un invariant
> d'architecture : elle doit être validée par Yann avant le premier lot de code.

---

## 1. Décisions

| Sujet            | Décision                                                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Modèle de compte | Chacun garde son compte et son espace personnel, et rejoint un ou plusieurs espaces d'équipe                                          |
| Rôles            | Admin et membre. Le créateur de l'espace en est admin                                                                                 |
| Entrée           | L'admin invite par adresse e-mail. **Aucun e-mail envoyé en V1** : l'invitation attend que la personne se connecte avec cette adresse |
| Discussions      | Groupes nommés uniquement. Un échange à deux se fait par un groupe de deux                                                            |
| Messagerie       | Nom et avatar de l'auteur, non-lus par discussion, indicateur « en train d'écrire »                                                   |
| IA               | Décide seule quand parler (§3). Répond toujours à une mention. Bouton silence par discussion                                          |
| Confidentialité  | Dans un groupe, l'IA ne voit que ce qui appartient à l'espace. Jamais les données personnelles d'un membre                            |
| Temps réel       | Supabase Realtime en lecture seule côté app — exception consignée à l'invariant 3 (§4)                                                |
| Partage          | Dossiers, listes et calendrier partagés retenus, **hors V1**. Le schéma les prévoit sans les livrer                                   |
| Navigation       | Sélecteur d'espace en haut de la barre latérale — aligné sur Slack, Notion et ChatGPT Team (§4.2)                                     |

Vocabulaire d'interface (§13.4.4) : « espace », « conversation », « membre ».
Une conversation d'espace s'appelle `group` dans le code — un second module
`conversation` entrerait en collision avec celui des conversations
personnelles — mais jamais « groupe » à l'écran (décision de Clarisse, 29
septembre). Le mot `workspace` reste lui aussi dans le code.

---

## 2. Parcours utilisateur

**Créer un espace.** Depuis le sélecteur, « Nouvel espace », un nom. La personne
en devient admin.

**Inviter.** L'admin saisit une adresse e-mail. L'invitation est enregistrée,
l'admin prévient la personne par ses propres moyens.

**Rejoindre.** À la connexion, une personne dont l'adresse porte une invitation
en attente voit « Vous êtes invité dans _Association X_ » et accepte ou refuse.
Sans compte, elle en crée un par le parcours OTP habituel : l'invitation est
retrouvée par l'adresse.

**Discuter.** Dans un espace, un membre crée un groupe, lui donne un nom et
coche les membres. Les messages arrivent en temps réel chez tous les membres du
groupe.

**Quitter, retirer.** Un membre quitte un espace ; l'admin en retire un. Ses
messages restent, signés de son nom. Le dernier admin ne peut pas partir sans
avoir nommé un autre admin.

---

## 3. Jean-Claude dans un groupe

### Quand il parle

Toujours quand on le mentionne (`@Jean-Claude`). De lui-même dans quatre cas :

1. une question posée au groupe reste sans réponse et il peut y répondre ;
2. un membre affirme une information inexacte (date, chiffre, fait déjà donné
   dans le fil) ;
3. le groupe prend une décision ou se répartit du travail ;
4. la discussion tourne en rond : il propose une synthèse des positions.

Le bouton silence d'une discussion le limite aux mentions.

### Comment il décide

Faire lire chaque message au modèle principal coûterait un appel par message de
groupe. La décision est donc séparée de la réponse :

1. **Attente d'une pause.** Une IA qui répond au milieu d'un échange rapide
   devient vite pénible. Après chaque message, l'API attend quelques secondes ;
   si un autre message est arrivé entre-temps, elle abandonne — l'évaluation de
   ce message-là prendra le relais.
2. **Décision.** Un petit modèle peu coûteux lit la fin du fil et répond par un
   verdict structuré : intervenir ou non, et pour quel cas des quatre.
3. **Réponse.** Seulement si le verdict est positif, le modèle principal
   rédige l'intervention.

Une mention court-circuite les étapes 1 et 2.

L'attente s'appuie sur l'exécution après réponse de Vercel (`waitUntil`), dans
la limite de `maxDuration` (60 s, `apps/api/vercel.json`). Mécanisme à valider
au lot 4 : l'API n'a aujourd'hui aucun traitement différé.

Les deux appels passent par `llm` et l'interface `LlmProvider` (invariant 1).

### Ce qu'il voit

Le fil du groupe, et plus tard les dossiers, listes et calendrier de l'espace.
Jamais le canal permanent, les conversations, les listes ni le calendrier
personnels d'un membre : il ne doit pas pouvoir citer devant l'équipe ce qu'un
membre lui a confié en privé. Le prompt de groupe est donc construit à part de
`buildSystemPrompt`, sans aucune de ses sources personnelles.

### Ce qu'il fait

Il parle ; il n'agit pas (§12.1). Une décision ou une répartition du travail
détectée devient une suggestion en attente, que les membres valident.

---

## 4. Exception à l'invariant 3 : le temps réel

L'invariant 3 réserve Supabase côté client à l'authentification. Une messagerie
de groupe exige que les messages des autres arrivent sans rechargement.

**Décision.** L'app s'abonne à Supabase Realtime pour **recevoir** :

- les nouveaux messages d'un groupe, par `postgres_changes` sur `messages`
  filtré par `conversation_id` — les RLS s'appliquent, un non-membre ne reçoit
  rien ;
- l'indicateur « en train d'écrire », par un canal _broadcast_ privé par
  discussion. Il transite par Realtime sans rien écrire en base.

**Ce qui ne change pas.** Toute écriture en base passe par l'API. L'abonnement
ne sert qu'à savoir qu'il faut afficher un message ; l'envoi reste
`api.conversations.sendMessage`.

**Alternatives écartées.** Interroger l'API toutes les 2 à 3 secondes laisse
l'invariant intact, mais la latence se voit et le nombre d'appels grimpe avec
chaque membre. Un flux SSE servi par l'API bute sur la durée limitée des
fonctions Vercel.

À reporter dans `docs/ARCHITECTURE.md` et dans l'invariant 3 de `CLAUDE.md` au
lot 3.

---

## 5. Modèle de données

Proposition, à affiner au lot 1 avec le skill `supabase-migration`.

```
workspaces              id · name · created_by · created_at
workspace_members       workspace_id · user_id · role ('admin' | 'member') · joined_at
workspace_invitations   id · workspace_id · email · invited_by · created_at
                        · accepted_at · declined_at
conversation_members    conversation_id · user_id · unread_count · last_read_at · joined_at

conversations  + workspace_id (null = personnel)
               + kind 'group'
               + ai_muted boolean
```

**Pourquoi `conversation_members`.** Aujourd'hui `unread_count` et
`pending_question` vivent sur `conversations`, parce qu'une conversation n'a
qu'un lecteur. Dans un groupe, chaque membre a ses propres non-lus. Le trigger
`touch_conversation_on_message` incrémente alors le compteur de chaque membre
sauf l'auteur.

**Auteur des messages.** `messages.user_id` porte déjà l'auteur d'un message
`user`. Pour un message `assistant` dans un groupe, il porte le membre dont le
message a déclenché l'intervention — c'est aussi à lui qu'est imputé l'appel
dans `llm_rate_limits`.

**Contraintes.** `kind = 'group'` si et seulement si `workspace_id` est
renseigné. Une invitation en attente au plus par couple espace-adresse, adresse
comparée sans casse.

**RLS.** Les policies actuelles reposent toutes sur `user_id = auth.uid()`.
Pour les groupes, la lecture d'une conversation et de ses messages passe par
l'appartenance à `conversation_members`, via une fonction `security definer`
pour éviter la récursion entre policies. Les données personnelles gardent leur
policy actuelle, inchangée.

**Invariant 4.** Un groupe peut, plus tard, être rangé dans un dossier de
l'espace : toujours par `conversation_folders`, jamais par une colonne
`folder_id`.

### Livré au lot 1

Migration `supabase/migrations/20260929150000_workspaces.sql`.

- **Accès.** Sept fonctions `security definer` qui ne répondent que pour
  l'appelant : `is_workspace_member`, `is_workspace_admin`,
  `has_pending_invitation`, `can_join_as_founder`, `is_conversation_member`,
  `can_access_conversation`, `can_add_to_group`.
- **Deux policies restrictives.** Elles s'ajoutent aux policies existantes au
  lieu de les réécrire. Sur `conversations`, un groupe n'est lisible que de
  ses membres, créateur compris. Sur `messages`, on n'écrit que dans une
  conversation personnelle possédée ou un groupe dont on est membre.
- **Faille corrigée au passage.** `messages_owner_access` ne vérifiait que
  l'auteur. Elle laissait donc écrire dans la conversation d'un autre compte
  pour peu qu'on en connaisse l'identifiant.
- **Entrée dans un espace.** On n'y entre que par soi-même : comme fondateur
  tant que l'espace est vide, ou en acceptant une invitation. La personne
  invitée ne peut modifier que `accepted_at` et `declined_at` (privilège de
  colonne), sans quoi elle pourrait déplacer son invitation vers un autre
  espace.
- **Noms des membres.** `workspace_member_profiles(workspace)` rend le nom
  affiché, l'adresse et le rôle, jamais le reste du profil : la ligne porte la
  mémoire de l'utilisateur. L'adresse a été ajoutée au lot 2, dans la même
  migration, encore appliquée nulle part (voir « Livré au lot 2 »).
- **Invariants structurels en trigger.** Quitter un espace retire de tous ses
  groupes. Une conversation ne change pas d'espace. Les non-lus de groupe sont
  comptés par membre.
- **Pas de policy `delete` sur `workspaces`**, en attendant la question 3 du §9.

**Contraintes pour l'API (lots 2 et 3).**

- Créer un espace ou un groupe se fait sans `insert … returning` : la ligne
  n'est lisible qu'une fois le créateur inscrit comme membre. L'identifiant
  est fourni par l'API, comme pour les retours (`feedback`).
- Les requêtes personnelles ne filtrent pas par `user_id` et s'en remettent
  à la RLS. Or un membre lit désormais les groupes. La liste latérale et la
  recherche les écartent déjà (`kind = 'chat'`). En revanche, les routes
  `/conversations/:id` lisent par identifiant seul : elles doivent refuser un
  groupe. Sinon un membre pourrait y écrire par le tour personnel, qui remet
  au modèle son contexte privé.

**Vérification.** Toutes les migrations rejouées sur un Postgres 16 vierge.
Un scénario à trois comptes (fondatrice, invité, personne extérieure) passe
ses 46 vérifications, dont le comportement inchangé des conversations
personnelles. `database.types.ts` n'est pas régénéré : `npm run db:types`
demande une instance Supabase locale, absente de l'environnement de
développement.

### Limites connues

- **Suppression du compte du créateur.** `conversations.user_id` est en
  `on delete cascade` : supprimer le compte du créateur d'un groupe supprime
  le groupe pour tous. À traiter avant une ouverture réelle, par transfert du
  groupe ou par un `user_id` rendu facultatif pour les groupes.
- **Suppression du compte du dernier admin.** L'espace reste alors sans
  admin : plus personne ne peut inviter. La règle « le dernier admin ne part
  pas » tient dans le service, pas face à une suppression de compte.
- **Pièces jointes de groupe.** `message_attachments` reste lisible de son
  seul propriétaire. Une pièce jointe envoyée dans un groupe ne serait pas
  visible des autres membres. Hors V1.

### Livré au lot 2

Module `apps/api/src/domain/workspace/`, schémas dans
`packages/domain/src/workspace/`, section `workspaces` de `@jc/api-client`.

| Route                                                  | Qui                            |
| ------------------------------------------------------ | ------------------------------ |
| `GET /api/workspaces`                                  | tout compte : ses espaces      |
| `POST /api/workspaces`                                 | tout compte, devient admin     |
| `PATCH /api/workspaces/:id`                            | admin — renommer               |
| `GET /api/workspaces/:id/members`                      | membre                         |
| `PATCH /api/workspaces/:id/members/:userId`            | admin — changer un rôle        |
| `DELETE /api/workspaces/:id/members/:userId`           | admin, ou soi-même (partir)    |
| `GET /api/workspaces/:id/invitations`                  | admin — invitations en attente |
| `POST /api/workspaces/:id/invitations`                 | admin — inviter une adresse    |
| `DELETE /api/workspaces/:id/invitations/:invitationId` | admin — annuler une invitation |
| `GET /api/workspaces/invitations`                      | la personne invitée            |
| `POST /api/workspaces/invitations/:id/accept`          | la personne invitée            |
| `POST /api/workspaces/invitations/:id/decline`         | la personne invitée            |

**Un non-membre reçoit un 404, pas un 403** : il n'a pas à apprendre qu'un
espace existe.

**Les membres voient l'adresse de leurs collègues.** Sans elle, on ne peut
ni refuser une invitation à une adresse déjà membre, ni reconnaître un membre
qui n'a pas choisi de nom. C'est la pratique de Slack et de Notion. Décision à
confirmer.

**Annuler une invitation** n'était pas listé parmi les droits de l'admin, mais
c'est le seul recours après une faute de frappe dans l'adresse.

**Accepter une invitation** inscrit d'abord la personne, puis marque
l'invitation acceptée : la RLS n'ouvre l'espace qu'à une invitation encore en
attente. Si la seconde écriture échoue, rejouer l'acceptation aboutit.

**Vérification.** 29 tests du service (`workspace.service.spec.ts`), typecheck
complet et 620 tests du dépôt au vert, scénario RLS rejoué avec la fonction
modifiée. Les requêtes du Repository n'ont pas été jouées contre un vrai
PostgREST : l'environnement n'a pas d'instance Supabase.

### Listes proposées par Jean-Claude (29 septembre, suite)

Quand une conversation d'espace fait émerger qui fait quoi — le cas
`decision_or_task` — ou quand on le lui demande par mention, Jean-Claude peut
proposer une liste partagée par l'outil `suggest_shared_list`. L'appel ne crée
rien (§12.1) : une carte s'affiche sous son message, et n'importe quel membre
de la conversation l'accepte (la liste rejoint l'espace, rattachée à la
conversation) ou l'ignore. La décision vaut pour tous, une seule fois.

- **Migration `20260929200000_workspace_list_suggestions.sql`** : table à
  part, lisible et tranchable par les membres de la conversation — et non
  `assistant_suggestions`, personnelle.
- **Responsables** : le modèle les nomme comme le fil les lui montre ; l'API
  les retrouve par ce nom, et laisse la tâche libre pour un nom inconnu.
  À l'acceptation, un responsable parti de l'espace entre-temps est retiré
  plutôt que de faire échouer la liste.
- **Deux membres qui répondent en même temps** : la mise à jour est
  conditionnée à l'état « en attente », un seul l'emporte, l'autre lit
  « Cette proposition a déjà été traitée ». Si la création de la liste
  échoue, la proposition redevient disponible.

**Vérification.** Scénario RLS (5 vérifications), 17 nouveaux tests du service
des conversations d'espace, typecheck, parcours Chromium sur une fausse API
en clair et en sombre, grand écran et 390 pt. Aucun appel à un vrai modèle :
la pertinence des propositions reste à éprouver.

### Listes partagées (29 septembre, suite)

Des listes simples, communes à l'espace : un titre, des tâches cochables par
tous, un responsable par tâche. Ni échéance, ni sous-tâche, ni calendrier
(décision de Clarisse).

- **Migration `20260929190000_workspace_task_lists.sql`** : tables à part,
  `workspace_task_lists` et `workspace_tasks`, et non une colonne de plus sur
  `task_lists` — les requêtes des listes personnelles s'en remettent à la RLS,
  qui leur aurait alors mêlé les listes d'espace. Réservées aux membres ;
  triggers qui gardent la liste, son dossier et sa conversation d'origine dans
  l'espace, et le responsable parmi les membres. Quitter l'espace libère ses
  tâches. `created_by` en `set null` : supprimer son compte n'efface pas ce
  que l'équipe partage.
- **Une tâche s'écrit à part** (`POST`, `PATCH`, `DELETE
/api/workspace-lists/:id/tasks/:taskId`) : deux membres qui cochent en même
  temps ne s'écrasent pas, contrairement à `PUT /tasks/:id/items`.
- **App** : section « Listes » dans la barre latérale de l'espace, avec ce qui
  reste à faire ; listes rangées sous leur dossier (un seul, comme en
  personnel) ; écran de liste pour cocher, confier, ajouter, supprimer, et
  menu « … » pour renommer, ranger, supprimer.

**Vérification.** Scénario RLS à trois comptes (13 vérifications), 16 tests du
service, typecheck, parcours Chromium sur une fausse API en clair et en
sombre, grand écran et 390 pt.

**Limite.** Pas de temps réel sur les listes : un membre voit les gestes des
autres en rouvrant la liste.

### Dossiers d'espace (29 septembre, suite)

Demandés par Clarisse après le lot 4 : chaque espace a son arborescence
commune, que tout membre peut modifier. On y range les conversations de
l'espace, plusieurs dossiers par conversation (invariant 4).

- **Migration `20260929180000_workspace_folders.sql`** : `folders.workspace_id`,
  policies réservées aux membres, et deux policies restrictives — un dossier
  d'espace n'est visible que de ses membres, et une conversation ne se range
  que dans un dossier du même espace (`same_space`). Un trigger garde un
  sous-dossier dans l'espace de son parent, et interdit à un dossier de
  changer d'espace. L'unicité du nom par parent vaut désormais par espace ;
  pour les dossiers personnels, elle reste par compte.
- **API** : `GET /api/folders?workspaceId=` et `workspaceId` à la création ; le
  module des dossiers filtre explicitement l'espace demandé, personnel
  compris, puisque la RLS laisse désormais voir à un membre les dossiers de
  ses espaces. `PUT /api/groups/:id/folders` range une conversation d'espace.
- **App** : arborescence dans la barre latérale de l'espace, avec les
  conversations rangées sous chaque dossier ; menu « … » (sous-dossier,
  renommer, supprimer) ; action « Ranger » dans l'en-tête d'une conversation,
  cases à cocher.

**Vérification.** Scénario RLS à trois comptes (15 vérifications, plus le
rangement personnel inchangé), tests des services, typecheck, parcours
Chromium sur une fausse API en clair et en sombre, grand écran et 390 pt.

**Limite.** Comme pour les conversations, `folders.user_id` est en `on delete
cascade` : supprimer le compte du créateur d'un dossier d'espace le supprime
pour tous.

### Livré au lot 4

Jean-Claude prend part aux discussions de groupe.

- **Sur mention** (`@Jean-Claude`, sans égard à la casse, aux accents ni au
  trait d'union — `mentionsAssistant`, `@jc/domain`), il répond toujours,
  même en silence, sans attendre.
- **De lui-même**, sauf bouton silence : après chaque message, l'API attend
  6 secondes (`GROUP_PAUSE_MS`). Si un autre message est arrivé entre-temps,
  elle abandonne. Sinon un petit modèle (`LLM_DECISION_MODEL`, par défaut
  `mistral/ministral-8b`) rend un verdict par l'outil `decide_intervention`
  : se taire, ou l'un des quatre cas. Il se tait par défaut, et aussi quand il
  répond sans utiliser l'outil.
- **La réponse est rédigée par le modèle choisi dans ses réglages par le
  membre qui l'a déclenchée** — l'auteur du dernier message, ou celui qui
  mentionne — sinon par le modèle par défaut du serveur. Elle est imputée à
  son quota (`llm_rate_limits`) ; le verdict du petit modèle ne l'est pas.
- **Contexte** : les 30 derniers messages du groupe, signés du nom affiché de
  chaque membre ; un membre sans nom devient « Membre 1 », jamais son
  adresse. Aucune source personnelle : la consigne de groupe
  (`groupSystemPrompt`) est construite à part de `buildSystemPrompt`.
- **Il propose, il n'exécute rien** : sur une décision ou une répartition du
  travail, il récapitule qui fait quoi et demande si c'est juste. Depuis, il
  peut aussi proposer une liste à valider (voir « Listes proposées par
  Jean-Claude »).
- **Bouton silence** dans l'en-tête du fil (`PATCH /api/groups/:id`), réglage
  du groupe entier, modifiable par tout membre.
- **Traitement après réponse** : `core/after-response.ts`, sur `waitUntil` de
  `@vercel/functions` (nouvelle dépendance de l'API). La réponse de Jean-Claude
  arrive chez tous les membres par Realtime, comme un message ordinaire.

**Vérification.** 31 tests du service des groupes, dont le chemin complet
d'une intervention sur doubles du moteur et du dépôt (mention, pause
interrompue, verdict négatif, verdict sans outil, quota épuisé, réponse vide,
modèle du membre ou modèle par défaut) ; 7 tests de `mentionsAssistant`.
Parcours joué dans Chromium sur une fausse API, clair et sombre, grand écran et
390 pt : bouton silence, réponse de Jean-Claude à une mention.

**Non vérifié.** Aucun appel à un vrai modèle : la qualité du jugement et des
réponses reste à éprouver en usage. `waitUntil` n'a pas été observé sur
Vercel : si la fonction s'arrêtait avec la réponse, Jean-Claude ne parlerait
jamais de lui-même — c'est le premier point à vérifier après déploiement. Le
bouton silence basculé par un membre n'apparaît chez les autres qu'au
rechargement du groupe : Realtime ne diffuse que les messages.

### Livré au lot 3

Groupes de bout en bout : API, temps réel, non-lus, « en train d'écrire », et
le fil de groupe à l'écran (reste du lot 5). Jean-Claude n'y parle pas encore :
c'est le lot 4.

- **API** (`apps/api/src/domain/group/`) : `GET /api/groups?workspaceId=`,
  `POST /api/groups`, `GET /api/groups/:id`, `GET` et `POST
/api/groups/:id/messages`, `POST /api/groups/:id/read`. Le créateur est
  membre d'office ; il faut au moins une autre personne, et toutes doivent
  appartenir à l'espace. Un non-membre reçoit un 404.
- **Les routes personnelles refusent un groupe.** `/api/conversations/:id…`
  passe désormais par une garde qui rend un 404 pour un groupe : sans elle, un
  membre aurait pu écrire dans un groupe par le tour personnel, qui remet au
  modèle son contexte privé. `findById` écarte aussi les groupes.
- **Temps réel** (migration `20260929160000_group_realtime.sql`) : `messages`
  entre dans la publication Realtime, et une policy sur `realtime.messages`
  réserve le canal `group:<id>` aux membres du groupe. Les deux blocs sont
  sans effet sur un Postgres sans Supabase (portabilité UE, §8).
- **Côté app** : un abonnement unique, monté dans la coquille, invalide le fil
  et les compteurs à chaque message reçu — le message est relu par l'API. Le
  fil de groupe (`features/group/group.screen.tsx`) signe les messages des
  autres, marque le groupe lu à l'ouverture et à chaque message reçu, et
  affiche « Bruno écrit… ». La barre latérale d'un espace liste ses groupes
  avec leur pastille de non-lus, et permet d'en créer un.
- **Exception à l'invariant 3** consignée dans `docs/ARCHITECTURE.md` §2.2,
  `CLAUDE.md` et `.claude/rules/200-app.md`.

**Vérification.** 12 tests du service des groupes ; typecheck, et tests du
dépôt. Migrations rejouées sur Postgres 16 : le scénario RLS (46 vérifications),
et un scénario du canal privé contre une doublure du schéma `realtime` (un
membre y émet et écoute, une personne extérieure non, un sujet malformé est
refusé sans erreur). Parcours joué dans Chromium sur une fausse API, en clair
et en sombre, grand écran et 390 pt : liste des groupes et pastille, fil,
envoi, création d'un groupe.

**Non vérifié.** Le temps réel lui-même : la fausse API n'a pas de serveur
Realtime, et la doublure SQL ne rejoue pas le service. La réception des
messages, les compteurs qui avancent et l'indicateur « en train d'écrire »
restent à éprouver sur un vrai Supabase, avec deux comptes. iOS et Android non
plus.

### Livré au lot 5 (partie sans groupes)

Le lot 5 a été avancé avant le lot 3 pour avoir une interface à montrer. Seul
ce qui repose sur l'API du lot 2 est fait ; le fil de groupe attend le lot 3.

- **Sélecteur d'espace** en tête de la barre latérale
  (`features/workspace/WorkspaceSwitcher.tsx`) : nom de l'espace courant,
  pastille rouge quand une invitation attend. Au clic, une fenêtre liste
  « Personnel » et les espaces, les invitations reçues (Refuser, Rejoindre) et
  « Nouvel espace ». Feuille remontant du bas sur téléphone, comme toutes les
  fenêtres de l'app.
- **L'espace actif se lit dans l'adresse** (`/workspace/:id`), pas dans un
  état local : un lien partagé ou un rechargement retombe sur le bon espace.
- **Barre latérale d'un espace** : les dossiers et conversations personnels
  s'effacent, comme les canaux d'un autre espace dans Slack. Elle ne porte
  pour l'instant que « Membres et invitations ». « Nouvelle conversation »
  disparaît aussi : dans un espace, on créera un groupe. Le canal permanent
  reste, il est personnel et suit l'utilisateur partout.
- **Écran de l'espace** (`/workspace/:id`) : membres (nom, sinon adresse ;
  rôle), menu « … » de l'admin (nommer admin, retirer le rôle, retirer de
  l'espace avec confirmation), invitation par adresse et invitations en
  attente, renommage, « Quitter l'espace » avec confirmation. Un encart
  « À développer — lot 3 » annonce les discussions de groupe.

**Vérification.** Typecheck de l'app. Parcours joué dans Chromium sur un build
web branché sur une fausse API, en thème clair et en thème sombre, à
1280 pt et à 390 pt : ouvrir le sélecteur, entrer dans un espace, inviter une
adresse déjà membre (message du serveur affiché) puis une nouvelle, nommer un
admin, ouvrir la confirmation de départ, renommer, rejoindre un espace depuis
une invitation. **Non vérifié sur iOS ni Android.**

**Constaté au passage, corrigé depuis.** En thème sombre sur web, les fenêtres
`Modal` s'affichaient sur fond blanc, confirmation standard comprise : les
variables du thème ne traversaient pas le portail. Voir l'entrée du suivi du
backlog sur les modales.

---

## 6. Règles métier

Elles vivent dans les services de `apps/api/src/domain/workspace/` et sont
testées (rule 300).

- Seul un admin invite, retire un membre ou renomme l'espace.
- On n'invite pas une adresse déjà membre, ni une adresse déjà invitée.
- Une invitation n'est acceptée que par un compte dont l'adresse correspond,
  lue dans le jeton d'authentification, jamais dans le corps de la requête.
- Le dernier admin ne quitte pas l'espace et ne perd pas son rôle.

Deux règles sont tenues par la base, quel que soit le chemin d'écriture :
seul un membre de l'espace est ajouté à un groupe de cet espace (RLS), et
retirer un membre de l'espace le retire de tous ses groupes (trigger).

---

## 7. Lots

Un lot par jour, chacun démontrable.

| Lot | Contenu                                                                                            | Démonstration                                                 |
| --- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 1   | Migration : tables, colonnes, trigger des non-lus, RLS                                             | Deux comptes de test : l'un ne lit pas les groupes de l'autre |
| 2   | Module `domain/workspace` : espace, invitations, membres, avec tests                               | Créer un espace, inviter, accepter depuis un second compte    |
| 3   | Groupes : API, abonnement Realtime, non-lus, « en train d'écrire » ; mise à jour d'ARCHITECTURE.md | Deux navigateurs côte à côte, messages instantanés            |
| 4   | Jean-Claude dans le groupe : attente, décision, réponse, mention, bouton silence                   | Une question sans réponse, Jean-Claude répond de lui-même     |
| 5   | Interface : sélecteur d'espace, écran des membres et invitations, fil de groupe                    | Parcours complet sur web et mobile                            |

Les lots 3 et 5 se recouvrent : le fil de groupe du lot 3 peut réutiliser
l'écran de conversation existant, l'interface dédiée venant au lot 5.

---

### Refonte de la barre latérale

- **Ordre** : signalement, canal Jean-Claude, sélecteur d'espace, puis
  « Nouvelle conversation ». Le canal et le signalement sont personnels : ils
  ne dépendent pas de l'espace et passent au-dessus.
- **Même structure dans les deux espaces** : Dossiers, puis « Conversations et
  tâches » (conversations et listes à plat). Rangées, retraits et pastilles
  partagés via `features/navigation/SidebarSection.tsx`. Écart assumé : un
  « + » reste sur « Conversations et tâches » en espace collaboratif, seul
  point d'entrée d'une liste partagée. Dans l'espace personnel, elle naît d'une
  conversation ou d'un dossier.
- **L'espace actif est mémorisé** (`use-active-workspace.ts`), en plus de
  l'adresse : ouvrir le canal, le calendrier ou les réglages depuis un espace
  collaboratif ne ramène plus au personnel. Il ne change que par le sélecteur
  ou une adresse `/workspace/:id`. Mémoire en mémoire vive seulement : un
  rechargement retombe sur l'adresse. Remplace « l'espace actif se lit dans
  l'adresse » du lot 5.
- **Membres et invitations** : bouton entre le sélecteur d'espace et
  « Nouvelle conversation », en espace collaboratif seulement.
- **Fenêtre « Mes espaces »** : « Espace collaboratif · x membre(s) » pour tous
  (`Workspace.memberCount`, agrégat PostgREST côté API).

**Vérification.** Typecheck et tests API passent. **Non vérifié à l'écran** :
aucun parcours joué dans un navigateur, ni iOS ni Android.

## 8. Hors V1

- Envoi de l'e-mail d'invitation (Supabase `inviteUserByEmail` imposerait le
  client `admin` dans une route HTTP ; un service d'envoi ajouterait une
  dépendance et un secret)
- Calendrier partagé ; échéances, sous-tâches et calendrier sur les listes
  partagées
- Réglages de l'IA propres à l'espace (nom, couleur, modèle)
- Messages directs distincts des groupes, réponse à un message cité, réactions
- Notifications push
- Résumé « ce que vous avez manqué », aparté privé avec l'IA sur un fil de groupe

---

## 9. Questions ouvertes

1. ~~**Suggestions de groupe.**~~ Tranché le 29 septembre : la proposition
   acceptée devient une liste partagée de l'espace, et tout membre de la
   conversation peut l'accepter ou l'ignorer (voir « Listes proposées par
   Jean-Claude »).
2. **Coût.** Seule la réponse rédigée est imputée, au membre qui l'a
   déclenchée ; le verdict du petit modèle n'est décompté nulle part. Un membre
   bavard épuise son quota pour tout le groupe. Un quota par espace
   serait plus juste ; il n'existe pas aujourd'hui.
3. **Suppression d'un espace.** Réservée à l'admin, avec toutes ses discussions ?
   Ou archivage seulement ?
4. **Retrait d'un groupe.** Chacun quitte un groupe de lui-même. Qui peut en
   retirer un autre membre : le créateur du groupe, un admin de l'espace, tout
   membre ? Aucun des trois n'est ouvert par la migration du lot 1.
