// The furniture catalogue. Registering a furniture here makes it available to
// the picker and to store.loadFurniture().
import { Furniture, FurnitureId, FurnitureMeta } from "@/src/adhd/core/type";
import { LACK } from "./LACK";

export const FURNITURES: Partial<Record<FurnitureId, Furniture>> = {
  LACK,
};

export const FURNITURE_METAS: FurnitureMeta[] = Object.values(FURNITURES).map(
  (f) => f.meta,
);
