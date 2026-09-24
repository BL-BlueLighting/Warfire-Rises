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
  lines.push(`era:${state.era}`);
  lines.push(`absentCountries:${JSON.stringify(state.absentCountries)}`);
  lines.push(`publishedNews:${JSON.stringify(state.publishedNews)}`);

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
    nukedBy: c.nukedBy,
    manpower: c.manpower,
    divisions: c.divisions,
    warGoals: c.warGoals,
    overlordId: c.overlordId,
    destroyed: c.destroyed,
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

  // Wall-clock stamp for the save-slot list. Kept last so the header block the
  // slot list reads stays contiguous; `deserialize` ignores unknown keys.
  lines.push(`savedAt:${Date.now()}`);

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
    state.era = map.get("era") ?? state.era;
    try { state.absentCountries = JSON.parse(map.get("absentCountries") ?? "[]"); } catch { state.absentCountries = []; }
    try { state.publishedNews = JSON.parse(map.get("publishedNews") ?? "[]"); } catch { state.publishedNews = []; }

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
          // Absent in saves written before nuclear history was tracked.
          nukedBy: saved.nukedBy ?? [],
          manpower: saved.manpower ?? country.manpower,
          divisions: saved.divisions ?? country.divisions,
          warGoals: saved.warGoals ?? country.warGoals,
          // Absent in saves written before subject nations existed.
          overlordId: saved.overlordId ?? null,
          destroyed: saved.destroyed ?? false,
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

/** The slots the UI offers. Ids are what the Rust side names the files after. */
export const SAVE_SLOTS = ["1", "2", "3"] as const;
export type SaveSlot = (typeof SAVE_SLOTS)[number];

/** What a slot holds, read from the blob's header without rebuilding a game. */
export interface SaveSlotMeta {
  countryId: string;
  day: number;
  difficulty: string;
  /** Historical scenario; absent in saves written before scenarios existed. */
  era?: string;
  /** Wall-clock ms when it was written, or null for saves from before then. */
  savedAt: number | null;
}

/** Narrowing helper for values coming from the console or storage. */
export function isSaveSlot(value: string): value is SaveSlot {
  return (SAVE_SLOTS as readonly string[]).includes(value);
}

/** Coerce an unknown slot id to a real one, defaulting to the first slot. */
export function toSaveSlot(value: string | undefined): SaveSlot {
  return value !== undefined && isSaveSlot(value) ? value : SAVE_SLOTS[0];
}

export interface SaveSlotInfo {
  slot: string;
  /** null when the slot is empty. */
  meta: SaveSlotMeta | null;
}

/** Slot 1 inherits the pre-slot save, so an existing campaign survives. */
const LEGACY_SLOT: SaveSlot = "1";

/**
 * Read a save's header without deserializing the whole campaign.
 *
 * The format is `key:value` lines, so the fields the slot list shows are a few
 * lines away — no need to build a GameState just to label a button.
 */
export function peekSave(encoded: string): SaveSlotMeta | null {
  try {
    const raw = fromBase64(encoded);
    const header = new Map<string, string>();
    // Read every line: the header fields are a handful of keys scattered among
    // the payload, and stopping at the first one found made the whole list
    // report whichever nation happened to be the fallback.
    for (const line of raw.split("\n")) {
      const idx = line.indexOf(":");
      if (idx === -1) continue;
      const key = line.slice(0, idx);
      if (
        key === "day" ||
        key === "playerCountryId" ||
        key === "difficulty" ||
        key === "era" ||
        key === "savedAt"
      ) {
        header.set(key, line.slice(idx + 1));
      }
    }
    const savedAt = Number(header.get("savedAt"));
    return {
      countryId: header.get("playerCountryId") ?? "USA",
      day: parseInt(header.get("day") ?? "1"),
      difficulty: header.get("difficulty") ?? "regular",
      era: header.get("era"),
      savedAt: Number.isFinite(savedAt) ? savedAt : null,
    };
  } catch {
    return null;
  }
}

function localKey(slot: string): string {
  return `${LOCAL_KEY}.${slot}`;
}

/** Write a slot. Returns a human-readable destination for the UI. */
export async function saveToDisk(state: GameState, slot: SaveSlot = "1"): Promise<string> {
  const encoded = serialize(state);
  const core = tauriCore();
  if (core) {
    let path: string;
    try {
      path = (await core.invoke("save_game", { slot, data: encoded })) as string;
    } catch (err) {
      throw new Error(`Tauri save failed: ${String(err)}`);
    }
    // A backend from before slots writes one legacy file no matter what slot it
    // is handed, which would make every slot alias the same campaign — and
    // deleting any of them would take the rest with it. Say so instead.
    if (!path.includes(`save-${slot}.`)) {
      throw new Error(`the desktop backend predates save slots (wrote ${path}) — rebuild the app`);
    }
    return path;
  }
  localStorage.setItem(localKey(slot), encoded);
  return `browser localStorage (${slot})`;
}

/** Read a slot's blob, or null when the slot is empty. */
export async function loadFromDisk(slot: SaveSlot = "1"): Promise<string | null> {
  const core = tauriCore();
  if (core) {
    try {
      return ((await core.invoke("load_game", { slot })) as string | null) ?? null;
    } catch {
      return null;
    }
  }
  return localStorage.getItem(localKey(slot)) ?? (slot === LEGACY_SLOT ? localStorage.getItem(LOCAL_KEY) : null);
}

export async function hasSave(): Promise<boolean> {
  return (await listSaves()).some((s) => s.meta !== null);
}

export async function deleteSave(slot: SaveSlot = "1"): Promise<void> {
  const core = tauriCore();
  if (core) {
    try { await core.invoke("delete_save", { slot }); } catch { /* ignore */ }
    return;
  }
  localStorage.removeItem(localKey(slot));
  if (slot === LEGACY_SLOT) localStorage.removeItem(LOCAL_KEY);
}

/** Which slots are occupied, and what is in them. */
export async function listSaves(): Promise<SaveSlotInfo[]> {
  const out: SaveSlotInfo[] = [];
  for (const slot of SAVE_SLOTS) {
    const encoded = await loadFromDisk(slot);
    out.push({ slot, meta: encoded ? peekSave(encoded) : null });
  }
  return out;
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
