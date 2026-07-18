import {
  action,
  FastenerRule,
  tightenActionIds,
} from "@/src/game/core/composition/composeActions";
import { StructureOverlay } from "@/src/game/core/model/liaisons";
import { asGroupId, asPartId, placeId } from "@/src/game/core/ids";
import {
  ClusterDef,
  ClusterId,
  DraftAction,
  Gate,
  InstructionSet,
  LabelMap,
  PartId,
  PushOpenGroup,
  PushOpenSpec,
} from "@/src/game/core/type";
import { PARTS } from "./parts.gen";

export const META = {
  name: "Eket Cabinet with 2 Drawers",
  brand: "IKEA",
  category: "Shelf & Cabinet",
  difficulty: 3,
  duration: 35,
  link: "https://www.ikea.com/us/en/p/eket-cabinet-with-2-drawers-00333947/",
} as const;

export const LABELS = {
  topPanel: { standard: "Top panel" },
  bottomPanel: { standard: "Bottom panel" },
  sidePanelL: { standard: "Left side panel", simple: "Left side" },
  sidePanelR: { standard: "Right side panel", simple: "Right side" },
  backPanel: { standard: "Back panel" },
  runnerFrameL: { standard: "Left runner", simple: "Runner" },
  runnerFrameR: { standard: "Right runner", simple: "Runner" },
  runnerMiddleL: { standard: "Left middle rail", simple: "Middle" },
  runnerMiddleR: { standard: "Right middle rail", simple: "Middle" },
  runnerCarriageL: { standard: "Left slide", simple: "Slide" },
  runnerCarriageR: { standard: "Right slide", simple: "Slide" },
  runnerClipL: { standard: "Left slide clip", simple: "Clip" },
  runnerClipR: { standard: "Right slide clip", simple: "Clip" },
  suspBracket: { standard: "Suspension bracket", simple: "Wall bracket" },
  suspKnob: { standard: "Adjuster knob", simple: "Knob" },
  suspCover: { standard: "Suspension cover", simple: "Cover" },
  suspCap: { standard: "Cover cap", simple: "Cap" },
  drawerFront: { standard: "Drawer front", simple: "Front" },
  drawerBack: { standard: "Drawer back", simple: "Back" },
  drawerBottom: { standard: "Drawer bottom", simple: "Base" },
  drawerSideL: { standard: "Left drawer side", simple: "Left side" },
  drawerSideR: { standard: "Right drawer side", simple: "Right side" },
  runnerBracketL: { standard: "Left runner bracket", simple: "Bracket" },
  runnerBracketR: { standard: "Right runner bracket", simple: "Bracket" },
  stabilizerRod: { standard: "Stabiliser rod", simple: "Rod" },
} as LabelMap;

export const CLUSTERS = {
  cabinet: { id: "cabinet", label: "Cabinet" },
  drawerA: { id: "drawerA", label: "Top drawer" },
  drawerB: { id: "drawerB", label: "Bottom drawer" },
} as Record<ClusterId, ClusterDef>;

const pid = asPartId;

// A drawer's Γ + build overlay (shared by A and B; `s` = "1" | "2").
const drawer = (s: string): StructureOverlay => ({
  // box: the SIDES start (parallel islands). Each keyhole bolt (128918) is
  // SCREWED fully into a side panel's front edge; the FRONT then parks a bit
  // above its seat and is PRESSED DOWN so its keyholes lock over the bolt
  // heads (press join + placeDir — the composite keyhole pattern). The BOTTOM
  // slides into grooves in the front + both sides; the BACK closes over it and
  // is SCREWED to the sides (screw110519, secured after the box is up).
  [`drawerFront_${s}`]: {
    directJoins: [pid(`drawerSideL_${s}`), pid(`drawerSideR_${s}`)],
    placeDir: [0, -1, 0] as const,
  },
  [`drawerSideL_${s}`]: { seed: true, islandRoot: true },
  [`drawerSideR_${s}`]: { seed: true, islandRoot: true },
  [`drawerBottom_${s}`]: {
    slideJoins: [pid(`drawerSideL_${s}`), pid(`drawerSideR_${s}`), pid(`drawerFront_${s}`)],
  },
  [`drawerBack_${s}`]: { unstable: true },
  // keyhole bolts: overridden to "secured" so they never preload-lock the
  // cluster (that would block prepping the second side in parallel); their
  // real one-sided physics live in the bolt128918 FASTENER_RULE overrides
  [`bolt128918_${s === "1" ? "1" : "5"}`]: { fastenerKind: "secured" },
  [`bolt128918_${s === "1" ? "2" : "6"}`]: { fastenerKind: "secured" },
  [`bolt128918_${s === "1" ? "3" : "7"}`]: { fastenerKind: "secured" },
  [`bolt128918_${s === "1" ? "4" : "8"}`]: { fastenerKind: "secured" },
  // runner catches — screwed to the drawer FRONT (screw109041, manual step 21);
  // the box later CLIPS onto the cabinet's runners via these at combine time
  [`runnerBracketL_${s}`]: {}, // reachable via screw109041 liaison to the front
  [`runnerBracketR_${s}`]: {},
} as StructureOverlay);

