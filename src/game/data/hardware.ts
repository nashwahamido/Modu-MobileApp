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
    motion: "strike",
    label: { standard: "Cam lock", simple: "Lock" },
    note: "back-panel cam lock —  pin (139435)",
  },
  dowel139435: {
    tool: "hand",
    motion: "strike",
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
  bolt128918: {
    tool: "hand",
    motion: "strike",
    label: { standard: "Front bolt", simple: "Bolt" },
    note: "keyhole bolt — SCREWED fully into the drawer side's front edge; the front panel then presses down over the heads (that press is the front's placement, not a bolt action)",
  },
  // screw110519 (drawer-back screw) is already defined above — shared article number
  dowel145572: {
    tool: "hand",
    // the manual locks this one by ROTATING the knurled far end a quarter turn, not by tapping it home like an ordinary dowel
    motion: "turn",
    label: { standard: "Dowel", simple: "Peg" },
    note: "wooden dowel pressed into the drawer front",
  },
} satisfies Record<string, HardwareInfo>;

export const HARDWARE = HARDWARE_RAW as Partial<Record<GroupId, HardwareInfo>>;
