import {
  ActionId,
  ClusterId,
  ComponentId,
  GroupId,
  LiaisonId,
  PartId,
} from "@/src/game/core/type";

export const asPartId = (s: string): PartId => s as PartId;
export const asGroupId = (s: string): GroupId => s as GroupId;
export const asActionId = (s: string): ActionId => s as ActionId;
export const asClusterId = (s: string): ClusterId => s as ClusterId;
export const asComponentId = (s: string): ComponentId => s as ComponentId;

const ACTION_ID_PREFIX = {
  stagePart: "stage",
  placePart: "place",
  placeFastener: "drop",
  insertFastener: "insert",
  tightenFastener: "tighten",
} as const;
export type PartTiedActionType = keyof typeof ACTION_ID_PREFIX;

export const isPartTiedType = (t: string): t is PartTiedActionType =>
  t in ACTION_ID_PREFIX;

/** Types the player performs by taking a part in hand and dragging it — everything the pickup/drag path must accept. Enumerated ONCE here: the gesture layer used to spell this list out inline in several places, and a new type added to only some of them is silently un-draggable rather than broken. */
const PICKUP_TYPES = new Set(["stagePart", "placePart", "placeFastener", "insertFastener"]);
export const isPickupType = (t: string): boolean => PICKUP_TYPES.has(t);

/** The canonical id of a part-tied action: `<prefix>_<partId>`. */
export const actionIdFor = (type: PartTiedActionType, p: PartId): ActionId =>
  `${ACTION_ID_PREFIX[type]}_${p}` as ActionId;

export const stageId = (p: PartId): ActionId => actionIdFor("stagePart", p);
export const placeId = (p: PartId): ActionId => actionIdFor("placePart", p);
export const placeFastenerId = (p: PartId): ActionId => actionIdFor("placeFastener", p);
export const insertId = (p: PartId): ActionId => actionIdFor("insertFastener", p);
export const tightenId = (p: PartId): ActionId => actionIdFor("tightenFastener", p);

export const liaisonId = (a: PartId, b: PartId): LiaisonId =>
  [a, b].sort().join("__") as LiaisonId;