/** The cabinet-side runner mechanism for one drawer level (`lvl` = "A" | "B",
 *  matching runnerFix?A/?B; part index `s` = "1" | "2"). The telescoping slide
 *  (fixed + middle + inner member) and its rail housings/latches/clips live in
 *  the CABINET (manual steps 1-3 build them onto the flat sides; step 22 pulls
 *  the middles out; the drawer box only clips on at combine, step 25). */
const cabinetRunners = (s: string): StructureOverlay => ({
  // Each soft-close runner is a telescoping slide split into FOUR rigid bodies
  // so the push-to-open beat can travel them at 0 / ½ / 1 / 1:
  //   FRAME  (fixed cabinet rail 150592_1 + rail housing 145569) bolts to the
  //          side via screw100349 — never moves.
  //   MIDDLE (150592_2) rides the frame at HALF the drawer's travel.
  //   CARRIAGE (inner member 150592_3 + latch 147221) rides the middle and
  //          travels the FULL distance with the drawer.
  //   CLIP   (147222) SLIDES onto the carriage by the user as its own step
  //          (manual) and travels with it.
  // seed: the slide may be dragged in BEFORE its side panel (then screwed to
  // it). NOT islandRoot: the runner is liaised to one side panel, so it can
  // never be its own island — the PANEL is the root and the runner parks with
  // it (flagging it here would park the OTHER side's active island instead:
  // dead state when both panels are down before the runners go on).
  [`runnerFrameL_${s}`]: { seed: true, unstable: true },
  [`runnerFrameR_${s}`]: { seed: true, unstable: true },
  [`runnerMiddleL_${s}`]: { directJoins: [pid(`runnerFrameL_${s}`)] },
  [`runnerMiddleR_${s}`]: { directJoins: [pid(`runnerFrameR_${s}`)] },
  [`runnerCarriageL_${s}`]: { directJoins: [pid(`runnerMiddleL_${s}`)] },
  [`runnerCarriageR_${s}`]: { directJoins: [pid(`runnerMiddleR_${s}`)] },
  [`runnerClipL_${s}`]: { slideJoins: [pid(`runnerCarriageL_${s}`)] },
  [`runnerClipR_${s}`]: { slideJoins: [pid(`runnerCarriageR_${s}`)] },
  // the stabiliser rod is carried onto the two FIXED frames by its own two
  // coupling pins (dowel145572) — NOT a direct press-join to the carriages.
  // No directJoins: the rod's only Γ edges are the two rod↔frame joints the
  // secured dowels create (a 2-attached fastener makes the edge regardless of
  // kind), so the rod drops onto both frames in a single move and never binds
  // the moving carriages (manual steps 23-24).
  [`stabilizerRod_${s}`]: {
    placeDir: [0, -1, 0] as const,
  },
  // rod↔frame coupling pins — kept "secured" (NOT native pin connectors): a
  // real preload connector locks the whole cluster the moment ONE endpoint is
  // placed, and the frame lands in stage 1 while the rod drops in stage 3, so
  // it would deadlock. "secured" gives the rod↔frame edge with no lock; the
  // FASTENER_RULES override then hand-authors the preload sequence (pins into
  // the rod first, tap home after it drops) via insert/tighten gates.
  [`dowel145572_${s === "1" ? "1" : "3"}`]: { fastenerKind: "secured" },
  [`dowel145572_${s === "1" ? "2" : "4"}`]: { fastenerKind: "secured" },
} as StructureOverlay);

