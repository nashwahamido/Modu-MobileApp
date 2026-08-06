// The GLOBAL hardware catalogue — one entry per IKEA article number.
import { DriveMotion, GroupId, LabelSet, ToolId } from "@/src/game/core/type";

export interface HardwareInfo {
  tool: ToolId;
  motion?: DriveMotion;
  label?: LabelSet;
  note?: string;
}

const HARDWARE_RAW = {
  screw105251: {
    tool: "allenkey",
    label: { standard: "Wood screw", simple: "Screw" },
    note: "wood screw — legs to plates",
  },
  screw100212: {
    tool: "allenkey",
    label: { standard: "Ring rail screw", simple: "Screw" },
    note: "ring rail screw",
  },
  screw105298: {
    tool: "screwdriver",
    label: { standard: "Support pin screw", simple: "Screw" },
    note: "support pin screw",
  },
  screw108443: {
    tool: "screwdriver",
    label: { standard: "Plate screw", simple: "Screw" },
    note: "seat plate screw",
  },
  cap107675: {
    tool: "mallet",
    motion: "strike",
    label: { standard: "Cap" },
    note: "cap — tapped in with a mallet (strike, not a driven screw)",
  },
  bolt115980: {
    tool: "hand",
    label: { standard: "Bolt", simple: "Bolt" },
    note: "double-ended bolt — spun in by hand",
  },
  camBolt118331: {
    tool: "screwdriver",
    label: { standard: "Cam bolt", simple: "Bolt" },
    note: "cam bolt into drawer front",
  },
  screw110519: {
    tool: "screwdriver",
    label: { standard: "Back screw", simple: "Screw" },
    note: "back panel screw",
  },
  screw115339: {
    tool: "screwdriver",
    label: { standard: "Bottom screw", simple: "Screw" },
    note: "drawer bottom screw",
  },
  screw100365: {
    tool: "screwdriver",
    label: { standard: "Rail screw", simple: "Screw" },
    note: "drawer rail screw",
  },
  screw105344: {
    tool: "screwdriver",
    label: { standard: "Guide screw", simple: "Screw" },
    note: "centre guide screw",
  },
  // ── EKET cabinet w/2 drawers (AA-1914748 / AA-2345060) ──
  cam139434: {
    tool: "hand",
    // single-press seat (user-verified): one push and the lock is home — TapControl's one-shot variant, no multi-tap strike
    motion: "press",
    label: { standard: "Cam lock", simple: "Lock" },
    note: "back-panel cam lock —  pin (139435)",
  },
  dowel139435: {
    tool: "hand",
    motion: "press",
    label: { standard: "Cam pin", simple: "Pin" },
    note: "cam pin pushed into the frame; the cam (139434) locks onto it",
  },
  screw100349: {
    tool: "screwdriver",
    label: { standard: "Runner screw", simple: "Screw" },
    note: "fixes the drawer runner rail to the side panel",
  },
  screw109041: {
    tool: "screwdriver",
    label: { standard: "Bracket screw", simple: "Screw" },
    note: "fixes the rear runner bracket to the drawer box",
  },
  // screw110519 (drawer-back screw) is already defined above — shared article number bolt128918 (drawer front keyhole bolts) removed 2026-07-20: the bolts now ship pre-attached — merged into the side-panel meshes in the GLB — so they are no longer separate parts and need no hardware entry, insert/tighten action or fastener rule
  dowel145572: {
    tool: "hand",
    // manual step 22: (1) PRESS the knurled dowel into the stabiliser rod's end at staging (the insert beat), then (2+3) once the rod is seated, DRAW it OUT along its axis into the runner-slider hole and quarter-turn it to lock — folded into the single `drawTurn` tighten beat (DrawTurnControl: slider animates the draw-out translation; the rotate-lock dial is PROMPT-ONLY, the dowel never visibly spins).
    motion: "drawTurn",
    label: { standard: "Dowel", simple: "Peg" },
    note: "stabiliser-rod coupling dowel — pressed into the rod end, then drawn out into the slider hole and turned to lock",
  },
  // ── BEKVÄM step stool (AA-444158-9) ──
  screw105111: {
    tool: "allenkey",
    label: { standard: "Long screw", simple: "Screw" },
    note: "long wood screw — driven UP from below: through the top rails into the top step, and through the front rail into the step",
  },
  screw105215: {
    tool: "allenkey",
    label: { standard: "Wood screw", simple: "Screw" },
    note: "wood screw — through the side panels into the rail ends",
  },
  dowel101350: {
    tool: "hand",
    motion: "strike",
    label: { standard: "Wood dowel", simple: "Peg" },
    note: "wooden dowel joining the step to the side panels — tapped in before the mating side presses on",
  },
} satisfies Record<string, HardwareInfo>;

export const HARDWARE = HARDWARE_RAW as Partial<Record<GroupId, HardwareInfo>>;
