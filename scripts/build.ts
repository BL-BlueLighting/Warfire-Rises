import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { $ } from "bun";

const root = resolve(import.meta.dir, "..");

// 1. Bump version
const pkgPath = resolve(root, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
const [major, minor, patch] = pkg.version.split(".").map(Number);
const newVersion = `${major}.${minor}.${patch + 1}`;
pkg.version = newVersion;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
console.log(`Version bumped: ${major}.${minor}.${patch} → ${newVersion}`);

// 2. Create versioned output directory
const outDir = resolve(root, "dist", newVersion);
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

// 3. Build JS bundle
const outFile = resolve(outDir, "warfire-rises.js");
await $`bun build ${resolve(root, "src", "index.tsx")} --outfile ${outFile} --target bun`;
console.log("  ✓ JS bundle built");

// 4. Copy yoga.wasm
cpSync(
  resolve(root, "node_modules", "yoga-wasm-web", "dist", "yoga.wasm"),
  resolve(outDir, "yoga.wasm")
);
console.log("  ✓ yoga.wasm copied");

// 5. Copy langs/
const langsSrc = resolve(root, "langs");
const langsDst = resolve(outDir, "langs");
cpSync(langsSrc, langsDst, { recursive: true });
console.log("  ✓ langs/ copied");

// 6. Create Linux/macOS wrapper
const linuxWrapper = resolve(outDir, "warfire-rises");
const linuxScript = `#!/bin/sh\nexec bun "$(dirname "$0")/warfire-rises.js" "$@"\n`;
writeFileSync(linuxWrapper, linuxScript);
const { chmod } = await import("fs/promises");
await chmod(linuxWrapper, 0o755);
console.log("  ✓ Linux/macOS wrapper created");

// 7. Create Windows wrapper
const winWrapper = resolve(outDir, "warfire-rises.bat");
const winScript = `@echo off\r\nbun "%~dp0warfire-rises.js" %*\r\n`;
writeFileSync(winWrapper, winScript);
console.log("  ✓ Windows wrapper created");

// 8. Generate PACKAGING_README.md
const readme = resolve(outDir, "PACKAGING_README.md");
const readmeContent = `# WARFIRE RISES v${newVersion}

## Requirements

- [Bun](https://bun.sh) 1.3+ installed on your system

## How to Run

### Linux / macOS

\`\`\`bash
./warfire-rises
\`\`\`

### Windows

\`\`\`cmd
warfire-rises.bat
\`\`\`

Or double-click \`warfire-rises.bat\` in File Explorer.

## Files

| File | Purpose |
|------|---------|
| \`warfire-rises\` | Linux/macOS launcher |
| \`warfire-rises.bat\` | Windows launcher |
| \`warfire-rises.js\` | Game bundle |
| \`yoga.wasm\` | Layout engine (required) |
| \`langs/\` | Language files (required) |

## Save Data

Game saves are written to \`save.warfire\` in your current working directory.
Use the \`save\` and \`load\` commands in-game.

## Controls

| Key | Action |
|-----|--------|
| Type + Enter | Execute command |
| Ctrl+C | Quit game |
| ↑↓ / j k | Navigate menus |

Type \`help\` in-game for all commands.

---

Built with [Ink](https://github.com/vadimdemedes/ink) + [Bun](https://bun.sh)
`;
writeFileSync(readme, readmeContent);
console.log("  ✓ PACKAGING_README.md generated");

console.log(`\nBuild complete → dist/${newVersion}/`);
console.log(`  Linux/macOS:  ./warfire-rises`);
console.log(`  Windows:      warfire-rises.bat`);
console.log(`  Docs:         PACKAGING_README.md`);
console.log(`  Shared:       warfire-rises.js  yoga.wasm  langs/`);
