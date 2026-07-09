import { availableActions } from "@/src/game/core/evaluation/availability";
import { actionCluster } from "@/src/game/core/evaluation/clusters";
import {
  buildLiaisons,
  crossClusterThreads,
  fastenerKindOf,
  isConnector,
} from "@/src/game/core/model/liaisons";
import { geometryWarnings } from "@/src/game/core/model/geometryCheck";
import { sequenceIssues } from "@/src/game/core/composition/sequence";
import { actionIdFor, isPartTiedType } from "@/src/game/core/ids";
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
      for (const a of avail) done.add(a.actionId);
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
