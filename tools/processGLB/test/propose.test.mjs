import { test } from "node:test";
import assert from "node:assert/strict";
import { buildProposal, buildQuestions } from "../lib/propose.mjs";

const PREFIXES = ["screw", "nail", "cap", "nut", "washer", "rivet", "cam", "bolt", "dowel", "barrel", "peg"];
const node = (name, worldPos, worldDims, extra = {}) => ({
  name, article: (name.match(/\d{5,8}/) ?? [null])[0], vertexCount: 100,
  localDims: worldDims, worldPos, worldDims,
  worldMin: worldPos.map((v, i) => v - worldDims[i] / 2),
  worldMax: worldPos.map((v, i) => v + worldDims[i] / 2),
  parent: null, shaftAxisLocal: "X", worldShaftAxis: "X", aspect: 3, headSign: 1, ...extra,
});

test("article match classifies and groups; joints found from shaft overlap", () => {
  const inv = { source: "t", count: 3, nodes: [
    node("panelA", [0, 0, 0], [0.02, 0.6, 0.4]),          // structural slab at x=0
    node("panelB", [0.2, 0, 0], [0.02, 0.6, 0.4]),         // structural slab at x=0.2
    node("100349_01", [0.1, 0, 0], [0.22, 0.012, 0.012]),  // screw spanning both
  ]};
  const p = buildProposal(inv, { "100349": { group: "screw100349", type: "fastener", kind: "secured" } }, PREFIXES);
  const fg = p.groups.find((g) => g.article === "100349");
  assert.equal(fg.type, "fastener");
  assert.equal(fg.suggestedGroup, "screw100349");
  const j = p.joints.find((j) => j.fastener === "100349_01");
  assert.deepEqual([...j.endpoints].sort(), ["panelA", "panelB"]);
});

test("clusters from contact; separated parts split", () => {
  const inv = { source: "t", count: 3, nodes: [
    node("a", [0, 0, 0], [0.1, 0.1, 0.1]),
    node("b", [0.1, 0, 0], [0.1, 0.1, 0.1]),   // touches a
    node("c", [1, 0, 0], [0.1, 0.1, 0.1]),      // far away
  ]};
  const p = buildProposal(inv, {}, PREFIXES);
  assert.equal(p.clusters.length, 2);
});

test("questions carry defaults", () => {
  const inv = { source: "t", count: 1, nodes: [node("Mystery Part 3", [0, 0, 0], [0.3, 0.3, 0.02])] };
  const p = buildProposal(inv, {}, PREFIXES);
  const qs = buildQuestions(p, inv);
  for (const q of qs) assert.ok(q.default && q.options.some((o) => o.key === q.default), q.id);
});

test("zero-candidate fastener: joint default is valid and resolves to empty endpoints", () => {
  const inv = { source: "t", count: 2, nodes: [
    node("panelA", [0, 0, 0], [0.02, 0.6, 0.4]),                 // structural slab near origin
    node("100349_01", [10, 0, 0], [0.22, 0.012, 0.012]),         // screw far away from any structural
  ]};
  const p = buildProposal(inv, { "100349": { group: "screw100349", type: "fastener", kind: "secured" } }, PREFIXES);
  const j = p.joints.find((j) => j.fastener === "100349_01");
  assert.equal(j.candidates.length, 0);
  const qs = buildQuestions(p, inv);
  const q = qs.find((q) => q.id === "joint:100349_01");
  assert.ok(q, "expected a joint question");
  assert.ok(q.options.some((o) => o.key === q.default), "default must be a valid option key");
  const chosen = q.options.find((o) => o.key === q.default);
  assert.deepEqual(chosen.value, []);
});

test("single-candidate fastener: no self-pair option; default is the single-endpoint option", () => {
  const inv = { source: "t", count: 2, nodes: [
    node("panelA", [0, 0, 0], [0.02, 0.6, 0.4]),
    node("100349_01", [0, 0, 0], [0.22, 0.012, 0.012]),  // only overlaps panelA
  ]};
  const p = buildProposal(inv, { "100349": { group: "screw100349", type: "fastener", kind: "secured" } }, PREFIXES);
  const j = p.joints.find((j) => j.fastener === "100349_01");
  assert.equal(j.candidates.length, 1);
  const qs = buildQuestions(p, inv);
  const q = qs.find((q) => q.id === "joint:100349_01");
  assert.ok(q, "expected a joint question");
  // no pair option should reference the same candidate twice
  for (const o of q.options) {
    if (Array.isArray(o.value) && o.value.length === 2) assert.notEqual(o.value[0], o.value[1]);
  }
  assert.equal(q.default, "d");
  const chosen = q.options.find((o) => o.key === q.default);
  assert.equal(chosen.label, "single endpoint (cap/securer)");
  assert.deepEqual(chosen.value, ["panelA"]);
});

test("heuristic fastener (no article): emits a type: question defaulting to fastener", () => {
  const inv = { source: "t", count: 1, nodes: [
    node("Mystery Pin", [0, 0, 0], [0.05, 0.006, 0.006]),  // small + elongated, no article -> heuristic fastener
  ]};
  const p = buildProposal(inv, {}, PREFIXES);
  const g = p.groups[0];
  assert.equal(g.type, "fastener");
  assert.ok(!g.article);
  const qs = buildQuestions(p, inv);
  const q = qs.find((q) => q.id === `type:${g.key}`);
  assert.ok(q, "expected a type: question");
  assert.equal(q.default, "a");
  assert.deepEqual(q.options.map((o) => o.value), ["fastener", "structural"]);
});

test("instance merging: numeric/dot-suffixed instance names collapse into one group", () => {
  const inv1 = { source: "t", count: 2, nodes: [
    node("Drawer Side_01", [0, 0, 0], [0.02, 0.3, 0.2]),
    node("Drawer Side_02", [0.5, 0, 0], [0.02, 0.3, 0.2]),
  ]};
  const p1 = buildProposal(inv1, {}, PREFIXES);
  assert.equal(p1.groups.length, 1);
  assert.equal(p1.groups[0].nodes.length, 2);
  assert.ok(!/\d/.test(p1.groups[0].suggestedGroup), p1.groups[0].suggestedGroup);

  const inv2 = { source: "t", count: 2, nodes: [
    node("Part.001", [0, 0, 0], [0.02, 0.3, 0.2]),
    node("Part.002", [0.5, 0, 0], [0.02, 0.3, 0.2]),
  ]};
  const p2 = buildProposal(inv2, {}, PREFIXES);
  assert.equal(p2.groups.length, 1);
  assert.equal(p2.groups[0].nodes.length, 2);
});
