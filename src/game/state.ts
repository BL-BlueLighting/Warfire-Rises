import { GameState, ExchangeRates, WarState } from "../types";
import { COUNTRIES } from "./countries";
import { t } from "../i18n";

export function createInitialState(keywords: string[], rates: ExchangeRates): GameState {
  const countries = COUNTRIES.map((c) => ({
    ...c,
    relations: { ...c.relations },
    allies: [...c.allies],
    enemies: [...c.enemies],
    atWarWith: [...c.atWarWith],
  }));

  return {
    phase: "playing",
    day: 1,
    playerCountryId: "USA",
    countries,
    events: [],
    worldCollapse: 8,
    diplomaticPoints: 100,
    armyEndurance: 100,
    nationalEndurance: 100,
    exchangeRates: rates,
    worldKeywords: keywords,
    briefing: [],
    log: [],
    gameOverMessage: "",
    ending: null,
    eventIdCounter: 0,
    activeWar: null,
    warHistory: [],
  };
}

export function getPlayerCountry(state: GameState) {
  return state.countries.find((c) => c.id === state.playerCountryId)!;
}

export function getCountryById(state: GameState, id: string) {
  return state.countries.find((c) => c.id === id);
}

export function regeneratePoints(state: GameState): void {
  state.diplomaticPoints = Math.min(100, state.diplomaticPoints + 8);
  state.armyEndurance = Math.min(100, state.armyEndurance + 5);
  // Force value decays slightly each day
  const p = getPlayerCountry(state);
  p.forceValue = Math.max(0, p.forceValue - 2);
}

export function applyCollapse(state: GameState, amount: number, reason: string): void {
  state.worldCollapse = Math.min(100, Math.max(0, state.worldCollapse + amount));
  state.log.push(`[WC ${state.worldCollapse}%] ${reason}`);
  if (state.worldCollapse >= 100 && state.phase === "playing") {
    state.phase = "gameover";
    state.ending = state.nationalEndurance > 50 ? "tno" : "tfr";
    const country = getPlayerCountry(state);
    if (state.ending === "tfr") {
      state.gameOverMessage =
        `THE FIRE RISES — ` +
        t("gameover.tfr_message", { flag: country.flag, name: country.name });
    } else {
      state.gameOverMessage =
        `THE NEW ORDER — ` +
        t("gameover.tno_message", { flag: country.flag, name: country.name });
    }
  }
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
  };
}
