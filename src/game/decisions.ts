import { Country, GameEvent, GameState, GameTask } from "./types";
import { destroyCountry, detonateNuke, getCountryById } from "./state";
import { declareWarBetween } from "./war";
import {
  clamp,
  findAttribute,
  readRelation,
  resolveTarget,
  type RewardOp,
  type RequireOp,
} from "./attributes";
import { t } from "../i18n";
import { countryShortName } from "./names";
import { isSubjectOf, setSubject } from "./subjects";
import { BASE_DECISION_FILE_NAME as BASE_DECISION_FILE, getSettings } from "./settings";
import { isPlayTimeCode, playTimeEras } from "./eras";

// ── File schema ────────────────────────────────────────────────────
// Mirrors the `.warf-decision` format. Every decision file is
//   { "Country": "<id>", "Decisions": [ … ] }

/**
 * `[Attribute, op, value]`, an optional fourth element naming the country for
 * the pair-acting rewards (without it they fall back to the counterpart picked
 * in the panel — the same pick `To: "target"` refers to), and for `ToCountry`
 * any number of further `attribute op value` instructions.
 */
export type RewardTuple = [string, RewardOp | string, number, ...(string | number)[]];

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
  /**
   * Which scenarios this decision belongs to: one code or a list.
   * `ngtm` `dfig` `waku` `splt` `resm` — see PLAY_TIME_CODES. Absent means
   * `resm`, the present day.
   */
  PlayTime?: string | string[];
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
  /** Set by the loader — the file this came from. */
  __source?: string;
  /** Bulletins the file declares; published by the `EffectNews` reward. */
  News?: NewsDef[];
}

/**
 * A news bulletin declared at the top level of a decision file.
 *
 * It is data, not an effect: publishing it is what applies `Effects`, records
 * the id against the campaign, and puts the story in front of the player.
 */
export interface NewsDef {
  Type: "News" | string;
  /** Headline, and the bubble's title. */
  Title: string;
  /** Body copy. */
  Content: string;
  /** Nations the bulletin names; shown in the bubble's footer. */
  Countries?: string[];
  /** Reward tuples applied on publication. */
  Effects?: RewardTuple[];
  /** Stable id decision files reference. Must be unique across every file. */
  NewsId: string;
  /** Set by the loader — which file this came from. */
  __source?: string;
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

    // PlayTime is a closed vocabulary: a code the game does not know is a
    // typo, and a typo silently answered with "resm" would put a 1938 decision
    // in a 2000 campaign. Say so instead, and leave the decision out.
    if (def.PlayTime !== undefined) {
      const codes = Array.isArray(def.PlayTime) ? def.PlayTime : [def.PlayTime];
      const bad = codes.find((c) => !isPlayTimeCode(c));
      if (bad !== undefined) {
        errors.push({ source, message: t("dec.err.play_time", { name: def.Name, code: String(bad) }) });
        continue;
      }
      def.PlayTime = Array.isArray(def.PlayTime)
        ? def.PlayTime.map((c) => c.trim().toLowerCase())
        : def.PlayTime.trim().toLowerCase();
    }

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

  const news: NewsDef[] = [];
  if (Array.isArray(obj.News)) {
    for (const [i, n] of obj.News.entries()) {
      const def = n as NewsDef;
      const bad =
        typeof n !== "object" || n === null ||
        typeof def.NewsId !== "string" || !def.NewsId.trim() ||
        typeof def.Title !== "string" || typeof def.Content !== "string";
      if (bad) {
        errors.push({ source, message: t("dec.err.news", { n: i + 1 }) });
        continue;
      }
      def.NewsId = def.NewsId.trim();
      def.__source = source;
      if (!Array.isArray(def.Countries)) def.Countries = [];
      if (!Array.isArray(def.Effects)) def.Effects = [];
      news.push(def);
    }
  }

  return { Country: obj.Country, Decisions: decisions, News: news, __source: source };
}

