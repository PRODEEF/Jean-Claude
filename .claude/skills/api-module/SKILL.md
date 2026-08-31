---
name: api-module
description: >
  Créer ou modifier un module domain/ dans l'API Hono de Jean-Claude
  (apps/api). Utilise ce skill dès qu'on ajoute une entité métier — task,
  calendar, user, suggestion — ou qu'on écrit un fichier de routes, un Service,
  un Repository ou une interface de Repository. Couvre le découpage en 5
  fichiers, le pattern Repository avec Supabase, les mappers toEntity, la
  validation Zod et la construction du service.
---

# Créer un module `domain/` — API Jean-Claude

## Quand

Une nouvelle **entité métier** apparaît : `task`, `calendar`, `user`,
`suggestion`. Si le besoin croise plusieurs entités (recherche, assistant
proactif), c'est un module `feature/`, pas `domain/`.

Module de référence à copier : `apps/api/src/domain/folder/`.

## Les 5 fichiers

```
apps/api/src/domain/<entité>/
  <entité>.routes.ts                HTTP — validation Zod, zéro logique
  <entité>.service.ts               Logique métier — testable sans base
  <entité>.repository.interface.ts  Contrat consommé par le service
  <entité>.repository.ts            Supabase — seul fichier en snake_case
  <entité>.service.spec.ts          Tests sur doubles
```

Aucun de ces fichiers n'est optionnel, y compris le `.spec.ts`. Il n'y a **pas**
de sixième fichier de câblage : le service se construit en tête des routes.

## Ordre de travail

### 1. Le schéma dans `packages/domain`

Le contrat vient **avant** l'implémentation. Il est partagé avec l'app.

```ts
// packages/domain/src/task/task.schema.ts
export const taskSchema = z.object({
  id: uuidSchema,
  listId: uuidSchema,
  title: labelSchema,
  done: z.boolean(),
  dueAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
});
export type Task = z.infer<typeof taskSchema>;

export const createTaskSchema = z.object({ title: labelSchema /* … */ });
export type CreateTask = z.infer<typeof createTaskSchema>;
```

Exporter depuis `packages/domain/src/index.ts`, puis `npm run build:packages`.

### 2. L'interface du Repository

```ts
// task.repository.interface.ts
import type { CreateTask, Task, UpdateTask } from "@jc/domain";

export interface ITaskRepository {
  findByList(listId: string, accessToken: string): Promise<Task[]>;
  create(userId: string, listId: string, input: CreateTask, accessToken: string): Promise<Task>;
  update(id: string, patch: UpdateTask, accessToken: string): Promise<Task>;
  delete(id: string, accessToken: string): Promise<void>;
}
```

`accessToken` est **toujours** le dernier paramètre. Il sert à ouvrir un client
Supabase sous l'identité de l'utilisateur, pour que les RLS s'appliquent.

C'est cette interface — pas la classe concrète — que le service reçoit. C'est
elle qui le rend testable sans base.

### 3. Le Repository

Trois éléments obligatoires : le type `Row`, le mapper `toEntity`, la constante
`COLUMNS`.

```ts
type TaskRow = {
  id: string;
  list_id: string;
  title: string;
  done: boolean;
  due_at: string | null;
  created_at: string;
};

function toEntity(row: TaskRow): Task {
  return {
    id: row.id,
    listId: row.list_id,
    title: row.title,
    done: row.done,
    dueAt: row.due_at,
    createdAt: row.created_at,
  };
}

const COLUMNS = "id, list_id, title, done, due_at, created_at";
```

**Aucune forme `*_id` ne sort d'ici.** C'est la frontière du snake_case.

Le Repository est un objet, pas une classe : il n'a pas d'état, seulement des
méthodes.

```ts
import { httpError } from "../../core/http";
import { forUser } from "../../core/supabase/supabase";

export const taskRepository: ITaskRepository = {
  async findByList(listId, accessToken) {
    const { data, error } = await forUser(accessToken) // ← RLS actives
      .from("tasks")
      .select(COLUMNS)
      .eq("list_id", listId)
      .order("position", { ascending: true });

    if (error) throw new Error(error.message);
    return (data as unknown as TaskRow[]).map(toEntity);
  },
};
```

