import { GameState, GameTask } from "./types";
import { getCountryById } from "./state";
import {
  clamp,
  findAttribute,
  readRelation,
  resolveTarget,
  type RewardOp,
  type RequireOp,
} from "./attributes";
import { t } from "../i18n";

// ── File schema ────────────────────────────────────────────────────
// Mirrors the `.warf-decision` format. Every decision file is
//   { "Country": "<id>", "Decisions": [ … ] }

export type RewardTuple = [string, RewardOp | string, number];

export interface DecisionRequire {
  Type: string;
  To?: string;
  Condition: RequireOp | string;
  Num: number;
}

export interface PhaseGet {
  Type: "Get" | string;
  Rewards: RewardTuple[];
}

export interface InfinityPhase {
  Type: "Phase" | string;
  Get: PhaseGet[];
  /** Narrative shown when the phase resolves. */
  Content: string;
  /** Days this phase takes. */
  Time: number;
}

export interface ResultReward {
  Type: "Reward" | string;
  Rewards: RewardTuple[];
}

export interface DecisionResult {
  Type: "Result" | string;
  Rewards: ResultReward[];
}

export interface DecisionDef {
  Type: "Decisions" | string;
  Name: string;
  Description: string;
  Require: DecisionRequire[];
  /** Days, or "inf" for a repeating decision. */
  Time: number | "inf";
  InfinityPhases?: InfinityPhase[];
  Result?: DecisionResult[];
  /** Set by the loader — which file this came from. */
  __source?: string;
  /** Stable id, derived from country + name. */
  __id?: string;
}

export interface DecisionFile {
  Country: string;
  Decisions: DecisionDef[];
}

export interface DecisionLoadResult {
  files: DecisionFile[];
  errors: { source: string; message: string }[];
  source: "bundled" | "disk" | "none";
}

/** Hard cap on a numeric decision timer, per the format spec. */
export const MAX_DECISION_DAYS = 180;

// ── Loading ────────────────────────────────────────────────────────

// Vite inlines every *.warf-decision under /decisions at build time. This is
// what runs in the browser and in a packaged app that has no decisions dir.
const bundled = import.meta.glob("/decisions/*.warf-decision", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

interface TauriCore {
  invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
}

function tauriCore(): TauriCore | null {
  const w = window as unknown as { __TAURI_INTERNALS__?: { invoke?: TauriCore["invoke"] } };
  const invoke = w.__TAURI_INTERNALS__?.invoke;
  return invoke ? { invoke } : null;
}

/** Parse one file's text into a DecisionFile, or record why it failed. */
export function parseDecisionFile(
  source: string,
  text: string,
  errors: DecisionLoadResult["errors"]
): DecisionFile | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    // The most common authoring slip is a missing comma between members.
    const detail = err instanceof Error ? err.message : String(err);
    errors.push({ source, message: `${t("dec.err.json")} ${detail}` });
    return null;
  }

  if (typeof raw !== "object" || raw === null) {
    errors.push({ source, message: t("dec.err.shape") });
    return null;
  }

  const obj = raw as Partial<DecisionFile>;
  if (typeof obj.Country !== "string" || !Array.isArray(obj.Decisions)) {
    errors.push({ source, message: t("dec.err.missing_country") });
    return null;
  }

  const decisions: DecisionDef[] = [];
  for (const [i, d] of obj.Decisions.entries()) {
    if (typeof d !== "object" || d === null || typeof (d as DecisionDef).Name !== "string") {
      errors.push({ source, message: t("dec.err.decision", { n: i + 1 }) });
      continue;
    }
    const def = d as DecisionDef;
    def.__source = source;
    def.__id = `${obj.Country}::${def.Name}`;
    if (!Array.isArray(def.Require)) def.Require = [];

    if (def.Time === "inf") {
      if (!Array.isArray(def.InfinityPhases) || def.InfinityPhases.length === 0) {
        errors.push({ source, message: t("dec.err.inf_no_phase", { name: def.Name }) });
        continue;
      }
    } else {
      const n = Number(def.Time);
      if (!Number.isFinite(n) || n <= 0) {
        errors.push({ source, message: t("dec.err.bad_time", { name: def.Name }) });
        continue;
      }
      // Spec: a numeric timer may not exceed 180 days.
      def.Time = Math.min(n, MAX_DECISION_DAYS);
    }
    decisions.push(def);
  }

  return { Country: obj.Country, Decisions: decisions };
}

/**
 * Load every decision file. Prefers the on-disk `decisions/` directory when
 * running inside Tauri (so files can be dropped in without a rebuild), then
 * falls back to the set bundled at build time.
 */
export async function loadDecisions(): Promise<DecisionLoadResult> {
  const errors: DecisionLoadResult["errors"] = [];

  const core = tauriCore();
  if (core) {
    try {
      const files = (await core.invoke("load_decision_files")) as [string, string][] | null;
      if (files && files.length > 0) {
        const parsed: DecisionFile[] = [];
        for (const [name, text] of files) {
          const f = parseDecisionFile(name, text, errors);
          if (f) parsed.push(f);
        }
        return { files: parsed, errors, source: "disk" };
      }
    } catch {
      // fall through to the bundled copy
    }
  }

  const parsed: DecisionFile[] = [];
  for (const [path, text] of Object.entries(bundled)) {
    const f = parseDecisionFile(path.split("/").pop() ?? path, text, errors);
    if (f) parsed.push(f);
  }
  return { files: parsed, errors, source: Object.keys(bundled).length ? "bundled" : "none" };
}

