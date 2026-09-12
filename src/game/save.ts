import { GameState } from "./types";
import { isDifficulty } from "./difficulty";

const SAVE_FILENAME = "save.warfire";
const LOCAL_KEY = "warfire.save";

// ── base64 helpers (browser-safe; the CLI edition used Node's Buffer) ──

function toBase64(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function fromBase64(encoded: string): string {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

// ── Tauri bridge ───────────────────────────────────────────────────
// The same bundle runs inside the Tauri webview and in a plain browser
// (`npm run dev`), so persistence degrades to localStorage when the
// Tauri IPC is unavailable.

interface TauriCore {
  invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
}

function tauriCore(): TauriCore | null {
  const w = window as unknown as { __TAURI_INTERNALS__?: { invoke?: TauriCore["invoke"] } };
  const invoke = w.__TAURI_INTERNALS__?.invoke;
  return invoke ? { invoke } : null;
}

export function isTauri(): boolean {
  return tauriCore() !== null;
}

// ── Serialization (format unchanged from the CLI edition) ──────────

export function serialize(state: GameState): string {
  const lines: string[] = [];

  lines.push(`day:${state.day}`);
  lines.push(`playerCountryId:${state.playerCountryId}`);
  lines.push(`worldCollapse:${state.worldCollapse}`);
  lines.push(`worldCollapseRaw:${state.worldCollapseRaw}`);
  lines.push(`diplomaticPoints:${state.diplomaticPoints}`);
  lines.push(`armyEndurance:${state.armyEndurance}`);
  lines.push(`nationalEndurance:${state.nationalEndurance}`);
  lines.push(`eventIdCounter:${state.eventIdCounter}`);
  lines.push(`difficulty:${state.difficulty}`);
  lines.push(`regionOwner:${JSON.stringify(state.regionOwner)}`);
  lines.push(`conference:${state.conference ? JSON.stringify(state.conference) : "null"}`);
  lines.push(`conquered:${state.conquered ? JSON.stringify(state.conquered) : "null"}`);
  lines.push(`defeatedCountries:${JSON.stringify(state.defeatedCountries)}`);

  lines.push(`exchangeRates:${JSON.stringify(state.exchangeRates)}`);
  lines.push(`worldKeywords:${JSON.stringify(state.worldKeywords)}`);
  lines.push(`briefing:${JSON.stringify(state.briefing)}`);
  lines.push(`log:${JSON.stringify(state.log)}`);

  const countriesData = state.countries.map((c) => ({
    id: c.id,
    economy: c.economy,
    military: c.military,
    stability: c.stability,
    treasury: c.treasury,
    population: c.population,
    allies: c.allies,
    enemies: c.enemies,
    relations: c.relations,
    publicSupport: c.publicSupport,
    forceValue: c.forceValue,
    atWarWith: c.atWarWith,
    researched: c.researched,
    buildings: c.buildings,
    nukes: c.nukes,
    nukeProgress: c.nukeProgress,
    manpower: c.manpower,
    divisions: c.divisions,
    warGoals: c.warGoals,
    generals: c.generals,
    armyGroups: c.armyGroups,
  }));
  lines.push(`countries:${JSON.stringify(countriesData)}`);

  lines.push(`events:${JSON.stringify(state.events)}`);
  lines.push(`activeWar:${state.activeWar ? JSON.stringify(state.activeWar) : "null"}`);
  lines.push(`warHistory:${JSON.stringify(state.warHistory)}`);

  // v3: continuous clock, scheduled work, and decision runtime
  lines.push(`clock:${JSON.stringify(state.clock)}`);
  lines.push(`tasks:${JSON.stringify(state.tasks)}`);
  lines.push(`taskIdCounter:${state.taskIdCounter}`);
  lines.push(`divisionIdCounter:${state.divisionIdCounter}`);
  lines.push(`decisionStates:${JSON.stringify(state.decisionStates)}`);

  return toBase64(lines.join("\n"));
}

export function deserialize(state: GameState, encoded: string): boolean {
  try {
    const raw = fromBase64(encoded);
    const map = new Map<string, string>();
    for (const line of raw.split("\n")) {
      const idx = line.indexOf(":");
      if (idx === -1) continue;
      map.set(line.slice(0, idx), line.slice(idx + 1));
    }

    state.day = parseInt(map.get("day") ?? "1");
    state.playerCountryId = map.get("playerCountryId") ?? state.playerCountryId;
    state.worldCollapse = parseInt(map.get("worldCollapse") ?? "0");
    state.worldCollapseRaw = parseFloat(map.get("worldCollapseRaw") ?? String(state.worldCollapse));
    state.diplomaticPoints = parseInt(map.get("diplomaticPoints") ?? "100");
    state.armyEndurance = parseInt(map.get("armyEndurance") ?? "100");
    state.nationalEndurance = parseInt(map.get("nationalEndurance") ?? "100");
    state.eventIdCounter = parseInt(map.get("eventIdCounter") ?? "0");
    { const d = map.get("difficulty"); if (d && isDifficulty(d)) state.difficulty = d; }
    try { state.regionOwner = JSON.parse(map.get("regionOwner") ?? "{}"); } catch { state.regionOwner = {}; }
    try {
      const c = map.get("conference");
      state.conference = c && c !== "null" ? JSON.parse(c) : null;
    } catch { state.conference = null; }
    try {
      const c = map.get("conquered");
      state.conquered = c && c !== "null" ? (JSON.parse(c) as GameState["conquered"]) : null;
    } catch { state.conquered = null; }
    try { state.defeatedCountries = JSON.parse(map.get("defeatedCountries") ?? "[]"); } catch { state.defeatedCountries = []; }

    try { state.exchangeRates = JSON.parse(map.get("exchangeRates") ?? "{}"); } catch { /* keep */ }
    try { state.worldKeywords = JSON.parse(map.get("worldKeywords") ?? "[]"); } catch { /* keep */ }
    try { state.briefing = JSON.parse(map.get("briefing") ?? "[]"); } catch { /* keep */ }
    try { state.log = JSON.parse(map.get("log") ?? "[]"); } catch { /* keep */ }

    try {
      const savedCountries = JSON.parse(map.get("countries") ?? "[]") as Array<Record<string, never>>;
      for (const saved of savedCountries) {
        const country = state.countries.find((c) => c.id === saved.id);
        if (!country) continue;
        Object.assign(country, {
          economy: saved.economy,
          military: saved.military,
          stability: saved.stability,
          treasury: saved.treasury,
          population: saved.population,
          allies: saved.allies,
          enemies: saved.enemies,
          relations: saved.relations,
          publicSupport: saved.publicSupport,
          forceValue: saved.forceValue,
          atWarWith: saved.atWarWith,
          researched: saved.researched ?? country.researched,
          buildings: saved.buildings ?? country.buildings,
          nukes: saved.nukes ?? country.nukes,
          nukeProgress: saved.nukeProgress ?? 0,
          manpower: saved.manpower ?? country.manpower,
          divisions: saved.divisions ?? country.divisions,
          warGoals: saved.warGoals ?? country.warGoals,
          // Command structures postdate the original save format; an older
          // save simply keeps the roster the country was created with.
          generals: saved.generals ?? country.generals,
          armyGroups: saved.armyGroups ?? country.armyGroups,
        });
      }
    } catch { /* keep */ }

    try { state.events = JSON.parse(map.get("events") ?? "[]"); } catch { /* keep */ }

    try {
      const warStr = map.get("activeWar");
      state.activeWar = warStr && warStr !== "null" ? JSON.parse(warStr) : null;
      // Wars saved before the combat rework have no stances; give them the
      // defaults rather than letting the pools read undefined.
      if (state.activeWar) {
        state.activeWar.attackerStance ??= "assault";
        state.activeWar.defenderStance ??= "hold";
        state.activeWar.attackerEntrenchment ??= 0;
        state.activeWar.defenderEntrenchment ??= 0;
      }
    } catch { state.activeWar = null; }
    try { state.warHistory = JSON.parse(map.get("warHistory") ?? "[]"); } catch { /* keep */ }

    // v3 fields. Saves written before v3 lack these; keep the freshly created
    // defaults rather than leaving the campaign without a clock.
    try {
      const c = JSON.parse(map.get("clock") ?? "null");
      if (c && typeof c.time === "number") state.clock = c;
    } catch { /* keep */ }
    try { state.tasks = JSON.parse(map.get("tasks") ?? "[]"); } catch { state.tasks = []; }
    state.taskIdCounter = parseInt(map.get("taskIdCounter") ?? "0") || state.taskIdCounter;
    state.divisionIdCounter = parseInt(map.get("divisionIdCounter") ?? "0") || state.divisionIdCounter;
    try { state.decisionStates = JSON.parse(map.get("decisionStates") ?? "{}"); } catch { state.decisionStates = {}; }

    state.phase = "playing";
    return true;
  } catch {
    return false;
  }
}

// ── Persistence ────────────────────────────────────────────────────

/** Write the save. Returns a human-readable destination for the UI. */
export async function saveToDisk(state: GameState): Promise<string> {
  const encoded = serialize(state);
  const core = tauriCore();
  if (core) {
    try {
      return (await core.invoke("save_game", { data: encoded })) as string;
    } catch (err) {
      throw new Error(`Tauri save failed: ${String(err)}`);
    }
  }
  localStorage.setItem(LOCAL_KEY, encoded);
  return "browser localStorage";
}

/** Read the save blob, or null when none exists. */
export async function loadFromDisk(): Promise<string | null> {
  const core = tauriCore();
  if (core) {
    try {
      return ((await core.invoke("load_game")) as string | null) ?? null;
    } catch {
      return null;
    }
  }
  return localStorage.getItem(LOCAL_KEY);
}

export async function hasSave(): Promise<boolean> {
  return (await loadFromDisk()) !== null;
}

export async function deleteSave(): Promise<void> {
  const core = tauriCore();
  if (core) {
    try { await core.invoke("delete_save"); } catch { /* ignore */ }
    return;
  }
  localStorage.removeItem(LOCAL_KEY);
}

export async function getSaveLocation(): Promise<string> {
  const core = tauriCore();
  if (core) {
    try { return (await core.invoke("save_location")) as string; } catch { /* fall through */ }
  }
  return `${SAVE_FILENAME} (browser localStorage)`;
}

export function getSaveOutput(state: GameState): string {
  const encoded = serialize(state);
  return `─── SAVE DATA (copy to preserve) ───\n${encoded}\n─── END SAVE ───`;
}
