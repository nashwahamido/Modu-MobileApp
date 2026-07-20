import {
  action,
  FastenerRule,
} from "@/src/game/core/composition/composeActions";
import { StructureOverlay } from "@/src/game/core/model/liaisons";
import { asComponentId, asGroupId, asPartId, placeId } from "@/src/game/core/ids";
import {
  ClusterDef,
  ClusterId,
  ComponentDef,
  ComponentMap,
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
  runnerClip: { standard: "Slide clip", simple: "Clip" }, // one interchangeable group ×4, native in the GLB node names
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
const cmp = asComponentId;

/** The four telescoping drawer slides — each a frame + middle rail + carriage the player handles as ONE object. The clip is NOT here: it slides onto the carriage as its own manual step. Bodies stay distinct so the push-open beat can travel them at 0 / ½ / 1. */
const slide = (side: "L" | "R", s: string): ComponentDef => ({
  id: cmp(`runnerSlide${side}_${s}`),
  label: { standard: `${side === "L" ? "Left" : "Right"} drawer slide`, simple: "Slide" },
  bodies: [pid(`runnerFrame${side}_${s}`), pid(`runnerMiddle${side}_${s}`), pid(`runnerCarriage${side}_${s}`)],
  lead: pid(`runnerFrame${side}_${s}`),
});

export const COMPONENTS: ComponentMap = Object.fromEntries(
  (["L", "R"] as const).flatMap((side) =>
    (["1", "2"] as const).map((s) => {
      const c = slide(side, s);
      return [c.id, c] as const;
    }),
  ),
) as ComponentMap;

// A drawer's Γ + build overlay (shared by A and B; `s` = "1" | "2").
const drawer = (s: string): StructureOverlay => ({
  // box: LEFT side is the seed and always goes down first; each keyhole bolt (128918) is SCREWED fully into the left side panel's front edge, then the FRONT parks a bit above its seat and is PRESSED DOWN so its keyholes lock over the LEFT bolt heads (press join + placeDir — the composite keyhole pattern); the RIGHT side then becomes Γ-reachable through the front's own bolt liaisons (128918_1/2, a 2-attached fastener edge) and its two bolts screw in via their existing "side placed" rule.
  // the BOTTOM then slides into grooves in the front + both sides; the BACK closes over it and is SCREWED to the sides (screw110519, secured after the box is up).
  [`drawerFront_${s}`]: {
    directJoins: [pid(`drawerSideL_${s}`), pid(`drawerSideR_${s}`)],
    placeDir: [0, -1, 0] as const,
  },
  // placeDir on every parked mover below: the centroid heuristic in travelAxis() guessed visibly wrong axes on-device — a groove's axis isn't derivable from poses, so it must be authored. World frame is documented once on STRUCTURE; the short version is FRONT = +X.
  [`drawerSideL_${s}`]: { seed: true },
  [`drawerSideR_${s}`]: { placeDir: [0, 0, 1] as const }, // not a seed — reachable via the front's bolt liaisons once the front is down; arrives from the right, travelling inward (+Z)
  [`drawerBottom_${s}`]: {
    slideJoins: [pid(`drawerSideL_${s}`), pid(`drawerSideR_${s}`), pid(`drawerFront_${s}`)],
    placeDir: [1, 0, 0] as const, // enters through the still-open back (drawerBack is placed after it) and glides FORWARD along the grooves — forward is +X, so it parks behind its seat at x≈-0.07, level with the open back edge
  },
  [`drawerBack_${s}`]: { unstable: true },
  // keyhole bolts: overridden to "secured" so they never preload-lock the cluster the moment one endpoint lands (a real connector would rigidly weld the front to a side before the front's own placement geometry runs); their real one-sided physics live in the bolt128918 FASTENER_RULE overrides
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
  // neither frame is a seed — each becomes Γ-reachable the instant its own side panel is down, through the screw100349 liaison between them (a 2-attached fastener edge), then gets screwed on (manual steps 2-3). placeDir: the frame lands flat against its panel's INNER face, travelling outward along the face normal (+Z toward the left panel, −Z toward the right).
  [`runnerFrameL_${s}`]: { unstable: true, placeDir: [0, 0, 1] as const },
  [`runnerFrameR_${s}`]: { unstable: true, placeDir: [0, 0, -1] as const },
  // middle + carriage are non-lead bodies of the slide component (cascade-placed with the frame), but their directJoins STAY: they are these bodies' only Γ edges (no hardware attachments in parts.gen), they never gate the lead (directJoins is an OR-frontier on the member itself), and the clip's slide frontier needs the carriage connected.
  [`runnerMiddleL_${s}`]: { directJoins: [pid(`runnerFrameL_${s}`)] },
  [`runnerMiddleR_${s}`]: { directJoins: [pid(`runnerFrameR_${s}`)] },
  [`runnerCarriageL_${s}`]: { directJoins: [pid(`runnerMiddleL_${s}`)] },
  [`runnerCarriageR_${s}`]: { directJoins: [pid(`runnerMiddleR_${s}`)] },
  // clip seat is the −X (REAR) extreme of the slide: every clip sits at x=-0.131, behind all four carriages (x=-0.010..+0.039). The user approaches the exposed rear tip from outside the cabinet and pushes the clip FORWARD (+X) onto it, so it parks at x≈-0.161 — clear of the rail rather than buried inside it. The four clips are natively ONE interchangeable group in the GLB (renamed runnerClip_1..4: 1/2 ride carriageL levels 1/2, 3/4 ride carriageR — one tray card ×4, each socket renders its own mirrored mesh), and a 3cm parkBackoff: the 10cm slide default parks the tiny clip back inside the runner assembly.
  [`runnerClip_${s}`]: { slideJoins: [pid(`runnerCarriageL_${s}`)], placeDir: [1, 0, 0] as const, parkBackoff: 0.03 },
  [`runnerClip_${s === "1" ? "3" : "4"}`]: { slideJoins: [pid(`runnerCarriageR_${s}`)], placeDir: [1, 0, 0] as const, parkBackoff: 0.03 },
  // the stabiliser rod is a STAGED sub-assembly (manual steps 23-24): the player takes it out in front of the cabinet, presses a coupling dowel into each end there, carries the finished bridge in between the two FIXED frames, then rotates both dowels home. stageOffset is the whole switch — the stage beat, the dowels' insert-at-staging / tighten-after-seating order and the shared-offset carry are all derived from it (core/model/staging.ts). No directJoins: the rod's only Γ edges are the two rod↔frame joints its dowels create, so it never binds the moving carriages.
  [`stabilizerRod_${s}`]: {
    placeDir: [0, -1, 0] as const,
    // staged out in front (+X, see the world frame on STRUCTURE): 0.35m from the rod's seat at x=+0.007 puts it ~0.18m clear of the front face. A −X stageOffset, authored back when this file claimed front = −X, staged the rod behind the back panel where the player could not reach it.
    stageOffset: [0.35, 0.05, 0] as const,
  },
} as StructureOverlay);

export const STRUCTURE: StructureOverlay = {
  // ── cabinet (manual AA-2345060 steps 1-9), linear build: LEFT side is screwed onto its rails FIRST (steps 2-3, enforced by requires on topPanel), then TOP closes onto the left side, then RIGHT side + its rails go on, then the BACK SLIDES into both sides' grooves (step 6 — slide frontier needs both sides; requiresAny needs one horizontal, already satisfied by topPanel), then BOTTOM closes last over the back (gate, step 7); cams + pins only after the back is seated (step 9 — cams overridden to "secured" so they never preload-lock the box like a LACK bolt would).
  // WORLD FRAME, measured from parts.gen.ts — trust these numbers, not intuition:
  //   +X = FRONT   (drawerFront x=+0.176, backPanel x=-0.149; depth spans X ±0.17)
  //   +Y = UP      (topPanel y=+0.167, bottomPanel y=-0.167)
  //   +Z = LEFT, −Z = RIGHT  (sidePanelL z=+0.342, sidePanelR z=-0.342)
  // matching the real 70(w)×35(h)×35(d)cm EKET. An earlier revision of this comment said front = −X; every placeDir, stageOffset and pushOpen axis authored against that belief was sign-flipped along X and has been corrected. If you are adding a part, measure it rather than copying a neighbour's sign.
  // placeDir is the direction the part TRAVELS as it seats (engagement.ts travelAxis/parkInfo — the park offset is its negation), NOT where the part parks. topPanel [0,-1,0] = closes downward.
  // placeDir on every parked mover: authored travel axes — the centroid heuristic guessed wrong on-device for nearly every EKET part.
  sidePanelL: { seed: true, directJoins: [pid("topPanel"), pid("bottomPanel")], placeDir: [0, 0, -1] as const },
  sidePanelR: { directJoins: [pid("topPanel"), pid("bottomPanel")], placeDir: [0, 0, 1] as const }, // not a seed — reachable via the topPanel edge once topPanel is down; arrives from the right, travelling inward
  topPanel: { placeDir: [0, -1, 0] as const }, // closes down onto the standing sides' top edges
  bottomPanel: { placeDir: [0, 1, 0] as const }, // closes up onto the sides' bottom edges, capping the back's groove
  backPanel: { slideJoins: [pid("sidePanelL"), pid("sidePanelR")], placeDir: [0, -1, 0] as const }, // glides DOWN the side grooves from the open top
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
  // suspension fittings (top-rear corners). EVERY placeDir in this block is an UNVERIFIED placeholder: a uniform downward default chosen because no one has watched these fit on a device. Do not read the uniformity as agreement — some of these are expected to be wrong. Revise them one at a time against the real thing.
  // Reference for whoever revises them, NOT a recommendation: measured X positions stack the corner rear-to-front as knob (-0.170) -> bracket (-0.160) -> cover (-0.146) -> cap (-0.144), and the back panel sits at -0.149. That geometry implies cover and cap seat REARWARD onto the bracket from inside the cabinet, i.e. [-1,0,0]. It is a derivation, not an observation, and a derivation exactly like it produced the front=-X error that sign-flipped four axes across this file.
  // UNVERIFIED placeholder — needs on-device eyeball:
  suspBracket_1: { directJoins: [pid("topPanel")], placeDir: [0, -1, 0] as const },
  // UNVERIFIED placeholder — needs on-device eyeball:
  suspBracket_2: { directJoins: [pid("topPanel")], placeDir: [0, -1, 0] as const },
  // UNVERIFIED placeholder — needs on-device eyeball:
  suspCover_1: { directJoins: [pid("suspBracket_1")], placeDir: [0, -1, 0] as const },
  // UNVERIFIED placeholder — needs on-device eyeball:
  suspCover_2: { directJoins: [pid("suspBracket_2")], placeDir: [0, -1, 0] as const },
  // UNVERIFIED placeholder — needs on-device eyeball:
  suspCap_1: { directJoins: [pid("suspCover_1")], placeDir: [0, -1, 0] as const },
  // UNVERIFIED placeholder — needs on-device eyeball:
  suspCap_2: { directJoins: [pid("suspCover_2")], placeDir: [0, -1, 0] as const },
  // the knob indices are CROSSED relative to every other suspension part: suspKnob_1 sits at z=+0.308 (LEFT, alongside suspBracket_2) and suspKnob_2 at z=-0.308 (RIGHT, alongside suspBracket_1), whereas cover_n/cap_n share their bracket_n's side. The directJoins follow the GEOMETRY, not the index — that pairing is measured and is not part of the unverified set below.
  // UNVERIFIED placeholder — needs on-device eyeball:
  suspKnob_1: { directJoins: [pid("suspBracket_2")], placeDir: [0, -1, 0] as const },
  // UNVERIFIED placeholder — needs on-device eyeball:
  suspKnob_2: { directJoins: [pid("suspBracket_1")], placeDir: [0, -1, 0] as const },
  ...cabinetRunners("1"),
  ...cabinetRunners("2"),
  ...drawer("1"),
  ...drawer("2"),
} as StructureOverlay;

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
  // rod↔frame coupling dowels: no overrides needed — staging derives "press into the rod once it is out, rotate home once it is seated"
  { group: asGroupId("dowel145572"), stage: 3 },
  { group: asGroupId("cam139434"), stage: 3 },
  {
    group: asGroupId("dowel139435"),
    stage: 3,
    requires: (p) => [...(p.attached ?? []).map(placeId), placeId(asPartId("backPanel"))],
  },
];

