import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clusterCombineEngagement,
  clusterParkInfo,
  combinePrereqClusters,
} from "./clusterCombine";
import { withClusterCombines } from "@/src/game/core/composition/composeActions";
import type { ClusterDef, ClusterId, DraftAction } from "@/src/game/core/type";

const CLUSTERS = {
  cabinet: { id: "cabinet", label: "Cabinet", seed: true },
  drawerA: {
    id: "drawerA", label: "Top drawer",
    slideJoins: ["cabinet"], placeDir: [-1, 0, 0], parkBackoff: 0.16, pushLevel: "1",
  },
  drawerB: {
    id: "drawerB", label: "Bottom drawer",
    slideJoins: ["cabinet"], placeDir: [-1, 0, 0], parkBackoff: 0.16, pushLevel: "2",
  },
} as unknown as Record<ClusterId, ClusterDef>;

test("a slide-joined cluster names its prerequisites", () => {
  assert.deepEqual(combinePrereqClusters(CLUSTERS, "drawerA" as ClusterId), ["cabinet"]);
});

test("the root has no prerequisites", () => {
  assert.deepEqual(combinePrereqClusters(CLUSTERS, "cabinet" as ClusterId), []);
});

test("engagement is drop for the seed and slide for a slide-joined cluster", () => {
  assert.equal(clusterCombineEngagement(CLUSTERS, "cabinet" as ClusterId), "drop");
  assert.equal(clusterCombineEngagement(CLUSTERS, "drawerA" as ClusterId), "slide");
});

test("engagement is null when the cluster authors no overlay", () => {
  const plain = { a: { id: "a", label: "A" } } as unknown as Record<ClusterId, ClusterDef>;
  assert.equal(clusterCombineEngagement(plain, "a" as ClusterId), null);
});

test("a slide-joined cluster parks backward along its travel axis", () => {
  const park = clusterParkInfo(CLUSTERS, "drawerA" as ClusterId)!;
  assert.deepEqual(park.axis, [-1, 0, 0]);
  // parks OPPOSITE the travel axis, at the authored backoff — out the cabinet front
  assert.equal(Math.round(park.offset[0] * 1000) / 1000, 0.16);
  assert.equal(park.offset[1], 0);
  assert.equal(park.offset[2], 0);
});

test("the seed cluster has no park staging — it drops", () => {
  assert.equal(clusterParkInfo(CLUSTERS, "cabinet" as ClusterId), null);
});

test("a slide-joined cluster with no placeDir has no park staging", () => {
  const bad = {
    root: { id: "root", label: "R", seed: true },
    x: { id: "x", label: "X", slideJoins: ["root"] },
  } as unknown as Record<ClusterId, ClusterDef>;
  assert.equal(clusterParkInfo(bad, "x" as ClusterId), null);
});

const combineDraft = (id: string, cluster: string, requires: string[] = []) =>
  ({ actionId: id, type: "combineClusters", stage: 4, cluster, requires } as unknown as DraftAction);

test("a combine gains the combines of its slideJoins as requires", () => {
  const out = withClusterCombines(
    [
      combineDraft("combine_cabinet", "cabinet", ["reorient_cabinet"]),
      combineDraft("combine_drawerA", "drawerA"),
      combineDraft("combine_drawerB", "drawerB"),
    ],
    CLUSTERS,
  );
  const byId = new Map(out.map((d) => [d.actionId as string, d]));
  assert.deepEqual([...byId.get("combine_drawerA")!.requires], ["combine_cabinet"]);
  assert.deepEqual([...byId.get("combine_drawerB")!.requires], ["combine_cabinet"]);
});

test("the root combine keeps its authored requires and gains none", () => {
  const out = withClusterCombines(
    [combineDraft("combine_cabinet", "cabinet", ["reorient_cabinet"])],
    CLUSTERS,
  );
  assert.deepEqual([...out[0].requires], ["reorient_cabinet"]);
});

test("derived requires are added, not substituted, for authored ones", () => {
  const out = withClusterCombines(
    [
      combineDraft("combine_cabinet", "cabinet"),
      combineDraft("combine_drawerA", "drawerA", ["some_beat"]),
    ],
    CLUSTERS,
  );
  const a = out.find((d) => d.actionId === "combine_drawerA")!;
  assert.deepEqual([...a.requires].sort(), ["combine_cabinet", "some_beat"]);
});

test("furniture with no overlay is passed through untouched", () => {
  const drafts = [combineDraft("combine_all", "whole", ["x"])];
  const out = withClusterCombines(drafts, undefined);
  assert.deepEqual(out, drafts);
});
