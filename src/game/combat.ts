import { Country, Division, GameState, WarState } from "./types";
import { commandBonus, divisionsOf, entrenchmentRate } from "./command";

/**
 * Land combat, modelled on Hearts of Iron IV's resolution.
 *
 * The central idea, and the one this replaces a plain dice roll with:
 *
 *   **Losing organisation loses the battle; losing strength costs men.**
 *
 * A division fights until its organisation (morale, cohesion, supply) is gone,
 * at which point it disengages and a reserve takes its place in the line.
 * Strength — actual manpower and equipment — only bleeds once a division is
 * being hit while already broken, and a division at zero strength is destroyed.
 * So a battle is won by grinding the enemy's organisation down, not by killing.
 *
 * The other pieces taken from the game:
 *
 * - **Combat width.** A front only fits so many divisions. Terrain sets the
 *   frontage; every division occupies width; anything that does not fit waits
 *   in reserve and rotates in as units break.
 * - **Defence and breakthrough pools.** A defender's Defence (or an attacker's
 *   Breakthrough) absorbs incoming fire. Attacks that land under the pool
 *   mostly miss — only about a tenth get through — while attacks beyond it land
 *   at four times that rate. Concentrating more attack than the enemy can
 *   absorb is how a line is broken.
 * - **Entrenchment.** A defender that stays put digs in, raising its defence
 *   and widening the front in its favour.
 * - **Stances.** Attackers press or hold; the stance trades damage dealt for
 *   organisation burned.
 */

/** Base frontage a battle can be fought across, in width units. */
export const BASE_FRONTAGE = 80;

/** Extra frontage a defender gets for fighting from prepared positions. */
export const DEFENDER_FRONTAGE = 20;

/** Width one division occupies in the line. */
export const DIVISION_WIDTH = 20;

/** Entrenchment accrues while a side holds, up to this many days. */
export const MAX_ENTRENCHMENT = 30;

/** Attacks absorbed by the defence pool still land this often. */
const ABSORBED_HIT_RATE = 0.1;
/** Attacks beyond the defence pool land this often. */
const PENETRATING_HIT_RATE = 0.4;

export type Stance = "assault" | "hold";

export interface CombatStats {
  /** Soft attack — weight of fire. */
  attack: number;
  /** Pool that absorbs enemy fire while defending. */
  defense: number;
  /** Pool that absorbs enemy fire while attacking. */
  breakthrough: number;
  /** Frontage occupied. */
  width: number;
}

/**
 * A division's fighting characteristics.
 *
 * Derived from the owner's military rating rather than stored per division, so
 * research and industry improve the whole army at once — a division raised ten
 * years ago benefits from this year's technology.
 */
export function divisionStats(country: Country, division: Division): CombatStats {
  const tech = country.military;
  // A damaged division is proportionally worse, exactly as in the game it
  // borrows from: strength is both its manpower and its fighting power.
  const fit = Math.max(0, division.strength) / 100;
  return {
    // Attack scales with technology roughly 2.5x faster than defence does. If
    // the two scaled together, a battle between evenly matched armies would
    // never resolve: both pools would absorb the other's entire weight of fire
    // and the only damage would be the 10% trickle that gets past. Research has
    // to be able to break a deadlock, so it buys firepower.
    attack: (12 + tech * 0.3) * fit,
    defense: 10 + tech * 0.12,
    breakthrough: 8 + tech * 0.1,
    width: DIVISION_WIDTH,
  };
}

export interface Side {
  countryId: string;
  country: Country;
  /** In the line, taking and dealing fire. */
  engaged: Division[];
  /** Waiting for a slot. */
  reserve: Division[];
  /** Frontage this side can fill. */
  frontage: number;
  /** Days spent holding, which is what digs the line in. */
  entrenchment: number;
  stance: Stance;
}

export interface RoundReport {
  day: number;
  attackerOrgLost: number;
  defenderOrgLost: number;
  attackerStrengthLost: number;
  defenderStrengthLost: number;
  attackerBroken: number;
  defenderBroken: number;
  attackerDestroyed: number;
  defenderDestroyed: number;
}

/**
 * Divisions that may take the field at all.
 *
 * Only groups with an order of assault or hold are deployed; a group marked
 * reserve sits the battle out, which is how a broken formation is rested
 * without disbanding it.
 */
