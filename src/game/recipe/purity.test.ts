// src/game/recipe/purity.test.ts
// The portal (a Vite web app) will consume src/game/core + src/game/recipe through a file: package. That only works if these trees never import app-runtime modules. This test IS the packaging contract: add an exception ONLY for a file the portal will never need, and say why in the allowlist.
import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

const ROOTS = ["src/game/core", "src/game/recipe"];
const FORBIDDEN = /^(react|react-native|react-native-|expo|@expo\/|zustand|@react-native)/;
// store.ts is the zustand game store — app state, stays behind when the core is packaged.
// useStepObjective.ts is React-hook audio/UI glue (it drives useStepAudio) — app-only, stays behind when the core is packaged, because the portal never narrates step objectives.
const ALLOWLIST = new Set(["src/game/core/store.ts", "src/game/core/presentation/useStepObjective.ts"]);

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (p.endsWith(".ts") && !p.endsWith(".test.ts")) yield p;
  }
}

// Resolves an "@/…" specifier to a repo-relative .ts path, trying the bare specifier first and then its /index.ts, and returns null when neither exists (so callers can skip specifiers that resolve to non-.ts assets like JSON).
function resolveAliasImport(specifier: string): string | null {
  const bare = specifier.slice(2);
  if (existsSync(`${bare}.ts`)) return `${bare}.ts`;
  if (existsSync(`${bare}/index.ts`)) return `${bare}/index.ts`;
  return null;
}

// Resolves a "./" or "../" specifier against the importing file's own directory to a repo-relative .ts path, using the same bare-then-/index.ts resolution as the alias case, and returns null when neither exists.
function resolveRelativeImport(fromFile: string, specifier: string): string | null {
  const bare = join(dirname(fromFile), specifier).replaceAll("\\", "/");
  if (existsSync(`${bare}.ts`)) return `${bare}.ts`;
  if (existsSync(`${bare}/index.ts`)) return `${bare}/index.ts`;
  return null;
}

test("core + recipe import nothing from the app runtime", () => {
  const offenders: string[] = [];
  for (const root of ROOTS) {
    for (const file of walk(root)) {
      const rel = file.replaceAll("\\", "/");
      if (ALLOWLIST.has(rel)) continue;
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(/from\s+["']([^"']+)["']/g)) {
        if (FORBIDDEN.test(m[1])) offenders.push(`${rel} -> ${m[1]}`);
        // One-hop transitive check: an "@/"-aliased OR a relative ("./" / "../") import that resolves OUTSIDE both roots can smuggle a forbidden package in one level down, so read that target's own imports too (but do not recurse further, and do not flag the cross-boundary import itself — only a forbidden package inside it).
        const resolved = m[1].startsWith("@/")
          ? resolveAliasImport(m[1])
          : m[1].startsWith("./") || m[1].startsWith("../")
            ? resolveRelativeImport(file, m[1])
            : null;
        if (resolved && !ROOTS.some((r) => resolved === r || resolved.startsWith(`${r}/`))) {
          const targetSrc = readFileSync(resolved, "utf8");
          for (const tm of targetSrc.matchAll(/from\s+["']([^"']+)["']/g)) {
            if (FORBIDDEN.test(tm[1])) offenders.push(`${rel} -> ${m[1]} -> ${tm[1]}`);
          }
        }
      }
    }
  }
  assert.deepEqual(offenders, [], `impure imports:\n${offenders.join("\n")}`);
});
