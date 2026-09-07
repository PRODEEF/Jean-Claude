/**
 * Texte de la politique de confidentialité (issue #21, §7).
 *
 * Séparé de l'écran qui le rend : c'est un contenu long et à faire relire
 * juridiquement, pas du code — l'isoler évite de le noyer dans le composant.
 *
 * ⚠️ Champs signalés `[À COMPLÉTER]` : raison sociale exacte, forme
 * juridique, SIREN, adresse du siège, contact dédié et région d'hébergement
 * Supabase restent à confirmer (le suivi de backlog liste la région
 * d'hébergement comme un point non tranché, §8). Ne pas publier tel quel sur
 * les stores avant d'avoir comblé ces champs et fait relire le texte.
 */
export const PRIVACY_POLICY_LAST_UPDATED = "7 septembre 2026";

export const PRIVACY_POLICY_MARKDOWN = `# Politique de confidentialité

Dernière mise à jour : ${PRIVACY_POLICY_LAST_UPDATED}.

Jean-Claude est un assistant personnel dans lequel vous pouvez être amené à
confier des informations sensibles — santé, démarches administratives,
assurances. Cette page explique quelles données sont collectées, pourquoi, et
comment les faire corriger ou effacer.

## Responsable du traitement

**[À COMPLÉTER — raison sociale complète, forme juridique, SIREN et adresse
du siège]**, exploitant l'application sous le nom PRODEEF (identifiant
technique \`fr.prodeef.jeanclaude\`).

Contact pour toute question relative à vos données : **[À COMPLÉTER — adresse
de contact dédiée]**.

## Données collectées

Le tableau ci-dessous liste ce que le service enregistre. Rien n'est demandé
au moment de la création d'un contenu au-delà de ce qu'il contient
naturellement — Jean-Claude ne classe et ne complète jamais vos informations
avant de les enregistrer.

| Catégorie | Contenu | Origine |
| --- | --- | --- |
| Compte | Adresse e-mail, pseudo | Vous, à l'inscription |
| Connexion | Code à usage unique envoyé par e-mail | Généré par le service d'authentification |
| Conversations | Le texte de vos échanges avec l'assistant | Vous |
| Mémoire de l'assistant | Ce que l'assistant retient de vous d'une conversation à l'autre (préférences, contexte personnel) | Déduit de vos échanges |
| Dossiers | Noms et organisation de votre rangement | Vous, ou proposé par l'assistant et validé par vous |
| Todolistes et tâches | Titres, notes, échéances | Vous, ou proposées par l'assistant et validées par vous |
| Calendrier | Titres et notes d'événements, dates | Vous, ou proposés par l'assistant et validés par vous |
| Préférences | Thème, couleur, fuseau horaire, modèle d'assistant choisi | Vous |
| Avis et notation | Signalements de bug, idées, pouce haut/bas sur une réponse | Vous, à votre initiative |

**Vous pouvez confier des données de santé.** Rien n'empêche une conversation,
une tâche ou un événement de porter sur un rendez-vous médical, un traitement
ou une situation de santé — c'est un usage attendu du produit. Ces
informations bénéficient de la même protection technique que le reste (accès
strictement limité à votre compte, voir « Sécurité » ci-dessous), mais elles
relèvent d'une catégorie particulière de données au sens du RGPD (article 9) :
leur traitement repose sur le fait que vous les fournissez vous-même et de
façon manifestement volontaire, en utilisant le service à cette fin.

## Finalités

- Faire fonctionner l'assistant : générer une réponse, une suggestion de
  rangement, de liste ou de créneau à partir de vos échanges
- Faire persister vos conversations, dossiers, todolistes et rendez-vous
  d'une session à l'autre
- Vous authentifier
- Améliorer le produit à partir des avis et signalements que vous envoyez
  vous-même (aucune conversation n'est relue à cette fin sans votre geste
  explicite)

## Base légale

Le traitement repose sur l'exécution du contrat qui vous lie au service
(fournir l'assistant que vous avez demandé) et, pour les données de santé que
vous choisissez de confier, sur le consentement manifeste que constitue le
fait de les saisir dans l'application.

## Destinataires et sous-traitants

Vos données ne sont jamais vendues ni utilisées à des fins publicitaires.
Elles transitent par les prestataires techniques suivants, strictement pour
faire fonctionner le service :

| Prestataire | Rôle | Localisation |
| --- | --- | --- |
| Supabase | Hébergement de la base de données et authentification | **[À COMPLÉTER — région du projet Supabase ; §8 recommande l'UE, non encore tranché]** |
| Vercel | Hébergement de l'application web et de l'API | **[À COMPLÉTER]** |
| Fournisseur du modèle choisi dans vos réglages | Génération des réponses de l'assistant à partir du contenu de vos conversations | Selon le modèle choisi — voir ci-dessous |

**Le fournisseur qui traite le contenu de vos conversations dépend du modèle
que vous choisissez dans Réglages.** Un seul des cinq modèles proposés
(Mistral) est hébergé et opéré en France ou dans l'Union européenne ; les
quatre autres (GPT, Gemini, Perplexity, Grok) impliquent un transfert de vos
échanges vers leur éditeur, hors UE. Le réglage indique cette information au
moment du choix. **[À COMPLÉTER — vérifier auprès de chaque fournisseur, via
le Vercel AI Gateway, les garanties contractuelles contre une réutilisation
du contenu à des fins d'entraînement, et les référencer ici avant mise en
production.]**

## Durée de conservation

Vos données sont conservées tant que votre compte existe. Supprimer votre
compte efface immédiatement et intégralement vos conversations, dossiers,
todolistes, événements et avis — la suppression est en cascade au niveau de
la base de données, pas une simple désactivation.

**[À COMPLÉTER — délai précis de suppression effective côté prestataires
(sauvegardes Supabase notamment) si différent d'une suppression immédiate.]**

## Sécurité

- Chaque utilisateur n'accède qu'à ses propres données : la base applique des
  règles d'accès au niveau de chaque ligne (Row Level Security), appliquées
  indépendamment du code de l'application
- Les échanges avec le service sont chiffrés en transit (HTTPS)
- Sur mobile, votre session est conservée dans l'espace sécurisé du système
  (Trousseau iOS, Keystore Android) plutôt qu'en clair
- L'application ne stocke jamais de mot de passe : la connexion se fait par
  un code à usage unique envoyé par e-mail

## Vos droits

Conformément au RGPD, vous disposez d'un droit d'accès, de rectification,
d'effacement, de limitation, d'opposition et de portabilité sur vos données.

- **Accès, rectification, effacement courants** : directement dans
  l'application (Réglages, ou suppression du compte)
- **Autres demandes, ou portabilité complète** : par écrit à **[À COMPLÉTER —
  adresse de contact]**
- Vous pouvez également introduire une réclamation auprès de la CNIL
  ([cnil.fr](https://www.cnil.fr))

## Modifications de cette politique

Cette page peut évoluer, notamment à mesure que le service s'enrichit. La
date de mise à jour en tête de page reflète la dernière version.
`;
