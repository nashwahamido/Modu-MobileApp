import {
  action,
  FastenerRule,
  tightenActionIds,
} from "@/src/game/core/composition/composeActions";
import { StructureOverlay } from "@/src/game/core/model/liaisons";
import { asGroupId, asPartId } from "@/src/game/core/ids";
import {
  ClusterDef,
  ClusterId,
  DraftAction,
  InstructionSet,
  LabelMap,
} from "@/src/game/core/type";
import { PARTS } from "./parts";

export const META = {
  name: "Malm Drawers",
  brand: "IKEA",
  category: "Shelf & Cabinet",
  difficulty: 2,
  duration: 25,
  link: "https://www.ikea.com/",
} as const;

export const LABELS = {
  front: { standard: "Drawer front", simple: "Front" },
  side: { standard: "Drawer side", simple: "Side" },
  back: { standard: "Drawer back", simple: "Back" },
  bottom: { standard: "Drawer bottom", simple: "Bottom" },
  rail148601: { standard: "Drawer rail", simple: "Rail" },
  rail123833: { standard: "Centre guide rail", simple: "Rail" },
} as LabelMap;

export const CLUSTERS = {
  drawer1: { id: "drawer1", label: "Small drawer" },
  drawer2: { id: "drawer2", label: "Wide drawer" },
} as Record<ClusterId, ClusterDef>;

export const STRUCTURE = Object.fromEntries(
  [1, 2].flatMap((d) => [
    [`front_${d}`, { seed: true }],
    [`back_${d}`, { slideJoins: [asPartId(`sideL_${d}`), asPartId(`sideR_${d}`)] }],
    [
      `bottom_${d}`,
      {
        slideJoins: [
          asPartId(`front_${d}`),
          asPartId(`sideL_${d}`),
          asPartId(`sideR_${d}`),
        ],
      },
    ],
  ]),
) as StructureOverlay;

//     global catalogue (data/hardware.ts) — stage is the only per-build fact.
export const FASTENER_RULES: FastenerRule[] = [
  { group: asGroupId("camBolt118331"), stage: 1 },
  { group: asGroupId("screw110519"), stage: 2 },
  { group: asGroupId("screw115339"), stage: 2 },
  { group: asGroupId("screw100365"), stage: 3 },
  { group: asGroupId("screw105344"), stage: 3 },
];

const drawerPlacements = (d: number): DraftAction[] => {
  const id = (n: string) => `${n}_${d}`;
  return [
    action({ type: "placePart", stage: 1, partId: id("front"), requires: [] }),
    action({
      type: "placePart",
      stage: 1,
      partId: id("sideL"),
      requires: [`insert_${id("camBoltL1")}`, `insert_${id("camBoltL2")}`],
    }),
    action({
      type: "placePart",
      stage: 1,
      partId: id("sideR"),
      requires: [`insert_${id("camBoltR1")}`, `insert_${id("camBoltR2")}`],
    }),
    action({ type: "placePart", stage: 2, partId: id("back"), requires: [] }),
    action({ type: "placePart", stage: 2, partId: id("bottom"), requires: [] }),
    action({ type: "placePart", stage: 3, partId: id("railL"), requires: [] }),
    action({ type: "placePart", stage: 3, partId: id("railR"), requires: [] }),
    action({ type: "placePart", stage: 3, partId: id("crossRail"), requires: [] }),
  ];
};

export const AUTHORED_ACTIONS: DraftAction[] = [
  ...drawerPlacements(1),
  ...drawerPlacements(2),
  action({
    actionId: "mount_drawers",
    type: "reorient",
    stage: 3,
    requires: [
      ...tightenActionIds(PARTS, asGroupId("screw100365")),
      ...tightenActionIds(PARTS, asGroupId("screw105344")),
    ],
  }),
];

export const BEATS = {
  mount_drawers: {
    text: "Slide each finished drawer onto its rails in the chest frame.",
    simpleText: "Put the drawers in.",
  },
} as InstructionSet;
