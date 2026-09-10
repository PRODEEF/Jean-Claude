import { admin, forUser } from "../supabase/supabase.js";
import type { RateLimitCounters, RateLimitWindows } from "./rate-limit-policy.js";

/** Ligne Postgres — snake_case, telle que renvoyée par Supabase. */
type RateLimitRow = {
  minute_window_start: string;
  minute_count: number;
  hour_window_start: string;
  hour_count: number;
};

const COLUMNS = "minute_window_start, minute_count, hour_window_start, hour_count";

function toCounters(row: RateLimitRow | null): RateLimitCounters {
  if (!row) return null;

  return {
    minuteWindowStart: new Date(row.minute_window_start),
    minuteCount: row.minute_count,
    hourWindowStart: new Date(row.hour_window_start),
    hourCount: row.hour_count,
  };
}

export const rateLimitRepository = {
  async find(userId: string, accessToken: string): Promise<RateLimitCounters> {
    const { data, error } = await forUser(accessToken)
      .from("llm_rate_limits")
      .select(COLUMNS)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return toCounters(data as unknown as RateLimitRow | null);
  },

  /**
   * **Exception documentée et isolée** à la règle 100-api / `core/supabase/supabase.ts`
   * (« `admin` contourne les RLS, réservé aux traitements système, jamais
   * dans un Repository appelé depuis une requête HTTP ») : depuis la
   * restriction de la policy RLS à la lecture seule (migration
   * `llm_rate_limits_restrict_rls.sql`), le jeton de l'utilisateur n'a plus
   * le droit d'écrire sur `llm_rate_limits` — c'est tout l'objet de ce
   * correctif. `userId` vient toujours du middleware d'authentification,
   * jamais d'un paramètre de route : pas de fuite possible entre comptes
   * malgré le contournement des RLS.
   *
   * Une seule ligne par utilisateur : la sauvegarde remplace toujours l'état
   * courant.
   */
  async save(userId: string, windows: RateLimitWindows): Promise<void> {
    const { error } = await admin.from("llm_rate_limits").upsert({
      user_id: userId,
      minute_window_start: windows.minuteWindowStart.toISOString(),
      minute_count: windows.minuteCount,
      hour_window_start: windows.hourWindowStart.toISOString(),
      hour_count: windows.hourCount,
    });

    if (error) throw new Error(error.message);
  },
};
