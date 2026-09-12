import { GameState } from "./types";

/**
 * Difficulty.
 *
 * Every field is a multiplier applied to a base rate, so the tuning stays in
 * one place per system and difficulty only shifts it. Going from 平民 to
 * 身经百战 the world gets busier (more events, more wars), the collapse meter
 * fills faster, and the player's own recovery is slower — the probabilities
 * accumulate in the player's disfavour.
 */

export type Difficulty = "civilian" | "novice" | "regular" | "veteran" | "hardened";

export interface DifficultyProfile {
  id: Difficulty;
  /** i18n key for the name. */
  nameKey: string;
  /** i18n key for the one-line description. */
  descKey: string;
  /** Multiplier on the daily world-event chance (this is the daily briefing). */
  eventChance: number;
  /** Multiplier on an AI's chance to declare war once its preconditions are met. */
  warChance: number;
  /** Multiplier on how fast World Collapse accumulates. */
  collapseRate: number;
  /** Multiplier on the player's daily diplomatic-point and endurance recovery. */
  playerRegen: number;
  /** Multiplier on AI military growth, so harder worlds field stronger armies. */
  aiGrowth: number;
}

export const DIFFICULTIES: DifficultyProfile[] = [
  {
    id: "civilian",
    nameKey: "diff.civilian.name",
    descKey: "diff.civilian.desc",
    eventChance: 0.55,
    warChance: 0.45,
    collapseRate: 0.7,
    playerRegen: 1.35,
    aiGrowth: 0.8,
  },
  {
    id: "novice",
    nameKey: "diff.novice.name",
    descKey: "diff.novice.desc",
    eventChance: 0.8,
    warChance: 0.72,
    collapseRate: 0.85,
    playerRegen: 1.15,
    aiGrowth: 0.9,
  },
  {
    id: "regular",
    nameKey: "diff.regular.name",
    descKey: "diff.regular.desc",
    eventChance: 1,
    warChance: 1,
    collapseRate: 1,
    playerRegen: 1,
    aiGrowth: 1,
  },
  {
    id: "veteran",
    nameKey: "diff.veteran.name",
    descKey: "diff.veteran.desc",
    eventChance: 1.35,
    warChance: 1.45,
    collapseRate: 1.25,
    playerRegen: 0.9,
    aiGrowth: 1.12,
  },
  {
    id: "hardened",
    nameKey: "diff.hardened.name",
    descKey: "diff.hardened.desc",
    eventChance: 1.8,
    warChance: 2,
    collapseRate: 1.55,
    playerRegen: 0.78,
    aiGrowth: 1.25,
  },
];

const BY_ID = new Map(DIFFICULTIES.map((d) => [d.id, d]));

/** Default for a new campaign, and the fallback for older saves. */
export const DEFAULT_DIFFICULTY: Difficulty = "regular";

export function difficultyProfile(id: Difficulty | undefined): DifficultyProfile {
  return BY_ID.get(id ?? DEFAULT_DIFFICULTY) ?? BY_ID.get(DEFAULT_DIFFICULTY)!;
}

/** Read a profile off the live game state. */
export function profileFor(state: GameState): DifficultyProfile {
  return difficultyProfile(state.difficulty);
}

export function isDifficulty(value: string): value is Difficulty {
  return BY_ID.has(value as Difficulty);
}
