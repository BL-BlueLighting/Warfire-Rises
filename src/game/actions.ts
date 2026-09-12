import { GameState, GameTask, TaskKind } from "./types";
import { getCountryById, applyCollapse, adjustRelation, addPublicSupport, detonateNuke } from "./state";
import { t } from "../i18n";
import { countryName } from "./names";

/**
 * The single registry of player-initiated actions.
 *
 * Every action pays its cost up front, occupies the task queue for `days`
 * game-days, and applies its effect when the timer expires. Both the panels
 * and the console go through `startAction`, so the two can't diverge.
 */

export interface ActionCost {
  dp?: number;
  ae?: number;
  treasury?: number;
}

export interface ActionAvailability {
  ok: boolean;
  reason?: string;
}

export interface ActionDef {
  id: string;
  kind: TaskKind;
  /** i18n key for the button label. */
  labelKey: string;
  icon: string;
  /** Base duration in days. */
  days: number;
  /** Override for durations that depend on game state. */
  daysFor?: (state: GameState, actorId: string, targetId?: string) => number;
  cost?: ActionCost;
  /** Some actions are meaningless without a counterpart. */
  requiresTarget?: boolean;
  /** Extra gating beyond cost — mirrors the CLI command's checks. */
  available?: (state: GameState, actorId: string, targetId?: string) => ActionAvailability;
  /** The effect, run when the task completes. Returns a localized message. */
  apply: (state: GameState, actorId: string, targetId?: string) => string;
}

const ok = { ok: true };
const no = (reason: string): ActionAvailability => ({ ok: false, reason });

/** True when the nation currently has shooting wars on its hands. */
export function isAtWar(state: GameState, countryId: string): boolean {
  return (getCountryById(state, countryId)?.atWarWith.length ?? 0) > 0;
}

// ── Justification timer ────────────────────────────────────────────
// Spec: 90 days at neutral, shrinking as relations sour and growing as they
// warm. 90 * (1 - |rel|/100) for negative relations, 90 * (1 + rel/100) for
// positive — the two forms agree at rel = 0, so the curve is continuous.
export const JUSTIFY_BASE_DAYS = 90;

export function justifyDays(relation: number): number {
  const rel = Math.max(-100, Math.min(100, relation));
  const factor = rel < 0 ? 1 - Math.abs(rel) / 100 : 1 + rel / 100;
  return Math.max(1, Math.round(JUSTIFY_BASE_DAYS * factor));
}

