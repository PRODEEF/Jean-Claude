# 300 — Tests

## Ce qui doit être testé

| Élément                            | Obligation                                                             |
| ---------------------------------- | ---------------------------------------------------------------------- |
| Service `domain/`                  | **Obligatoire** — un `.spec.ts` par service                            |
| Fonction pure de `packages/domain` | **Obligatoire** dès qu'elle porte une règle                            |
| Repository                         | Non testé unitairement — il ne contient que du mapping et des requêtes |
| Fichier de routes                  | Non testé unitairement — il ne fait que valider et déléguer            |
| Écran                              | Non testé pour l'instant — priorité au sprint                          |

La ligne de partage : **on teste ce qui décide**, pas ce qui transporte.

## Comment

Doubles construits depuis l'interface du Repository, jamais de vraie base.
Référence : `apps/api/src/domain/folder/folder.service.spec.ts`.

```ts
function makeRepository(overrides: Partial<IFolderRepository> = {}): IFolderRepository {
  return {
    findAll: jest.fn().mockResolvedValue([]),
    findById: jest.fn().mockResolvedValue(null),
    // ...valeurs par défaut inoffensives
    ...overrides,
  };
}
```

Chaque test ne surcharge que ce qui l'intéresse. Le service est instancié
directement (`new FolderService(repo)`) — il n’y a pas de conteneur
d’injection à monter.

## Nommage

Libellés en français, décrivant le **comportement attendu**, pas la méthode :

```ts
// ✅
it("refuse un 3e niveau d'arborescence", ...)
it("agrège dans le compteur du parent les conversations de ses sous-dossiers", ...)

// ❌
it("create should throw", ...)
it("test getTree", ...)
```

## Cas à couvrir systématiquement

Pour chaque service : le cas nominal, le cas limite (collection vide, valeur
absente), et le cas d'erreur (ressource introuvable, règle métier violée).

## Commandes

```bash
npm test                      # tous les tests
npm test --workspace @jc/api  # API seulement
```

Faire tourner `npm run typecheck` **et** `npm test` avant tout commit qui touche
un service.
