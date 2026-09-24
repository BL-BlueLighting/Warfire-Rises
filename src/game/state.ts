import { ConquestRecord, Country, GameState, ExchangeRates, WarState, Division } from "./types";
import { COUNTRIES, STARTING_NUKES, DIVISIONS_BY_POWER } from "./countries";
import { makeGenerals, makeInitialGroups } from "./command";
import { t } from "../i18n";
import { DEFAULT_DIFFICULTY, profileFor } from "./difficulty";
import { regionsOf } from "./peace";
import { DEFAULT_ERA, eraDescKey, getEra, eraProvinceOwners, type Era } from "./eras";

/**
 * Put the world in the shape a historical scenario says it was in.
 *
 * Three things move: the numbers each nation has, which of the twelve exist at
 * all, and who owns which province. The borders the map draws come from the
 * same era, loaded separately by the map itself.
 */
function applyEra(countries: Country[], era: Era) {
  for (const country of countries) {
    // Every scenario *may* write a blurb for every nation, and one that wrote
    // none leaves this pointing at a key that does not exist — `countryDesc`
    // then falls back to the modern text.
    country.descKey = eraDescKey(era.id, country.id);

    const nation = era.nations[country.id];
    if (!nation) continue;
    country.nameKey = nation.nameKey;
    if (nation.name) country.name = nation.name;
    if (nation.population !== undefined) country.population = nation.population;
    if (nation.economy !== undefined) country.economy = nation.economy;
    if (nation.military !== undefined) country.military = nation.military;
    if (nation.stability !== undefined) country.stability = nation.stability;
    if (nation.publicSupport !== undefined) country.publicSupport = nation.publicSupport;
    if (nation.treasury !== undefined) country.treasury = nation.treasury;
    if (nation.manpower !== undefined) country.manpower = nation.manpower;
    if (nation.divisions !== undefined) {
      country.divisions = country.divisions.slice(0, nation.divisions);
      country.armyGroups = country.armyGroups.map((g) => ({
        ...g,
        divisionIds: g.divisionIds.filter((id) => country.divisions.some((d) => d.id === id)),
      }));
    }
    // A 1938 campaign has no warheads anywhere, whatever the nation is today.
    country.nuclear = nation.nuclear ?? false;
    country.nukes = nation.nukes ?? 0;
    country.researched = country.nuclear ? ["nuclear_weapons"] : [];
    // A 1938 nation has no reactor to run, whatever it has today.
    country.buildings = country.nuclear ? country.buildings : [];
    country.allies = era.allies?.[country.id] ?? [];
    country.enemies = era.enemies?.[country.id] ?? [];
    for (const [other, value] of Object.entries(era.relations?.[country.id] ?? {})) {
      country.relations[other] = value;
    }
  }
}

