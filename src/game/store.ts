import { useSyncExternalStore } from "react";
import {
  GameEvent,
  GameState,
  MapMode,
  PanelTab,
  Toast,
  CommandResult,
} from "./types";
import {
  createInitialState,
  getPlayerCountry,
  getCountryById,
  setSpeed,
  togglePause,
  MAX_SPEED,
  continueAs,
} from "./state";
import { DEFAULT_DIFFICULTY, isDifficulty, type Difficulty } from "./difficulty";
import { getSettings } from "./settings";
import { closeConference, runAIClaims } from "./peace";
import { pickObjection, overruleCost } from "./autoArmy";
import { countryName } from "./names";
import { processDayEvents } from "./events";
import { executeCommand } from "./commands";
import { fetchExchangeRates, fetchWorldKeywords, getTodayDate } from "./worldData";
import {
  deserialize,
  listSaves,
  peekSave,
  toSaveSlot,
  loadFromDisk,
  saveToDisk,
  deleteSave,
  type SaveSlot,
  type SaveSlotInfo,
} from "./save";
import { advanceTime, taskProgress as computeProgress, dropTask } from "./scheduler";
import { loadDecisions, decisionsForCountry, registerNews, type DecisionDef, type DecisionFile } from "./decisions";
import { setDecisionFileEnabled } from "./settings";
import { cancelTask } from "./actions";
import { t, setLanguage, getLanguage, Language } from "../i18n";

// ── Shape ──────────────────────────────────────────────────────────

export interface UiState {
  mapMode: MapMode;
  tab: PanelTab;
  selectedCountryId: string | null;
  hoveredCountryId: string | null;
  toasts: Toast[];
  /** Lines produced by AI nations each turn. */
  worldFeed: string[];
  /** Console transcript (the CLI-style command layer, kept as a power tool). */
  consoleLines: string[];
  consoleOpen: boolean;
  campaignStart: string;
  /** Country id awaiting an irreversible-action confirmation. */
  pendingConfirm: { kind: "nuclear" | "retreat"; countryId?: string } | null;
  loadingStep: number;
  /** Narrative pushed by a decision phase, shown as a modal. */
  narrative: { title: string; body: string } | null;
  /** Display-settings dialog. */
  settingsOpen: boolean;
  /**
   * Preparation countdown between choosing a nation and playing. While it runs
   * the map stays on screen and is forced to draw every layer, so the campaign
   * opens on frames that are already rasterised.
   */
  startup: { progress: number; stageKey: string; secondsLeft: number } | null;
  /**
   * Append internal country codes (CHN, USA …) to on-screen names. Off by
   * default — the codes are an implementation detail — and toggled from the
   * console with `debug`.
   */
  showDebugCodes: boolean;
  /** Skip the preparation countdown. Debug only — see the `debug` command. */
  skipPrepareWait: boolean;
  /** The black fiction notice shown before a streamed campaign begins. */
  disclaimer: boolean;
  /**
   * A manual army order the general staff is objecting to. The change is held
   * here rather than applied, so confirming or cancelling is a real choice.
   */
  armyObjection: { apply: () => void; objectionKey: string } | null;
  /**
   * Transient notifications pinned to the map's bottom-right corner: world
   * events and AI actions both land here. They expire after EVENT_BUBBLE_MS
   * and can be dismissed with a right-click — dismissing is permanent, they
   * are never re-shown.
   */
  bubbles: Bubble[];
  /** Game day the last AI-action bubble was posted, for rate limiting. */
  lastWorldBubbleDay: number;

  // ── Decision files ──
  decisionFiles: DecisionFile[];
  /**
   * Every decision file the game can see, for the pre-game manager. Read
   * before a campaign exists, which is the only time it can be changed.
   */
  decisionCatalog: { name: string; decisions: number; news: number }[];
  /** Occupied slots, for the save dialog. Refreshed whenever it opens. */
  saveSlots: SaveSlotInfo[];
  saveDialogOpen: boolean;
  /** The slot this campaign was loaded from (or last written to). */
  currentSlot: string;
  decisionErrors: { source: string; message: string }[];
  decisionSource: "bundled" | "disk" | "none";
}

