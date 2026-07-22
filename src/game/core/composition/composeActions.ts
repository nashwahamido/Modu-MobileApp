import {
  actionIdFor,
  asActionId,
  asClusterId,
  asPartId,
  insertId,
  isPartTiedType,
  placeId,
  stageId,
  tightenId,
} from "@/src/game/core/ids";
import {
  ActionId,
  ActionType,
  AssemblyAction,
  DraftAction,
  DriveMotion,
  GroupId,
  PartDef,
  PartId,
  ToolId,
} from "@/src/game/core/type";
import { fastenerKindOf, isConnector } from "../model/liaisons";
import { hardwareOn, stagedCarrierOf, stagedCarriers } from "../model/staging";
import { groupParts } from "../scene/targets";

type Parts = Record<PartId, PartDef>;

interface ActionInput {
  /** Only for part-less beats. Part-tied ids are derived from (type, partId). */
  actionId?: string;
  type: ActionType;
  stage: number;
  partId?: string;
  cluster?: string;
  tool?: ToolId;
  motion?: DriveMotion;
  requires?: readonly string[];
  requiresAny?: readonly string[];
  /** Named exceptional rule, resolved via Furniture.gates at evaluation time. */
  gate?: string;
}

/** Build one DraftAction from plain strings, branding every id field. */
export const action = (a: ActionInput): DraftAction => {
  const derived =
    a.partId && isPartTiedType(a.type)
      ? actionIdFor(a.type, asPartId(a.partId))
      : undefined;
  if (!derived && !a.actionId) {
    throw new Error(
      `action(): a part-less "${a.type}" beat needs an explicit actionId`,
    );
  }
  if (derived && a.actionId && a.actionId !== derived) {
    throw new Error(
      `action(): actionId "${a.actionId}" contradicts the convention "${derived}" — drop the actionId, it is derived`,
    );
  }
  return {
    actionId: derived ?? asActionId(a.actionId!),
    type: a.type,
    stage: a.stage,
    ...(a.partId ? { partId: asPartId(a.partId) } : {}),
    ...(a.cluster ? { cluster: asClusterId(a.cluster) } : {}),
    ...(a.tool ? { tool: a.tool } : {}),
    ...(a.motion ? { motion: a.motion } : {}),
    ...(a.gate ? { gate: a.gate } : {}),
    requires: (a.requires ?? []).map(asActionId),
    ...(a.requiresAny ? { requiresAny: a.requiresAny.map(asActionId) } : {}),
  };
};

interface FastenerPairOptions {
  insertRequiresAny?: readonly ActionId[];
  tightenRequires?: readonly ActionId[];
  /** Tool stamped on the INSERT action too. Screws/bolts are positioned by  hand and only the tighten is tool-driven — but a CAM bolt's insert IS the  tool moment (screwing the bolt into its panel; the later tighten is the  cam-disc turn), so cam fasteners pass the tool here as well. */
  insertTool?: ToolId;
  /** How the tighten LOOKS (presentation axis; resolved by expandFastenerRules  from HARDWARE.motion ?? the kind default). */
  motion?: DriveMotion;
}

const pair = (
  partId: PartId,
  tool: ToolId | undefined,
  requires: readonly ActionId[],
  stage: number,
  options: FastenerPairOptions = {},
): DraftAction[] => {
  const insert = insertId(partId);
  return [
    {
      actionId: insert,
      type: "insertFastener",
      stage,
      partId,
      ...(options.insertTool ? { tool: options.insertTool } : {}),
      requires,
      ...(options.insertRequiresAny?.length
        ? { requiresAny: options.insertRequiresAny }
        : {}),
    },
    {
      actionId: tightenId(partId),
      type: "tightenFastener",
      stage,
      partId,
      ...(tool ? { tool } : {}),
      ...(options.motion ? { motion: options.motion } : {}),
      requires: [insert, ...(options.tightenRequires ?? [])],
    },
  ];
};

export type FastenerRule = {
  group: GroupId;
  stage: number;
  /** RARE per-build override. Tool normally comes from the global hardware  catalogue (data/hardware.ts) — resolution chain:  rule.tool → HARDWARE[group].tool → part.tool → none (bare hands). */
  tool?: ToolId;
  /** Optional override for AND prereqs before insertion. Defaults from fastenerKind. */
  requires?: (p: PartDef) => readonly ActionId[];
  /** Optional override for OR prereqs before insertion. Defaults from fastenerKind. */
  insertRequiresAny?: (p: PartDef) => readonly ActionId[];
  /** Extra AND prereqs before tightening, beyond the insert action itself. */
  tightenRequires?: (p: PartDef) => readonly ActionId[];
};

const attachedSnaps = (p: PartDef): ActionId[] =>
  (p.attached ?? []).map((part) => placeId(part));

/** Hardware fitted into a STAGED carrier ignores the kind-based defaults entirely: it goes in as soon as the carrier is out (its other endpoints are what the finished sub-assembly will later join, and needn't exist yet), and it tightens only once the carrier has been SEATED — the rod's dowels press in at staging and rotate home after the bridge drops. */
function defaultInsertRequires(p: PartDef, parts: Parts): readonly ActionId[] {
  const carrier = stagedCarrierOf(p, parts);
  if (carrier) return [stageId(carrier)];
  return isConnector(p) ? [] : attachedSnaps(p);
}

