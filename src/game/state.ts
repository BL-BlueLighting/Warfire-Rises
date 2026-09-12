import { ConquestRecord, GameState, ExchangeRates, WarState, Division } from "./types";
import { COUNTRIES, STARTING_NUKES, DIVISIONS_BY_POWER } from "./countries";
import { makeGenerals, makeInitialGroups } from "./command";
import { t } from "../i18n";
import { DEFAULT_DIFFICULTY, profileFor } from "./difficulty";

export function createInitialState(keywords: string[], rates: ExchangeRates): GameState {
  let divisionId = 0;

  const countries = COUNTRIES.map((c) => {
    const startingDivisions = DIVISIONS_BY_POWER[c.power] ?? 4;
    const divisions: Division[] = Array.from({ length: startingDivisions }, (_, i) => ({
      id: ++divisionId,
      name: t("ui.army.division_name", { n: i + 1, ordinal: `${i + 1}th` }),
      manpower: 50,
      strength: 85,
      organisation: 100,
    }));

    const generals = makeGenerals(c.id);

    return {
      ...c,
      relations: { ...c.relations },
      allies: [...c.allies],
      enemies: [...c.enemies],
      atWarWith: [...c.atWarWith],
      researched: [...c.researched],
      buildings: [...c.buildings],
      warGoals: [...c.warGoals],
      divisions,
      generals,
      armyGroups: [] as GameState["countries"][number]["armyGroups"],
      // Nuclear powers keep a starting arsenal; everyone else starts empty.
      nukes: STARTING_NUKES[c.id] ?? 0,
      nukeProgress: 0,
      // Manpower pool starts full — 1% of population, in thousands.
      manpower: Math.floor(c.population * 1_000_000 * 0.01 / 1000),
    };
  });

  // One group per nation holding its whole army, built after the countries
  // exist so it can reference them.
  for (const country of countries) {
    country.armyGroups = makeInitialGroups(country, country.generals);
  }

  return {
    phase: "playing",
    day: 1,
    playerCountryId: "USA",
    countries,
    events: [],
    worldCollapse: 8,
    worldCollapseRaw: 8,
    diplomaticPoints: 100,
    armyEndurance: 100,
    nationalEndurance: 100,
    exchangeRates: rates,
    worldKeywords: keywords,
    briefing: [],
    log: [],
    conquered: null,
    defeatedCountries: [],
    eventIdCounter: 0,
    activeWar: null,
    warHistory: [],

    difficulty: DEFAULT_DIFFICULTY,
    regionOwner: {},
    conference: null,
    clock: { time: 1, speed: 2, lastSpeed: 2 },
    tasks: [],
    taskIdCounter: 0,
    divisionIdCounter: divisionId,
    decisionStates: {},
  };
}

/** Highest speed tier offered by the UI. */
export const MAX_SPEED = 5;

/** Game-days advanced per real second at each speed tier (index 0 = paused). */
export const SPEED_RATES = [0, 0.25, 0.5, 1, 2, 5];

export function setSpeed(state: GameState, speed: number): void {
  const clamped = Math.max(0, Math.min(MAX_SPEED, Math.round(speed)));
  if (clamped > 0) state.clock.lastSpeed = clamped;
  state.clock.speed = clamped;
}

export function togglePause(state: GameState): void {
  setSpeed(state, state.clock.speed === 0 ? state.clock.lastSpeed || 2 : 0);
}

export function getPlayerCountry(state: GameState) {
  return state.countries.find((c) => c.id === state.playerCountryId)!;
}

export function getCountryById(state: GameState, id: string) {
  return state.countries.find((c) => c.id === id);
}

export function regeneratePoints(state: GameState): void {
  const strain = collapseStrain(state) * profileFor(state).playerRegen;
  state.diplomaticPoints = Math.min(100, state.diplomaticPoints + 8 * strain);
  state.armyEndurance = Math.min(100, state.armyEndurance + 5 * strain);
  // Force value decays slightly each day
  const p = getPlayerCountry(state);
  p.forceValue = Math.max(0, p.forceValue - 2);
}

/**
 * Multiplier applied to every World Collapse gain.
 *
 * Pacing is set by how often events fire (see DAILY_EVENT_CHANCE), not by this
 * value — it exists as a single dial for tuning campaign length. Gains are
 * accumulated fractionally in `worldCollapseRaw` because the daily background
 * tick is deliberately sub-1.
 */
export const COLLAPSE_SCALE = 1;

/**
 * World Collapse is a pressure gauge, not a countdown to an ending.
 *
 * It caps at 100 and stays there; the campaign only ends when the player's own
 * nation is conquered. The cost of a burning world is paid in the daily
 * regeneration of diplomatic points and army endurance — see
 * `regeneratePoints`.
 */
export function applyCollapse(state: GameState, amount: number, reason: string): void {
  // Difficulty scales how fast the world comes apart; amount only carries the
  // relative weight of this particular act.
  const scaled = amount * COLLAPSE_SCALE * profileFor(state).collapseRate;
  state.worldCollapseRaw = Math.min(100, Math.max(0, state.worldCollapseRaw + scaled));
  state.worldCollapse = Math.floor(state.worldCollapseRaw);
  state.log.push(`[WC ${state.worldCollapse}%] ${reason}`);
}