export const ACTIONS: ActionDef[] = [
  // ── Diplomacy ──
  {
    id: "dip.improve", kind: "diplomacy", labelKey: "ui.act.improve", icon: "🕊", days: 10,
    cost: { dp: 10 }, requiresTarget: true,
    available: (_s, _a, targetId) => (targetId ? ok : no(t("ui.toast.select_country"))),
    apply: (state, actorId, targetId) => {
      adjustRelation(state, actorId, targetId!, 15);
      const c = getCountryById(state, targetId!)!;
      return t("cmd.diplomacy.improve", { flag: c.flag, name: c.name, cost: 10 });
    },
  },
  {
    id: "dip.treaty", kind: "diplomacy", labelKey: "ui.act.treaty", icon: "📜", days: 30,
    cost: { dp: 10 }, requiresTarget: true,
    apply: (state, actorId, targetId) => {
      adjustRelation(state, actorId, targetId!, 25);
      const c = getCountryById(state, targetId!)!;
      return t("cmd.diplomacy.treaty", { flag: c.flag, name: c.name, cost: 10 });
    },
  },
  {
    id: "dip.sanction", kind: "diplomacy", labelKey: "ui.act.sanction", icon: "🚫", days: 5,
    cost: { dp: 10 }, requiresTarget: true,
    apply: (state, actorId, targetId) => {
      const c = getCountryById(state, targetId!)!;
      adjustRelation(state, actorId, targetId!, -15);
      c.economy = Math.max(0, c.economy - 3);
      applyCollapse(state, 1, t("collapse.sanctions", { name: c.name }));
      return t("cmd.diplomacy.sanction", { flag: c.flag, name: c.name, cost: 10 });
    },
  },
  {
    id: "dip.condemn", kind: "diplomacy", labelKey: "ui.act.condemn", icon: "📣", days: 3,
    cost: { dp: 10 }, requiresTarget: true,
    apply: (state, actorId, targetId) => {
      const c = getCountryById(state, targetId!)!;
      adjustRelation(state, actorId, targetId!, -10);
      applyCollapse(state, 1, t("collapse.condemnation", { name: c.name }));
      return t("cmd.diplomacy.condemn", { flag: c.flag, name: c.name, cost: 10 });
    },
  },
  {
    id: "dip.justify", kind: "justify", labelKey: "ui.act.justify", icon: "⚖", days: JUSTIFY_BASE_DAYS,
    cost: { dp: 15 }, requiresTarget: true,
    daysFor: (state, actorId, targetId) => {
      const actor = getCountryById(state, actorId);
      return justifyDays(actor?.relations[targetId!] ?? 0);
    },
    available: (state, actorId, targetId) => {
      if (!targetId) return no(t("ui.toast.select_country"));
      const actor = getCountryById(state, actorId);
      if (!actor) return no(t("ui.toast.select_country"));
      if (actor.warGoals.includes(targetId)) return no(t("ui.justify.have"));
      if (actor.atWarWith.includes(targetId)) return no(t("ui.justify.at_war"));
      return ok;
    },
    apply: (state, actorId, targetId) => {
      const actor = getCountryById(state, actorId)!;
      const c = getCountryById(state, targetId!)!;
      if (!actor.warGoals.includes(c.id)) actor.warGoals.push(c.id);
      return t("ui.justify.done", { flag: c.flag, name: c.name });
    },
  },

  // ── Military ──
  {
    id: "mil.drill", kind: "military", labelKey: "ui.act.drill", icon: "🎯", days: 20,
    cost: { ae: 15 }, requiresTarget: true,
    apply: (state, actorId, targetId) => {
      const p = getCountryById(state, actorId)!;
      const c = getCountryById(state, targetId!)!;
      p.military = Math.min(100, p.military + 2);
      p.forceValue = Math.min(100, p.forceValue + 3);
      return t("cmd.military.drill", { flag: c.flag, name: c.name, cost: 15 });
    },
  },
  {
    id: "mil.deploy", kind: "military", labelKey: "ui.act.deploy", icon: "🚀", days: 15,
    cost: { ae: 15 }, requiresTarget: true,
    apply: (state, actorId, targetId) => {
      const c = getCountryById(state, targetId!)!;
      adjustRelation(state, actorId, targetId!, -8);
      applyCollapse(state, 2, t("collapse.forces_deployed", { name: c.name }));
      addPublicSupport(state, actorId, 3);
      return t("cmd.military.deploy", { flag: c.flag, name: c.name, cost: 15 });
    },
  },
  {
    id: "mil.strike", kind: "military", labelKey: "ui.act.strike", icon: "⚡", days: 10,
    cost: { ae: 15 }, requiresTarget: true,
    apply: (state, actorId, targetId) => {
      const c = getCountryById(state, targetId!)!;
      adjustRelation(state, actorId, targetId!, -25);
      c.military = Math.max(0, c.military - 10);
      c.stability = Math.max(0, c.stability - 10);
      applyCollapse(state, 5, t("collapse.military_strike", { name: c.name }));
      return t("cmd.military.strike", { flag: c.flag, name: c.name, cost: 15 });
    },
  },
  {
    id: "mil.aid", kind: "military", labelKey: "ui.act.aid", icon: "📦", days: 20,
    cost: { ae: 15 }, requiresTarget: true,
    apply: (state, actorId, targetId) => {
      const c = getCountryById(state, targetId!)!;
      adjustRelation(state, actorId, targetId!, 10);
      c.military = Math.min(100, c.military + 5);
      return t("cmd.military.aid", { flag: c.flag, name: c.name, cost: 15 });
    },
  },
  {
    id: "mil.nuclear", kind: "military", labelKey: "ui.act.nuclear", icon: "☢", days: 2,
    requiresTarget: true,
    available: (state, actorId, targetId) => {
      const p = getCountryById(state, actorId)!;
      if (!targetId || targetId === actorId) return no(t("cmd.nuclear.self"));
      if (!p.nuclear) return no(t("cmd.nuclear.no_nukes"));
      if (p.nukes < 1) return no(t("ui.nuke.no_warhead"));

      const target = getCountryById(state, targetId);
      if (!target) return no(t("ui.toast.select_country"));

      // Once war is joined, the warhead is the argument. Against a country you
      // are actually fighting, the domestic persuasion checks are waived
      // entirely — no public support, no coercion readiness, no attitude test.
      if (isAtWar(state, actorId) && p.atWarWith.includes(targetId)) return ok;

      // Against anyone else — and in peacetime — the original constraints hold.
      if (p.publicSupport < 70) return no(t("ui.req.public_support", { n: p.publicSupport }));
      const rel = target.relations[actorId] ?? 0;
      if (rel >= -50) return no(t("ui.req.attitude"));
      if (p.forceValue < 55) return no(t("ui.req.force", { n: p.forceValue }));
      return ok;
    },
    apply: (state, actorId, targetId) => {
      const p = getCountryById(state, actorId)!;
      const c = getCountryById(state, targetId!)!;
      // A strike consumes one warhead from the stockpile.
      p.nukes = Math.max(0, p.nukes - 1);
      detonateNuke(state, actorId, c.id);
      return (
        `${t("cmd.nuclear.detected")}\n` +
        t("cmd.nuclear.result", { flag: c.flag, name: c.name }) + "\n" +
        t("cmd.nuclear.survivors", { pop: c.population }) + "\n" +
        t("cmd.nuclear.army_gone", { n: c.divisions.length })
      );
    },
  },

  // ── Economy ──
  {
    id: "eco.invest", kind: "economy", labelKey: "ui.act.invest", icon: "🏗", days: 60,
    cost: { treasury: 500 },
    apply: (state, actorId) => {
      const p = getCountryById(state, actorId)!;
      p.economy = Math.min(100, p.economy + 3);
      state.nationalEndurance = Math.min(100, state.nationalEndurance + 2);
      return t("cmd.economy.invest", { amount: 500, boost: 3, ne: 2 });
    },
  },
  {
    id: "eco.stimulus", kind: "economy", labelKey: "ui.act.stimulus", icon: "💵", days: 90,
    cost: { treasury: 1000 },
    apply: (state, actorId) => {
      const p = getCountryById(state, actorId)!;
      p.economy = Math.min(100, p.economy + 5);
      p.stability = Math.min(100, p.stability + 5);
      applyCollapse(state, -1, t("collapse.markets_calm"));
      return t("cmd.economy.stimulus", { amount: 1, boost: 5, stb: 5 });
    },
  },
  {
    id: "eco.manipulate", kind: "economy", labelKey: "ui.act.manipulate", icon: "📉", days: 5,
    apply: (state) => {
      applyCollapse(state, 3, t("collapse.currency_manipulation"));
      state.exchangeRates.USD_CNY *= 1.05;
      state.exchangeRates.USD_EUR *= 0.95;
      return t("cmd.economy.manipulate");
    },
  },
  {
    id: "eco.sanction", kind: "economy", labelKey: "ui.act.ecosanction", icon: "🚫", days: 20,
    available: (state, actorId) => {
      const targets = state.countries.filter(
        (c) => c.id !== actorId && (c.relations[actorId] ?? 0) < -20
      );
      return targets.length > 0 ? ok : no(t("cmd.economy.no_targets"));
    },
    apply: (state, actorId) => {
      const targets = state.countries.filter(
        (c) => c.id !== actorId && (c.relations[actorId] ?? 0) < -20
      );
      const target = targets[Math.floor(Math.random() * targets.length)];
      target.economy = Math.max(0, target.economy - 5);
      adjustRelation(state, actorId, target.id, -10);
      applyCollapse(state, 1, t("collapse.economic_sanctions", { name: target.name }));
      return t("cmd.economy.sanction", { flag: target.flag, name: target.name });
    },
  },

  // ── Intelligence ──
  {
    id: "spy.infiltrate", kind: "espionage", labelKey: "ui.act.infiltrate", icon: "🕵", days: 45,
    cost: { dp: 12 }, requiresTarget: true,
    apply: (state, actorId, targetId) => {
      const c = getCountryById(state, targetId!)!;
      if (Math.random() > 0.3) {
        adjustRelation(state, actorId, targetId!, -5);
        return t("cmd.espionage.infiltrate_success", { flag: c.flag, name: c.name });
      }
      adjustRelation(state, actorId, targetId!, -15);
      applyCollapse(state, 2, t("collapse.espionage_scandal", { name: c.name }));
      return t("cmd.espionage.infiltrate_fail", { flag: c.flag, name: c.name });
    },
  },
  {
    id: "spy.sabotage", kind: "espionage", labelKey: "ui.act.sabotage", icon: "💣", days: 30,
    cost: { dp: 12 }, requiresTarget: true,
    apply: (state, actorId, targetId) => {
      const c = getCountryById(state, targetId!)!;
      c.military = Math.max(0, c.military - 8);
      c.economy = Math.max(0, c.economy - 3);
      adjustRelation(state, actorId, targetId!, -8);
      applyCollapse(state, 2, t("collapse.covert_sabotage", { name: c.name }));
      return t("cmd.espionage.sabotage", { flag: c.flag, name: c.name });
    },
  },
  {
    id: "spy.intel", kind: "espionage", labelKey: "ui.act.gather_intel", icon: "📡", days: 15,
    cost: { dp: 12 }, requiresTarget: true,
    apply: (_state, _actorId, targetId) => {
      void targetId;
      return t("ui.intel.gathered");
    },
  },

  // ── Propaganda ──
  {
    id: "prop.domestic", kind: "propaganda", labelKey: "ui.act.prop_domestic", icon: "📢", days: 10,
    cost: { dp: 8 },
    apply: (state, actorId) => {
      const p = getCountryById(state, actorId)!;
      p.stability = Math.min(100, p.stability + 5);
      state.nationalEndurance = Math.min(100, state.nationalEndurance + 3);
      addPublicSupport(state, actorId, 8);
      return t("cmd.propaganda.domestic");
    },
  },
  {
    id: "prop.foreign", kind: "propaganda", labelKey: "ui.act.prop_foreign", icon: "🌍", days: 20,
    cost: { dp: 8 },
    apply: (state, actorId) => {
      state.countries.forEach((c) => {
        if (c.id !== actorId) {
          if (!(actorId in c.relations)) c.relations[actorId] = 0;
          c.relations[actorId] = Math.min(100, c.relations[actorId] + 5);
        }
      });
      return t("cmd.propaganda.foreign");
    },
  },

  // War orders (attack / hold) are not in this registry: they are stances, not
  // timed tasks. See setStance in war.ts — battles tick daily by themselves.
];

