import {
  action,
  FastenerRule,
} from "@/src/game/core/composition/composeActions";
import { asGroupId, asPartId } from "@/src/game/core/ids";
import { StructureOverlay } from "@/src/game/core/model/liaisons";
import {
  ClusterDef,
  ClusterId,
  DraftAction,
  InstructionSet,
  LabelMap,
} from "@/src/game/core/type";

export const META = {
  name: "Simple Cabinet",
  brand: "Others",
  category: "Shelf & Cabinet",
  difficulty: 1,
  duration: 5,
} as const;

export const LABELS = {
  panel: { standard: "Cabinet panel", simple: "Panel" },
  connector: { standard: "Cabinet connector", simple: "Connector" },
} as LabelMap;

export const CLUSTERS = {
  whole: { id: "whole", label: "Simple cabinet" },
} as Record<ClusterId, ClusterDef>;

export const STRUCTURE = {
  bottom_panel: { seed: true },
  left_side_panel: { directJoins: [asPartId("bottom_panel")] },
  right_side_panel: { directJoins: [asPartId("bottom_panel")] },
  back_panel: {
    slideJoins: [
      asPartId("bottom_panel"),
      asPartId("left_side_panel"),
      asPartId("right_side_panel"),
    ],
  },
  top_panel: {
    directJoins: [
      asPartId("left_side_panel"),
      asPartId("right_side_panel"),
      asPartId("back_panel"),
    ],
  },
  connector_1: { tool: "screwdriver" },
} as StructureOverlay;

export const PLACEMENT_ACTIONS: DraftAction[] = [
  action({ type: "placePart", stage: 1, partId: "bottom_panel", requires: [] }),
  action({
    type: "placePart",
    stage: 1,
    partId: "left_side_panel",
    requires: ["place_bottom_panel"],
  }),
  action({
    type: "placePart",
    stage: 1,
    partId: "right_side_panel",
    requires: ["place_left_side_panel"],
  }),
  action({
    type: "placePart",
    stage: 1,
    partId: "back_panel",
    requires: ["place_right_side_panel"],
  }),
  action({
    type: "placePart",
    stage: 1,
    partId: "top_panel",
    requires: ["place_back_panel"],
  }),
];

export const FASTENER_RULES: FastenerRule[] = [
  { group: asGroupId("connector"), stage: 1 },
];

export const FINISHING_ACTION = action({
  actionId: "finishing_checks",
  type: "reorient",
  stage: 2,
  requires: ["tighten_connector_1"],
});

export const BEATS = {
  place_bottom_panel: {
    text: "Place the bottom panel on the workbench.",
    simpleText: "Place the bottom panel.",
  },
  place_left_side_panel: {
    text: "Attach the left side panel.",
    simpleText: "Add the left panel.",
  },
  place_right_side_panel: {
    text: "Attach the right side panel.",
    simpleText: "Add the right panel.",
  },
  place_back_panel: {
    text: "Slide the back panel into place.",
    simpleText: "Add the back panel.",
  },
  place_top_panel: {
    text: "Place the top panel on the cabinet.",
    simpleText: "Add the top panel.",
  },
  finishing_checks: {
    text: "Rotate the cabinet and check the finished build.",
    simpleText: "Check the cabinet.",
  },
} as InstructionSet;
