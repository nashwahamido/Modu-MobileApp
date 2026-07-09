
import type { ClusterThumbMap, ThumbMap, ThumbSet } from "@/src/game/core/type";

export const thumbnail = { light: require("../../../../assets/thumbnails/furnitures/DALFRED/light/DALFRED.png"), dark: require("../../../../assets/thumbnails/furnitures/DALFRED/dark/DALFRED.png") } satisfies ThumbSet;

export const thumbs = {
  "circleDown": { light: require("../../../../assets/thumbnails/furnitures/DALFRED/light/parts/base_circleDown.png"), dark: require("../../../../assets/thumbnails/furnitures/DALFRED/dark/parts/base_circleDown.png") },
  "circleUpp": { light: require("../../../../assets/thumbnails/furnitures/DALFRED/light/parts/base_circleUpp.png"), dark: require("../../../../assets/thumbnails/furnitures/DALFRED/dark/parts/base_circleUpp.png") },
  "leg": { light: require("../../../../assets/thumbnails/furnitures/DALFRED/light/parts/base_leg_1.png"), dark: require("../../../../assets/thumbnails/furnitures/DALFRED/dark/parts/base_leg_1.png") },
  "pole": { light: require("../../../../assets/thumbnails/furnitures/DALFRED/light/parts/seat_pole.png"), dark: require("../../../../assets/thumbnails/furnitures/DALFRED/dark/parts/seat_pole.png") },
  "ringRail": { light: require("../../../../assets/thumbnails/furnitures/DALFRED/light/parts/base_ringRail.png"), dark: require("../../../../assets/thumbnails/furnitures/DALFRED/dark/parts/base_ringRail.png") },
  "screw100212": { light: require("../../../../assets/thumbnails/furnitures/DALFRED/light/parts/base_screw100212_3_leg_3.png"), dark: require("../../../../assets/thumbnails/furnitures/DALFRED/dark/parts/base_screw100212_3_leg_3.png") },
  "screw105251": { light: require("../../../../assets/thumbnails/furnitures/DALFRED/light/parts/base_screw105251_5_leg_1.png"), dark: require("../../../../assets/thumbnails/furnitures/DALFRED/dark/parts/base_screw105251_5_leg_1.png") },
  "screw105298": { light: require("../../../../assets/thumbnails/furnitures/DALFRED/light/parts/base_screw105298_3.png"), dark: require("../../../../assets/thumbnails/furnitures/DALFRED/dark/parts/base_screw105298_3.png") },
  "screw107675": { light: require("../../../../assets/thumbnails/furnitures/DALFRED/light/parts/seat_screw107675.png"), dark: require("../../../../assets/thumbnails/furnitures/DALFRED/dark/parts/seat_screw107675.png") },
  "screw108443": { light: require("../../../../assets/thumbnails/furnitures/DALFRED/light/parts/seat_screw108443_1.png"), dark: require("../../../../assets/thumbnails/furnitures/DALFRED/dark/parts/seat_screw108443_1.png") },
  "seat": { light: require("../../../../assets/thumbnails/furnitures/DALFRED/light/parts/seat_seat.png"), dark: require("../../../../assets/thumbnails/furnitures/DALFRED/dark/parts/seat_seat.png") },
  "seatPlate": { light: require("../../../../assets/thumbnails/furnitures/DALFRED/light/parts/seat_coneWithPlate.png"), dark: require("../../../../assets/thumbnails/furnitures/DALFRED/dark/parts/seat_coneWithPlate.png") },
  "supportPin": { light: require("../../../../assets/thumbnails/furnitures/DALFRED/light/parts/base_supportPin.png"), dark: require("../../../../assets/thumbnails/furnitures/DALFRED/dark/parts/base_supportPin.png") },
} as ThumbMap;

export const clusterThumbs = {
  "base": { light: require("../../../../assets/thumbnails/furnitures/DALFRED/light/clusters/base.png") },
  "seat": { light: require("../../../../assets/thumbnails/furnitures/DALFRED/light/clusters/seat.png") },
} as ClusterThumbMap;