const BY_ID = new Map(ACTIONS.map((a) => [a.id, a]));

export function getAction(id: string): ActionDef | undefined {
  return BY_ID.get(id);
}

// ── Cost / availability ────────────────────────────────────────────

export interface Affordability {
  ok: boolean;
  reason?: string;
}

export function canAfford(state: GameState, def: ActionDef, actorId: string): Affordability {
  const actor = getCountryById(state, actorId);
  if (!actor) return { ok: false, reason: t("ui.toast.select_country") };
  const cost = def.cost ?? {};

  // Diplomatic points and army endurance are the player's pools; an AI actor
  // has no equivalent, so treat them as unconstrained.
  const isPlayer = actorId === state.playerCountryId;
  if (cost.dp && isPlayer && state.diplomaticPoints < cost.dp) {
    return { ok: false, reason: t("ui.cost.need_dp", { n: cost.dp }) };
  }
  if (cost.ae && isPlayer && state.armyEndurance < cost.ae) {
    return { ok: false, reason: t("ui.cost.need_ae", { n: cost.ae }) };
  }
  if (cost.treasury && actor.treasury < cost.treasury) {
    return { ok: false, reason: t("ui.cost.need_treasury", { n: cost.treasury }) };
  }
  return { ok: true };
}

export interface ActionCheck extends Affordability {
  /** True when a task for this action is already running for this actor. */
  busy?: boolean;
}