/** Decisions available to a given country ("all" matches everyone). */
export function decisionsForCountry(files: DecisionFile[], countryId: string): DecisionDef[] {
  const out: DecisionDef[] = [];
  for (const f of files) {
    const scope = (f.Country ?? "").trim();
    if (scope === "all" || scope === "*" || scope.toUpperCase() === countryId.toUpperCase()) {
      out.push(...f.Decisions);
    }
  }
  return out;
}

// ── Conditions ─────────────────────────────────────────────────────

function compare(value: number, op: string, num: number): boolean {
  switch (op) {
    case ">=": return value >= num;
    case "<=": return value <= num;
    case ">": return value > num;
    case "<": return value < num;
    case "==":
    case "=": return value === num;
    case "!=": return value !== num;
    default: return false;
  }
}

export interface RequirementCheck {
  require: DecisionRequire;
  ok: boolean;
  /** Resolved human-readable description of the requirement. */
  label: string;
  current?: number;
}

/**
 * Evaluate one requirement. `targetId` is the decision's chosen counterpart
 * (only meaningful for Relation checks and for `To: "target"`).
 */
export function checkRequire(
  state: GameState,
  actorId: string,
  req: DecisionRequire,
  targetId?: string
): RequirementCheck {
  const type = String(req.Type ?? "").trim();
  const op = String(req.Condition ?? ">=").trim();
  const want = Number(req.Num ?? 0);

  // `Relation` reads the actor's opinion of the country named by `To`.
  if (type.toLowerCase() === "relation") {
    const other =
      (req.To ?? "self").trim().toLowerCase() === "target" && targetId
        ? getCountryById(state, targetId)
        : resolveTarget(state, actorId, req.To ?? targetId);
    if (!other) {
      return { require: req, ok: false, label: t("dec.req.unknown", { type }) };
    }
    const cur = readRelation(state, actorId, other.id);
    return {
      require: req,
      ok: compare(cur, op, want),
      label: `${t("dec.req.relation")} ${other.flag} ${other.id} ${op} ${want}`,
      current: cur,
    };
  }

  const country = resolveTarget(state, actorId, req.To);
  const attr = findAttribute(type);
  if (!country || !attr) {
    return { require: req, ok: false, label: t("dec.req.unknown", { type }) };
  }
  const cur = attr.get(state, country);
  return { require: req, ok: compare(cur, op, want), label: `${type} ${op} ${want}`, current: cur };
}

/** True when every requirement passes. */
export function meetsRequirements(
  state: GameState,
  actorId: string,
  decision: DecisionDef,
  targetId?: string
): { ok: boolean; checks: RequirementCheck[] } {
  const checks = (decision.Require ?? []).map((r) => checkRequire(state, actorId, r, targetId));
  return { ok: checks.every((c) => c.ok), checks };
}

// ── Rewards ────────────────────────────────────────────────────────

/** Apply one `[Attribute, op, value]` tuple. Returns a log line, or null. */
export function applyReward(
  state: GameState,
  actorId: string,
  tuple: RewardTuple,
  targetId?: string
): string | null {
  const [rawName, op, rawValue] = tuple;
  const name = String(rawName ?? "").trim();
  const value = Number(rawValue ?? 0);

  if (name.toLowerCase() === "relation") {
    const other = targetId ? getCountryById(state, targetId) : undefined;
    const actor = getCountryById(state, actorId);
    if (!other || !actor) return null;
    const cur = readRelation(state, actorId, other.id);
    let next = cur + value;
    if (op === "-") next = cur - value;
    else if (op === "=") next = value;
    next = clamp(next, -100, 100);
    actor.relations[other.id] = next;
    other.relations[actorId] = next;
    return `${name} ${op} ${value}`;
  }

  const attr = findAttribute(name);
  const country = getCountryById(state, actorId);
  if (!attr || !country) return null;

  const cur = attr.get(state, country);
  let next = cur;
  switch (op) {
    case "+": next = cur + value; break;
    case "-": next = cur - value; break;
    case "*": next = cur * value; break;
    case "/": next = value === 0 ? cur : cur / value; break;
    case "=": next = value; break;
    default: return null;
  }
  attr.set(state, country, clamp(next, attr.min, attr.max));
  return `${name} ${op} ${value}`;
}

/** Apply a list of reward tuples, logging each. */
export function applyRewards(
  state: GameState,
  actorId: string,
  tuples: RewardTuple[] | undefined,
  targetId?: string
): string[] {
  if (!Array.isArray(tuples)) return [];
  const applied: string[] = [];
  for (const tuple of tuples) {
    if (!Array.isArray(tuple) || tuple.length < 3) continue;
    const line = applyReward(state, actorId, tuple, targetId);
    if (line) applied.push(line);
  }
  return applied;
}