/** Gate: whichever horizontal closes SECOND over the back panel's groove must wait for the back (manual steps 6-7) — under the linear build order topPanel always goes first (gated trivially true) and bottomPanel always goes second (gated on the back), but both gates stay symmetric in case the order ever changes. */
export const GATES = {
  topPanelClosesAfterBack: (done: ReadonlySet<string>) =>
    !done.has("place_bottomPanel") || done.has("place_backPanel"),
  bottomPanelClosesAfterBack: (done: ReadonlySet<string>) =>
    !done.has("place_topPanel") || done.has("place_backPanel"),
} as Record<string, Gate>;

const place = (partId: string, stage: number) =>
  action({ type: "placePart", stage, partId, requires: [] });

/** Tighten ids of the keyhole bolts driven into drawer side `sidePid` — the front presses onto fully-driven bolt heads, so drawerFront's requires wait on these rather than on `place_drawerSideL_${s}`, which only tells the engine the side geometry is down, not that its bolts are screwed home. */
const sideBoltTightens = (sidePid: string): string[] =>
  Object.values(PARTS)
    .filter(
      (p) =>
        p.group === asGroupId("bolt128918") &&
        (p.attached as readonly string[] | undefined)?.includes(sidePid),
    )
    .map((p) => `tighten_${p.partId}`);

