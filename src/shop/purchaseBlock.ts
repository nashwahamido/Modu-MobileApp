// Why a purchase can't happen: the player's level is too low, or their coins are.
//
// One declaration, shared by ShopOverlay (which decides the block) and PurchaseNoticePopup (which renders it). It had been declared twice — PurchaseBlock in one file, NoticeBlock in the other, whose own comment admitted it was mirroring the first. A third case added to one copy would have type-checked while silently leaving the other side unable to express it.
export type PurchaseBlock = "level" | "coins";
