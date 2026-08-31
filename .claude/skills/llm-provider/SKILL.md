---
name: llm-provider
description: >
  Changer ou ajouter un moteur IA dans Jean-Claude — Mistral, DeepSeek, Qwen,
  ou faire évoluer l'adaptateur Vercel AI Gateway. Utilise ce skill dès qu'on
  touche à core/llm, qu'on appelle un modèle, qu'on définit un outil (tool
  use), ou qu'on se demande comment brancher un autre fournisseur. Couvre le
  port LlmProvider, le Gateway, la fabrique, la souveraineté des données et
  les outils de suggestion proactive.
---

# Brancher un moteur IA

Le §5.1 exige de pouvoir ajouter Mistral, DeepSeek ou Qwen **sans réécriture
majeure**. C'est garanti par un port — `apps/api/src/core/llm/llm.port.ts` —
branché sur **Vercel AI Gateway**, qui expose tous ces éditeurs derrière une
clé unique.

## Changer de moteur : une variable, zéro ligne de code

```bash
LLM_MODEL=mistral/mistral-large      # souverain (§8, §13.4.6)
LLM_MODEL=deepseek/deepseek-chat
LLM_MODEL=anthropic/claude-opus-5    # défaut
```

**C'est tout.** N'écris pas de `MistralProvider` : le Gateway route déjà vers
Mistral, et un adaptateur de plus serait du code mort. La suite de ce document
ne concerne que le cas — encore hypothétique — d'un moteur _hors_ Gateway.

## La règle absolue

**Un seul fichier de l'application importe le SDK d'un fournisseur :
son adaptateur dans `core/llm/providers/`.**

Partout ailleurs, on injecte le port :

```ts
constructor(@Inject(LLM_PROVIDER) private readonly llm: LlmProvider) {}
```

Si un `import ... from "ai"` ou le SDK d'un éditeur apparaît hors de
`core/llm/providers/`, la contrainte du §5.1 est cassée.

## Ajouter un fournisseur hors Gateway — 3 étapes

⚠️ **À ne faire que si le modèle visé n'est pas routable par le Gateway** :
modèle auto-hébergé, Ollama en local, ou appel direct imposé par contrat.
Sinon, voir la section précédente.

### 1. L'adaptateur

```ts
// core/llm/providers/mistral.provider.ts
@Injectable()
export class MistralProvider implements LlmProvider {
  readonly name = "mistral";
  /** Mistral héberge en UE — à signaler à l'utilisateur (§5.1, §13.4.6). */
  readonly isSovereign = true;

  private readonly logger = new Logger(MistralProvider.name);

  constructor(config: ConfigService) {
    const apiKey = config.get<string>("mistralApiKey");
    if (!apiKey) throw new Error("MISTRAL_API_KEY est requis lorsque LLM_PROVIDER=mistral.");
    // …
  }

  async complete(request: LlmCompletionRequest): Promise<LlmCompletionResponse> {
    /* … */
  }
  async *stream(request: LlmCompletionRequest): AsyncIterable<LlmStreamChunk> {
    /* … */
  }
}
```

### 2. La fabrique

```ts
// core/llm/llm.module.ts
switch (name) {
  case "gateway":
    return new GatewayProvider(config);
  case "mistral":
    return new MistralProvider(config); // ← ajout
  default:
    throw new Error(`LLM_PROVIDER inconnu : "${name}".`);
}
```

Le `default` lève au démarrage plutôt que de replier silencieusement : un
`LLM_PROVIDER` mal orthographié en production doit se voir immédiatement, pas
se traduire par une facturation inattendue chez un autre fournisseur.

### 3. La configuration

```ts
// core/config/configuration.ts
mistralApiKey: optional("MISTRAL_API_KEY", ""),
```

Puis `LLM_PROVIDER=mistral` dans `.env`, et documenter la variable dans
`.env.example`.

**Aucun fichier métier n'est touché.**

## Contrat à respecter

| Membre        | Obligation                                                                                                                              |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `name`        | Identifiant court, même valeur que `LLM_PROVIDER`                                                                                       |
| `isSovereign` | `true` si hébergement **et** opérateur en France/UE. Mistral oui, Claude non. Se lit sur l'**éditeur** du modèle, jamais sur le routeur |
| `complete()`  | Réponse complète, avec `toolCalls` extraits                                                                                             |
| `stream()`    | Flux de texte, puis les `tool_call`, puis un chunk `done`                                                                               |

**Toujours convertir l'erreur du fournisseur.** Elle peut contenir des
fragments de prompt, donc des données utilisateur :

```ts
catch (error) {
  this.logger.error("Échec de l'appel", error instanceof Error ? error.stack : error);
  throw new ServiceUnavailableException("Le moteur IA est momentanément indisponible.");
}
```

**Remonter `provider` et `model` dans la réponse.** Ils sont persistés sur
chaque message : le modèle peut changer en cours de fil, et il faut savoir qui
a produit quoi. `provider` porte l'**éditeur** (`anthropic`, `mistral`) et non
`gateway` — un routeur ne produit rien.

## Les outils (tool use)

Les suggestions proactives du §12.1 passent par le _tool use_, **pas** par une
analyse du texte de réponse. Demander au modèle d'appeler `suggest_task_list`
donne une sortie structurée et vérifiable ; parser « on dirait qu'une liste se
dessine » en langage naturel serait fragile.

Outils définis dans `core/llm/llm.tools.ts`. Leurs descriptions sont **lues par
le modèle** : les rédiger avec autant de soin qu'un prompt.

```ts
export const SUGGEST_TASK_LIST: LlmTool = {
  name: "suggest_task_list",
  description:
    "À appeler quand la conversation fait émerger une ou plusieurs listes " +
    "actionnables. Créer une entrée par liste distincte : une conversation " +
    "sur des travaux de jardin produit typiquement une liste d'achats ET une " +
    "liste de tâches, qui ne doivent pas être fusionnées.",
  inputSchema: {/* JSON Schema */},
};
```

⚠️ **Un appel d'outil n'exécute rien.** Il devient une suggestion en attente
dans `assistant_suggestions`, que l'utilisateur accepte ou ignore. Voir rule
[400-produit](../../rules/400-produit.md).

Tous les fournisseurs ne gèrent pas le tool use de la même façon. Si un
fournisseur ne le supporte pas, l'adaptateur doit renvoyer `toolCalls: []`
plutôt que d'échouer — la conversation reste utilisable, seule la proactivité
est dégradée.

## Souveraineté

`isSovereign` est exposé par `GET /api/health` et destiné à être affiché à
l'utilisateur : il doit pouvoir savoir si le modèle qui traite ses données de
santé ou administratives est hébergé en UE. Exigence croisée §5.1 / §13.4.6.

## Vérification

```bash
npm run typecheck --workspace @jc/api
npm test --workspace @jc/api
curl http://localhost:3000/api/health   # doit refléter le modèle actif
```

Après un changement de `LLM_MODEL`, vérifier que `sovereign` bascule bien :
`mistral/*` → `true`, tout le reste → `false`.
