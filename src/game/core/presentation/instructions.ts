import {
  ActionId,
  AssemblyAction,
  ClusterDef,
  ClusterId,
  InstructionContent,
  InstructionSet,
  LabelMap,
  PartDef,
  TextLevel,
  Vec3,
} from "@/src/game/core/type";
import { labelFor } from "./labels";
import { stagedCarrierOf } from "@/src/game/core/model/staging";

/** Player-facing direction of a keyhole lock shove (StructuralFields.lockDir) — world +X is the de facto FRONT across the authored furniture frames, so ±X reads as forward/back. */
export function lockShoveWord(dir: Vec3): string {
  if ((dir[1] ?? 0) < -0.5) return "down";
  if ((dir[1] ?? 0) > 0.5) return "up";
  if ((dir[0] ?? 0) > 0.5) return "forward";
  if ((dir[0] ?? 0) < -0.5) return "back";
  return "sideways";
}

export const TOOL_NAME: Record<string, string> = {
  allenkey: "allen key",
  screwdriver: "screwdriver",
  mallet: "mallet",
  hammer: "hammer",
  hand: "your hands",
};

/** Generate step text for every action. Part-bearing steps use shared templates + the furniture's labels; part-less beats get generic defaults worded from the cluster labels — `beats[actionId]` overrides any of them with custom prose (only author what deserves better wording). */
export function buildInstructions(
  actions: readonly AssemblyAction[],
  parts: Record<string, PartDef>,
  labels: LabelMap,
  beats: Record<string, InstructionContent> = {},
  clusters: Record<ClusterId, ClusterDef> = {},
): InstructionSet {
  const clusterName = (id?: ClusterId): string =>
    (id && clusters[id]?.label?.toLowerCase()) || "assembly";

  // Placement order per part, for order-aware keyhole wording below.
  const placeOrder = new Map<string, number>();
  for (const a of actions) {
    if (a.type === "placePart" && a.partId) placeOrder.set(a.partId, a.order);
  }

  // True when the AUTHORED order makes `id` the keyhole mover — a press partner (pressJoins, either direction) places earlier. A lockDir part that seeds first in the linear build just drops, and a free-mode role swap gets its guidance from the live control instead of this static text.
  const keyholeMover = (id: string): boolean => {
    const mine = placeOrder.get(id);
    if (mine === undefined) return false;
    const partners = new Set<string>(parts[id]?.pressJoins ?? []);
    for (const [qid, q] of Object.entries(parts)) {
      if (q.pressJoins?.includes(id as never)) partners.add(qid);
    }
    return [...partners].some((q) => (placeOrder.get(q) ?? Infinity) < mine);
  };

  const contentFor = (a: AssemblyAction): InstructionContent => {
    if (beats[a.actionId]) return beats[a.actionId];

    const group = a.partId ? parts[a.partId]?.group : undefined;
    const std = group ? labelFor(labels, group, "standard") : "part";
    const sim = group ? labelFor(labels, group, "simple") : "part";
    const withTool =
      a.tool === "hand" ? "by hand"
      : a.tool ? `with the ${TOOL_NAME[a.tool] ?? a.tool}`
      : "with the tool";

    switch (a.type) {
      case "stagePart":
        return {
          // JUST THE ACTION. The long form explained WHY ("you will fit its hardware before it goes
          // in"), which is a thing the next two steps then do in front of the player — the objective
          // bar is a prompt for the current move, not a preview of the two after it.
          text: `Take out the ${std} and set it down.`,
          simpleText: `Take out the ${sim}.`,
        };
      case "placePart": {
        // a staged carrier is already out on the canvas when its placement comes up, so its prompt has to send the player back to the part rather than to a tray card
        if (parts[a.partId ?? ""]?.stageOffset) {
          return {
            // "Fit … into position", not "Pick … back up and fit it into position": the picking up
            // is how every placement in the game starts, so saying it here only lengthens the line.
            text: `Fit the assembled ${std} into position.`,
            simpleText: `Put the ${sim} in.`,
          };
        }
        // keyhole two-phase (lockDir): the prompt has to carry BOTH motions — press onto the pins, then the short lock shove in the slot's direction
        const lockDir = parts[a.partId ?? ""]?.lockDir;
        if (lockDir && keyholeMover(a.partId ?? "")) {
          const word = lockShoveWord(lockDir);
          return {
            // THE FIRST MOTION ONLY. The lock shove is still named in the SIMPLE line below and is
            // still what the control asks for; in the standard line it doubled the sentence for a
            // move the player cannot make until the press has landed anyway.
            text: `Press the ${std} onto its pins.`,
            simpleText: `Press the ${sim} on, then push ${word}.`,
          };
        }
        return {
          text: `Place the ${std} into position.`,
          simpleText: `Add the ${sim}.`,
        };
      }
      case "placeFastener": {
        // 3-phase drop: the fastener lands at its STAGE pose (fully out of the hole); the PRESS (insertFastener) drives it in next
        const carrier = a.partId
          ? stagedCarrierOf(parts[a.partId], parts as Record<string, PartDef>)
          : undefined;
        const carrierLabel = carrier
          ? labelFor(labels, parts[carrier]?.group ?? "", "standard")
          : "";
        const carrierShort = carrierLabel.split(" ").pop()?.toLowerCase() ?? carrierLabel;
        return carrier
          ? {
              // Short carrier here too — this step and the "Press … into the end of the rod" one
              // below are consecutive, and naming the rod in full in one and not the other would
              // read as two different things being talked about.
              text: `Set the ${std} at the end of the ${carrierShort}.`,
              simpleText: `Add the ${sim}.`,
            }
          : {
              text: `Line the ${std} up with its hole.`,
              simpleText: `Add the ${sim}.`,
            };
      }
      case "insertFastener": {
        // hardware fitted to a staged sub-assembly is pressed into THAT part while it rests out in front of the player, so name it rather than saying "its hole"
        const carrier = a.partId
          ? stagedCarrierOf(parts[a.partId], parts as Record<string, PartDef>)
          : undefined;
        const carrierLabel = carrier
          ? labelFor(labels, parts[carrier]?.group ?? "", "standard")
          : "";
        const carrierShort = carrierLabel.split(" ").pop()?.toLowerCase() ?? carrierLabel;
        return carrier
          ? {
              // The carrier's LAST WORD, lowercased — "Stabiliser rod" becomes "rod". By the time
              // this step comes up the carrier is the only thing out on the canvas and the player
              // has just staged it by name, so the full label is a re-introduction.
              text: `Press the ${std} into the end of the ${carrierShort}.`,
              simpleText: `Press the ${sim} in.`,
            }
          : {
              text: `Push the ${std} into its hole by hand.`,
              simpleText: `Start the ${sim} by hand.`,
            };
      }
      case "tightenFastener": {
        const m = a.motion ?? (a.tool === "mallet" ? "strike" : "spin");
        if (m === "press")
          return {
            text: `Press the ${std} in until it seats.`,
            simpleText: `Press the ${sim} in.`,
          };
        if (m === "strike")
          return {
            text: `Tap the ${std} fully in ${withTool}.`,
            simpleText: `Tap the ${sim} in.`,
          };
        if (m === "turn")
          return {
            text: `Rotate the ${std} a quarter turn to lock it.`,
            simpleText: `Turn the ${sim} to lock.`,
          };
        if (m === "drawTurn")
          return {
            // The quarter turn is the control's own second phase — the dial appears and asks for it
            // when the draw completes, so the bar naming it up front described a move that is not
            // available yet.
            text: `Draw the ${std} out into the slider.`,
            simpleText: `Pull the ${sim} out and turn to lock.`,
          };
        return {
          text: `Tighten the ${std} ${withTool}.`,
          simpleText: `Tighten the ${sim}.`,
        };
      }
      case "reorient":
        return a.cluster
          ? {
              text: `Stand the ${clusterName(a.cluster)} upright.`,
              simpleText: "Turn it the right way up.",
            }
          : {
              text: "Give it a gentle press and check everything feels solid.",
              simpleText: "Check it feels solid.",
            };
      case "combineClusters": {
        const others = Object.keys(clusters).filter((c) => c !== a.cluster);
        const target =
          others.length === 1 ? clusterName(others[0] as ClusterId) : "the rest";
        return {
          text: `Lower the ${clusterName(a.cluster)} onto the ${target} and line up the holes.`,
          simpleText: `Put the ${clusterName(a.cluster)} on top.`,
        };
      }
      case "verify":
        return {
          text: "Give everything a final check.",
          simpleText: "Check it.",
        };
      default:
        return { text: std };
    }
  };

  return Object.fromEntries(
    actions.map((a): [string, InstructionContent] => [a.actionId, contentFor(a)]),
  );
}

/** The wording for a step at a given text level, falling back to standard.  When the audio setting is on the recorded voiceover is the primary channel (see  `audio/useStepAudio`); this text stays as the on-screen fallback. */
export function instructionText(
  instructions: InstructionSet,
  actionId: ActionId,
  level: TextLevel = "standard",
): string {
  const c = instructions[actionId];
  if (!c) return "";
  if (level === "simple") return c.simpleText ?? c.text ?? "";
  return c.text ?? "";
}