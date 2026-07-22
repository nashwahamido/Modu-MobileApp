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

// combine overlay: the cabinet is the seed and seats first; each drawer then slides onto it travelling −X (front is +X, so a drawer parks OUT the front and drives inward — the inverse of PUSH_OPEN's outward axis). parkBackoff matches PUSH_OPEN.distance so a drawer parks fully withdrawn rather than at the 10cm slide default. The runners do NOT move during the combine — the drawer slides in over static rails; the telescoping is saved for the test beats.
export const CLUSTERS = {
  cabinet: { id: "cabinet", label: "Cabinet", seed: true },
  drawerA: {
    id: "drawerA",
    label: "Top drawer",
    slideJoins: ["cabinet"],
    placeDir: [-1, 0, 0] as const,
    parkBackoff: 0.16,
  },
  drawerB: {
    id: "drawerB",
    label: "Bottom drawer",
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
  // box: LEFT side is the seed and always goes down first; the keyhole bolts ship PRE-ATTACHED to the side panels (merged into the side mesh in the GLB, 2026-07-20), pointing FORWARD (+X) out of the sides' front edges into keyhole slots in the FRONT's back face — same two-phase hook press as the cabinet's side↔horizontal joints (user-confirmed on device). The slots run VERTICALLY with the narrow ends ABOVE the big ends, so the mover rule gives: FRONT (keyhole carrier) presses backward onto the bolts a bit ABOVE its seat, then shoves DOWN to hang — the picture-frame motion; a SIDE as mover (bolt carrier) presses forward into the placed front, then shoves UP. The RIGHT side is Γ-reachable via the FRONT's directJoins (below), which stands in for the bolt liaison the separate bolts used to provide.
  // the BOTTOM then slides into grooves in the front + both sides; the BACK closes over it and is SCREWED to the sides (screw110519, secured after the box is up).
  [`drawerFront_${s}`]: {
    seed: true, // ALSO a seed (mirrors the cabinet horizontals): free mode may start the drawer from the front — the sides then hook onto IT with their bolt-carrier lockDir; as the strict-order mover after sideL it hangs as below
    directJoins: [pid(`drawerSideL_${s}`), pid(`drawerSideR_${s}`)],
    placeDir: [-1, 0, 0] as const,
    lockDir: [0, -1, 0] as const,
  },
  // placeDir on every parked mover below: the centroid heuristic in travelAxis() guessed visibly wrong axes on-device — a groove's axis isn't derivable from poses, so it must be authored. World frame is documented once on STRUCTURE; the short version is FRONT = +X.
  [`drawerSideL_${s}`]: { seed: true, placeDir: [1, 0, 0] as const, lockDir: [0, 1, 0] as const }, // its lockDir engages only when the front seeded first and this side becomes the mover (press forward, shove up — sideR's mirror); as the strict-order seed it just drops
  [`drawerSideR_${s}`]: { directJoins: [pid(`drawerFront_${s}`)], placeDir: [1, 0, 0] as const, lockDir: [0, 1, 0] as const }, // not a seed — reachable via the front's directJoins once the front is down (replaces the front↔side bolt liaison that went away when bolt128918 merged into the sides); presses FORWARD so its bolts enter the front's keyholes, then shoves UP to lock (was: travelling inward +Z, wrong for a keyhole — the bolts enter along their own axis)
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
  // the stabiliser rod is a STAGED sub-assembly (manual steps 23-24): the player lifts it up on its rail just above the seat, presses a coupling dowel into each end there, lowers the finished bridge straight down between the two FIXED frames into the cradles, then rotates both dowels home. stageOffset is the whole switch — the stage beat, the dowels' insert-at-staging / tighten-after-seating order and the shared-offset carry are all derived from it (core/model/staging.ts). No directJoins: the rod's only Γ edges are the two rod↔frame joints its dowels create, so it never binds the moving carriages.
  [`stabilizerRod_${s}`]: {
    placeDir: [0, -1, 0] as const,
    // ON-RAIL, colinear with the drop (placeDir −Y): stage the rod RAISED along +Y and lower it straight down onto the frame cradles — its real seating motion. The raise stays INSIDE the interior clearance, BETWEEN the seat (y≈+0.015 level 1 / −0.140 level 2) and the TOP-PANEL cap (underside ≈ +0.158), so it never has to pass through the top (that "can't drop through the top" is why an out-front +X stage was tried before — but a BOUNDED in-place raise both clears the cap AND keeps it on its own rail). 0.08 lifts it clearly off the seat while staying ~0.06 under the cap (headroom to ~0.13); both levels share it since level 2 sits far lower. VERIFY ON DEVICE: that the raised pose leaves room to press the end dowels and reads clearly rather than buried between the frames — if the ends are cramped, add a little +X to bias it toward the open front. The "moves as one" outline + auto-prompt are the deferred visuals, not this number.
    stageOffset: [0, 0.05, 0] as const,
  },
} as StructureOverlay);

