// Point every screen's `Pressable` at the one that clicks.
//
// A codemod rather than 47 hand edits, and rather than leaving the click on the shared button
// primitives alone: those cover 45 of the app's 184 pressable surfaces, so three quarters of the
// buttons were silent. See src/components/Pressable.tsx for why the wrapper exists.
//
// WHAT IT DOES, and nothing else: in files that import `Pressable` from "react-native", it removes
// that one name from the import and adds `import { Pressable } from "@/src/components/Pressable"`.
// Every other imported name, and every line of the component, is left exactly as it was.
//
// Run:  node scripts/use-clicking-pressable.mjs            (rewrite)
//       node scripts/use-clicking-pressable.mjs --dry-run  (report only)
import fs from "node:fs";
import path from "node:path";

const ROOT = "src";
const WRAPPER = "@/src/components/Pressable";

/**
 * Files that must keep the PLAIN Pressable.
 *
 * The wrapper itself, obviously — it imports the real one. And the shared button primitives, which
 * already call playSfx through withClick: swapping them too would click twice on the same tap.
 */
const SKIP = new Set([
  path.join("src", "components", "Pressable.tsx"),
  path.join("src", "game", "ui", "system", "Button.tsx"),
  path.join("src", "game", "ui", "hud", "hudChrome.tsx"),
]);

const dryRun = process.argv.includes("--dry-run");

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "assets" || entry.name === "node_modules") continue;
      walk(full, out);
    } else if (entry.name.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

let changed = 0;
let skipped = 0;

for (const file of walk(ROOT)) {
  if (SKIP.has(file)) {
    if (fs.readFileSync(file, "utf8").includes("Pressable")) skipped += 1;
    continue;
  }
  const src = fs.readFileSync(file, "utf8");

  // The react-native import block, single or multi line.
  //
  // `[^{}]*` rather than `[\s\S]*?` and that is the whole point: the lazy any-character version
  // starts at the FILE'S FIRST `import {` and runs to the first `from "react-native"`, swallowing
  // every import in between. It reshuffled four unrelated lines in RoomNavRail before this was
  // caught. Refusing to cross a brace means the match can only ever be one import statement.
  const match = src.match(/import\s*\{([^{}]*)\}\s*from\s*["']react-native["'];?/);
  if (!match) continue;

  const names = match[1]
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);
  if (!names.includes("Pressable")) continue;

  const kept = names.filter((n) => n !== "Pressable");
  // A file that imported ONLY Pressable loses its react-native import entirely rather than being
  // left with an empty `import {} from "react-native"`, which is legal but reads as a mistake.
  // Re-emitted on ONE line, the way these imports are written everywhere in this repo. The earlier
  // version exploded every import onto its own line, which made a one-name change look like a
  // rewrite of the file in a diff.
  const rnImport = kept.length ? `import { ${kept.join(", ")} } from "react-native";` : "";
  const wrapperImport = `import { Pressable } from "${WRAPPER}";`;

  const next = src.replace(
    match[0],
    rnImport ? `${rnImport}\n${wrapperImport}` : wrapperImport,
  );

  console.log(`  ${dryRun ? "would swap" : "swapped  "} ${file}`);
  if (!dryRun) fs.writeFileSync(file, next);
  changed += 1;
}

console.log(
  `\n${changed} file(s) ${dryRun ? "would be" : ""} pointed at ${WRAPPER}` +
    `${skipped ? `, ${skipped} left on the plain Pressable on purpose (see SKIP)` : ""}.` +
    (dryRun ? "\nDry run only. Drop --dry-run to write." : ""),
);