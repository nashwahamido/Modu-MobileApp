import { strict as assert } from "node:assert";
import { test } from "node:test";

import { FINISH_STYLE, finishForStyle } from "./finish";

// Only finishForStyle is exercised here. modelThumbSet / clusterThumbSet are the same lookup with a
// Furniture around it, and a Furniture cannot be imported under node: its art is require()d PNGs.

// The two models this actually ships for, listed in their meta.ts order.
const EKET = ["wooden", "white", "cozy", "cartoon"];
const DALFRED = ["wooden", "black", "cartoon", "cozy"];

test("resolves the one-to-one styles for both models", () => {
  for (const finishes of [EKET, DALFRED]) {
    assert.equal(finishForStyle("cozy", finishes), "cozy");
    assert.equal(finishForStyle("cartoon", finishes), "cartoon");
    assert.equal(finishForStyle("illustrated", finishes), "wooden");
  }
});

// The whole reason the inverse takes a finish list. FINISH_STYLE is many-to-one at "realistic", so a
// globally inverted table could only ever answer white OR black — and would be wrong for the other
// model. Narrowing to the model's own finishes is what makes both answers right.
test("realistic resolves per model, since white and black both map to it", () => {
  assert.equal(FINISH_STYLE.white, "realistic");
  assert.equal(FINISH_STYLE.black, "realistic");
  assert.equal(finishForStyle("realistic", EKET), "white");
  assert.equal(finishForStyle("realistic", DALFRED), "black");
});

test("a style with no carousel finish resolves to nothing", () => {
  // toon is a material pass with no tile behind it — no finish means the caller keeps the plain art.
  assert.equal(finishForStyle("toon", EKET), undefined);
});

test("a model with no variant art resolves to nothing rather than throwing", () => {
  assert.equal(finishForStyle("cozy", undefined), undefined);
  assert.equal(finishForStyle("cozy", []), undefined);
});

test("a model that ships art for only some finishes falls back on the rest", () => {
  // BEKVAM-shaped: the catalogue lists five finishes, a build might ship cluster art for two.
  assert.equal(finishForStyle("cozy", ["wooden", "cozy"]), "cozy");
  assert.equal(finishForStyle("cartoon", ["wooden", "cozy"]), undefined);
});