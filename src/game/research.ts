import { GameState } from "./types";
import { getCountryById } from "./state";
import { applyRewards } from "./decisions";
import type { RewardTuple } from "./decisions";
import { t } from "../i18n";

/**
 * Research & construction.
 *
 * Every weapon in the game is gated behind research. Nuclear powers begin with
 * `nuclear_weapons` already unlocked, but a warhead still requires a built
 * `nuclear_facility` — and a nuclear strike consumes one warhead from the
 * stockpile.
 */

export type TechCategory = "weapons" | "industry" | "intelligence";

export interface TechDef {
  id: string;
  nameKey: string;
  descKey: string;
  category: TechCategory;
  /** Research time in game days. */
  days: number;
  /** Treasury cost in $B. */
  cost: number;
  /** Tech ids that must be finished first. */
  requires: string[];
  /** Effects expressed in the decision-reward vocabulary. */
  effects: RewardTuple[];
  /** Nations with nuclear capability start with this already done. */
  autoForNuclearPowers?: boolean;
}

export interface BuildingDef {
  id: string;
  nameKey: string;
  descKey: string;
  days: number;
  cost: number;
  requiresTech: string[];
  /** Repeatable buildings (a country may hold several). */
  repeatable?: boolean;
  /** Warheads produced per `NUKE_PRODUCTION_DAYS` once built. */
  warheadRate?: number;
}

/** Days of continuous operation needed per warhead. */
export const NUKE_PRODUCTION_DAYS = 30;

export const TECHS: TechDef[] = [
  // ── Weapons ──
  {
    id: "conventional_forces",
    nameKey: "tech.conventional.name",
    descKey: "tech.conventional.desc",
    category: "weapons",
    days: 60, cost: 300, requires: [],
    effects: [["Military", "+", 5]],
  },
  {
    id: "advanced_armor",
    nameKey: "tech.armor.name",
    descKey: "tech.armor.desc",
    category: "weapons",
    days: 120, cost: 800, requires: ["conventional_forces"],
    effects: [["Military", "+", 8]],
  },
  {
    id: "ballistic_missiles",
    nameKey: "tech.missiles.name",
    descKey: "tech.missiles.desc",
    category: "weapons",
    days: 150, cost: 1200, requires: ["advanced_armor"],
    effects: [["Military", "+", 10], ["ForceValue", "+", 5]],
  },
  {
    id: "nuclear_weapons",
    nameKey: "tech.nuclear.name",
    descKey: "tech.nuclear.desc",
    category: "weapons",
    days: 0, cost: 0, requires: [],
    effects: [],
    autoForNuclearPowers: true,
  },
  {
    id: "thermonuclear",
    nameKey: "tech.thermo.name",
    descKey: "tech.thermo.desc",
    category: "weapons",
    days: 180, cost: 2000, requires: ["nuclear_weapons", "ballistic_missiles"],
    effects: [["ForceValue", "+", 10]],
  },

  // ── Industry ──
  {
    id: "industrial_modernization",
    nameKey: "tech.industry.name",
    descKey: "tech.industry.desc",
    category: "industry",
    days: 90, cost: 600, requires: [],
    effects: [["Economy", "+", 5]],
  },
  {
    id: "infrastructure",
    nameKey: "tech.infra.name",
    descKey: "tech.infra.desc",
    category: "industry",
    days: 120, cost: 900, requires: ["industrial_modernization"],
    effects: [["Economy", "+", 6], ["Stability", "+", 3]],
  },
  {
    id: "research_labs",
    nameKey: "tech.labs.name",
    descKey: "tech.labs.desc",
    category: "industry",
    days: 100, cost: 700, requires: ["industrial_modernization"],
    effects: [["CountryEndurance", "+", 5]],
  },

  // ── Intelligence ──
  {
    id: "sigint",
    nameKey: "tech.sigint.name",
    descKey: "tech.sigint.desc",
    category: "intelligence",
    days: 70, cost: 400, requires: [],
    effects: [["PublicSupport", "+", 3]],
  },
  {
    id: "cyber_warfare",
    nameKey: "tech.cyber.name",
    descKey: "tech.cyber.desc",
    category: "intelligence",
    days: 130, cost: 900, requires: ["sigint"],
    effects: [["Stability", "+", 3]],
  },
];

export const BUILDINGS: BuildingDef[] = [
  {
    id: "nuclear_facility",
    nameKey: "build.nuclear.name",
    descKey: "build.nuclear.desc",
    days: 180, cost: 1500,
    requiresTech: ["nuclear_weapons"],
    repeatable: true,
    warheadRate: 1,
  },
  {
    id: "arms_factory",
    nameKey: "build.factory.name",
    descKey: "build.factory.desc",
    days: 120, cost: 800,
    requiresTech: ["conventional_forces"],
    repeatable: true,
  },
];

const TECH_BY_ID = new Map(TECHS.map((x) => [x.id, x]));
const BUILDING_BY_ID = new Map(BUILDINGS.map((x) => [x.id, x]));

export function getTech(id: string): TechDef | undefined {
  return TECH_BY_ID.get(id);
}
export function getBuilding(id: string): BuildingDef | undefined {
  return BUILDING_BY_ID.get(id);
}

/** Techs a nation has finished, including the free nuclear starting tech. */
export function hasTech(state: GameState, countryId: string, techId: string): boolean {
  const c = getCountryById(state, countryId);
  if (!c) return false;
  if (c.researched.includes(techId)) return true;
  const def = TECH_BY_ID.get(techId);
  // Nuclear powers are grandfathered into the warhead tech.
  return Boolean(def?.autoForNuclearPowers && c.nuclear);
}

