#!/usr/bin/env bun
import React from "react";
import { render } from "ink";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { loadLangFile } from "./i18n";
import App from "./App";

// Clear terminal on startup
process.stdout.write("\x1b[2J\x1b[H");

// Find langs/ relative to the script/executable, not cwd
function findLangDir(): string {
  // Method 1: import.meta.dir (works when running source directly with bun)
  try {
    const devPath = resolve((import.meta as unknown as { dir: string }).dir, "..", "langs");
    if (existsSync(devPath)) return devPath;
  } catch { /* not in dev mode */ }

  // Method 2: relative to the JS file being executed (works for bundled output)
  try {
    const scriptDir = dirname(resolve(process.argv[1]));
    const bundledPath = resolve(scriptDir, "langs");
    if (existsSync(bundledPath)) return bundledPath;
  } catch { /* fall through */ }

  // Method 3: cwd fallback
  return resolve(process.cwd(), "langs");
}

const langDir = findLangDir();
function tryLoad(lang: string, filename: string): void {
  try {
    const path = resolve(langDir, filename);
    const text = readFileSync(path, "utf-8");
    loadLangFile(lang, text);
  } catch { /* not found */ }
}
tryLoad("en-us", "en-us.txt");
tryLoad("zh-cn", "zh-cn.txt");

const { unmount, waitUntilExit } = render(<App />);

process.on("SIGINT", () => {
  unmount();
  process.exit(0);
});

waitUntilExit().then(() => {
  process.exit(0);
});