/** How long a bubble stays on screen. */
export const EVENT_BUBBLE_MS = 30_000;

/** At most this many bubbles stack up at once. */
const MAX_EVENT_BUBBLES = 5;

/**
 * Minimum game days between two AI-action bubbles.
 *
 * Eleven nations acting every day produce a constant stream of war, peace and
 * sanction notices. Posting each one buries the world events the player
 * actually needs to read, so world news is throttled to one notice per window
 * while the Log panel keeps the complete record.
 */
const WORLD_BUBBLE_GAP_DAYS = 5;

/** What produced a bubble — drives its header treatment. */
export type BubbleKind = "event" | "world";

export interface Bubble {
  id: number;
  kind: BubbleKind;
  /** i18n key for the small uppercase header label. */
  labelKey: string;
  icon: string;
  /** Headline: an event's title, or the AI action sentence. */
  title: string;
  /** Optional body copy. */
  body?: string;
  /** Country ids to name in the footer; localised at render time. */
  countryIds?: string[];
  /** World-collapse delta, when the source moved it. */
  wc?: number;
  /** Left border colour. */
  color: string;
  /** Wall-clock expiry, in ms since epoch. */
  expiresAt: number;
}

const SEVERITY_COLOR: Record<string, string> = {
  low: "var(--green)",
  medium: "var(--gold)",
  high: "var(--orange)",
  critical: "var(--red-bright)",
};

const TYPE_ICON: Record<string, string> = {
  news: "📰",
  political: "🏛",
  military: "⚔",
  economic: "💰",
  diplomatic: "🤝",
  disaster: "🌪",
  crisis: "⚠",
};

/** Build a bubble from a world event. */
function eventToBubble(event: GameEvent, expiresAt: number): Omit<Bubble, "id"> {
  return {
    kind: "event",
    labelKey: `event_type.${event.type}`,
    icon: TYPE_ICON[event.type] ?? "•",
    title: event.title,
    body: event.description,
    countryIds: event.affectedCountries,
    wc: event.worldCollapseChange || undefined,
    color: SEVERITY_COLOR[event.severity] ?? "var(--brass)",
    expiresAt,
  };
}

/** Build a bubble from an AI action line. */
function worldToBubble(text: string, expiresAt: number): Omit<Bubble, "id"> {
  return {
    kind: "world",
    labelKey: "ui.log.world",
    icon: "🌐",
    title: text,
    color: "var(--blue)",
    expiresAt,
  };
}

interface Store {
  state: GameState | null;
  ui: UiState;
}

const store: Store = {
  state: null,
  ui: {
    mapMode: "political",
    tab: "nation",
    selectedCountryId: null,
    hoveredCountryId: null,
    toasts: [],
    worldFeed: [],
    consoleLines: [],
    consoleOpen: false,
    campaignStart: getTodayDate(),
    pendingConfirm: null,
    loadingStep: 0,
    narrative: null,
    settingsOpen: false,
    startup: null,
    showDebugCodes: false,
    skipPrepareWait: false,
    disclaimer: false,
    armyObjection: null,
    bubbles: [],
    lastWorldBubbleDay: 0,
    decisionFiles: [],
    decisionCatalog: [],
    saveSlots: [],
    saveDialogOpen: false,
    currentSlot: "1",
    decisionErrors: [],
    decisionSource: "none",
  },
};

/** Decision lookup handed to the scheduler. Rebuilt whenever files reload. */
let decisionMap = new Map<string, DecisionDef>();

function rebuildDecisionMap(): void {
  const map = new Map<string, DecisionDef>();
  for (const file of store.ui.decisionFiles) {
    for (const d of file.Decisions) {
      if (d.__id) map.set(d.__id, d);
    }
  }
  decisionMap = map;
  // Bulletins live in the same files; a duplicated NewsId is a load error the
  // panel should show, not a silent shadowing.
  const clashes = registerNews(store.ui.decisionFiles);
  for (const clash of clashes) {
    store.ui.decisionErrors = [
      ...store.ui.decisionErrors,
      { source: clash.source, message: t("dec.err.news_dup", { id: clash.id }) },
    ];
  }
}

// ── Reactivity ─────────────────────────────────────────────────────
// Same approach as the CLI edition: mutate the game object in place and bump a
// counter to trigger re-renders.

