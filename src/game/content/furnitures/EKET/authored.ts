import { action } from "@/src/game/core/composition/composeActions";
import type { StructureOverlay } from "@/src/game/core/model/liaisons";
import type { FastenerEntry, FastenerMap } from "@/src/game/core/type";
import type { JointDef } from "@/src/game/core/derive/joints";
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

// default guide node
export const MODE: AssemblyMode = "guide";

// part name in part tray
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

// clusters
export const CLUSTERS = {
  cabinet: { id: "cabinet", label: "Cabinet", seed: true },
  drawerA: {
    id: "drawerA",
    label: "Top Drawer",
    combine: {
      kind: "slide",
      onto: ["cabinet"],
      dir: [-1, 0, 0] as const,
      back: 0.16,
    },
  },
  drawerB: {
    id: "drawerB",
    label: "Bottom Drawer",
    combine: {
      kind: "slide",
      onto: ["cabinet"],
      dir: [-1, 0, 0] as const,
      back: 0.16,
    },
  },
} as Record<ClusterId, ClusterDef>;

const pid = asPartId;
const cmp = asComponentId;

// components
const slide = (side: "L" | "R", s: string): ComponentDef => ({
  id: cmp(`runnerSlide${side}_${s}`),
  label: {
    standard: `${side === "L" ? "Left" : "Right"} drawer slide`,
    simple: "Slide",
  },
  bodies: [
    pid(`runnerFrame${side}_${s}`),
    pid(`runnerMiddle${side}_${s}`),
    pid(`runnerCarriage${side}_${s}`),
  ],
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

// A drawer's Γ + build overlay (shared by A and B)
const drawer = (s: string): StructureOverlay =>
  ({
    [`drawerFront_${s}`]: { seed: true },
    [`drawerSideL_${s}`]: { seed: true, placeDir: [1, 0, 0] as const },
    [`drawerSideR_${s}`]: { seed: true, placeDir: [1, 0, 0] as const },
    [`drawerBack_${s}`]: { unstable: true },
    [`runnerBracketL_${s}`]: {},
    [`runnerBracketR_${s}`]: {},
  }) as StructureOverlay;

// The cabinet-side runner mechanism for one drawer level
const cabinetRunners = (s: string): StructureOverlay =>
  ({
    [`runnerFrameL_${s}`]: { unstable: true, placeDir: [0, 0, 1] as const },
    [`runnerFrameR_${s}`]: { unstable: true, placeDir: [0, 0, -1] as const },
    [`stabilizerRod_${s}`]: {
      placeDir: [0, -1, 0] as const,
      stageOffset: [0, 0.05, 0] as const,
    },
  }) as StructureOverlay;

export const STRUCTURE: StructureOverlay = {
  sidePanelL: { seed: true },
  sidePanelR: { seed: true },
  topPanel: { seed: true, placeDir: [0, 0, 1] as const },
  bottomPanel: { seed: true, placeDir: [0, 1, 0] as const },

  cam139434_1: { engageDir: [0, 0, -1] as const },
  cam139434_2: { engageDir: [0, 1, 0] as const },
  cam139434_3: { engageDir: [0, 1, 0] as const },
  cam139434_4: { engageDir: [0, 1, 0] as const },
  cam139434_5: { engageDir: [0, 0, 1] as const },
  cam139434_6: { engageDir: [0, -1, 0] as const },
  cam139434_7: { engageDir: [0, -1, 0] as const },
  cam139434_8: { engageDir: [0, -1, 0] as const },
  dowel139435_1: { engageDir: [0, 1, 0] as const },
  dowel139435_2: { engageDir: [0, 1, 0] as const },
  dowel139435_3: { engageDir: [0, 0, 1] as const },
  dowel139435_4: { engageDir: [0, -1, 0] as const },
  dowel139435_5: { engageDir: [0, -1, 0] as const },
  dowel139435_6: { engageDir: [0, -1, 0] as const },
  dowel139435_7: { engageDir: [0, 0, -1] as const },
  dowel139435_8: { engageDir: [0, 1, 0] as const },

  suspBracket_1: {
    engageDir: [-1, 0, 0] as const,
    insertProud: 0,
    toolAnchor: [0, 0, 0.009873] as const,
  },
  suspBracket_2: {
    engageDir: [-1, 0, 0] as const,
    insertProud: 0,
    toolAnchor: [0, 0, -0.009873] as const,
  },
  suspCover_1: { unstable: true },
  suspCover_2: { unstable: true },
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
  ...cabinetRunners("1"),
  ...cabinetRunners("2"),
  ...drawer("1"),
  ...drawer("2"),
} as StructureOverlay;

// Fastener defs (fastener-model-v2 seam, core/derive/fasteners.ts validates and lowers them into structure.gen; composeActions expands them) — the def declares each hardware GROUP's form; per-instance bindings stay in the mesh names (plus the suspCap re-typing above). Entry order is the old rule order: it drives the composed action order.
export const FASTENERS: FastenerMap = {
  // drawer sub-assemblies
  // bolt128918 (front keyhole bolts) def removed 2026-07-20: the bolts are pre-attached to the sides in the GLB, so they are no longer parts — the front's press-down placement still locks the keyholes over the pre-installed heads
  screw110519: { home: "liaison", role: "securer" }, // back screws (back → sides)
  screw109041: { home: "liaison", role: "securer" },
  // cover cap — re-typed structural→fastener (see STRUCTURE): a securer on the cover↔bracket liaison; its insert waits for both and its tighten secures the unstable cover. Listed BEFORE screw100349 so its actions lead the moved cabinet fastener block: the voiceover script then keeps the cap's line at clip 22, where the RECORDED files have it (stepVoice pins).
  suspCap: { home: "liaison", role: "securer" },
  // cabinet: rails onto flat sides first; back cams + pins only after the back panel is seated in its groove (manual step 9 — held there by their requires, and they now take that panel's stage); stabiliser-rod pins couple the rod to the rails after the rod clicks on
  screw100349: { home: "liaison", role: "securer" },
  // rod↔frame coupling dowels: preloaded connectors (the rod mounts by press once they are in); staging derives "press into the rod once it is out, rotate home once it is seated"; the drop step and the loose-pose retract are the lifecycle below
  dowel145572: {
    home: "liaison",
    role: "connector",
    preload: { completesOn: "insert", counterpartMountsBy: "press" },
    // 3-phase (manual step 22): DROP each dowel to its STAGE pose (fully out of the rod end, +engageDir·0.03 — 0.06 read as too far out on device) → PRESS it into the rod so it sits RETRACTED 0.04 inside (ends at z=±0.209) → drawTurn TIGHTEN draws it back out into the slider hole while quarter-turning to lock. Tune both on device.
    lifecycle: { drop: { stage: 0.03 }, insert: { retract: 0.04 } },
  },
  cam139434: { home: "liaison", role: "securer" },
  // each pin rides its co-located cam (extraOf; instance pairing = same liaison + nearest, reproducing the old hand-written PIN_TO_CAM table): the pin crosses the cam's slots inside the panel, so a still-loose cam physically blocks it — lowering emits "own host place, remaining endpoint place (backPanel), then the cam's tighten" per instance
  dowel139435: { home: { extraOf: "cam139434" } },
} as unknown as FastenerMap;

/** Every structural join in this furniture, stated as an ENTITY rather than as per-part arrays (core/derive/joints.ts) — the flat form is gone from EKET as of 2026-09-02. The kind and the pair are the human's; the travel comes from the contact slabs in joints.gen.ts wherever the derivation can decide it, so a vector is typed here ONLY where that pass declines by name: the four keyhole approaches (its sweep reports "both signs clear") and the clips' ("the partner surrounds the mover"). What still lives per-part in STRUCTURE is what a joint cannot say: seeds, staging, hardware visuals, and the travel of a part that seats second in a pair whose approach describes the other end. */
export const JOINTS: JointDef[] = [
  // Each bracket taps sideways onto its own side panel's rear-edge holes. Nothing bridges the pair — the tighten screw is not a GLB part — so the joint itself makes the Γ edge that `pressJoins` used to.
  {
    kind: "press",
    a: pid("suspBracket_1"),
    b: pid("sidePanelR"),
    mover: pid("suspBracket_1"),
  },
  {
    kind: "press",
    a: pid("suspBracket_2"),
    b: pid("sidePanelL"),
    mover: pid("suspBracket_2"),
  },
  // The drawer bottom glides forward along three grooves, so it is three slide joints rather than one array of three targets: a joint is a PAIR, and the mover is the same part in each.
  ...(["1", "2"] as const).flatMap((s) =>
    (["drawerSideL", "drawerSideR", "drawerFront"] as const).map(
      (owner): JointDef => ({
        kind: "slide",
        a: pid(`drawerBottom_${s}`),
        b: pid(`${owner}_${s}`),
        mover: pid(`drawerBottom_${s}`),
      }),
    ),
  ),
  // ── cabinet keyholes (manual steps 4-7). The slots in the SIDE panels' faces run along the DEPTH axis (X): the mover presses in ALREADY AT TARGET HEIGHT with a small depth overshoot (dowels through the big slot ends), then shoves along X so the dowels land in the narrow ends. The shove sign follows what the MOVER carries — the horizontal carries the DOWELS and travels the way they do (big→narrow: FORWARD, +X), the side carries the KEYHOLES over fixed dowels and so goes the other way (−X); both sides' slots are Z-mirrors, so their X orientation matches. That is one pair fact with two ends, which is exactly `lock.dir` (the side's shove) and `lock.dirOther` (the horizontal's) — before this it was a lockDir authored on all four panels that had to stay in sync by hand. Order-independence is unaffected: whichever panel seats second is the mover on device, and engagement reads the vector meant for its end. VERIFY ON DEVICE: the 1.5cm default lock travel, and the shove signs — if the slots run the other way, flip both X signs together.
  ...(["sidePanelL", "sidePanelR"] as const).flatMap((side) =>
    (["topPanel", "bottomPanel"] as const).map(
      (horizontal): JointDef => ({
        kind: "hookAndSlot",
        a: pid(side),
        b: pid(horizontal),
        mover: pid(side),
        approach: { dir: side === "sidePanelL" ? [0, 0, -1] : [0, 0, 1] },
        lock: { dir: [-1, 0, 0], dirOther: [1, 0, 0] },
      }),
    ),
  ),
  // The back glides UP both side grooves (step 6) — one joint per groove owner, the same mover in each. No approach: joints.gen derives [0,1,0] from the groove slab and travelAxis flips the sign per build order off the sweep, so a bottom-first close (legal in free mode) enters DOWN through the open top instead of colliding, which the hand-typed vector could not express.
  ...(["sidePanelL", "sidePanelR"] as const).map(
    (side): JointDef => ({
      kind: "slide",
      a: pid("backPanel"),
      b: pid(side),
      mover: pid("backPanel"),
    }),
  ),
  // The knob SCREWS onto its bracket by hand (user-verified: not tapped) — it parks behind the rear and DIALS forward about the back-panel normal, no tool. The indices are CROSSED relative to every other suspension part: suspKnob_1 sits at z=+0.308 (LEFT, alongside suspBracket_2) and suspKnob_2 at z=-0.308 (RIGHT, alongside suspBracket_1), whereas cover_n/cap_n share their bracket_n's side. The pairing follows the measured GEOMETRY, not the number.
  {
    kind: "screw",
    a: pid("suspKnob_1"),
    b: pid("suspBracket_2"),
    mover: pid("suspKnob_1"),
  },
  {
    kind: "screw",
    a: pid("suspKnob_2"),
    b: pid("suspBracket_1"),
    mover: pid("suspKnob_2"),
  },
  // The cover CLICKS home over its own bracket as it lands. Its pair is bridged by suspCap, so this emits no join array at all — and therefore no `dropOn` either: the flag existed only to cancel the press edge the cover's own pressJoins created, and there is now no edge to cancel.
  ...(["1", "2"] as const).map(
    (n): JointDef => ({
      kind: "snap",
      a: pid(`suspCover_${n}`),
      b: pid(`suspBracket_${n}`),
      mover: pid(`suspCover_${n}`),
    }),
  ),
  // Drawer-box keyholes: the front presses back onto the sides' pre-attached bolt heads and shoves DOWN to lock; a side seating second shoves UP. Same pair-level lock as the cabinet, one axis over.
  ...(["1", "2"] as const).flatMap((s) =>
    (["drawerSideL", "drawerSideR"] as const).map(
      (side): JointDef => ({
        kind: "hookAndSlot",
        a: pid(`drawerFront_${s}`),
        b: pid(`${side}_${s}`),
        mover: pid(`drawerFront_${s}`),
        approach: { dir: [-1, 0, 0] },
        lock: { dir: [0, -1, 0], dirOther: [0, 1, 0] },
      }),
    ),
  ),
  // Middle and carriage are non-lead bodies of the slide component (cascade-placed with the frame), but their joints stay: they are these bodies' only Γ edges (no hardware attachments in parts.gen), they never gate the lead, and the clip's slide frontier needs the carriage connected. No approach — the derivation has nothing to say about a body that never travels on its own, and neither has an author.
  ...(["1", "2"] as const).flatMap((s) =>
    (["L", "R"] as const).flatMap((side): JointDef[] => [
      {
        kind: "press",
        a: pid(`runnerMiddle${side}_${s}`),
        b: pid(`runnerFrame${side}_${s}`),
        mover: pid(`runnerMiddle${side}_${s}`),
      },
      {
        kind: "press",
        a: pid(`runnerCarriage${side}_${s}`),
        b: pid(`runnerMiddle${side}_${s}`),
        mover: pid(`runnerCarriage${side}_${s}`),
      },
    ]),
  ),
  // Clip seat is the −X (REAR) extreme of the slide: every clip sits at x=-0.131, behind all four carriages (x=-0.010..+0.039). DEVICE-VERIFIED: the clip slides on BACKWARD (−X) — it parks just ahead of the seat at x≈-0.101 and is pushed rearward onto the carriage tip (the earlier +X push drove it through the rail body and collided). The approach is authored because the derivation declines this one by name: "travels along X through this contact, but the sign is not derivable — the partner surrounds the mover, so neither corridor objects". back 0.03: the 10cm slide default parks the tiny clip back inside the runner assembly. The four clips are natively ONE interchangeable group in the GLB (renamed runnerClip_1..4: 1/2 ride carriageL levels 1/2, 3/4 ride carriageR — one tray card ×4, each socket renders its own mirrored mesh).
  ...(["1", "2"] as const).flatMap((s): JointDef[] => [
    {
      kind: "slide",
      a: pid(`runnerClip_${s}`),
      b: pid(`runnerCarriageL_${s}`),
      mover: pid(`runnerClip_${s}`),
      approach: { dir: [-1, 0, 0], back: 0.03 },
    },
    {
      kind: "slide",
      a: pid(`runnerClip_${s === "1" ? "3" : "4"}`),
      b: pid(`runnerCarriageR_${s}`),
      mover: pid(`runnerClip_${s === "1" ? "3" : "4"}`),
      approach: { dir: [-1, 0, 0], back: 0.03 },
    },
  ]),
];

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
      (i) =>
        done.has(`tighten_cam139434_${i}`) &&
        done.has(`tighten_dowel139435_${i}`),
    ),
} as Record<string, Gate>;

