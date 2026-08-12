// What the inventory owns = user_build (built furniture, described by item_build) ∪ user_buy (bought items, described by item_buy). Both halves get their name and category from the backend; built furniture has no price because it is earned. One shape for both.
//
// Declared once here rather than inline in InventoryOverlay: this shape is the contract between the two acquisition paths. It had already been written twice with different fields — one copy carried `price` and the other did not — while both claimed to be the same concept.
import type { ItemSource, ShopCategory } from "@/src/data";

export interface OwnedItem {
  id: string;
  name: string;
  category: ShopCategory;
  /** Absent for built furniture, which is earned rather than bought. */
  price?: number;
  /** Which room/<source>/ subtree the item's assets live under, and therefore how its thumbnail and model resolve. Spelled as the shared ItemSource rather than as a local "built" | "bought" pair, because a dev build also surfaces workshop drafts here and a narrower type here silently forced every one of them to claim it was published. */
  source: ItemSource;
}