export function availableDivisions(country: Country): Division[] {
  const committed = country.armyGroups.filter((g) => g.order !== "reserve");
  if (committed.length === 0) return [];
  return committed.flatMap((g) => divisionsOf(country, g));
}

/** Split the deployable army into the part that fits the front and the part waiting. */
export function deploy(country: Country, frontage: number): { engaged: Division[]; reserve: Division[] } {
  // Fittest first: a broken division does not hold the line while a fresh one
  // sits in reserve.
  const ordered = [...availableDivisions(country)].sort(
    (a, b) => b.organisation + b.strength - (a.organisation + a.strength)
  );

  const engaged: Division[] = [];
  const reserve: Division[] = [];
  let used = 0;

  for (const d of ordered) {
    if (d.organisation > 0 && used + DIVISION_WIDTH <= frontage) {
      engaged.push(d);
      used += DIVISION_WIDTH;
    } else {
      reserve.push(d);
    }
  }
  return { engaged, reserve };
}

/** Average organisation of whatever is currently in the line, 0-100. */
export function sideOrganisation(side: Side): number {
  if (side.engaged.length === 0) return 0;
  const total = side.engaged.reduce((sum, d) => sum + d.organisation, 0);
  return Math.round(total / side.engaged.length);
}

/** Total manpower (K) still standing in the line. */
export function sideManpower(side: Side): number {
  return Math.round(side.engaged.reduce((sum, d) => sum + d.manpower * (d.strength / 100), 0));
}

/**
 * Sum of one side's attack, stance included.
 *
 * Assaulting raises output by 15% but swaps your Defence pool for the much
 * thinner Breakthrough one, so pressing the attack costs more than it earns
 * unless you outnumber or out-tech the defender — which is the point.
 */
function sideAttack(side: Side): number {
  const stance = side.stance === "assault" ? 1.15 : 0.75;
  const command = commandBonus(side.country).attack;
  return side.engaged.reduce(
    (sum, d) => sum + divisionStats(side.country, d).attack * stance,
    0
  ) * command;
}

/** The pool that absorbs incoming fire — Defence when holding, Breakthrough when pressing. */
function sidePool(side: Side): number {
  const entrench = side.entrenchment / MAX_ENTRENCHMENT;
  const command = commandBonus(side.country).defense;
  return side.engaged.reduce((sum, d) => {
    const s = divisionStats(side.country, d);
    return sum + (side.stance === "hold" ? s.defense * (1 + entrench * 0.35) : s.breakthrough);
  }, 0) * command;
}

/**
 * Apply a side's fire to the enemy line.
 *
 * Organisation absorbs the damage first; only what is left over hurts strength.
 * Broken divisions leave the line and are counted separately.
 */
function takeFire(
  side: Side,
  hits: number
): { orgLost: number; strengthLost: number; broken: number; destroyed: number } {
  if (side.engaged.length === 0) {
    return { orgLost: 0, strengthLost: 0, broken: 0, destroyed: 0 };
  }

  // Spread across the line; the first division in the (fittest-first) order
  // takes the brunt, which is what rotates units out.
  let remaining = hits;
  let orgLost = 0;
  let strengthLost = 0;
  const perDivision = hits / side.engaged.length;

  for (const d of side.engaged) {
    if (remaining <= 0 && perDivision > 0) break;
    const share = Math.min(perDivision, remaining);
    remaining -= share;

    const orgDamage = Math.min(d.organisation, share);
    d.organisation -= orgDamage;
    orgLost += orgDamage;

    const overflow = share - orgDamage;
    if (overflow > 0) {
      // Once broken, further fire costs men and equipment.
      const strDamage = Math.min(d.strength, overflow * 0.35);
      d.strength -= strDamage;
      strengthLost += strDamage;
    }
  }

  const broken = side.engaged.filter((d) => d.organisation <= 0).length;
  const destroyed = side.engaged.filter((d) => d.strength <= 0).length;
  return { orgLost, strengthLost, broken, destroyed };
}

