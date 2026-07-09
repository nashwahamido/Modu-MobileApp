// Startup guardrail: checks a Furniture's action graph for integrity before it
// ships to players. Catches the mistakes that are easy to make while authoring
// assembly data — dangling requires, unknown gates, missing parts, deadlocks.
import { availableActions } from "@/src/adhd/core/assembly/availability";
import { Furniture } from "@/src/adhd/core/type";

export interface ValidationIssue {
  level: "error" | "warn";
  message: string;
}

export function validateFurniture(f: Furniture): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const err = (m: string) => issues.push({ level: "error", message: m });
  const warn = (m: string) => issues.push({ level: "warn", message: m });

  // unique action ids
  const ids = new Set<string>();
  for (const a of f.actions) {
    if (ids.has(a.actionId)) err(`duplicate actionId "${a.actionId}"`);
    ids.add(a.actionId);
  }

  // every reference resolves
  for (const a of f.actions) {
    for (const r of a.requires) {
      if (!ids.has(r)) err(`action "${a.actionId}" requires missing action "${r}"`);
    }
    if (a.gate && !f.gates[a.gate]) {
      err(`action "${a.actionId}" uses unknown gate "${a.gate}"`);
    }
    if (a.partId && !f.parts[a.partId]) {
      err(`action "${a.actionId}" references missing part "${a.partId}"`);
    }
  }

  // solvability — only meaningful once references resolve (availableActions
  // throws on an unknown gate, so don't run it through a broken graph).
  if (!issues.some((i) => i.level === "error")) {
    const done = new Set<string>();
    for (let round = 0; round <= f.actions.length; round++) {
      const avail = availableActions(f.actions, f.gates, done);
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
    }
  }

  // cluster ↔ combine sanity: a combine beat only makes sense with ≥2 clusters
  const clusters = new Set(Object.values(f.parts).map((p) => p.cluster));
  const hasCombine = f.actions.some((a) => a.type === "combine");
  if (clusters.size <= 1 && hasCombine) {
    warn("single cluster but a combine action exists");
  }
  if (clusters.size >= 2 && !hasCombine) {
    warn(`${clusters.size} clusters but no combine action`);
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
