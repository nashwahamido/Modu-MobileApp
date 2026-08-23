import assert from "node:assert/strict";
import test from "node:test";

import { variationToLoad } from "./variantModel";

// item_variants rows as the store hands them over, default first (variantStore groups them that way).
const LACK = [
  { variation: "wooden", isDefault: true },
  { variation: "black", isDefault: false },
  { variation: "white", isDefault: false },
];

test("a placement's own colour is loaded, whatever the table calls default", () => {
  assert.equal(variationToLoad("black", LACK), "black");
});

test("a colourless placement follows the item's default from item_variants", () => {
  // The whole point of resolving HERE rather than at placement time: startPlacing stamps null whenever the variants store has not loaded yet, and that null is persisted as an absent colour, so the placement never gets a second chance to pick one up. Undefined and null are the same statement — "no colour of my own".
  assert.equal(variationToLoad(null, LACK), "wooden");
  assert.equal(variationToLoad(undefined, LACK), "wooden");
});

test("an item with no rows yet resolves to null — the 'default' path segment, and it re-resolves when the table lands", () => {
  // Null is correct for a genuine single-model item (a window), and it is the honest miss for a multi-variation item whose rows have not arrived: useItemVariants is a subscription, so the hook re-renders with the real default the moment the store hydrates and the URL changes underneath the probe.
  assert.equal(variationToLoad(null, []), null);
  // A row with a null variation IS the single-model case, stated positively by the table.
  assert.equal(variationToLoad(null, [{ variation: null, isDefault: true }]), null);
});

test("with no is_default flagged, the first row stands in rather than nothing at all", () => {
  // defaultVariation's own rule (catalog/assets.ts). Pinned here because the alternative — resolving to null and loading default.glb — is the invisible-piece failure this function exists to prevent.
  assert.equal(variationToLoad(null, [{ variation: "birch", isDefault: false }]), "birch");
});
