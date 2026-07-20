import { test } from "node:test";
import assert from "node:assert/strict";
import { parseName, partIdOf, buildName, humanize } from "../lib/naming.mjs";

test("parseName round-trips the convention", () => {
  const p = parseName("base_screw105251_1__leg_1&circleUpp");
  assert.deepEqual(
    { cluster: p.cluster, group: p.group, index: p.index, attached: p.attached },
    { cluster: "base", group: "screw105251", index: 1, attached: ["leg_1", "circleUpp"] },
  );
  assert.equal(partIdOf("whole_tableTop"), "tableTop");
  assert.equal(partIdOf("drawerA_drawerFront_1"), "drawerFront_1");
});

test("buildName assembles convention names", () => {
  assert.equal(buildName({ cluster: "cabinet", group: "sidePanelL" }), "cabinet_sidePanelL");
  assert.equal(
    buildName({ cluster: "drawerA", group: "bolt128918", index: 2, joints: ["drawerFront_1", "drawerSideL_1"] }),
    "drawerA_bolt128918_2__drawerFront_1&drawerSideL_1",
  );
});

test("humanize", () => {
  assert.equal(humanize("sidePanelL"), "Side panel l");
});

test("parseName legacy tail after index", () => {
  const p = parseName("base_screw105251_1_leg_1");
  assert.equal(p.partId, "screw105251_1");
  assert.deepEqual(p.attached, ["leg_1"]);
});

test("parseName legacy non-numeric third segment", () => {
  const p = parseName("cluster_group_joint");
  assert.equal(p.partId, "group");
  assert.equal(p.attached, undefined);
});
