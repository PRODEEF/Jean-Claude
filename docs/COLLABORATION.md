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

Vocabulaire d'interface (§13.4.4) : « espace », « groupe », « membre ». Le mot
`workspace` reste dans le code.

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

---

## 6. Règles métier

Elles vivent dans les services de `apps/api/src/domain/workspace/` et sont
testées (rule 300).

- Seul un admin invite, retire un membre ou renomme l'espace.
- On n'invite pas une adresse déjà membre, ni une adresse déjà invitée.
- Une invitation n'est acceptée que par un compte dont l'adresse correspond,
  lue dans le jeton d'authentification, jamais dans le corps de la requête.
- Le dernier admin ne quitte pas l'espace et ne perd pas son rôle.
- Seul un membre de l'espace est ajouté à un groupe de cet espace.
- Retirer un membre de l'espace le retire de tous ses groupes.

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

## 8. Hors V1

- Envoi de l'e-mail d'invitation (Supabase `inviteUserByEmail` imposerait le
  client `admin` dans une route HTTP ; un service d'envoi ajouterait une
  dépendance et un secret)
- Dossiers, listes et calendrier partagés — les listes demanderont de régler
  l'écrasement de `PUT /tasks/:id/items` (dernier qui écrit gagne)
- Réglages de l'IA propres à l'espace (nom, couleur, modèle)
- Messages directs distincts des groupes, réponse à un message cité, réactions
- Notifications push
- Résumé « ce que vous avez manqué », aparté privé avec l'IA sur un fil de groupe

---

## 9. Questions ouvertes

1. **Suggestions de groupe.** Sans listes partagées en V1, que produit une
   suggestion « tâche détectée » acceptée ? Proposition : une liste dans
   l'espace personnel de qui l'accepte, en attendant les listes d'espace. Et
   qui peut l'accepter — tout membre, ou seulement l'auteur du message ?
2. **Coût.** Imputer l'appel de décision au dernier auteur est simple, mais un
   membre bavard épuise son quota pour tout le groupe. Un quota par espace
   serait plus juste ; il n'existe pas aujourd'hui.
3. **Suppression d'un espace.** Réservée à l'admin, avec toutes ses discussions ?
   Ou archivage seulement ?