/** Flatten a decision's `Result` block into reward tuples. */
export function resultRewards(decision: DecisionDef): RewardTuple[] {
  const out: RewardTuple[] = [];
  for (const result of decision.Result ?? []) {
    for (const reward of result.Rewards ?? []) {
      for (const tuple of reward.Rewards ?? []) out.push(tuple);
    }
  }
  return out;
}

/** Flatten one `InfinityPhases[n].Get` block into reward tuples. */
export function phaseRewards(phase: InfinityPhase): RewardTuple[] {
  const out: RewardTuple[] = [];
  for (const get of phase.Get ?? []) {
    for (const tuple of get.Rewards ?? []) out.push(tuple);
  }
  return out;
}

// ── Execution ──────────────────────────────────────────────────────

export function decisionDuration(decision: DecisionDef, state: GameState): number {
  if (decision.Time === "inf") {
    const runtime = state.decisionStates[decision.__id ?? ""];
    const phases = decision.InfinityPhases ?? [];
    const idx = (runtime?.phaseIndex ?? 0) % Math.max(1, phases.length);
    const days = Number(phases[idx]?.Time ?? 30);
    return Math.max(1, Math.min(days, MAX_DECISION_DAYS));
  }
  return Math.max(1, Math.min(Number(decision.Time), MAX_DECISION_DAYS));
}

/** Create the task that will resolve a decision. */
export function makeDecisionTask(
  state: GameState,
  decision: DecisionDef,
  actorId: string
): GameTask {
  const days = decisionDuration(decision, state);
  const runtime = state.decisionStates[decision.__id ?? ""];
  const phaseIndex = decision.Time === "inf" ? (runtime?.phaseIndex ?? 0) : 0;

  return {
    id: ++state.taskIdCounter,
    kind: "decision",
    labelKey: "task.decision",
    labelParams: { name: decision.Name },
    icon: decision.Time === "inf" ? "♾" : "📜",
    actorId,
    startTime: state.clock.time,
    endTime: state.clock.time + days,
    cancellable: true,
    payload: { type: "decision", decisionId: decision.__id ?? decision.Name, actorId, phaseIndex },
  };
}

/**
 * Resolve a finished decision: apply its rewards and advance the phase cursor.
 * Returns the narrative text to surface (phase `Content`, or null).
 */
export function completeDecision(
  state: GameState,
  decision: DecisionDef,
  actorId: string
): { content: string | null; rewards: string[] } {
  const id = decision.__id ?? decision.Name;
  const runtime: { completed: number; phaseIndex: number; startedAt: number | null } =
    state.decisionStates[id] ?? { completed: 0, phaseIndex: 0, startedAt: null };

  const rewards: string[] = [];
  let content: string | null = null;

  if (decision.Time === "inf") {
    const phases = decision.InfinityPhases ?? [];
    const idx = runtime.phaseIndex % Math.max(1, phases.length);
    const phase = phases[idx];
    if (phase) {
      rewards.push(...applyRewards(state, actorId, phaseRewards(phase)));
      content = phase.Content ?? null;
    }
    runtime.phaseIndex = (idx + 1) % Math.max(1, phases.length);
  }

  // `Result` is applied on every completion — for a one-shot decision that is
  // its only payout, and for an infinite one it is the recurring bonus that
  // accompanies each phase.
  rewards.push(...applyRewards(state, actorId, resultRewards(decision)));

  runtime.completed += 1;
  runtime.startedAt = null;
  state.decisionStates[id] = runtime;

  return { content, rewards };
}

/** True when this decision is currently running. */
export function decisionInProgress(state: GameState, decisionId: string): GameTask | undefined {
  return state.tasks.find(
    (task) => task.payload.type === "decision" && task.payload.decisionId === decisionId
  );
}

/**
 * Enqueue a decision. Requirements are checked here and re-checked nowhere —
 * a decision, once begun, runs to completion.
 */
export function startDecision(
  state: GameState,
  decision: DecisionDef,
  actorId: string,
  targetId?: string
): { ok: boolean; message: string } {
  const id = decision.__id ?? decision.Name;

  if (decisionInProgress(state, id)) {
    return { ok: false, message: t("ui.task.busy") };
  }

  const { ok } = meetsRequirements(state, actorId, decision, targetId);
  if (!ok) return { ok: false, message: t("ui.req.unmet") };

  const task = makeDecisionTask(state, decision, actorId);
  state.tasks.push(task);

  const runtime = state.decisionStates[id] ?? { completed: 0, phaseIndex: 0, startedAt: null };
  runtime.startedAt = state.clock.time;
  state.decisionStates[id] = runtime;

  const days = Math.round(task.endTime - task.startTime);
  return {
    ok: true,
    message: t("ui.decision.started", { name: decision.Name, days }),
  };
}

/** Human-readable text for a Reward tuple, e.g. "CountryEndurance + 10". */
export function describeReward(tuple: RewardTuple): string {
  const attr = findAttribute(String(tuple[0]));
  const unit = attr?.unit ?? "";
  return `${attr?.name ?? tuple[0]} ${tuple[1]} ${tuple[2]}${unit}`;
}
