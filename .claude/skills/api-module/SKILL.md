---
name: api-module
description: >
  Créer ou modifier un module domain/ dans l'API NestJS de Jean-Claude
  (apps/api). Utilise ce skill dès qu'on ajoute une entité métier — task,
  calendar, user, suggestion — ou qu'on écrit un Controller, un Service, un
  Repository, une interface de Repository ou un module NestJS. Couvre le
  découpage en 6 fichiers, le pattern Repository avec Supabase, les mappers
  toEntity, la validation Zod et l'injection par symbole.
---

# Créer un module `domain/` — API Jean-Claude

## Quand

Une nouvelle **entité métier** apparaît : `task`, `calendar`, `user`,
`suggestion`. Si le besoin croise plusieurs entités (recherche, assistant
proactif), c'est un module `feature/`, pas `domain/`.

Module de référence à copier : `apps/api/src/domain/folder/`.

## Les 6 fichiers

```
apps/api/src/domain/<entité>/
  <entité>.controller.ts            HTTP — validation Zod, zéro logique
  <entité>.service.ts               Logique métier — testable sans base
  <entité>.repository.interface.ts  Contrat + symbole d'injection
  <entité>.repository.ts            Supabase — seul fichier en snake_case
  <entité>.module.ts                Câblage
  <entité>.service.spec.ts          Tests sur doubles
```

Aucun de ces fichiers n'est optionnel, y compris le `.spec.ts`.

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

export const createTaskSchema = z.object({ title: labelSchema, /* … */ });
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

export const TASK_REPOSITORY = Symbol("ITaskRepository");
```

`accessToken` est **toujours** le dernier paramètre. Il sert à ouvrir un client
Supabase sous l'identité de l'utilisateur, pour que les RLS s'appliquent.

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

```ts
@Injectable()
export class TaskRepository implements ITaskRepository {
  constructor(private readonly supabase: SupabaseService) {}

  async findByList(listId: string, accessToken: string): Promise<Task[]> {
    const { data, error } = await this.supabase
      .forUser(accessToken)          // ← RLS actives
      .from("tasks")
      .select(COLUMNS)
      .eq("list_id", listId)
      .order("position", { ascending: true });

    if (error) throw new InternalServerErrorException(error.message);
    return (data as unknown as TaskRow[]).map(toEntity);
  }
}
```

Pour un `update`, construire le payload **clé par clé** — un `undefined` doit
laisser la colonne intacte, un `null` explicite doit l'effacer :

```ts
const payload: Record<string, unknown> = {};
if (patch.title !== undefined) payload["title"] = patch.title;
if (patch.dueAt !== undefined) payload["due_at"] = patch.dueAt;
```

Utiliser `.maybeSingle()` puis lever `NotFoundException` si `null` — `.single()`
lève une erreur Supabase brute, moins lisible.

### 4. Le Service

Il porte la logique. Il dépend du **symbole**, jamais de la classe.

```ts
@Injectable()
export class TaskService {
  constructor(@Inject(TASK_REPOSITORY) private readonly tasks: ITaskRepository) {}

  async complete(id: string, accessToken: string): Promise<Task> {
    // Les règles métier vivent ici, pas dans le Controller ni dans le Repository.
    return this.tasks.update(id, { done: true }, accessToken);
  }
}
```

### 5. Le Controller

Validation et délégation, rien d'autre.

```ts
@ApiTags("tasks")
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller("tasks")
export class TaskController {
  constructor(private readonly service: TaskService) {}

  @Post()
  @ApiOperation({ summary: "Créer une tâche" })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createTaskSchema)) body: CreateTask,
  ): Promise<Task> {
    return this.service.create(user.id, body, user.accessToken);
  }
}
```

⚠️ **Routes littérales avant routes paramétrées.** `@Get("today")` doit précéder
`@Get(":id")`, sinon `today` est capté comme un identifiant.

### 6. Le Module

```ts
@Module({
  controllers: [TaskController],
  providers: [TaskService, { provide: TASK_REPOSITORY, useClass: TaskRepository }],
  exports: [TaskService],
})
export class TaskModule {}
```

Puis l'enregistrer dans `apps/api/src/app.module.ts`, dans le bloc des modules
`domain/`.

### 7. Les tests

Voir rule [300-tests](../../rules/300-tests.md) et
`apps/api/src/domain/folder/folder.service.spec.ts`.

### 8. Le client

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

## Pièges connus

| Piège | Conséquence |
|---|---|
| `supabase.admin` dans un Repository | Contourne les RLS — fuite de données entre utilisateurs |
| Oublier `accessToken` | Requête anonyme, RLS bloque, erreur incompréhensible |
| `@Get(":id")` avant `@Get("assistant")` | La route littérale n'est jamais atteinte |
| Payload d'`update` construit par spread | Écrase les colonnes non fournies avec `undefined` |
| Type `Row` en camelCase | Le mapping paraît fonctionner puis renvoie `undefined` partout |
