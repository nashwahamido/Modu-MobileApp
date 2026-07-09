// ║ The GLOBAL hardware catalogue — one entry per IKEA article number.         ║
import { DriveMotion, GroupId, LabelSet, ToolId } from "@/src/game/core/type";

export interface HardwareInfo {
  /** Tool that drives the tighten. "hand" = spun in by hand (no tool model). */
  tool: ToolId;
  /** How the tighten LOOKS (spin/turn/strike) when the fastener kind's default
   *  (cam → turn, else spin) is wrong for this article — e.g. a cap that taps
   *  in. Classified once per article, like `tool`. */
  motion?: DriveMotion;
  /** Display name — a per-article fact like `tool` (a wood screw is a "Wood
   *  screw" in every product). composeLabels() merges these under the
   *  furniture's authored LABELS, which only carries structural groups +
   *  rare overrides. */
  label?: LabelSet;
  /** What this article is, so the next reader can recognize it. */
  note?: string;
}

const HARDWARE_RAW = {
  screw105251: { tool: "allenkey", label: { standard: "Wood screw", simple: "Screw" }, note: "wood screw — legs to plates" },
  screw100212: { tool: "allenkey", label: { standard: "Ring rail screw", simple: "Screw" }, note: "ring rail screw" },
  screw105298: { tool: "screwdriver", label: { standard: "Support pin screw", simple: "Screw" }, note: "support pin screw" },
  screw108443: { tool: "screwdriver", label: { standard: "Plate screw", simple: "Screw" }, note: "seat plate screw" },
  cap107675: { tool: "mallet", motion: "strike", label: { standard: "Cap" }, note: "cap — tapped in with a mallet (strike, not a driven screw)" },
  bolt115980: { tool: "hand", label: { standard: "Bolt", simple: "Bolt" }, note: "double-ended bolt — spun in by hand" },
  camBolt118331: { tool: "screwdriver", label: { standard: "Cam bolt", simple: "Bolt" }, note: "cam bolt into drawer front" },
  screw110519: { tool: "screwdriver", label: { standard: "Back screw", simple: "Screw" }, note: "back panel screw" },
  screw115339: { tool: "screwdriver", label: { standard: "Bottom screw", simple: "Screw" }, note: "drawer bottom screw" },
  screw100365: { tool: "screwdriver", label: { standard: "Rail screw", simple: "Screw" }, note: "drawer rail screw" },
  screw105344: { tool: "screwdriver", label: { standard: "Guide screw", simple: "Screw" }, note: "centre guide screw" },
} satisfies Record<string, HardwareInfo>;

export const HARDWARE = HARDWARE_RAW as Partial<Record<GroupId, HardwareInfo>>;
