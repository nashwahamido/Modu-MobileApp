import {
  actionIdFor,
  asActionId,
  asClusterId,
  asPartId,
  insertId,
  isPartTiedType,
  placeFastenerId,
  placeId,
  stageId,
  tightenId,
} from "@/src/game/core/ids";
import {
  ActionId,
  ActionType,
  AssemblyAction,
  ClusterDef,
  ClusterId,
  DraftAction,
  DriveMotion,
  FastenerEntry,
  FastenerMap,
  GroupId,
  PartDef,
  PartId,
  ToolId,
} from "@/src/game/core/type";
import { combinePrereqClusters } from "../evaluation/clusterCombine";
import { isConnector, preloadOf } from "../model/liaisons";
import { hardwareOn, stagedCarrierOf, stagedCarriers } from "../model/staging";
import { groupParts } from "../scene/targets";

type Parts = Record<PartId, PartDef>;

interface ActionInput {
  actionId?: string; // part-less step only — part-tied ids derive from (type, partId)
  type: ActionType;
  stage: number;
  partId?: string;
  cluster?: string;
  tool?: ToolId;
  motion?: DriveMotion;
  requires?: readonly string[];
  requiresAny?: readonly string[];
  // for an exceptional rule, resolved via Furniture.gates at evaluation
  gate?: string;
}

// build one DraftAction from plain strings
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
  insertTool?: ToolId;
  motion?: DriveMotion; // how the tighten looks — from HARDWARE.motion ?? the kind default
  threePhase?: boolean; // opt-in 3-phase lifecycle
}

const pair = (
  partId: PartId,
  tool: ToolId | undefined,
  requires: readonly ActionId[],
  stage: number,
  options: FastenerPairOptions = {},
): DraftAction[] => {
  const insert = insertId(partId);
  const tighten: DraftAction = {
    actionId: tightenId(partId),
    type: "tightenFastener",
    stage,
    partId,
    ...(tool ? { tool } : {}),
    ...(options.motion ? { motion: options.motion } : {}),
    requires: [insert, ...(options.tightenRequires ?? [])],
  };
  if (options.threePhase) {
    // place = the drag from the tray, insert = the PRESS (stage → loose), tighten = loose → flush
    // the OR prereqs gate the place alone; downstream refs to insertId still mean "pressed in"
    const place = placeFastenerId(partId);
    return [
      {
        actionId: place,
        type: "placeFastener",
        stage,
        partId,
        ...(options.insertTool ? { tool: options.insertTool } : {}),
        requires,
        ...(options.insertRequiresAny?.length
          ? { requiresAny: options.insertRequiresAny }
          : {}),
      },
      {
        actionId: insert,
        type: "insertFastener",
        stage,
        partId,
        requires: [place],
      },
      tighten,
    ];
  }
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
    tighten,
  ];
};

const attachedSnaps = (p: PartDef): ActionId[] =>
  (p.attached ?? []).map((part) => placeId(part));

const dist = (a: PartDef, b: PartDef): number => {
  const [x1, y1, z1] = a.pose.position;
  const [x2, y2, z2] = b.pose.position;
  return Math.hypot(x1 - x2, y1 - y2, z1 - z2);
};

// Instance matching for an extra
export function primaryFor(extra: PartDef, primaries: readonly PartDef[]): PartDef | undefined {
  const hosts = extra.attached ?? [];
  let best: PartDef | undefined;
  for (const c of primaries) {
    if (!hosts.every((h) => c.attached?.includes(h))) continue;
    if (!best || dist(extra, c) < dist(extra, best)) best = c;
  }
  return best;
}

// hardware fitted into a STAGED carrier ignores the role-based defaults entirely
function defaultInsertRequires(p: PartDef, parts: Parts): readonly ActionId[] {
  const carrier = stagedCarrierOf(p, parts);
  if (carrier) return [stageId(carrier)];
  return isConnector(p) ? [] : attachedSnaps(p);
}

function defaultInsertRequiresAny(p: PartDef, parts: Parts): readonly ActionId[] {
  if (stagedCarrierOf(p, parts)) return [];
  return isConnector(p) ? attachedSnaps(p) : [];
}