// ── News registry ──────────────────────────────────────────────────

/**
 * Every declared bulletin, by id.
 *
 * Module-level for the same reason the decision map is: `checkRequire` and
 * `applyReward` are called from the panel, the scheduler and the research
 * paths, and threading a registry through all of them would buy nothing. The
 * store rebuilds it whenever the files are (re)loaded — see `registerNews`.
 */
let newsRegistry = new Map<string, NewsDef>();

/**
 * Rebuild the bulletin lookup. Ids must be unique across every file; the first
 * definition wins and the clash is reported so it shows up in the panel
 * instead of silently shadowing someone's news.
 */
export function registerNews(files: DecisionFile[]): { id: string; source: string }[] {
  const map = new Map<string, NewsDef>();
  const clashes: { id: string; source: string }[] = [];
  for (const file of files) {
    for (const news of file.News ?? []) {
      if (map.has(news.NewsId)) {
        clashes.push({ id: news.NewsId, source: news.__source ?? "?" });
        continue;
      }
      map.set(news.NewsId, news);
    }
  }
  newsRegistry = map;
  return clashes;
}

/** The bulletin with this id, if any file declares one. */
export function findNews(id: string): NewsDef | undefined {
  return newsRegistry.get(id.trim());
}

/**
 * Whether a file takes part in this campaign.
 *
 * The player switches files off in the pre-game settings; the base file is
 * never skippable, because decisions elsewhere assume the rules it sets down.
 * Matched on the bare file name, so a disk path and a bundled path agree.
 */
export function isDecisionFileEnabled(name: string): boolean {
  const file = name.split("/").pop() ?? name;
  if (file === BASE_DECISION_FILE) return true;
  return !getSettings().disabledDecisionFiles.includes(file);
}

/**
 * Load every decision file. Prefers the on-disk `decisions/` directory when
 * running inside Tauri (so files can be dropped in without a rebuild), then
 * falls back to the set bundled at build time.
 *
 * Files the player switched off are not read at all — no decisions, no news,
 * and no parse errors from a file that is not in play.
 */
