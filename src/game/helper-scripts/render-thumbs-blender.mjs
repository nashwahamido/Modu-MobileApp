// Cross-platform launcher for the Blender thumbnail render.
//
//   npm run render:thumbs:blender
//
// npm runs scripts through cmd.exe on Windows and sh elsewhere, so we can't put a POSIX `${BLENDER:-default}` or a macOS-only path in package.json. This Node wrapper resolves the Blender executable for the current OS instead:
//   1. the BLENDER env var, if set (any platform)
//   2. the usual install location(s) for darwin / win32 / linux
//   3. `blender` on PATH, as a last resort
// Override anywhere with:  BLENDER="/path/to/blender" npm run render:thumbs:blender

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PY = path.join(SCRIPT_DIR, "render_thumbs.py");

function candidates() {
  if (process.env.BLENDER) return [process.env.BLENDER];

  if (process.platform === "darwin") {
    return ["/Applications/Blender.app/Contents/MacOS/Blender", "blender"];
  }

  if (process.platform === "win32") {
    const found = [];
    const bases = [process.env.ProgramFiles, process.env["ProgramFiles(x86)"]].filter(Boolean);
    for (const base of bases) {
      const dir = path.join(base, "Blender Foundation");
      if (!fs.existsSync(dir)) continue;
      // pick newest "Blender X.Y" first
      for (const sub of fs.readdirSync(dir).sort().reverse()) {
        const exe = path.join(dir, sub, "blender.exe");
        if (fs.existsSync(exe)) found.push(exe);
      }
    }
    return [...found, "blender.exe", "blender"];
  }

  return ["blender"]; // linux / other
}

const list = candidates();
for (const bin of list) {
  const result = spawnSync(bin, ["-b", "-P", PY], { stdio: "inherit" });
  if (result.error?.code === "ENOENT") continue; // not this one, try next
  process.exit(result.status ?? 1);
}

console.error(
  `Blender not found. Tried: ${list.join(", ")}\n` +
    `Set the path explicitly, e.g.  BLENDER="/path/to/blender" npm run render:thumbs:blender\n` +
    `or use the no-Blender renderer:  npm run thumbs:soft`,
);
process.exit(1);
