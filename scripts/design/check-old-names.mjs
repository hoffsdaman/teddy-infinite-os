#!/usr/bin/env node
// The per-feature class prefixes were renamed by exact class name into
// admin-<component>-* (design-debt backlog #2). Patches, merges and copied
// snippets bring the old names back; this scan fails when any of them appears
// in a class context. Import paths, log tags and prose comments are ignored the
// same way the rename itself ignored them.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
const ROOT = process.cwd();
const MAP = JSON.parse(readFileSync(join(ROOT, "scripts/design/renamed-classes.json"), "utf8"));
const names = Object.keys(MAP).sort((a, b) => b.length - a.length).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
const RE = new RegExp(`(?<![\\w\\-/])(${names.join("|")})(?![\\w\\-]|\\.tsx?\\b|/)`, "g");
const SKIP = new Set(["node_modules", ".next", "public"]);
function* walk(d) { for (const n of readdirSync(d)) { if (SKIP.has(n)) continue; const p = join(d, n); if (statSync(p).isDirectory()) yield* walk(p); else if (/\.(tsx|ts|css)$/.test(p)) yield p; } }
const hits = [];
for (const dir of ["app", "components", "lib"]) for (const f of walk(join(ROOT, dir))) {
  const rel = relative(ROOT, f);
  if (rel === "scripts/design/renamed-classes.json") continue;
  readFileSync(f, "utf8").split("\n").forEach((line, i) => {
    if (/\b(import|from|require)\b/.test(line) && !/className/.test(line)) return;
    const comment = /^\s*(\/\/|\*|\/\*)/.test(line);
    for (const m of line.matchAll(RE)) {
      if (comment && line[m.index - 1] !== ".") continue;
      hits.push(`${rel}:${i + 1}: ${m[1]} → ${MAP[m[1]]}`);
    }
  });
}
if (hits.length) { console.error(`${hits.length} retired class name(s) reintroduced:\n` + hits.join("\n")); process.exit(1); }
console.log(`check-old-names OK — none of the ${Object.keys(MAP).length} retired class names appear in app/, components/, lib/.`);