// no "cam" branch here on purpose: a tighten waiting on both endpoints deadlocks against the preload lock
// a bolt-plus-disc fitting is a connector plus an extra, and sequences through the extra's own requires
function defaultTightenRequires(p: PartDef, parts: Parts): readonly ActionId[] {
  const carrier = stagedCarrierOf(p, parts);
  if (carrier) return [placeId(carrier)];
  return [];
}

// Extra sequencing: own host places, then the inherited liaison's remaining endpoints (the securer gate — load-bearing when the primary is a connector, whose own tighten precedes the later endpoint), then the primary's completion.
function extraRequires(p: PartDef, primary: PartDef): readonly ActionId[] {
  const hosts = p.attached ?? [];
  const remaining = (primary.attached ?? []).filter((id) => !hosts.includes(id));
  return [...hosts.map(placeId), ...remaining.map(placeId), tightenId(primary.partId)];
}

// a fastener's translated prereqs, kept for the stage derivation before any action is built 
interface FastenerInstance {
  group: GroupId;
  tool?: ToolId;
  part: PartDef;
  requires: readonly ActionId[];
  requiresAny: readonly ActionId[];
  tightenRequires: readonly ActionId[];
}

//a fastener's stage FOLLOWS the joint it closes
function deriveFastenerStages(
  instances: readonly FastenerInstance[],
  placementStage: ReadonlyMap<PartId, number>,
): Map<PartId, number> {
  const byPlacementAction = new Map<ActionId, number>();
  for (const [partId, stage] of placementStage) {
    byPlacementAction.set(placeId(partId), stage);
    byPlacementAction.set(stageId(partId), stage);
  }
  const byFastenerAction = new Map<ActionId, PartId>();
  for (const i of instances) {
    for (const id of [
      insertId(i.part.partId),
      tightenId(i.part.partId),
      placeFastenerId(i.part.partId),
    ]) {
      byFastenerAction.set(id, i.part.partId);
    }
  }
  const byPart = new Map(instances.map((i) => [i.part.partId, i]));

  const out = new Map<PartId, number>();
  const resolving = new Set<PartId>();
  const stageOfFastener = (partId: PartId): number => {
    const cached = out.get(partId);
    if (cached !== undefined) return cached;
    // a prereq cycle is an authoring bug the validator reports — bail rather than blow the stack
    if (resolving.has(partId)) return 1;
    resolving.add(partId);
    const inst = byPart.get(partId);
    const stageOfPrereq = (id: ActionId): number => {
      const placement = byPlacementAction.get(id);
      if (placement !== undefined) return placement;
      const fastener = byFastenerAction.get(id);
      return fastener ? stageOfFastener(fastener) : 1;
    };
    const and = [
      ...(inst?.requires ?? []),
      ...(inst?.tightenRequires ?? []),
    ].map(stageOfPrereq);
    const or = inst?.requiresAny.length
      ? [Math.min(...inst.requiresAny.map(stageOfPrereq))]
      : [];
    const value = Math.max(1, ...and, ...or);
    resolving.delete(partId);
    out.set(partId, value);
    return value;
  };
  for (const i of instances) stageOfFastener(i.part.partId);
  return out;
}

// expand each FASTENERS def into insert+tighten pairs for every instance of its groups
export function expandFasteners(
  fasteners: FastenerMap,
  parts: Record<PartId, PartDef>,
  hardware: Partial<Record<GroupId, { tool: ToolId; motion?: DriveMotion }>> = {},
  placementStage: ReadonlyMap<PartId, number> = new Map(),
): DraftAction[] {
  const instances: FastenerInstance[] = (Object.entries(fasteners) as [GroupId, FastenerEntry][]).flatMap(([group, d]) => {
    const primaries = typeof d.home === "object" ? groupParts(parts, d.home.extraOf) : null;
    return groupParts(parts, group).map((part) => ({
      group,
      tool: d.tool,
      part,
      requires: primaries ? extraRequires(part, primaryFor(part, primaries)!) : defaultInsertRequires(part, parts),
      requiresAny: primaries ? [] : defaultInsertRequiresAny(part, parts),
      tightenRequires: primaries ? [] : defaultTightenRequires(part, parts),
    }));
  });
  const stages = deriveFastenerStages(instances, placementStage);

  return instances.flatMap(({ group, tool: defTool, part: p, requires, requiresAny, tightenRequires }) => {
    const tool = defTool ?? hardware[group]?.tool ?? p.tool;
    return pair(p.partId, tool, requires, stages.get(p.partId) ?? 1, {
      insertRequiresAny: requiresAny,
      tightenRequires,
      // hardware.ts overrides motion per group
      motion:
        hardware[group]?.motion ??
        (preloadOf(p)?.completesOn === "insert" ? "strike" : "spin"),
      threePhase: !!p.insertStage,
    });
  });
}