/** Fraction of normal regeneration, throttled as the world comes apart. */
export function collapseStrain(state: GameState): number {
  if (state.worldCollapse < 60) return 1;
  // Falls to 40% of normal at 100%.
  return 1 - ((state.worldCollapse - 60) / 40) * 0.6;
}

export function adjustRelation(
  state: GameState,
  countryA: string,
  countryB: string,
  amount: number
): void {
  const a = getCountryById(state, countryA);
  const b = getCountryById(state, countryB);
  if (!a || !b) return;

  if (!(countryB in a.relations)) a.relations[countryB] = 0;
  if (!(countryA in b.relations)) b.relations[countryA] = 0;

  a.relations[countryB] = Math.max(-100, Math.min(100, a.relations[countryB] + amount));
  b.relations[countryA] = Math.max(-100, Math.min(100, b.relations[countryA] + amount));

  if (a.relations[countryB] >= 75 && !a.allies.includes(countryB)) {
    a.allies.push(countryB);
  }
  if (a.relations[countryB] <= -75 && !a.enemies.includes(countryB)) {
    a.enemies.push(countryB);
  }
  if (a.relations[countryB] < 75 && a.allies.includes(countryB)) {
    a.allies = a.allies.filter((x) => x !== countryB);
  }
  if (a.relations[countryB] > -75 && a.enemies.includes(countryB)) {
    a.enemies = a.enemies.filter((x) => x !== countryB);
  }
}

export function addForce(state: GameState, countryId: string, amount: number): void {
  const c = getCountryById(state, countryId);
  if (!c) return;
  c.forceValue = Math.min(100, Math.max(0, c.forceValue + amount));
}

export function addPublicSupport(state: GameState, countryId: string, amount: number): void {
  const c = getCountryById(state, countryId);
  if (!c) return;
  c.publicSupport = Math.min(100, Math.max(0, c.publicSupport + amount));
}

export function createWarState(attacker: string, defender: string, day: number): WarState {
  return {
    active: true,
    attacker,
    defender,
    dayStarted: day,
    attackerMorale: 100,
    defenderMorale: 100,
    attackerLosses: 0,
    defenderLosses: 0,
    battles: [],
    phase: "preparing",
    winner: null,
    attackerStance: "assault",
    defenderStance: "hold",
    attackerEntrenchment: 0,
    defenderEntrenchment: 0,
  };
}

/**
 * The player's nation has been conquered. Loot it, mark it out of play, and
 * end the war. The campaign itself continues — the player picks a successor.
 */
export function declareConquest(state: GameState, byCountryId: string): ConquestRecord {
  const player = getPlayerCountry(state);
  const record: ConquestRecord = {
    countryId: player.id,
    by: byCountryId,
    day: state.day,
    divisionsLost: player.divisions.length,
  };

  player.divisions = [];
  player.military = Math.max(0, Math.round(player.military * 0.2));
  player.economy = Math.max(0, Math.round(player.economy * 0.3));
  player.stability = Math.max(0, Math.round(player.stability * 0.2));
  player.nukes = 0;
  player.warGoals = [];
  player.atWarWith = [];

  if (!state.defeatedCountries.includes(player.id)) {
    state.defeatedCountries.push(player.id);
  }

  // The old regime's orders die with it.
  state.tasks = [];
  if (state.activeWar) {
    state.warHistory.push({ ...state.activeWar, active: false, phase: "ended" });
    state.activeWar = null;
  }

  state.conquered = record;
  state.phase = "gameover";
  state.log.push(`[CONQUEST] ${player.name} fell to ${byCountryId} on day ${state.day}`);
  return record;
}

/** Nations the player may still take over. */
export function successorCandidates(state: GameState) {
  return state.countries.filter((c) => !state.defeatedCountries.includes(c.id));
}

/**
 * Continue the same campaign as another nation.
 *
 * The world — day, collapse, relations, every other country's state — carries
 * over untouched; only the player's affairs reset.
 */
export function continueAs(state: GameState, countryId: string): boolean {
  const next = getCountryById(state, countryId);
  if (!next || state.defeatedCountries.includes(countryId)) return false;

  state.playerCountryId = countryId;
  state.conquered = null;
  state.phase = "playing";

  // Pools belong to the nation, so the new one starts fresh.
  state.diplomaticPoints = 100;
  state.armyEndurance = 100;
  state.nationalEndurance = 100;
  state.tasks = [];
  state.activeWar = null;
  state.briefing = [];
  state.log.push(`[SUCCESSION] Player continues as ${countryId} on day ${state.day}`);
  return true;
}

/** Relation bucket used by the UI (mirrors the CLI `relations` command). */
export function relationStatus(rel: number): string {
  if (rel >= 75) return "allied";
  if (rel >= 40) return "friendly";
  if (rel >= -10) return "neutral";
  if (rel >= -50) return "tense";
  if (rel >= -75) return "hostile";
  return "at_war";
}
