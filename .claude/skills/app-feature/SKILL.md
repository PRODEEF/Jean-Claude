---
name: app-feature
description: >
  Créer un écran ou une feature dans l'application Expo universelle de
  Jean-Claude (apps/app). Utilise ce skill dès qu'on ajoute une route, un
  écran, un composant, un hook React Query, ou qu'on doit gérer une divergence
  entre web, iOS et Android. Couvre l'arborescence features/, Expo Router, le
  thème, les breakpoints, react-native-web et les cibles tactiles.
---

# Créer une feature — App Jean-Claude

Un seul codebase produit le web, iOS et Android. Ce skill dit où poser quoi et
comment gérer les divergences de plateforme sans dupliquer.

## Arborescence

```
apps/app/src/
  app/                    Routes Expo Router (file-based)
    (auth)/               Parcours de connexion
    (app)/                Application authentifiée — onglets
      chat.tsx            → route /chat
  features/<nom>/
    components/           Composants propres à la feature
    hooks/                Hooks React Query de la feature
    <nom>.screen.tsx      Écran assemblé
  shared/                 Ce qui sert à plusieurs features
    ui/ hooks/ lib/ providers/
```

**Le fichier de route reste mince.** Il importe l'écran depuis `features/` :

```tsx
// app/(app)/todo.tsx
export { TodoScreen as default } from "@/features/todo/todo.screen";
```

Ce qui sert à deux features ou plus **monte** dans `shared/`.

## 1. Le hook de données

Toujours React Query, jamais `useEffect` + `useState`.

```ts
// features/todo/hooks/use-task-lists.ts
export function useTaskLists() {
  return useQuery({
    queryKey: ["task-lists"],
    queryFn: () => api.taskLists.list(),
  });
}

export function useCompleteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.tasks.complete(id),
    // Invalider plutôt que patcher le cache à la main : la source de vérité
    // reste le serveur, qui applique les règles métier.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["task-lists"] }),
  });
}
```

Clés de cache : du plus général au plus spécifique.
`["conversations"]` · `["conversation", id]` · `["conversation", id, "messages"]`.

## 2. L'écran

```tsx
export function TodoScreen() {
  const { palette } = useTheme();
  const { data, isLoading, error } = useTaskLists();

  return (
    <ScreenScaffold title="Todoliste" subtitle="Toutes vos listes.">
      {isLoading ? <ActivityIndicator color={palette.accent} /> : null}
      {error ? (
        <Text style={{ color: palette.danger }}>
          {error instanceof Error ? error.message : "Chargement impossible."}
        </Text>
      ) : null}
      {data?.map((list) => <TaskListCard key={list.id} list={list} />)}
    </ScreenScaffold>
  );
}
```

`ScreenScaffold` (`shared/ui/`) apporte l'encoche, la largeur bornée et l'en-tête.

## 3. Les divergences de plateforme

**Par taille d'écran → `useBreakpoint()`.** C'est le cas le plus fréquent.

```tsx
const breakpoint = useBreakpoint(); // "compact" (< 768 pt) | "expanded"

return breakpoint === "expanded" ? (
  <View style={styles.twoColumns}>
    <FolderSidebar />
    <ConversationList />
  </View>
) : (
  <ConversationList />   // le tiroir porte les dossiers
);
```

⚠️ **Ne jamais tester `Platform.OS` pour décider d'une taille.** Un navigateur
en fenêtre étroite doit se comporter comme un téléphone.

**Par plateforme, quand le composant est réellement différent → extensions de
fichier.** Metro choisit automatiquement.

```
month-calendar.web.tsx      Grille dense, survol, raccourcis clavier
month-calendar.native.tsx   Gestes de balayage, feuille modale
month-calendar.tsx          Fallback partagé (facultatif)
```

À réserver aux vraies divergences. Un écart de padding se règle avec un jeton,
pas avec deux fichiers.

## 4. Le style

```tsx
const { palette } = useTheme();

<Pressable
  style={({ pressed }) => [
    styles.button,
    { backgroundColor: palette.accent, opacity: pressed ? 0.85 : 1 },
  ]}
  accessibilityRole="button"
  accessibilityLabel="Créer une liste"
>
```

- Couleurs : **toujours** `palette`, jamais de valeur en dur — la couleur de
  l'assistant est configurable par l'utilisateur
- Espacements, rayons, tailles : jetons de `@jc/design`
- Zone cliquable : au moins `MIN_TOUCH_TARGET` (44 pt)
- Contenus : borner avec `maxWidth` — la même vue sert un téléphone et un
  écran 27 pouces
- Vérifier le rendu en clair **et** en sombre

## 5. Ce qui ne va pas dans un écran

| ❌ | ✅ |
|---|---|
| Décider quelle conversation va dans quel dossier | L'API le décide |
| Filtrer/trier une liste métier en JS | Le serveur renvoie déjà trié |
| Appeler `fetch` | `@jc/api-client` |
| Écrire dans Supabase | L'API |
| Une règle produit (bornage, suggestion) | L'API — sinon web et mobile divergent |

## Vérification

```bash
npm run typecheck --workspace @jc/app
```

Puis tester réellement : `npm run dev:web`, et au moins un simulateur mobile.
Le §0.1 demande une démonstration quotidienne, même partielle — voir skill
[daily-report](../daily-report/SKILL.md).

## Avant de trancher un placement d'élément

Règle des 3 apps de référence (§4.2) → skill
[ui-decision](../ui-decision/SKILL.md). Ne pas décider à l'intuition.