export const STRUCTURE: StructureOverlay = {
  // ── cabinet (manual AA-2345060 steps 1-9), linear build: LEFT side is screwed onto its rails FIRST (steps 2-3, enforced by requires on topPanel), then TOP hooks onto the left side (keyhole two-phase, lockDir below), then RIGHT side + its rails hook on the same way, then the BACK SLIDES into both sides' grooves (step 6 — slide frontier needs both sides; requiresAny needs one horizontal, already satisfied by topPanel), then BOTTOM closes last over the back (gate, step 7); cams + pins only after the back is seated (step 9 — cams overridden to "secured" so they never preload-lock the box like a LACK bolt would).
  // WORLD FRAME, measured from parts.gen.ts — trust these numbers, not intuition:
  //   +X = FRONT   (drawerFront x=+0.176, backPanel x=-0.149; depth spans X ±0.17)
  //   +Y = UP      (topPanel y=+0.167, bottomPanel y=-0.167)
  //   +Z = LEFT, −Z = RIGHT  (sidePanelL z=+0.342, sidePanelR z=-0.342)
  // matching the real 70(w)×35(h)×35(d)cm EKET. An earlier revision of this comment said front = −X; every placeDir, stageOffset and pushOpen axis authored against that belief was sign-flipped along X and has been corrected. If you are adding a part, measure it rather than copying a neighbour's sign.
  // placeDir is the direction the part TRAVELS as it seats (engagement.ts travelAxis/parkInfo — the park offset is its negation), NOT where the part parks.
  // placeDir on every parked mover: authored travel axes — the centroid heuristic guessed wrong on-device for nearly every EKET part.
  // side↔horizontal joints are KEYHOLES, not simple presses: the slots in the SIDE panels' faces run along the DEPTH axis (X), so the mover presses in ALREADY AT TARGET HEIGHT with a small depth overshoot (dowels through the big slot ends), then shoves along X so the dowels land in the narrow ends. lockDir opts a part into the two-phase hook press. The shove sign follows what the MOVER carries — horizontals carry the DOWELS (they move the way the dowels travel, big→narrow: forward), sides carry the KEYHOLES over fixed dowels (same relative travel = panel moves the other way: back; both sides' slots are Z-mirrors, so their X orientation matches) — which is ORDER-INDEPENDENT, so every panel authors its own lockDir and whoever places second in a pair uses the right motion automatically; a seed that starts the build just drops (engagement is order-derived). VERIFY ON DEVICE: the 1.5cm default lock travel, and the shove signs — if the slots run the other way, flip ALL lockDir X signs together.
  sidePanelL: { seed: true, directJoins: [pid("topPanel"), pid("bottomPanel")], placeDir: [0, 0, -1] as const, lockDir: [-1, 0, 0] as const }, // lockDir engages only when a horizontal seeded first and this side becomes the mover — as the strict-order seed it just drops
  sidePanelR: { directJoins: [pid("topPanel"), pid("bottomPanel")], placeDir: [0, 0, 1] as const, lockDir: [-1, 0, 0] as const }, // not a seed — reachable via the topPanel edge once topPanel is down; arrives from the right, travelling inward — its keyholes ride over the top's edge dowels a bit FORWARD of seat, then it shoves BACK to lock
  topPanel: { seed: true, placeDir: [0, 0, 1] as const, lockDir: [1, 0, 0] as const }, // ALSO a seed: free mode may start from either horizontal (the manual itself builds off a flat panel) and the sides then hook onto IT with their opposite lockDir. As the strict-order mover it presses sideways (toward +Z) onto the standing LEFT side at target height, its edge dowels entering the big slot ends a bit BEHIND their final spots, then shoves FORWARD to lock
  bottomPanel: { seed: true, placeDir: [0, 1, 0] as const }, // also a seed (see topPanel) but NO lockDir: closing last over the back it stays a plain upward press secured by the step-9 cams+pins, and when it seeds instead, the sides carry the keyhole motion
  backPanel: { slideJoins: [pid("sidePanelL"), pid("sidePanelR")], placeDir: [0, 1, 0] as const }, // glides UP the side grooves from the still-open bottom — the top closes in stage 1 BEFORE the back, so coming down from above collides with it; if the build order ever flips (bottom first), this sign flips too — a static placeDir can only bake one order (same limitation engagement.ts notes for presses)
  // back-panel cam locks secure the slide joint AFTER the back is in — not a
  // preloaded connector joint (kind override: cam → secured; motion stays
  // "turn" from hardware.ts)
  // engageDir OVERRIDDEN to [-1,0,0] (rear, outward): the GLB nodes bake it as +X (into the cabinet interior) — the Blender fastener nodes violate the shaft-on-local-Y convention — which put every loose/ghost pose INSIDE the box behind the back panel; the cams and pins really insert from the rear OUTSIDE. Fix the .blend orientations someday, but the override stays correct either way.
  // insertProud 0 (user-verified): a cam/pin drops fully HOME — its front flush with the back panel's rear face (the baked seats already are; mesh front −0.151 = panel rear −0.151) — and the tighten turns/strikes IN PLACE; the default 2cm proud loose pose poked visibly out past the cabinet rear.
  cam139434_1: { fastenerKind: "secured", engageDir: [-1, 0, 0] as const, insertProud: 0 },
  cam139434_2: { fastenerKind: "secured", engageDir: [-1, 0, 0] as const, insertProud: 0 },
  cam139434_3: { fastenerKind: "secured", engageDir: [-1, 0, 0] as const, insertProud: 0 },
  cam139434_4: { fastenerKind: "secured", engageDir: [-1, 0, 0] as const, insertProud: 0 },
  cam139434_5: { fastenerKind: "secured", engageDir: [-1, 0, 0] as const, insertProud: 0 },
  cam139434_6: { fastenerKind: "secured", engageDir: [-1, 0, 0] as const, insertProud: 0 },
  cam139434_7: { fastenerKind: "secured", engageDir: [-1, 0, 0] as const, insertProud: 0 },
  cam139434_8: { fastenerKind: "secured", engageDir: [-1, 0, 0] as const, insertProud: 0 },
  // the step-9 rear pins share the cams' baked-backwards +X engageDir — same override, same reason
  dowel139435_1: { engageDir: [-1, 0, 0] as const, insertProud: 0 },
  dowel139435_2: { engageDir: [-1, 0, 0] as const, insertProud: 0 },
  dowel139435_3: { engageDir: [-1, 0, 0] as const, insertProud: 0 },
  dowel139435_4: { engageDir: [-1, 0, 0] as const, insertProud: 0 },
  dowel139435_5: { engageDir: [-1, 0, 0] as const, insertProud: 0 },
  dowel139435_6: { engageDir: [-1, 0, 0] as const, insertProud: 0 },
  dowel139435_7: { engageDir: [-1, 0, 0] as const, insertProud: 0 },
  dowel139435_8: { engageDir: [-1, 0, 0] as const, insertProud: 0 },
  // stabiliser-rod coupling dowels (manual step 22), 3-phase: DROP each dowel to its STAGE pose (fully out of the rod end, +engageDir·insertStage) → PRESS it into the rod (insertFastener) so it sits RETRACTED (loose = −engageDir·insertRetract) → drawTurn TIGHTEN draws it back out into the slider hole while quarter-turning to lock. insertStage 0.03 = held ~3cm off the end before pressing (0.06 read as too far out on device); insertRetract 0.04 keeps the pressed dowel inside the rod (ends at z=±0.209). Tune both on device.
  dowel145572_1: { insertStage: 0.03, insertRetract: 0.04 },
  dowel145572_2: { insertStage: 0.03, insertRetract: 0.04 },
  dowel145572_3: { insertStage: 0.03, insertRetract: 0.04 },
  dowel145572_4: { insertStage: 0.03, insertRetract: 0.04 },
  // suspension fittings (top-rear corners), fully USER-VERIFIED against manual steps 10-13 (2026-07-22, corrected on device): each BRACKET is TWO beats — tap it in SIDEWAYS BY HAND toward its own side panel (left to left, right to right, the plate pins entering the side's rear-edge holes), then a separate stationary TIGHTEN with the screwdriver on the screw whose hole faces the BACK (step 11's drill; the screw is not a GLB part, so the tighten beat rides the bracket itself — engageDir-less, zero loose offset, no positional movement). The KNOB then SCREWS in from the rear BY HAND (dial, no tool). The COVER just CLICKS home at drop (dropOn — no tap, no dial), and is UNSTABLE until its CAP screws over it perpendicular to the back panel (the securing screw-place stability rule).
  // Corner stack rear-to-front for the record: knob (-0.170) -> bracket (-0.160) -> back panel (-0.149) -> cover (-0.146) -> cap (-0.144).
  // bracket engageDir/insertProud/toolAnchor serve the TIGHTEN VISUAL only (user-verified): the screwdriver stands perpendicular to the back panel (engageDir [-1,0,0] — TightenControl never sinks/spins a structural part) with zero proud travel (insertProud 0), rotating at the CIRCULAR BOSS centre — the node origin sits on the plate ~1cm from it, toolAnchor bridges the gap (boss z ±0.308 vs origin z ±0.317873)
  suspBracket_1: { directJoins: [pid("sidePanelR")], placeDir: [0, 0, -1] as const, engageDir: [-1, 0, 0] as const, insertProud: 0, toolAnchor: [0, 0, 0.009873] as const }, // sits at z=-0.318: taps outward toward the RIGHT side's rear-edge holes, bare-handed
  suspBracket_2: { directJoins: [pid("sidePanelL")], placeDir: [0, 0, 1] as const, engageDir: [-1, 0, 0] as const, insertProud: 0, toolAnchor: [0, 0, -0.009873] as const }, // sits at z=+0.318: taps outward toward the LEFT side's rear-edge holes, bare-handed
  // cover: dropOn — the press liaison keeps it Γ-reachable through its bracket, but the placement is a plain snap (user-verified: "it's placed", no tap and no dial). cap: placeDir doubles as the SCREW AXIS (engagement.directScrewAxis honors it; derived would be the same clean [1,0,0], authored for the record)
  suspCover_1: { directJoins: [pid("suspBracket_1")], dropOn: true, unstable: true },
  suspCover_2: { directJoins: [pid("suspBracket_2")], dropOn: true, unstable: true },
  suspCap_1: { screwJoins: [pid("suspCover_1")], placeDir: [-1, 0, 0] as const },
  suspCap_2: { screwJoins: [pid("suspCover_2")], placeDir: [-1, 0, 0] as const },
  // the knob indices are CROSSED relative to every other suspension part: suspKnob_1 sits at z=+0.308 (LEFT, alongside suspBracket_2) and suspKnob_2 at z=-0.308 (RIGHT, alongside suspBracket_1), whereas cover_n/cap_n share their bracket_n's side. The joins follow the GEOMETRY, not the index — that pairing is measured.
  // SCREWED in BY HAND (user-verified: not tapped) — screwJoins + authored placeDir [1,0,0]: it parks 4.5cm behind the rear and DIALS forward onto its bracket about the back-panel normal; the old diagonal-centre objection died when directScrewAxis learned to honor the authored placeDir. NO tool.
  suspKnob_1: { screwJoins: [pid("suspBracket_2")], placeDir: [1, 0, 0] as const },
  suspKnob_2: { screwJoins: [pid("suspBracket_1")], placeDir: [1, 0, 0] as const },
  ...cabinetRunners("1"),
  ...cabinetRunners("2"),
  ...drawer("1"),
  ...drawer("2"),
} as StructureOverlay;

