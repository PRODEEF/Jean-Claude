# 400 — Règles produit

Issues du cahier des charges v1.8. Ce sont des règles de **conception**, pas de
code : elles se vérifient à la relecture d'une fonctionnalité, pas au linter.

## L'assistant propose, il n'exécute pas (§12.1)

C'est la règle la plus structurante du produit.

Un appel d'outil du modèle (`suggest_task_list`, `suggest_folders`…) devient une
**suggestion en attente** dans `assistant_suggestions`. L'utilisateur accepte ou
ignore d'un geste. Jamais d'action directe.

```
❌ « J'ai créé ta todoliste Jardin. »
✅ « On dirait qu'on a une liste d'achats et une liste de tâches
    qui se dessinent pour le jardin, je te les organise ? »
```

Une capacité désactivée dans les réglages n'est pas seulement masquée dans
l'UI : le serveur refuse de produire la suggestion correspondante.

## Le canal permanent est borné (A.10)

Le canal Jean-Claude couvre **trois sujets** : les rappels, l'organisation
interne de l'outil (dossiers, rangement), et la structure du projet de
l'utilisateur.

Hors de ce périmètre → nouvelle conversation classique, rangée en dossier. Le
bornage est appliqué **côté serveur** (`buildSystemPrompt`), jamais dans l'UI :
c'est une règle métier, elle doit valoir identiquement sur les quatre
plateformes.

## Une conversation appartient à plusieurs dossiers (§5.2, A.1)

Ce n'est pas une duplication : c'est la même donnée, visible depuis chaque
dossier concerné. Une conversation sur la mutuelle relève à la fois de « Santé »
et de « Administratif > Assurances ».

Toute UI de rangement doit donc permettre de cocher **plusieurs** dossiers, pas
d'en choisir un.

## Placement d'un composant : la règle des 3 apps (§4.2)

En cas de doute sur la position d'un bouton, un pattern de navigation ou un
geste, s'aligner sur ce que font **trois applications de référence** du domaine.
Ne pas trancher à l'intuition.

| Domaine | Références |
|---|---|
| Conversationnel | ChatGPT, Claude, Perplexity |
| Todolistes | Things 3, Todoist, TickTick |
| Calendrier | Calendrier iOS, Google Calendar, Fantastical |
| Dossiers | Notion, Apple Notes |

Doute persistant après consultation → 2 ou 3 variantes, arbitrées par un test
humain (§4.3), et le point consigné dans `docs/SUIVI-BACKLOG.md`.
Voir skill [ui-decision](../skills/ui-decision/SKILL.md).

## Vocabulaire (§13.4.4)

Bannir le jargon des outils de gestion de connaissances dans l'interface.

| ❌ Interdit | ✅ À la place |
|---|---|
| tag, étiquette | dossier |
| graphe, base relationnelle | — (ne pas exposer) |
| Zettelkasten, second cerveau | — (positionnement interne, pas UI) |
| entité, instance, requête | — vocabulaire courant |

Le produit vise le grand public sans prérequis technique. Chaque fonctionnalité
ajoutée doit être questionnée à l'aune de sa simplicité d'usage — faute de quoi
on reproduit l'écueil de Notion et d'Obsidian que le projet cherche à corriger.

## Capture sans friction (§13.4.1)

L'utilisateur ne choisit **jamais** où ranger une information au moment où il la
crée. C'est le système qui classe ensuite. Tout écran de création qui demande
« dans quel dossier ? » avant d'enregistrer viole cette règle.

## Vocal : une porte d'entrée, pas un mode (§12.3, A.12)

Un message dicté alimente la même conversation qu'un message tapé. Pas d'écran
vocal séparé, pas de fil distinct. `inputMode` n'est conservé que pour décider
si la réponse doit être lue à voix haute.
