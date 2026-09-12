import { Country, Division, GameState } from "./types";
import { getCountryById } from "./state";
import { t } from "../i18n";

/**
 * Manpower and divisions.
 *
 * Manpower is measured in **thousands of people** and is drawn from a pool
 * capped by the nation's population. Recruiting a division commits manpower
 * permanently — it stays with the division until it is disbanded — so the
 * army is a real, finite commitment rather than a number that goes up.
 */

/** Manpower (K) needed before a war may be declared. */
export const WAR_MIN_MANPOWER = 500;

/** Manpower (K) committed per division. */
export const DIVISION_MANPOWER = 50;

/** Treasury ($B) per division. */
export const DIVISION_COST = 80;

/** Days to raise one division. */
export const DIVISION_DAYS = 30;

/** i18n key explaining the war-manpower rule to the player. */
export const ARMY_MIN_NOTE = "ui.army.min_note";

/** Share of the population that can ever be mobilised (1%). */
const MOBILISATION_RATE = 0.01;

/** Daily manpower regeneration, as a share of the cap. */
const REGEN_RATE = 0.001;

/** Manpower cap in thousands: 1% of a population measured in millions. */
export function manpowerCap(country: Country): number {
  return Math.floor(country.population * 1_000_000 * MOBILISATION_RATE / 1000);
}

/** Manpower (K) locked up in standing divisions. */
export function armyManpower(country: Country): number {
  return country.divisions.reduce((sum, d) => sum + d.manpower, 0);
}

/** Uncommitted manpower still in the pool. */
export function availableManpower(country: Country): number {
  return Math.max(0, Math.floor(country.manpower));
}

/** Average fighting strength across the army, 0-100. */
export function armyStrength(country: Country): number {
  if (country.divisions.length === 0) return 0;
  return Math.round(country.divisions.reduce((s, d) => s + d.strength, 0) / country.divisions.length);
}

/** Average organisation across the army, 0-100. */
export function armyOrganisation(country: Country): number {
  if (country.divisions.length === 0) return 0;
  return Math.round(country.divisions.reduce((s, d) => s + d.organisation, 0) / country.divisions.length);
}

/**
 * Combat modifier derived from the standing army. Ten divisions (the minimum
 * for a war) is worth +10; the effect is capped at +15 so a huge army cannot
 * trivially outweigh military tech and morale.
 */
export function divisionBonus(country: Country): number {
  return Math.min(15, armyManpower(country) / 50);
}

/** True when the nation has committed enough troops to go to war. */
export function meetsWarManpower(country: Country): boolean {
  return armyManpower(country) >= WAR_MIN_MANPOWER;
}

// ── Daily tick ─────────────────────────────────────────────────────

/** Regenerate the manpower pool and rest/repair the standing army. */
export function tickArmy(state: GameState, countryId: string): void {
  const c = getCountryById(state, countryId);
  if (!c) return;

  const cap = manpowerCap(c);
  const regen = Math.max(1, Math.round(cap * REGEN_RATE));
  c.manpower = Math.min(cap, c.manpower + regen);

  // Units in contact do not rest — organisation is what a battle is fought
  // over, so regenerating it mid-fight would make battles unwinnable.
  const fighting = c.atWarWith.length > 0;
  if (fighting) return;

  for (const d of c.divisions) {
    d.organisation = Math.min(100, d.organisation + 4);
    d.strength = Math.min(100, d.strength + 0.6);
  }
}

// ── Recruitment ────────────────────────────────────────────────────

export interface RecruitCheck {
  ok: boolean;
  reason?: string;
}

export function canRecruit(state: GameState, countryId: string, count: number): RecruitCheck {
  const c = getCountryById(state, countryId);
  if (!c) return { ok: false, reason: t("ui.toast.select_country") };
  if (count < 1) return { ok: false, reason: t("ui.army.bad_count") };
  if (availableManpower(c) < DIVISION_MANPOWER * count) {
    return { ok: false, reason: t("ui.army.no_manpower", { n: DIVISION_MANPOWER * count }) };
  }
  if (c.treasury < DIVISION_COST * count) {
    return { ok: false, reason: t("ui.cost.need_treasury", { n: DIVISION_COST * count }) };
  }
  return { ok: true };
}

