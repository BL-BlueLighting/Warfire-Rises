import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const pkgPath = resolve(import.meta.dir, "..", "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));

const [major, minor, patch] = pkg.version.split(".").map(Number);
const newVersion = `${major}.${minor}.${patch + 1}`;
pkg.version = newVersion;

writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
console.log(newVersion);
