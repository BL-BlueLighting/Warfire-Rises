import { Country, GameState } from "./types";
import { t } from "../i18n";

/**
 * Localised display name for a nation.
 *
 * The lang files carry `country.<ID>.name` translations, but the original CLI
 * edition always printed the English `country.name` and never consulted them.
 * Falls back to the English name when a translation is absent.
 *
 * A historical scenario renames the nations it needs to — 1938's China is the
 * Republic, its Russia the Soviet Union — by pointing `nameKey` at that era's
 * translations, so the same lookup serves both.
 */
export function countryName(c: Country | undefined | null): string {
  if (!c) return "";
  const key = `${c.nameKey ?? `country.${c.id}`}.full`;
  const value = t(key);
  return value === key ? c.name : value;
}

/**
 * The everyday short name (中国, Germany).
 *
 * Used inside generated prose — battle reports, event descriptions — where the
 * official name would swamp the sentence ("大不列颠及北爱尔兰联合王国 击退了
 * 朝鲜民主主义人民共和国 的进攻"). Labels, lists and headers use the full name.
 */
export function countryShortName(c: Country | undefined | null): string {
  if (!c) return "";
  const key = `${c.nameKey ?? `country.${c.id}`}.name`;
  const value = t(key);
  return value === key ? c.name : value;
}

/**
 * The nation's blurb, in the scenario being played.
 *
 * A 1938 Soviet Union is a country of peasants and five-year plans, not the
 * nuclear power the modern blurb describes; the era writes its own and points
 * `descKey` at it. Scenarios that have not written one fall back to the
 * modern text, which is what every campaign used before there were eras.
 */
export function countryDesc(c: Country | undefined | null): string {
  if (!c) return "";
  const key = c.descKey ?? c.description;
  const value = t(key);
  return value === key ? t(c.description) : value;
}

export function countryNameById(state: GameState | null, id: string | undefined): string {
  if (!state || !id) return "";
  return countryName(state.countries.find((c) => c.id === id));
}

/** "🇨🇳 China" — flag plus localised name. */
export function countryLabel(c: Country | undefined | null): string {
  return c ? `${c.flag} ${countryName(c)}` : "";
}

export function countryLabelById(state: GameState | null, id: string | undefined): string {
  if (!state || !id) return "";
  return countryLabel(state.countries.find((c) => c.id === id));
}
