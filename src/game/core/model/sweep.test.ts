// pickEntryDir — the runtime half of the sweep: an order-aware VETO over the caller's heuristic, never a re-derivation. The contract under test: no data / all-clear / heuristic-viable → the heuristic comes back byte-identical (corpus-neutrality is the design); only a heuristic whose reverse corridor holds a placed THIRD-PARTY blocker is swapped for the nearest viable cardinal; partner blockers never veto (their contact is park-math territory); and with nothing viable the heuristic stands, because the data has nothing better to offer.
import { test } from "node:test";
import assert from "node:assert/strict";

import { adaptSignedDir, pickEntryDir } from "./sweep";
import { applyStructure, buildLiaisons } from "./liaisons";
import { adaptedTravelDir, pressParkInfo, slideParkInfo } from "../evaluation/engagement";
import { seatOffsetFor } from "../scene/targets";
import { placeId, asPartId } from "@/src/game/core/ids";
import type { ActionId, AssemblyAction, Furniture, PartId, SweepMap } from "@/src/game/core/type";
import { STRUCTURE as EKET_STRUCTURE } from "@/src/game/content/furnitures/EKET/authored";
import { PARTS as EKET_PARTS } from "@/src/game/content/furnitures/EKET/parts.gen";
import { SWEEP as EKET_SWEEP } from "@/src/game/content/furnitures/EKET/sweep.gen";
import { STRUCTURE_COMPOSED as EKET_COMPOSED } from "@/src/game/content/furnitures/EKET/structure.gen";

const placed = (...ids: string[]) => {
  const s = new Set(ids);
  return (id: PartId) => s.has(id as string);
};
const none = new Set<PartId>();
const P = (...ids: string[]) => new Set(ids as unknown as PartId[]);
// entry +y's reverse corridor is -y: a blocker there vetoes entering upward
const DIRS = { "-y": ["shelf"], "+x": ["wall"] } as unknown as SweepMap[PartId];

test("no data, or nothing placed, returns the heuristic byte-identical", () => {
  const h: [number, number, number] = [0.1, 0.9, 0.2];
  assert.equal(pickEntryDir(undefined, placed("shelf"), none, h), h);
  assert.equal(pickEntryDir(DIRS, placed(), none, h), h);
});

test("a placed third-party blocker on the heuristic's corridor swaps in the nearest viable cardinal", () => {
  // heuristic says up (+y), but the shelf below is placed and blocks the -y corridor; +x is also out (wall placed); nearest viable to an up-ish heuristic leaning +z is +z
  const out = pickEntryDir(DIRS, placed("shelf", "wall"), none, [0.1, 0.9, 0.3]);
  assert.deepEqual(out, [0, 0, 1]);
});

test("a partner blocker never vetoes — mate contact is park-math territory, not ordering", () => {
  const h: [number, number, number] = [0, 1, 0];
  assert.equal(pickEntryDir(DIRS, placed("shelf"), P("shelf"), h), h);
});

test("an unplaced blocker does not veto: order-awareness means the corridor is judged against the CURRENT build state", () => {
  const h: [number, number, number] = [0, 1, 0];
  assert.equal(pickEntryDir(DIRS, placed("wall"), none, h), h);
});

test("when every direction is vetoed the heuristic stands — the data has nothing better to offer", () => {
  const all = Object.fromEntries(["+x", "-x", "+y", "-y", "+z", "-z"].map((k) => [k, ["cage"]])) as unknown as SweepMap[PartId];
  const h: [number, number, number] = [1, 0, 0];
  assert.equal(pickEntryDir(all, placed("cage"), none, h), h);
});

test("adaptSignedDir keeps the authored vector when its corridor is viable, flips only the sign when it is not", () => {
  const a: [number, number, number] = [0, 1, 0];
  // corridor of +y entry is -y; "floor" placed and third-party vetoes it, and the -y entry's +y corridor is clear → sign flips
  const dirs = { "-y": ["floor"], "+y": ["lid"] } as unknown as SweepMap[PartId];
  assert.equal(adaptSignedDir(dirs, placed(), none, a), a);
  assert.deepEqual(adaptSignedDir(dirs, placed("floor"), none, a), [-0, -1, -0].map((v) => v || 0));
  // both corridors vetoed → authored stands (nothing better to offer)
  assert.equal(adaptSignedDir(dirs, placed("floor", "lid"), none, a), a);
  // a partner on the authored corridor never forces the flip
  assert.equal(adaptSignedDir(dirs, placed("floor"), P("floor"), a), a);
});