export const STRUCTURE: StructureOverlay = {
  // ── cabinet (manual AA-2345060 steps 1-9): rails are screwed onto the flat
  // side panels FIRST (steps 2-3, enforced by requires on the horizontals);
  // sides + either horizontal form the box; the BACK then SLIDES into the side
  // grooves (step 6 — slide frontier needs both sides; requiresAny needs one
  // horizontal); the remaining horizontal closes over it (gate, step 7); cams +
  // pins only after the back is seated (step 9 — cams overridden to "secured"
  // so they never preload-lock the box like a LACK bolt would).
  sidePanelL: { seed: true, islandRoot: true, directJoins: [pid("topPanel"), pid("bottomPanel")] },
  sidePanelR: { seed: true, islandRoot: true, directJoins: [pid("topPanel"), pid("bottomPanel")] },
  topPanel: {},
  bottomPanel: {},
  backPanel: { slideJoins: [pid("sidePanelL"), pid("sidePanelR")] },
  // back-panel cam locks secure the slide joint AFTER the back is in — not a
  // preloaded connector joint (kind override: cam → secured; motion stays
  // "turn" from hardware.ts)
  cam139434_1: { fastenerKind: "secured" },
  cam139434_2: { fastenerKind: "secured" },
  cam139434_3: { fastenerKind: "secured" },
  cam139434_4: { fastenerKind: "secured" },
  cam139434_5: { fastenerKind: "secured" },
  cam139434_6: { fastenerKind: "secured" },
  cam139434_7: { fastenerKind: "secured" },
  cam139434_8: { fastenerKind: "secured" },
  // suspension fittings (top-rear corners): bracket presses the top, then cover/cap/knob
  suspBracket_1: { directJoins: [pid("topPanel")] },
  suspBracket_2: { directJoins: [pid("topPanel")] },
  suspCover_1: { directJoins: [pid("suspBracket_1")] },
  suspCover_2: { directJoins: [pid("suspBracket_2")] },
  suspCap_1: { directJoins: [pid("suspCover_1")] },
  suspCap_2: { directJoins: [pid("suspCover_2")] },
  suspKnob_1: { directJoins: [pid("suspBracket_1")] },
  suspKnob_2: { directJoins: [pid("suspBracket_2")] },
  ...cabinetRunners("1"),
  ...cabinetRunners("2"),
  ...drawer("1"),
  ...drawer("2"),
} as StructureOverlay;

/** Both horizontals can only join once every runner rail is screwed on
 *  (manual steps 2-3 happen with the panels flat, before the box). */
const RUNNER_SCREWS_TIGHT = () => tightenActionIds(PARTS, asGroupId("screw100349"));

export const FASTENER_RULES: FastenerRule[] = [
  // drawer sub-assemblies (stage 1)
  {
    // keyhole bolt: screwed fully into the SIDE panel only (attached[1]) —
    // never the front. The press-down lock is the FRONT's placement (press
    // join + placeDir in STRUCTURE), not a bolt action.
    group: asGroupId("bolt128918"),
    stage: 1,
    requires: (p) => [placeId(p.attached![1])],
  },
  { group: asGroupId("screw110519"), stage: 1 }, // back screws (back → sides)
  { group: asGroupId("screw109041"), stage: 1 },
  // cabinet: rails onto flat sides first (stage 1); back cams + pins only
  // after the back panel is seated in its groove (stage 3, manual step 9);
  // stabiliser-rod pins couple the rod to the rails after the rod clicks on
  { group: asGroupId("screw100349"), stage: 1 },
  {
    // rod↔frame coupling pins, PRELOADED INTO THE ROD: insert (push the pin
    // into the rod) needs only the frame present as the drop target — NOT the
    // rod — so both pins seat before the rod's placePart (which requires these
    // inserts). tighten (tap fully home) waits until the rod has dropped on.
    group: asGroupId("dowel145572"),
    stage: 3,
    requires: (p) => [placeId(p.attached![1])], // frame placed (drop target exists)
    tightenRequires: (p) => [placeId(p.attached![0])], // rod dropped on
  },
  { group: asGroupId("cam139434"), stage: 3 },
  {
    group: asGroupId("dowel139435"),
    stage: 3,
    requires: (p) => [...(p.attached ?? []).map(placeId), placeId(asPartId("backPanel"))],
  },
];

/** Gates 1-2: either horizontal may go on first; whichever comes SECOND closes
 *  the back panel's groove, so it must wait for the back (manual steps 6-7). */
