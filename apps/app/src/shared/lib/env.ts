/**
 * Variables d'environnement côté client.
 *
 * Le préfixe `EXPO_PUBLIC_` est obligatoire pour qu'Expo les inclue dans le
 * bundle — ce qui signifie qu'elles sont publiques. Aucune clé secrète ici :
 * la clé du moteur IA reste côté serveur, c'est l'une des raisons d'être de
 * l'API commune du §5.3.
 */
function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Variable d'environnement manquante : ${name}. Voir .env.example à la racine.`,
    );
  }
  return value;
}

export const env = {
  apiUrl: required("EXPO_PUBLIC_API_URL", process.env.EXPO_PUBLIC_API_URL),
  supabaseUrl: required("EXPO_PUBLIC_SUPABASE_URL", process.env.EXPO_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: required(
    "EXPO_PUBLIC_SUPABASE_ANON_KEY",
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  ),
} as const;