// split a STAGED part's placement in two: `stage_X` takes it out to its rest pose, `place_X` carries it home.
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
    // move the carrier's hardware into the stage→place window: inserts before the placement, tightens afte
    const hw = new Set(hardwareOn(parts, carrier));
    const fitting: DraftAction[] = [];
    const tightens: DraftAction[] = [];
    for (let i = out.length - 1; i >= 0; i--) {
      const d = out[i];
      if (
        d.partId &&
        hw.has(d.partId) &&
        (d.type === "placeFastener" ||
          d.type === "insertFastener" ||
          d.type === "tightenFastener")
      ) {
        (d.type === "tightenFastener" ? tightens : fitting).unshift(d);
        out.splice(i, 1);
      }
    }
    const placeAt = out.findIndex(
      (d) => d.type === "placePart" && d.partId === carrier,
    );
    out.splice(placeAt + 1, 0, ...tightens);
    out.splice(placeAt, 0, ...fitting);
  }
  // serialize IDENTICAL carriers: each take-out requires the previous instance's hardware tightened
  const carriersByGroup = new Map<string, PartId[]>();
  for (const c of carriers) {
    const g = parts[c].group as string;
    const list = carriersByGroup.get(g) ?? [];
    list.push(c);
    carriersByGroup.set(g, list);
  }
  for (const group of carriersByGroup.values()) {
    if (group.length < 2) continue;
    const stageIndex = (c: PartId) =>
      out.findIndex((d) => d.actionId === stageId(c));
    const ordered = [...group].sort((a, b) => stageIndex(a) - stageIndex(b));
    for (let k = 1; k < ordered.length; k++) {
      const prevSettled = hardwareOn(parts, ordered[k - 1]).map(tightenId);
      const idx = stageIndex(ordered[k]);
      out[idx] = {
        ...out[idx],
        requires: [...new Set([...out[idx].requires, ...prevSettled])],
      };
    }
  }
  return out;
}