export function buildingCount(state: GameState, countryId: string, buildingId: string): number {
  const c = getCountryById(state, countryId);
  return c ? c.buildings.filter((b) => b === buildingId).length : 0;
}

// ── Research ───────────────────────────────────────────────────────

export interface ResearchCheck {
  ok: boolean;
  reason?: string;
}

export function canResearch(state: GameState, countryId: string, techId: string): ResearchCheck {
  const c = getCountryById(state, countryId);
  const def = TECH_BY_ID.get(techId);
  if (!c || !def) return { ok: false, reason: t("ui.research.unknown") };
  if (hasTech(state, countryId, techId)) return { ok: false, reason: t("ui.research.done") };
  if (isResearching(state, countryId, techId)) return { ok: false, reason: t("ui.task.busy") };
  for (const req of def.requires) {
    if (!hasTech(state, countryId, req)) {
      return { ok: false, reason: t("ui.research.needs", { name: t(TECH_BY_ID.get(req)!.nameKey) }) };
    }
  }
  if (c.treasury < def.cost) {
    return { ok: false, reason: t("ui.cost.need_treasury", { n: def.cost }) };
  }
  return { ok: true };
}

export function isResearching(state: GameState, countryId: string, techId: string): boolean {
  return state.tasks.some(
    (task) =>
      task.payload.type === "research" &&
      task.payload.techId === techId &&
      task.payload.countryId === countryId
  );
}

export function startResearch(
  state: GameState,
  countryId: string,
  techId: string
): { ok: boolean; message: string } {
  const check = canResearch(state, countryId, techId);
  if (!check.ok) return { ok: false, message: check.reason ?? "" };

  const c = getCountryById(state, countryId)!;
  const def = TECH_BY_ID.get(techId)!;
  c.treasury -= def.cost;

  state.tasks.push({
    id: ++state.taskIdCounter,
    kind: "research",
    labelKey: "task.research",
    labelParams: { name: t(def.nameKey) },
    icon: "🔬",
    actorId: countryId,
    startTime: state.clock.time,
    endTime: state.clock.time + def.days,
    cancellable: true,
    payload: { type: "research", countryId, techId },
  });

  return { ok: true, message: t("ui.research.started", { name: t(def.nameKey), days: def.days }) };
}

export function completeResearch(state: GameState, countryId: string, techId: string): string {
  const c = getCountryById(state, countryId);
  const def = TECH_BY_ID.get(techId);
  if (!c || !def) return "";
  if (!c.researched.includes(techId)) c.researched.push(techId);
  applyRewards(state, countryId, def.effects);
  return t("ui.research.done_msg", { name: t(def.nameKey) });
}

// ── Construction ───────────────────────────────────────────────────

export function canBuild(state: GameState, countryId: string, buildingId: string): ResearchCheck {
  const c = getCountryById(state, countryId);
  const def = BUILDING_BY_ID.get(buildingId);
  if (!c || !def) return { ok: false, reason: t("ui.research.unknown") };
  if (!def.repeatable && buildingCount(state, countryId, buildingId) > 0) {
    return { ok: false, reason: t("ui.build.exists") };
  }
  for (const req of def.requiresTech) {
    if (!hasTech(state, countryId, req)) {
      return { ok: false, reason: t("ui.research.needs", { name: t(TECH_BY_ID.get(req)!.nameKey) }) };
    }
  }
  if (c.treasury < def.cost) {
    return { ok: false, reason: t("ui.cost.need_treasury", { n: def.cost }) };
  }
  return { ok: true };
}

export function startBuild(
  state: GameState,
  countryId: string,
  buildingId: string
): { ok: boolean; message: string } {
  const check = canBuild(state, countryId, buildingId);
  if (!check.ok) return { ok: false, message: check.reason ?? "" };

  const c = getCountryById(state, countryId)!;
  const def = BUILDING_BY_ID.get(buildingId)!;
  c.treasury -= def.cost;

  state.tasks.push({
    id: ++state.taskIdCounter,
    kind: "build",
    labelKey: "task.build",
    labelParams: { name: t(def.nameKey) },
    icon: "🏭",
    actorId: countryId,
    startTime: state.clock.time,
    endTime: state.clock.time + def.days,
    cancellable: true,
    payload: { type: "build", countryId, buildingId },
  });

  return { ok: true, message: t("ui.build.started", { name: t(def.nameKey), days: def.days }) };
}

export function completeBuild(state: GameState, countryId: string, buildingId: string): string {
  const c = getCountryById(state, countryId);
  const def = BUILDING_BY_ID.get(buildingId);
  if (!c || !def) return "";
  c.buildings.push(buildingId);
  return t("ui.build.done_msg", { name: t(def.nameKey) });
}

// ── Warhead production ─────────────────────────────────────────────

/**
 * Called once per game day. Each completed nuclear facility contributes
 * progress toward the next warhead.
 */
export function tickNukeProduction(state: GameState, countryId: string): number {
  const c = getCountryById(state, countryId);
  if (!c) return 0;
  const facilities = buildingCount(state, countryId, "nuclear_facility");
  if (facilities === 0) return 0;
  if (!hasTech(state, countryId, "nuclear_weapons")) return 0;

  const rate = (getBuilding("nuclear_facility")?.warheadRate ?? 1) * facilities;
  c.nukeProgress += rate;
  let produced = 0;
  while (c.nukeProgress >= NUKE_PRODUCTION_DAYS) {
    c.nukeProgress -= NUKE_PRODUCTION_DAYS;
    c.nukes += 1;
    produced += 1;
  }
  return produced;
}