export async function loadDecisions(): Promise<DecisionLoadResult> {
  const errors: DecisionLoadResult["errors"] = [];

  const core = tauriCore();
  if (core) {
    try {
      const files = (await core.invoke("load_decision_files")) as [string, string][] | null;
      const used = (files ?? []).filter(([name]) => isDecisionFileEnabled(name));
      if (used.length > 0) {
        const parsed: DecisionFile[] = [];
        for (const [name, text] of used) {
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
    if (!isDecisionFileEnabled(path)) continue;
    const f = parseDecisionFile(path.split("/").pop() ?? path, text, errors);
    if (f) parsed.push(f);
  }
  return { files: parsed, errors, source: Object.keys(bundled).length ? "bundled" : "none" };
}

/** Decisions available to a given country ("all" matches everyone). */
/**
 * Is this decision playable in this scenario?
 *
 * A decision that names no `PlayTime` is `resm` — the present day — so a file
 * written before the field existed keeps working exactly as it did, in the
 * campaign it was written for.
 */
export function decisionFitsEra(decision: DecisionDef, eraId: string): boolean {
  return playTimeEras(decision.PlayTime).includes(eraId as never);
}

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
 * Resolve a requirement's or reward's `To`.
 *
 * Almost all of it is `resolveTarget`'s job; the one thing that cannot know is
 * the counterpart picked in the panel, because it only ever sees a string. `To`
 * written as `target` means exactly that pick, and an omitted `To` falls back
 * to it too — which is what lets a reward tuple (which has no `To` field of its
 * own) act on the selected country.
 */
export function resolveTo(
  state: GameState,
  actorId: string,
  to: string | undefined,
  targetId?: string
): Country | undefined {
  const key = (to ?? "").trim().toLowerCase();
  if (key === "target" && targetId) return getCountryById(state, targetId);
  return resolveTarget(state, actorId, to ?? targetId);
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
    const other = resolveTo(state, actorId, req.To, targetId);
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

  // `NukedCountry` counts the warheads the actor itself has dropped on `To`. A
  // third party's strike does not satisfy it: this is a "did *we* do that"
  // check, not a "did anything happen there" check.
  if (type.toLowerCase() === "nukedcountry") {
    const other = resolveTo(state, actorId, req.To, targetId);
    if (!other) {
      return { require: req, ok: false, label: t("dec.req.unknown", { type }) };
    }
    const strikes = other.nukedBy.filter((id) => id === actorId).length;
    return {
      require: req,
      ok: compare(strikes, op, want),
      label: `${t("dec.req.nuked")} ${other.flag} ${other.id} ${op} ${want}`,
      current: strikes,
    };
  }

  // `War` is 1 while the actor and `To` are shooting at each other. Both lists
  // are supposed to agree; reading either is belt and braces against a desync.
  if (type.toLowerCase() === "war") {
    const other = resolveTo(state, actorId, req.To, targetId);
    const actor = getCountryById(state, actorId);
    if (!other || !actor) {
      return { require: req, ok: false, label: t("dec.req.unknown", { type }) };
    }
    const atWar =
      actor.atWarWith.includes(other.id) || other.atWarWith.includes(actor.id) ? 1 : 0;
    return {
      require: req,
      ok: compare(atWar, op, want),
      label: `${t("dec.req.war")} ${other.flag} ${other.id} ${op} ${want}`,
      current: atWar,
    };
  }

  // `FullDestroy` reads whether `To` has been erased from the map.
  if (type.toLowerCase() === "fulldestroy") {
    const other = resolveTo(state, actorId, req.To, targetId);
    if (!other) {
      return { require: req, ok: false, label: t("dec.req.unknown", { type }) };
    }
    const gone = other.destroyed ? 1 : 0;
    return {
      require: req,
      ok: compare(gone, op, want),
      label: `${t("dec.req.destroyed")} ${other.flag} ${other.id} ${op} ${want}`,
      current: gone,
    };
  }

  // `EffectNews` reads whether a bulletin has been published. `To` carries the
  // NewsId here, not a country — it is the only string slot a requirement has.
  if (type.toLowerCase() === "effectnews") {
    const news = findNews(String(req.To ?? ""));
    if (!news) {
      return { require: req, ok: false, label: t("dec.req.news_unknown", { id: req.To ?? "" }) };
    }
    const published = state.publishedNews.includes(news.NewsId) ? 1 : 0;
    return {
      require: req,
      ok: compare(published, op, want),
      label: `${t("dec.req.news")} ${news.Title} ${op} ${want}`,
      current: published,
    };
  }

  // `SideCountry` is 1 while `To` answers to the actor — either because a
  // decision bound it, or because the actor is sitting on its land.
  if (type.toLowerCase() === "sidecountry") {
    const other = resolveTo(state, actorId, req.To, targetId);
    if (!other) {
      return { require: req, ok: false, label: t("dec.req.unknown", { type }) };
    }
    const subject = isSubjectOf(state, other.id, actorId) ? 1 : 0;
    return {
      require: req,
      ok: compare(subject, op, want),
      label: `${t("dec.req.subject")} ${other.flag} ${other.id} ${op} ${want}`,
      current: subject,
    };
  }

  // `GetCasusBelli` reads the actor's war-goal list: 1 when `To` is on it.
  if (type.toLowerCase() === "getcasusbelli") {
    const other = resolveTo(state, actorId, req.To, targetId);
    const actor = getCountryById(state, actorId);
    if (!other || !actor) {
      return { require: req, ok: false, label: t("dec.req.unknown", { type }) };
    }
    const has = actor.warGoals.includes(other.id) ? 1 : 0;
    return {
      require: req,
      ok: compare(has, op, want),
      label: `${t("dec.req.casus_belli")} ${other.flag} ${other.id} ${op} ${want}`,
      current: has,
    };
  }

  // `resolveTo`, not `resolveTarget`: without it, `To: "target"` on a plain
  // attribute silently reads the *actor* instead of the picked country.
  const country = resolveTo(state, actorId, req.To, targetId);
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

/** Keywords `To` accepts besides a plain country id. */
const TO_KEYWORDS = new Set(["self", "player", "target", "enemy"]);

/** Attributes that take a counterpart, and so may name one inside a payload. */
const PAIR_ATTRS = new Set(["relation", "nukedcountry", "getcasusbelli", "war"]);

/** True when a payload token names a country rather than the next attribute. */
function isCountryToken(state: GameState, token: string): boolean {
  const key = token.trim();
  if (!key) return false;
  if (TO_KEYWORDS.has(key.toLowerCase())) return true;
  return Boolean(getCountryById(state, key.toUpperCase()));
}

/**
 * Resolve the country a `ToCountry` instruction points at.
 *
 * `target` is rejected without a pick rather than falling through to the actor,
 * which is what `resolveTarget` does with it — silently handing the reward to
 * the wrong nation is worse than saying nothing happened.
 */
function instructionCountry(
  state: GameState,
  subjectId: string,
  token: string,
  targetId?: string
): Country | undefined {
  if (token.trim().toLowerCase() === "target" && !targetId) return undefined;
  return resolveTo(state, subjectId, token, targetId);
}

/**
 * `["ToCountry", "+", 1, "JPN", "Economy", "-", 5]` — run the rewards that
 * follow against another nation.
 *
 * The payload after the country is a flat instruction list, read left to right:
 *
 *   `<Attribute> <op> <value>`            apply to the current subject
 *   `<Attribute> <op> <value> <country>`  same, for a pair attribute's counterpart
 *   `ToCountry <country>`                 move the subject again
 *
 * The subject starts as the tuple's own country and the panel pick stays
 * available to everything inside, so `ToCountry` costs an author nothing but
 * the redirect. Nothing is applied to the actor unless an instruction omits
 * `ToCountry` — the point of the attribute is that it does *not* touch home.
 */
function applyToCountry(
  state: GameState,
  subjectId: string,
  tuple: RewardTuple,
  targetId?: string
): string | null {
  const token = tuple[3] === undefined ? "" : String(tuple[3]).trim();
  if (!token) return t("dec.reward.no_target", { name: "ToCountry" });

  let subject = instructionCountry(state, subjectId, token, targetId);
  if (!subject) return t("dec.reward.bad_country", { to: token });

  const applied: string[] = [];
  const rest = tuple.slice(4);

  for (let i = 0; i < rest.length; ) {
    const head = String(rest[i] ?? "").trim();
    if (!head) {
      i += 1;
      continue;
    }

    if (head.toLowerCase() === "tocountry") {
      // `ToCountry JPN`, or the same `ToCountry + 1 JPN` shape as the outer
      // tuple — the placeholder is skipped rather than demanded.
      let at = i + 1;
      for (let skipped = 0; at < rest.length && skipped < 2; skipped++) {
        if (isCountryToken(state, String(rest[at] ?? ""))) break;
        at += 1;
      }
      const token2 = String(rest[at] ?? "").trim();
      const country = token2 ? instructionCountry(state, subjectId, token2, targetId) : undefined;
      if (!country) return t("dec.reward.bad_country", { to: token2 || "?" });
      subject = country;
      i = at + 1;
      continue;
    }

    const op = String(rest[i + 1] ?? "").trim();
    const value = Number(rest[i + 2] ?? 0);

    // A pair attribute can name its other side right here — but only when the
    // token is a country, never when it is the next attribute on the list.
    let counterpart: string | undefined;
    let step = 3;
    if (PAIR_ATTRS.has(head.toLowerCase())) {
      const candidate = String(rest[i + 3] ?? "").trim();
      if (candidate && isCountryToken(state, candidate)) {
        counterpart = candidate;
        step = 4;
      }
    }

    const inner: RewardTuple = counterpart
      ? [head, op, value, counterpart]
      : [head, op, value];
    const line = applyReward(state, subject.id, inner, targetId);
    if (line) applied.push(`${countryShortName(subject)} ${line}`);
    i += step;
  }

  return applied.length ? `→ ${applied.join(" · ")}` : null;
}

/**
 * Apply one reward tuple. Returns a log line, or null.
 *
 * `subjectId` is the nation the reward acts on — the decision-executing country
 * for a plain tuple, and whatever `ToCountry` redirected it to inside one. Pair
 * attributes use it as the actor: their counterpart is the tuple's fourth
 * element, or failing that the counterpart picked in the panel.
 */
export function applyReward(
  state: GameState,
  subjectId: string,
  tuple: RewardTuple,
  targetId?: string
): string | null {
  const [rawName, op, rawValue, rawToValue] = tuple;
  const name = String(rawName ?? "").trim();
  const value = Number(rawValue ?? 0);
  const rawTo = rawToValue === undefined || rawToValue === null ? undefined : String(rawToValue);

  // `ToCountry` is a modifier, not an effect: it hands everything after it to
  // another nation.
  if (name.toLowerCase() === "tocountry") {
    return applyToCountry(state, subjectId, tuple, targetId);
  }

  // `NukedCountry` fires a warhead at the counterpart. The tuple's operator and
  // value are ignored — dropping one warhead is the whole action, and
  // `["NukedCountry", "*", 3]` has no sensible reading. Nothing is gated here:
  // gate with a `Nuke` requirement if the strike should cost something.
  if (name.toLowerCase() === "nukedcountry") {
    const victim = rewardTarget(state, subjectId, rawTo, targetId);
    if (!victim) return t("dec.reward.no_target", { name });
    detonateNuke(state, subjectId, victim.id);
    return `☢ ${t("dec.reward.nuked", { flag: victim.flag, name: victim.name })}`;
  }

  // `War` declares war: `+` we declare on the counterpart, `-` they declare on
  // us. Like the other pair rewards the value is a placeholder; the operator is
  // the whole message. The scripted path skips the diplomatic gates — see
  // `declareWarBetween`.
  if (name.toLowerCase() === "war") {
    const other = rewardTarget(state, subjectId, rawTo, targetId);
    if (!other) return t("dec.reward.no_target", { name });
    const weAttack = op !== "-";
    const attacker = weAttack ? subjectId : other.id;
    const defender = weAttack ? other.id : subjectId;
    if (!declareWarBetween(state, attacker, defender)) {
      return `⚔ ${t("dec.reward.war_failed", { flag: other.flag, name: other.name })}`;
    }
    return weAttack
      ? `⚔ ${t("dec.reward.war_declared", { flag: other.flag, name: other.name })}`
      : `⚔ ${t("dec.reward.war_received", { flag: other.flag, name: other.name })}`;
  }

  // `FullDestroy` sinks the counterpart's land for good. Like the other
  // scripted pair rewards it skips every gate — the decision is the scenario.
  if (name.toLowerCase() === "fulldestroy") {
    const other = rewardTarget(state, subjectId, rawTo, targetId);
    if (!other) return t("dec.reward.no_target", { name });
    if (other.id === subjectId) return t("dec.reward.destroy_self", { name: other.name });
    if (other.destroyed) return `💣 ${t("dec.reward.destroyed_already", { flag: other.flag, name: other.name })}`;
    destroyCountry(state, other.id);
    return `💣 ${t("dec.reward.destroyed", { flag: other.flag, name: other.name })}`;
  }

  // `EffectNews` publishes a bulletin. The fourth element is the NewsId, not a
  // country — see `checkRequire` for why it lives in the string slot.
  if (name.toLowerCase() === "effectnews") {
    const id = (rawTo ?? "").trim();
    const news = findNews(id);
    if (!news) return t("dec.reward.news_unknown", { id: id || "?" });
    if (state.publishedNews.includes(news.NewsId)) {
      return `📰 ${t("dec.reward.news_already", { title: news.Title })}`;
    }
    const effects = publishNews(state, news, subjectId, targetId);
    const detail = effects.length ? ` · ${effects.join(" · ")}` : "";
    return `📰 ${t("dec.reward.news_published", { title: news.Title })}${detail}`;
  }

  // `SideCountry` binds the counterpart to us: `+` makes it a subject, `-`
  // releases the stored flag. Land we occupy keeps the condition true either
  // way, so releasing a vassal means handing its regions back.
  if (name.toLowerCase() === "sidecountry") {
    const other = rewardTarget(state, subjectId, rawTo, targetId);
    if (!other) return t("dec.reward.no_target", { name });
    if (other.id === subjectId) {
      return t("dec.reward.subject_self", { name: other.name });
    }
    if (op === "-") {
      setSubject(state, other.id, null);
      return t("dec.reward.subject_released", { flag: other.flag, name: other.name });
    }
    setSubject(state, other.id, subjectId);
    return t("dec.reward.subject", { flag: other.flag, name: other.name });
  }

  // `GetCasusBelli` writes the subject's war-goal list: `+` grants, `-` revokes.
  if (name.toLowerCase() === "getcasusbelli") {
    const actor = getCountryById(state, subjectId);
    const other = rewardTarget(state, subjectId, rawTo, targetId);
    if (!actor || !other) return t("dec.reward.no_target", { name });
    if (op === "-") {
      actor.warGoals = actor.warGoals.filter((id) => id !== other.id);
      return `⚖ ${t("dec.reward.casus_belli_revoked", { flag: other.flag, name: other.name })}`;
    }
    if (!actor.warGoals.includes(other.id)) actor.warGoals.push(other.id);
    return `⚖ ${t("dec.reward.casus_belli", { flag: other.flag, name: other.name })}`;
  }

  if (name.toLowerCase() === "relation") {
    const actor = getCountryById(state, subjectId);
    const other = rewardTarget(state, subjectId, rawTo, targetId);
    if (!other || !actor) return null;
    const cur = readRelation(state, subjectId, other.id);
    let next = cur + value;
    if (op === "-") next = cur - value;
    else if (op === "=") next = value;
    next = clamp(next, -100, 100);
    actor.relations[other.id] = next;
    other.relations[subjectId] = next;
    return `${name} ${op} ${value}`;
  }

  const attr = findAttribute(name);
  const country = getCountryById(state, subjectId);
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

/** How loud a bulletin reads, judged by how hard it shook the world. */
function severityForCollapse(delta: number): GameEvent["severity"] {
  if (delta >= 25) return "critical";
  if (delta >= 12) return "high";
  if (delta >= 5) return "medium";
  return "low";
}

/**
 * Publish a bulletin: run its effects, record it, and queue the story.
 *
 * The id is recorded *before* the effects run, so a bulletin whose effects
 * publish another one — or a cycle between two of them — cannot recurse
 * forever. Effects resolve against the same actor and target the reward had.
 */
export function publishNews(
  state: GameState,
  news: NewsDef,
  actorId: string,
  targetId?: string
): string[] {
  if (state.publishedNews.includes(news.NewsId)) return [];

  state.publishedNews.push(news.NewsId);

  const before = state.worldCollapse;
  const applied = applyRewards(state, actorId, news.Effects ?? [], targetId);
  const worldCollapseChange = state.worldCollapse - before;

  state.events.push({
    id: ++state.eventIdCounter,
    day: state.day,
    title: news.Title,
    description: news.Content,
    type: "news",
    severity: severityForCollapse(worldCollapseChange),
    affectedCountries: news.Countries ?? [],
    worldCollapseChange,
  });

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
  actorId: string,
  targetId?: string
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
    // Carried on the task as well as the payload so the queue can show which
    // country the decision is aimed at, the way action tasks do.
    targetId,
    startTime: state.clock.time,
    endTime: state.clock.time + days,
    cancellable: true,
    payload: {
      type: "decision",
      decisionId: decision.__id ?? decision.Name,
      actorId,
      phaseIndex,
      targetId,
    },
  };
}

/**
 * Who a pair-acting reward points at.
 *
 * An explicit fourth tuple element wins, so a decision can name its victim
 * ("this file nukes Japan, whoever the player is looking at"); otherwise the
 * counterpart picked in the panel. Neither present means the reward has no
 * country to act on and is skipped with a note in the reward log.
 */
function rewardTarget(
  state: GameState,
  actorId: string,
  rawTo: string | undefined,
  targetId?: string
): Country | undefined {
  const explicit = rawTo === undefined || rawTo === null ? "" : String(rawTo).trim();
  if (!explicit) return targetId ? getCountryById(state, targetId) : undefined;
  return resolveTo(state, actorId, explicit, targetId);
}

/**
 * Resolve a finished decision: apply its rewards and advance the phase cursor.
 * Returns the narrative text to surface (phase `Content`, or null).
 *
 * `targetId` is the counterpart the decision was started against, frozen into
 * the task when it was queued — so a decision that takes 120 days still hits
 * the country the player picked on the day they picked it.
 */
export function completeDecision(
  state: GameState,
  decision: DecisionDef,
  actorId: string,
  targetId?: string
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
      rewards.push(...applyRewards(state, actorId, phaseRewards(phase), targetId));
      content = phase.Content ?? null;
    }
    runtime.phaseIndex = (idx + 1) % Math.max(1, phases.length);
  }

  // `Result` is applied on every completion — for a one-shot decision that is
  // its only payout, and for an infinite one it is the recurring bonus that
  // accompanies each phase.
  rewards.push(...applyRewards(state, actorId, resultRewards(decision), targetId));

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

  // The panel only lists this scenario's decisions; this is the backstop for
  // the paths that do not come through it.
  if (!decisionFitsEra(decision, state.era)) {
    return { ok: false, message: t("ui.decision.wrong_era") };
  }

  if (decisionInProgress(state, id)) {
    return { ok: false, message: t("ui.task.busy") };
  }

  const { ok } = meetsRequirements(state, actorId, decision, targetId);
  if (!ok) return { ok: false, message: t("ui.req.unmet") };

  const task = makeDecisionTask(state, decision, actorId, targetId);
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
  const key = String(tuple[0] ?? "").trim().toLowerCase();
  // The pair-acting rewards read as nonsense in the "Name + 1" form, since the
  // number is a placeholder and the country comes from the panel.
  if (key === "tocountry") return t("dec.reward.to_country_label");
  if (key === "effectnews") return t("dec.reward.news_label");
  if (key === "fulldestroy") return t("dec.reward.destroyed_label");
  if (key === "sidecountry") {
    return t(tuple[1] === "-" ? "dec.reward.subject_released_label" : "dec.reward.subject_label");
  }
  if (key === "nukedcountry") return t("dec.reward.nuke_label");
  if (key === "war") {
    return t(tuple[1] === "-" ? "dec.reward.war_received_label" : "dec.reward.war_label");
  }
  if (key === "getcasusbelli") {
    return t(tuple[1] === "-" ? "dec.reward.casus_belli_revoked_label" : "dec.reward.casus_belli_label");
  }

  const attr = findAttribute(String(tuple[0]));
  const unit = attr?.unit ?? "";
  return `${attr?.name ?? tuple[0]} ${tuple[1]} ${tuple[2]}${unit}`;
}
