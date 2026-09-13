import type { Difficulty } from "./difficulty";

// ── Core domain types ──────────────────────────────────────────────
// Ported from the Ink/CLI edition of WARFIRE RISES. The simulation
// semantics are intentionally preserved; only the presentation layer
// (map + panels) is new.

export type GovernmentType =
  | "democracy"
  | "authoritarian"
  | "theocracy"
  | "monarchy"
  | "communist";

export type PowerLevel = "superpower" | "major" | "regional" | "minor";

export type Attitude =
  | "peaceful" // 和平共进
  | "neutral" // 中规中矩
  | "strained" // 难以协调
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
  return attitude;
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
  /**
   * How readily this nation starts a war, 1 being the baseline.
   *
   * Static posture, not a game fact: it sits next to the real-world alliances
   * and relations the roster already carries, and gives the AI each nation's
   * own appetite for a fight (see `warCandidates` in ai.ts).
   */
  aggression: number;
  publicSupport: number; // 0-100, domestic support for government actions
  forceValue: number; // 0-100, 迫使值 — coercion readiness
  atWarWith: string[]; // countries currently at war with

  // ── Research / industry ──
  /** Completed research ids. Nuclear powers start with "nuclear_weapons". */
  researched: string[];
  /** Constructed building ids ("nuclear_facility", …). */
  buildings: string[];

  // ── Military ──
  /** Warheads in the stockpile. A nuclear strike consumes one. */
  nukes: number;
  /** Days of progress toward the next warhead (0..NUKE_PRODUCTION_DAYS). */
  nukeProgress: number;
  /**
   * Who has used a warhead on this nation, one entry per strike — so the same
   * id twice means two strikes. Written by `detonateNuke`, read by the
   * `NukedCountry` decision attribute ("has To been nuked *by me*").
   */
  nukedBy: string[];
  /** Manpower pool, in thousands. */
  manpower: number;
  /** Recruited divisions; each carries its own manpower commitment. */
  divisions: Division[];
  /** Commanders available to lead army groups. */
  generals: General[];
  /** Formations the army is organised into. */
  armyGroups: ArmyGroup[];
  /**
   * Set by the 邀请军事指挥家 decision: the general staff runs the army —
   * training, assignment and dispatch — until the player says otherwise. The
   * player can still give orders, but the staff will object, loudly.
   */
  autoArmy: boolean;
  /**
   * Day until which the staff will not touch orders.
   *
   * Without this, overruling the staff achieved nothing: it simply restored its
   * own dispositions the next morning. Being overruled now makes it stand down
   * on orders for a while, so the player's decision actually sticks.
   */
  staffSilencedUntil: number;

  // ── Diplomacy ──
  /** Country ids this nation has a completed casus belli against. */
  warGoals: string[];
  /**
   * The nation this one answers to, or null when it is independent.
   *
   * Only half the story: a nation also counts as a subject while another one
   * occupies any of its regions, and that is computed rather than stored — see
   * `isSubjectOf` in subjects.ts.
   */
  overlordId: string | null;
  /**
   * Erased from the world: the nation's land has sunk and nothing brings it
   * back. Set by the `FullDestroy` decision reward; the map, the AI and every
   * country list skip it, but it stays in the roster because relations, war
   * records and decision runtimes still reference its id.
   */
  destroyed: boolean;
}

/** A commander. Skills are 1-5 and feed the combat pools. */
export interface General {
  id: number;
  name: string;
  attack: number;
  defense: number;
  planning: number;
}

/**
 * A formation of divisions under one commander.
 *
 * `order` decides whether it takes the field: only groups told to assault or
 * hold are deployed — a group on reserve sits the battle out entirely.
 */
export interface ArmyGroup {
  id: number;
  nameKey: string;
  nameParams?: Record<string, string | number>;
  generalId: number | null;
  divisionIds: number[];
  order: "assault" | "hold" | "reserve";
}

export interface Division {
  id: number;
  /** Custom name, e.g. "1st Armoured". */
  name: string;
  /** Manpower committed to this division, in thousands. */
  manpower: number;
  /** 0-100 fighting strength. */
  strength: number;
  /** Organisation — regenerates daily, drives combat effectiveness. */
  organisation: number;
}

export interface WarState {
  active: boolean;
  attacker: string;
  defender: string;
  dayStarted: number;
  /** Average organisation of each side's engaged divisions, 0-100. */
  attackerMorale: number;
  defenderMorale: number;
  attackerLosses: number;
  defenderLosses: number;
  battles: BattleRecord[];
  phase: "preparing" | "active" | "decisive" | "ended";
  winner: string | null;

  // ── Combat (see combat.ts) ──
  /** What each side is doing: pressing the attack, or holding ground. */
  attackerStance: CombatStance;
  defenderStance: CombatStance;
  /** Days spent holding; drives the entrenchment bonus. */
  attackerEntrenchment: number;
  defenderEntrenchment: number;
}

/** Pressing the attack trades defence for damage; holding digs in. */
export type CombatStance = "assault" | "hold";

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
  /** `news` is a bulletin published by a decision file — see `NewsDef`. */
  type: "political" | "military" | "economic" | "diplomatic" | "disaster" | "crisis" | "news";
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

/**
 * `gameover` now means exactly one thing: the player's nation was conquered.
 * The world-collapse meter no longer ends a campaign — see `ConquestRecord`.
 */
