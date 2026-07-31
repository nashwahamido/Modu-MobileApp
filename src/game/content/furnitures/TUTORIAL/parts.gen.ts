import { PartDef, PartId, RawPartDef } from "@/src/game/core/type";

const PARTS_RAW = {
  bottom_panel: {
    partId: "bottom_panel",
    group: "panel",
    meshName: "bottom_panel",
    type: "structural",
    cluster: "whole",
    visualCenterOffset: [0, 0, 0],
    pose: { position: [0, 0.01, 0], rotation: [0, 0, 0, 1] },
  },
  left_side_panel: {
    partId: "left_side_panel",
    group: "panel",
    meshName: "left_side_panel",
    type: "structural",
    cluster: "whole",
    visualCenterOffset: [0, 0, 0],
    pose: { position: [-0.17, 0.18, 0], rotation: [0, 0, 0, 1] },
  },
  right_side_panel: {
    partId: "right_side_panel",
    group: "panel",
    meshName: "right_side_panel",
    type: "structural",
    cluster: "whole",
    visualCenterOffset: [0, 0, 0],
    pose: { position: [0.17, 0.18, 0], rotation: [0, 0, 0, 1] },
  },
  back_panel: {
    partId: "back_panel",
    group: "panel",
    meshName: "back_panel",
    type: "structural",
    cluster: "whole",
    visualCenterOffset: [0, 0, 0],
    pose: { position: [0, 0.18, -0.12], rotation: [0, 0, 0, 1] },
  },
  top_panel: {
    partId: "top_panel",
    group: "panel",
    meshName: "top_panel",
    type: "structural",
    cluster: "whole",
    visualCenterOffset: [0, 0, 0],
    pose: { position: [0, 0.35, 0], rotation: [0, 0, 0, 1] },
  },
  connector_1: {
    partId: "connector_1",
    group: "connector",
    meshName: "connector_1",
    type: "fastener",
    fastenerKind: "secured",
    cluster: "whole",
    attached: ["top_panel", "back_panel"],
    engageDir: [0, 1, 0],
    visualCenterOffset: [0, 0, 0],
    pose: { position: [0.14, 0.335, -0.095], rotation: [0, 0, 0, 1] },
  },
} satisfies Record<string, Omit<RawPartDef, "tool">>;

export const PARTS = PARTS_RAW as unknown as Record<PartId, PartDef>;
export const ALL_PART_IDS = Object.keys(PARTS_RAW) as PartId[];
