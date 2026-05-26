import React, { createContext, useContext } from "react";

export type Language = "en-us" | "zh-cn";

export interface I18nContextType {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: string, replacements?: Record<string, string | number>) => string;
}

export const I18nContext = createContext<I18nContextType>(null!);

export function useI18n(): I18nContextType {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}

let translations: Map<string, Record<string, string>> = new Map();
let currentLang: Language = "zh-cn"; // always language chinese at begin

export function setLanguage(lang: Language): void {
  currentLang = lang;
}

export function getLanguage(): Language {
  return currentLang;
}

/** Parse a single lang file (id: string, one per line) into the translations map */
export function loadLangFile(lang: string, text: string): void {
  const lines = text.split("\n");
  for (const line of lines) {
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

export function t(key: string, replacements?: Record<string, string | number>): string {
  const entry = translations.get(key);
  if (!entry) return applyReplacements(key, replacements);

  let text = entry[currentLang] ?? entry["en-us"] ?? key;
  return applyReplacements(text, replacements);
}

function applyReplacements(
  text: string,
  replacements?: Record<string, string | number>
): string {
  if (!replacements) return text;
  let result = text;
  for (const [k, v] of Object.entries(replacements)) {
    result = result.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
  }
  return result;
}
