import {
  action,
  FastenerRule,
} from "@/src/game/core/composition/composeActions";
import { applyStructure, StructureOverlay } from "@/src/game/core/model/liaisons";
import { lowerFasteners, type FastenerEntry, type FastenerMap } from "@/src/game/core/model/fasteners";
import { asComponentId, asPartId } from "@/src/game/core/ids";
import {
  AssemblyMode,
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

// Lives here, not in meta.ts, because it is an AUTHORED input to composition like everything else in this file — the recipe serializer reads the authored module only (never meta.ts, whose thumbnail requires are asset handles), so a mode pinned in meta.ts alone is silently dropped from a recipe-composed build.
export const MODE: AssemblyMode = "guide";

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

// combine overlay: the cabinet is the seed and seats first; each drawer then slides onto it travelling −X (front is +X, so a drawer parks OUT the front and drives inward — the inverse of PUSH_OPEN's outward axis). parkBackoff matches PUSH_OPEN.distance so a drawer parks fully withdrawn rather than at the 10cm slide default. The runners do NOT move during the combine — the drawer slides in over static rails; the telescoping is saved for the test beats.
export const CLUSTERS = {
  cabinet: { id: "cabinet", label: "Cabinet", seed: true },
  drawerA: {
    id: "drawerA",
    label: "Top Drawer",
    slideJoins: ["cabinet"],
    placeDir: [-1, 0, 0] as const,
    parkBackoff: 0.16,
  },
  drawerB: {
    id: "drawerB",
    label: "Bottom Drawer",
    slideJoins: ["cabinet"],
    placeDir: [-1, 0, 0] as const,
    parkBackoff: 0.16,
  },
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
  // box: LEFT side is the seed and always goes down first; the keyhole bolts ship PRE-ATTACHED to the side panels (merged into the side mesh in the GLB, 2026-07-20), pointing FORWARD (+X) out of the sides' front edges into keyhole slots in the FRONT's back face — same two-phase hook press as the cabinet's side↔horizontal joints (user-confirmed on device). The slots run VERTICALLY with the narrow ends ABOVE the big ends, so the mover rule gives: FRONT (keyhole carrier) presses backward onto the bolts a bit ABOVE its seat, then shoves DOWN to hang — the picture-frame motion; a SIDE as mover (bolt carrier) presses forward into the placed front, then shoves UP. The RIGHT side is Γ-reachable via the FRONT's directJoins (below), which stands in for the bolt liaison the separate bolts used to provide. the BOTTOM then slides into grooves in the front + both sides; the BACK closes over it and is SCREWED to the sides (screw110519, secured after the box is up).
  [`drawerFront_${s}`]: {
    seed: true, // ALSO a seed (mirrors the cabinet horizontals): free mode may start the drawer from the front — the sides then hook onto IT with their bolt-carrier lockDir; as the strict-order mover after sideL it hangs as below
    directJoins: [pid(`drawerSideL_${s}`), pid(`drawerSideR_${s}`)],
    placeDir: [-1, 0, 0] as const,
    lockDir: [0, -1, 0] as const,
  },
  // placeDir on every parked mover below: the centroid heuristic in travelAxis() guessed visibly wrong axes on-device — a groove's axis isn't derivable from poses, so it must be authored. World frame is documented once on STRUCTURE; the short version is FRONT = +X.
  [`drawerSideL_${s}`]: { seed: true, directJoins: [pid(`drawerFront_${s}`)], placeDir: [1, 0, 0] as const, lockDir: [0, 1, 0] as const }, // its lockDir engages only when the front seeded first and this side becomes the mover (press forward, shove up — sideR's mirror); as the strict-order seed it just drops
  [`drawerSideR_${s}`]: { seed: true, directJoins: [pid(`drawerFront_${s}`)], placeDir: [1, 0, 0] as const, lockDir: [0, 1, 0] as const }, // not a seed — reachable via the front's directJoins once the front is down (replaces the front↔side bolt liaison that went away when bolt128918 merged into the sides); presses FORWARD so its bolts enter the front's keyholes, then shoves UP to lock (was: travelling inward +Z, wrong for a keyhole — the bolts enter along their own axis)
  [`drawerBottom_${s}`]: {
    slideJoins: [pid(`drawerSideL_${s}`), pid(`drawerSideR_${s}`), pid(`drawerFront_${s}`)],
    placeDir: [1, 0, 0] as const, // enters through the still-open back (drawerBack is placed after it) and glides FORWARD along the grooves — forward is +X, so it parks behind its seat at x≈-0.07, level with the open back edge
  },
  [`drawerBack_${s}`]: { unstable: true },
  // (bolt128918 overrides removed 2026-07-20 — the keyhole bolts are pre-attached geometry on the sides now, not parts, so nothing to override)
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
const cabinetRunners = (s: string): StructureOverlay =>
  ({
    [`runnerFrameL_${s}`]: { unstable: true, placeDir: [0, 0, 1] as const },
    [`runnerFrameR_${s}`]: { unstable: true, placeDir: [0, 0, -1] as const },
    [`runnerMiddleL_${s}`]: { directJoins: [pid(`runnerFrameL_${s}`)] },
    [`runnerMiddleR_${s}`]: { directJoins: [pid(`runnerFrameR_${s}`)] },
    [`runnerCarriageL_${s}`]: { directJoins: [pid(`runnerMiddleL_${s}`)] },
    [`runnerCarriageR_${s}`]: { directJoins: [pid(`runnerMiddleR_${s}`)] },
    [`runnerClip_${s}`]: {
      slideJoins: [pid(`runnerCarriageL_${s}`)],
      placeDir: [-1, 0, 0] as const,
      parkBackoff: 0.03,
    },
    [`runnerClip_${s === "1" ? "3" : "4"}`]: {
      slideJoins: [pid(`runnerCarriageR_${s}`)],
      placeDir: [-1, 0, 0] as const,
      parkBackoff: 0.03,
    },
    [`stabilizerRod_${s}`]: {
      placeDir: [0, -1, 0] as const,
      stageOffset: [0, 0.05, 0] as const,
    },
  }) as StructureOverlay;

const STRUCTURE_BASE: StructureOverlay = {
  sidePanelL: {
    seed: true,
    directJoins: [pid("topPanel"), pid("bottomPanel")],
    placeDir: [0, 0, -1] as const,
    lockDir: [-1, 0, 0] as const,
  }, // lockDir engages
  sidePanelR: {
    seed: true,
    directJoins: [pid("topPanel"), pid("bottomPanel")],
    placeDir: [0, 0, 1] as const,
    lockDir: [-1, 0, 0] as const,
  }, // ALSO a seed
  topPanel: {
    seed: true,
    placeDir: [0, 0, 1] as const,
    lockDir: [1, 0, 0] as const,
  },
  bottomPanel: {
    seed: true,
    placeDir: [0, 1, 0] as const,
    lockDir: [1, 0, 0] as const,
  },
  backPanel: {
    slideJoins: [pid("sidePanelL"), pid("sidePanelR")],
    placeDir: [0, 1, 0] as const,
  },
  cam139434_1: { engageDir: [0, 0, -1] as const }, // presses +Z into sidePanelL
  cam139434_2: { engageDir: [0, 1, 0] as const }, // presses down into bottomPanel
  cam139434_3: { engageDir: [0, 1, 0] as const },
  cam139434_4: { engageDir: [0, 1, 0] as const },
  cam139434_5: { engageDir: [0, 0, 1] as const }, // presses -Z into sidePanelR
  cam139434_6: { engageDir: [0, -1, 0] as const }, // presses up into topPanel
  cam139434_7: { engageDir: [0, -1, 0] as const },
  cam139434_8: { engageDir: [0, -1, 0] as const },
  dowel139435_1: { engageDir: [0, 1, 0] as const }, // presses down into bottomPanel
  dowel139435_2: { engageDir: [0, 1, 0] as const },
  dowel139435_3: { engageDir: [0, 0, 1] as const }, // presses -Z into sidePanelR
  dowel139435_4: { engageDir: [0, -1, 0] as const }, // presses up into topPanel
  dowel139435_5: { engageDir: [0, -1, 0] as const },
  dowel139435_6: { engageDir: [0, -1, 0] as const },
  dowel139435_7: { engageDir: [0, 0, -1] as const }, // presses +Z into sidePanelL
  dowel139435_8: { engageDir: [0, 1, 0] as const },
  dowel145572_1: { insertStage: 0.03, insertRetract: 0.04 },
  dowel145572_2: { insertStage: 0.03, insertRetract: 0.04 },
  dowel145572_3: { insertStage: 0.03, insertRetract: 0.04 },
  dowel145572_4: { insertStage: 0.03, insertRetract: 0.04 },
  suspBracket_1: {
    directJoins: [pid("sidePanelR")],
    placeDir: [0, 0, -1] as const,
    engageDir: [-1, 0, 0] as const,
    insertProud: 0,
    toolAnchor: [0, 0, 0.009873] as const,
  },
  suspBracket_2: {
    directJoins: [pid("sidePanelL")],
    placeDir: [0, 0, 1] as const,
    engageDir: [-1, 0, 0] as const,
    insertProud: 0,
    toolAnchor: [0, 0, -0.009873] as const,
  },
  suspCover_1: {
    directJoins: [pid("suspBracket_1")],
    dropOn: true,
    unstable: true,
  },
  suspCover_2: {
    directJoins: [pid("suspBracket_2")],
    dropOn: true,
    unstable: true,
  },
  suspCap_1: {
    type: "fastener",
    attached: [pid("suspCover_1"), pid("suspBracket_1")],
    engageDir: [1, 0, 0] as const,
  },
  suspCap_2: {
    type: "fastener",
    attached: [pid("suspCover_2"), pid("suspBracket_2")],
    engageDir: [1, 0, 0] as const,
  },
  suspKnob_1: {
    screwJoins: [pid("suspBracket_2")],
    placeDir: [1, 0, 0] as const,
  },
  suspKnob_2: {
    screwJoins: [pid("suspBracket_1")],
    placeDir: [1, 0, 0] as const,
  },
  ...cabinetRunners("1"),
  ...cabinetRunners("2"),
  ...drawer("1"),
  ...drawer("2"),
} as StructureOverlay;

export const FASTENERS: FastenerMap = {
  // drawer sub-assemblies (stage 1)
  // bolt128918 (front keyhole bolts) def removed 2026-07-20: the bolts are pre-attached to the sides in the GLB, so they are no longer parts — the front's press-down placement still locks the keyholes over the pre-installed heads
  screw110519: { home: "liaison", role: "securer", stage: 1 }, // back screws (back → sides)
  screw109041: { home: "liaison", role: "securer", stage: 1 },
  // cover cap — re-typed structural→fastener (see STRUCTURE): a securer on the cover↔bracket liaison; its insert waits for both and its tighten secures the unstable cover. Listed BEFORE screw100349 so its actions lead the moved cabinet fastener block: the voiceover script then keeps the cap's line at clip 22, where the RECORDED files have it (stepVoice pins).
  suspCap: { home: "liaison", role: "securer", stage: 3 },
  // cabinet: rails onto flat sides first (stage 1); back cams + pins only after the back panel is seated in its groove (stage 3, manual step 9); stabiliser-rod pins couple the rod to the rails after the rod clicks on
  screw100349: { home: "liaison", role: "securer", stage: 1 },
  // rod↔frame coupling dowels: preloaded connectors (the rod mounts by press once they are in); staging derives "press into the rod once it is out, rotate home once it is seated", the drop step is the 3-phase insertStage above
  dowel145572: { home: "liaison", role: "connector", preload: { completesOn: "insert", counterpartMountsBy: "press" }, lifecycle: ["drop", "insert", "tighten"], stage: 3 },
  cam139434: { home: "liaison", role: "securer", stage: 3 },
  // each pin rides its co-located cam (extraOf; instance pairing = same liaison + nearest, reproducing the old hand-written PIN_TO_CAM table): the pin crosses the cam's slots inside the panel, so a still-loose cam physically blocks it — lowering emits "own host place, remaining endpoint place (backPanel), then the cam's tighten" per instance
  dowel139435: { home: { extraOf: "cam139434" }, stage: 3 },
} as unknown as FastenerMap;

// Lower against the RE-TYPED parts — suspCap's fastener binding lives in the overlay, not the GLB.
const LOWERED = lowerFasteners(FASTENERS, applyStructure(PARTS, STRUCTURE_BASE));

// The lowered kind overrides land back on the overlay (cam→secured ×8), replacing the fields this file used to hand-write.
export const STRUCTURE: StructureOverlay = Object.entries(LOWERED.kindOverrides).reduce(
  (s, [id, kind]) => ({ ...s, [id]: { ...s[id as PartId], fastenerKind: kind } }),
  STRUCTURE_BASE,
);

export const FASTENER_RULES: FastenerRule[] = LOWERED.rules;

/** Gate: whichever horizontal closes SECOND over the back panel's groove must wait for the back (manual steps 6-7) — under the linear build order topPanel always goes first (gated trivially true) and bottomPanel always goes second (gated on the back), but both gates stay symmetric in case the order ever changes. */
export const GATES = {
  topPanelClosesAfterBack: (done: ReadonlySet<string>) =>
    !done.has("place_bottomPanel") || done.has("place_backPanel"),
  bottomPanelClosesAfterBack: (done: ReadonlySet<string>) =>
    !done.has("place_topPanel") || done.has("place_backPanel"),
  // manual order (user-verified): the stabiliser rods + their coupling dowels AND the rear cams + pins all finish BEFORE any suspension fitting — the rule-expanded cam/pin actions sit AFTER the authored susp places in the composed list, so without this gate strict mode offers the brackets first. Gating the two bracket places suffices: knobs/covers/caps are only Γ-reachable through them.
  suspAfterRearHardware: (done: ReadonlySet<string>) =>
    ["1", "2"].every((s) => done.has(`place_stabilizerRod_${s}`)) &&
    [1, 2, 3, 4].every((i) => done.has(`tighten_dowel145572_${i}`)) &&
    [1, 2, 3, 4, 5, 6, 7, 8].every(
      (i) => done.has(`tighten_cam139434_${i}`) && done.has(`tighten_dowel139435_${i}`),
    ),
} as Record<string, Gate>;

const place = (partId: string, stage: number) =>
  action({ type: "placePart", stage, partId, requires: [] });

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
        // the front carries NO requires: in the strict order it follows sideL anyway (list position) and hook-presses onto its bolts, but as a free-mode seed it may go down FIRST — a hard requires on sideL would dead-lock that start (the frontier rule "seed, or a placed press partner" is the real guard) the back closes over the bottom (trap) — it can't go on until the bottom has slid into the grooves
        g === "drawerBack" ? [`place_drawerBottom_${s}`]
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

// withStaging() splits this into "take the rod out" + "fit the assembled bridge in", and moves ALL these prereqs onto the take-out beat; the dowel inserts are wired in between automatically. BOTH frames are required, not just backPanel: the rod bridges the two frames' cradles, but its only Γ edges are the dowel liaisons — an OR-frontier that would let it seat against ONE placed frame with the other side floating in a free-order build. This must stay authored (not a generic both-endpoints rule): BEKVÄM's step legitimately presses onto ONE standing leg's dowel before the other leg exists.
const stabilizerRodAction = (s: string): DraftAction =>
  action({
    type: "placePart", stage: 3, partId: `stabilizerRod_${s}`,
    requires: ["place_backPanel", `place_runnerFrameL_${s}`, `place_runnerFrameR_${s}`],
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
  // ── cabinet stage 3: stabiliser rods (need the back seated + both sides' frames screwed), cams+pins (rules), suspension fittings ──
  stabilizerRodAction("1"),
  stabilizerRodAction("2"),
  // gated: no suspension work until the rods, their dowels, and the rear cams + pins are all done (see GATES.suspAfterRearHardware)
  action({ type: "placePart", stage: 3, partId: "suspBracket_1", requires: [], gate: "suspAfterRearHardware" }),
  action({ type: "placePart", stage: 3, partId: "suspBracket_2", requires: [], gate: "suspAfterRearHardware" }),
  // manual step 11: each bracket's back-facing screw is tightened with the screwdriver (drill stand-in) AFTER both brackets are tapped in — a stationary tighten on the bracket itself (no separate screw part in the GLB; the bracket has no engageDir, so the loose offset is zero and nothing moves)
  action({ type: "tightenFastener", stage: 3, partId: "suspBracket_1", tool: "screwdriver", requires: ["place_suspBracket_1"] }),
  action({ type: "tightenFastener", stage: 3, partId: "suspBracket_2", tool: "screwdriver", requires: ["place_suspBracket_2"] }),
  place("suspKnob_1", 3),
  place("suspKnob_2", 3),
  // the caps are FASTENERS now (securers, expanded from FASTENERS): a placed cover is unstable and its stability lock admits only its cap's insert+tighten until it's secured, so the play order stays cover → cap → cover → cap even though the cap actions sit in the fastener block
  place("suspCover_1", 3),
  place("suspCover_2", 3),
  // (cluster reorient beats cut 2026-07-23 — combine_cabinet is the standing-up moment; the part-less test/finishing beats below keep the reorient TYPE for their gestures)

  // ── drawer sub-assemblies ──
  ...drawerActions("1"),
  ...drawerActions("2"),

  // ── combine: seat the cabinet and slide BOTH drawers in; then each drawer's push-latch test (tap → springs open, pull out, push home — the runners telescope only then); then finish. Ordering between the combines is DERIVED from the CLUSTERS slideJoins overlay — do not hand-write it here; the test steps' gating IS hand-written (tests wait for both combines, top drawer first). ──
  action({ actionId: "combine_cabinet", type: "combineClusters", stage: 4, cluster: "cabinet", requires: [] }),
  action({ actionId: "combine_drawerA", type: "combineClusters", stage: 4, cluster: "drawerA", requires: [] }),
  action({ actionId: "combine_drawerB", type: "combineClusters", stage: 4, cluster: "drawerB", requires: [] }),
  action({ actionId: "test_drawerA", type: "reorient", stage: 4, requires: ["combine_drawerA", "combine_drawerB"] }),
  action({ actionId: "test_drawerB", type: "reorient", stage: 4, requires: ["test_drawerA"] }),
  // The ceremonial `finishing_checks` beat was REMOVED 2026-08-19 — it moved no part, so it was a
  // swipe card standing between the player and a finished build. The last real assembly step is
  // the last step now.
  // test_drawerA / test_drawerB above are NOT ceremony and stay: their swipe runs the drawers'
  // telescoping open and close (see pushOpen below), which nothing else drives.
];

export const BEATS = {
  // The cap's re-typing (structural→fastener, 2026-08-24) split its one place beat into insert+tighten — but the VOICEOVER was recorded against the old one-line script, so all four actions say the old place line verbatim: dedupe folds them onto ONE clip (the recorded eket-standard-398-era "Cover cap" line stays at its position) and no recording regenerates. Re-word these only together with a re-recording session — the stepVoice pins will say so if forgotten.
  insert_suspCap_1: { text: "Place the Cover cap into position.", simpleText: "Add the Cap." },
  tighten_suspCap_1: { text: "Place the Cover cap into position.", simpleText: "Add the Cap." },
  insert_suspCap_2: { text: "Place the Cover cap into position.", simpleText: "Add the Cap." },
  tighten_suspCap_2: { text: "Place the Cover cap into position.", simpleText: "Add the Cap." },
  combine_cabinet: {
    text: "Stand the cabinet where it will live and settle it into place.",
    simpleText: "Put the cabinet in place.",
  },
  combine_drawerA: {
    // SHORTENED for the objective bar — see instructions.ts. "until it clicks" is the outcome, not
    // an instruction, and the click is audible anyway.
    text: "Line the top drawer up with the upper runners and slide it in.",
    simpleText: "Slide the top drawer in.",
  },
  combine_drawerB: {
    text: "Slide the bottom drawer onto the lower runners the same way.",
    simpleText: "Slide the bottom drawer in.",
  },
  test_drawerA: {
    // SHORTENED for the objective bar — this was the longest line in the app at 113 characters and
    // wrapped to FOUR. "the front of" and "all the way" are both implied by the action.
    text: "Press the top drawer so it springs open",
    simpleText: "Press the top drawer, pull it out, push it back in.",
  },
  test_drawerB: {
    text: "Now the bottom drawer: press to pop it open, pull it out, and push it home.",
    simpleText: "Press the bottom drawer, pull it out, push it back in.",
  },
} as InstructionSet;

/** Telescoping travel groups for the per-drawer test beats: the bodies of drawer level `s` and
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
  popDistance: 0.035,
  testActionIds: { "1": "test_drawerA", "2": "test_drawerB" },
  groups: [...pushLevel("1"), ...pushLevel("2")],
};