const place = (partId: string, stage: number) =>
  action({ type: "placePart", stage, partId, requires: [] });

const drawerActions = (s: string): DraftAction[] =>
  [
    "drawerSideL",
    "drawerFront",
    "drawerSideR",
    "drawerBottom",
    "drawerBack",
    "runnerBracketL",
    "runnerBracketR",
  ].map((g) =>
    action({
      type: "placePart",
      stage: 1,
      partId: `${g}_${s}`,
      requires:
        // the front carries NO requires: in the strict order it follows sideL anyway (list position) and hook-presses onto its bolts, but as a free-mode seed it may go down FIRST — a hard requires on sideL would dead-lock that start (the frontier rule "seed, or a placed press partner" is the real guard) the back closes over the bottom (trap) — it can't go on until the bottom has slid into the grooves
        g === "drawerBack"
          ? [`place_drawerBottom_${s}`]
          : // the rear catches are screwed onto the finished box (manual step 21)
            g.startsWith("runnerBracket")
            ? [`place_drawerBack_${s}`]
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
    type: "placePart",
    stage: 3,
    partId: `stabilizerRod_${s}`,
    requires: [
      "place_backPanel",
      `place_runnerFrameL_${s}`,
      `place_runnerFrameR_${s}`,
    ],
  });

export const AUTHORED_ACTIONS: DraftAction[] = [
  // ── cabinet stage 1 (manual steps 1-5): LEFT panel → LEFT runners → TOP panel → RIGHT panel → RIGHT runners; all must finish before stage 2 ──
  action({ type: "placePart", stage: 1, partId: "sidePanelL", requires: [] }),
  ...cabinetRunnerSide("L"),
  // no requires on the horizontals: the manual's "rails before the box" is choreography, not physics — only the liaison frontier (a placed side panel) and the groove-trap gates order them. Strict mode still follows the authored array order regardless.
  action({
    type: "placePart",
    stage: 1,
    partId: "topPanel",
    requires: [],
    gate: "topPanelClosesAfterBack",
  }),
  action({ type: "placePart", stage: 1, partId: "sidePanelR", requires: [] }),
  ...cabinetRunnerSide("R"),
  // ── cabinet stage 2 (manual steps 6-7): BACK slides into both sides' grooves, then BOTTOM closes over it (gated on the back) ──
  action({
    type: "placePart",
    stage: 2,
    partId: "backPanel",
    requires: [],
    requiresAny: ["place_topPanel", "place_bottomPanel"],
  }),
  action({
    type: "placePart",
    stage: 2,
    partId: "bottomPanel",
    requires: [],
    gate: "bottomPanelClosesAfterBack",
  }),
  // ── cabinet stage 3: stabiliser rods (need the back seated + both sides' frames screwed), cams+pins (rules), suspension fittings ──
  stabilizerRodAction("1"),
  stabilizerRodAction("2"),
  // gated: no suspension work until the rods, their dowels, and the rear cams + pins are all done (see GATES.suspAfterRearHardware)
  action({
    type: "placePart",
    stage: 3,
    partId: "suspBracket_1",
    requires: [],
    gate: "suspAfterRearHardware",
  }),
  action({
    type: "placePart",
    stage: 3,
    partId: "suspBracket_2",
    requires: [],
    gate: "suspAfterRearHardware",
  }),
  // manual step 11 (each bracket's back-facing screw, screwdriver) is deliberately NOT a step: the GLB has no screw part for it, so it was a tighten authored on the STRUCTURAL bracket — and with no engageDir the loose offset is zero, so the player drove a gesture and nothing moved. Restore it by modelling the screw, not by re-authoring the beat.
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
  action({
    actionId: "combine_cabinet",
    type: "combineClusters",
    stage: 4,
    cluster: "cabinet",
    requires: [],
  }),
  action({
    actionId: "combine_drawerA",
    type: "combineClusters",
    stage: 4,
    cluster: "drawerA",
    requires: [],
  }),
  action({
    actionId: "combine_drawerB",
    type: "combineClusters",
    stage: 4,
    cluster: "drawerB",
    requires: [],
  }),
  action({
    actionId: "test_drawerA",
    type: "reorient",
    stage: 4,
    requires: ["combine_drawerA", "combine_drawerB"],
  }),
  action({
    actionId: "test_drawerB",
    type: "reorient",
    stage: 4,
    requires: ["test_drawerA"],
  }),
  // The ceremonial `finishing_checks` beat was REMOVED 2026-08-19 — it moved no part, so it was a
  // swipe card standing between the player and a finished build. The last real assembly step is
  // the last step now.
  // test_drawerA / test_drawerB above are NOT ceremony and stay: their swipe runs the drawers'
  // telescoping open and close (see pushOpen below), which nothing else drives.
];

export const BEATS = {
  // The cap's re-typing (structural→fastener, 2026-08-24) split its one place beat into insert+tighten — but the VOICEOVER was recorded against the old one-line script, so all four actions say the old place line verbatim: dedupe folds them onto ONE clip (the recorded eket-standard-398-era "Cover cap" line stays at its position) and no recording regenerates. Re-word these only together with a re-recording session — the stepVoice pins will say so if forgotten.
  insert_suspCap_1: {
    text: "Place the Cover cap into position.",
    simpleText: "Add the Cap.",
  },
  tighten_suspCap_1: {
    text: "Place the Cover cap into position.",
    simpleText: "Add the Cap.",
  },
  insert_suspCap_2: {
    text: "Place the Cover cap into position.",
    simpleText: "Add the Cap.",
  },
  tighten_suspCap_2: {
    text: "Place the Cover cap into position.",
    simpleText: "Add the Cap.",
  },
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
    `runnerCarriageL_${s}`,
    `runnerCarriageR_${s}`,
    `runnerClip_${s}`,
    `runnerClip_${s === "1" ? "3" : "4"}`,
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
