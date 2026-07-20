import { availableActions, availableInMode } from "@/src/game/core/evaluation/availability";
import { actionCluster, focusableClusterIds, requiresClusterFocus } from "@/src/game/core/evaluation/clusters";
import {
  buildLiaisons,
  crossClusterThreads,
  fastenerKindOf,
  isConnector,
} from "@/src/game/core/model/liaisons";
import { geometryWarnings } from "@/src/game/core/model/geometryCheck";
import { sequenceIssues } from "@/src/game/core/composition/sequence";
import { actionIdFor, isPartTiedType, placeId, stageId } from "@/src/game/core/ids";
import { memberPlaceIdsForLead } from "@/src/game/core/model/components";
import { hardwareOn, isStaged } from "@/src/game/core/model/staging";
import { ActionId, ClusterId, Furniture, PartId } from "@/src/game/core/type";

export interface ValidationIssue {
  level: "error" | "warn";
  message: string;
}

export function validateFurniture(f: Furniture): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const err = (m: string) => issues.push({ level: "error", message: m });
  const warn = (m: string) => issues.push({ level: "warn", message: m });

  const ids = new Set<string>();
  for (const a of f.actions) {
    if (ids.has(a.actionId)) err(`duplicate actionId "${a.actionId}"`);
    ids.add(a.actionId);
  }

  for (const a of f.actions) {
    for (const r of a.requires) {
      if (!ids.has(r)) err(`action "${a.actionId}" requires missing action "${r}"`);
    }
    for (const r of a.requiresAny ?? []) {
      if (!ids.has(r)) err(`action "${a.actionId}" requiresAny missing action "${r}"`);
    }
    if (a.gate && !f.gates?.[a.gate]) {
      err(`action "${a.actionId}" uses unknown gate "${a.gate}"`);
    }
    if (a.partId && !f.parts[a.partId]) {
      err(`action "${a.actionId}" references missing part "${a.partId}"`);
    }
  }

  for (const a of f.actions) {
    if (!a.partId || !isPartTiedType(a.type)) continue;
    const want = actionIdFor(a.type, a.partId);
    if (a.actionId !== want) {
      err(
        `action "${a.actionId}" (${a.type}, part "${a.partId}") breaks the ` +
          `id convention — expected "${want}" (derive it, don't hand-type it)`,
      );
    }
  }

  if (f.components) { for (const [compId, bodies] of Object.entries(f.components.bodies)) { for (const body of bodies) { const need = placeId(body); if (!f.actions.some((a) => a.actionId === need)) err(`component "${compId}" body "${body}" has no placePart action "${need}"`); } } }

  {
    const KIND = { directJoins: "press", slideJoins: "slide", screwJoins: "screw" } as const;
    const pairKinds = new Map<string, { field: keyof typeof KIND; from: string }>();
    for (const p of Object.values(f.parts)) {
      if (p.type !== "structural") continue;
      const seen = new Map<string, string>();
      for (const field of ["directJoins", "slideJoins", "screwJoins"] as const) {
        for (const t of p[field] ?? []) {
          const prev = seen.get(t);
          if (prev && prev !== field) {
            err(
              `part "${p.partId}" lists "${t}" in both ${prev} and ${field} — ` +
                `one joint has one kind; pick the list that matches the physical joint`,
            );
          }
          seen.set(t, field);
          const key = [p.partId, t].sort().join("__");
          const other = pairKinds.get(key);
          if (other && other.from !== p.partId) {
            if (KIND[other.field] !== KIND[field]) {
              err(
                `joint "${key}" is authored twice with different kinds — ` +
                  `${KIND[other.field]} (from "${other.from}") vs ${KIND[field]} (from "${p.partId}")`,
              );
            } else if (field !== "directJoins") {
              err(
                `joint "${key}": both endpoints claim to be the ` +
                  `${field === "slideJoins" ? "slider" : "screw-in part"} — ` +
                  `author the ${KIND[field]} join from ONE side (the moving part)`,
              );
            }
          } else {
            pairKinds.set(key, { field, from: p.partId });
          }
        }
      }
    }
  }

  {
    const connectorKind = new Map<string, { kind: string; from: string }>();
    for (const p of Object.values(f.parts)) {
      if (!isConnector(p)) continue;
      const key = [...p.attached!].sort().join("__");
      const kind = fastenerKindOf(p);
      const prev = connectorKind.get(key);
      if (prev && prev.kind !== kind) {
        err(
          `joint "${key}" is defined by two connectors that disagree — ` +
            `${prev.kind} ("${prev.from}") vs ${kind} ("${p.partId}")`,
        );
      } else if (!prev) {
        connectorKind.set(key, { kind, from: p.partId });
      }
    }
  }

  for (const p of Object.values(f.parts)) {
    if (p.type !== "fastener" || !p.attached) continue;
    for (const t of p.attached) {
      const target = f.parts[t];
      if (!target) {
        err(`fastener "${p.partId}" is attached to missing part "${t}"`);
      } else if (target.type !== "structural") {
        err(
          `fastener "${p.partId}" is attached to "${t}" (type "${target.type}") — ` +
            `fasteners join STRUCTURAL parts; this joint drops silently from Γ`,
        );
      }
    }
  }

  {
    const installed = new Set<PartId>();
    for (const a of f.actions) {
      if (!a.partId) continue;
      if (
        a.type === "insertFastener" ||
        a.type === "tightenFastener" ||
        a.type === "placePart"
      ) {
        installed.add(a.partId);
      }
    }
    for (const p of Object.values(f.parts)) {
      if (p.type !== "fastener" || installed.has(p.partId)) continue;
      err(
        `fastener "${p.partId}" (group "${p.group}") has no install action — ` +
          `nothing inserts/tightens/places it; add its group to FASTENER_RULES`,
      );
    }
  }

  {
    const threadedPairs = new Set<string>();
    for (const p of Object.values(f.parts)) {
      if (isConnector(p) && fastenerKindOf(p) === "threaded") {
        threadedPairs.add([...p.attached!].sort().join("__"));
      }
    }
    for (const p of Object.values(f.parts)) {
      if (p.type !== "structural") continue;
      for (const t of p.screwJoins ?? []) {
        if (threadedPairs.has([p.partId, t].sort().join("__"))) {
          err(
            `joint "${[p.partId, t].sort().join("__")}" is BOTH a structural ` +
              `screw (screwJoins from "${p.partId}") and a threaded connector — ` +
              `double-gated with two screw paths; keep one`,
          );
        }
      }
    }
  }

  // staged sub-assemblies: a mis-authored stageOffset must fail here rather than deadlock or read as a pointless extra tap on device
  for (const p of Object.values(f.parts)) {
    if (!isStaged(p)) continue;
    if (p.type !== "structural") {
      err(`staged part "${p.partId}" is a ${p.type} — stageOffset marks the CARRIER of a sub-assembly, not the hardware fitted into it`);
    }
    if (p.seed) {
      err(`staged part "${p.partId}" is a cluster seed — staging is an installation mechanism for a finished sub-assembly, not a way to start a cluster`);
    }
    if (p.stageOffset!.every((v) => v === 0)) {
      err(`staged part "${p.partId}" has a zero stageOffset — it would sub-assemble on top of its own seat, invisibly`);
    }
    if (hardwareOn(f.parts, p.partId).length === 0) {
      err(`staged part "${p.partId}" has no fastener attached to it — staging costs the player an extra gesture and buys nothing; drop stageOffset`);
    }
    if (!f.actions.some((a) => a.actionId === stageId(p.partId))) {
      err(`staged part "${p.partId}" has no "${stageId(p.partId)}" action — run the drafts through withStaging() before withOrder()`);
    }
  }
  for (const p of Object.values(f.parts)) {
    const staged = (p.attached ?? []).filter((t) => isStaged(f.parts[t]));
    if (staged.length > 1) {
      err(`fastener "${p.partId}" bridges two staged parts (${staged.join(", ")}) — it cannot be fitted at both sub-assemblies at once; stage one side only`);
    }
  }

  const byId = new Map(f.actions.map((a) => [a.actionId, a]));
  for (const a of f.actions) {
    for (const r of a.requires) {
      const req = byId.get(r);
      if (!req) continue;
      const c = actionCluster(f, a);
      if (c && c === actionCluster(f, req) && req.stage > a.stage) {
        err(
          `action "${a.actionId}" (stage ${a.stage}) requires later-stage ` +
            `"${r}" (stage ${req.stage}) in the same cluster — deadlocks plan mode`,
        );
      }
    }
  }

  if (!issues.some((i) => i.level === "error")) {
    const done = new Set<ActionId>();
    for (let round = 0; round <= f.actions.length; round++) {
      const avail = availableActions(f, done);
      if (avail.length === 0) break;
      // the raw sweep drives availableActions directly rather than the store's completeAction, so it never gets the store's cascade — a component lead's non-lead siblings are filtered out of availability by isNonLeadBody and would never be marked done here, making a solvable furniture falsely report "not solvable"; mirror the store's cascade by completing the same member ids alongside the lead.
      for (const a of avail) { done.add(a.actionId); for (const m of memberPlaceIdsForLead(f.components, a.actionId)) done.add(m); }
    }
    if (done.size !== f.actions.length) {
      const stuck = f.actions
        .filter((a) => !done.has(a.actionId))
        .map((a) => a.actionId);
      err(
        `not solvable — ${stuck.length} action(s) never become available: ` +
          stuck.slice(0, 8).join(", ") +
          (stuck.length > 8 ? " …" : ""),
      );
    } else {
      // guide mode only offers actions at their cluster's lowest incomplete stage, so a part whose only Γ reachability path (directJoins/slideJoins/fastener liaisons) runs through a HIGHER-stage part deadlocks the player without tripping the requires-based cross-stage check above — replay the build as a guide player (free to pick any cluster focus each step) and error if it stalls before completion.
      const guideDone = new Set<ActionId>();
      const focusChoices = requiresClusterFocus(f) ? focusableClusterIds(f) : [null];
      while (guideDone.size < f.actions.length) {
        const picked = focusChoices.flatMap((focus) => availableInMode(f, guideDone, "guide", focus))[0];
        if (!picked) break;
        guideDone.add(picked.actionId);
        for (const m of memberPlaceIdsForLead(f.components, picked.actionId)) guideDone.add(m);
      }
      if (guideDone.size !== f.actions.length) {
        const stuck = f.actions
          .filter((a) => !guideDone.has(a.actionId))
          .map((a) => a.actionId);
        err(
          `not solvable in GUIDE mode — ${stuck.length} action(s) are never offered: ` +
            stuck.slice(0, 8).join(", ") +
            (stuck.length > 8 ? " …" : "") +
            ` — a stalled action's part is likely only reachable through a later-stage part (Γ-implied cross-stage dependency)`,
        );
      }
      for (const i of sequenceIssues(f)) issues.push(i);
    }
  }

  for (const a of f.actions) {
    if (a.type !== "tightenFastener" || a.tool || !a.partId) continue;
    const group = f.parts[a.partId]?.group ?? "";
    if (/screw|cam/i.test(group)) {
      warn(
        `"${a.actionId}" resolves to NO tool but "${group}" sounds tool-driven — ` +
          `set rule.tool or the part's default tool (STRUCTURE overlay)`,
      );
    }
  }

  // a slide mover with no authored placeDir glides along travelAxis()'s centroid heuristic, which cannot know a groove's axis and produced visibly wrong on-device motion for every EKET slider — the engine's own doc calls placeDir "the only reliable source"
  for (const p of Object.values(f.parts)) {
    if (p.slideJoins?.length && !p.placeDir) {
      warn(`slide mover "${p.partId}" has no placeDir — its glide axis falls back to the centroid heuristic; author placeDir in the STRUCTURE overlay`);
    }
  }

  for (const a of f.actions) {
    if (!a.partId || !a.cluster) continue;
    const pc = f.parts[a.partId]?.cluster;
    if (pc && pc !== a.cluster) {
      err(
        `action "${a.actionId}" authors cluster "${a.cluster}" but its part ` +
          `"${a.partId}" lives in "${pc}" — the part's cluster wins; drop the ` +
          `action's cluster (or fix the part)`,
      );
    }
  }

  if (f.meta) {
    const partCount = Object.keys(f.parts).length;
    const stepCount = f.actions.length;
    const stageCount = new Set(f.actions.map((a) => a.stage)).size;
    if (f.meta.partCount !== partCount) {
      err(`meta.partCount ${f.meta.partCount} ≠ ${partCount} part instances — derive it via metaCounts()`);
    }
    if (f.meta.stepCount !== stepCount) {
      err(`meta.stepCount ${f.meta.stepCount} ≠ ${stepCount} actions — derive it via metaCounts()`);
    }
    if (f.meta.stageCount !== stageCount) {
      err(`meta.stageCount ${f.meta.stageCount} ≠ ${stageCount} distinct stages — derive it via metaCounts()`);
    }
  }

  const clusters = new Set(Object.values(f.parts).map((p) => p.cluster));
  const hasCombine = f.actions.some((a) => a.type === "combineClusters");
  if (clusters.size <= 1 && hasCombine) {
    warn("single cluster but a combine action exists");
  }
  if (clusters.size >= 2 && !hasCombine) {
    warn(`${clusters.size} clusters but no combine action`);
  }

  {
    const liaisons = f.liaisons ?? buildLiaisons(f.parts);
    const combineClusters = new Set<ClusterId>();
    for (const a of f.actions) {
      if (a.type === "combineClusters") {
        const c = actionCluster(f, a);
        if (c) combineClusters.add(c);
      }
    }
    for (const cluster of clusters) {
      const threads = crossClusterThreads(liaisons, f.parts, cluster);
      if (threads.length && !combineClusters.has(cluster)) {
        const sample = threads
          .map((l) => l.id)
          .slice(0, 3)
          .join(", ");
        err(
          `cluster "${cluster}" threads into another cluster (${sample}) but no ` +
            `combineClusters step realizes it — that screw joint is never made; ` +
            `add a combineClusters action for cluster "${cluster}"`,
        );
      }
    }

    for (const m of geometryWarnings(f.parts, liaisons)) warn(m);
  }

  return issues;
}

/** Throws if the furniture has any errors. Call at load time / in the composer. */
export function assertValidFurniture(f: Furniture): void {
  const errors = validateFurniture(f).filter((i) => i.level === "error");
  if (errors.length) {
    throw new Error(
      `Invalid furniture "${f.meta.id}":\n` +
        errors.map((e) => "  - " + e.message).join("\n"),
    );
  }
}
