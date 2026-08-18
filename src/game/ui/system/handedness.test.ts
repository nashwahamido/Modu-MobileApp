import { strict as assert } from "node:assert";
import { test } from "node:test";

import type { TextStyle, ViewStyle } from "react-native";

import { mirror, mirrorTable } from "./handedness";

// mirror returns the type it was GIVEN — a knowing inaccuracy, since a mirrored style swaps left for
// right. Assertions therefore read the result as a plain style, not as the literal that went in.
const as = (style: ViewStyle): Record<string, unknown> => style as Record<string, unknown>;

// Only the pure functions are covered — the hooks are the same call with the store's value in front.

test("right-handed returns the very same object", () => {
  const style: ViewStyle = { position: "absolute", left: 14, bottom: 16 };
  assert.equal(mirror(style, "right"), style);
});

test("an edge MOVES rather than being copied to both sides", () => {
  const out = as(mirror<ViewStyle>({ position: "absolute", left: 14, bottom: 16 }, "left"));
  assert.equal(out.right, 14);
  assert.equal("left" in out, false);
  // Untouched: a horizontal mirror has no opinion about the vertical.
  assert.equal(out.bottom, 16);
  assert.equal(out.position, "absolute");
});

test("both edges present swap rather than clobbering each other", () => {
  const out = as(mirror<ViewStyle>({ left: 10, right: 90 }, "left"));
  assert.equal(out.left, 90);
  assert.equal(out.right, 10);
});

test("percentages mirror like any other value", () => {
  const out = as(mirror<ViewStyle>({ left: "22%", width: "50%" }, "left"));
  assert.equal(out.right, "22%");
  assert.equal(out.width, "50%");
});

test("a row pinned to an edge reverses, so its outermost item stays outermost", () => {
  const out = as(mirror<ViewStyle>({ right: 14, flexDirection: "row", gap: 8 }, "left"));
  assert.equal(out.left, 14);
  assert.equal(out.flexDirection, "row-reverse");
  assert.equal(out.gap, 8);
});

test("margins, padding and per-corner radii mirror too", () => {
  const out = as(mirror<ViewStyle>({ marginLeft: 4, paddingRight: 12, borderTopLeftRadius: 20 }, "left"));
  assert.equal(out.marginRight, 4);
  assert.equal("marginLeft" in out, false);
  assert.equal(out.paddingLeft, 12);
  assert.equal(out.borderTopRightRadius, 20);
});

test("alignSelf and textAlign flip; centre is left alone", () => {
  assert.equal(mirror<ViewStyle>({ alignSelf: "flex-end" }, "left").alignSelf, "flex-start");
  assert.equal(mirror<ViewStyle>({ alignSelf: "center" }, "left").alignSelf, "center");
  // Through TextStyle, which is what a text style actually is — mirror's parameter is the wider ViewStyle so it takes either.
  assert.equal(mirror<TextStyle>({ textAlign: "left" }, "left").textAlign, "right");
});

test("a style with nothing horizontal in it comes back unchanged in content", () => {
  const out = as(mirror<ViewStyle>({ top: 8, width: 36, height: 36 }, "left"));
  assert.deepEqual(out, { top: 8, width: 36, height: 36 });
});

test("a whole placement table mirrors in one pass", () => {
  const table: Record<string, ViewStyle> = {
    joystickZone: { position: "absolute", left: 14, bottom: 16 },
    togglesRow: { position: "absolute", right: 14, bottom: 16 },
    objectiveWrap: { position: "absolute", top: 10, alignSelf: "center" },
  };
  const out = mirrorTable(table, "left");
  assert.equal(out.joystickZone.right, 14);
  assert.equal(out.togglesRow.left, 14);
  // The centred bar is the same on either hand and must not drift.
  assert.deepEqual(out.objectiveWrap, table.objectiveWrap);
  // Right-handed hands back the original table, identity included.
  assert.equal(mirrorTable(table, "right"), table);
});