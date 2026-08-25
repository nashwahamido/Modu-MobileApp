import assert from "node:assert/strict";
import test from "node:test";
import { FASTENER_RULES } from "@/src/game/content/furnitures/EKET/authored";
import { PARTS } from "@/src/game/content/furnitures/EKET/parts.gen";
import type { PartDef, PartId } from "@/src/game/core/type";
import { resolvePairing, toFastenerRule, type FastenerRuleJson } from "./fastenerRules";

const PIN_RULE: FastenerRuleJson = { group: "dowel139435", stage: 3, requiresExtra: ["place_backPanel"], pairedWith: { group: "cam139434" } };

// The hand-written table the rule must reproduce (EKET/authored.ts PIN_TO_CAM).
const EXPECTED: Record<string, string> = {
  dowel139435_1: "cam139434_2", dowel139435_2: "cam139434_4", dowel139435_3: "cam139434_5", dowel139435_4: "cam139434_6",
  dowel139435_5: "cam139434_8", dowel139435_6: "cam139434_7", dowel139435_7: "cam139434_1", dowel139435_8: "cam139434_3",
};

test("nearest-instance pairing reproduces PIN_TO_CAM exactly", () => {
  assert.deepEqual(resolvePairing(PIN_RULE, PARTS), EXPECTED);
});

test("the JSON rule's requires matches the shipped closure for every pin", () => {
  const shipped = FASTENER_RULES.find((r) => r.group === ("dowel139435" as never))!;
  const rule = toFastenerRule(PIN_RULE, PARTS);
  for (const id of Object.keys(EXPECTED)) {
    const p = PARTS[id as PartId] as PartDef;
    assert.deepEqual(new Set(rule.requires!(p)), new Set(shipped.requires!(p)), `diverged for ${id}`);
  }
});

test("a plain rule stays plain — no requires override, engine defaults apply", () => {
  const rule = toFastenerRule({ group: "cam139434", stage: 3 }, PARTS);
  assert.equal(rule.requires, undefined);
});

test("ambiguous geometry rejects the rule form with a mapped reason", () => {
  const twin = (id: string, pos: [number, number, number], group: string): [string, PartDef] => [id, { partId: id, group, meshName: id, type: "fastener", cluster: "c", pose: { position: pos, rotation: [0, 0, 0, 1] } } as never];
  const parts = Object.fromEntries([twin("pin_1", [0, 0, 0], "pin"), twin("camA_1", [0, 0.01, 0], "camA"), twin("camA_2", [0, -0.01, 0], "camA")]) as never;
  assert.throws(() => resolvePairing({ group: "pin", stage: 1, pairedWith: { group: "camA" } }, parts), /ambiguous/);
});

test("a partner nearest to two instances rejects the rule form (bijectivity)", () => {
  const at = (id: string, pos: [number, number, number], group: string): [string, PartDef] => [id, { partId: id, group, meshName: id, type: "fastener", cluster: "c", pose: { position: pos, rotation: [0, 0, 0, 1] } } as never];
  // b_1 is the clear nearest of BOTH a-instances (margins pass for each); the shared winner must throw rather than silently double-book.
  const parts = Object.fromEntries([at("a_1", [0, 0, 0], "a"), at("a_2", [0.001, 0, 0], "a"), at("b_1", [0.0005, 0, 0], "b"), at("b_2", [0.5, 0, 0], "b")]) as never;
  assert.throws(() => resolvePairing({ group: "a", stage: 1, pairedWith: { group: "b" } }, parts), /not one-to-one/);
});

test("degenerate distances (exact tie at 0mm, NaN pose) reject instead of pairing arbitrarily", () => {
  const at = (id: string, pos: [number, number, number], group: string): [string, PartDef] => [id, { partId: id, group, meshName: id, type: "fastener", cluster: "c", pose: { position: pos, rotation: [0, 0, 0, 1] } } as never];
  const tie = Object.fromEntries([at("a_1", [0, 0, 0], "a"), at("b_1", [0, 0, 0], "b"), at("b_2", [0, 0, 0], "b")]) as never;
  assert.throws(() => resolvePairing({ group: "a", stage: 1, pairedWith: { group: "b" } }, tie), /ambiguous/);
  const nan = Object.fromEntries([at("a_1", [NaN, 0, 0], "a"), at("b_1", [0, 0, 0], "b")]) as never;
  assert.throws(() => resolvePairing({ group: "a", stage: 1, pairedWith: { group: "b" } }, nan), /ambiguous/);
});

test("an override rule on hardware fitted into a STAGED carrier keeps the staged insert base — no insert↔place cycle", () => {
  const P = (partId: string, type: "structural" | "fastener", group: string, extra: object = {}): [string, PartDef] => [partId, { partId, group, meshName: partId, type, cluster: "c", pose: { position: [0, 0, 0], rotation: [0, 0, 0, 1] }, ...extra } as never];
  const parts = Object.fromEntries([P("base", "structural", "base", { seed: true }), P("rod_1", "structural", "rod", { stageOffset: [0, 0.1, 0], directJoins: ["base"] }), P("dw_1", "fastener", "dowel9", { attached: ["rod_1", "base"] })]) as never;
  const rule = toFastenerRule({ group: "dowel9", stage: 1, requiresExtra: ["place_base"] }, parts);
  const req = rule.requires!((parts as Record<string, PartDef>)["dw_1"]);
  assert.ok(req.includes("stage_rod_1" as never), `insert base must be the carrier's stage beat, got [${req.join(",")}]`);
  assert.ok(!req.includes("place_rod_1" as never), "requiring the carrier's own placement would cycle with the placement's insert requirement");
  assert.ok(req.includes("place_base" as never), "authored extras still apply");
});

test("an explicit map bypasses geometry and is validated against parts", () => {
  const out = resolvePairing({ group: "dowel139435", stage: 3, pairedWith: { map: { dowel139435_1: "cam139434_2" } } }, PARTS);
  assert.deepEqual(out, { dowel139435_1: "cam139434_2" });
  assert.throws(() => resolvePairing({ group: "dowel139435", stage: 3, pairedWith: { map: { dowel139435_1: "ghost_9" } } }, PARTS), /ghost_9/);
});