/** Drawer-side gate: the OTHER side, once placed, must have at least one keyhole bolt in (be a real island) before this side may land — otherwise the lone other side would degrade back to the tray (symmetric: either side may start). */
const otherSidePrepped = (otherPid: string): Gate => {
  return (done) =>
    !done.has(`place_${otherPid}`) ||
    sideBoltInserts(otherPid).some((id) => done.has(id));
};

export const GATES = {
  topPanelClosesAfterBack: (done: ReadonlySet<string>) =>
    !done.has("place_bottomPanel") || done.has("place_backPanel"),
  bottomPanelClosesAfterBack: (done: ReadonlySet<string>) =>
    !done.has("place_topPanel") || done.has("place_backPanel"),
  drawerSideLWaits_1: otherSidePrepped("drawerSideR_1"),
  drawerSideRWaits_1: otherSidePrepped("drawerSideL_1"),
  drawerSideLWaits_2: otherSidePrepped("drawerSideR_2"),
  drawerSideRWaits_2: otherSidePrepped("drawerSideL_2"),
} as Record<string, Gate>;

const place = (partId: string, stage: number) =>
  action({ type: "placePart", stage, partId, requires: [] });

/** The four fully-screwed keyhole bolts of drawer `s` (A: 1-4, B: 5-8). */
const drawerBoltsTight = (s: string): string[] =>
  (s === "1" ? [1, 2, 3, 4] : [5, 6, 7, 8]).map((n) => `tighten_bolt128918_${n}`);

/** Insert ids of the keyhole bolts driven into drawer side `sidePid` — one completed insert makes that side a REAL island (a realized connection), so the OTHER side may then be placed without displacing it. */
const sideBoltInserts = (sidePid: string): string[] =>
  Object.values(PARTS)
    .filter(
      (p) =>
        p.group === asGroupId("bolt128918") &&
        (p.attached as readonly string[] | undefined)?.includes(sidePid),
    )
    .map((p) => `insert_${p.partId}`);

const drawerActions = (s: string): DraftAction[] =>
  [
    "drawerSideL", "drawerSideR", "drawerFront", "drawerBottom", "drawerBack",
    "runnerBracketL", "runnerBracketR",
  ].map((g) =>
    action({
      type: "placePart",
      stage: 1,
      partId: `${g}_${s}`,
      // second side waits until the first has a bolt in (a realized connection) — else the lone first side would degrade back to the tray the moment the second lands (symmetric; either side may start)
      gate:
        g === "drawerSideL" ? `drawerSideLWaits_${s}`
        : g === "drawerSideR" ? `drawerSideRWaits_${s}`
        : undefined,
      requires:
        // the front presses down over ALL FOUR keyhole-bolt heads — both
        // sides' bolts must be fully screwed in before it can go on
        g === "drawerFront" ? drawerBoltsTight(s)
        // the back closes over the bottom (trap) — it can't go on until the
        // bottom has slid into the grooves
        : g === "drawerBack" ? [`place_drawerBottom_${s}`]
        // the rear catches are screwed onto the finished box (manual step 21)
        : g.startsWith("runnerBracket") ? [`place_drawerBack_${s}`]
        : [],
    }),
  );

/** One SIDE's runner prep, both drawer levels: the panel lies flat and gets its rails, slides and clips (manual steps 1-3). Side-coherent on purpose — every placement connects to the panel already in the scene, so the strict order never stands two bare panels side by side (a lone panel would displace under the connection rule). */
const cabinetRunnerSide = (side: "L" | "R"): DraftAction[] => [
  place(`runnerFrame${side}_1`, 1),
  place(`runnerFrame${side}_2`, 1),
  place(`runnerMiddle${side}_1`, 1),
  place(`runnerMiddle${side}_2`, 1),
  place(`runnerCarriage${side}_1`, 1),
  place(`runnerCarriage${side}_2`, 1),
  place(`runnerClip${side}_1`, 1),
  place(`runnerClip${side}_2`, 1),
];

// the rod is a bridge PRE-FITTED with its two coupling pins: it can't drop
// onto the frames until both dowels are pushed into it. Requiring the pin
// INSERTS here makes the strict sequence "preload pin, preload pin, drop rod
// (single move)"; the pins then tap home (tightens gated on the rod).
const stabilizerRodAction = (s: string): DraftAction =>
  action({
    type: "placePart", stage: 3, partId: `stabilizerRod_${s}`,
    requires: [
      "place_backPanel",
      `insert_dowel145572_${s === "1" ? "1" : "3"}`,
      `insert_dowel145572_${s === "1" ? "2" : "4"}`,
    ],
  });

