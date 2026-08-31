---
name: supabase-migration
description: >
  Écrire une migration SQL Supabase pour Jean-Claude — nouvelle table, colonne,
  index, policy RLS, trigger. Utilise ce skill dès qu'on modifie le schéma de
  base, qu'on ajoute une policy, qu'on régénère database.types.ts, ou qu'on se
  demande comment garantir l'isolation des données entre utilisateurs. Couvre
  aussi la contrainte de portabilité RGPD vers un hébergement UE.
---

# Écrire une migration

Schéma initial de référence : `supabase/migrations/20260831090000_init.sql`.

## Nommage

```
supabase/migrations/AAAAMMJJHHMMSS_description_courte.sql
```

Horodatage croissant, description en snake_case et en anglais.
Une migration = une intention. **Jamais de modification d'une migration déjà
appliquée** — en écrire une nouvelle.

## Les 5 obligations pour une nouvelle table

### 1. `user_id` avec cascade

```sql
user_id uuid not null references auth.users(id) on delete cascade
```

Supprimer un compte doit supprimer toutes ses données — exigence RGPD (§8, §13.4.6).

Choisir la cascade selon la **possession**, pas selon la commodité :

| Relation | Comportement | Pourquoi |
|---|---|---|
| `tasks` → `task_lists` | `on delete cascade` | Une tâche n'existe pas sans sa liste |
| `task_lists` → `conversations` | `on delete set null` | Supprimer la conversation ne doit pas détruire la todoliste |
| `conversation_folders` → les deux | `on delete cascade` | C'est une liaison, pas une donnée |

### 2. RLS activée

```sql
alter table public.<table> enable row level security;

create policy "<table>_owner_access"
  on public.<table> for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
```

`(select auth.uid())` et non `auth.uid()` : la sous-requête est évaluée une
seule fois par requête au lieu d'une fois par ligne.

**Jamais de table sans RLS.** L'usage est mono-utilisateur en V1 (§2) mais RLS
est le dernier rempart en cas de bug applicatif, et l'ouverture multi-utilisateurs
est prévue.

Pour une **table de liaison** sans `user_id`, vérifier la possession des deux
côtés — sinon on peut rattacher sa conversation au dossier d'un autre :

```sql
create policy "liaison : conversation et dossier possédés"
  on public.conversation_folders for all
  using (
    exists (select 1 from public.conversations c
             where c.id = conversation_id and c.user_id = (select auth.uid()))
    and exists (select 1 from public.folders f
                 where f.id = folder_id and f.user_id = (select auth.uid()))
  )
  with check ( /* même condition */ );
```

### 3. Contraintes de validité

```sql
title text not null check (length(trim(title)) between 1 and 120),
constraint events_range_valid check (ends_at is null or ends_at > starts_at)
```

Les mêmes règles existent en Zod dans `packages/domain`. Ce n'est pas une
duplication inutile : Zod produit un message clair pour l'utilisateur, la
contrainte SQL garantit qu'aucun chemin ne peut la contourner.

### 4. Index sur les accès réels

```sql
-- Chemin d'accès principal
create index tasks_list_idx on public.tasks (list_id, position);

-- Index partiel : ne couvre que les lignes réellement interrogées
create index tasks_due_idx on public.tasks (user_id, due_at)
  where done = false and due_at is not null;

-- Recherche plein texte en français (A.6)
create index messages_content_fts_idx
  on public.messages using gin (to_tsvector('french', content));
```

### 5. `updated_at` automatique

Ajouter la table au tableau du trigger `touch_updated_at` dans la migration
initiale, ou créer le trigger dans la nouvelle migration.

## Ce qui est interdit

| ❌ | Pourquoi |
|---|---|
| Extension propriétaire ou spécifique à Supabase | Casse la portabilité — §8 impose une migration UE possible par `pg_dump` |
| Colonne `folder_id` sur `conversations` | Casse le rangement matriciel (§5.2, A.1) — passer par `conversation_folders` |
| Logique métier en fonction SQL | Elle doit être dans l'API, testable et partagée |
| Table sans RLS | Fuite de données entre utilisateurs |

Un trigger reste acceptable pour une **invariante structurelle** qui doit tenir
quel que soit le chemin d'écriture — la profondeur d'arborescence, la création
du profil à l'inscription. Pas pour une règle produit.

## Appliquer

```bash
npx supabase db push
```

```bash
npm run db:types
```

⚠️ **La régénération des types n'est pas optionnelle.** Tant qu'elle n'est pas
faite, `database.types.ts` reste un stub permissif : une faute de frappe dans un
`select` ou un `insert` passe le compilateur et n'échoue qu'à l'exécution.

Ne jamais éditer `database.types.ts` à la main.

## Puis

Répercuter dans `packages/domain` (schéma Zod), dans le Repository concerné
(type `Row`, `toEntity`, `COLUMNS`), et mettre à jour `docs/SUIVI-BACKLOG.md`.

## Rappel hébergement

Le projet Supabase doit être créé en région **UE** (`eu-west-3` Paris ou
`eu-central-1` Francfort). Gratuit au départ, coûteux à rattraper une fois les
données en place. Voir `docs/ARCHITECTURE.md` §4.
