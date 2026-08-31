---
name: ui-decision
description: >
  Trancher un choix d'interface dans Jean-Claude — position d'un bouton,
  pattern de navigation, geste, comportement d'un composant. Utilise ce skill
  dès qu'une décision d'UI se présente et qu'il n'y a pas de réponse évidente,
  ou quand plusieurs approches se défendent. Applique la règle des 3 apps de
  référence (§4.2) puis, en cas de doute persistant, l'A/B testing humain
  (§4.3). Sert aussi à consigner les points non tranchés.
---

# Trancher un choix d'interface

Le cahier des charges interdit explicitement de décider à l'intuition (§4.2).
Ce skill décrit la procédure à suivre.

## Étape 1 — Y a-t-il vraiment un doute ?

Non, si le projet a déjà tranché : jeton dans `@jc/design`, composant existant
dans `shared/ui/`, pattern déjà appliqué ailleurs dans l'app. **Rester cohérent
avec l'existant prime sur toute autre considération.**

Oui, si c'est un nouveau pattern : placement d'un bouton, navigation, geste,
comportement d'un composant qui n'a pas d'équivalent dans le code.

## Étape 2 — La règle des 3 apps de référence (§4.2)

Identifier trois applications reconnues comme les meilleures sur **l'usage
concerné**, et s'aligner sur ce qu'elles partagent.

| Composant concerné | Références |
|---|---|
| Interface conversationnelle, fils de discussion | ChatGPT (mobile), Claude (mobile), Perplexity |
| Todolistes, tâches | Things 3, Todoist, TickTick |
| Calendrier | Calendrier natif iOS, Google Calendar, Fantastical |
| Navigation par dossiers, organisation | Notion, Apple Notes |

Liste indicative — à ajuster avec Antonin selon le composant réellement traité.

**Chercher le consensus, pas la moyenne.** Si deux des trois placent la
recherche en haut du tiroir, c'est le standard : le suivre.

Consigner la conclusion en commentaire là où elle s'applique :

```tsx
// Recherche en tête du tiroir, avant la nouvelle conversation :
// pattern commun à ChatGPT, Claude et Mistral AI (§4.2).
```

## Étape 3 — Doute persistant → A/B testing humain (§4.3)

Si les références divergent et que plusieurs approches se défendent :

1. Développer **2 ou 3 variantes** — pas plus, le temps est contraint
2. Les présenter à un petit groupe de testeurs ; à défaut, à Yann et/ou Antonin
3. Retenir la préférence majoritaire
4. **Généraliser** le gagnant au reste de l'application
5. Supprimer les variantes perdantes du code

Le §0.1 joue en votre faveur : Yann veut voir le travail chaque jour, même
inachevé, précisément pour faire tester au fil de l'eau. Les variantes sont donc
à montrer dans la démonstration quotidienne — voir skill
[daily-report](../daily-report/SKILL.md).

## Étape 4 — Consigner

Tout point **non encore tranché** va dans `docs/SUIVI-BACKLOG.md`, section
« Points nécessitant un A/B testing humain ». C'est un livrable explicite de fin
de stage (§10).

```markdown
| Point | Variantes | Statut |
|---|---|---|
| Position de la recherche dans le tiroir | A : en tête · B : sous les dossiers | En attente de test |
```

## Contraintes non négociables

Quelle que soit la variante retenue :

- Zone cliquable ≥ 44 pt (`MIN_TOUCH_TARGET`)
- Fonctionne en thème clair **et** sombre
- Fonctionne en `compact` **et** `expanded` (`useBreakpoint()`)
- `accessibilityRole` et `accessibilityLabel` renseignés
- Vocabulaire courant — pas de jargon (§13.4.4), voir rule
  [400-produit](../../rules/400-produit.md)

## Ce que ce skill ne couvre pas

Les décisions **produit** (que fait la fonctionnalité) ne se tranchent pas par
A/B testing : elles relèvent de Yann. L'A/B ne porte que sur la **forme**.