export function checkAction(
  state: GameState,
  def: ActionDef,
  actorId: string,
  targetId?: string
): ActionCheck {
  const afford = canAfford(state, def, actorId);
  if (!afford.ok) return afford;
  if (def.available) {
    const avail = def.available(state, actorId, targetId);
    if (!avail.ok) return { ok: false, reason: avail.reason };
  }
  if (isBusy(state, def.id, actorId, targetId)) {
    return { ok: false, busy: true, reason: t("ui.task.busy") };
  }
  return { ok: true };
}

/** One in-flight instance per (action, actor, target) is enough. */
export function isBusy(
  state: GameState,
  actionId: string,
  actorId: string,
  targetId?: string
): boolean {
  return state.tasks.some(
    (task) =>
      task.payload.type === "action" &&
      task.payload.actionId === actionId &&
      task.payload.actorId === actorId &&
      task.payload.targetId === targetId
  );
}

export function actionDuration(
  state: GameState,
  def: ActionDef,
  actorId: string,
  targetId?: string
): number {
  const days = def.daysFor ? def.daysFor(state, actorId, targetId) : def.days;
  return Math.max(1, Math.round(days));
}

// ── Starting / completing ──────────────────────────────────────────

export interface StartResult {
  ok: boolean;
  message?: string;
}

