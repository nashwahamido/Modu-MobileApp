// tools/processGLB/test/apply.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildOps } from "../lib/apply.mjs";

const PREFIXES = ["screw", "bolt", "cam", "dowel", "nail", "cap", "nut", "washer", "rivet", "barrel", "peg"];
const inv = { nodes: [
  { name: "front1", worldPos: [0, 0, 1], parent: null },
  { name: "front2", worldPos: [0, 0, -1], parent: "someParent" },
  { name: "s1", worldPos: [0, 1, 1], parent: null },
  { name: "s2", worldPos: [0, 1, -1], parent: null },
  { name: "b1", worldPos: [0, 0.5, 1], parent: null },
  { name: "b2", worldPos: [0, 0.5, -1], parent: null },
]};
const proposal = {
  groups: [
    { key: "gf", nodes: ["front1", "front2"], suggestedGroup: "drawerFront", type: "structural" },
    { key: "gs", nodes: ["s1", "s2"], suggestedGroup: "drawerSideL", type: "structural" },
    { key: "gb", nodes: ["b1", "b2"], suggestedGroup: "bolt128918", type: "fastener", kind: "threaded" },
  ],
  clusters: [
    { id: "clusterA", groups: ["gf", "gs"] },   // both drawers merged is fine for this test
  ],
  unparent: ["front2"],
  reorient: [{ node: "b1", shaft: "X", sign: -1, confidence: "high" }],
  joints: [
    { fastener: "b1", endpoints: ["front1", "s1"], confidence: "high" },
    { fastener: "b2", endpoints: ["front2", "s2"], confidence: "high" },
  ],
};

test("buildOps: names, indexes, joint suffixes, post-rename op names", () => {
  const resolved = new Map([["cluster:clusterA", "drawerA"]]);
  const { ops } = buildOps(inv, proposal, resolved, PREFIXES);
  const renames = new Map(ops.renames);
  assert.equal(renames.get("front1"), "drawerA_drawerFront_1");
  assert.equal(renames.get("front2"), "drawerA_drawerFront_2");
  assert.equal(renames.get("b1"), "drawerA_bolt128918_1__drawerFront_1&drawerSideL_1");
  assert.deepEqual(ops.unparent, ["drawerA_drawerFront_2"]);   // NEW name
  assert.equal(ops.reorient[0].node, renames.get("b1"));
});

test("buildOps throws on duplicate partIds", () => {
  const bad = structuredClone(proposal);
  bad.groups[1].suggestedGroup = "drawerFront"; // collide with gf
  assert.throws(() => buildOps(inv, bad, new Map(), PREFIXES), /duplicate partId/i);
});

// a heuristic fastener candidate ("f1") joined to one structural part ("strut1"); the
// propose.mjs "type:<groupKey>" question lets the user reclassify it as structural.
const invType = { nodes: [
  { name: "strut1", worldPos: [0, 0, 0], parent: null },
  { name: "f1", worldPos: [0, 0, 0], parent: null },
]};
const proposalType = {
  groups: [
    { key: "gStrut", nodes: ["strut1"], suggestedGroup: "strutMain", type: "structural" },
    { key: "gF", nodes: ["f1"], suggestedGroup: "widgetPart", type: "fastener", kind: null },
  ],
  clusters: [{ id: "clusterX", groups: ["gStrut"] }],
  unparent: [],
  reorient: [{ node: "f1", shaft: "Y", sign: 1, confidence: "low" }],
  joints: [{ fastener: "f1", endpoints: ["strut1"], confidence: "low" }],
};

test("buildOps: type:<key>='structural' answer drops fastener prefix, joints suffix, and reorient entry", () => {
  const resolved = new Map([["cluster:clusterX", "clusterX"], ["type:gF", "structural"]]);
  const { ops } = buildOps(invType, proposalType, resolved, PREFIXES);
  const renames = new Map(ops.renames);
  const f1Name = renames.get("f1");
  assert.equal(f1Name, "clusterX_widgetPart");   // plain group name, no fastener-prefix rewrite
  assert.ok(!f1Name.includes("__"), `expected no joints suffix, got ${f1Name}`);
  assert.ok(!ops.reorient.some((r) => r.node === f1Name), "answered-structural node must not be re-oriented");
});

test("buildOps: control — without the type: answer, the heuristic group stays a fastener", () => {
  const resolved = new Map([["cluster:clusterX", "clusterX"]]);
  const { ops } = buildOps(invType, proposalType, resolved, PREFIXES);
  const renames = new Map(ops.renames);
  const f1Name = renames.get("f1");
  assert.equal(f1Name, "clusterX_screw__strutMain");
  assert.ok(ops.reorient.some((r) => r.node === f1Name), "unanswered fastener node keeps its reorient entry");
});