export function createInitialState(
  keywords: string[],
  rates: ExchangeRates,
  eraId?: string
): GameState {
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
      nukedBy: [] as string[],
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

  const era = getEra(eraId ?? DEFAULT_ERA);
  applyEra(countries, era);

  // Wars the scenario says are already running. A campaign that opens in 1942
  // should open at war, not one declaration short of it; the first pair the
  // player is in becomes the live war, so the fighting ticks from day one.
  const byId = new Map(countries.map((c) => [c.id, c]));
  for (const [a, b] of era.atWar ?? []) {
    const first = byId.get(a);
    const second = byId.get(b);
    if (!first || !second) continue;
    if (!first.atWarWith.includes(b)) first.atWarWith.push(b);
    if (!second.atWarWith.includes(a)) second.atWarWith.push(a);
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
    era: era.id,
    // A nation the era has not invented yet is simply not on the board.
    absentCountries: COUNTRIES.filter((c) => !era.nations[c.id]).map((c) => c.id),
    publishedNews: [],
    defeatedCountries: [],
    eventIdCounter: 0,
    activeWar: null,
    warHistory: [],

    difficulty: DEFAULT_DIFFICULTY,
    // Provinces the scenario says changed hands. The rest stay with their
    // modern owner, which is what `regionOwner` falling through already means.
    regionOwner: { ...eraProvinceOwners(era) },
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

/**
 * Detonate one warhead on `targetId`, fired by `attackerId`.
 *
 * The single implementation of "a nuclear strike happened": the `mil.nuclear`
 * action and the `NukedCountry` decision reward both go through here, so a
 * scripted nuke and a clicked one leave the world in exactly the same state.
 * Callers own the messaging; this only moves the numbers.
 *
 * Availability is deliberately *not* checked here. The action gates itself on
 * warheads, public support and attitude; a decision author gates on whatever
 * the scenario calls for (usually a `Nuke` requirement).
 */
export function detonateNuke(state: GameState, attackerId: string, targetId: string): void {
  const attacker = getCountryById(state, attackerId);
  const target = getCountryById(state, targetId);
  if (!attacker || !target) return;

  // One entry per strike, so `nukedBy` doubles as a strike count.
  target.nukedBy.push(attackerId);

  target.military = 0;
  target.economy = 0;
  target.stability = 0;
  target.population = Math.floor(target.population * 0.3);

  // The army is what actually fights, and it is not derived from `military` —
  // combat runs on divisions and their organisation. Zeroing the country's
  // stats alone left the divisions untouched, so the enemy fought on as though
  // nothing had happened. Most of the army ceases to exist; the survivors are
  // wrecked and leaderless.
  const survivors = Math.floor(target.divisions.length * 0.3);
  target.divisions = target.divisions.slice(0, survivors).map((d) => ({
    ...d,
    strength: Math.max(1, Math.round(d.strength * 0.4)),
    organisation: 0,
  }));
  const alive = new Set(target.divisions.map((d) => d.id));
  for (const group of target.armyGroups) {
    group.divisionIds = group.divisionIds.filter((id) => alive.has(id));
  }

  adjustRelation(state, attackerId, targetId, -100);

  // The blowback lands on the player's own meters — army and national
  // endurance are global, not per-country. Only charge them when the player
  // pressed the button.
  if (attackerId === state.playerCountryId) {
    state.armyEndurance = Math.max(0, state.armyEndurance - 40);
    state.nationalEndurance = Math.max(0, state.nationalEndurance - 30);
    attacker.publicSupport = Math.max(0, attacker.publicSupport - 25);
  }
  applyCollapse(state, 25, t("collapse.nuclear_strike", { name: target.name }));
}

/**
 * A nation that is out of play: erased from the map, or beaten and partitioned.
 *
 * Either way it stops being a country anyone can deal with — no AI, no
 * diplomacy, no second war — and its land belongs to somebody else.
 */
export function isOutOfPlay(state: GameState, countryId: string): boolean {
  const country = getCountryById(state, countryId);
  if (!country) return true;
  return (
    country.destroyed ||
    state.defeatedCountries.includes(countryId) ||
    state.absentCountries.includes(countryId)
  );
}

/**
 * A nation has lost a war for good: it leaves the board.
 *
 * Its army is gone, its wars are over, its claims and treaties lapse. The land
 * is *not* touched here — a player-run peace conference gets to divide it
 * first, and `annexRegions` sweeps up whatever is left afterwards.
 */
export function markDefeated(state: GameState, countryId: string): void {
  const country = getCountryById(state, countryId);
  if (!country || isOutOfPlay(state, countryId)) return;

  if (!state.defeatedCountries.includes(countryId)) state.defeatedCountries.push(countryId);

  country.divisions = [];
  country.armyGroups = [];
  country.military = Math.max(0, Math.round(country.military * 0.2));
  country.manpower = 0;
  country.nukes = 0;
  country.nukeProgress = 0;
  country.autoArmy = false;
  country.overlordId = null;
  country.warGoals = [];
  country.atWarWith = [];
  country.allies = [];
  country.enemies = [];

  // Nobody is at war with a nation that no longer fields an army, and no one
  // holds a claim on it either.
  for (const other of state.countries) {
    other.atWarWith = other.atWarWith.filter((id) => id !== countryId);
    other.warGoals = other.warGoals.filter((id) => id !== countryId);
    other.allies = other.allies.filter((id) => id !== countryId);
    other.enemies = other.enemies.filter((id) => id !== countryId);
    if (other.overlordId === countryId) other.overlordId = null;
  }

  const war = state.activeWar;
  if (war?.active && (war.attacker === countryId || war.defender === countryId)) {
    state.warHistory.push({
      ...war,
      active: false,
      phase: "ended",
      winner: war.attacker === countryId ? war.defender : war.attacker,
    });
    state.activeWar = null;
  }

  state.log.push(`[DEFEAT] ${country.name} is out of the war — partitioned by the victors`);
}

/**
 * Hand every region the loser still holds to `winnerId`.
 *
 * Runs after a peace conference has taken its pick, so what is left — the rump
 * state nobody claimed — joins the victor rather than lingering as a country
 * that is not allowed to do anything.
 */
export function annexRegions(state: GameState, loserId: string, winnerId: string): number {
  const loser = getCountryById(state, loserId);
  const winner = getCountryById(state, winnerId);
  if (!loser || !winner || !isOutOfPlay(state, loserId)) return 0;

  let moved = 0;
  for (const [regionId, owner] of Object.entries(state.regionOwner)) {
    if (owner === loserId) {
      state.regionOwner[regionId] = winnerId;
      moved += 1;
    }
  }
  // Regions it still answers for but that were never transferred are authored
  // under it, so they read as its own until an explicit owner says otherwise.
  for (const regionId of regionsOf(loserId)) {
    if (!(regionId in state.regionOwner)) {
      state.regionOwner[regionId] = winnerId;
      moved += 1;
    }
  }
  if (moved > 0) {
    state.log.push(`[ANNEX] ${winner.name} absorbed the remainder of ${loser.name} (${moved} regions)`);
  }
  return moved;
}

/**
 * Erase a nation from the world: its land sinks and its state goes with it.
 *
 * Nothing reverses this. The nation stays in `state.countries` — relations, war
 * records and decision runtimes all reference its id — but it is skipped by the
 * map, the AI and every country list, which is what makes the territory read as
 * open ocean.
 *
 * Refuses to erase the player's own nation: that is the `declareConquest`
 * ending, and it needs a conqueror to hand the spoils to.
 */
export function destroyCountry(state: GameState, countryId: string): boolean {
  const country = getCountryById(state, countryId);
  if (!country || country.destroyed) return false;
  if (countryId === state.playerCountryId) return false;

  country.destroyed = true;
  country.economy = 0;
  country.military = 0;
  country.stability = 0;
  country.publicSupport = 0;
  country.forceValue = 0;
  country.population = 0;
  country.manpower = 0;
  country.nukes = 0;
  country.nukeProgress = 0;
  country.divisions = [];
  country.armyGroups = [];
  country.overlordId = null;
  country.autoArmy = false;

  // Borders involving it are void: the land it had taken goes down with it, and
  // so do occupations of its own land — the whole landmass is sinking, whoever
  // was standing on it. What is left reverts to the nation it was authored
  // under, which the map then draws as ocean because that nation is gone.
  const itsRegions = new Set(regionsOf(countryId));
  for (const [regionId, owner] of Object.entries(state.regionOwner)) {
    if (owner === countryId || itsRegions.has(regionId)) delete state.regionOwner[regionId];
  }

  // Wars end, alliances lapse, claims die with the claimant.
  for (const other of state.countries) {
    other.atWarWith = other.atWarWith.filter((id) => id !== countryId);
    other.allies = other.allies.filter((id) => id !== countryId);
    other.enemies = other.enemies.filter((id) => id !== countryId);
    other.warGoals = other.warGoals.filter((id) => id !== countryId);
    if (other.overlordId === countryId) other.overlordId = null;
  }
  country.atWarWith = [];
  country.allies = [];
  country.enemies = [];
  country.warGoals = [];

  const war = state.activeWar;
  if (war?.active && (war.attacker === countryId || war.defender === countryId)) {
    state.warHistory.push({
      ...war,
      active: false,
      phase: "ended",
      winner: war.attacker === countryId ? war.defender : war.attacker,
    });
    state.activeWar = null;
  }

  state.log.push(`[ERASED] ${country.name} — land sunk, nation gone`);
  return true;
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