function defaultInsertRequiresAny(p: PartDef, parts: Parts): readonly ActionId[] {
  if (stagedCarrierOf(p, parts)) return [];
  return isConnector(p) ? attachedSnaps(p) : [];
}

function defaultTightenRequires(p: PartDef, parts: Parts): readonly ActionId[] {
  const carrier = stagedCarrierOf(p, parts);
  if (carrier) return [placeId(carrier)];
  return isConnector(p) && fastenerKindOf(p) === "cam" ? attachedSnaps(p) : [];
}

/** Expand each authored rule into insert+tighten pairs for every fastener in  the group. `hardware` is the global catalogue (data/hardware.ts), passed in  by the data layer so core stays free of data imports. Tool resolution:  rule.tool (rare override) → hardware[group].tool → part.tool → none. */
export function expandFastenerRules(
  rules: readonly FastenerRule[],
  parts: Record<PartId, PartDef>,
  hardware: Partial<Record<GroupId, { tool: ToolId; motion?: DriveMotion }>> = {},
): DraftAction[] {
  return rules.flatMap((r) =>
    groupParts(parts, r.group).flatMap((p) => {
      const kind = fastenerKindOf(p);
      const tool = r.tool ?? hardware[r.group]?.tool ?? p.tool;
      return pair(
        p.partId,
        tool,
        r.requires?.(p) ?? defaultInsertRequires(p, parts),
        r.stage,
        {
          insertRequiresAny:
            r.insertRequiresAny?.(p) ?? defaultInsertRequiresAny(p, parts),
          tightenRequires: r.tightenRequires?.(p) ?? defaultTightenRequires(p, parts),
          insertTool: kind === "cam" ? tool : undefined,
          motion:
            hardware[r.group]?.motion ??
            (kind === "cam" ? "turn" : kind === "pin" ? "strike" : "spin"),
        },
      );
    }),
  );
}

/**
 * Split every STAGED part's single placement into the two gestures the player actually performs: `stage_X` takes it out of the tray to its sub-assembly rest pose, `place_X` carries the finished sub-assembly home. Authors never write the stage beat — `stageOffset` on the part is the whole switch.
 *
 * The carrier's authored prereqs move to the STAGE beat (they are what must be true before it can come out at all) and `place_X` is left requiring the stage beat plus every insert of hardware fitted into it: you finish the sub-assembly before installing it. A `gate` stays on the placement, where the exceptional rule was authored to apply.
 *
 * Runs after expandFastenerRules — it reads the expanded insert ids — and before withOrder, so strict mode's `order` numbering follows the spliced sequence.
 */
export function withStaging(
  drafts: readonly DraftAction[],
  parts: Parts,
): DraftAction[] {
  const carriers = stagedCarriers(parts);
  if (carriers.length === 0) return [...drafts];

  const out = [...drafts];
  for (const carrier of carriers) {
    const at = out.findIndex(
      (d) => d.type === "placePart" && d.partId === carrier,
    );
    if (at < 0) {
      throw new Error(
        `staged part "${carrier}" has no placePart action to split — every staged part needs a placement to seat it`,
      );
    }
    const seat = out[at];
    const { requiresAny: _seatRequiresAny, ...seatRest } = seat;
    out[at] = {
      ...seatRest,
      requires: [stageId(carrier), ...hardwareOn(parts, carrier).map(insertId)],
    };
    out.splice(at, 0, {
      actionId: stageId(carrier),
      type: "stagePart",
      stage: seat.stage,
      partId: carrier,
      requires: seat.requires,
      ...(seat.requiresAny?.length ? { requiresAny: seat.requiresAny } : {}),
    });
  }
  return out;
}

/** Stamp the canonical `order` (used by guide mode) onto authored/expanded  drafts, by their final position in the composed action list. When `parts`  is given, also resolve each action's missing tool from its part's default  (action.tool → part.tool → none): DALFRED's pole authors `tool: "mallet"`  ONCE in STRUCTURE and every action touching it inherits it. */
export const withOrder = (
  drafts: readonly DraftAction[],
  parts?: Record<PartId, PartDef>,
): AssemblyAction[] =>
  drafts.map((a, i) => {
    const partTool =
      !a.tool && parts && a.partId ? parts[a.partId]?.tool : undefined;
    return { ...a, ...(partTool ? { tool: partTool } : {}), order: i };
  });

/** The ONE way to turn a furniture's authored drafts + fastener rules into its final action list: expand the rules, split staged parts into take-out + fit-in, then stamp `order`. Every consumer (each furniture's meta.ts, the validator and engine-test harnesses, the availability tests) must go through here — the passes are order-sensitive, and hand-rolled copies of this chain have twice silently dropped a later pass. */
export function composeFurnitureActions(
  authored: readonly DraftAction[],
  rules: readonly FastenerRule[],
  parts: Parts,
  hardware: Partial<Record<GroupId, { tool: ToolId; motion?: DriveMotion }>> = {},
): AssemblyAction[] {
  return withOrder(
    withStaging([...authored, ...expandFastenerRules(rules, parts, hardware)], parts),
    parts,
  );
}

/** The tighten-action ids for every fastener in a group, e.g. "tighten_<partId>"  for each screw105251. Lets an authored step say "after EVERY leg screw is  driven" declaratively, without filtering the expanded action list. */
export function tightenActionIds(
  parts: Record<PartId, PartDef>,
  group: GroupId,
): ActionId[] {
  return groupParts(parts, group).map((p) => tightenId(p.partId));
}