let version = 0;
const listeners = new Set<() => void>();

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function getSnapshot(): number {
  return version;
}

let toastSeq = 0;
let bubbleSeq = 0;

export function notify(): void {
  version++;
  listeners.forEach((fn) => fn());
}

export function useStore(): Store {
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return store;
}

export function getStore(): Store {
  return store;
}

// Dev-only handle for poking at game state from the browser console or an
// automated test. Stripped from production bundles by the DEV guard.
if (import.meta.env.DEV) {
  (window as unknown as { __warfire?: Store }).__warfire = store;
}

export function getDecisions(): Map<string, DecisionDef> {
  return decisionMap;
}

/** Decisions available to the currently selected/player nation. */
export function availableDecisions(countryId: string): DecisionDef[] {
  return decisionsForCountry(store.ui.decisionFiles, countryId);
}

// ── Toasts ─────────────────────────────────────────────────────────

export function pushToast(kind: Toast["kind"], message: string): void {
  const toast: Toast = { id: ++toastSeq, kind, message };
  store.ui.toasts = [...store.ui.toasts.slice(-4), toast];
  notify();
  setTimeout(() => {
    store.ui.toasts = store.ui.toasts.filter((x) => x.id !== toast.id);
    notify();
  }, kind === "error" ? 9000 : 6000);
}

// ── UI actions ─────────────────────────────────────────────────────

export function setMapMode(mode: MapMode): void {
  store.ui.mapMode = mode;
  notify();
}

export function setTab(tab: PanelTab): void {
  store.ui.tab = tab;
  notify();
}

export function setHovered(countryId: string | null): void {
  if (store.ui.hoveredCountryId === countryId) return;
  store.ui.hoveredCountryId = countryId;
  notify();
}

export function selectCountry(countryId: string | null): void {
  store.ui.selectedCountryId = countryId;
  if (countryId && countryId !== store.state?.playerCountryId) {
    if (store.ui.tab === "nation") store.ui.tab = "diplomacy";
  }
  notify();
}

export function toggleConsole(open?: boolean): void {
  store.ui.consoleOpen = open ?? !store.ui.consoleOpen;
  notify();
}

export function requestConfirm(kind: "nuclear" | "retreat", countryId?: string): void {
  store.ui.pendingConfirm = { kind, countryId };
  notify();
}

export function cancelConfirm(): void {
  store.ui.pendingConfirm = null;
  notify();
}

export function toggleDebugCodes(): void {
  store.ui.showDebugCodes = !store.ui.showDebugCodes;
  notify();
}

/**
 * Close the peace conference, write the new borders and let the AI delegations
 * take the regions the player left on the table.
 */
export function closeConferenceNow(): void {
  const state = store.state;
  if (!state?.conference) return;
  runAIClaims(state.conference, state.playerCountryId);
  const outcome = closeConference(state, state.conference);
  state.conference = null;
  pushToast(
    "success",
    t("ui.peace.closed", { n: outcome.transferred.length, left: outcome.unclaimed.length })
  );
  notify();
}

/**
 * Make a manual change to the army.
 *
 * With the general staff in charge, the order is not applied straight away —
 * the staff objects first. The player can still have their way; it costs
 * endurance, which is the point of the warning.
 */
export function attemptArmyChange(apply: () => void): void {
  const state = store.state;
  if (!state) return;
  const player = getPlayerCountry(state);

  if (!player.autoArmy) {
    apply();
    notify();
    return;
  }

  store.ui.armyObjection = { apply, objectionKey: pickObjection() };
  notify();
}

export function cancelArmyChange(): void {
  store.ui.armyObjection = null;
  notify();
}

/** Overrule the staff: the change lands, and the army pays for it. */
export function confirmArmyChange(): void {
  const state = store.state;
  const pending = store.ui.armyObjection;
  if (!state || !pending) return;

  pending.apply();
  const cost = overruleCost();
  state.armyEndurance = Math.max(0, state.armyEndurance - cost);
  // The staff stands down rather than immediately undoing the order.
  getPlayerCountry(state).staffSilencedUntil = state.day + STAFF_SILENCE_DAYS;
  store.ui.armyObjection = null;

  pushToast("warn", t("ui.objection.penalty", { n: cost }));
  notify();
}