/** Pay the cost and enqueue the task. The effect lands when it expires. */
export function startAction(
  state: GameState,
  actionId: string,
  actorId: string,
  targetId?: string
): StartResult {
  const def = getAction(actionId);
  if (!def) return { ok: false, message: t("ui.task.unknown_action", { id: actionId }) };

  const check = checkAction(state, def, actorId, targetId);
  if (!check.ok) return { ok: false, message: check.reason };

  const actor = getCountryById(state, actorId)!;
  const cost = def.cost ?? {};
  const isPlayer = actorId === state.playerCountryId;

  // Pay up front.
  if (cost.dp && isPlayer) state.diplomaticPoints -= cost.dp;
  if (cost.ae && isPlayer) state.armyEndurance -= cost.ae;
  if (cost.treasury) actor.treasury -= cost.treasury;

  const days = actionDuration(state, def, actorId, targetId);
  const task: GameTask = {
    id: ++state.taskIdCounter,
    kind: def.kind,
    labelKey: def.labelKey,
    labelParams: targetId
      ? { name: nameOf(state, targetId) }
      : undefined,
    icon: def.icon,
    actorId,
    targetId,
    startTime: state.clock.time,
    endTime: state.clock.time + days,
    cancellable: def.kind !== "war",
    payload: { type: "action", actionId, actorId, targetId },
  };
  state.tasks.push(task);

  return { ok: true, message: t("ui.task.started", { name: t(def.labelKey), days }) };
}

/** Run a completed action's effect. */
export function completeAction(state: GameState, task: GameTask): string {
  if (task.payload.type !== "action") return "";
  const def = getAction(task.payload.actionId);
  if (!def) return "";
  return def.apply(state, task.payload.actorId, task.payload.targetId);
}

/** Refund a cancelled task's cost. */
export function cancelTask(state: GameState, taskId: number): { ok: boolean; message: string } {
  const idx = state.tasks.findIndex((x) => x.id === taskId);
  if (idx === -1) return { ok: false, message: t("ui.task.not_found") };
  const task = state.tasks[idx];
  if (!task.cancellable) return { ok: false, message: t("ui.task.not_cancellable") };

  if (task.payload.type === "action") {
    const def = getAction(task.payload.actionId);
    const cost = def?.cost ?? {};
    const isPlayer = task.actorId === state.playerCountryId;
    // Refund half — cancelling is not free.
    if (cost.dp && isPlayer) state.diplomaticPoints = Math.min(100, state.diplomaticPoints + cost.dp / 2);
    if (cost.ae && isPlayer) state.armyEndurance = Math.min(100, state.armyEndurance + cost.ae / 2);
    const actor = getCountryById(state, task.actorId);
    if (cost.treasury && actor) actor.treasury += cost.treasury / 2;
  }

  state.tasks.splice(idx, 1);
  return { ok: true, message: t("ui.task.cancelled") };
}

function nameOf(state: GameState, countryId: string): string {
  return countryName(getCountryById(state, countryId)) || countryId;
}

/** Actions grouped for the panel UI. */
export function actionsOfKind(kind: TaskKind): ActionDef[] {
  return ACTIONS.filter((a) => a.kind === kind);
}
