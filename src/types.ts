export type GovernmentType =
  | "democracy"
  | "authoritarian"
  | "theocracy"
  | "monarchy"
  | "communist";

export type PowerLevel = "superpower" | "major" | "regional" | "minor";

export type Attitude =
  | "peaceful"       // 和平共进
  | "neutral"        // 中规中矩
  | "strained"       // 难以协调
  | "irreconcilable"; // 不死不休

export const ATTITUDE_THRESHOLDS: { attitude: Attitude; minRelation: number }[] = [
  { attitude: "peaceful", minRelation: 50 },
  { attitude: "neutral", minRelation: 0 },
  { attitude: "strained", minRelation: -50 },
  { attitude: "irreconcilable", minRelation: -100 },
];

export function getAttitude(relation: number): Attitude {
  if (relation >= 50) return "peaceful";
  if (relation >= 0) return "neutral";
  if (relation >= -50) return "strained";
  return "irreconcilable";
}

export function attitudeName(attitude: Attitude): string {
  switch (attitude) {
    case "peaceful": return "peaceful";
    case "neutral": return "neutral";
    case "strained": return "strained";
    case "irreconcilable": return "irreconcilable";
  }
}

export type RelationStatus =
  | "allied"
  | "friendly"
  | "neutral"
  | "tense"
  | "hostile"
  | "at_war";

export interface Country {
  id: string;
  name: string;
  flag: string;
  government: GovernmentType;
  power: PowerLevel;
  economy: number;
  military: number;
  stability: number;
  nuclear: boolean;
  treasury: number;
  population: number;
  description: string;
  allies: string[];
  enemies: string[];
  relations: Record<string, number>;
  // New systems
  publicSupport: number;   // 0-100, domestic public support for government actions
  forceValue: number;       // 0-100, 迫使值 — coercion readiness
  atWarWith: string[];      // countries currently at war with
}

export interface WarState {
  active: boolean;
  attacker: string;
  defender: string;
  dayStarted: number;
  attackerMorale: number;
  defenderMorale: number;
  attackerLosses: number;
  defenderLosses: number;
  battles: BattleRecord[];
  phase: "preparing" | "active" | "decisive" | "ended";
  winner: string | null;
}

export interface BattleRecord {
  id: number;
  name: string;
  day: number;
  attackerRoll: number;
  defenderRoll: number;
  result: "attacker_win" | "defender_win" | "stalemate";
  description: string;
}

export interface GameEvent {
  id: number;
  day: number;
  title: string;
  description: string;
  type: "political" | "military" | "economic" | "diplomatic" | "disaster" | "crisis";
  severity: "low" | "medium" | "high" | "critical";
  affectedCountries: string[];
  worldCollapseChange: number;
  forceChange?: number;
}

export interface ExchangeRates {
  USD_CNY: number;
  USD_HKD: number;
  USD_EUR: number;
  USD_GBP: number;
  USD_JPY: number;
  USD_RUB: number;
}

export type GamePhase = "title" | "loading" | "playing" | "gameover";
export type EndingType = "tfr" | "tno";

export interface GameState {
  phase: GamePhase;
  day: number;
  playerCountryId: string;
  countries: Country[];
  events: GameEvent[];
  worldCollapse: number;
  diplomaticPoints: number;
  armyEndurance: number;
  nationalEndurance: number;
  exchangeRates: ExchangeRates;
  worldKeywords: string[];
  briefing: string[];
  log: string[];
  gameOverMessage: string;
  ending: EndingType | null;
  eventIdCounter: number;
  // War
  activeWar: WarState | null;
  warHistory: WarState[];
}

export interface Command {
  name: string;
  aliases: string[];
  description: string;
  usage: string;
  category: CommandCategory;
  execute: (state: GameState, args: string[]) => CommandResult;
}

export type CommandCategory =
  | "game"
  | "diplomacy"
  | "military"
  | "economy"
  | "war"
  | "intelligence"
  | "system";

export interface CommandResult {
  success: boolean;
  message: string;
  stateChanges?: Partial<GameState>;
}
