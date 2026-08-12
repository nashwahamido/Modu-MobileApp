// Structural fingerprint of a furniture GLB: every node name, its local TRS, and which mesh it carries.
// The engine keys parts off node NAMES (parts.gen.ts) and derives fastener engageDir off node transforms,
// so a compression pass is only safe if this fingerprint is byte-identical before and after.
import { writeFileSync } from "node:fs";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";

const [input, output] = process.argv.slice(2);
const document = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(input);
const r = (n) => n.map((v) => Number(v.toFixed(6)));
const snap = document
  .getRoot()
  .listNodes()
  .map((n) => ({
    name: n.getName(),
    t: r(n.getTranslation()),
    q: r(n.getRotation()),
    s: r(n.getScale()),
    mesh: n.getMesh()?.getName() ?? null,
    prims: n.getMesh()?.listPrimitives().length ?? 0,
  }))
  .sort((a, b) => a.name.localeCompare(b.name));
writeFileSync(output, JSON.stringify(snap, null, 1));
console.log(`${snap.length} nodes -> ${output}`);
