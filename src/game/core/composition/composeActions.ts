import {
  actionIdFor,
  asActionId,
  asClusterId,
  asPartId,
  insertId,
  isPartTiedType,
  placeId,
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
import { groupParts } from "../scene/targets";

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

function defaultInsertRequires(p: PartDef): readonly ActionId[] {
  return isConnector(p) ? [] : attachedSnaps(p);
}

function defaultInsertRequiresAny(p: PartDef): readonly ActionId[] {
  return isConnector(p) ? attachedSnaps(p) : [];
}

function defaultTightenRequires(p: PartDef): readonly ActionId[] {
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
        r.requires?.(p) ?? defaultInsertRequires(p),
        r.stage,
        {
          insertRequiresAny: r.insertRequiresAny?.(p) ?? defaultInsertRequiresAny(p),
          tightenRequires: r.tightenRequires?.(p) ?? defaultTightenRequires(p),
          insertTool: kind === "cam" ? tool : undefined,
          motion:
            hardware[r.group]?.motion ??
            (kind === "cam" ? "turn" : kind === "pin" ? "strike" : "spin"),
        },
      );
    }),
  );
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

/** The tighten-action ids for every fastener in a group, e.g. "tighten_<partId>"  for each screw105251. Lets an authored step say "after EVERY leg screw is  driven" declaratively, without filtering the expanded action list. */
export function tightenActionIds(
  parts: Record<PartId, PartDef>,
  group: GroupId,
): ActionId[] {
  return groupParts(parts, group).map((p) => tightenId(p.partId));
}