Une panne Supabase se jette en `Error` nu : le gestionnaire global la consigne
et rend un 500 générique. Ne jamais renvoyer `error.message` au client — il peut
contenir une requête SQL.

Pour un `update`, construire le payload **clé par clé** — un `undefined` doit
laisser la colonne intacte, un `null` explicite doit l'effacer :

```ts
const payload: Record<string, unknown> = {};
if (patch.title !== undefined) payload["title"] = patch.title;
if (patch.dueAt !== undefined) payload["due_at"] = patch.dueAt;
```

Utiliser `.maybeSingle()` puis `throw httpError(404, "Tâche introuvable.")` si
`null` — `.single()` lève une erreur Supabase brute, moins lisible.

### 4. Le Service

Il porte la logique. Il reçoit l'interface, jamais l'implémentation.

```ts
export class TaskService {
  constructor(private readonly tasks: ITaskRepository) {}

  async complete(id: string, accessToken: string): Promise<Task> {
    // Les règles métier vivent ici, pas dans les routes ni dans le Repository.
    return this.tasks.update(id, { done: true }, accessToken);
  }
}
```

### 5. Les routes

Validation et délégation, rien d'autre. Le service est construit en tête.

```ts
const service = new TaskService(taskRepository);

const idParam = validate("param", z.object({ id: uuidSchema }));

export const taskRoutes = new Hono<AuthEnv>()
  .use(auth)

  .post("/", validate("json", createTaskSchema), async (c) => {
    const user = c.get("user");
    return c.json(await service.create(user.id, c.req.valid("json"), user.accessToken), 201);
  })

  .patch("/:id", idParam, validate("json", updateTaskSchema), async (c) =>
    c.json(await service.update(c.req.valid("param").id, c.req.valid("json"), c.get("user").accessToken)),
  );
```

Puis monter le groupe dans `apps/api/src/app.ts` :

```ts
.route("/api/tasks", taskRoutes)
```

⚠️ **Routes littérales avant routes paramétrées.** `.get("/today")` doit précéder
`.get("/:id")`, sinon `today` risque d'être capté comme un identifiant.

### 6. Les tests

Voir rule [300-tests](../../rules/300-tests.md) et
`apps/api/src/domain/folder/folder.service.spec.ts`.

Une erreur attendue se vérifie sur son statut, pas sur une classe :

```ts
await expect(service.delete("inconnu", TOKEN)).rejects.toMatchObject({ status: 404 });
```

### 7. Le client

Ajouter la section correspondante dans `packages/api-client/src/client.ts` :

```ts
readonly tasks = {
  list: (listId: string) => this.http.request<Task[]>(`/task-lists/${listId}/tasks`),
  create: (listId: string, input: CreateTask) =>
    this.http.request<Task>(`/task-lists/${listId}/tasks`, { method: "POST", body: input }),
};
```

## Vérification

```bash
npm run build:packages && npm run typecheck && npm test
```

Puis mettre à jour `docs/SUIVI-BACKLOG.md` si un point du backlog a avancé.

Enfin, relire le diff : **seules les routes et les méthodes demandées**. Un CRUD
complet quand une seule lecture était réclamée déborde du périmètre — rule
[000-general § Périmètre](../../rules/000-general.md).

## Pièges connus

| Piège                                    | Conséquence                                                    |
| ---------------------------------------- | -------------------------------------------------------------- |
| `admin` dans un Repository               | Contourne les RLS — fuite de données entre utilisateurs        |
| Oublier `accessToken`                    | Requête anonyme, RLS bloque, erreur incompréhensible           |
| `:id` non validé en UUID                 | L'identifiant part jusqu'à Postgres et ressort en 500          |
| `.get("/:id")` avant `.get("/assistant")` | La route littérale risque de n'être jamais atteinte            |
| `throw new Error(error.message)` renvoyé au client | Fuite d'une requête SQL dans la réponse HTTP         |
| Payload d'`update` construit par spread  | Écrase les colonnes non fournies avec `undefined`              |
| Type `Row` en camelCase                  | Le mapping paraît fonctionner puis renvoie `undefined` partout |
