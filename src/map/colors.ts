import { Country, GameState, MapMode } from "../game/types";
import { COUNTRIES } from "../game/countries";

/** Palette shared by the map, the legend and the panels. */
export const PALETTE = {
  // A period map board: inked water, sepia neutral territory, brass player.
  ocean: "#101a1c",
  graticule: "#1d2724",
  border: "#080705",
  unclaimed: "#3d3a30",
  unclaimedHover: "#514c3e",
  player: "#e2c26c",
  ally: "#4f8f45",
  friendly: "#74a355",
  // Kept blue-grey: it reads as "unaligned" against all the warm chrome.
  neutral: "#5f7285",
  tense: "#c4883a",
  hostile: "#bc5138",
  war: "#a8261a",
  selected: "#fff6dd",
} as const;

/** Relation bucket matching the CLI `relations` command. */
export function relationBucket(rel: number): keyof typeof RELATION_COLORS {
  if (rel >= 75) return "ally";
  if (rel >= 40) return "friendly";
  if (rel >= -10) return "neutral";
  if (rel >= -50) return "tense";
  if (rel >= -75) return "hostile";
  return "irreconcilable";
}

export const RELATION_COLORS = {
  ally: PALETTE.ally,
  friendly: PALETTE.friendly,
  neutral: PALETTE.neutral,
  tense: PALETTE.tense,
  hostile: PALETTE.hostile,
  irreconcilable: PALETTE.war,
} as const;

/** Heat ramp for the strength/stat map modes, warmed to match the chrome. */
const HEAT_LOW = "#3b4238";
const HEAT_MID = "#b8863c";
const HEAT_HIGH = "#c23f26";

/** Linear interpolation between two hex colours. */
function lerpHex(a: string, b: string, k: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const r = Math.round(((pa >> 16) & 255) * (1 - k) + ((pb >> 16) & 255) * k);
  const g = Math.round(((pa >> 8) & 255) * (1 - k) + ((pb >> 8) & 255) * k);
  const bl = Math.round((pa & 255) * (1 - k) + (pb & 255) * k);
  return `#${((r << 16) | (g << 8) | bl).toString(16).padStart(6, "0")}`;
}

/** Map a 0-100 stat onto a cold→hot ramp. */
function heat(value: number): string {
  const v = Math.max(0, Math.min(100, value)) / 100;
  return v < 0.5
    ? lerpHex(HEAT_LOW, HEAT_MID, v * 2)
    : lerpHex(HEAT_MID, HEAT_HIGH, (v - 0.5) * 2);
}

export interface CountryColorInput {
  country: Country;
  playerId: string;
  playerAllies: string[];
  playerEnemies: string[];
  atWar: boolean;
  isPlayer: boolean;
}

/** Compute the fill colour for a nation under the active map mode. */
export function colorFor(input: CountryColorInput, mode: MapMode): string {
  const { country, playerId, atWar, isPlayer } = input;

  if (isPlayer) return PALETTE.player;

  const rel = country.relations[playerId] ?? 0;

  switch (mode) {
    case "political":
      return atWar ? PALETTE.war : RELATION_COLORS[relationBucket(rel)];
    case "faction":
      if (atWar) return PALETTE.war;
      if (input.playerAllies.includes(country.id)) return PALETTE.ally;
      if (input.playerEnemies.includes(country.id)) return PALETTE.hostile;
      return PALETTE.neutral;
    case "military":
      return heat(country.military);
    case "economy":
      return heat(country.economy);
    case "stability":
      return heat(country.stability);
    case "war":
      if (atWar) return PALETTE.war;
      if (country.atWarWith.length > 0) return PALETTE.tense;
      return PALETTE.unclaimed;
    default:
      return PALETTE.neutral;
  }
}

/** Build the colour lookup for every playable nation in one pass. */
export function buildColorMap(state: GameState, mode: MapMode): Record<string, string> {
  const player = state.countries.find((c) => c.id === state.playerCountryId);
  const playerAllies = player?.allies ?? [];
  const playerEnemies = player?.enemies ?? [];
  const out: Record<string, string> = {};

  for (const country of state.countries) {
    const isPlayer = country.id === state.playerCountryId;
    out[country.id] = colorFor(
      {
        country,
        playerId: state.playerCountryId,
        playerAllies,
        playerEnemies,
        atWar: player ? player.atWarWith.includes(country.id) : false,
        isPlayer,
      },
      mode
    );
  }
  return out;
}

/**
 * Colours for the title-screen preview.
 *
 * Uses the static roster's starting relations, so picking a nation immediately
 * shows who would be friendly and who would not — a useful hint before
 * committing to a campaign.
 */
export function previewColorMap(selectedId: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  const chosen = selectedId ? COUNTRIES.find((c) => c.id === selectedId) : undefined;

  for (const country of COUNTRIES) {
    if (!chosen) {
      out[country.id] = PALETTE.neutral;
      continue;
    }
    if (country.id === chosen.id) {
      out[country.id] = PALETTE.player;
      continue;
    }
    out[country.id] = RELATION_COLORS[relationBucket(country.relations[chosen.id] ?? 0)];
  }
  return out;
}

/** Rows for the on-map legend, per map mode. */
export function legendFor(mode: MapMode): { labelKey: string; color: string }[] {
  switch (mode) {
    case "political":
      return [
        { labelKey: "ui.legend.you", color: PALETTE.player },
        { labelKey: "ui.legend.ally", color: PALETTE.ally },
        { labelKey: "ui.legend.friendly", color: PALETTE.friendly },
        { labelKey: "ui.legend.neutral", color: PALETTE.neutral },
        { labelKey: "ui.legend.tense", color: PALETTE.tense },
        { labelKey: "ui.legend.hostile", color: PALETTE.hostile },
        { labelKey: "ui.legend.war", color: PALETTE.war },
      ];
    case "faction":
      return [
        { labelKey: "ui.legend.you", color: PALETTE.player },
        { labelKey: "ui.legend.ally", color: PALETTE.ally },
        { labelKey: "ui.legend.neutral", color: PALETTE.neutral },
        { labelKey: "ui.legend.hostile", color: PALETTE.hostile },
      ];
    case "military":
    case "economy":
    case "stability":
      return [
        { labelKey: "ui.map.low", color: heat(5) },
        { labelKey: "ui.map.mid", color: heat(50) },
        { labelKey: "ui.map.high", color: heat(95) },
      ];
    case "war":
      return [
        { labelKey: "ui.legend.war", color: PALETTE.war },
        { labelKey: "ui.legend.tense", color: PALETTE.tense },
        { labelKey: "ui.map.unclaimed", color: PALETTE.unclaimed },
      ];
    default:
      return [];
  }
}
