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
  /** Opt-in 3-phase lifecycle (part.insertStage set): split the drag-to-loose  insert into placeFastener (drag → stage, fully out) + insertFastener (PRESS →  loose). Absent ⇒ classic 2-phase. */
  threePhase?: boolean;
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
    // 3-phase: the drag from the tray is a placeFastener (lands at the STAGE pose, fully out); a separate insertFastener is the PRESS that drives stage → loose; tighten drives loose → flush. The carrier/OR prereqs gate bringing it out (place); insert only needs the place; downstream refs to insertId (rod slide-in, tighten) still mean "pressed in".
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
      { actionId: insert, type: "insertFastener", stage, partId, requires: [place] },
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

export type FastenerRule = {
  group: GroupId;
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

// The `kind === "cam"` branch here — a connector whose TIGHTEN waited for both endpoints — was DELETED with the enum on 2026-09-01, and it was not merely unused: combined with the preload lock it was unreachable. stability holds place(missing) until a completesOn-tighten connector is TIGHTENED, while this made that tighten wait for place(missing) — a deadlock the corpus never hit only because no fastener ever lowered to "cam". The fitting it was modelling is a bolt plus a separate disc: a connector plus an extra, which sequences through the extra's own rule.
function defaultTightenRequires(p: PartDef, parts: Parts): readonly ActionId[] {
  const carrier = stagedCarrierOf(p, parts);
  if (carrier) return [placeId(carrier)];
  return [];
}

/** Each fastener instance's resolved prereqs, kept for the stage derivation below before any action is built. */
interface FastenerInstance {
  rule: FastenerRule;
  part: PartDef;
  requires: readonly ActionId[];
  requiresAny: readonly ActionId[];
  tightenRequires: readonly ActionId[];
}

/**
 * A fastener's stage FOLLOWS the joint it closes: the max stage over the placements its own prereqs name, and recursively over any fastener it waits on (EKET's back pins wait on the cams). The OR side takes the MIN, because a preload connector goes in as soon as its first host is down and belongs in that host's chunk, not its partner's.
 *
 * Authored per-group stages did the same job by hand and could drift from the parts: BEKVAM's third step screw sat a stage above the two stage-1 parts it joins purely so it stayed with its group, and EKET's rear cams+pins sat a stage above the back panel they bite into. Both now land with their joints. Legality is untouched either way — `requires` already held them behind their hosts; stage is the tray's chunking, and the chunk a fastener belongs in is the one where its joint closes.
 */
function deriveFastenerStages(
  instances: readonly FastenerInstance[],
  placementStage: ReadonlyMap<PartId, number>,
): Map<PartId, number> {
  // Both ids for a structural part answer with that part's authored stage: a staged carrier's hardware names the take-out beat, which is the same chunk as the placement it was split from.
  const byPlacementAction = new Map<ActionId, number>();
  for (const [partId, stage] of placementStage) {
    byPlacementAction.set(placeId(partId), stage);
    byPlacementAction.set(stageId(partId), stage);
  }
  const byFastenerAction = new Map<ActionId, PartId>();
  for (const i of instances) {
    for (const id of [insertId(i.part.partId), tightenId(i.part.partId), placeFastenerId(i.part.partId)]) {
      byFastenerAction.set(id, i.part.partId);
    }
  }
  const byPart = new Map(instances.map((i) => [i.part.partId, i]));

  const out = new Map<PartId, number>();
  const resolving = new Set<PartId>();
  const stageOfFastener = (partId: PartId): number => {
    const cached = out.get(partId);
    if (cached !== undefined) return cached;
    // A prereq cycle is an authoring bug the validator reports; bail to stage 1 rather than blowing the stack here.
    if (resolving.has(partId)) return 1;
    resolving.add(partId);
    const inst = byPart.get(partId);
    const stageOfPrereq = (id: ActionId): number => {
      const placement = byPlacementAction.get(id);
      if (placement !== undefined) return placement;
      const fastener = byFastenerAction.get(id);
      return fastener ? stageOfFastener(fastener) : 1;
    };
    const and = [...(inst?.requires ?? []), ...(inst?.tightenRequires ?? [])].map(stageOfPrereq);
    const or = inst?.requiresAny.length ? [Math.min(...inst.requiresAny.map(stageOfPrereq))] : [];
    const value = Math.max(1, ...and, ...or);
    resolving.delete(partId);
    out.set(partId, value);
    return value;
  };
  for (const i of instances) stageOfFastener(i.part.partId);
  return out;
}

/** Expand each authored rule into insert+tighten pairs for every fastener in  the group. `hardware` is the global catalogue (data/hardware.ts), passed in  by the data layer so core stays free of data imports. Tool resolution:  rule.tool (rare override) → hardware[group].tool → part.tool → none. `placementStage` carries the authored stage of every structural placement, which is where each fastener's own stage comes from — see deriveFastenerStages. */
export function expandFastenerRules(
  rules: readonly FastenerRule[],
  parts: Record<PartId, PartDef>,
  hardware: Partial<Record<GroupId, { tool: ToolId; motion?: DriveMotion }>> = {},
  placementStage: ReadonlyMap<PartId, number> = new Map(),
): DraftAction[] {
  const instances: FastenerInstance[] = rules.flatMap((r) =>
    groupParts(parts, r.group).map((part) => ({
      rule: r,
      part,
      requires: r.requires?.(part) ?? defaultInsertRequires(part, parts),
      requiresAny: r.insertRequiresAny?.(part) ?? defaultInsertRequiresAny(part, parts),
      tightenRequires: r.tightenRequires?.(part) ?? defaultTightenRequires(part, parts),
    })),
  );
  const stages = deriveFastenerStages(instances, placementStage);

  return instances.flatMap(({ rule: r, part: p, requires, requiresAny, tightenRequires }) => {
    const tool = r.tool ?? hardware[r.group]?.tool ?? p.tool;
    return pair(p.partId, tool, requires, stages.get(p.partId) ?? 1, {
      insertRequiresAny: requiresAny,
      tightenRequires,
      // FEEL, not sequencing, and the only default the role model needs to supply: a fastener that is HOME once pressed in is tapped, everything else is turned. That is what `kind === "pin" ? "strike" : "spin"` picked out, since pin was the sole completesOn-insert kind. The retired third branch (cam → "turn", with a tool at insert) is unreachable as a default now; hardware.ts already overrides motion per group, which is where EKET's cams get their "turn" from today.
      motion: hardware[r.group]?.motion ?? (preloadOf(p)?.completesOn === "insert" ? "strike" : "spin"),
      threePhase: !!p.insertStage,
    });
  });
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
    // Relocate the carrier's hardware actions out of the fastener appendix into the stage→place window: drops/inserts BEFORE the placement (fit the hardware while the part rests staged), tightens right AFTER it (their requires demand the placement anyway). Legality never depended on array position — this makes ORDER tell the same story the requires graph already enforces, so strict mode and step hints walk take-out → fit → carry-in per carrier instead of staging every carrier back to back.
    const hw = new Set(hardwareOn(parts, carrier));
    const fitting: DraftAction[] = [];
    const tightens: DraftAction[] = [];
    for (let i = out.length - 1; i >= 0; i--) {
      const d = out[i];
      if (d.partId && hw.has(d.partId) && (d.type === "placeFastener" || d.type === "insertFastener" || d.type === "tightenFastener")) {
        (d.type === "tightenFastener" ? tightens : fitting).unshift(d);
        out.splice(i, 1);
      }
    }
    const placeAt = out.findIndex((d) => d.type === "placePart" && d.partId === carrier);
    out.splice(placeAt + 1, 0, ...tightens);
    out.splice(placeAt, 0, ...fitting);
  }
  // Serialize IDENTICAL staged carriers (same group): each later instance's take-out requires the previous instance's hardware fully tightened (which transitively requires its placement). Derived from the parts alone — never authored, never asked in a wizard — because instances of one group are interchangeable, so forcing completion order costs the player nothing, while allowing it would leave a half-built sub-assembly dangling in the staging area once the next one comes out. Ordering above made strict mode TELL this story; this makes every mode ENFORCE it.
  const carriersByGroup = new Map<string, PartId[]>();
  for (const c of carriers) {
    const g = parts[c].group as string;
    const list = carriersByGroup.get(g) ?? [];
    list.push(c);
    carriersByGroup.set(g, list);
  }
  for (const group of carriersByGroup.values()) {
    if (group.length < 2) continue;
    const stageIndex = (c: PartId) => out.findIndex((d) => d.actionId === stageId(c));
    const ordered = [...group].sort((a, b) => stageIndex(a) - stageIndex(b));
    for (let k = 1; k < ordered.length; k++) {
      const prevSettled = hardwareOn(parts, ordered[k - 1]).map(tightenId);
      const idx = stageIndex(ordered[k]);
      out[idx] = { ...out[idx], requires: [...new Set([...out[idx].requires, ...prevSettled])] };
    }
  }
  return out;
}

