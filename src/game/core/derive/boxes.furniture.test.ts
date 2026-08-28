// The guard that lets the runtime trust a generated file. Recomputes every furniture's boxes from its GLB and asserts the
// checked-in boxes.gen.ts still matches — a re-export that moves geometry fails HERE, named, instead of shipping a box the
// drag trusts completely. Replaces the load-time harvest's tolerance gate (removed from AssemblyScene).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { deriveBoxes, TOLERANCE_MM } from "./boxes";
import type { PartBox, PartDef, PartId } from "@/src/game/core/type";

const MODELS = path.join(process.cwd(), "src", "assets", "models", "furnitures");
const CONTENT = path.join(process.cwd(), "src", "game", "content", "furnitures");

const FURNITURES = fs
  .readdirSync(MODELS, { withFileTypes: true })
  .filter(
    (d) =>
      d.isDirectory() &&
      fs.existsSync(path.join(MODELS, d.name, `${d.name}.glb`)) &&
      fs.existsSync(path.join(CONTENT, d.name, "parts.gen.ts")),
  )
  .map((d) => d.name);

// A scan that silently finds nothing would report zero tests and exit 0 — the exact failure this file exists to prevent.
test("furniture discovery found the baseline", () => {
  for (const expected of ["LACK", "DALFRED", "BEKVAM", "EKET"]) {
    assert.ok(FURNITURES.includes(expected), `${expected} was not discovered; found: ${FURNITURES.join(", ") || "(none)"}`);
  }
});

for (const F of FURNITURES) {
  test(`${F}: boxes.gen.ts is fresh and every part agrees with parts.gen`, async () => {
    const { PARTS } = (await import(`@/src/game/content/furnitures/${F}/parts.gen`)) as {
      PARTS: Record<PartId, PartDef>;
    };
    const { BOXES } = (await import(`@/src/game/content/furnitures/${F}/boxes.gen`)) as {
      BOXES: Record<PartId, PartBox>;
    };
    const bytes = new Uint8Array(fs.readFileSync(path.join(MODELS, F, `${F}.glb`)));
    const { boxes, drift } = deriveBoxes(bytes, PARTS);

    assert.deepEqual(
      drift,
      [],
      `${F}: ${drift.length} part(s) more than ${TOLERANCE_MM}mm from pose+visualCenterOffset — the mesh and parts.gen disagree: ${drift
        .map((d) => `${d.partId} ${d.mm.toFixed(1)}mm`)
        .join(", ")}`,
    );
    assert.ok(Object.keys(boxes).length > 0, `${F}: no part matched a GLB node by meshName`);
    assert.deepEqual(
      BOXES,
      boxes,
      `${F}: boxes.gen.ts is stale — re-run npx tsx src/game/helper-scripts/derive-boxes.mts`,
    );
  });
}
