import { Country, GameState } from "./types";
import { getCountryById, getPlayerCountry } from "./state";

/**
 * The attribute namespace usable by `*.warf-decision` files.
 *
 * Every entry can be used in three places:
 *   - `Require[].Type`              (read)
 *   - `Rewards[][0]`                (read + write)
 *   - `Result[].Rewards[].Rewards[][0]`
 *
 * Entries marked `global` live on GameState rather than on a Country, so they
 * describe the *player's* nation. When a decision resolves `To` to a non-player
 * country, a global attribute falls back to that country's closest equivalent
 * (documented per entry) rather than silently reading the player's numbers.
 */
export interface AttributeDef {
  /** The canonical name written in decision files. */
  name: string;
  /** Read the current value for `country`. */
  get: (state: GameState, country: Country) => number;
  /** Write a value back. */
  set: (state: GameState, country: Country, value: number) => void;
  /** Inclusive clamp, applied after every write. Omit for unbounded values. */
  min?: number;
  max?: number;
  /** Unit suffix for UI display. */
  unit?: string;
  global?: boolean;
}

const clamp = (v: number, min?: number, max?: number) => {
  let out = v;
  if (min !== undefined) out = Math.max(min, out);
  if (max !== undefined) out = Math.min(max, out);
  return out;
};

/** Global attributes describe the player; for others, use a stated proxy. */
function isPlayer(state: GameState, country: Country): boolean {
  return country.id === state.playerCountryId;
}

export const ATTRIBUTES: AttributeDef[] = [
  // ── Global (player-scoped) ──
  {
    name: "CountryEndurance",
    global: true,
    min: 0,
    max: 100,
    unit: "%",
    // Proxy for non-player nations: their internal stability.
    get: (s, c) => (isPlayer(s, c) ? s.nationalEndurance : c.stability),
    set: (s, c, v) => {
      if (isPlayer(s, c)) s.nationalEndurance = v;
      else c.stability = v;
    },
  },
  {
    name: "ArmyEndurance",
    global: true,
    min: 0,
    max: 100,
    unit: "%",
    // Proxy for non-player nations: their military strength.
    get: (s, c) => (isPlayer(s, c) ? s.armyEndurance : c.military),
    set: (s, c, v) => {
      if (isPlayer(s, c)) s.armyEndurance = v;
      else c.military = v;
    },
  },
  {
    name: "DiplomaticPoints",
    global: true,
    min: 0,
    max: 100,
    // AI nations have no diplomacy pool; treat theirs as full.
    get: (s, c) => (isPlayer(s, c) ? s.diplomaticPoints : 100),
    set: (s, c, v) => {
      if (isPlayer(s, c)) s.diplomaticPoints = v;
    },
  },

  // ── Truly global ──
  {
    name: "WorldCollapse",
    global: true,
    min: 0,
    max: 100,
    unit: "%",
    get: (s) => s.worldCollapse,
    set: (s, _c, v) => {
      s.worldCollapse = v;
    },
  },
  {
    name: "Day",
    global: true,
    min: 1,
    get: (s) => s.day,
    set: () => {
      /* time is not writable */
    },
  },

  // ── Country-scoped ──
  { name: "Economy", min: 0, max: 100, get: (_s, c) => c.economy, set: (_s, c, v) => { c.economy = v; } },
  { name: "Military", min: 0, max: 100, get: (_s, c) => c.military, set: (_s, c, v) => { c.military = v; } },
  { name: "Stability", min: 0, max: 100, get: (_s, c) => c.stability, set: (_s, c, v) => { c.stability = v; } },
  { name: "PublicSupport", min: 0, max: 100, unit: "%", get: (_s, c) => c.publicSupport, set: (_s, c, v) => { c.publicSupport = v; } },
  { name: "ForceValue", min: 0, max: 100, unit: "%", get: (_s, c) => c.forceValue, set: (_s, c, v) => { c.forceValue = v; } },
  { name: "Treasury", min: 0, unit: "B", get: (_s, c) => c.treasury, set: (_s, c, v) => { c.treasury = v; } },
  { name: "Population", min: 0, unit: "M", get: (_s, c) => c.population, set: (_s, c, v) => { c.population = v; } },
  { name: "Manpower", min: 0, unit: "K", get: (_s, c) => c.manpower, set: (_s, c, v) => { c.manpower = v; } },
  { name: "Nuke", min: 0, get: (_s, c) => c.nukes, set: (_s, c, v) => { c.nukes = Math.floor(v); } },
  { name: "Divisions", min: 0, get: (_s, c) => c.divisions.length, set: () => { /* use the army panel */ } },
  {
    name: "DivisionStrength",
    min: 0,
    max: 100,
    unit: "%",
    get: (_s, c) =>
      c.divisions.length === 0
        ? 0
        : Math.round(c.divisions.reduce((sum, d) => sum + d.strength, 0) / c.divisions.length),
    set: () => { /* derived */ },
  },
  {
    // Set by a decision to hand the army to the general staff. Exposed as an
    // attribute precisely so it can be driven from a .warf-decision file
    // rather than needing special-case code.
    name: "AutoArmy",
    min: 0,
    max: 1,
    get: (_s, c) => (c.autoArmy ? 1 : 0),
    set: (_s, c, v) => { c.autoArmy = v > 0; },
  },
  {
    name: "Nuclear",
    min: 0,
    max: 1,
    get: (_s, c) => (c.nuclear ? 1 : 0),
    set: (_s, c, v) => { c.nuclear = v > 0; },
  },
];

const BY_NAME = new Map(ATTRIBUTES.map((a) => [a.name.toLowerCase(), a]));

export function findAttribute(name: string): AttributeDef | undefined {
  return BY_NAME.get(name.toLowerCase());
}

/** Names offered by the decision editor / surfaced in errors. */
export function attributeNames(): string[] {
  return ATTRIBUTES.map((a) => a.name);
}

export type RequireOp = ">=" | "<=" | ">" | "<" | "==" | "!=" | "=";
export type RewardOp = "+" | "-" | "*" | "/" | "=";

/**
 * Special attributes that need both sides of the relation. `Relation` reads the
 * actor's opinion of the target, which is what a war-justification check wants.
 */
export function readRelation(state: GameState, actorId: string, targetId: string): number {
  const actor = getCountryById(state, actorId);
  return actor?.relations[targetId] ?? 0;
}

export interface AttributeError {
  message: string;
}

/** Resolve a decision file's `To` field to a concrete country. */
export function resolveTarget(
  state: GameState,
  actorId: string,
  to: string | undefined
): Country | undefined {
  const key = (to ?? "self").trim().toLowerCase();
  if (key === "self" || key === "player") return getCountryById(state, actorId);
  if (key === "target") return getCountryById(state, actorId); // set by the caller
  if (key === "enemy") {
    const actor = getCountryById(state, actorId);
    const first = actor?.atWarWith[0];
    return first ? getCountryById(state, first) : undefined;
  }
  return getCountryById(state, to!.trim().toUpperCase());
}

/** Player helper used by the reward log. */
export function playerCountry(state: GameState): Country {
  return getPlayerCountry(state);
}

export { clamp };
