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

// 6. Create wrapper script
const wrapper = resolve(outDir, "warfire-rises");
const script = `#!/bin/sh\nexec bun "$(dirname "$0")/warfire-rises.js" "$@"\n`;
writeFileSync(wrapper, script);
const { chmod } = await import("fs/promises");
await chmod(wrapper, 0o755);
console.log("  ✓ wrapper created");

console.log(`\nBuild complete → dist/${newVersion}/`);
console.log(`  warfire-rises`);
console.log(`  warfire-rises.js`);
console.log(`  yoga.wasm`);
console.log(`  langs/`);
