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
  /**
   * Implémentation de `fetch` à utiliser. Par défaut celle de la plateforme.
   *
   * Le `fetch` global de React Native ne sait pas lire un corps de réponse en
   * flux : l'app y injecte celui d'`expo/fetch`. Le paramètre existe pour que
   * ce package reste importable tel quel par le web, le mobile et le desktop,
   * sans y faire entrer de dépendance de plateforme.
   */
  fetchImpl?: typeof fetch;
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
    const response = await this.send(path, "application/json", init);

    if (response.status === 204) return undefined as T;

    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) throw toApiError(response.status, payload);

    return payload as T;
  }

  /**
   * Variante de `request` qui rend le corps au fil de son arrivée.
   *
   * Nécessaire parce que `request` attend la réponse entière avant de la
   * parser, ce qui annule tout l'intérêt d'un flux. Le format est celui des
   * Server-Sent Events : des blocs `data: …` séparés par une ligne vide.
   */
  async *stream(path: string, init: RequestOptions = {}): AsyncGenerator<string> {
    const response = await this.send(path, "text/event-stream", init);

    if (!response.ok) {
      const payload: unknown = await response.json().catch(() => null);
      throw toApiError(response.status, payload);
    }

    const body = response.body;
    if (!body) throw new ApiError(response.status, "Réponse en flux illisible.");

    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Un fragment réseau peut couper un événement en deux : on ne rend que
        // les blocs terminés, et on garde le reste pour le tour suivant.
        let separator = buffer.indexOf("\n\n");
        while (separator !== -1) {
          const block = buffer.slice(0, separator);
          buffer = buffer.slice(separator + 2);

          if (block.startsWith("data: ")) yield block.slice(6);

          separator = buffer.indexOf("\n\n");
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private async send(path: string, accept: string, init: RequestOptions): Promise<Response> {
    const { method = "GET", body, query, signal } = init;

    const url = new URL(`${this.options.baseUrl.replace(/\/$/, "")}/api${path}`);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    const token = await this.options.getAccessToken();
    const headers: Record<string, string> = { Accept: accept };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const response = await (this.options.fetchImpl ?? fetch)(url.toString(), {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      ...(signal ? { signal } : {}),
    });

    if (response.status === 401) {
      this.options.onUnauthorized?.();
      throw new ApiError(401, "Session expirée. Reconnexion nécessaire.");
    }

    return response;
  }
}

function toApiError(status: number, payload: unknown): ApiError {
  const details = (payload ?? {}) as { message?: string; errors?: Record<string, string[]> };
  return new ApiError(status, details.message ?? "La requête a échoué.", details.errors);
}