/**
 * Pull every cluster's OWN fasteners ahead of the first combine. The fastener appendix lands after every authored action, combines included, so a sub-assembly's hardware was asked for AFTER the sub-assembly had been joined into the furniture — and once anything is combined, the next focused cluster renders at its baked pose inside it. EKET asked for the drawer-back screws with the drawer already inside the finished cabinet (box-blocked from 72/72 sweep cameras, topPanel alone hiding 46; measured 6mm and passing with the drawer still loose); DALFRED asked for the pole's end cap after the pole was threaded down over the support pin (50mm behind it). The authored stage said otherwise in both cases and never got a say against array position.
 *
 * A fastener is a cluster's own when every part it attaches to sits in ONE cluster; one that bridges clusters realizes the combine joint and stays where it is, as does anything that explicitly requires a combine. Only actions sequenced after the first combine move, so hardware withStaging already placed inside a take-out → fit → carry-in window keeps that story.
 *
 * Each moved action lands at its EARLIEST legal point — right after the last action it requires — not after its cluster's last pre-combine placement. The cluster-block anchor repeated the array-position failure this pass exists to fix, one level down: EKET's runner screws are authored stage 1 ("rails onto flat sides first", manual steps 2-3) but were asked for with all 29 cabinet parts standing, and the rear pair (nearest the back panel) measured ZERO clear viewpoints in that state, against 180-379 of 576 at the earliest legal moment — no camera angle could ever snap them. Requires-anchoring is the manual's own story: screw each joint as it closes. A require that is itself a moved action resolves to that action's anchor; original relative order breaks the tie, so insert still precedes tighten and an extra still follows its primary.
 */
