import { useSyncExternalStore } from "react";
import enUs from "../langs/en-us.txt?raw";
import zhCn from "../langs/zh-cn.txt?raw";

export type Language = "en-us" | "zh-cn";

export const LANGUAGES: Language[] = ["zh-cn", "en-us"];

const translations = new Map<string, Record<string, string>>();
let currentLang: Language = "zh-cn"; // the original always starts in Chinese

/** Parse a lang file (`key: value` per line) into the translations map. */
export function loadLangFile(lang: string, text: string): void {
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) continue;
    const key = trimmed.slice(0, colonIdx).trim();
    const value = trimmed.slice(colonIdx + 1).trim().replace(/\\n/g, "\n");
    if (!key || !value) continue;

    let entry = translations.get(key);
    if (!entry) {
      entry = {};
      translations.set(key, entry);
    }
    entry[lang] = value;
  }
}

loadLangFile("en-us", enUs);
loadLangFile("zh-cn", zhCn);

const STORAGE_KEY = "warfire.language";

function readStoredLanguage(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "en-us" || stored === "zh-cn") return stored;
  } catch { /* storage unavailable */ }
  return "zh-cn";
}

currentLang = readStoredLanguage();

// ── React integration ──────────────────────────────────────────────

const listeners = new Set<() => void>();

export function subscribeLanguage(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setLanguage(lang: Language): void {
  if (currentLang === lang) return;
  currentLang = lang;
  try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* ignore */ }
  listeners.forEach((fn) => fn());
}

export function getLanguage(): Language {
  return currentLang;
}

/** Re-render the tree whenever the language changes. */
export function useLanguage(): Language {
  return useSyncExternalStore(subscribeLanguage, getLanguage, getLanguage);
}

// ── Lookup ─────────────────────────────────────────────────────────

export function t(key: string, replacements?: Record<string, string | number>): string {
  const entry = translations.get(key);
  if (!entry) return applyReplacements(key, replacements);
  const text = entry[currentLang] ?? entry["en-us"] ?? key;
  return applyReplacements(text, replacements);
}

function applyReplacements(text: string, replacements?: Record<string, string | number>): string {
  if (!replacements) return text;
  let result = text;
  for (const [k, v] of Object.entries(replacements)) {
    result = result.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
  }
  return result;
}

/** True when a key resolves — used to render optional labels. */
export function hasKey(key: string): boolean {
  return translations.has(key);
}