export function openSettings(): void {
  if (!store.state) void refreshDecisionCatalog();
  store.ui.settingsOpen = true;
  notify();
}

export function closeSettings(): void {
  store.ui.settingsOpen = false;
  notify();
}

export function dismissNarrative(): void {
  store.ui.narrative = null;
  notify();
}

/** Right-click dismisses a bubble for good; it is not queued or re-shown. */
export function dismissBubble(id: number): void {
  store.ui.bubbles = store.ui.bubbles.filter((b) => b.id !== id);
  notify();
}

export function clearBubbles(): void {
  store.ui.bubbles = [];
  store.ui.lastWorldBubbleDay = 0;
  notify();
}

export function switchLanguage(lang: Language): void {
  setLanguage(lang);
  pushToast("info", t("ui.toast.language"));
}

// ── Time controls ──────────────────────────────────────────────────

export function changeSpeed(speed: number): void {
  if (!store.state) return;
  setSpeed(store.state, speed);
  notify();
}

export function pauseToggle(): void {
  if (!store.state) return;
  togglePause(store.state);
  notify();
}

export { MAX_SPEED };

// ── The render loop ────────────────────────────────────────────────

let rafId: number | null = null;
let lastTs = 0;
let lastNotify = 0;

/** Repaint cadence while time is running — smooth enough, far cheaper than 60fps. */
const NOTIFY_INTERVAL_MS = 90;

function frame(ts: number): void {
  const state = store.state;
  if (!state || state.phase !== "playing") {
    rafId = null;
    lastTs = 0;
    return;
  }

  const dt = lastTs ? ts - lastTs : 0;
  lastTs = ts;

  const result = advanceTime(state, dt, { decisions: decisionMap });

  if (result.worldActions.length > 0) {
    store.ui.worldFeed = [...result.worldActions.slice(-40)];
  }
  if (result.messages.length > 0 || result.worldActions.length > 0) {
    store.ui.consoleLines = [
      ...store.ui.consoleLines.slice(-300),
      ...result.worldActions,
      ...result.messages,
    ];
    const player = getPlayerCountry(state);
    for (const msg of result.messages) {
      // AI chatter goes to the feed only; anything naming the player is a toast.
      if (msg.includes(player.name) || msg.includes(player.id)) {
        pushToast("info", msg);
      }
    }
  }

  let bubblesChanged = false;

  const now = Date.now();
  const fresh: Omit<Bubble, "id">[] = result.events.map((e) =>
    eventToBubble(e, now + EVENT_BUBBLE_MS)
  );

  // World news is rate limited; only the most recent notice in the window shows.
  if (
    result.notableWorldActions.length > 0 &&
    state.day - store.ui.lastWorldBubbleDay >= WORLD_BUBBLE_GAP_DAYS
  ) {
    store.ui.lastWorldBubbleDay = state.day;
    const latest = result.notableWorldActions[result.notableWorldActions.length - 1];
    fresh.push(worldToBubble(latest, now + EVENT_BUBBLE_MS));
  }

  if (fresh.length > 0) {
    store.ui.bubbles = [
      ...store.ui.bubbles,
      ...fresh.map((b) => ({ ...b, id: ++bubbleSeq })),
    ].slice(-MAX_EVENT_BUBBLES);
    bubblesChanged = true;
  } else if (store.ui.bubbles.length > 0) {
    const now = Date.now();
    const alive = store.ui.bubbles.filter((b) => b.expiresAt > now);
    if (alive.length !== store.ui.bubbles.length) {
      store.ui.bubbles = alive;
      bubblesChanged = true;
    }
  }

  if (result.narratives.length > 0) {
    store.ui.narrative = { title: t("ui.decision.phase_title"), body: result.narratives.join("\n\n") };
  }

  const mustRepaint = result.daysAdvanced > 0 || result.completed.length > 0 || bubblesChanged;
  if (mustRepaint || ts - lastNotify >= NOTIFY_INTERVAL_MS) {
    lastNotify = ts;
    notify();
  }

  rafId = requestAnimationFrame(frame);
}