export type GamePhase = "title" | "loading" | "playing" | "gameover";

/**
 * A peace conference over a defeated nation.
 *
 * Participants bring a claim budget drawn from their share of the fighting;
 * every region of the conquered nation costs one point. See peace.ts.
 */
export interface PeaceConference {
  conquered: string;
  participants: { countryId: string; score: number }[];
  /** Region ids up for division. */
  pool: string[];
  /** regionId → the country that took it. */
  claims: Record<string, string>;
  active: boolean;
}

/** How a nation was taken, and by whom. */
export interface ConquestRecord {
  /** The nation that was lost. */
  countryId: string;
  /** The nation that took it. */
  by: string;
  day: number;
  /** Divisions destroyed in the fighting, for the summary. */
  divisionsLost: number;
}

export interface GameState {
  phase: GamePhase;
  /**
   * Integer day counter, derived from `clock.time`. Kept for display and for
   * the save format, which predates the continuous clock.
   */
  day: number;
  playerCountryId: string;
  countries: Country[];
  events: GameEvent[];
  worldCollapse: number;
  /**
   * Fractional backing store for `worldCollapse`.
   *
   * The original per-day collapse rates were tuned for a ~30-turn campaign in
   * which the player advanced one day at a time. Now that time flows
   * continuously, the same rates would end a campaign in seconds, so gains are
   * multiplied by COLLAPSE_SCALE and accumulated here; `worldCollapse` is the
   * floor, for display and for decision requirements.
   */
  worldCollapseRaw: number;
  diplomaticPoints: number;
  armyEndurance: number;
  nationalEndurance: number;
  exchangeRates: ExchangeRates;
  worldKeywords: string[];
  briefing: string[];
  log: string[];
  /** Set when the player's nation has been conquered; null while it stands. */
  conquered: ConquestRecord | null;
  /** News ids already published by a decision file's `EffectNews` reward. */
  publishedNews: string[];
  /**
   * Nations already lost. They stay out of play — ruined, and unavailable to
   * pick when the player succeeds to a new one.
   */
  defeatedCountries: string[];
  eventIdCounter: number;
  activeWar: WarState | null;
  warHistory: WarState[];

  // ── Continuous clock & scheduled work ──
  clock: ClockState;
  tasks: GameTask[];
  taskIdCounter: number;
  divisionIdCounter: number;
  /** Per-decision runtime state, keyed by `${decisionId}`. */
  decisionStates: Record<string, DecisionRuntime>;

  /** Campaign difficulty; scales event, war and collapse rates. */
  difficulty: Difficulty;

  /**
   * Current owner of each region, keyed by region id. Regions absent from the
   * map still belong to the nation they were authored under — so a sea change
   * in borders costs one entry per changed province, not a rewrite.
   */
  regionOwner: Record<string, string>;
  /** Open peace conference, if one is in session. */
  conference: PeaceConference | null;
}

/**
 * Game time is a continuous, fractional day count starting at 1.
 * `state.day` is `Math.floor(clock.time)`.
 */
export interface ClockState {
  time: number;
  /** 0 = paused, 1..5 = speed tier. */
  speed: number;
  /** Speed to restore when unpausing. */
  lastSpeed: number;
}

/** What a finished task actually does. */
export type TaskPayload =
  | { type: "action"; actionId: string; actorId: string; targetId?: string }
  | {
      type: "decision";
      decisionId: string;
      actorId: string;
      phaseIndex: number;
      /** The counterpart picked in the panel, for `To: "target"` and Relation. */
      targetId?: string;
    }
  | { type: "research"; countryId: string; techId: string }
  | { type: "build"; countryId: string; buildingId: string }
  | { type: "recruit"; countryId: string; divisions: number; manpowerEach: number };

export type TaskKind =
  | "diplomacy"
  | "military"
  | "economy"
  | "espionage"
  | "propaganda"
  | "war"
  | "research"
  | "build"
  | "recruit"
  | "justify"
  | "decision";

export interface GameTask {
  id: number;
  kind: TaskKind;
  /** i18n key for the task's display name. */
  labelKey: string;
  labelParams?: Record<string, string | number>;
  icon: string;
  actorId: string;
  targetId?: string;
  /** Game-time bounds, in fractional days. */
  startTime: number;
  endTime: number;
  payload: TaskPayload;
  cancellable: boolean;
}

// ── Decisions (*.warf-decision) ────────────────────────────────────

export interface DecisionRuntime {
  /** Completed executions. */
  completed: number;
  /** Number of infinity phases already resolved. */
  phaseIndex: number;
  /** Game-time when the decision was last started, or null. */
  startedAt: number | null;
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

// ── Presentation-layer types (new in the Tauri edition) ────────────

/** HOI4-style map modes — each recolours every nation by a different metric. */
export type MapMode =
  | "political" // relation to the player, the default
  | "faction" // allies / enemies / neutral blocs
  | "military" // military strength heat
  | "economy" // economic strength heat
  | "stability" // internal stability heat
  | "war"; // highlights active belligerents

export type PanelTab =
  | "nation"
  | "decisions"
  | "research"
  | "army"
  | "command"
  | "diplomacy"
  | "military"
  | "economy"
  | "intelligence"
  | "war"
  | "log";

/** A UI notification surfaced from an action result. */
export interface Toast {
  id: number;
  kind: "info" | "success" | "warn" | "error";
  message: string;
}
