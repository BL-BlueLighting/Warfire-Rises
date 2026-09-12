import { GameEvent, GameState, GameTask } from "./types";
import { regeneratePoints, getCountryById, getPlayerCountry } from "./state";
import { SPEED_RATES } from "./state";
import { processDayEvents } from "./events";
import { runAI } from "./ai";
import { completeAction } from "./actions";
import { completeResearch, completeBuild, tickNukeProduction } from "./research";
import { completeRecruit, tickArmy } from "./army";
import { completeDecision, type DecisionDef } from "./decisions";
import { tickWar } from "./war";
import { runAllStaff, describeStaff } from "./autoArmy";
import { t } from "../i18n";

/**
 * Drives game time forward and retires finished tasks.
 *
 * Time is continuous: `clock.time` is a fractional day count and `state.day`
 * is its floor. Callers pump `advanceTime` from a render loop with the real
 * elapsed milliseconds; the speed tier decides how much game time that buys.
 */

export interface SchedulerContext {
  /** Decision definitions by id, for resolving `decision` tasks. */
  decisions: Map<string, DecisionDef>;
}

export interface TickResult {
  /** Day-boundary crossings processed this frame. */
  daysAdvanced: number;
  /** Tasks that finished this frame. */
  completed: GameTask[];
  /** Player-facing messages produced by finishing tasks. */
  messages: string[];
  /** Every AI nation action, for the log and world feed. */
  worldActions: string[];
  /** The subset worth interrupting the player for — wars, peace, sanctions. */
  notableWorldActions: string[];
  /** Narrative text from decision phases. */
  narratives: string[];
  /** Events generated on this tick, for the notification bubbles. */
  events: GameEvent[];
}

/** Real milliseconds are clamped per frame so a stalled tab cannot fast-forward. */
const MAX_FRAME_MS = 250;

export function advanceTime(
  state: GameState,
  realDtMs: number,
  ctx: SchedulerContext
): TickResult {
  const result: TickResult = {
    daysAdvanced: 0, completed: [], messages: [], worldActions: [], notableWorldActions: [],
    narratives: [], events: [],
  };

  if (state.phase !== "playing") return result;
  const rate = SPEED_RATES[state.clock.speed] ?? 0;
  if (rate <= 0) return result;

  const dt = Math.min(realDtMs, MAX_FRAME_MS);
  const previousDay = Math.floor(state.clock.time);
  state.clock.time += (dt / 1000) * rate;
  const currentDay = Math.floor(state.clock.time);

  // One daily tick per boundary crossed.
  for (let d = previousDay; d < currentDay; d++) {
    state.day = d + 1;
    runDailyTick(state, result);
    result.daysAdvanced++;
    if (state.phase !== "playing") break;
  }
  state.day = Math.floor(state.clock.time);

  // Retire finished tasks. A task that finishes during a daily tick is caught
  // on the next frame, which keeps this loop simple.
  if (state.phase === "playing") {
    for (const task of [...state.tasks]) {
      if (state.clock.time < task.endTime) continue;
      const idx = state.tasks.indexOf(task);
      if (idx !== -1) state.tasks.splice(idx, 1);
      const outcome = completeTask(state, task, ctx);
      result.completed.push(task);
      if (outcome.message) result.messages.push(outcome.message);
      if (outcome.narrative) result.narratives.push(outcome.narrative);
    }
  }

  return result;
}

/** Everything that happens when the calendar rolls over one day. */
function runDailyTick(state: GameState, result: TickResult): void {
  regeneratePoints(state);

  const aiActions = runAI(state);
  if (aiActions.length > 0) {
    result.worldActions.push(...aiActions.map((a) => a.text));
    // Cap the interruptions — even notable news can only be so interesting.
    result.notableWorldActions.push(
      ...aiActions.filter((a) => a.notable).map((a) => a.text).slice(0, 2)
    );
  }

  // One day of fighting, if a war is live. Battles resolve themselves; the
  // player's war orders set a stance rather than triggering each round.
  if (state.activeWar?.active) {
    const outcome = tickWar(state);
    if (outcome) result.messages.push(outcome);
    getPlayerCountry(state).forceValue = Math.min(100, getPlayerCountry(state).forceValue + 5);
  }

  const eventsBefore = state.events.length;
  processDayEvents(state);
  result.events.push(...state.events.slice(eventsBefore));

  // The general staff, for any nation that has handed its army over.
  for (const { countryId, report } of runAllStaff(state)) {
    if (countryId === state.playerCountryId) {
      result.messages.push(...describeStaff(report));
    }
  }

  // Per-country upkeep: manpower regeneration, unit rest, warhead production.
  for (const country of state.countries) {
    tickArmy(state, country.id);
    const produced = tickNukeProduction(state, country.id);
    if (produced > 0 && country.id === state.playerCountryId) {
      result.messages.push(t("ui.nuke.produced", { n: produced }));
    }
  }
}

export interface TaskOutcome {
  message: string;
  narrative?: string;
}

export function completeTask(
  state: GameState,
  task: GameTask,
  ctx: SchedulerContext
): TaskOutcome {
  const payload = task.payload;

  switch (payload.type) {
    case "action":
      return { message: completeAction(state, task) };

    case "research":
      return { message: completeResearch(state, payload.countryId, payload.techId) };

    case "build":
      return { message: completeBuild(state, payload.countryId, payload.buildingId) };

    case "recruit":
      return {
        message: completeRecruit(state, payload.countryId, payload.divisions, payload.manpowerEach),
      };

    case "decision": {
      const decision = ctx.decisions.get(payload.decisionId);
      if (!decision) return { message: "" };
      const { content, rewards } = completeDecision(state, decision, payload.actorId);
      const rewardText = rewards.length ? `\n${rewards.join(" · ")}` : "";
      return {
        message: t("ui.decision.completed", { name: decision.Name }) + rewardText,
        narrative: content ?? undefined,
      };
    }

    default:
      return { message: "" };
  }
}

/** 0..1 progress for a task, clamped. */
export function taskProgress(state: GameState, task: GameTask): number {
  const span = task.endTime - task.startTime;
  if (span <= 0) return 1;
  return Math.max(0, Math.min(1, (state.clock.time - task.startTime) / span));
}

/** Whole days remaining, rounded up. */
export function taskDaysLeft(state: GameState, task: GameTask): number {
  return Math.max(0, Math.ceil(task.endTime - state.clock.time));
}

/** Tasks belonging to a country, soonest first. */
export function tasksFor(state: GameState, countryId: string): GameTask[] {
  return state.tasks
    .filter((task) => task.actorId === countryId)
    .sort((a, b) => a.endTime - b.endTime);
}

/** Remove a task without running its effect (used when cancelling). */
export function dropTask(state: GameState, taskId: number): void {
  const idx = state.tasks.findIndex((x) => x.id === taskId);
  if (idx !== -1) state.tasks.splice(idx, 1);
}

export { getCountryById };
