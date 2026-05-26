import { writeFileSync, readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { GameState, Country, GameEvent, WarState, ExchangeRates } from "../types";

const SAVE_FILENAME = "save.warfire";

function getSavePath(): string {
  return resolve(process.cwd(), SAVE_FILENAME);
}

// Serialize state → key:value pairs → base64
export function serialize(state: GameState): string {
  const lines: string[] = [];

  // Core fields
  lines.push(`day:${state.day}`);
  lines.push(`playerCountryId:${state.playerCountryId}`);
  lines.push(`worldCollapse:${state.worldCollapse}`);
  lines.push(`diplomaticPoints:${state.diplomaticPoints}`);
  lines.push(`armyEndurance:${state.armyEndurance}`);
  lines.push(`nationalEndurance:${state.nationalEndurance}`);
  lines.push(`eventIdCounter:${state.eventIdCounter}`);
  lines.push(`ending:${state.ending ?? "null"}`);

  // Complex objects — JSON encode each
  lines.push(`exchangeRates:${JSON.stringify(state.exchangeRates)}`);
  lines.push(`worldKeywords:${JSON.stringify(state.worldKeywords)}`);
  lines.push(`briefing:${JSON.stringify(state.briefing)}`);
  lines.push(`log:${JSON.stringify(state.log)}`);
  lines.push(`gameOverMessage:${JSON.stringify(state.gameOverMessage)}`);

  // Countries — serialize only mutable state
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
  }));
  lines.push(`countries:${JSON.stringify(countriesData)}`);

  // Events
  lines.push(`events:${JSON.stringify(state.events)}`);

  // War state
  lines.push(`activeWar:${state.activeWar ? JSON.stringify(state.activeWar) : "null"}`);
  lines.push(`warHistory:${JSON.stringify(state.warHistory)}`);

  // Join and encode
  const raw = lines.join("\n");
  return Buffer.from(raw).toString("base64");
}

// Deserialize base64 → key:value pairs → state patch
export function deserialize(state: GameState, encoded: string): boolean {
  try {
    const raw = Buffer.from(encoded, "base64").toString("utf-8");
    const map = new Map<string, string>();
    for (const line of raw.split("\n")) {
      const idx = line.indexOf(":");
      if (idx === -1) continue;
      const key = line.slice(0, idx);
      const value = line.slice(idx + 1);
      map.set(key, value);
    }

    // Apply to state
    state.day = parseInt(map.get("day") ?? "1");
    state.playerCountryId = map.get("playerCountryId") ?? state.playerCountryId;
    state.worldCollapse = parseInt(map.get("worldCollapse") ?? "0");
    state.diplomaticPoints = parseInt(map.get("diplomaticPoints") ?? "100");
    state.armyEndurance = parseInt(map.get("armyEndurance") ?? "100");
    state.nationalEndurance = parseInt(map.get("nationalEndurance") ?? "100");
    state.eventIdCounter = parseInt(map.get("eventIdCounter") ?? "0");
    state.ending = map.get("ending") === "null" ? null : (map.get("ending") as "tfr" | "tno" | null) ?? null;

    try { state.exchangeRates = JSON.parse(map.get("exchangeRates") ?? "{}"); } catch { /* keep */ }
    try { state.worldKeywords = JSON.parse(map.get("worldKeywords") ?? "[]"); } catch { /* keep */ }
    try { state.briefing = JSON.parse(map.get("briefing") ?? "[]"); } catch { /* keep */ }
    try { state.log = JSON.parse(map.get("log") ?? "[]"); } catch { /* keep */ }
    try { state.gameOverMessage = JSON.parse(map.get("gameOverMessage") ?? '""'); } catch { /* keep */ }

    // Countries
    try {
      const savedCountries: any[] = JSON.parse(map.get("countries") ?? "[]");
      for (const saved of savedCountries) {
        const country = state.countries.find((c) => c.id === saved.id);
        if (!country) continue;
        country.economy = saved.economy;
        country.military = saved.military;
        country.stability = saved.stability;
        country.treasury = saved.treasury;
        country.population = saved.population;
        country.allies = saved.allies;
        country.enemies = saved.enemies;
        country.relations = saved.relations;
        country.publicSupport = saved.publicSupport;
        country.forceValue = saved.forceValue;
        country.atWarWith = saved.atWarWith;
      }
    } catch { /* keep */ }

    // Events
    try { state.events = JSON.parse(map.get("events") ?? "[]"); } catch { /* keep */ }

    // War state
    try {
      const warStr = map.get("activeWar");
      state.activeWar = warStr && warStr !== "null" ? JSON.parse(warStr) : null;
    } catch { state.activeWar = null; }
    try { state.warHistory = JSON.parse(map.get("warHistory") ?? "[]"); } catch { /* keep */ }

    state.phase = "playing";
    return true;
  } catch {
    return false;
  }
}

// Save to disk
export function saveToFile(state: GameState): string {
  const encoded = serialize(state);
  const path = getSavePath();
  writeFileSync(path, encoded, "utf-8");
  return encoded;
}

// Load from disk
export function loadFromFile(state: GameState): string | null {
  const path = getSavePath();
  if (!existsSync(path)) return null;
  const encoded = readFileSync(path, "utf-8").trim();
  if (!encoded) return null;
  return encoded;
}

export function getSaveOutput(state: GameState): string {
  const encoded = serialize(state);
  return `─── SAVE DATA (copy to preserve) ───\n${encoded}\n─── END SAVE ───\nSaved to: ${getSavePath()}`;
}