/** Manpower is committed at the moment the order is given, not on delivery. */
export function startRecruit(
  state: GameState,
  countryId: string,
  count: number
): { ok: boolean; message: string } {
  const check = canRecruit(state, countryId, count);
  if (!check.ok) return { ok: false, message: check.reason ?? "" };

  const c = getCountryById(state, countryId)!;
  c.manpower -= DIVISION_MANPOWER * count;
  c.treasury -= DIVISION_COST * count;

  const days = DIVISION_DAYS * count;
  state.tasks.push({
    id: ++state.taskIdCounter,
    kind: "recruit",
    labelKey: "task.recruit",
    labelParams: { n: count },
    icon: "🎖",
    actorId: countryId,
    startTime: state.clock.time,
    endTime: state.clock.time + days,
    cancellable: true,
    payload: { type: "recruit", countryId, divisions: count, manpowerEach: DIVISION_MANPOWER },
  });

  return { ok: true, message: t("ui.army.recruiting", { n: count, days }) };
}

const ORDINALS_EN = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th"];

/** Localised division name. English keeps ordinals; Chinese uses 第 N 师. */
export function divisionName(index: number): string {
  const n = index + 1;
  const ordinal = ORDINALS_EN[index];
  return t("ui.army.division_name", {
    n,
    ordinal: ordinal ?? `${n}th`,
  });
}

/** A fresh division, in exactly the state the recruit action produces them. */
function makeDivision(state: GameState, index: number, manpower: number): Division {
  return {
    id: ++state.divisionIdCounter,
    name: divisionName(index),
    manpower,
    strength: 70,
    organisation: 100,
  };
}

export function completeRecruit(
  state: GameState,
  countryId: string,
  count: number,
  manpowerEach: number
): string {
  const c = getCountryById(state, countryId);
  if (!c) return "";
  for (let i = 0; i < count; i++) {
    c.divisions.push(makeDivision(state, c.divisions.length, manpowerEach));
  }
  return t("ui.army.recruited", { n: count });
}

/**
 * Bring a nation's army to `target` divisions, raising or disbanding as needed.
 *
 * The `Divisions` decision attribute writes the count directly, so the units
 * behind it have to be made real: a division that was never recruited still
 * needs a name, a manpower commitment and a state to fight in. Disbanding also
 * prunes the army groups that pointed at the departed units.
 */
export function setDivisionCount(state: GameState, countryId: string, target: number): void {
  const c = getCountryById(state, countryId);
  if (!c) return;
  const want = Math.max(0, Math.floor(target));

  while (c.divisions.length < want) {
    c.divisions.push(makeDivision(state, c.divisions.length, DIVISION_MANPOWER));
  }
  if (c.divisions.length > want) {
    c.divisions = c.divisions.slice(0, want);
    const alive = new Set(c.divisions.map((d) => d.id));
    for (const group of c.armyGroups) {
      group.divisionIds = group.divisionIds.filter((id) => alive.has(id));
    }
  }
}

export function disbandDivision(
  state: GameState,
  countryId: string,
  divisionId: number
): { ok: boolean; message: string } {
  const c = getCountryById(state, countryId);
  if (!c) return { ok: false, message: "" };
  const idx = c.divisions.findIndex((d) => d.id === divisionId);
  if (idx === -1) return { ok: false, message: t("ui.army.not_found") };

  const [division] = c.divisions.splice(idx, 1);
  // Manpower returns to the pool over time rather than instantly.
  c.manpower = Math.min(manpowerCap(c), c.manpower + division.manpower * 0.5);
  return { ok: true, message: t("ui.army.disbanded", { name: division.name }) };
}

export { DIVISION_DAYS as RECRUIT_DAYS };