export function withFastenersBeforeCombines(
  drafts: readonly DraftAction[],
  parts: Parts,
): DraftAction[] {
  const out = [...drafts];
  const firstCombine = out.findIndex((d) => d.type === "combineClusters");
  if (firstCombine < 0) return out;
  const combineIds = new Set(out.filter((d) => d.type === "combineClusters").map((d) => d.actionId));
  const ownCluster = (d: DraftAction): ClusterId | null => {
    if (d.type !== "placeFastener" && d.type !== "insertFastener" && d.type !== "tightenFastener") return null;
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
  // Anchor each moved action after the LAST action it requires. All anchors are computed against the cleaned list, then spliced highest-first, so every index stays valid; a require that is itself a moved action contributes ITS anchor (already computed — an insert precedes its tighten in appendix order, a primary's tighten precedes its extra), and original order within a shared anchor keeps those chains sequenced. requiresAny is an OR, so its earliest-legal contribution is the FIRST resolved alternative. An action whose requires resolve to nothing keeps the old fallback, just before the first combine.
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
    const anyAts = (d.requiresAny ?? []).map(resolve).filter((a): a is number => a !== undefined);
    if (anyAts.length) at = Math.max(at, Math.min(...anyAts));
    anchors.set(d.actionId, at > 0 ? Math.min(at, firstCombineIdx) : firstCombineIdx);
  }
  const byAnchor = new Map<number, DraftAction[]>();
  for (const d of moved) {
    const at = anchors.get(d.actionId)!;
    (byAnchor.get(at) ?? byAnchor.set(at, []).get(at)!).push(d);
  }
  for (const [at, list] of [...byAnchor.entries()].sort((a, b) => b[0] - a[0])) out.splice(at, 0, ...list);
  return out;
}

/** Derive each combineClusters action's ordering from the cluster overlay: a cluster's combine requires the combines of every cluster it slideJoins. The overlay is then the single source of truth for combine order, and authors stop hand-writing requires that must be kept in sync with slideJoins. Furniture with no overlay passes straight through. */
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

/** The ONE way to turn a furniture's authored drafts + fastener rules into its final action list: expand the rules, split staged parts into take-out + fit-in, pull each cluster's own fasteners ahead of the combines, then stamp `order`. Every consumer (each furniture's meta.ts, the validator and engine-test harnesses, the availability tests) must go through here — the passes are order-sensitive, and hand-rolled copies of this chain have twice silently dropped a later pass. */
export function composeFurnitureActions(
  authored: readonly DraftAction[],
  rules: readonly FastenerRule[],
  parts: Parts,
  hardware: Partial<Record<GroupId, { tool: ToolId; motion?: DriveMotion }>> = {},
  clusters?: Record<ClusterId, ClusterDef>,
): AssemblyAction[] {
  // Every structural placement's authored stage, which is what each fastener's own stage is derived from.
  const placementStage = new Map<PartId, number>();
  for (const a of authored) {
    if (a.type === "placePart" && a.partId) placementStage.set(a.partId, a.stage);
  }
  return withOrder(
    withClusterCombines(
      withFastenersBeforeCombines(
        withStaging(
          [...authored, ...expandFastenerRules(rules, parts, hardware, placementStage)],
          parts,
        ),
        parts,
      ),
      clusters,
    ),
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
