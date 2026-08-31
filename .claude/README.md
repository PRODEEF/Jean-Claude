# `.claude/` — skills et rules du dépôt

Configuration d'agent **propre à Jean-Claude**. Claude Code découvre
automatiquement les skills de `skills/`. Cursor y est renvoyé par
`.cursor/rules/000-jean-claude.mdc`.

- **rules/** — contraintes permanentes. Toujours valables, quelle que soit la tâche.
- **skills/** — procédures. Consultées quand la tâche correspond à leur description.

La distinction : une _rule_ dit ce qui est interdit, un _skill_ dit comment faire.

---

## Rules

| Fichier                                | Portée                                                    |
| -------------------------------------- | --------------------------------------------------------- |
| [000-general.md](rules/000-general.md) | Périmètre, code minimal, langue, TypeScript, secrets, git |
| [100-api.md](rules/100-api.md)         | Couches NestJS, pattern Repository, Zod, routes           |
| [200-app.md](rules/200-app.md)         | Expo, multi-plateforme, composants, thème, React Query    |
| [300-tests.md](rules/300-tests.md)     | Ce qui doit être testé et comment                         |
| [400-produit.md](rules/400-produit.md) | Règles de conception issues du cahier des charges         |

`400-produit.md` est le moins habituel et le plus important : il encode les
règles qui font la différence entre Jean-Claude et une IA conversationnelle
générique. À lire avant toute décision de conception.

---

## Skills

| Skill                                                    | Quand                                                           |
| -------------------------------------------------------- | --------------------------------------------------------------- |
| [api-module](skills/api-module/SKILL.md)                 | Créer une entité métier dans l'API — `task`, `calendar`, `user` |
| [app-feature](skills/app-feature/SKILL.md)               | Ajouter un écran ou une feature dans l'app Expo                 |
| [llm-provider](skills/llm-provider/SKILL.md)             | Brancher un moteur IA, définir un outil de suggestion           |
| [supabase-migration](skills/supabase-migration/SKILL.md) | Modifier le schéma, écrire une policy RLS                       |
| [ui-decision](skills/ui-decision/SKILL.md)               | Trancher un choix d'interface (règle des 3 apps, A/B)           |
| [daily-report](skills/daily-report/SKILL.md)             | Report quotidien à Yann et mise à jour du suivi                 |

---

## Par où commencer

| Situation                | À lire                                                                   |
| ------------------------ | ------------------------------------------------------------------------ |
| Découvrir le projet      | [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md)                          |
| Ajouter un endpoint      | [api-module](skills/api-module/SKILL.md) + [100-api](rules/100-api.md)   |
| Ajouter un écran         | [app-feature](skills/app-feature/SKILL.md) + [200-app](rules/200-app.md) |
| Toucher au schéma        | [supabase-migration](skills/supabase-migration/SKILL.md)                 |
| Hésiter sur un placement | [ui-decision](skills/ui-decision/SKILL.md)                               |
| Fin de journée           | [daily-report](skills/daily-report/SKILL.md)                             |

---

## Les 6 invariants

Si vous ne retenez que six choses :

1. **Aucun SDK de modèle IA hors de `core/llm/providers/`** (§5.1)
2. **Aucune logique métier dans un écran** — elle vit dans l'API ou `@jc/domain`
3. **L'app n'écrit jamais en base** — Supabase client = auth uniquement
4. **Une conversation n'a pas de dossier parent unique** — `conversation_folders` (§5.2)
5. **Aucun secret dans `apps/app`** — `EXPO_PUBLIC_*` finit dans le bundle
6. **L'assistant propose, il n'exécute pas** (§12.1)

---

## Maintenir ce dossier

Ces fichiers décrivent le dépôt tel qu'il est. Quand une convention change dans
le code, **mettre à jour la rule ou le skill dans le même commit** — une règle
qui décrit un état périmé est pire que pas de règle : elle est suivie de bonne
foi et produit du code incohérent.

Ajouter un skill quand une procédure est refaite une troisième fois. En dessous,
ce n'est pas encore un pattern.

---

## Outils externes

`gstack` (§0.3) est installé au niveau utilisateur, hors de ce dépôt : ses
commandes (`/review`, `/qa`, `/ship`, `/cso`…) restent disponibles et sont
complémentaires. Ce dossier porte ce qui est **spécifique à Jean-Claude** ;
gstack porte le cycle de vie générique.

En cas de contradiction, **ce dossier prime** : il connaît l'architecture, pas gstack.
