import { test } from "node:test";
import assert from "node:assert/strict";
import { emitAuthored, emitIndexTs, patchFurnitureId, patchFurnituresTs } from "../lib/install.mjs";

const draft = {
  id: "FOO",
  meta: { name: "Foo", difficulty: 2, duration: 20 },
  labels: { top: "Top", leg: "Leg" },
  clusters: [{ id: "whole", label: "Whole" }],
  order: { whole: ["top", "leg_1"] },
  placements: [
    { partId: "top", cluster: "whole", stage: 1, requires: [] },
    { partId: "leg_1", cluster: "whole", stage: 1, requires: [] },
  ],
  rules: [{ group: "screw999", stage: 1 }],
  joints: [{ joint: "leg_1__top", a: "leg_1", b: "top", later: "leg_1", crossCluster: false }],
  driveCandidates: [],
  maxStage: 1,
};

test("emitAuthored produces compiling-shaped source", () => {
  const src = emitAuthored(draft, { brand: "IKEA", category: "Other", link: null });
  assert.match(src, /export const STRUCTURE: StructureOverlay/);
  assert.match(src, /export const FASTENER_RULES/);
  assert.match(src, /"screw999"/);
  assert.match(src, /as StructureOverlay/);           // branded-type casts present
  assert.match(src, /type: "placePart", stage: 1, partId: "top"/);
});

test("patchFurnitureId appends the union member once", () => {
  const src = `export type FurnitureId = "DALFRED" | "LACK";`;
  const out = patchFurnitureId(src, "FOO");
  assert.equal(out, `export type FurnitureId = "DALFRED" | "LACK" | "FOO";`);
  assert.throws(() => patchFurnitureId(out, "FOO"), /already/);
});

test("patchFurnituresTs inserts import, meta, loader", () => {
  const src = [
    `import { LACK_META } from "./LACK/meta";`,
    `export const FURNITURE_METAS: FurnitureMeta[] = [LACK_META];`,
    `export const FURNITURE_LOADERS: Record<FurnitureId, () => Promise<Furniture>> = {`,
    `  LACK: () => import("./LACK").then((m) => m.LACK),`,
    `};`,
  ].join("\n");
  const out = patchFurnituresTs(src, "FOO");
  assert.match(out, /import { FOO_META } from ".\/FOO\/meta";/);
  assert.match(out, /\[LACK_META, FOO_META\]/);
  assert.match(out, /FOO: \(\) => import\("\.\/FOO"\)\.then\(\(m\) => m\.FOO\),\n};/);
});