// pull every cluster's OWN fasteners ahead of the first combine the appendix lands after every authored action, so hardware was asked for with its cluster already combined in and hidden inside it
export function withFastenersBeforeCombines(
  drafts: readonly DraftAction[],
  parts: Parts,
): DraftAction[] {
  const out = [...drafts];
  const firstCombine = out.findIndex((d) => d.type === "combineClusters");
  if (firstCombine < 0) return out;
  const combineIds = new Set(
    out.filter((d) => d.type === "combineClusters").map((d) => d.actionId),
  );
  const ownCluster = (d: DraftAction): ClusterId | null => {
    if (
      d.type !== "placeFastener" &&
      d.type !== "insertFastener" &&
      d.type !== "tightenFastener"
    )
      return null;
    const p = d.partId ? parts[d.partId] : undefined;
    if (!p || p.type !== "fastener") return null;
    const owners = (p.attached ?? []).map((id) => parts[id]?.cluster);
    if (!owners.length || owners.some((c) => !c)) return null;
    if (new Set(owners).size !== 1) return null;
    return d.requires?.some((r) => combineIds.has(r)) ? null : owners[0]!;
  };
  const moved: DraftAction[] = [];
  for (let i = out.length - 1; i > firstCombine; i--) {
    if (!ownCluster(out[i])) continue;
    moved.unshift(out[i]);
    out.splice(i, 1);
  }
  // anchors are computed against the cleaned list, then spliced highest-first
  const cleanedIndex = new Map<ActionId, number>();
  out.forEach((d, i) => cleanedIndex.set(d.actionId, i));
  const firstCombineIdx = out.findIndex((d) => d.type === "combineClusters");
  const anchors = new Map<ActionId, number>();
  for (const d of moved) {
    let at = 0;
    const resolve = (r: ActionId): number | undefined => {
      const i = cleanedIndex.get(r);
      if (i !== undefined) return i + 1;
      return anchors.get(r);
    };
    for (const r of d.requires ?? []) {
      const a = resolve(r);
      if (a !== undefined) at = Math.max(at, a);
    }
    const anyAts = (d.requiresAny ?? [])
      .map(resolve)
      .filter((a): a is number => a !== undefined);
    if (anyAts.length) at = Math.max(at, Math.min(...anyAts));
    anchors.set(
      d.actionId,
      at > 0 ? Math.min(at, firstCombineIdx) : firstCombineIdx,
    );
  }
  const byAnchor = new Map<number, DraftAction[]>();
  for (const d of moved) {
    const at = anchors.get(d.actionId)!;
    (byAnchor.get(at) ?? byAnchor.set(at, []).get(at)!).push(d);
  }
  for (const [at, list] of [...byAnchor.entries()].sort((a, b) => b[0] - a[0]))
    out.splice(at, 0, ...list);
  return out;
}

// a combine requires the combines of every cluster its own combine seats onto, so the overlay is the one source of combine order
export function withClusterCombines(
  drafts: readonly DraftAction[],
  clusters: Record<ClusterId, ClusterDef> | undefined,
): DraftAction[] {
  if (!clusters) return [...drafts];
  const combineIdFor = new Map<ClusterId, ActionId>();
  for (const d of drafts) {
    if (d.type === "combineClusters" && d.cluster) combineIdFor.set(d.cluster, d.actionId);
  }
  if (combineIdFor.size === 0) return [...drafts];
  return drafts.map((d) => {
    if (d.type !== "combineClusters" || !d.cluster) return d;
    const derived = combinePrereqClusters(clusters, d.cluster)
      .map((c) => combineIdFor.get(c))
      .filter((id): id is ActionId => !!id);
    const merged = [...new Set([...d.requires, ...derived])];
    return merged.length === d.requires.length ? d : { ...d, requires: merged };
  });
}

// stamp the canonical `order` (guide mode) by each draft's final position in the composed list -> might need improvement later
export const withOrder = (
  drafts: readonly DraftAction[],
  parts?: Record<PartId, PartDef>,
): AssemblyAction[] =>
  drafts.map((a, i) => {
    const partTool =
      !a.tool && parts && a.partId ? parts[a.partId]?.tool : undefined;
    return { ...a, ...(partTool ? { tool: partTool } : {}), order: i };
  });

// turn drafts + FASTENERS defs into a final action list
export function composeFurnitureActions(
  authored: readonly DraftAction[],
  fasteners: FastenerMap,
  parts: Parts,
  hardware: Partial<Record<GroupId, { tool: ToolId; motion?: DriveMotion }>> = {},
  clusters?: Record<ClusterId, ClusterDef>,
): AssemblyAction[] {
  // every structural placement's authored stage — where each fastener's stage comes from
  const placementStage = new Map<PartId, number>();
  for (const a of authored) {
    if (a.type === "placePart" && a.partId)
      placementStage.set(a.partId, a.stage);
  }
  return withOrder(
    withClusterCombines(
      withFastenersBeforeCombines(
        withStaging(
          [
            ...authored,
            ...expandFasteners(fasteners, parts, hardware, placementStage),
          ],
          parts,
        ),
        parts,
      ),
      clusters,
    ),
    parts,
  );
}

// the tighten ids for a whole group, so an authored step can say "after EVERY leg screw is driven" declaratively, without filtering the expanded action list
export function tightenActionIds(
  parts: Record<PartId, PartDef>,
  group: GroupId,
): ActionId[] {
  return groupParts(parts, group).map((p) => tightenId(p.partId));
}