/** Volume of fire, after the enemy's pool has absorbed what it can. */
function resolveFire(attack: number, pool: number): number {
  const absorbed = Math.min(attack, pool);
  const penetrating = Math.max(0, attack - pool);
  return absorbed * ABSORBED_HIT_RATE + penetrating * PENETRATING_HIT_RATE;
}

/** Remove wrecked divisions from the roster entirely. */
export function purgeDestroyed(country: Country): number {
  const before = country.divisions.length;
  country.divisions = country.divisions.filter((d) => d.strength > 0);
  return before - country.divisions.length;
}

export interface BattleSides {
  attacker: Side;
  defender: Side;
}

/** Assemble both sides of a battle from the current state. */
export function buildSides(state: GameState, war: WarState): BattleSides {
  const attackerCountry = state.countries.find((c) => c.id === war.attacker)!;
  const defenderCountry = state.countries.find((c) => c.id === war.defender)!;

  const attackerFront = BASE_FRONTAGE + (war.attackerEntrenchment > 0 ? 0 : 0);
  const defenderFront = BASE_FRONTAGE + DEFENDER_FRONTAGE;

  return {
    attacker: {
      countryId: war.attacker,
      country: attackerCountry,
      ...deploy(attackerCountry, attackerFront),
      frontage: attackerFront,
      entrenchment: war.attackerEntrenchment,
      stance: war.attackerStance,
    },
    defender: {
      countryId: war.defender,
      country: defenderCountry,
      ...deploy(defenderCountry, defenderFront),
      frontage: defenderFront,
      entrenchment: war.defenderEntrenchment,
      stance: war.defenderStance,
    },
  };
}

/**
 * One day of fighting.
 *
 * Both sides fire simultaneously, so a round cannot be won by striking first.
 * Afterwards broken units withdraw and reserves fill the gaps.
 */
export function resolveRound(state: GameState, war: WarState): RoundReport {
  const sides = buildSides(state, war);
  const a = sides.attacker;
  const d = sides.defender;

  const aAttack = sideAttack(a);
  const dAttack = sideAttack(d);
  const aPool = sidePool(a);
  const dPool = sidePool(d);

  // Fire is computed from the state before either side's damage lands.
  const hitsOnDefender = resolveFire(aAttack, dPool);
  const hitsOnAttacker = resolveFire(dAttack, aPool);

  const dTaken = takeFire(d, hitsOnDefender);
  const aTaken = takeFire(a, hitsOnAttacker);

  // Entrenchment grows while a side holds its ground and resets when it presses.
  const grow = (side: Side): number =>
    side.stance === "hold"
      ? Math.min(MAX_ENTRENCHMENT, side.entrenchment + entrenchmentRate(side.country))
      : Math.max(0, side.entrenchment - 3);

  war.attackerEntrenchment = grow(a);
  war.defenderEntrenchment = grow(d);

  war.attackerLosses += Math.round(aTaken.strengthLost + aTaken.destroyed);
  war.defenderLosses += Math.round(dTaken.strengthLost + dTaken.destroyed);

  // Headline morale, for the panels and the map banner.
  war.attackerMorale = sideOrganisation(a);
  war.defenderMorale = sideOrganisation(d);

  return {
    day: state.day,
    attackerOrgLost: Math.round(aTaken.orgLost),
    defenderOrgLost: Math.round(dTaken.orgLost),
    attackerStrengthLost: Math.round(aTaken.strengthLost),
    defenderStrengthLost: Math.round(dTaken.strengthLost),
    attackerBroken: aTaken.broken,
    defenderBroken: dTaken.broken,
    attackerDestroyed: purgeDestroyed(a.country),
    defenderDestroyed: purgeDestroyed(d.country),
  };
}

/**
 * True when a side has nothing left that can hold the line.
 *
 * Counts only divisions the player has actually committed: an army with every
 * formation on reserve has, deliberately, no line — and loses.
 */
export function isBroken(state: GameState, countryId: string): boolean {
  const country = state.countries.find((c) => c.id === countryId);
  if (!country) return true;
  return !availableDivisions(country).some((d) => d.organisation > 0 && d.strength > 0);
}

/** Organisations recover daily out of contact; this is the rest-and-refit rate. */
export function recoverOrganisation(country: Country, rate = 4): void {
  for (const d of country.divisions) {
    d.organisation = Math.min(100, d.organisation + rate);
  }
}
