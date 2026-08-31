/**
 * Transport HTTP.
 *
 * S'appuie sur `fetch` seul, disponible nativement sur les trois cibles
 * (navigateur, Hermes/React Native, Node 20+). Aucune dépendance à axios ou
 * à une API de plateforme : c'est ce qui permet à ce package d'être importé
 * tel quel par le web, le mobile et le desktop.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Erreurs de validation par champ, renvoyées par le pipe Zod du backend. */
    readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type ApiClientOptions = {
  baseUrl: string;
  /**
   * Fourni par l'appelant plutôt que stocké ici : le jeton vit dans le
   * SecureStore sur mobile et dans le stockage du navigateur sur web, deux
   * mécanismes que ce package n'a pas à connaître.
   */
  getAccessToken: () => Promise<string | null> | string | null;
  /** Appelé sur 401, pour déclencher une reconnexion côté application. */
  onUnauthorized?: () => void;
};

export type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
};

export class HttpClient {
  constructor(private readonly options: ApiClientOptions) {}

  async request<T>(path: string, init: RequestOptions = {}): Promise<T> {
    const { method = "GET", body, query, signal } = init;

    const url = new URL(`${this.options.baseUrl.replace(/\/$/, "")}/api${path}`);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    const token = await this.options.getAccessToken();
    const headers: Record<string, string> = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const response = await fetch(url.toString(), {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      ...(signal ? { signal } : {}),
    });

    if (response.status === 401) {
      this.options.onUnauthorized?.();
      throw new ApiError(401, "Session expirée. Reconnexion nécessaire.");
    }

    if (response.status === 204) return undefined as T;

    const payload: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      const details = (payload ?? {}) as { message?: string; errors?: Record<string, string[]> };
      throw new ApiError(
        response.status,
        details.message ?? "La requête a échoué.",
        details.errors,
      );
    }

    return payload as T;
  }
}
