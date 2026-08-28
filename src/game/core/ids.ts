// String → branded id casts, and the one place an actionId is spelled. See README.

import {
  ActionId,
  ClusterId,
  ComponentId,
  FurnitureId,
  GroupId,
  LiaisonId,
  PartId,
} from "@/src/game/core/type";

// --------------- casts
export const asPartId = (s: string): PartId => s as PartId;
export const asFurnitureId = (s: string): FurnitureId => s as FurnitureId;
export const asGroupId = (s: string): GroupId => s as GroupId;
export const asActionId = (s: string): ActionId => s as ActionId;
export const asClusterId = (s: string): ClusterId => s as ClusterId;
export const asComponentId = (s: string): ComponentId => s as ComponentId;

// --------------- part-tied actions: the type IS the id prefix
const ACTION_ID_PREFIX = {
  stagePart: "stage", // resting at its sub-assembly pose, not home yet
  placePart: "place",
  placeFastener: "drop",
  insertFastener: "insert",
  tightenFastener: "tighten",
} as const;
export type PartTiedActionType = keyof typeof ACTION_ID_PREFIX;
export const isPartTiedType = (t: string): t is PartTiedActionType =>
  t in ACTION_ID_PREFIX;

// --------------- pickups: what the player lifts (a tighten is done in place)
const PICKUP_TYPES: ReadonlySet<string> = new Set<PartTiedActionType>([
  "stagePart",
  "placePart",
  "placeFastener",
  "insertFastener",
]);
export const isPickupType = (t: string): boolean => PICKUP_TYPES.has(t);

// --------------- id shape: <prefix>_<partId>
export const actionIdFor = (type: PartTiedActionType, p: PartId): ActionId =>
  `${ACTION_ID_PREFIX[type]}_${p}` as ActionId;

export const stageId = (p: PartId): ActionId => actionIdFor("stagePart", p);
export const placeId = (p: PartId): ActionId => actionIdFor("placePart", p);
export const placeFastenerId = (p: PartId): ActionId =>
  actionIdFor("placeFastener", p);
export const insertId = (p: PartId): ActionId =>
  actionIdFor("insertFastener", p);
export const tightenId = (p: PartId): ActionId =>
  actionIdFor("tightenFastener", p);

// Sorted, so a liaison has one id whichever end asks for it.
export const liaisonId = (a: PartId, b: PartId): LiaisonId =>
  [a, b].sort().join("__") as LiaisonId;