// The July 2026 order-dependence case, end to end through the real EKET data: the back panel's static placeDir [0,1,0] could only say the authored top-first order (slide UP through the open bottom); after a bottom-first close — legal in free mode through the symmetric groove-trap gates — the same panel must slide DOWN through the open top, and the static value shipped a colliding branch. The sweep now flips the sign per build order; the axis stays authored (a groove's axis is not derivable — the device-proven lesson).
test("EKET backPanel slides UP after top-first and DOWN after bottom-first — the placeDir sign follows the build order", () => {
  const parts = applyStructure(EKET_PARTS, EKET_COMPOSED);
  const f = { parts, liaisons: buildLiaisons(parts), sweep: EKET_SWEEP } as unknown as Furniture;
  const back = asPartId("backPanel");
  const action = { actionId: placeId(back), type: "placePart", partId: back } as unknown as AssemblyAction;
  const done = (...ids: string[]): ReadonlySet<ActionId> => new Set(ids.map((i) => placeId(asPartId(i))));
  const topFirst = slideParkInfo(f, action, done("sidePanelL", "sidePanelR", "topPanel"));
  assert.deepEqual(topFirst?.axis, [0, 1, 0], "authored order must keep the authored direction byte-identical");
  const bottomFirst = slideParkInfo(f, action, done("sidePanelL", "sidePanelR", "bottomPanel"));
  assert.deepEqual(bottomFirst?.axis, [0, -1, 0], "after a bottom-first close the panel must enter downward through the open top");
  // The drag layer's export must agree with the park — one order-adapted direction, consumed by both the aim anchor and the release path (the on-device "parks right but never snaps" split).
  assert.deepEqual(adaptedTravelDir(f, parts[back]!, done("sidePanelL", "sidePanelR", "bottomPanel")), [0, -1, 0]);
});

// The AXIS half of order-dependence (the sign tests above cover the slider half): a press horizontal's approach follows its placed MATES. One standing side pulls it sideways toward that side — either side, so the authored sign mirrors; both standing sides cancel laterally and the approach collapses to the closing axis, the motion the bottom panel already authors for ITS close-over-both. The suspension bracket is the guard-rail case: its mate centroid points down, but the closed top vetoes a vertical approach and the authored sideways tap must stand.
test("EKET topPanel approach follows the standing sides: toward one, straight DOWN over both", () => {
  const parts = applyStructure(EKET_PARTS, EKET_COMPOSED);
  const f = { parts, liaisons: buildLiaisons(parts), sweep: EKET_SWEEP } as unknown as Furniture;
  const top = parts[asPartId("topPanel")]!;
  const done = (...ids: string[]): ReadonlySet<ActionId> => new Set(ids.map((i) => placeId(asPartId(i))));
  // authored order, left side standing: the device-verified vector, byte-identical
  assert.deepEqual(adaptedTravelDir(f, top, done("sidePanelL")), [0, 0, 1]);
  // mirrored order, right side standing: same axis, sign toward the mate
  assert.deepEqual(adaptedTravelDir(f, top, done("sidePanelR")), [0, 0, -1]);
  // bottom-first, closing LAST over both sides: lateral pull cancels, the top drops — the bottom panel's own authored close, mirrored
  assert.deepEqual(adaptedTravelDir(f, top, done("sidePanelL", "sidePanelR", "bottomPanel", "backPanel")), [0, -1, 0]);
  // and the park the drag/scene actually consume agrees
  const action = { actionId: placeId(asPartId("topPanel")), type: "placePart", partId: asPartId("topPanel"), requires: [] } as unknown as AssemblyAction;
  const park = pressParkInfo(f, action, done("sidePanelL", "sidePanelR", "bottomPanel", "backPanel"));
  assert.deepEqual(park?.axis, [0, -1, 0]);
});

test("EKET bottomPanel's authored close-over-both survives byte-identical, and the suspension bracket's cross-axis pull is vetoed", () => {
  const parts = applyStructure(EKET_PARTS, EKET_COMPOSED);
  const f = { parts, liaisons: buildLiaisons(parts), sweep: EKET_SWEEP } as unknown as Furniture;
  const done = (...ids: string[]): ReadonlySet<ActionId> => new Set(ids.map((i) => placeId(asPartId(i))));
  // authored order: back seated, bottom closes UP over both sides — mates agree with the authored axis, exact vector kept
  assert.deepEqual(adaptedTravelDir(f, parts[asPartId("bottomPanel")]!, done("sidePanelL", "sidePanelR", "topPanel", "backPanel")), [0, 1, 0]);
  // bracket: mate centroid points down (its side's centre sits below the top-rear corner), but the closed top vetoes the vertical — the device-verified sideways tap stands
  assert.deepEqual(adaptedTravelDir(f, parts[asPartId("suspBracket_1")]!, done("sidePanelL", "sidePanelR", "topPanel", "backPanel", "bottomPanel")), [0, 0, -1]);
});

test("seatOffsetFor pushes the aim anchor out along the ADAPTED travel, so the visible hole sits on the open side", () => {
  const part = { partId: "panel", pose: { position: [0, 0, 0], rotation: [0, 0, 0, 1] }, placeDir: [0, 1, 0] } as never;
  const anchors = { panel: [0, 0, 0] as [number, number, number] } as never;
  const receiver = { min: [-1, -0.1, -1] as [number, number, number], max: [1, 0.1, 1] as [number, number, number] };
  // authored direction (enter upward): the anchor backs off DOWN, exiting through the receiver's bottom face
  const authored = seatOffsetFor(part, undefined, anchors, new Set(), [receiver]);
  assert.ok(authored[1] < -0.09, `expected a downward push, got ${JSON.stringify(authored)}`);
  // adapted flip (enter downward — the reversed order): the anchor backs off UP, exiting through the top face the player can actually see
  const flipped = seatOffsetFor(part, undefined, anchors, new Set(), [receiver], [0, -1, 0]);
  assert.ok(flipped[1] > 0.09, `expected an upward push, got ${JSON.stringify(flipped)}`);
});