export const AUTHORED_ACTIONS: DraftAction[] = [
  // ── cabinet stage 1 (manual 1-3): one side flat + its runners, THEN the
  // other side + its runners — placing the second panel cards the finished
  // first side automatically (it starts new disconnected work) ──
  action({ type: "placePart", stage: 1, partId: "sidePanelL", requires: [] }),
  ...cabinetRunnerSide("L"),
  action({ type: "placePart", stage: 1, partId: "sidePanelR", requires: [] }),
  ...cabinetRunnerSide("R"),
  stabilizerRodAction("1"),
  stabilizerRodAction("2"),
  // ── cabinet stage 2: the box (manual 4-7) — either horizontal first, back
  // slides in after 2 sides + 1 horizontal, the other horizontal closes it ──
  action({ type: "placePart", stage: 2, partId: "topPanel", requires: RUNNER_SCREWS_TIGHT(), gate: "topPanelClosesAfterBack" }),
  action({ type: "placePart", stage: 2, partId: "bottomPanel", requires: RUNNER_SCREWS_TIGHT(), gate: "bottomPanelClosesAfterBack" }),
  action({ type: "placePart", stage: 2, partId: "backPanel", requires: [], requiresAny: ["place_topPanel", "place_bottomPanel"] }),
  // ── cabinet stage 3: cams+pins (rules), suspension fittings, stand upright ──
  place("suspBracket_1", 3),
  place("suspBracket_2", 3),
  place("suspKnob_1", 3),
  place("suspKnob_2", 3),
  place("suspCover_1", 3),
  place("suspCover_2", 3),
  place("suspCap_1", 3),
  place("suspCap_2", 3),
  action({ actionId: "reorient_cabinet", type: "reorient", stage: 3, cluster: "cabinet", requires: [] }),

  // ── drawer sub-assemblies ──
  ...drawerActions("1"),
  ...drawerActions("2"),

  // ── combine: mount cabinet, then slide each drawer in; finish ──
  action({ actionId: "combine_drawerA", type: "combineClusters", stage: 4, cluster: "drawerA", requires: ["reorient_cabinet"] }),
  action({ actionId: "combine_drawerB", type: "combineClusters", stage: 4, cluster: "drawerB", requires: ["reorient_cabinet"] }),
  action({ actionId: "finishing_checks", type: "reorient", stage: 4, requires: ["combine_drawerA", "combine_drawerB"] }),
];

export const BEATS = {
  combine_drawerA: {
    text: "Line the top drawer up with the upper runners and slide it in until it clicks.",
    simpleText: "Slide the top drawer in.",
  },
  combine_drawerB: {
    text: "Slide the bottom drawer onto the lower runners the same way.",
    simpleText: "Slide the bottom drawer in.",
  },
  finishing_checks: {
    text: "Open and close both drawers to check they run smoothly, then secure the cabinet to the wall.",
    simpleText: "Check both drawers slide, and fix it to the wall.",
  },
} as InstructionSet;

/** Push-to-open finishing beat: the telescoping bodies of drawer level `s` and
 *  their travel ratios. The whole drawer cluster + the runner carriage & clip
 *  ride the FULL travel; the middle rail telescopes at HALF; the frame (and
 *  everything else) stays put. Axis −X = out the cabinet front (the runners'
 *  clip end sits at the −X extreme of the slide in the baked pose). */
const pushLevel = (s: string): PushOpenGroup[] => {
  const ids = Object.keys(PARTS) as PartId[];
  const cluster = s === "1" ? "drawerA" : "drawerB";
  const fullRiders = new Set([
    `runnerCarriageL_${s}`, `runnerCarriageR_${s}`,
    `runnerClipL_${s}`, `runnerClipR_${s}`,
  ]);
  return [
    {
      level: s,
      ratio: 1,
      parts: ids.filter(
        (id) => PARTS[id].cluster === cluster || fullRiders.has(id),
      ),
    },
    {
      level: s,
      ratio: 0.5,
      parts: ids.filter(
        (id) => id === `runnerMiddleL_${s}` || id === `runnerMiddleR_${s}`,
      ),
    },
  ];
};

export const PUSH_OPEN: PushOpenSpec = {
  axis: [-1, 0, 0],
  distance: 0.16,
  beatActionId: "finishing_checks",
  groups: [...pushLevel("1"), ...pushLevel("2")],
};
