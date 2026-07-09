
import type { ThumbMap, ThumbSet } from "@/src/game/core/type";

export const thumbnail = { light: require("../../../../assets/thumbnails/furnitures/LACK/light/LACK.png"), dark: require("../../../../assets/thumbnails/furnitures/LACK/dark/LACK.png") } satisfies ThumbSet;

export const thumbs = {
  "bolt115980": { light: require("../../../../assets/thumbnails/furnitures/LACK/light/parts/whole_bolt115980_4.png"), dark: require("../../../../assets/thumbnails/furnitures/LACK/dark/parts/whole_bolt115980_4.png") },
  "leg": { light: require("../../../../assets/thumbnails/furnitures/LACK/light/parts/whole_leg_1_bolt115980_1.png"), dark: require("../../../../assets/thumbnails/furnitures/LACK/dark/parts/whole_leg_1_bolt115980_1.png") },
  "tableTop": { light: require("../../../../assets/thumbnails/furnitures/LACK/light/parts/whole_tableTop.png"), dark: require("../../../../assets/thumbnails/furnitures/LACK/dark/parts/whole_tableTop.png") },
} as ThumbMap;
