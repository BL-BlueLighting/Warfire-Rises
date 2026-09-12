import { useSyncExternalStore } from "react";

/**
 * Player-facing display settings.
 *
 * Kept out of GameState on purpose: these are preferences about how the map is
 * drawn, not facts about the world, so they persist across campaigns and are
 * not written into saves.
 */
export interface MapSettings {
  /** Province and region names (新疆维吾尔自治区, Bayern, …). */
  showRegionNames: boolean;
  /** Names of province capitals — the 省会. */
  showProvinceCapitals: boolean;
  /** Names of other major cities. */
  showMajorCities: boolean;
  /** Country name labels (CHN, USA, …). */
  showCountryNames: boolean;

  /**
   * Streaming mode.
   *
   * Puts a fiction disclaimer on screen before play and keeps a permanent
   * notice in the map's corner, for anyone broadcasting the game.
   */
  streamingMode: boolean;
}

const DEFAULTS: MapSettings = {
  showRegionNames: true,
  showProvinceCapitals: true,
  showMajorCities: true,
  showCountryNames: true,
  streamingMode: false,
};

const STORAGE_KEY = "warfire.settings";

function read(): MapSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<MapSettings>;
    // Merge over the defaults so a settings blob written by an older build
    // still loads once new keys are added.
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

let settings: MapSettings = read();
const listeners = new Set<() => void>();

export function getSettings(): MapSettings {
  return settings;
}

export function setSetting<K extends keyof MapSettings>(key: K, value: MapSettings[K]): void {
  if (settings[key] === value) return;
  settings = { ...settings, [key]: value };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch { /* storage unavailable */ }
  listeners.forEach((fn) => fn());
}

export function toggleSetting(key: keyof MapSettings): void {
  setSetting(key, !settings[key]);
}

export function resetSettings(): void {
  settings = { ...DEFAULTS };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch { /* ignore */ }
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Re-render whenever any display setting changes. */
export function useSettings(): MapSettings {
  return useSyncExternalStore(subscribe, getSettings, getSettings);
}

/** Rows that are not map labels; the dialog groups them separately. */
export const DISCLAIMER_ROWS: { key: keyof MapSettings; labelKey: string }[] = [
  { key: "streamingMode", labelKey: "ui.settings.streaming" },
];

/** The rows the settings dialog renders, in order. */
export const SETTING_ROWS: { key: keyof MapSettings; labelKey: string }[] = [
  { key: "showCountryNames", labelKey: "ui.settings.country_names" },
  { key: "showRegionNames", labelKey: "ui.settings.region_names" },
  { key: "showProvinceCapitals", labelKey: "ui.settings.province_capitals" },
  { key: "showMajorCities", labelKey: "ui.settings.major_cities" },
];
