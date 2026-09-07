import { fromWall, shiftDays, toWall } from "./timezone.js";

/**
 * Filet de sécurité déterministe sur l'interprétation de dates relatives en
 * français (A.3, #18).
 *
 * Le modèle calcule déjà lui-même l'échéance ISO d'une expression comme
 * « lundi prochain » (`suggest_task_list`) — mais un LLM se trompe parfois
 * dans l'arithmétique de dates, en particulier sur les jours de la semaine
 * (calculer le jour de cette semaine, déjà passé, au lieu du prochain).
 * `chrono-node`, la bibliothèque candidate évidente, reproduit exactement ce
 * défaut en français (vérifié : « vendredi » un lundi y rend le vendredi
 * précédent) — elle n'est donc pas retenue.
 *
 * Cette fonction ne couvre qu'un nombre restreint de tournures fréquentes et
 * non ambiguës. `null` sur tout le reste laisse le calcul du modèle inchangé
 * plutôt que de deviner à tort : un filet de sécurité qui invente est pire
 * qu'un filet absent.
 *
 * Toujours minuit dans le fuseau du profil, jamais une heure précise — comme
 * le calcul du modèle : « lundi prochain » n'annonce pas un rendez-vous à une
 * heure donnée.
 */
export function parseRelativeDateFr(text: string, now: Date, timeZone: string): string | null {
  const normalized = normalize(text);
  const wall = toWall(now, timeZone);
  const todayMs = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate());
  const todayDow = wall.getUTCDay();

  for (const rule of RULES) {
    const match = normalized.match(rule.pattern);
    if (!match) continue;

    const targetMs = rule.resolve(match, todayMs, todayDow);
    if (targetMs === null) continue;

    return fromWall(targetMs, timeZone).toISOString();
  }

  return null;
}

/** Espaces et tirets ne distinguent pas « week-end » de « week end ». */
function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/-/g, " ").replace(/\s+/g, " ");
}

const WEEKDAYS: Record<string, number> = {
  dimanche: 0,
  lundi: 1,
  mardi: 2,
  mercredi: 3,
  jeudi: 4,
  vendredi: 5,
  samedi: 6,
};

const NUMBER_WORDS: Record<string, number> = {
  un: 1,
  une: 1,
  deux: 2,
  trois: 3,
  quatre: 4,
  cinq: 5,
  six: 6,
  sept: 7,
  huit: 8,
  neuf: 9,
  dix: 10,
};

/** Un nombre en chiffres ou en toutes lettres, jusqu'à dix. */
const COUNT_PATTERN = `(?:${Object.keys(NUMBER_WORDS).join("|")}|\\d+)`;

function parseCount(token: string): number {
  return NUMBER_WORDS[token] ?? Number.parseInt(token, 10);
}

type Rule = {
  pattern: RegExp;
  /** `null` = expression reconnue mais non résolvable ici (cf. RULES). */
  resolve: (match: RegExpMatchArray, todayMs: number, todayDow: number) => number | null;
};

/** Prochaine occurrence du jour cible, toujours strictement après aujourd'hui. */
function nextWeekday(todayMs: number, todayDow: number, targetDow: number): number {
  const delta = (targetDow - todayDow + 7) % 7 || 7;
  return shiftDays(todayMs, delta);
}

/** Samedi du week-end en cours si on y est déjà, sinon le prochain samedi. */
function thisWeekendMs(todayMs: number, todayDow: number): number {
  return todayDow === 6 || todayDow === 0 ? todayMs : nextWeekday(todayMs, todayDow, 6);
}

const RULES: Rule[] = [
  { pattern: /^demain$/, resolve: (_m, todayMs) => shiftDays(todayMs, 1) },
  { pattern: /^après demain$/, resolve: (_m, todayMs) => shiftDays(todayMs, 2) },
  {
    pattern: /^(dimanche|lundi|mardi|mercredi|jeudi|vendredi|samedi)( prochain)?$/,
    resolve: (match, todayMs, todayDow) => {
      const day = match[1];
      const target = day === undefined ? undefined : WEEKDAYS[day];
      return target === undefined ? null : nextWeekday(todayMs, todayDow, target);
    },
  },
  {
    pattern: new RegExp(`^dans (${COUNT_PATTERN}) jours?$`),
    resolve: (match, todayMs) => shiftDays(todayMs, parseCount(match[1] as string)),
  },
  {
    pattern: new RegExp(`^dans (${COUNT_PATTERN}) semaines?$`),
    resolve: (match, todayMs) => shiftDays(todayMs, parseCount(match[1] as string) * 7),
  },
  {
    pattern: /^ce week ?end$/,
    resolve: (_m, todayMs, todayDow) => thisWeekendMs(todayMs, todayDow),
  },
  {
    pattern: /^(le )?week ?end prochain$/,
    resolve: (_m, todayMs, todayDow) => shiftDays(thisWeekendMs(todayMs, todayDow), 7),
  },
  {
    // Le vendredi de la semaine en cours, aujourd'hui compris. Un samedi ou
    // un dimanche, le week-end a déjà commencé : l'expression n'a alors plus
    // de cible non ambiguë, mieux vaut la laisser au modèle.
    pattern: /^avant le week ?end$/,
    resolve: (_m, todayMs, todayDow) =>
      todayDow === 6 || todayDow === 0 ? null : shiftDays(todayMs, (5 - todayDow + 7) % 7),
  },
];