export function startClock(): void {
  if (rafId !== null) return;
  lastTs = 0;
  rafId = requestAnimationFrame(frame);
}

export function stopClock(): void {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

// ── Game lifecycle ─────────────────────────────────────────────────

/**
 * How long the preparation screen is shown.
 *
 * Not a fabricated delay: the map is re-rendered with every layer enabled for
 * the duration, which is what actually costs the time — the data fetches finish
 * in a second or two.
 */
export const STARTUP_SECONDS = 60;

/** Days the general staff keeps its own counsel after being overruled. */
export const STAFF_SILENCE_DAYS = 15;

/** How long the streaming disclaimer is held. */
export const DISCLAIMER_MS = 5000;

export async function newGame(countryId: string, difficulty: Difficulty = DEFAULT_DIFFICULTY): Promise<void> {
  const startedAt = Date.now();
  const deadline = startedAt + STARTUP_SECONDS * 1000;
  store.ui.startup = { progress: 0, stageKey: "ui.startup.intel", secondsLeft: STARTUP_SECONDS };
  notify();

  const ratesPromise = fetchExchangeRates();
  const keywordsPromise = fetchWorldKeywords();
  const decisionsPromise = loadDecisions();

  store.ui.startup.stageKey = "ui.startup.intel";
  notify();
  const rates = await ratesPromise;

  store.ui.startup.stageKey = "ui.startup.news";
  notify();
  const keywords = await keywordsPromise;

  store.ui.startup.stageKey = "ui.startup.decisions";
  notify();
  const decisions = await decisionsPromise;

  store.ui.decisionFiles = decisions.files;
  store.ui.decisionErrors = decisions.errors;
  store.ui.decisionSource = decisions.source;
  rebuildDecisionMap();

  const state = createInitialState(keywords, rates);
  state.playerCountryId = countryId;
  state.difficulty = difficulty;
  processDayEvents(state);

  // The campaign is held back until preparation finishes. Publishing it now
  // would swap the app straight to the game view, and the banner — which lives
  // on the title screen — would never be seen.
  setSpeed(state, 0);

  // `debug disable_prepare_wait` skips the countdown entirely.
  if (store.ui.skipPrepareWait) {
    store.ui.startup = null;
  } else {

  // Countdown. Not a fabricated delay: for its whole duration the map is drawn
  // with every layer enabled, which is what actually costs the time.
  await new Promise<void>((resolve) => {
    const tick = () => {
      const now = Date.now();
      const elapsed = (now - startedAt) / 1000;
      const remaining = Math.max(0, (deadline - now) / 1000);

      if (now >= deadline) {
        store.ui.startup = null;
        resolve();
        return;
      }

      store.ui.startup = {
        progress: Math.min(1, elapsed / STARTUP_SECONDS),
        stageKey:
          elapsed < 20 ? "ui.startup.borders"
          : elapsed < 40 ? "ui.startup.regions"
          : elapsed < 55 ? "ui.startup.cities"
          : "ui.startup.sim",
        secondsLeft: Math.ceil(remaining),
      };
      notify();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  }

  // Streaming mode: hold on a black card stating the game is fiction before
  // anything of the campaign is shown.
  if (getSettings().streamingMode && !store.ui.skipPrepareWait) {
    store.ui.disclaimer = true;
    notify();
    await new Promise<void>((resolve) => setTimeout(resolve, DISCLAIMER_MS));
    store.ui.disclaimer = false;
    notify();
  }

  // Preparation done — hand the campaign over.
  store.state = state;
  store.ui.selectedCountryId = countryId;
  store.ui.tab = "nation";
  store.ui.worldFeed = [];
  store.ui.narrative = null;
  store.ui.consoleLines = [
    t("app.game_header"),
    `${t("app.date_label")} ${getTodayDate()}`,
    `${t("app.you_control")} ${countryName(getCountryById(state, countryId)) || countryId}`,
    ...state.briefing.map((b) => `📰 ${b}`),
  ];
  store.ui.campaignStart = getTodayDate();
  setSpeed(state, 2);
  startClock();
  notify();
}

/**
 * Read the file list for the pre-game manager.
 *
 * Nothing here can change once a campaign is running, so this is only useful
 * on the title screen — but it is harmless (and cheap) to call again later.
 */
export async function refreshDecisionCatalog(): Promise<void> {
  const result = await loadDecisions();
  store.ui.decisionCatalog = result.files.map((f) => ({
    name: (f.__source ?? f.Country).split("/").pop() ?? f.Country,
    decisions: f.Decisions.length,
    news: (f.News ?? []).length,
  }));
  notify();
}

/** Switch a decision file on or off for the next campaign. */
export function toggleDecisionFile(name: string, enabled: boolean): void {
  setDecisionFileEnabled(name, enabled);
  notify();
}

/** Re-read decision files from disk without restarting the campaign. */
export async function reloadDecisions(): Promise<void> {
  const result = await loadDecisions();
  store.ui.decisionFiles = result.files;
  store.ui.decisionErrors = result.errors;
  store.ui.decisionSource = result.source;
  rebuildDecisionMap();
  pushToast(
    result.errors.length ? "warn" : "success",
    t("ui.decision.reloaded", { n: result.files.reduce((s, f) => s + f.Decisions.length, 0) })
  );
  notify();
}

/**
 * Run a game action expressed as a CLI-style command string — the panel
 * buttons and the in-game console share this single code path.
 */
export function runAction(command: string): CommandResult {
  const state = store.state;

  // Deliberately not gated on `state`: the console is reachable from the title
  // screen, and the commands that matter there — the `debug` toggles, which are
  // how you skip the preparation wait — never read the game state. Commands
  // that do need it throw on the empty stub and come back as an error.
  const input = command.trim() === "war" ? "war status" : command;
  const result = executeCommand((state ?? {}) as GameState, input);
  if (!result) return { success: false, message: "" };

  // Marker messages are control signals, not text for the transcript. Some
  // carry an argument after a colon — the save slot, so far.
  const isMarker = result.message.startsWith("__");
  store.ui.consoleLines = [
    ...store.ui.consoleLines.slice(-300),
    `▶ ${command}`,
    ...(isMarker ? [] : result.message.split("\n")),
  ];

  if (isMarker) {
    const [marker, arg] = result.message.split(":");
    switch (marker) {
      case "__LOAD__":
        void loadGame(arg);
        return result;
      case "__SAVE__":
        void saveGame(arg);
        return result;
      case "__CLEAR__":
        store.ui.consoleLines = [];
        notify();
        return result;
      case "__LANGUAGE__":
        switchLanguage(getLanguage() === "zh-cn" ? "en-us" : "zh-cn");
        return result;
      case "__QUIT__":
        return result;
      case "__DEBUG__":
        toggleDebugCodes();
        return result;
      case "__DEBUG_NOWAIT__":
        store.ui.skipPrepareWait = true;
        pushToast("info", t("cmd.debug.no_wait_on"));
        return result;
      case "__DEBUG_WAIT__":
        store.ui.skipPrepareWait = false;
        pushToast("info", t("cmd.debug.no_wait_off"));
        return result;
    }
  }

  if (result.message) pushToast(result.success ? "success" : "error", firstLine(result.message));

  if (state?.phase === "gameover") pushToast("error", t("ui.conquest.title"));
  notify();
  return result;
}

function firstLine(message: string): string {
  const line = message.split("\n").find((l) => l.trim().length > 0) ?? "";
  return line.length > 140 ? line.slice(0, 139) + "…" : line;
}

/** Cancel a queued task, refunding part of its cost. */
export function cancelQueuedTask(taskId: number): void {
  const state = store.state;
  if (!state) return;
  if (state.tasks.some((x) => x.id === taskId && !x.cancellable)) {
    pushToast("error", t("ui.task.not_cancellable"));
    return;
  }
  const res = cancelTask(state, taskId);
  if (!res.ok) dropTask(state, taskId);
  pushToast(res.ok ? "info" : "error", res.message);
  notify();
}

export function taskProgress(taskId: number): number {
  const state = store.state;
  if (!state) return 0;
  const task = state.tasks.find((x) => x.id === taskId);
  return task ? computeProgress(state, task) : 0;
}

/** Slot ids the UI and console may use; anything else falls back to the current one. */
function slotOrDefault(slot?: string): SaveSlot {
  return toSaveSlot(slot ?? store.ui.currentSlot);
}

export async function saveGame(slot?: string): Promise<void> {
  const state = store.state;
  if (!state) return;
  const target = slotOrDefault(slot);
  try {
    const path = await saveToDisk(state, target);
    store.ui.currentSlot = target;
    await refreshSaves();
    pushToast("success", t("ui.toast.saved_slot", { slot: target, path }));
  } catch (err) {
    pushToast("error", t("ui.toast.save_failed", { err: err instanceof Error ? err.message : String(err) }));
  }
}

export async function loadGame(slot?: string): Promise<void> {
  const state = store.state;
  if (!state) return;
  const target = slotOrDefault(slot);
  const encoded = await loadFromDisk(target);
  if (!encoded) {
    pushToast("warn", t("ui.toast.no_save"));
    return;
  }
  if (!deserialize(state, encoded)) {
    pushToast("error", t("ui.toast.save_failed", { err: "corrupt save data" }));
    return;
  }
  store.ui.currentSlot = target;
  store.ui.selectedCountryId = state.playerCountryId;
  store.ui.tab = "nation";
  store.ui.saveDialogOpen = false;
  pushToast("success", t("ui.toast.loaded", { day: state.day }));
  startClock();
  notify();
}

/**
 * Load a slot from the title screen.
 *
 * A save is poured into an existing campaign, so one has to be started first.
 * The nation and difficulty are read back out of the blob so the preparation
 * screens describe the campaign being resumed rather than the nation that
 * happened to be highlighted on the title screen.
 */
export async function loadGameFromTitle(slot: string): Promise<void> {
  const target = toSaveSlot(slot);
  const encoded = await loadFromDisk(target);
  if (!encoded) {
    pushToast("warn", t("ui.toast.no_save"));
    return;
  }
  const meta = peekSave(encoded);
  const difficulty: Difficulty =
    meta && isDifficulty(meta.difficulty) ? meta.difficulty : DEFAULT_DIFFICULTY;
  // The nation only matters for the preparation screens: `deserialize` replaces
  // the player's country with the one the save was written for.
  await newGame(meta?.countryId ?? "USA", difficulty);
  await loadGame(target);
}

export async function deleteSaveSlot(slot: string): Promise<void> {
  await deleteSave(toSaveSlot(slot));
  await refreshSaves();
  pushToast("info", t("ui.toast.save_deleted", { slot }));
}

/** Re-read the slot list. Cheap: it only parses each blob's header. */
export async function refreshSaves(): Promise<void> {
  store.ui.saveSlots = await listSaves();
  notify();
}

export function openSaveDialog(): void {
  store.ui.saveDialogOpen = true;
  void refreshSaves();
  notify();
}

export function closeSaveDialog(): void {
  store.ui.saveDialogOpen = false;
  notify();
}

/**
 * Continue the campaign as another nation after being conquered.
 *
 * The world carries over untouched — only the player's own affairs reset.
 */
export function succeedTo(countryId: string): void {
  const state = store.state;
  if (!state) return;
  if (!continueAs(state, countryId)) {
    pushToast("error", t("ui.conquest.unavailable"));
    return;
  }
  store.ui.selectedCountryId = countryId;
  store.ui.tab = "nation";
  store.ui.bubbles = [];
  store.ui.lastWorldBubbleDay = 0;
  startClock();
  pushToast("info", t("ui.conquest.succeeded", { name: getCountryById(state, countryId)?.name ?? countryId }));
  notify();
}

export function quitToTitle(): void {
  stopClock();
  store.state = null;
  store.ui.selectedCountryId = null;
  store.ui.pendingConfirm = null;
  store.ui.toasts = [];
  store.ui.worldFeed = [];
  store.ui.narrative = null;
  store.ui.bubbles = [];
  notify();
}

// ── Derived selectors ──────────────────────────────────────────────

export function player(): ReturnType<typeof getPlayerCountry> | null {
  return store.state ? getPlayerCountry(store.state) : null;
}

export function selected(): ReturnType<typeof getCountryById> {
  const id = store.ui.selectedCountryId ?? store.state?.playerCountryId;
  return store.state && id ? getCountryById(store.state, id) : undefined;
}
