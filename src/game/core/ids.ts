import {
  ActionId,
  ClusterId,
  GroupId,
  LiaisonId,
  PartId,
} from "@/src/game/core/type";

export const asPartId = (s: string): PartId => s as PartId;
export const asGroupId = (s: string): GroupId => s as GroupId;
export const asActionId = (s: string): ActionId => s as ActionId;
export const asClusterId = (s: string): ClusterId => s as ClusterId;

const ACTION_ID_PREFIX = {
  placePart: "place",
  insertFastener: "insert",
  tightenFastener: "tighten",
} as const;
export type PartTiedActionType = keyof typeof ACTION_ID_PREFIX;

export const isPartTiedType = (t: string): t is PartTiedActionType =>
  t in ACTION_ID_PREFIX;

/** The canonical id of a part-tied action: `<prefix>_<partId>`. */
export const actionIdFor = (type: PartTiedActionType, p: PartId): ActionId =>
  `${ACTION_ID_PREFIX[type]}_${p}` as ActionId;

export const placeId = (p: PartId): ActionId => actionIdFor("placePart", p);
export const insertId = (p: PartId): ActionId => actionIdFor("insertFastener", p);
export const tightenId = (p: PartId): ActionId => actionIdFor("tightenFastener", p);

export const liaisonId = (a: PartId, b: PartId): LiaisonId =>
  [a, b].sort().join("__") as LiaisonId;