const drawerActions = (s: string): DraftAction[] =>
  [
    "drawerSideL", "drawerFront", "drawerSideR", "drawerBottom", "drawerBack",
    "runnerBracketL", "runnerBracketR",
  ].map((g) =>
    action({
      type: "placePart",
      stage: 1,
      partId: `${g}_${s}`,
      requires:
        // the front presses down over the LEFT side's two keyhole-bolt heads only — the left side is the seed and always goes down first, so those bolts are already screwed in by the time the front lands
        g === "drawerFront" ? sideBoltTightens(`drawerSideL_${s}`)
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
  place(`runnerClip_${side === "L" ? "1" : "3"}`, 1),
  place(`runnerClip_${side === "L" ? "2" : "4"}`, 1),
];

// withStaging() splits this into "take the rod out" + "fit the assembled bridge in", and moves the back-panel prereq onto the take-out beat; the dowel inserts are wired in between automatically.
const stabilizerRodAction = (s: string): DraftAction =>
  action({
    type: "placePart", stage: 3, partId: `stabilizerRod_${s}`,
    requires: ["place_backPanel"],
  });

export const AUTHORED_ACTIONS: DraftAction[] = [
  // ── cabinet stage 1 (manual steps 1-5): LEFT panel → LEFT runners → TOP panel → RIGHT panel → RIGHT runners; all must finish before stage 2 ──
  action({ type: "placePart", stage: 1, partId: "sidePanelL", requires: [] }),
  ...cabinetRunnerSide("L"),
  // no requires on the horizontals: the manual's "rails before the box" is choreography, not physics — only the liaison frontier (a placed side panel) and the groove-trap gates order them. Strict mode still follows the authored array order regardless.
  action({ type: "placePart", stage: 1, partId: "topPanel", requires: [], gate: "topPanelClosesAfterBack" }),
  action({ type: "placePart", stage: 1, partId: "sidePanelR", requires: [] }),
  ...cabinetRunnerSide("R"),
  // ── cabinet stage 2 (manual steps 6-7): BACK slides into both sides' grooves, then BOTTOM closes over it (gated on the back) ──
  action({ type: "placePart", stage: 2, partId: "backPanel", requires: [], requiresAny: ["place_topPanel", "place_bottomPanel"] }),
  action({ type: "placePart", stage: 2, partId: "bottomPanel", requires: [], gate: "bottomPanelClosesAfterBack" }),
  // ── cabinet stage 3: stabiliser rods (need the back seated + both sides' frames screwed), cams+pins (rules), suspension fittings, stand upright ──
  stabilizerRodAction("1"),
  stabilizerRodAction("2"),
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
 *  everything else) stays put. Axis +X = out the cabinet front (see the world
 *  frame on STRUCTURE: drawerFront is the +X extreme at x=+0.176). The clip end
 *  of the runners sits at the −X = REAR extreme, which is the opposite end. */
const pushLevel = (s: string): PushOpenGroup[] => {
  const ids = Object.keys(PARTS) as PartId[];
  const cluster = s === "1" ? "drawerA" : "drawerB";
  const fullRiders = new Set([
    `runnerCarriageL_${s}`, `runnerCarriageR_${s}`,
    `runnerClip_${s}`, `runnerClip_${s === "1" ? "3" : "4"}`,
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
  axis: [1, 0, 0], // out the FRONT — pushOpen.ts offsets each group by axis·distance·ratio, so a −X axis drove the drawers backward through the back panel
  distance: 0.16,
  beatActionId: "finishing_checks",
  groups: [...pushLevel("1"), ...pushLevel("2")],
};