export const FASTENER_RULES: FastenerRule[] = [
  // drawer sub-assemblies (stage 1)
  // bolt128918 (front keyhole bolts) rule removed 2026-07-20: the bolts are pre-attached to the sides in the GLB, so they are no longer parts — the front's press-down placement still locks the keyholes over the pre-installed heads
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
        // the front carries NO requires: in the strict order it follows sideL anyway (list position) and hook-presses onto its bolts, but as a free-mode seed it may go down FIRST — a hard requires on sideL would dead-lock that start (the frontier rule "seed, or a placed press partner" is the real guard)
        // the back closes over the bottom (trap) — it can't go on until the
        // bottom has slid into the grooves
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

// withStaging() splits this into "take the rod out" + "fit the assembled bridge in", and moves ALL these prereqs onto the take-out beat; the dowel inserts are wired in between automatically.
// BOTH frames are required, not just backPanel: the rod bridges the two frames' cradles, but its only Γ edges are the dowel liaisons — an OR-frontier that would let it seat against ONE placed frame with the other side floating in a free-order build. This must stay authored (not a generic both-endpoints rule): BEKVÄM's step legitimately presses onto ONE standing leg's dowel before the other leg exists.
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
  // ── cabinet stage 3: stabiliser rods (need the back seated + both sides' frames screwed), cams+pins (rules), suspension fittings, stand upright ──
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
  // each cap directly follows its cover: a placed cover is unstable and its stability lock admits only the securing cap until it's on
  place("suspCover_1", 3),
  place("suspCap_1", 3),
  place("suspCover_2", 3),
  place("suspCap_2", 3),
  action({ actionId: "reorient_cabinet", type: "reorient", stage: 3, cluster: "cabinet", requires: [] }),

  // ── drawer sub-assemblies ──
  ...drawerActions("1"),
  ...drawerActions("2"),

  // ── combine: seat the cabinet and slide BOTH drawers in; then each drawer's push-latch test (tap → springs open, pull out, push home — the runners telescope only then); then finish. Ordering between the combines is DERIVED from the CLUSTERS slideJoins overlay — do not hand-write it here; the test steps' gating IS hand-written (tests wait for both combines, top drawer first). ──
  action({ actionId: "combine_cabinet", type: "combineClusters", stage: 4, cluster: "cabinet", requires: ["reorient_cabinet"] }),
  action({ actionId: "combine_drawerA", type: "combineClusters", stage: 4, cluster: "drawerA", requires: [] }),
  action({ actionId: "combine_drawerB", type: "combineClusters", stage: 4, cluster: "drawerB", requires: [] }),
  action({ actionId: "test_drawerA", type: "reorient", stage: 4, requires: ["combine_drawerA", "combine_drawerB"] }),
  action({ actionId: "test_drawerB", type: "reorient", stage: 4, requires: ["test_drawerA"] }),
  action({ actionId: "finishing_checks", type: "reorient", stage: 4, requires: ["test_drawerB"] }),
];

export const BEATS = {
  combine_cabinet: {
    text: "Stand the cabinet where it will live and settle it into place.",
    simpleText: "Put the cabinet in place.",
  },
  combine_drawerA: {
    text: "Line the top drawer up with the upper runners and slide it in until it clicks.",
    simpleText: "Slide the top drawer in.",
  },
  combine_drawerB: {
    text: "Slide the bottom drawer onto the lower runners the same way.",
    simpleText: "Slide the bottom drawer in.",
  },
  test_drawerA: {
    text: "Press the front of the top drawer so it springs open, pull it all the way out, then push it home until it clicks.",
    simpleText: "Press the top drawer, pull it out, push it back in.",
  },
  test_drawerB: {
    text: "Now the bottom drawer: press to pop it open, pull it out, and push it home.",
    simpleText: "Press the bottom drawer, pull it out, push it back in.",
  },
  finishing_checks: {
    text: "Secure the cabinet to the wall with the suspension fittings.",
    simpleText: "Fix it to the wall.",
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
